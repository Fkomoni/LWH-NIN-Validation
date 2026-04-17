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
import type { AuthSession } from "@/types/domain";
import { appConfig } from "@/config/app";

const COOKIE_NAME = "lwh_session";
const DEV_SECRET = "dev-only-secret-do-not-use-in-prod";

function secret(): string {
  return process.env.AUTH_SECRET || DEV_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
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
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthSession;
    const age = Date.now() - new Date(s.authedAt).getTime();
    if (age > appConfig.session.absoluteMs) return null;
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

export async function setSession(session: AuthSession): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(appConfig.session.absoluteMs / 1000),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

export async function requireSession(): Promise<AuthSession> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}
