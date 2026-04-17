import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpService, OtpRequestResult, OtpVerifyResult } from "../types";
import { appConfig } from "@/config/app";
import { getServices } from "..";
import { getKv } from "@/server/kv";
import { recordFail } from "@/server/lockout";
import { log } from "@/lib/logger";

/**
 * Production OtpService.
 *
 * Differences from the Phase-1 mock:
 *   - cryptographically-random 6-digit code via randomInt
 *   - phone number is sourced from Prognosis via MemberService
 *   - SMS is sent through the real NotificationService (Prognosis SMS API)
 *   - everything else (hashed storage, TTL, resend cap, cooldown, lockout
 *     integration, timingSafeEqual verify) is unchanged
 */

import { requireSecret } from "@/lib/secrets";

function otpPepper(): string {
  return requireSecret("OTP_HMAC_SECRET");
}

function codeHash(code: string): string {
  return createHmac("sha256", otpPepper()).update(code).digest("hex");
}

function randomCode(len = appConfig.otp.length): string {
  const max = 10 ** len;
  return String(randomInt(0, max)).padStart(len, "0");
}

function k(scope: string, enrolleeId: string) {
  return `otp:${scope}:${enrolleeId}`;
}

interface OtpRecord {
  hash: string;
  expiresAt: number;
}

export const realOtpService: OtpService = {
  async request({ enrolleeId }): Promise<OtpRequestResult> {
    const kv = getKv();
    const svc = getServices();

    const household = await svc.member.loadHousehold(enrolleeId).catch(() => null);
    if (!household) return { ok: false, reason: "NO_PHONE_ON_FILE" };

    // We need the *raw* phone for sending; only the masked one is on
    // Person. Fetch the bio directly for this path.
    const { getEnrolleeBioData } = await import("../http/PrognosisMemberClient");
    const bio = await getEnrolleeBioData(enrolleeId);
    if (!bio?.phone) return { ok: false, reason: "NO_PHONE_ON_FILE" };

    const resends = (await kv.get<number>(k("resends", enrolleeId))) ?? 0;
    if (resends >= appConfig.otp.maxResends) return { ok: false, reason: "RATE_LIMITED" };
    if (await kv.exists(k("cooldown", enrolleeId))) return { ok: false, reason: "RATE_LIMITED" };

    const code = randomCode();
    await kv.set(
      k("code", enrolleeId),
      { hash: codeHash(code), expiresAt: Date.now() + appConfig.otp.ttlMs } as OtpRecord,
      { ttlMs: appConfig.otp.ttlMs },
    );
    await kv.set(k("cooldown", enrolleeId), 1, { ttlMs: appConfig.otp.resendCooldownMs });
    await kv.incr(k("resends", enrolleeId), { ttlMs: appConfig.otp.ttlMs });

    const send = await svc.notification.send({
      kind: "otp.sms",
      to: { phone: bio.phone },
      vars: { code },
    });
    if (!send.ok) {
      log.error({ enrolleeId }, "otp.sms.fail");
      return { ok: false, reason: "RATE_LIMITED" };
    }

    return {
      ok: true,
      channelHint: household.principal.phoneMasked ?? "phone on file",
      cooldownMs: appConfig.otp.resendCooldownMs,
    };
  },

  async verify({ enrolleeId, code, ip }): Promise<OtpVerifyResult> {
    const kv = getKv();
    const rec = await kv.get<OtpRecord>(k("code", enrolleeId));
    if (!rec) return { ok: false, reason: "EXPIRED" };
    if (rec.expiresAt < Date.now()) {
      await kv.del(k("code", enrolleeId));
      return { ok: false, reason: "EXPIRED" };
    }
    const expected = Buffer.from(rec.hash);
    const got = Buffer.from(codeHash(code));
    const match = expected.length === got.length && timingSafeEqual(expected, got);
    if (!match) {
      const outcome = await recordFail({ enrolleeId, channel: "OTP", ip, userAgent: "" });
      return outcome.locked ? { ok: false, reason: "LOCKED" } : { ok: false, reason: "INVALID" };
    }
    await kv.del(k("code", enrolleeId));
    await kv.del(k("resends", enrolleeId));
    return { ok: true };
  },
};
