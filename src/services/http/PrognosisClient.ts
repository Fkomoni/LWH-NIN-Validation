import "server-only";
import type { PrognosisUpdatePayload } from "../types";

/**
 * Prognosis HTTP client.
 *
 * We intentionally do NOT invent the real Prognosis request/response
 * shape (brief: "Do not invent API shapes"). The payload object matches
 * the field list in the brief; the mock handler in src/mocks/handlers.ts
 * is the contract until Leadway shares real docs. When that happens,
 * only the `fetch()` target + header/body mapping in this file changes.
 *
 * Idempotency: we pass `txnRef` as `Idempotency-Key` so a retry with
 * the same reference doesn't double-write. Whether Prognosis honours
 * this header server-side is TBC — our own dedupe in NinService + the
 * outbox handles the client-side guarantee regardless.
 */

export interface PrognosisResult {
  ok: boolean;
  txnRef: string;
  retryable: boolean;
  error?: "DUPLICATE" | "PROVIDER_ERROR";
}

export async function upsertMemberNin(
  payload: PrognosisUpdatePayload,
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<PrognosisResult> {
  const base = opts.baseUrl ?? process.env.PROGNOSIS_BASE_URL ?? "http://mock.prognosis.local";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 5_000);
  try {
    const res = await fetch(`${base}/v1/members/nin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": payload.txnRef,
      },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    if (res.status === 409) {
      return { ok: false, txnRef: payload.txnRef, retryable: false, error: "DUPLICATE" };
    }
    if (res.status >= 500) {
      return { ok: false, txnRef: payload.txnRef, retryable: true, error: "PROVIDER_ERROR" };
    }
    return { ok: res.ok, txnRef: payload.txnRef, retryable: false };
  } catch {
    return { ok: false, txnRef: payload.txnRef, retryable: true, error: "PROVIDER_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}
