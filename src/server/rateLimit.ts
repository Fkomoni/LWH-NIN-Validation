import "server-only";
import { getKv } from "./kv";
import { appConfig } from "@/config/app";

/**
 * Sliding-window rate limit. Returns { ok, remaining } so callers can
 * short-circuit before hitting any downstream service. Keys are short
 * enough to fit Redis best-practice; values are timestamps (ms).
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  windowMs: number;
  limit: number;
}

async function check(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const kv = getKv();
  const count = await kv.pushWindow(key, windowMs);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), windowMs, limit };
}

export const rateLimit = {
  authIp(ip: string) {
    return check(`rl:auth:ip:${ip}`, appConfig.rateLimits.authPerMinPerIp, 60_000);
  },
  /** Admin login — tighter than portal auth. 5/min/IP. */
  adminLoginIp(ip: string) {
    return check(`rl:admin:ip:${ip}`, 5, 60_000);
  },
  /** Admin login — per-email sliding window. 5 per hour. */
  adminLoginEmail(email: string) {
    return check(`rl:admin:email:${email.toLowerCase()}`, 5, 60 * 60_000);
  },
  ninValidateEnrollee(enrolleeId: string) {
    return check(
      `rl:nin:enr:${enrolleeId}`,
      appConfig.rateLimits.ninValidatePerHourPerEnrollee,
      60 * 60_000,
    );
  },
  otpPhone(phoneHash: string) {
    return check(
      `rl:otp:phone:${phoneHash}`,
      appConfig.rateLimits.otpPerHourPerPhone,
      60 * 60_000,
    );
  },
};
