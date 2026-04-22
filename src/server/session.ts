/**
 * Phase-1 signed-cookie session.
 *
 * Why not NextAuth yet? NextAuth v5 lands in Phase 2 with real providers.
 * In Phase 1 we only need: "is this browser currently authed, and as whom".
 * The cookie is httpOnly, secure, sameSite=strict, and HMAC-signed so the
 * server can detect tampering. It carries the enrolleeId, channel,
 * issued-at, and an opaque `sid` used as the revocation handle — no PII.
 */
import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthSession } from "@/types/domain";
import { appConfig } from "@/config/app";
import { requireSecret } from "@/lib/secrets";
import { getKv } from "./kv";

const COOKIE_NAME = "lwh_session";
const REVOKED_PREFIX = "revoked:sid:";

function revokedKey(sid: string) {
  return `${REVOKED_PREFIX}${sid}`;
}

function sign(payload: string): string {
  return createHmac("sha256", requireSecret("AUTH_SECRET"))
    .update(payload)
    .digest("base64url");
}

function encode(session: AuthSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(raw: string): AuthSession | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (
    expected.length !== sig.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return null;
  }
  try {
    const s = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AuthSession;
    const now = Date.now();
    const issued = new Date(s.authedAt).getTime();
    // Back-compat: existing in-flight sessions minted before F-06 may
    // not have lastSeenAt; treat them as just-seen to avoid a forced
    // mass sign-out at deploy. They will be upgraded on next request.
    const seen = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : issued;
    if (now - issued > appConfig.session.absoluteMs) return null; // absolute TTL
    if (now - seen > appConfig.session.idleMs) return null;         // idle TTL
    return s;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const s = decode(raw);
  if (!s) return null;
  // F1 (IT finding): enforce the server-side revocation denylist.
  // An HMAC-signed cookie is self-validating, but logout must be able
  // to kill an intercepted copy before absoluteMs elapses. The
  // denylist entry is written for `absoluteMs` so a replay can't
  // outlive the original session window.
  if (s.sid && (await getKv().exists(revokedKey(s.sid)))) return null;
  return s;
}

function cookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    // F-12: strict — no legitimate cross-site entry point into the
    // portal needs the session cookie to ride on top-level navigations.
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(appConfig.session.absoluteMs / 1000),
  };
}

/**
 * Mint a fresh signed-cookie session. `sid` is always server-generated
 * here — callers don't own it because it's the opaque revocation
 * handle, not a client-addressable identifier.
 */
export async function setSession(
  session: Omit<AuthSession, "sid">,
): Promise<void> {
  const store = await cookies();
  const full: AuthSession = { ...session, sid: randomUUID() };
  store.set(COOKIE_NAME, encode(full), cookieOptions());
}

/**
 * Clear the session cookie AND add its sid to the server-side
 * revocation denylist so an intercepted copy of the cookie cannot be
 * replayed until its natural expiry.
 *
 * The denylist TTL matches the session's absolute lifetime — past that
 * point `decode()` would reject the signature anyway, so no point
 * holding the entry in KV.
 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (raw) {
    const s = decode(raw);
    if (s?.sid) {
      await getKv().set(revokedKey(s.sid), 1, { ttlMs: appConfig.session.absoluteMs });
    }
  }
  store.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

/**
 * Get the session AND refresh the `lastSeenAt` watermark so the idle
 * timeout window slides forward on active use. Called from every
 * authenticated Server Action via requireSession().
 */
export async function requireSession(): Promise<AuthSession> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  const refreshed: AuthSession = { ...s, lastSeenAt: new Date().toISOString() };
  const store = await cookies();
  store.set(COOKIE_NAME, encode(refreshed), cookieOptions());
  return refreshed;
}
