import type { OtpService, OtpRequestResult, OtpVerifyResult } from "../types";
import { appConfig } from "@/config/app";

/**
 * Mock OTP store. Always issues code "123456" so walkthroughs are
 * deterministic. Tracks resend count per enrolleeId in-memory.
 */

type OtpRecord = { code: string; expiresAt: number; resends: number };
const store = new Map<string, OtpRecord>();

const FIXED_CODE = "123456";

export const mockOtpService: OtpService = {
  async request({ enrolleeId }): Promise<OtpRequestResult> {
    if (enrolleeId === "LWH-0006") return { ok: false, reason: "LOCKED" };
    if (enrolleeId === "LWH-NOPHONE") return { ok: false, reason: "NO_PHONE_ON_FILE" };

    const existing = store.get(enrolleeId);
    if (existing && existing.resends >= appConfig.otp.maxResends) {
      return { ok: false, reason: "RATE_LIMITED" };
    }

    store.set(enrolleeId, {
      code: FIXED_CODE,
      expiresAt: Date.now() + appConfig.otp.ttlMs,
      resends: (existing?.resends ?? 0) + 1,
    });

    return {
      ok: true,
      channelHint: "phone ending in ***245",
      cooldownMs: appConfig.otp.resendCooldownMs,
    };
  },

  async verify({ enrolleeId, code }): Promise<OtpVerifyResult> {
    const rec = store.get(enrolleeId);
    if (!rec) return { ok: false, reason: "EXPIRED" };
    if (Date.now() > rec.expiresAt) {
      store.delete(enrolleeId);
      return { ok: false, reason: "EXPIRED" };
    }
    if (rec.code !== code) return { ok: false, reason: "INVALID" };
    store.delete(enrolleeId);
    return { ok: true };
  },
};
