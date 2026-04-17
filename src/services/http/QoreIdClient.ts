import "server-only";
import { log } from "@/lib/logger";
import { maskNin } from "@/lib/mask";

/**
 * QoreID NIN verification client (confirmed provider: Qore).
 *
 * Flow:
 *   1. POST {QORE_TOKEN_URL} with { clientId, secret } → { accessToken }
 *   2. POST {QORE_NIN_VERIFY_URL}{nin} with Bearer token and
 *      { firstname, lastname } → verification response
 *
 * Access tokens are cached in-process for 50 minutes.
 *
 * Every call logs HTTP status + body-key list (never values) so an
 * unexpected Qore shape is immediately visible in Render logs.
 */

export interface QoreToken {
  accessToken: string;
  fetchedAt: number;
}

let cachedToken: QoreToken | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function bodyKeys(body: unknown): string[] {
  if (body && typeof body === "object") return Object.keys(body as Record<string, unknown>);
  return [];
}

function readAccessToken(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  for (const k of ["accessToken", "access_token", "AccessToken", "token", "Token"]) {
    const v = b[k];
    if (typeof v === "string" && v.length) return v;
  }
  if (b.data && typeof b.data === "object") return readAccessToken(b.data);
  if (b.result && typeof b.result === "object") return readAccessToken(b.result);
  return undefined;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken.accessToken;
  }
  const url = process.env.QORE_TOKEN_URL;
  const clientId = process.env.QORE_CLIENT_ID;
  const secret = process.env.QORE_SECRET_KEY ?? process.env.VITE_CORE_SECRET_KEY;
  if (!url || !clientId || !secret) {
    throw new Error("qore.token.missing-config");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "text/plain", "content-type": "application/json" },
    body: JSON.stringify({ clientId, secret }),
  });
  const body = await res.json().catch(() => null);
  log.info({ status: res.status, keys: bodyKeys(body) }, "qore.token.response");
  if (!res.ok) {
    log.error({ status: res.status }, "qore.token.http-fail");
    throw new Error(`qore.token.http-${res.status}`);
  }
  const token = readAccessToken(body);
  if (!token) {
    log.error({ keys: bodyKeys(body) }, "qore.token.no-token-in-body");
    throw new Error("qore.token.no-accessToken");
  }
  cachedToken = { accessToken: token, fetchedAt: Date.now() };
  return token;
}

export interface QoreVerifyRequest {
  nin: string;
  firstname: string;
  lastname: string;
  traceId: string;
}

export interface QoreVerifyResponse {
  status: "VERIFIED" | "NOT_FOUND";
  fullName?: string;
  dob?: string;
  raw?: unknown;
}

type QoreBody = Record<string, unknown>;

function pick(obj: QoreBody, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

function unwrapQore(body: unknown): QoreBody {
  // Qore tends to wrap payloads in either { data: {...} } or { nin: {...} }
  // or return the raw object directly. We walk one level deep.
  if (!body || typeof body !== "object") return {};
  const b = body as QoreBody;
  const wraps = ["data", "result", "nin", "payload", "response"];
  for (const w of wraps) {
    const v = b[w];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as QoreBody;
  }
  return b;
}

function extractFullName(raw: QoreBody): string | undefined {
  const b = unwrapQore(raw);
  const direct = pick(b, ["fullName", "fullname", "full_name", "FullName", "name"]);
  if (direct) return direct;
  const first = pick(b, [
    "firstName",
    "firstname",
    "first_name",
    "givenName",
    "givennames",
    "FirstName",
  ]);
  const middle = pick(b, ["middleName", "middlename", "middle_name", "MiddleName"]);
  const last = pick(b, ["lastName", "lastname", "last_name", "surname", "LastName", "Surname"]);
  const parts = [first, middle, last].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function extractDob(raw: QoreBody): string | undefined {
  const b = unwrapQore(raw);
  const val = pick(b, ["dateOfBirth", "dob", "DateOfBirth", "birthDate", "BirthDate"]);
  if (!val) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  const m = val.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo?.padStart(2, "0")}-${d?.padStart(2, "0")}`;
  }
  return undefined;
}

export type QoreResult =
  | { ok: true; data: QoreVerifyResponse }
  | { ok: false; error: { kind: "TIMEOUT" | "PROVIDER_ERROR" | "AUTH"; status?: number } };

const DEFAULT_TIMEOUT_MS = 5_000;

export async function qoreVerifyNin(
  req: QoreVerifyRequest,
  opts: { timeoutMs?: number } = {},
): Promise<QoreResult> {
  const base = process.env.QORE_NIN_VERIFY_URL;
  if (!base) {
    log.error({}, "qore.verify.missing-base-url");
    return { ok: false, error: { kind: "PROVIDER_ERROR" } };
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    log.error({ err: String(err), nin: maskNin(req.nin) }, "qore.token.fail");
    return { ok: false, error: { kind: "AUTH" } };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    // The 11-digit NIN has no characters that need escaping; keep raw.
    const res = await fetch(`${base}${req.nin}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-trace-id": req.traceId,
      },
      body: JSON.stringify({ firstname: req.firstname, lastname: req.lastname }),
      signal: ctl.signal,
    });
    const body = (await res.json().catch(() => null)) as QoreBody | null;
    log.info(
      {
        status: res.status,
        keys: bodyKeys(body),
        inner: bodyKeys(unwrapQore(body ?? {})),
        nin: maskNin(req.nin),
      },
      "qore.verify.response",
    );

    if (res.status === 401 || res.status === 403) {
      cachedToken = null; // force refresh next call
      return { ok: false, error: { kind: "AUTH", status: res.status } };
    }
    if (res.status === 404) {
      return { ok: true, data: { status: "NOT_FOUND" } };
    }
    if (res.status >= 500) {
      return { ok: false, error: { kind: "PROVIDER_ERROR", status: res.status } };
    }
    if (res.status >= 400) {
      return { ok: false, error: { kind: "PROVIDER_ERROR", status: res.status } };
    }

    const fullName = extractFullName(body ?? {});
    const dob = extractDob(body ?? {});
    if (!fullName && !dob) {
      log.warn(
        {
          nin: maskNin(req.nin),
          keys: bodyKeys(body),
          inner: bodyKeys(unwrapQore(body ?? {})),
        },
        "qore.verify.unrecognised-shape",
      );
      return { ok: false, error: { kind: "PROVIDER_ERROR" } };
    }
    return { ok: true, data: { status: "VERIFIED", fullName, dob, raw: body } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) return { ok: false, error: { kind: "TIMEOUT" } };
    log.error({ err: msg, nin: maskNin(req.nin) }, "qore.verify.fetch-throw");
    return { ok: false, error: { kind: "PROVIDER_ERROR" } };
  } finally {
    clearTimeout(timer);
  }
}

/** Visible for tests. */
export function _resetQoreTokenCache() {
  cachedToken = null;
}
