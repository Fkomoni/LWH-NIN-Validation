"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authStartSchema, principalNinSchema } from "@/schemas/auth";
import { getServices } from "@/services";
import { setSession } from "@/server/session";
import { audit } from "@/server/audit";
import { traceId } from "@/lib/ids";
import { rateLimit } from "@/server/rateLimit";
import { isLocked, recordFail, clearFailures } from "@/server/lockout";
import { notifyLockout } from "@/server/notify";

export type AuthStartState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "dob-mismatch"; enrolleeId: string }
  | { status: "locked" }
  | { status: "rate-limited" };

async function ipAndUa(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  return {
    ip: h.get("x-client-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0",
    ua: h.get("user-agent") ?? "",
  };
}

function fieldErrorsFrom(
  issues: Array<{ path: (string | number)[]; message: string }>,
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const issue of issues) {
    const k = issue.path[0];
    if (typeof k === "string" && !errs[k]) errs[k] = issue.message;
  }
  return errs;
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
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const tid = traceId();
  const { ip, ua } = await ipAndUa();

  const ipLimit = await rateLimit.authIp(ip);
  if (!ipLimit.ok) {
    await audit({ action: "auth.ratelimit.ip", actorType: "system", traceId: tid, ip });
    return { status: "rate-limited" };
  }

  if (await isLocked(parsed.data.enrolleeId)) {
    return { status: "locked" };
  }

  const svc = getServices();
  const result = await svc.member.authenticateByDob({ ...parsed.data, ip, userAgent: ua });

  if (!result.ok && (result.reason === "DOB_MISMATCH" || result.reason === "NOT_FOUND")) {
    const outcome = await recordFail({ enrolleeId: parsed.data.enrolleeId, channel: "DOB", ip, userAgent: ua });
    await audit({
      action: `auth.dob.${result.reason === "NOT_FOUND" ? "not_found" : "mismatch"}`,
      actorType: "portal-user",
      actorId: parsed.data.enrolleeId,
      traceId: tid,
      ip,
    });
    if (outcome.locked) {
      await notifyLockout({
        enrolleeId: parsed.data.enrolleeId,
        channel: "DOB",
        attempts: outcome.attemptsInWindow,
        ip,
        userAgent: ua,
      });
      return { status: "locked" };
    }
    return { status: "dob-mismatch", enrolleeId: parsed.data.enrolleeId };
  }

  if (!result.ok && result.reason === "LOCKED") return { status: "locked" };
  if (!result.ok) {
    return {
      status: "error",
      message: "We couldn't reach our records. Please try again in a minute.",
    };
  }

  await clearFailures(parsed.data.enrolleeId);
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
  | { status: "locked" }
  | { status: "rate-limited" };

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
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const tid = traceId();
  const { ip, ua } = await ipAndUa();

  const ipLimit = await rateLimit.authIp(ip);
  if (!ipLimit.ok) return { status: "rate-limited" };

  if (await isLocked(parsed.data.enrolleeId)) return { status: "locked" };

  const svc = getServices();
  const res = await svc.member.authenticateByPrincipalNin({ ...parsed.data, ip, userAgent: ua });

  if (!res.ok) {
    const outcome = await recordFail({
      enrolleeId: parsed.data.enrolleeId,
      channel: "PRINCIPAL_NIN",
      ip,
      userAgent: ua,
    });
    await audit({
      action: "auth.principalNin.fail",
      actorType: "portal-user",
      actorId: parsed.data.enrolleeId,
      traceId: tid,
      ip,
    });
    if (outcome.locked) {
      await notifyLockout({
        enrolleeId: parsed.data.enrolleeId,
        channel: "PRINCIPAL_NIN",
        attempts: outcome.attemptsInWindow,
        ip,
        userAgent: ua,
      });
      return { status: "locked" };
    }
    return { status: "fail" };
  }

  await clearFailures(parsed.data.enrolleeId);
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
