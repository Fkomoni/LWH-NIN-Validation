"use server";

import { redirect } from "next/navigation";
import { clearAdminSession, findDevAdmin, setAdminSession } from "@/server/admin/session";
import { resolveReview } from "@/server/admin/reviews";
import { adminResetMember, adminUnlock } from "@/server/lockout";
import { getAdminSession } from "@/server/admin/session";
import { revalidatePath } from "next/cache";
import { enrolleeIdSchema } from "@/schemas/auth";
import { drainPrognosisOutbox } from "@/server/outbox";
import { audit } from "@/server/audit";
import { traceId } from "@/lib/ids";

export type AdminLoginState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function adminLogin(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { status: "error", message: "Email and password are required." };

  const admin = findDevAdmin(email, password);
  if (!admin) return { status: "error", message: "Invalid credentials." };

  await setAdminSession(admin);
  await audit({
    action: "admin.login.success",
    actorType: "admin",
    actorId: admin.id,
    traceId: traceId(),
  });
  redirect("/admin/reviews");
}

export async function adminLogout() {
  await clearAdminSession();
  redirect("/admin");
}

export async function resolveReviewAction(
  _prev: { status: "idle" | "done" },
  formData: FormData,
): Promise<{ status: "idle" | "done" }> {
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "") as "APPROVED" | "REJECTED";
  const adminId = String(formData.get("adminId") ?? "");
  if (!id || (action !== "APPROVED" && action !== "REJECTED")) return { status: "idle" };
  const updated = await resolveReview(id, action, adminId);
  await audit({
    action: `admin.review.${action.toLowerCase()}`,
    actorType: "admin",
    actorId: adminId,
    memberId: updated?.memberId,
    traceId: traceId(),
  });
  return { status: "done" };
}

export async function unlockEnrolleeAction(formData: FormData): Promise<void> {
  const enrolleeId = String(formData.get("enrolleeId") ?? "").trim();
  const adminId = String(formData.get("adminId") ?? "");
  if (!enrolleeId || !adminId) return;
  await adminUnlock(enrolleeId, adminId);
}

export async function drainOutboxAction(): Promise<{ processed: number; remaining: number }> {
  return drainPrognosisOutbox();
}

export type ResetMemberState =
  | { status: "idle" }
  | { status: "ok"; enrolleeId: string }
  | { status: "error"; message: string };

/**
 * Clear lockout, rate limits, and OTP state for a single enrolleeId.
 * Used to unblock a tester (or a real customer after an outage) without
 * waiting for the sliding windows to expire.
 */
export async function resetMemberAction(
  _prev: ResetMemberState,
  formData: FormData,
): Promise<ResetMemberState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: "Not signed in." };

  const parsed = enrolleeIdSchema.safeParse(formData.get("enrolleeId"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid ID." };
  }
  await adminResetMember(parsed.data, admin.id);
  revalidatePath("/admin/unlock");
  return { status: "ok", enrolleeId: parsed.data };
}
