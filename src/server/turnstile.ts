import "server-only";
import { log } from "@/lib/logger";

/**
 * Cloudflare Turnstile verification.
 *
 * Phase 1: noop — always allows. The Turnstile widget is not yet on the
 * form. Phase 2 drops the widget into <AuthStartForm /> and flips this
 * function to call the siteverify endpoint. The return shape does NOT
 * change between phases so callers can guard their paths today.
 */
export interface TurnstileResult {
  ok: boolean;
  reason?: "missing-token" | "invalid-token" | "provider-error";
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Dev / Phase 1: allow through but warn so the gap is visible.
    log.debug({ ip }, "turnstile.skipped.no-secret");
    return { ok: true };
  }
  if (!token) return { ok: false, reason: "missing-token" };

  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    if (!res.ok) return { ok: false, reason: "provider-error" };
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) return { ok: false, reason: "invalid-token" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "provider-error" };
  }
}
