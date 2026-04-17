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
 * Record one failed attempt. If the sliding-window count crosses the
 * threshold, set a 48 h hard lock and return `locked: true`. Side-effects
 * (security-ops email) are triggered outside this function so the caller
 * controls timing / batching.
 */
export async function recordFail({
  enrolleeId,
  channel,
  ip,
  userAgent,
}: RecordFailArgs): Promise<FailOutcome> {
  const kv = getKv();
  const count = await kv.pushWindow(failKey(enrolleeId), appConfig.lockout.windowMs);
  const locked = count >= appConfig.lockout.maxFailuresPerWindow;
  if (locked) {
    await kv.set(hardKey(enrolleeId), { lockedAt: Date.now(), reason: channel }, {
      ttlMs: appConfig.lockout.hardLockMs,
    });
    await audit({
      action: "auth.locked.set",
      actorType: "system",
      actorId: enrolleeId,
      traceId: traceId(),
      ip,
      userAgent,
      payload: { channel, attempts: count },
    });
  }
  return { locked, attemptsInWindow: count };
}

export async function clearFailures(enrolleeId: string): Promise<void> {
  const kv = getKv();
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
