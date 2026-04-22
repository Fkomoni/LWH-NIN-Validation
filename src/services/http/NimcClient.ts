import "server-only";

/**
 * NIMC HTTP client.
 *
 * Phase 1: requests are served by MSW running inside the Node runtime
 * (see src/mocks/node.ts). Phase 2 sets `NIMC_BASE_URL` to the real
 * NIMC/aggregator endpoint — this file does not change. We intentionally
 * do not invent the real request/response body shapes (brief: "Do not
 * invent API shapes."). The mock handler defines the shape end-to-end;
 * real wiring lands once the provider is confirmed.
 */

export interface NimcVerifyRequest {
  nin: string;
  traceId: string;
}

export interface NimcVerifyResponse {
  status: "MATCH" | "MATCH_INITIAL" | "MISMATCH_NAME" | "DOB_MISMATCH" | "DUPLICATE_NIN" | "NOT_FOUND";
  fullName?: string;
  dob?: string;
}

export interface NimcTransportError {
  kind: "TIMEOUT" | "PROVIDER_ERROR";
  status?: number;
}

export type NimcResult =
  | { ok: true; data: NimcVerifyResponse }
  | { ok: false; error: NimcTransportError };

const DEFAULT_TIMEOUT_MS = 5_000;

export async function verifyNin(
  req: NimcVerifyRequest,
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<NimcResult> {
  const base = opts.baseUrl ?? process.env.NIMC_BASE_URL ?? "http://mock.nimc.local";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/v1/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-trace-id": req.traceId,
      },
      body: JSON.stringify({ nin: req.nin }),
      signal: ctl.signal,
    });
    if (res.status >= 500) {
      return { ok: false, error: { kind: "PROVIDER_ERROR", status: res.status } };
    }
    const data = (await res.json()) as NimcVerifyResponse;
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort")) return { ok: false, error: { kind: "TIMEOUT" } };
    return { ok: false, error: { kind: "PROVIDER_ERROR" } };
  } finally {
    clearTimeout(timer);
  }
}
