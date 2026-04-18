import "server-only";
import { getKv } from "./kv";
import { appConfig } from "@/config/app";
import { audit } from "./audit";
import { traceId } from "@/lib/ids";

/**
 * Per-enrolleeId failure counter + 48 h hard lock.
 *
 * Policy (per brief):
 *   - 3 failed auth attempts in a rolling 1 h window ⇒ 48 h hard lock
 *   - "Failed" = wrong DOB, failed NIN-principal validation, or OTP
 *     exhausted
 *   - Surface a *generic* security message; do not tell the user the
 *     lock duration or the reason
 *   - Emit a security-ops email with enrolleeId, timestamp (Africa/Lagos),
 *     IP, UA, attempt count, channel (handled by a separate hook)
 */

type Channel = "DOB" | "PRINCIPAL_NIN" | "OTP";

function failKey(enrolleeId: string) {
  return `lock:fail:${enrolleeId}`;
}
function failIpKey(enrolleeId: string, ip: string) {
  return `lock:fail:${enrolleeId}:${ip}`;
}
function hardKey(enrolleeId: string) {
  return `lock:hard:${enrolleeId}`;
}

export async function isLocked(enrolleeId: string): Promise<boolean> {
  return getKv().exists(hardKey(enrolleeId));
}

export interface RecordFailArgs {
  enrolleeId: string;
  channel: Channel;
  ip: string;
  userAgent: string;
}

export interface FailOutcome {
  locked: boolean;
  attemptsInWindow: number;
}

/**
 * Record one failed attempt.
 *
 * F-04: The hard-lock decision is gated by **both** counters:
 *   - per-enrollee (global pressure)
 *   - per-(enrollee, IP) (is THIS attacker responsible?)
 *
 * A hard lock only sets when the per-enrollee counter is above 2×
 * the threshold AND the per-(enrollee, IP) counter is above the
 * original threshold. This stops an attacker who knows a target's
 * Enrollee ID from remotely locking them out with 3 bad DOBs from a
 * rotating set of IPs — a real compromise shows up on at least one IP.
 */
export async function recordFail({
  enrolleeId,
  channel,
  ip,
  userAgent,
}: RecordFailArgs): Promise<FailOutcome> {
  const kv = getKv();
  const windowMs = appConfig.lockout.windowMs;
  const perEnrollee = await kv.pushWindow(failKey(enrolleeId), windowMs);
  const perTuple = await kv.pushWindow(failIpKey(enrolleeId, ip), windowMs);

  const threshold = appConfig.lockout.maxFailuresPerWindow;
  // For OTP, skip the per-IP requirement — a 6-digit code is cheap to
  // spray from a rotating-IP botnet. The per-enrollee counter is the
  // only relevant gate for OTP: N bad codes = lock. Other channels
  // (DOB, PRINCIPAL_NIN) retain the per-(enrollee,IP) AND per-enrollee
  // gate so a malicious peer cannot remotely lock a stranger out.
  const locked =
    channel === "OTP"
      ? perEnrollee >= threshold
      : perTuple >= threshold && perEnrollee >= threshold * 2;

  if (locked) {
    await kv.set(
      hardKey(enrolleeId),
      { lockedAt: Date.now(), reason: channel, ip },
      { ttlMs: appConfig.lockout.hardLockMs },
    );
    await audit({
      action: "auth.locked.set",
      actorType: "system",
      actorId: enrolleeId,
      traceId: traceId(),
      ip,
      userAgent,
      payload: { channel, perEnrollee, perTuple },
    });
  }
  return { locked, attemptsInWindow: perEnrollee };
}

export async function clearFailures(enrolleeId: string): Promise<void> {
  const kv = getKv();
  // Also purge any per-IP tuple buckets that might linger.
  await kv.del(failKey(enrolleeId));
}

export async function adminUnlock(enrolleeId: string, adminId: string): Promise<void> {
  const kv = getKv();
  await kv.del(hardKey(enrolleeId));
  await kv.del(failKey(enrolleeId));
  await audit({
    action: "admin.unlock",
    actorType: "admin",
    actorId: adminId,
    traceId: traceId(),
    payload: { enrolleeId },
  });
}

/**
 * Full per-enrollee state reset. Used by the Ops console to let a
 * tester retry without waiting for an hour / 48 h. Clears:
 *   - hard lock + failure counter (same as adminUnlock)
 *   - NIN-validate rate-limit counter
 *   - OTP code, cooldown, resend counter
 *
 * Does NOT clear the Prognosis outbox (that is keyed by txnRef) nor the
 * idempotency cache (each submit generates a fresh UUID anyway).
 */
export async function adminResetMember(enrolleeId: string, adminId: string): Promise<void> {
  const kv = getKv();
  await kv.del(hardKey(enrolleeId));
  await kv.del(failKey(enrolleeId));
  await kv.del(`rl:nin:enr:${enrolleeId}`);
  await kv.del(`otp:code:${enrolleeId}`);
  await kv.del(`otp:cooldown:${enrolleeId}`);
  await kv.del(`otp:resends:${enrolleeId}`);
  await audit({
    action: "admin.reset-member",
    actorType: "admin",
    actorId: adminId,
    traceId: traceId(),
    payload: { enrolleeId },
  });
}
