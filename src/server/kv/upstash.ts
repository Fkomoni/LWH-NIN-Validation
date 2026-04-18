import "server-only";
import type { Kv } from "./types";
import { log } from "@/lib/logger";

/**
 * Upstash Redis REST adapter.
 *
 * Uses the pipeline endpoint so each Kv method resolves in a single
 * round-trip. No extra dependency — relies on global fetch.
 *
 * Values are JSON-serialised on set and JSON.parsed on get, to match
 * the MemoryKv contract. Sliding windows are modelled with a Redis
 * sorted-set (member = `${now}:${rand}` to avoid score collisions);
 * PEXPIRE trims the key a fraction after the window ends so Redis
 * eventually evicts dormant entries.
 *
 * Wire point: `getKv()` in src/server/kv/index.ts returns this when
 * both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 */

type RedisCommand = [string, ...(string | number)[]];

interface PipelineOk<T> {
  result: T;
}

interface PipelineErr {
  error: string;
}

type PipelineItem<T> = PipelineOk<T> | PipelineErr;

class UpstashKv implements Kv {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async pipeline<T>(commands: RedisCommand[]): Promise<PipelineItem<T>[]> {
    const res = await fetch(`${this.baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`upstash.pipeline.http-${res.status}: ${text.slice(0, 120)}`);
    }
    return (await res.json()) as PipelineItem<T>[];
  }

  private unwrap<T>(items: PipelineItem<T>[]): T[] {
    return items.map((it, i) => {
      if ("error" in it) {
        // Log the raw Upstash message once (truncated) so an operator
        // can see context, but throw a sanitised Error so downstream
        // stacks / log fan-out don't carry the raw server-side text
        // (which in principle could contain command arguments).
        log.error(
          { idx: i, err: String(it.error).slice(0, 120) },
          "upstash.pipeline.err",
        );
        throw new Error("upstash.pipeline.err");
      }
      return it.result;
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const [raw] = this.unwrap<string | null>(await this.pipeline<string | null>([["GET", key]]));
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, opts?: { ttlMs?: number }): Promise<void> {
    const payload = JSON.stringify(value);
    const cmd: RedisCommand = opts?.ttlMs
      ? ["SET", key, payload, "PX", opts.ttlMs]
      : ["SET", key, payload];
    this.unwrap<string>(await this.pipeline<string>([cmd]));
  }

  async del(key: string): Promise<void> {
    this.unwrap<number>(await this.pipeline<number>([["DEL", key]]));
  }

  async exists(key: string): Promise<boolean> {
    const unwrapped = this.unwrap<number>(await this.pipeline<number>([["EXISTS", key]]));
    return (unwrapped[0] ?? 0) > 0;
  }

  async incr(key: string, opts?: { ttlMs?: number }): Promise<number> {
    // INCR + conditional PEXPIRE in one round-trip. PEXPIRE only sets
    // a TTL if the key didn't previously have one, matching the
    // MemoryKv behaviour of "first-write wins for TTL".
    const commands: RedisCommand[] = [["INCR", key]];
    if (opts?.ttlMs) commands.push(["PEXPIRE", key, opts.ttlMs, "NX"]);
    const results = this.unwrap<number>(await this.pipeline<number>(commands));
    return results[0]!;
  }

  async pushWindow(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const cutoff = now - windowMs;
    // Unique member = `<now>:<rand>` so multiple events within the
    // same millisecond don't collide on the sorted-set score.
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
    const results = this.unwrap<number>(
      await this.pipeline<number>([
        ["ZREMRANGEBYSCORE", key, "-inf", cutoff],
        ["ZADD", key, now, member],
        ["ZCARD", key],
        // Evict the whole set shortly after the window would expire
        // anyway, to keep Redis tidy. 2x windowMs is generous.
        ["PEXPIRE", key, windowMs * 2],
      ]),
    );
    // [removed, added, count, pexpire]
    return results[2]!;
  }
}

let instance: Kv | null = null;

/**
 * Returns an UpstashKv if both env vars are present, otherwise null.
 * Caller (getKv()) falls back to MemoryKv when this returns null.
 */
export function getUpstashKv(): Kv | null {
  if (instance) return instance;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    // Validate URL shape; throw early rather than at first fetch.
    const u = new URL(url);
    if (u.protocol !== "https:") {
      log.warn({ protocol: u.protocol }, "kv.upstash.not-https");
    }
  } catch (err) {
    log.error({ err: String(err) }, "kv.upstash.bad-url");
    return null;
  }
  instance = new UpstashKv(url.replace(/\/+$/, ""), token);
  log.info({}, "kv.upstash.ready");
  return instance;
}
