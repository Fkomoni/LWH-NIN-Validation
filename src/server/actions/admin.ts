"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearAdminSession,
  findDevAdmin,
  getAdminSession,
  setAdminSession,
} from "@/server/admin/session";
import { resolveReview } from "@/server/admin/reviews";
import { adminResetMember, adminUnlock } from "@/server/lockout";
import { drainPrognosisOutbox } from "@/server/outbox";
import { audit } from "@/server/audit";
import { traceId } from "@/lib/ids";
import { rateLimit } from "@/server/rateLimit";
import { enrolleeIdSchema } from "@/schemas/auth";

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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password)
    return { status: "error", message: "Email and password are required." };

  const ip = await clientIp();
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
      payload: { email },
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

/** Helper: every admin mutation fetches its own session. */
async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) throw new Error("UNAUTHENTICATED");
  return admin;
}

/**
 * F-01 / F-03: resolve a manual review row.
 *   - Session check is mandatory.
 *   - The actor id comes from the signed cookie, NOT from form data.
 *   - An invalid request simply returns idle (don't leak state).
 */
export async function resolveReviewAction(
  _prev: { status: "idle" | "done" },
  formData: FormData,
): Promise<{ status: "idle" | "done" }> {
  const admin = await requireAdmin();
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

/** F-01: session-gated manual unlock. */
export async function unlockEnrolleeAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = enrolleeIdSchema.safeParse(formData.get("enrolleeId"));
  if (!parsed.success) return;
  await adminUnlock(parsed.data, admin.id);
}

/** F-01: session-gated outbox drain. */
export async function drainOutboxAction(): Promise<{
  processed: number;
  remaining: number;
}> {
  await requireAdmin();
  return drainPrognosisOutbox();
}

export type ResetMemberState =
  | { status: "idle" }
  | { status: "ok"; enrolleeId: string }
  | { status: "error"; message: string };

/**
 * Clear lockout, rate limits, and OTP state for a single enrolleeId.
 * (Already session-gated pre-F-01; kept for completeness.)
 */
export async function resetMemberAction(
  _prev: ResetMemberState,
  formData: FormData,
): Promise<ResetMemberState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: "Not signed in." };

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
