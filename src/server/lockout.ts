import "server-only";
import { getKv } from "./kv";
import { appConfig } from "@/config/app";
import { audit } from "./audit";
import { traceId } from "@/lib/ids";

/**
 * Per-enrolleeId, per-channel failure counter + 48 h hard lock.
 *
 * Policy (client-confirmed):
 *   - DOB channel: 2 wrong attempts → auto-route to /verify (NIN path).
 *     The 3rd would lock, but in normal use the auto-route fires first.
 *   - NIN channel: 3 wrong attempts → 48 h hard lock.
 *   - The hard lock is global per-enrollee: once set, both channels are
 *     blocked for 48 h regardless of which one tipped it.
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

function failKey(enrolleeId: string, channel: Channel) {
  return `lock:fail:${channel}:${enrolleeId}`;
}
function hardKey(enrolleeId: string) {
  return `lock:hard:${enrolleeId}`;
}
function ipFailKey(ip: string) {
  return `lock:ipfail:${ip}`;
}
function ipSoftKey(ip: string) {
  return `lock:ipsoft:${ip}`;
}

async function delAllFailCounters(kv: ReturnType<typeof getKv>, enrolleeId: string) {
  await Promise.all([
    kv.del(failKey(enrolleeId, "DOB")),
    kv.del(failKey(enrolleeId, "PRINCIPAL_NIN")),
    kv.del(failKey(enrolleeId, "OTP")),
  ]);
}

export async function isLocked(enrolleeId: string): Promise<boolean> {
  return getKv().exists(hardKey(enrolleeId));
}

/**
 * IP-level soft block. Orthogonal to per-enrollee lockout: catches
 * credential-stuffing where the attacker rotates Enrollee IDs from a
 * single origin. When hit, callers return the same generic
 * rate-limited shape the UI already handles — no account-level audit.
 */
export async function isIpSoftLocked(ip: string): Promise<boolean> {
  return getKv().exists(ipSoftKey(ip));
}

/**
 * Push an IP failure onto the sliding window and arm a soft lock if
 * the window crosses threshold. Safe to call from both real
 * authentication failures and from early schema rejections — the
 * whole point is to make scripted probing expensive.
 */
export async function recordIpFail(ip: string): Promise<{ locked: boolean; count: number }> {
  const kv = getKv();
  const count = await kv.pushWindow(ipFailKey(ip), appConfig.ipLockout.windowMs);
  if (count >= appConfig.ipLockout.maxFailuresPerWindow) {
    await kv.set(ipSoftKey(ip), 1, { ttlMs: appConfig.ipLockout.softLockMs });
    return { locked: true, count };
  }
  return { locked: false, count };
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
  const count = await kv.pushWindow(failKey(enrolleeId, channel), windowMs);

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
  await delAllFailCounters(kv, enrolleeId);
}

/**
 * Wipe both the hard lock and every channel's failure counter for an
 * enrollee. Called by the NIN-fallback path when a member proves their
 * identity by matching NIMC's DOB against Prognosis's DOB.
 */
export async function clearLockout(enrolleeId: string): Promise<void> {
  const kv = getKv();
  await kv.del(hardKey(enrolleeId));
  await delAllFailCounters(kv, enrolleeId);
}

export async function adminUnlock(enrolleeId: string, adminId: string): Promise<void> {
  const kv = getKv();
  await kv.del(hardKey(enrolleeId));
  await delAllFailCounters(kv, enrolleeId);
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
 *   - hard lock + all channel failure counters
 *   - NIN-validate rate-limit counter
 *   - OTP code, cooldown, resend counter
 *
 * Does NOT clear the Prognosis outbox (that is keyed by txnRef) nor the
 * idempotency cache (each submit generates a fresh UUID anyway).
 */
export async function adminResetMember(enrolleeId: string, adminId: string): Promise<void> {
  const kv = getKv();
  await kv.del(hardKey(enrolleeId));
  await delAllFailCounters(kv, enrolleeId);
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
