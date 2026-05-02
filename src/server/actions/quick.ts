"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { quickStartSchema, quickOtpSchema, quickNinSchema, quickDobSchema } from "@/schemas/quick";
import {
  getAllEnrolleesByPhone,
  updateEnrolleeDob,
} from "@/services/http/PrognosisMemberClient";
import { qoreVerifyNin, type QoreVerifyResponse } from "@/services/http/QoreIdClient";
import { getServices } from "@/services";
import { getQuickState, setQuickState, clearQuickState } from "@/server/quickSession";
import {
  markLeadStarted,
  markOtpVerified,
  markNinAttempted,
  markLeadCompleted,
} from "@/server/leads";
import { requestPhoneOtp, verifyPhoneOtp } from "@/server/phoneOtp";
import { audit } from "@/server/audit";
import { traceId, txnRef } from "@/lib/ids";
import { maskNin } from "@/lib/mask";
import { rateLimit } from "@/server/rateLimit";
import { isIpSoftLocked, recordIpFail } from "@/server/lockout";
import { getKv } from "@/server/kv";
import { recordNinSuccess, recordDobUpdateSuccess } from "@/server/stats";
import { setSession } from "@/server/session";
import { appConfig } from "@/config/app";
import { scoreNameMatch } from "@/lib/validation/scoreName";
import { dobMatches } from "@/lib/validation/dob";
import { splitFullName } from "@/lib/nameSplit";
import { notifyNinValidated } from "@/server/notify";
import { log } from "@/lib/logger";
import type { PrognosisMember } from "@/services/http/PrognosisMemberClient";

/**
 * Server actions for the phone-first quick-update funnel.
 *
 * Spec recap (MD brief, May 2026):
 *   1. Member enters their phone number — committed to KV before
 *      anything else happens, so we can follow up on drop-offs.
 *   2. OTP confirms ownership of the phone.
 *   3. Member enters NIN; we compare NIMC's name against the surname
 *      on the Leadway record. Match → save the NIN (and auto-correct
 *      DOB to NIMC's DOB) and thank them.
 *   4. No name match → ask for DOB as a fallback identity check.
 *   5. Phone tied to multiple Leadway profiles → present them all and
 *      let the member pick which to update.
 *
 * Flows that require an authenticated household session
 * (e.g. dependant updates) live in actions/nin.ts and use the existing
 * `requireSession()` gate. After this funnel completes, we mint a
 * regular session cookie for the principal so a "Yes, update a family
 * member" pivot works without re-authentication.
 */

type FieldErrors = Record<string, string>;

function fieldErrorsFrom(
  issues: Array<{ path: (string | number)[]; message: string }>,
): FieldErrors {
  const errs: FieldErrors = {};
  for (const issue of issues) {
    const k = issue.path[0];
    if (typeof k === "string" && !errs[k]) errs[k] = issue.message;
  }
  return errs;
}

async function ipAndUa(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  return {
    ip: h.get("x-client-ip") ?? "0.0.0.0",
    ua: h.get("user-agent") ?? "",
  };
}

function phoneHash(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 12);
}

function nimcCacheKey(phone: string, nin: string): string {
  return `quick:nimc:${phone}:${nin}`;
}

const NIMC_CACHE_TTL_MS = 30 * 60 * 1000;

/* ── 1. Quick start — phone capture ─────────────────────────────────── */

export type QuickStartState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "rate-limited" }
  | { status: "no-match"; message: string };

export async function quickStart(
  _prev: QuickStartState,
  formData: FormData,
): Promise<QuickStartState> {
  const tid = traceId();
  const { ip } = await ipAndUa();

  if (await isIpSoftLocked(ip)) {
    await audit({ action: "quick.iplock.block", actorType: "system", traceId: tid, ip });
    return { status: "rate-limited" };
  }

  const parsed = quickStartSchema.safeParse({
    phone: formData.get("phone"),
    consent: formData.get("consent") === "on",
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
    await audit({ action: "quick.ratelimit.ip", actorType: "system", traceId: tid, ip });
    return { status: "rate-limited" };
  }

  const phone = parsed.data.phone;

  // Look up Prognosis profiles BEFORE marking the lead, so the lead
  // record can carry the resolved enrollee IDs for follow-up. Network
  // errors are non-fatal at this stage — we still want to capture the
  // phone (per the MD's "commit immediately" note) so support can reach
  // out. If lookup fails, profiles will be re-resolved at the next step.
  let profiles: PrognosisMember[] = [];
  try {
    profiles = await getAllEnrolleesByPhone(phone);
  } catch (err) {
    log.warn({ err: String(err) }, "quick.start.lookup-fail");
  }

  await markLeadStarted(
    phone,
    profiles.map((p) => p.enrolleeId),
  );

  await audit({
    action: "quick.lead.started",
    actorType: "portal-user",
    traceId: tid,
    ip,
    payload: { phoneHash: phoneHash(phone), profilesFound: profiles.length },
  });

  if (profiles.length === 0) {
    return {
      status: "no-match",
      message:
        "We couldn't find any Leadway plan tied to that phone number. Please double-check, or try signing in with your Enrollee ID instead.",
    };
  }

  // Per-phone OTP rate limit (5/hr). The phone is identified by hash
  // here so the key doesn't expose the raw number in Redis.
  const otpLimit = await rateLimit.otpPhone(phoneHash(phone));
  if (!otpLimit.ok) return { status: "rate-limited" };

  const sent = await requestPhoneOtp(phone);
  if (!sent.ok) {
    if (sent.reason === "RATE_LIMITED") return { status: "rate-limited" };
    return {
      status: "error",
      message: "We couldn't send the SMS code right now. Please try again in a minute.",
    };
  }

  await setQuickState({
    phone,
    step: "OTP",
    enrolleeIds: profiles.map((p) => p.enrolleeId),
    otpSentAt: Date.now(),
  });
  redirect("/quick/verify");
}

/* ── 2. OTP verify ──────────────────────────────────────────────────── */

export type QuickOtpState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "expired" }
  | { status: "exhausted" };

export async function quickVerifyOtp(
  _prev: QuickOtpState,
  formData: FormData,
): Promise<QuickOtpState> {
  const tid = traceId();
  const state = await getQuickState();
  if (!state || (state.step !== "OTP" && state.step !== "PROFILE_PICK")) {
    redirect("/quick");
  }

  const parsed = quickOtpSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the code.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const result = await verifyPhoneOtp(state.phone, parsed.data.code);
  if (!result.ok) {
    if (result.reason === "EXPIRED") return { status: "expired" };
    if (result.reason === "EXHAUSTED") return { status: "exhausted" };
    return { status: "error", message: "That code doesn't match. Please try again." };
  }

  await markOtpVerified(state.phone);
  await audit({
    action: "quick.otp.verified",
    actorType: "portal-user",
    traceId: tid,
    payload: { phoneHash: phoneHash(state.phone) },
  });

  if (state.enrolleeIds.length > 1) {
    await setQuickState({ ...state, step: "PROFILE_PICK" });
    redirect("/quick/profiles");
  }
  await setQuickState({
    ...state,
    step: "NIN",
    selectedEnrolleeIds: state.enrolleeIds,
  });
  redirect("/quick/nin");
}

/* ── 3. Profile picker (multi-profile case) ─────────────────────────── */

export type QuickPickState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function quickPickProfiles(
  _prev: QuickPickState,
  formData: FormData,
): Promise<QuickPickState> {
  const state = await getQuickState();
  if (!state || state.step !== "PROFILE_PICK") redirect("/quick");

  const picked = formData.getAll("enrolleeId").map(String).filter(Boolean);
  if (picked.length === 0) {
    return { status: "error", message: "Please pick at least one profile to update." };
  }
  const allowed = new Set(state.enrolleeIds);
  const valid = picked.filter((id) => allowed.has(id));
  if (valid.length === 0) {
    return { status: "error", message: "We couldn't match those profiles. Please try again." };
  }

  await setQuickState({ ...state, step: "NIN", selectedEnrolleeIds: valid });
  redirect("/quick/nin");
}

/* ── 4. Submit NIN — name-match or DOB fallback ─────────────────────── */

export type QuickNinState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "provider-error"; message: string }
  | { status: "rate-limited" };

interface MatchedProfile {
  enrolleeId: string;
  fullName: string;
  dob?: string;
  memberId: string;
  relationship?: string;
  score: number;
}

const NAME_MATCH_THRESHOLD = 0.7;

export async function quickSubmitNin(
  _prev: QuickNinState,
  formData: FormData,
): Promise<QuickNinState> {
  const tid = traceId();
  const { ip } = await ipAndUa();
  const state = await getQuickState();
  if (!state || state.step !== "NIN") redirect("/quick");

  const parsed = quickNinSchema.safeParse({
    nin: formData.get("nin"),
    selectedIds: formData.getAll("selectedIds").map(String),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const selectedEnrolleeIds =
    state.selectedEnrolleeIds && state.selectedEnrolleeIds.length > 0
      ? state.selectedEnrolleeIds
      : state.enrolleeIds;

  // Per-phone NIN rate-limit (reuses the existing OTP-phone window —
  // this funnel does not have an enrolleeId yet to apply the
  // per-enrollee NIN window to).
  const ipLimit = await rateLimit.authIp(ip);
  if (!ipLimit.ok) return { status: "rate-limited" };

  // Reload profiles so we have the canonical name + DOB for each
  // selected enrollee. This is one network call but it ensures we
  // never write stale data from the funnel cookie.
  let profiles: PrognosisMember[];
  try {
    profiles = await getAllEnrolleesByPhone(state.phone);
  } catch {
    return {
      status: "provider-error",
      message: "We couldn't reach our records right now. Please try again in a minute.",
    };
  }
  const selected = profiles.filter((p) => selectedEnrolleeIds.includes(p.enrolleeId));
  if (selected.length === 0) {
    return {
      status: "error",
      message: "Your selected profiles couldn't be found. Please start again.",
    };
  }

  // Pick a representative profile to feed first/last name into Qore.
  // Qore expects names that match the NIN holder; we use the highest-
  // confidence match among the selected profiles after the call.
  const rep = selected[0]!;
  const { firstname, lastname } = splitFullName(rep.fullName);

  const call = await qoreVerifyNin({
    nin: parsed.data.nin,
    firstname,
    lastname,
    traceId: tid,
  });
  if (!call.ok) {
    return {
      status: "provider-error",
      message: "NIMC is temporarily unavailable. Please try again in a moment.",
    };
  }
  if (call.data.status === "NOT_FOUND") {
    await markNinAttempted(state.phone, "FAILED");
    await audit({
      action: "quick.nin.not_found",
      actorType: "portal-user",
      traceId: tid,
      ip,
      payload: { phoneHash: phoneHash(state.phone), nin: maskNin(parsed.data.nin) },
    });
    return {
      status: "provider-error",
      message:
        "We couldn't verify this NIN with NIMC. Please double-check the number, or contact Leadway Support.",
    };
  }

  // Cache the NIMC response so the DOB fallback step (if needed) can
  // reuse it without spending another NIMC call.
  await getKv().set(nimcCacheKey(state.phone, parsed.data.nin), call.data, {
    ttlMs: NIMC_CACHE_TTL_MS,
  });

  // Score the NIMC name against every selected profile. The best
  // score among them decides whether we accept on names alone.
  const matches: MatchedProfile[] = selected.map((p) => ({
    enrolleeId: p.enrolleeId,
    fullName: p.fullName,
    dob: p.dob,
    memberId: p.enrolleeId,
    relationship: p.relationship,
    score: scoreNameMatch(p.fullName, call.data.fullName ?? "").score,
  }));
  const best = matches.reduce((a, b) => (a.score >= b.score ? a : b));

  log.info(
    {
      phoneHash: phoneHash(state.phone),
      profiles: matches.length,
      bestScore: best.score,
    },
    "quick.nin.compare",
  );

  if (best.score >= NAME_MATCH_THRESHOLD) {
    // Happy path — names align. Save NIN + DOB-correct each selected
    // profile in the background, mark lead complete, and route to the
    // thank-you page.
    await markNinAttempted(state.phone, "VALIDATED");
    await persistMatches(matches, parsed.data.nin, call.data, tid);
    await markLeadCompleted(
      state.phone,
      matches.map((m) => m.enrolleeId),
    );
    await audit({
      action: "quick.nin.success",
      actorType: "portal-user",
      traceId: tid,
      ip,
      payload: {
        phoneHash: phoneHash(state.phone),
        nin: maskNin(parsed.data.nin),
        score: best.score,
        profiles: matches.length,
      },
    });
    // Mint a household session for the BEST-matched profile so the
    // member can pivot into "update a family member" without OTP-ing
    // again. The funnel cookie is cleared inside the pivot action.
    {
      const now = new Date().toISOString();
      await setSession({
        enrolleeId: best.enrolleeId,
        authedAt: now,
        lastSeenAt: now,
        channel: "PHONE",
        mocked: appConfig.mocksEnabled,
      });
    }
    await setQuickState({
      ...state,
      step: "DONE",
      nin: undefined,
      selectedEnrolleeIds: matches.map((m) => m.enrolleeId),
    });
    redirect("/quick/done");
  }

  // Name mismatch — drop into DOB fallback. The NIN is held in the
  // funnel cookie so the next step can re-use it without another NIMC
  // round trip (we cached the response above).
  await markNinAttempted(state.phone, "NEEDS_DOB_FALLBACK");
  await setQuickState({
    ...state,
    step: "DOB_FALLBACK",
    nin: parsed.data.nin,
    selectedEnrolleeIds: selectedEnrolleeIds,
  });
  redirect("/quick/dob");
}

/* ── 5. DOB fallback ─────────────────────────────────────────────────── */

export type QuickDobState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "no-match"; message: string };

export async function quickConfirmDob(
  _prev: QuickDobState,
  formData: FormData,
): Promise<QuickDobState> {
  const tid = traceId();
  const { ip } = await ipAndUa();
  const state = await getQuickState();
  if (!state || state.step !== "DOB_FALLBACK" || !state.nin) redirect("/quick");

  const parsed = quickDobSchema.safeParse({ dob: formData.get("dob") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the date.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const cached = await getKv().get<QoreVerifyResponse>(
    nimcCacheKey(state.phone, state.nin),
  );
  if (!cached || !cached.dob) {
    // Cache expired — bounce back to NIN entry to re-run NIMC. Rare in
    // practice (the cache TTL is 30 min and the form should be
    // submitted within a few minutes).
    redirect("/quick/nin");
  }

  if (!dobMatches(parsed.data.dob, cached.dob)) {
    await audit({
      action: "quick.dob.mismatch",
      actorType: "portal-user",
      traceId: tid,
      ip,
      payload: { phoneHash: phoneHash(state.phone) },
    });
    return {
      status: "no-match",
      message:
        "We still couldn't match your details to the NIN. Please contact Leadway Support so we can help you manually.",
    };
  }

  // DOB confirmed — proceed exactly like the happy path.
  let profiles: PrognosisMember[] = [];
  try {
    profiles = await getAllEnrolleesByPhone(state.phone);
  } catch {
    /* fall through with empty array — won't save but won't crash either */
  }
  const selectedIds =
    state.selectedEnrolleeIds && state.selectedEnrolleeIds.length > 0
      ? state.selectedEnrolleeIds
      : state.enrolleeIds;
  const selected = profiles.filter((p) => selectedIds.includes(p.enrolleeId));

  const matches: MatchedProfile[] = selected.map((p) => ({
    enrolleeId: p.enrolleeId,
    fullName: p.fullName,
    dob: p.dob,
    memberId: p.enrolleeId,
    relationship: p.relationship,
    score: 0, // DOB-fallback path — name didn't match
  }));

  await markNinAttempted(state.phone, "VALIDATED");
  await persistMatches(matches, state.nin, cached, tid);
  await markLeadCompleted(state.phone, matches.map((m) => m.enrolleeId));
  await audit({
    action: "quick.dob.success",
    actorType: "portal-user",
    traceId: tid,
    ip,
    payload: { phoneHash: phoneHash(state.phone), profiles: matches.length },
  });

  if (matches.length > 0) {
    const now = new Date().toISOString();
    await setSession({
      enrolleeId: matches[0]!.enrolleeId,
      authedAt: now,
      lastSeenAt: now,
      channel: "PHONE",
      mocked: appConfig.mocksEnabled,
    });
  }
  await setQuickState({
    ...state,
    step: "DONE",
    nin: undefined,
  });
  redirect("/quick/done");
}

/* ── 6. Resend OTP ──────────────────────────────────────────────────── */

export async function quickResendOtp(): Promise<void> {
  const state = await getQuickState();
  if (!state) redirect("/quick");
  await requestPhoneOtp(state.phone);
  await setQuickState({ ...state, otpSentAt: Date.now() });
  redirect("/quick/verify");
}

/* ── 6b. OTP step → DOB fallback ────────────────────────────────────── */

/**
 * Allow a member to bypass the OTP step by proving identity with their
 * date of birth. Used when the SMS code never arrives — UI exposes this
 * after 2 minutes of waiting.
 */
export type QuickOtpDobState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "no-match"; message: string };

export async function quickOtpFallbackToDob(
  _prev: QuickOtpDobState,
  formData: FormData,
): Promise<QuickOtpDobState> {
  const tid = traceId();
  const { ip } = await ipAndUa();
  const state = await getQuickState();
  if (!state || (state.step !== "OTP" && state.step !== "PROFILE_PICK")) {
    redirect("/quick");
  }

  const parsed = quickDobSchema.safeParse({ dob: formData.get("dob") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please enter your date of birth.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  // Reload profiles so we compare DOB against the live Prognosis values.
  let profiles: PrognosisMember[];
  try {
    profiles = await getAllEnrolleesByPhone(state.phone);
  } catch {
    return {
      status: "error",
      message: "We couldn't reach our records. Please try again in a minute.",
    };
  }

  // Match if ANY of the resolved profiles' DOBs lines up with the
  // typed DOB. The phone may be on multiple plans — they all belong
  // to the same person in practice (different memberships, same DOB).
  const matched = profiles.some(
    (p) => p.dob && dobMatches(p.dob, parsed.data.dob),
  );
  if (!matched) {
    await audit({
      action: "quick.otp.dob.mismatch",
      actorType: "portal-user",
      traceId: tid,
      ip,
      payload: { phoneHash: phoneHash(state.phone) },
    });
    return {
      status: "no-match",
      message:
        "That date of birth doesn't match our records. Please double-check, or wait for the SMS code to expire and request a new one.",
    };
  }

  await markOtpVerified(state.phone);
  await audit({
    action: "quick.otp.dob.success",
    actorType: "portal-user",
    traceId: tid,
    ip,
    payload: { phoneHash: phoneHash(state.phone) },
  });

  if (state.enrolleeIds.length > 1) {
    await setQuickState({ ...state, step: "PROFILE_PICK" });
    redirect("/quick/profiles");
  }
  await setQuickState({
    ...state,
    step: "NIN",
    selectedEnrolleeIds: state.enrolleeIds,
  });
  redirect("/quick/nin");
}

/* ── 7. Pivot to dependants ─────────────────────────────────────────── */

export async function quickContinueToHousehold(): Promise<void> {
  const state = await getQuickState();
  if (!state || state.step !== "DONE") redirect("/quick");
  // The session cookie was minted at NIN-success time, so the
  // /household route will already authenticate. Drop the funnel cookie
  // and redirect.
  await clearQuickState();
  redirect("/household");
}

export async function quickEnd(): Promise<void> {
  await clearQuickState();
  redirect("/done");
}

/* ── Helpers ────────────────────────────────────────────────────────── */

async function persistMatches(
  matches: MatchedProfile[],
  nin: string,
  nimc: QoreVerifyResponse,
  tid: string,
): Promise<void> {
  if (matches.length === 0) return;
  const svc = getServices();
  const verifiedFullName = nimc.fullName ?? matches[0]!.fullName;
  const dobFromNin = nimc.dob;
  if (!dobFromNin) return; // NIMC didn't return a DOB — skip the writes; lead is still marked complete

  for (const m of matches) {
    const ref = txnRef();
    const payload = {
      memberId: m.memberId,
      nin,
      verifiedFullName,
      dobFromNin,
      validationStatus: "VALIDATED" as const,
      validatedAt: new Date().toISOString(),
      source: "self-service-portal" as const,
      txnRef: ref,
    };
    after(async () => {
      try {
        const write = await svc.prognosis.upsertMemberNin(payload);
        await audit({
          action: `prognosis.upsert.${write.ok ? "ok" : "fail"}`,
          actorType: "system",
          memberId: m.memberId,
          traceId: tid,
          payload: { txnRef: ref },
        });
        if (write.ok) {
          // The phone-first flow always lands the principal first
          // (Prognosis registers phone numbers against the policy
          // holder). Treat anything explicitly tagged as PRINCIPAL or
          // SELF as such; everything else as a dependant.
          const rel = (m.relationship ?? "").toLowerCase();
          const isPrincipal =
            rel.includes("principal") || rel.includes("self") || rel === "";
          await recordNinSuccess(isPrincipal ? "PRINCIPAL" : "DEPENDENT");
          await notifyNinValidated({
            principalEnrolleeId: m.enrolleeId,
            beneficiaryName: verifiedFullName,
          }).catch(() => undefined);
        }
      } catch (err) {
        log.error({ err: String(err), txnRef: ref }, "quick.prognosis.write.fail");
      }

      // Auto-correct DOB on Prognosis to NIMC's value.
      try {
        const dobResult = await updateEnrolleeDob(m.memberId, dobFromNin);
        await audit({
          action: `prognosis.dob.update.${dobResult.ok ? "ok" : "fail"}`,
          actorType: "system",
          memberId: m.memberId,
          traceId: tid,
        });
        if (dobResult.ok) await recordDobUpdateSuccess();
      } catch (err) {
        log.error({ err: String(err) }, "quick.prognosis.dob.fail");
      }
    });
  }
}
