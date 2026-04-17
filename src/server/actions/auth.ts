"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authStartSchema, principalNinSchema } from "@/schemas/auth";
import { getServices } from "@/services";
import { setSession } from "@/server/session";
import { audit } from "@/server/audit";
import { traceId } from "@/lib/ids";

export type AuthStartState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "dob-mismatch"; enrolleeId: string }
  | { status: "locked" };

async function ipAndUa(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0",
    ua: h.get("user-agent") ?? "",
  };
}

export async function authStart(
  _prev: AuthStartState,
  formData: FormData,
): Promise<AuthStartState> {
  const parsed = authStartSchema.safeParse({
    enrolleeId: formData.get("enrolleeId"),
    dob: formData.get("dob"),
    consent: formData.get("consent") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (typeof k === "string" && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }

  const tid = traceId();
  const { ip, ua } = await ipAndUa();
  const svc = getServices();
  const result = await svc.member.authenticateByDob({ ...parsed.data, ip, userAgent: ua });

  if (!result.ok && result.reason === "LOCKED") {
    await audit({
      action: "auth.locked",
      actorType: "portal-user",
      actorId: parsed.data.enrolleeId,
      traceId: tid,
      ip,
      userAgent: ua,
    });
    return { status: "locked" };
  }
  if (!result.ok && result.reason === "NOT_FOUND") {
    await audit({
      action: "auth.dob.not_found",
      actorType: "portal-user",
      actorId: parsed.data.enrolleeId,
      traceId: tid,
      ip,
    });
    // Non-revealing error — same UX as DOB mismatch.
    return { status: "dob-mismatch", enrolleeId: parsed.data.enrolleeId };
  }
  if (!result.ok && result.reason === "DOB_MISMATCH") {
    await audit({
      action: "auth.dob.mismatch",
      actorType: "portal-user",
      actorId: parsed.data.enrolleeId,
      traceId: tid,
      ip,
    });
    return { status: "dob-mismatch", enrolleeId: parsed.data.enrolleeId };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: "We couldn't reach our records. Please try again in a minute.",
    };
  }

  await setSession({
    enrolleeId: parsed.data.enrolleeId,
    authedAt: new Date().toISOString(),
    channel: "DOB",
    mocked: true,
  });
  await audit({
    action: "auth.dob.success",
    actorType: "portal-user",
    actorId: parsed.data.enrolleeId,
    traceId: tid,
    ip,
  });
  redirect("/household");
}

export type PrincipalNinState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "fail" }
  | { status: "locked" };

export async function authByPrincipalNin(
  _prev: PrincipalNinState,
  formData: FormData,
): Promise<PrincipalNinState> {
  const parsed = principalNinSchema.safeParse({
    enrolleeId: formData.get("enrolleeId"),
    nin: formData.get("nin"),
    dob: formData.get("dob"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (typeof k === "string" && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }

  const tid = traceId();
  const { ip, ua } = await ipAndUa();
  const svc = getServices();
  const res = await svc.member.authenticateByPrincipalNin({ ...parsed.data, ip, userAgent: ua });

  if (!res.ok && res.reason === "LOCKED") return { status: "locked" };
  if (!res.ok) {
    await audit({
      action: "auth.principalNin.fail",
      actorType: "portal-user",
      actorId: parsed.data.enrolleeId,
      traceId: tid,
      ip,
    });
    return { status: "fail" };
  }

  await setSession({
    enrolleeId: parsed.data.enrolleeId,
    authedAt: new Date().toISOString(),
    channel: "PRINCIPAL_NIN",
    mocked: true,
  });
  await audit({
    action: "auth.principalNin.success",
    actorType: "portal-user",
    actorId: parsed.data.enrolleeId,
    traceId: tid,
    ip,
  });
  redirect("/household");
}
