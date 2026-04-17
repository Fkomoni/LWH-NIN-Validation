import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { OtpService, OtpRequestResult, OtpVerifyResult } from "../types";
import { appConfig } from "@/config/app";
import { households } from "@/fixtures/households";
import { getKv } from "@/server/kv";
import { recordFail } from "@/server/lockout";

/**
 * OTP service — Phase-1 mock that nonetheless exercises the real
 * production shape: the code is always the same deterministic "123456"
 * for developer UX, but it is hashed with an HMAC before being stored
 * in KV, and the cooldown / TTL / resend-cap policy is enforced against
 * KV counters.
 *
 * Phase 2 ships a cryptographically random 6-digit code from a CSPRNG;
 * the storage + verify path here is unchanged.
 */

const FIXED_CODE = "123456";
const HMAC_SECRET = process.env.OTP_HMAC_SECRET ?? "dev-only-otp-pepper";

function codeHash(code: string): string {
  return createHmac("sha256", HMAC_SECRET).update(code).digest("hex");
}

function k(scope: string, enrolleeId: string) {
  return `otp:${scope}:${enrolleeId}`;
}

interface OtpRecord {
  hash: string;
  expiresAt: number;
}

export const mockOtpService: OtpService = {
  async request({ enrolleeId }): Promise<OtpRequestResult> {
    if (enrolleeId === "LWH-0006") return { ok: false, reason: "LOCKED" };
    if (enrolleeId === "LWH-NOPHONE") return { ok: false, reason: "NO_PHONE_ON_FILE" };
    const hh = households[enrolleeId];
    if (!hh) return { ok: false, reason: "NO_PHONE_ON_FILE" };

    const kv = getKv();
    const resends = await kv.get<number>(k("resends", enrolleeId));
    if ((resends ?? 0) >= appConfig.otp.maxResends) {
      return { ok: false, reason: "RATE_LIMITED" };
    }

    const cooldownKey = k("cooldown", enrolleeId);
    if (await kv.exists(cooldownKey)) {
      return { ok: false, reason: "RATE_LIMITED" };
    }

    const rec: OtpRecord = {
      hash: codeHash(FIXED_CODE),
      expiresAt: Date.now() + appConfig.otp.ttlMs,
    };
    await kv.set(k("code", enrolleeId), rec, { ttlMs: appConfig.otp.ttlMs });
    await kv.set(cooldownKey, 1, { ttlMs: appConfig.otp.resendCooldownMs });
    await kv.incr(k("resends", enrolleeId), { ttlMs: appConfig.otp.ttlMs });

    return {
      ok: true,
      channelHint: hh.principal.phoneMasked ?? "phone on file",
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
      const outcome = await recordFail({
        enrolleeId,
        channel: "OTP",
        ip,
        userAgent: "",
      });
      if (outcome.locked) return { ok: false, reason: "LOCKED" };
      return { ok: false, reason: "INVALID" };
    }

    await kv.del(k("code", enrolleeId));
    await kv.del(k("resends", enrolleeId));
    return { ok: true };
  },
};
