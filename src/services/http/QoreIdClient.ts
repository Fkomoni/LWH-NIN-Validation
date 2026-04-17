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
 * Access tokens are cached in-process for 50 minutes (Qore's quoted TTL
 * is ~1 h; we refresh early to avoid races on long-running requests).
 */

export interface QoreToken {
  accessToken: string;
  fetchedAt: number;
}

let cachedToken: QoreToken | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

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
  if (!res.ok) {
    throw new Error(`qore.token.http-${res.status}`);
  }
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) throw new Error("qore.token.no-accessToken");
  cachedToken = { accessToken: data.accessToken, fetchedAt: Date.now() };
  return data.accessToken;
}

export interface QoreVerifyRequest {
  nin: string;
  firstname: string;
  lastname: string;
  traceId: string;
}

/**
 * The exact body shape Qore returns is provider-defined. We pull the
 * fields the orchestrator needs (name + DOB) and ignore the rest; any
 * structural surprise falls back to a provider error so the user sees
 * the support path, not a stack trace.
 */
export interface QoreVerifyResponse {
  /** Normalised to our internal vocabulary. */
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

function extractFullName(obj: QoreBody): string | undefined {
  const direct = pick(obj, ["fullName", "fullname", "full_name"]);
  if (direct) return direct;
  const first = pick(obj, ["firstName", "firstname", "first_name", "givenName", "givennames"]);
  const middle = pick(obj, ["middleName", "middlename", "middle_name"]);
  const last = pick(obj, ["lastName", "lastname", "last_name", "surname"]);
  const parts = [first, middle, last].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function extractDob(obj: QoreBody): string | undefined {
  const raw = pick(obj, ["dateOfBirth", "dob", "birthDate"]);
  if (!raw) return undefined;
  // Accept "1985-06-15", "15/06/1985", "15-06-1985" → ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
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
  if (!base) return { ok: false, error: { kind: "PROVIDER_ERROR" } };

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
    const res = await fetch(`${base}${encodeURIComponent(req.nin)}`, {
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
    const body = (await res.json().catch(() => ({}))) as QoreBody;
    const fullName = extractFullName(body);
    const dob = extractDob(body);
    if (!fullName && !dob) {
      // Provider responded OK but we couldn't find the fields we need.
      return { ok: false, error: { kind: "PROVIDER_ERROR" } };
    }
    return { ok: true, data: { status: "VERIFIED", fullName, dob, raw: body } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) return { ok: false, error: { kind: "TIMEOUT" } };
    return { ok: false, error: { kind: "PROVIDER_ERROR" } };
  } finally {
    clearTimeout(timer);
  }
}

/** Visible for tests. */
export function _resetQoreTokenCache() {
  cachedToken = null;
}
