import "server-only";
import { getKv } from "./kv";
import { appConfig } from "@/config/app";
import { audit } from "./audit";
import { traceId } from "@/lib/ids";

/**
 * Per-enrolleeId failure counter + 48 h hard lock.
 *
 * Policy (client-confirmed):
 *   - 3 failed auth attempts → 48 h hard lock, no IP conditional.
 *   - When a locked member returns to /auth we surface a live
 *     countdown of hours remaining.
 *
 * Note on DoS risk: because lockout is keyed only on enrolleeId, an
 * attacker who knows a target's Enrollee ID can cause a 48 h DoS with
 * 3 bad submissions. This is an explicit product trade-off — the
 * client prioritised UX simplicity and brief-compliance over DoS
 * resilience. Documented in SECURITY.md §8.
 */

type Channel = "DOB" | "PRINCIPAL_NIN" | "OTP";

interface HardLock {
  lockedAt: number;
  reason: Channel;
  ip: string;
}

function failKey(enrolleeId: string) {
  return `lock:fail:${enrolleeId}`;
}
function hardKey(enrolleeId: string) {
  return `lock:hard:${enrolleeId}`;
}

export async function isLocked(enrolleeId: string): Promise<boolean> {
  return getKv().exists(hardKey(enrolleeId));
}

/**
 * Return the millisecond timestamp when this enrollee's hard lock
 * expires, or null if not locked. Used by the UI to render a live
 * countdown.
 */
export async function getLockExpiry(enrolleeId: string): Promise<number | null> {
  const kv = getKv();
  const rec = await kv.get<HardLock>(hardKey(enrolleeId));
  if (!rec) return null;
  return rec.lockedAt + appConfig.lockout.hardLockMs;
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
  /** Expiry timestamp of the resulting hard lock, if any. */
  expiresAt?: number;
}

export async function recordFail({
  enrolleeId,
  channel,
  ip,
  userAgent,
}: RecordFailArgs): Promise<FailOutcome> {
  const kv = getKv();
  const windowMs = appConfig.lockout.windowMs;
  const count = await kv.pushWindow(failKey(enrolleeId), windowMs);

  const locked = count >= appConfig.lockout.maxFailuresPerWindow;
  if (!locked) return { locked: false, attemptsInWindow: count };

  const lockedAt = Date.now();
  const lock: HardLock = { lockedAt, reason: channel, ip };
  await kv.set(hardKey(enrolleeId), lock, { ttlMs: appConfig.lockout.hardLockMs });

  await audit({
    action: "auth.locked.set",
    actorType: "system",
    actorId: enrolleeId,
    traceId: traceId(),
    ip,
    userAgent,
    payload: { channel, attempts: count },
  });

  return {
    locked: true,
    attemptsInWindow: count,
    expiresAt: lockedAt + appConfig.lockout.hardLockMs,
  };
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
