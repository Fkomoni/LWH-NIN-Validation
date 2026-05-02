import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { appConfig } from "@/config/app";
import { getServices } from "@/services";
import { getKv } from "./kv";
import { requireSecret } from "@/lib/secrets";
import { log } from "@/lib/logger";

/**
 * Phone-keyed OTP for the quick-update funnel.
 *
 * Why a parallel module to OtpService?
 *
 * The existing OtpService keys on enrolleeId because the original
 * fallback flow always knew the enrollee first. The phone-first funnel
 * doesn't authenticate the member — we send an OTP straight to the
 * number they typed, before they have any session. Keying the OTP
 * record by phone is the cleanest model for that.
 *
 * Hash scheme + TTLs + resend caps mirror OtpService.real so audit
 * behaviour is identical.
 */

function pepper(): string {
  return requireSecret("OTP_HMAC_SECRET");
}

function codeHash(code: string): string {
  return createHmac("sha256", pepper()).update(code).digest("hex");
}

function randomCode(len = appConfig.otp.length): string {
  const max = 10 ** len;
  return String(randomInt(0, max)).padStart(len, "0");
}

function k(scope: string, phone: string) {
  return `pOtp:${scope}:${phone}`;
}

interface OtpRecord {
  hash: string;
  expiresAt: number;
}

export type PhoneOtpRequestResult =
  | { ok: true; cooldownMs: number }
  | { ok: false; reason: "RATE_LIMITED" | "PROVIDER_ERROR" };

export type PhoneOtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "EXHAUSTED" };

/**
 * Generate + send an OTP to `phone`. The phone is assumed to already
 * be normalized (e.g. via PrognosisMemberClient.normalizePhone).
 */
export async function requestPhoneOtp(phone: string): Promise<PhoneOtpRequestResult> {
  const kv = getKv();
  const resends = (await kv.get<number>(k("resends", phone))) ?? 0;
  if (resends >= appConfig.otp.maxResends) return { ok: false, reason: "RATE_LIMITED" };
  if (await kv.exists(k("cooldown", phone))) return { ok: false, reason: "RATE_LIMITED" };

  const code = randomCode();
  await kv.set(
    k("code", phone),
    { hash: codeHash(code), expiresAt: Date.now() + appConfig.otp.ttlMs } as OtpRecord,
    { ttlMs: appConfig.otp.ttlMs },
  );
  await kv.set(k("cooldown", phone), 1, { ttlMs: appConfig.otp.resendCooldownMs });
  await kv.incr(k("resends", phone), { ttlMs: appConfig.otp.ttlMs });

  const send = await getServices().notification.send({
    kind: "otp.sms",
    to: { phone },
    vars: { code },
  });
  if (!send.ok) {
    log.error({ phone: maskTail(phone) }, "phoneOtp.sms.fail");
    return { ok: false, reason: "PROVIDER_ERROR" };
  }
  return { ok: true, cooldownMs: appConfig.otp.resendCooldownMs };
}

export async function verifyPhoneOtp(
  phone: string,
  code: string,
): Promise<PhoneOtpVerifyResult> {
  const kv = getKv();
  const rec = await kv.get<OtpRecord>(k("code", phone));
  if (!rec) return { ok: false, reason: "EXPIRED" };
  if (rec.expiresAt < Date.now()) {
    await kv.del(k("code", phone));
    return { ok: false, reason: "EXPIRED" };
  }
  const expected = Buffer.from(rec.hash);
  const got = Buffer.from(codeHash(code));
  const match = expected.length === got.length && timingSafeEqual(expected, got);
  if (!match) {
    const attempts = await kv.incr(k("attempts", phone), { ttlMs: appConfig.otp.ttlMs });
    if (attempts >= appConfig.otp.maxResends) {
      await kv.del(k("code", phone));
      return { ok: false, reason: "EXHAUSTED" };
    }
    return { ok: false, reason: "INVALID" };
  }
  await kv.del(k("code", phone));
  await kv.del(k("attempts", phone));
  await kv.del(k("resends", phone));
  return { ok: true };
}

function maskTail(phone: string): string {
  if (phone.length < 4) return "****";
  return `****${phone.slice(-4)}`;
}

export function maskPhoneForDisplay(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}
