import "server-only";
import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { adminAllowList, requireAdminBootstrapPassword, requireSecret } from "@/lib/secrets";

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

export type AdminRole = "READ_ONLY" | "OPS" | "ADMIN";

/**
 * Role hierarchy (monotonic — a higher role can perform every action
 * permitted to a lower role). Used by requireAdminRole().
 *   READ_ONLY  (0) — can view the ops console
 *   OPS        (1) — approve/reject reviews, unlock enrollees, drain outbox
 *   ADMIN      (2) — wipe member state, everything OPS can do
 */
const ROLE_RANK: Record<AdminRole, number> = {
  READ_ONLY: 0,
  OPS: 1,
  ADMIN: 2,
};

export function roleAtLeast(have: AdminRole, need: AdminRole): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}

export interface AdminSession {
  id: string;
  email: string;
  role: AdminRole;
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
 * response time. Throws in live production if ADMIN_BOOTSTRAP_PASSWORD
 * or ADMIN_ALLOWED_EMAILS is missing.
 *
 * The email is matched against ADMIN_ALLOWED_EMAILS (comma-separated,
 * lower-cased). The password comparison always runs so the response
 * time doesn't reveal whether the submitted email was on the list.
 */
export function findDevAdmin(email: string, password: string): AdminSession | null {
  const normalized = email.trim().toLowerCase();
  const want = requireAdminBootstrapPassword();

  // Always run the password compare BEFORE deciding, so timing doesn't
  // leak whether the email is on the allow-list.
  const got = createHash("sha256").update(password).digest();
  const exp = createHash("sha256").update(want).digest();
  const passwordOk = got.length === exp.length && timingSafeEqual(got, exp);

  const allow = adminAllowList();
  // Empty set is only reachable in dev/mock (see adminAllowList); treat
  // it as "any email is acceptable" so the walkthrough still works.
  const emailOk = allow.size === 0 ? true : allow.has(normalized);

  if (!(passwordOk && emailOk)) return null;
  return {
    id: `dev-${normalized}`,
    email: normalized,
    role: "ADMIN",
    at: new Date().toISOString(),
  };
}
