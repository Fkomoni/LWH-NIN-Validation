import "server-only";
import type { PrognosisUpdatePayload } from "../types";
import { appConfig } from "@/config/app";

/**
 * Prognosis HTTP client — MOCK PATH ONLY.
 *
 * This module is used by src/services/mock/PrognosisService.mock.ts
 * and its fetch() calls are intercepted end-to-end by MSW against
 * http://mock.prognosis.local/... (see src/mocks/handlers.ts). The
 * real production write path lives in
 * src/services/real/PrognosisService.real.ts, which uses a bearer
 * token from getPrognosisToken().
 *
 * To prevent this unauthenticated client from ever being used in
 * live mode (which would transmit NIN + DOB to whatever URL is
 * configured with NO Authorization header), we refuse to run when
 * mocks are disabled. The previous `http://mock.prognosis.local`
 * default has been removed — callers must be in mock mode.
 */

export interface PrognosisResult {
  ok: boolean;
  txnRef: string;
  retryable: boolean;
  error?: "DUPLICATE" | "PROVIDER_ERROR";
}

const MOCK_BASE = "http://mock.prognosis.local";

export async function upsertMemberNin(
  payload: PrognosisUpdatePayload,
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<PrognosisResult> {
  if (!appConfig.mocksEnabled) {
    throw new Error(
      "prognosis.http.mock-client-used-in-live-mode: use src/services/real/PrognosisService.real.ts",
    );
  }
  const base = opts.baseUrl ?? MOCK_BASE;
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
