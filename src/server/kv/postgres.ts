import "server-only";
import type { Kv } from "./types";
import { db } from "@/server/db";
import { log } from "@/lib/logger";

/**
 * Postgres-backed KV. Durable fallback for the Kv interface when
 * Upstash is not provisioned but DATABASE_URL is.
 *
 * Keys expire lazily: every get() / exists() compares expiresAt to
 * Date.now() and treats an expired row as absent. A periodic sweep
 * (Phase 3 cron) can DELETE expired rows in bulk — until then the
 * unique (key) constraint keeps rewrites cheap.
 *
 * Sliding windows use a dedicated KvWindowSample table: pushWindow
 * inserts a (key, now, nonce) row, deletes rows older than cutoff,
 * then counts remaining rows for the key. Idempotency is cheap at
 * the rate-limit thresholds in appConfig (tens of rows per key max).
 */

function isExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && expiresAt.getTime() < Date.now();
}

class PostgresKv implements Kv {
  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await db.kvEntry.findUnique({ where: { key } });
    if (!row) return null;
    if (isExpired(row.expiresAt)) {
      // Best-effort cleanup; ignore failure (another request may have
      // beaten us to the delete).
      await db.kvEntry.delete({ where: { key } }).catch(() => undefined);
      return null;
    }
    return row.value as T;
  }

  async set(key: string, value: unknown, opts?: { ttlMs?: number }): Promise<void> {
    const expiresAt = opts?.ttlMs ? new Date(Date.now() + opts.ttlMs) : null;
    await db.kvEntry.upsert({
      where: { key },
      update: {
        value: value as object,
        expiresAt,
      },
      create: {
        key,
        value: value as object,
        expiresAt,
      },
    });
  }

  async del(key: string): Promise<void> {
    await db.kvEntry.deleteMany({ where: { key } });
  }

  async exists(key: string): Promise<boolean> {
    const row = await db.kvEntry.findUnique({
      where: { key },
      select: { expiresAt: true },
    });
    if (!row) return false;
    if (isExpired(row.expiresAt)) {
      await db.kvEntry.delete({ where: { key } }).catch(() => undefined);
      return false;
    }
    return true;
  }

  async incr(key: string, opts?: { ttlMs?: number }): Promise<number> {
    // Transactional read-modify-write so concurrent incr() calls on
    // the same key return monotonically-increasing values.
    return db.$transaction(async (tx) => {
      const existing = await tx.kvEntry.findUnique({ where: { key } });
      const nowExpired = existing && isExpired(existing.expiresAt);
      const current = existing && !nowExpired && typeof existing.value === "number"
        ? (existing.value as number)
        : 0;
      const next = current + 1;
      const expiresAt =
        existing && !nowExpired
          ? existing.expiresAt
          : opts?.ttlMs
          ? new Date(Date.now() + opts.ttlMs)
          : null;
      await tx.kvEntry.upsert({
        where: { key },
        update: { value: next, expiresAt },
        create: { key, value: next, expiresAt },
      });
      return next;
    });
  }

  async pushWindow(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const cutoff = new Date(now - windowMs);
    const nonce = `${now}:${Math.random().toString(36).slice(2, 10)}`;
    return db.$transaction(async (tx) => {
      // Purge old samples.
      await tx.kvWindowSample.deleteMany({
        where: { key, sampledAt: { lt: cutoff } },
      });
      // Insert the current sample.
      await tx.kvWindowSample.create({
        data: { key, sampledAt: new Date(now), nonce },
      });
      return tx.kvWindowSample.count({ where: { key } });
    });
  }
}

let instance: Kv | null = null;

/**
 * Returns a PostgresKv when DATABASE_URL is set and the Kv tables
 * are available. Caller (getKv) falls back to MemoryKv when this
 * returns null.
 *
 * We do NOT verify table existence here — the build step runs
 * `prisma migrate deploy` before the app boots, so the tables are
 * present by the time getKv() is first called. If they are not,
 * the first PostgresKv operation surfaces a clear Prisma error.
 */
export function getPostgresKv(): Kv | null {
  if (instance) return instance;
  if (!process.env.DATABASE_URL) return null;
  instance = new PostgresKv();
  log.info({}, "kv.postgres.ready");
  return instance;
}
