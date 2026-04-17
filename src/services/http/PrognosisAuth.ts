import "server-only";
import { log } from "@/lib/logger";

/**
 * Prognosis login + short-lived token cache.
 *
 * Endpoint: POST {PROGNOSIS_BASE_URL}/ApiUsers/Login
 * Body shape / field names are provider-defined — we honour the most
 * common Prognosis-style payloads (Username/Password) and read any of
 * the typical token keys from the response. If the real body differs,
 * only this file changes.
 */

interface Token {
  accessToken: string;
  fetchedAt: number;
}

let cached: Token | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function readToken(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  for (const k of ["accessToken", "token", "AccessToken", "Token", "jwt", "JWT"]) {
    const v = b[k];
    if (typeof v === "string" && v.length) return v;
  }
  // Some APIs wrap it: { data: { token: "..." } }
  if (b.data && typeof b.data === "object") return readToken(b.data);
  return undefined;
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
  if (!res.ok) {
    log.error({ status: res.status }, "prognosis.token.http-fail");
    throw new Error(`prognosis.token.http-${res.status}`);
  }
  const body = (await res.json().catch(() => ({}))) as unknown;
  const token = readToken(body);
  if (!token) throw new Error("prognosis.token.no-token");
  cached = { accessToken: token, fetchedAt: Date.now() };
  return token;
}

export function _resetPrognosisTokenCache() {
  cached = null;
}
