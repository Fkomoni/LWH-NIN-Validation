import "server-only";
import { log } from "@/lib/logger";

/**
 * Cloudflare Turnstile verification.
 *
 * Called from every authentication surface (portal auth, principal-NIN
 * fallback, admin login) before any rate-limit or business-logic
 * work. Fail-closed in live production when TURNSTILE_SECRET_KEY is
 * unset. In dev / mock mode, a missing secret skips verification so
 * the walkthrough still works.
 *
 * The widget (`cf-turnstile-response` form field) is wired in Phase 2
 * of the UI — callers already propagate the token today so the gate
 * is ready the moment the widget lands.
 */
export interface TurnstileResult {
  ok: boolean;
  reason?: "missing-token" | "invalid-token" | "provider-error" | "missing-secret";
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      log.error({ ip }, "turnstile.missing-secret");
      return { ok: false, reason: "missing-secret" };
    }
    // Dev / test: allow through but surface the gap.
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
