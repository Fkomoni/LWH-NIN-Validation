/**
 * Phase-1 signed-cookie session.
 *
 * Why not NextAuth yet? NextAuth v5 lands in Phase 2 with real providers.
 * In Phase 1 we only need: "is this browser currently authed, and as whom".
 * The cookie is httpOnly, secure, sameSite=lax, and HMAC-signed so the
 * server can detect tampering. It carries no PII — only the enrolleeId +
 * channel + issued-at.
 */
import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AuthSession } from "@/types/domain";
import { appConfig } from "@/config/app";
import { requireSecret } from "@/lib/secrets";

/**
 * Runtime schema for the decoded session payload. Even though the
 * HMAC guarantees server origin, validating against an explicit
 * schema stops legacy / malformed payloads (e.g. older deploys
 * without new fields) from being silently accepted. Additive schema
 * changes should go through this type.
 */
const authSessionSchema = z.object({
  enrolleeId: z.string().min(1).max(40),
  authedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().optional(),
  channel: z.enum(["DOB", "PRINCIPAL_NIN", "OTP"]),
  mocked: z.boolean().optional(),
});

const COOKIE_NAME = "lwh_session";

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
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const parsed = authSessionSchema.safeParse(json);
    if (!parsed.success) return null;
    const s: AuthSession = parsed.data;
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
  return decode(raw);
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

export async function setSession(session: AuthSession): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encode(session), cookieOptions());
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
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
