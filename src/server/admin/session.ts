import "server-only";
import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { requireAdminBootstrapPassword, requireSecret } from "@/lib/secrets";

/**
 * Dev-only admin session. Phase 2 replaces with NextAuth v5 + Leadway
 * SSO (or email-magic-link fallback). The interface here is only used
 * by the Phase-4 admin console stub.
 */
const COOKIE = "lwh_admin";

function sign(p: string): string {
  return createHmac("sha256", requireSecret("ADMIN_SECRET"))
    .update(p)
    .digest("base64url");
}

export interface AdminSession {
  id: string;
  email: string;
  role: "READ_ONLY" | "OPS" | "ADMIN";
  at: string;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
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
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
  } catch {
    return null;
  }
}

export async function setAdminSession(s: AdminSession): Promise<void> {
  const store = await cookies();
  const payload = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // F-11: strict — there is no legitimate cross-site entry point
    // into /admin/*, so refuse the cookie on top-level navigations
    // initiated from other origins.
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 h
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, "", { maxAge: 0, path: "/" });
}

/**
 * Dev allow-list. Replace with a DB lookup + per-admin bcrypt hash in
 * Phase 2. Uses a timing-safe SHA-256 digest compare so the length or
 * early-mismatch of the bootstrap password can't be inferred from
 * response time. Throws in live production if
 * ADMIN_BOOTSTRAP_PASSWORD is missing.
 */
export function findDevAdmin(email: string, password: string): AdminSession | null {
  const want = requireAdminBootstrapPassword();
  const got = createHash("sha256").update(password).digest();
  const exp = createHash("sha256").update(want).digest();
  if (got.length !== exp.length) return null;
  if (!timingSafeEqual(got, exp)) return null;
  return {
    id: `dev-${email}`,
    email,
    role: "ADMIN",
    at: new Date().toISOString(),
  };
}
