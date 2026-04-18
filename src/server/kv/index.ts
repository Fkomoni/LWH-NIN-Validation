import "server-only";
import type { Kv } from "./types";
import { getMemoryKv } from "./memory";
import { getUpstashKv } from "./upstash";
import { getPostgresKv } from "./postgres";

/**
 * KV resolver. Preference order:
 *   1. Upstash Redis REST   — when UPSTASH_REDIS_REST_URL +
 *      UPSTASH_REDIS_REST_TOKEN are set. Best latency for hot
 *      counters (rate-limit, OTP).
 *   2. Postgres              — when DATABASE_URL is set. Durable
 *      across restarts and multi-instance; slightly slower per op.
 *   3. In-memory Map         — dev / test / single-instance only.
 *
 * The startup check in src/server/startupCheck.ts refuses to boot in
 * live production if neither Upstash nor DATABASE_URL is configured,
 * so a production process never lands on the memory KV by accident.
 */
let cached: Kv | null = null;

export function getKv(): Kv {
  if (cached) return cached;
  cached = getUpstashKv() ?? getPostgresKv() ?? getMemoryKv();
  return cached;
}

export type { Kv } from "./types";
