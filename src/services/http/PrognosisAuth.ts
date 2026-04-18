import "server-only";
import { log } from "@/lib/logger";

/**
 * Prognosis login + short-lived token cache.
 *
 * Endpoint: POST {PROGNOSIS_BASE_URL}/ApiUsers/Login
 * Body shape is provider-defined — we honour the common Prognosis-style
 * payloads (Username/Password) and read any of the typical token keys
 * from the response. Status + response-body keys are logged on every
 * call so a wrong body shape is immediately visible in ops logs.
 */

interface Token {
  accessToken: string;
  fetchedAt: number;
}

let cached: Token | null = null;
// Leadway Prognosis tokens are valid for 6 hours. Refresh at 5h to
// leave headroom for long-running requests.
const TOKEN_TTL_MS = 5 * 60 * 60 * 1000;

function readToken(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  for (const k of ["accessToken", "token", "AccessToken", "Token", "jwt", "JWT"]) {
    const v = b[k];
    if (typeof v === "string" && v.length) return v;
  }
  if (b.data && typeof b.data === "object") return readToken(b.data);
  if (b.result && typeof b.result === "object") return readToken(b.result);
  return undefined;
}

/** Summarise a parsed JSON body for safe logging: key name, type, and
 *  (for strings) length only. No character-level preview is logged,
 *  because this endpoint returns a JWT/bearer token and any prefix of
 *  that material is sensitive. We still get enough signal (keys +
 *  lengths) to spot a mislabelled field. */
function bodyShape(body: unknown): Array<{ k: string; type: string; len?: number }> {
  if (!body || typeof body !== "object") return [];
  return Object.entries(body as Record<string, unknown>).map(([k, v]) => {
    if (typeof v === "string")
      return { k, type: "string", len: v.length };
    if (v === null) return { k, type: "null" };
    return { k, type: typeof v };
  });
}

function bodyKeys(body: unknown): string[] {
  if (body && typeof body === "object") return Object.keys(body as Record<string, unknown>);
  return [];
}

export async function getPrognosisToken(): Promise<string> {
  if (cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) {
    return cached.accessToken;
  }
  const base = process.env.PROGNOSIS_BASE_URL;
  const username = process.env.PROGNOSIS_USERNAME;
  const password = process.env.PROGNOSIS_PASSWORD;
  if (!base || !username || !password) {
    throw new Error("prognosis.token.missing-config");
  }

  const res = await fetch(`${base}/ApiUsers/Login`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ Username: username, Password: password }),
  });
  const body = await res.json().catch(() => null);

  log.info(
    { status: res.status, keys: bodyKeys(body), shape: bodyShape(body) },
    "prognosis.token.response",
  );

  if (!res.ok) {
    log.error({ status: res.status }, "prognosis.token.http-fail");
    throw new Error(`prognosis.token.http-${res.status}`);
  }
  const token = readToken(body);
  if (!token) {
    log.error({ keys: bodyKeys(body) }, "prognosis.token.no-token-in-body");
    throw new Error("prognosis.token.no-token");
  }
  cached = { accessToken: token, fetchedAt: Date.now() };
  return token;
}

export function _resetPrognosisTokenCache() {
  cached = null;
}
