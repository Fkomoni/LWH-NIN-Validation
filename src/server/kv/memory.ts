import "server-only";
import type { Kv } from "./types";

interface Entry {
  value: unknown;
  expiresAt?: number;
}

/**
 * In-memory KV for dev + Phase 1. Single-process only — do not use in
 * multi-instance deployments. Upstash Redis ships as the Phase 2 impl
 * behind the same `Kv` interface.
 */
class MemoryKv implements Kv {
  private store = new Map<string, Entry>();
  private windows = new Map<string, number[]>();

  private fresh(key: string): Entry | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt && e.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.fresh(key)?.value as T | undefined) ?? null;
  }

  async set(key: string, value: unknown, opts?: { ttlMs?: number }): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: opts?.ttlMs ? Date.now() + opts.ttlMs : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.windows.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.fresh(key) !== undefined;
  }

  async incr(key: string, opts?: { ttlMs?: number }): Promise<number> {
    const e = this.fresh(key);
    const next = typeof e?.value === "number" ? e.value + 1 : 1;
    this.store.set(key, {
      value: next,
      expiresAt: e?.expiresAt ?? (opts?.ttlMs ? Date.now() + opts.ttlMs : undefined),
    });
    return next;
  }

  async pushWindow(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = this.windows.get(key) ?? [];
    const next = arr.filter((t) => t > cutoff);
    next.push(now);
    this.windows.set(key, next);
    return next.length;
  }
}

let instance: Kv | undefined;
export function getMemoryKv(): Kv {
  if (!instance) instance = new MemoryKv();
  return instance;
}
