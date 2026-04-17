"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { otpRequestSchema, otpVerifySchema } from "@/schemas/otp";
import { getServices } from "@/services";
import { setSession } from "@/server/session";
import { audit } from "@/server/audit";
import { traceId } from "@/lib/ids";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}

export type OtpRequestState =
  | { status: "idle" }
  | { status: "sent"; channelHint: string; cooldownMs: number }
  | { status: "no-phone" }
  | { status: "rate-limited" }
  | { status: "locked" }
  | { status: "error"; message: string };

export async function otpRequest(
  _prev: OtpRequestState,
  formData: FormData,
): Promise<OtpRequestState> {
  const parsed = otpRequestSchema.safeParse({ enrolleeId: formData.get("enrolleeId") });
  if (!parsed.success) {
    return { status: "error", message: "Missing Enrollee ID." };
  }
  const ip = await clientIp();
  const svc = getServices();
  const res = await svc.otp.request({ enrolleeId: parsed.data.enrolleeId, ip });
  await audit({
    action: `otp.request.${res.ok ? "sent" : res.reason.toLowerCase()}`,
    actorType: "portal-user",
    actorId: parsed.data.enrolleeId,
    traceId: traceId(),
    ip,
  });
  if (res.ok) return { status: "sent", channelHint: res.channelHint, cooldownMs: res.cooldownMs };
  if (res.reason === "NO_PHONE_ON_FILE") return { status: "no-phone" };
  if (res.reason === "RATE_LIMITED") return { status: "rate-limited" };
  if (res.reason === "LOCKED") return { status: "locked" };
  return { status: "error", message: "Something went wrong. Please try again." };
}

export type OtpVerifyState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "locked" };

export async function otpVerify(
  _prev: OtpVerifyState,
  formData: FormData,
): Promise<OtpVerifyState> {
  const parsed = otpVerifySchema.safeParse({
    enrolleeId: formData.get("enrolleeId"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const ip = await clientIp();
  const svc = getServices();
  const res = await svc.otp.verify({ ...parsed.data, ip });
  if (res.ok) {
    await setSession({
      enrolleeId: parsed.data.enrolleeId,
      authedAt: new Date().toISOString(),
      channel: "OTP",
      mocked: true,
    });
    await audit({
      action: "otp.verify.success",
      actorType: "portal-user",
      actorId: parsed.data.enrolleeId,
      traceId: traceId(),
      ip,
    });
    redirect("/household");
  }
  await audit({
    action: `otp.verify.${res.reason.toLowerCase()}`,
    actorType: "portal-user",
    actorId: parsed.data.enrolleeId,
    traceId: traceId(),
    ip,
  });
  if (res.reason === "INVALID") return { status: "invalid" };
  if (res.reason === "EXPIRED") return { status: "expired" };
  if (res.reason === "LOCKED") return { status: "locked" };
  return { status: "error", message: "We couldn't verify that code." };
}
