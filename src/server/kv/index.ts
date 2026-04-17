import "server-only";
import type { Kv } from "./types";
import { getMemoryKv } from "./memory";

/**
 * KV resolver. Phase 2: when UPSTASH_REDIS_REST_URL is present, return
 * an Upstash-backed implementation. For now the in-memory KV is used
 * everywhere.
 */
export function getKv(): Kv {
  // Phase 2 placeholder:
  // if (process.env.UPSTASH_REDIS_REST_URL) return getUpstashKv();
  return getMemoryKv();
}

export type { Kv } from "./types";
