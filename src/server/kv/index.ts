import "server-only";
import type { Kv } from "./types";
import { getMemoryKv } from "./memory";
import { getUpstashKv } from "./upstash";
import { log } from "@/lib/logger";

/**
 * KV resolver.
 *
 * When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are
 * present, the KV is backed by Upstash Redis. Otherwise we fall back
 * to the single-process in-memory adapter (dev / tests / preview).
 *
 * IMPORTANT: production deployments on Render MUST supply the Upstash
 * env vars. Without them, lockout counters and the session revocation
 * denylist reset whenever the instance spins down — which is exactly
 * the failure mode IT flagged as F2 ("8 attempts instead of 3").
 */
let warned = false;

export function getKv(): Kv {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return getUpstashKv(url, token);

  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    log.warn(
      {},
      "kv.memory-in-prod: UPSTASH_REDIS_REST_URL/TOKEN not set; lockout + session revocation will not survive restarts",
    );
  }
  return getMemoryKv();
}

export type { Kv } from "./types";
