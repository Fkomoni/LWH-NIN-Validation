import "server-only";
import type { Kv } from "./types";
import { getMemoryKv } from "./memory";
import { getUpstashKv } from "./upstash";

/**
 * KV resolver.
 *
 * Returns the Upstash REST adapter when both UPSTASH_REDIS_REST_URL
 * and UPSTASH_REDIS_REST_TOKEN are set. Otherwise falls back to the
 * in-memory Map (used in dev / test / single-instance deployments).
 *
 * The startup check in src/server/startupCheck.ts refuses to boot in
 * live production if neither Upstash nor a DATABASE_URL (future
 * Postgres KV) is configured, so a production process never lands on
 * the memory KV by accident.
 */
let cached: Kv | null = null;

export function getKv(): Kv {
  if (cached) return cached;
  cached = getUpstashKv() ?? getMemoryKv();
  return cached;
}

export type { Kv } from "./types";
