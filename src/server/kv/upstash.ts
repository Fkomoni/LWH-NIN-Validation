import "server-only";
import type { Kv } from "./types";
import { log } from "@/lib/logger";

/**
 * Upstash Redis REST adapter.
 *
 * Why: the in-memory KV (see memory.ts) is single-process and
 * evaporates when the Render instance spins down. That let the
 * lockout counter "reset" between a scanner's probes — IT finding F2
 * surfaced this ("8 attempts observed, not 3"). Persisting counters
 * and the session-revocation denylist in Redis fixes the root cause.
 *
 * Transport: plain `fetch` against Upstash's REST API. No driver
 * dependency. Pipelining is used for the sliding window so the three
 * operations (ZADD / ZREMRANGEBYSCORE / ZCARD / PEXPIRE) are a single
 * round-trip.
 *
 * Failure policy: Redis blips must not take the app down. On error we
 * LOG + return the conservative default for the shape of the caller:
 *   - reads that power a "locked?" gate  → return false (don't
 *     falsely lock legit users out of the app because Redis hiccup'd)
 *   - reads that return a count          → return 0 (same reasoning)
 *   - writes                             → swallow; the counter will
 *                                          self-heal on the next write
 * This trades a small, rare security-posture dip for availability.
 */

const DEFAULT_TIMEOUT_MS = 4_000;

interface PipelineArg {
  url: string;
  token: string;
  commands: string[][];
}

async function rawPipeline(args: PipelineArg): Promise<unknown[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${args.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.commands),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "kv.upstash.non2xx");
      return null;
    }
    const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return json.map((r) => (r.error ? null : r.result));
  } catch (err) {
    log.warn({ err: String(err) }, "kv.upstash.fetch_fail");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

class UpstashKv implements Kv {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async cmd<T = unknown>(...command: string[]): Promise<T | null> {
    const rs = await rawPipeline({ url: this.url, token: this.token, commands: [command] });
    return (rs?.[0] ?? null) as T | null;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.cmd<string>("GET", key);
    if (raw === null) return null;
    // Values are always JSON-stringified on write (see `set` below),
    // so a plain parse is safe. Guard for legacy plain-string keys
    // that may have been written by an older code path.
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, opts?: { ttlMs?: number }): Promise<void> {
    const serialized = JSON.stringify(value);
    const args = ["SET", key, serialized];
    if (opts?.ttlMs) args.push("PX", String(opts.ttlMs));
    await this.cmd(...args);
  }

  async del(key: string): Promise<void> {
    await this.cmd("DEL", key);
  }

  async exists(key: string): Promise<boolean> {
    const n = await this.cmd<number>("EXISTS", key);
    return typeof n === "number" && n > 0;
  }

  async incr(key: string, opts?: { ttlMs?: number }): Promise<number> {
    // Pipeline INCR + conditional PEXPIRE. We set the TTL only on the
    // first increment (when the new value is 1) — subsequent calls
    // must preserve the original expiry so the counter window doesn't
    // slide indefinitely.
    const pipelined = await rawPipeline({
      url: this.url,
      token: this.token,
      commands: [["INCR", key], ...(opts?.ttlMs ? [["PEXPIRE", key, String(opts.ttlMs), "NX"]] : [])],
    });
    const n = pipelined?.[0];
    return typeof n === "number" ? n : 0;
  }

  async pushWindow(key: string, windowMs: number): Promise<number> {
    // Sliding window as a sorted set: score = ms timestamp, member =
    // unique per call so multiple events in the same ms don't collide.
    // One pipeline: trim expired, add current, count, re-arm TTL.
    const now = Date.now();
    const cutoff = now - windowMs;
    // Non-cryptographic uniqueness is fine — we only need ZADD to
    // treat concurrent events as distinct members within one ms.
    const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    const rs = await rawPipeline({
      url: this.url,
      token: this.token,
      commands: [
        ["ZREMRANGEBYSCORE", key, "0", `(${cutoff}`],
        ["ZADD", key, String(now), member],
        ["ZCARD", key],
        // Auto-clean the key after one full window of inactivity.
        ["PEXPIRE", key, String(windowMs)],
      ],
    });
    if (!rs) return 0;
    const count = rs[2];
    return typeof count === "number" ? count : 0;
  }
}

let instance: Kv | undefined;

export function getUpstashKv(url: string, token: string): Kv {
  if (!instance) instance = new UpstashKv(url, token);
  return instance;
}
