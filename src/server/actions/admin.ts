"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearAdminSession,
  findDevAdmin,
  getAdminSession,
  roleAtLeast,
  setAdminSession,
  type AdminRole,
  type AdminSession,
} from "@/server/admin/session";
import { resolveReview } from "@/server/admin/reviews";
import { adminResetMember, adminUnlock } from "@/server/lockout";
import { drainPrognosisOutbox } from "@/server/outbox";
import { audit } from "@/server/audit";
import { traceId } from "@/lib/ids";
import { maskEmail } from "@/lib/mask";
import { rateLimit } from "@/server/rateLimit";
import { enrolleeIdSchema } from "@/schemas/auth";
import { verifyTurnstile } from "@/server/turnstile";
import { assertSameOrigin, OriginForbiddenError } from "@/server/origin";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-client-ip") ?? "0.0.0.0";
}

export type AdminLoginState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "rate-limited" };

/**
 * Admin login.
 *
 * F-03: IP + per-email sliding-window rate limits. The per-email
 * counter is harvested even on success, so automated discovery of the
 * right password by varying email addresses gets bounded.
 */
export async function adminLogin(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof OriginForbiddenError) {
      return { status: "error", message: "Request blocked." };
    }
    throw err;
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password)
    return { status: "error", message: "Email and password are required." };

  const ip = await clientIp();

  const turnstileToken =
    (formData.get("cf-turnstile-response") as string | null) ??
    (formData.get("turnstileToken") as string | null) ??
    undefined;
  const captcha = await verifyTurnstile(turnstileToken ?? undefined, ip);
  if (!captcha.ok) {
    await audit({
      action: "admin.login.turnstile.fail",
      actorType: "system",
      traceId: traceId(),
      ip,
      payload: { reason: captcha.reason },
    });
    return { status: "error", message: "Please reload the page and try again." };
  }

  const ipLimit = await rateLimit.adminLoginIp(ip);
  if (!ipLimit.ok) return { status: "rate-limited" };
  const emailLimit = await rateLimit.adminLoginEmail(email);
  if (!emailLimit.ok) return { status: "rate-limited" };

  const admin = findDevAdmin(email, password);
  if (!admin) {
    await audit({
      action: "admin.login.fail",
      actorType: "system",
      traceId: traceId(),
      ip,
      // `email` is maskPii'd automatically inside log.info (the key
      // contains "email"), but audit events should be durable, so we
      // mask explicitly here too. This keeps enough signal to spot a
      // repeated-target pattern without storing the raw address.
      payload: { email: maskEmail(email) },
    });
    return { status: "error", message: "Invalid credentials." };
  }

  await setAdminSession(admin);
  await audit({
    action: "admin.login.success",
    actorType: "admin",
    actorId: admin.id,
    traceId: traceId(),
    ip,
  });
  redirect("/admin/reviews");
}

export async function adminLogout() {
  const admin = await getAdminSession();
  await clearAdminSession();
  if (admin) {
    await audit({
      action: "admin.logout",
      actorType: "admin",
      actorId: admin.id,
      traceId: traceId(),
    });
  }
  redirect("/admin");
}

/**
 * Require an admin session AND enforce a minimum role. READ_ONLY can
 * view the console but cannot perform any mutation. OPS can resolve
 * reviews, unlock enrollees and drain the outbox. ADMIN additionally
 * can wipe member state (OTP + rate-limit + lockout).
 */
async function requireAdminRole(minRole: AdminRole): Promise<AdminSession> {
  const admin = await getAdminSession();
  if (!admin) throw new Error("UNAUTHENTICATED");
  if (!roleAtLeast(admin.role, minRole)) {
    await audit({
      action: "admin.forbidden",
      actorType: "admin",
      actorId: admin.id,
      traceId: traceId(),
      payload: { have: admin.role, need: minRole },
    });
    throw new Error("FORBIDDEN");
  }
  return admin;
}

/**
 * F-01 / F-03: resolve a manual review row.
 *   - Session check is mandatory; role must be at least OPS.
 *   - The actor id comes from the signed cookie, NOT from form data.
 *   - An invalid request simply returns idle (don't leak state).
 */
export async function resolveReviewAction(
  _prev: { status: "idle" | "done" },
  formData: FormData,
): Promise<{ status: "idle" | "done" }> {
  await assertSameOrigin();
  const admin = await requireAdminRole("OPS");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "") as "APPROVED" | "REJECTED";
  if (!id || (action !== "APPROVED" && action !== "REJECTED"))
    return { status: "idle" };
  const updated = await resolveReview(id, action, admin.id);
  await audit({
    action: `admin.review.${action.toLowerCase()}`,
    actorType: "admin",
    actorId: admin.id,
    memberId: updated?.memberId,
    traceId: traceId(),
  });
  return { status: "done" };
}

/** F-01: session-gated manual unlock. Requires at least OPS. */
export async function unlockEnrolleeAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireAdminRole("OPS");
  const parsed = enrolleeIdSchema.safeParse(formData.get("enrolleeId"));
  if (!parsed.success) return;
  await adminUnlock(parsed.data, admin.id);
}

/** F-01: session-gated outbox drain. Requires at least OPS. */
export async function drainOutboxAction(): Promise<{
  processed: number;
  remaining: number;
}> {
  await assertSameOrigin();
  await requireAdminRole("OPS");
  return drainPrognosisOutbox();
}

export type ResetMemberState =
  | { status: "idle" }
  | { status: "ok"; enrolleeId: string }
  | { status: "error"; message: string };

/**
 * Clear lockout, rate limits, and OTP state for a single enrolleeId.
 * Destructive — requires ADMIN.
 */
export async function resetMemberAction(
  _prev: ResetMemberState,
  formData: FormData,
): Promise<ResetMemberState> {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof OriginForbiddenError) {
      return { status: "error", message: "Request blocked." };
    }
    throw err;
  }
  let admin: AdminSession;
  try {
    admin = await requireAdminRole("ADMIN");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") {
      return { status: "error", message: "Not signed in." };
    }
    return { status: "error", message: "You don't have permission to do that." };
  }

  const parsed = enrolleeIdSchema.safeParse(formData.get("enrolleeId"));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid ID.",
    };
  }
  await adminResetMember(parsed.data, admin.id);
  revalidatePath("/admin/unlock");
  return { status: "ok", enrolleeId: parsed.data };
}
