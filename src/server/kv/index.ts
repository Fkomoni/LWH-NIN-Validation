import "server-only";
import type { Kv } from "./types";
import { getMemoryKv } from "./memory";

/**
 * KV resolver.
 *
 * In live production the startup check (runStartupCheck) refuses to
 * boot without a durable KV configured (Upstash REST or DATABASE_URL).
 * The in-memory KV here is only used in dev / mock / test runs. If a
 * future deploy wires Upstash, swap this resolver to return the
 * Upstash-backed implementation when UPSTASH_REDIS_REST_URL is set.
 */
export function getKv(): Kv {
  return getMemoryKv();
}

export type { Kv } from "./types";
