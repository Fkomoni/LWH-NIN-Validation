"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { authStartSchema, authStartPhoneSchema, principalNinSchema } from "@/schemas/auth";
import type { MemberLookupResult } from "@/services/types";
import { getServices } from "@/services";
import type { PrognosisUpdatePayload } from "@/services/types";
import { setSession } from "@/server/session";
import { audit } from "@/server/audit";
import { traceId, txnRef } from "@/lib/ids";
import { rateLimit } from "@/server/rateLimit";
import {
  isLocked,
  recordFail,
  clearFailures,
  clearLockout,
  getLockExpiry,
  isIpSoftLocked,
  recordIpFail,
} from "@/server/lockout";
import { notifyLockout } from "@/server/notify";
import { enqueuePrognosis } from "@/server/outbox";
import { notifyNinValidated } from "@/server/notify";
import { updateEnrolleeDob } from "@/services/http/PrognosisMemberClient";
import { appConfig } from "@/config/app";
import { composeDobMismatchMessage } from "@/lib/displayName";

export type AuthStartState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | {
      status: "dob-mismatch";
      /** Undefined when the member was looked up by phone and the enrolleeId
       *  could not be resolved (edge case). The verify link is hidden then. */
      enrolleeId?: string;
      /** Fully-formed "Enrollee with Firxxx Surxxx … does not match our
       *  records." — composed server-side with a masked name + the
       *  DOB the user typed formatted dd/mm/yyyy. */
      message: string;
      /** How many more attempts before the 48-hour lockout fires. */
      attemptsRemaining: number;
    }
  /** `expiresAt` is a millisecond epoch the client uses to render a
   *  live countdown of hours/minutes remaining. */
  | { status: "locked"; expiresAt: number }
  | { status: "rate-limited" };

async function ipAndUa(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  // Always prefer the IP our middleware already resolved (trusted
  // source, see F-07). Do NOT fall back to first-hop XFF here.
  return {
    ip: h.get("x-client-ip") ?? "0.0.0.0",
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
  const tid = traceId();
  const { ip, ua } = await ipAndUa();

  // F2 gate: if this IP is soft-locked from too many recent failures
  // across any enrollees, short-circuit before doing any work. Returned
  // as the generic rate-limited state so the UI stays uniform.
  if (await isIpSoftLocked(ip)) {
    await audit({ action: "auth.iplock.block", actorType: "system", traceId: tid, ip });
    return { status: "rate-limited" };
  }

  const loginMethod = formData.get("loginMethod") === "phone" ? "phone" : "enrolleeId";
  const consentOn = formData.get("consent") === "on";

  // Parse with the appropriate schema based on which method the user chose.
  let enrolleeId: string;
  let dob: string;
  let result: MemberLookupResult;

  const svc = getServices();

  if (loginMethod === "phone") {
    const parsed = authStartPhoneSchema.safeParse({
      phone: formData.get("phone"),
      dob: formData.get("dob"),
      consent: consentOn,
    });
    if (!parsed.success) {
      await recordIpFail(ip);
      return {
        status: "error",
        message: "Please check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error.issues),
      };
    }

    const ipLimit = await rateLimit.authIp(ip);
    if (!ipLimit.ok) {
      await audit({ action: "auth.ratelimit.ip", actorType: "system", traceId: tid, ip });
      return { status: "rate-limited" };
    }

    dob = parsed.data.dob;
    result = await svc.member.authenticateByPhone({ phone: parsed.data.phone, dob, ip, userAgent: ua });
    // enrolleeId resolved from the phone lookup result (available on mismatch/locked).
    enrolleeId =
      result.ok
        ? result.household.principal.enrolleeId
        : (result.reason === "DOB_MISMATCH" || result.reason === "LOCKED")
          ? (result.resolvedEnrolleeId ?? "")
          : "";
  } else {
    const parsed = authStartSchema.safeParse({
      enrolleeId: formData.get("enrolleeId"),
      dob: formData.get("dob"),
      consent: consentOn,
    });
    if (!parsed.success) {
      await recordIpFail(ip);
      return {
        status: "error",
        message: "Please check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error.issues),
      };
    }

    const ipLimit = await rateLimit.authIp(ip);
    if (!ipLimit.ok) {
      await audit({ action: "auth.ratelimit.ip", actorType: "system", traceId: tid, ip });
      return { status: "rate-limited" };
    }

    enrolleeId = parsed.data.enrolleeId;
    dob = parsed.data.dob;

    if (await isLocked(enrolleeId)) {
      const expiresAt = (await getLockExpiry(enrolleeId)) ?? Date.now();
      return { status: "locked", expiresAt };
    }

    result = await svc.member.authenticateByDob({ enrolleeId, dob, ip, userAgent: ua });
  }

  if (!result.ok && (result.reason === "DOB_MISMATCH" || result.reason === "NOT_FOUND")) {
    const lockoutEnrolleeId = enrolleeId || "unknown";
    const outcome = await recordFail({ enrolleeId: lockoutEnrolleeId, channel: "DOB", ip, userAgent: ua });
    await recordIpFail(ip);
    await audit({
      action: `auth.dob.${result.reason === "NOT_FOUND" ? "not_found" : "mismatch"}`,
      actorType: "portal-user",
      actorId: lockoutEnrolleeId,
      traceId: tid,
      ip,
    });
    if (outcome.locked) {
      await notifyLockout({
        enrolleeId: lockoutEnrolleeId,
        channel: "DOB",
        attempts: outcome.attemptsInWindow,
        ip,
        userAgent: ua,
      });
      const expiresAt =
        outcome.expiresAt ?? (await getLockExpiry(lockoutEnrolleeId)) ?? Date.now();
      return { status: "locked", expiresAt };
    }
    // After 2 wrong DOB attempts, stop asking for DOB and route the
    // member to the NIN verification path automatically. They retain
    // 1 attempt there before the full hard-lock fires.
    if (outcome.attemptsInWindow >= 2 && enrolleeId) {
      redirect(`/verify?enrolleeId=${encodeURIComponent(enrolleeId)}`);
    }
    const fullName = result.reason === "DOB_MISMATCH" ? result.memberFullName : undefined;
    const attemptsRemaining = Math.max(
      0,
      appConfig.lockout.maxFailuresPerWindow - outcome.attemptsInWindow,
    );
    return {
      status: "dob-mismatch",
      enrolleeId: enrolleeId || undefined,
      message: composeDobMismatchMessage(fullName, dob),
      attemptsRemaining,
    };
  }

  if (!result.ok && result.reason === "LOCKED") {
    const expiresAt = (await getLockExpiry(enrolleeId)) ?? Date.now();
    return { status: "locked", expiresAt };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: "We couldn't reach our records. Please try again in a minute.",
    };
  }

  await clearFailures(enrolleeId);
  {
    const now = new Date().toISOString();
    await setSession({
      enrolleeId,
      authedAt: now,
      lastSeenAt: now,
      channel: loginMethod === "phone" ? "PHONE" : "DOB",
      mocked: appConfig.mocksEnabled,
    });
  }
  await audit({
    action: loginMethod === "phone" ? "auth.phone.success" : "auth.dob.success",
    actorType: "portal-user",
    actorId: enrolleeId,
    traceId: tid,
    ip,
  });
  redirect("/household");
}

export type PrincipalNinState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "fail"; message?: string; attemptsRemaining: number }
  | { status: "locked"; expiresAt: number }
  | { status: "rate-limited" };

/**
 * Validate-with-NIN fallback.
 *
 * Called from the /verify page when the user's DOB didn't match their
 * Prognosis record. We:
 *   1. Load the principal's bio from Prognosis (for the expected name).
 *   2. Call NIMC (Qore) with the supplied NIN + name.
 *   3. Compare NIMC's DOB against the USER's entered DOB (not
 *      Prognosis's — that's the field in question).
 *   4. If both DOB matches and name is close enough → authenticate.
 *   5. Fire the principal's NIN into Prognosis in the background (the
 *      household page will show the dependants for per-row update).
 */
export async function authByPrincipalNin(
  _prev: PrincipalNinState,
  formData: FormData,
): Promise<PrincipalNinState> {
  const tid = traceId();
  const { ip, ua } = await ipAndUa();

  if (await isIpSoftLocked(ip)) {
    await audit({ action: "auth.iplock.block", actorType: "system", traceId: tid, ip });
    return { status: "rate-limited" };
  }

  const parsed = principalNinSchema.safeParse({
    enrolleeId: formData.get("enrolleeId"),
    nin: formData.get("nin"),
    dob: formData.get("dob"),
  });
  if (!parsed.success) {
    await recordIpFail(ip);
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const ipLimit = await rateLimit.authIp(ip);
  if (!ipLimit.ok) return { status: "rate-limited" };

  // Intentionally NO isLocked() pre-check here. This path is the
  // recovery route: a member who has locked themselves out by
  // mistyping their DOB can still prove identity by submitting a NIN
  // whose NIMC record agrees with our Prognosis record. Success
  // clears the lock (see clearLockout below).

  const svc = getServices();

  // 1. Load the principal's bio for name + Prognosis DOB.
  let household;
  try {
    household = await svc.member.loadHousehold(parsed.data.enrolleeId);
  } catch {
    return {
      status: "error",
      message: "We couldn't reach our records. Please try again in a minute.",
    };
  }
  const principal = household.principal;

  // 2. Verify the NIN. Identity proof = NIMC DOB == Prognosis DOB.
  const verify = await svc.nin.verifyForAuth({
    nin: parsed.data.nin,
    providedDob: parsed.data.dob,
    expectedFullName: principal.fullName,
    expectedDob: principal.dob,
    traceId: tid,
  });

  if (!verify.match) {
    const outcome = await recordFail({
      enrolleeId: parsed.data.enrolleeId,
      channel: "PRINCIPAL_NIN",
      ip,
      userAgent: ua,
    });
    await recordIpFail(ip);
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
      const expiresAt =
        outcome.expiresAt ?? (await getLockExpiry(parsed.data.enrolleeId)) ?? Date.now();
      return { status: "locked", expiresAt };
    }
    const attemptsRemaining = Math.max(
      0,
      appConfig.lockout.maxFailuresPerWindow - outcome.attemptsInWindow,
    );
    return { status: "fail", message: verify.message, attemptsRemaining };
  }

  // Successful NIN+Prognosis-DOB match proves identity; wipe any
  // active hard lock and failure history so a locked-out member is
  // unstuck by the fallback path.
  await clearLockout(parsed.data.enrolleeId);
  {
    const now = new Date().toISOString();
    await setSession({
      enrolleeId: parsed.data.enrolleeId,
      authedAt: now,
      lastSeenAt: now,
      channel: "PRINCIPAL_NIN",
      mocked: appConfig.mocksEnabled,
    });
  }

  // 5. Fire the Prognosis write for the principal's NIN. Uses the same
  //    outbox + after() pattern as per-row submissions so the response
  //    to the user returns immediately and the write runs in background.
  if (verify.verifiedFullName && verify.dobFromNin) {
    const payload: PrognosisUpdatePayload = {
      memberId: principal.id,
      nin: parsed.data.nin,
      verifiedFullName: verify.verifiedFullName,
      dobFromNin: verify.dobFromNin,
      validationStatus: "VALIDATED",
      validatedAt: new Date().toISOString(),
      source: "self-service-portal",
      txnRef: txnRef(),
    };
    await enqueuePrognosis(payload);
    after(async () => {
      // Write the NIN to Prognosis.
      try {
        const write = await svc.prognosis.upsertMemberNin(payload);
        await audit({
          action: `prognosis.upsert.${write.ok ? "ok" : "fail"}`,
          actorType: "system",
          memberId: principal.id,
          traceId: tid,
          payload: { txnRef: payload.txnRef },
        });
        if (write.ok) {
          await notifyNinValidated({
            principalEnrolleeId: parsed.data.enrolleeId,
            beneficiaryName: verify.verifiedFullName ?? principal.fullName,
          }).catch(() => undefined);
        }
      } catch {
        /* outbox drain will retry */
      }

      // Update the member's DOB on Prognosis to the NIMC-verified value.
      // This corrects a stored DOB that was wrong (the reason they failed
      // the DOB path and ended up here via NIN verification).
      if (verify.dobFromNin) {
        try {
          const dobResult = await updateEnrolleeDob(principal.id, verify.dobFromNin);
          await audit({
            action: `prognosis.dob.update.${dobResult.ok ? "ok" : "fail"}`,
            actorType: "system",
            memberId: principal.id,
            traceId: tid,
          });
        } catch {
          /* non-fatal — member is authenticated; DOB correction can be retried */
        }
      }
    });
  }

  await audit({
    action: "auth.principalNin.success",
    actorType: "portal-user",
    actorId: parsed.data.enrolleeId,
    traceId: tid,
    ip,
  });
  redirect("/household");
}
