import "server-only";

/**
 * Minimal key-value abstraction. The interface is intentionally small so
 * we can swap Upstash Redis for a local Map during dev / Phase 1 without
 * anyone noticing.
 *
 * Sliding-window counters and atomic "consume" operations are modelled as
 * explicit methods so we can use Redis Lua scripts in Phase 2 for
 * consistency; the in-memory impl approximates with single-threaded updates.
 */
export interface Kv {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ttlMs?: number }): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  /**
   * Atomically increment a counter and return the new value. If the key
   * doesn't exist, it's created with ttl `ttlMs`.
   */
  incr(key: string, opts?: { ttlMs?: number }): Promise<number>;

  /**
   * Append the current timestamp to a rolling window list and return how
   * many events fall within the last `windowMs`.
   */
  pushWindow(key: string, windowMs: number): Promise<number>;
}
