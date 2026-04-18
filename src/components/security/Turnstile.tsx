"use client";

import { useId } from "react";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders `<div class="cf-turnstile" data-sitekey="...">` which the
 * Turnstile runtime (loaded once from layout.tsx) replaces with the
 * challenge UI. On success the runtime injects a hidden input named
 * `cf-turnstile-response` into the surrounding <form>, and the
 * server action (`authStart`, `authByPrincipalNin`, `adminLogin`)
 * reads it via `formData.get("cf-turnstile-response")`.
 *
 * When NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset the widget renders
 * nothing: in dev / test this keeps the forms usable; in production
 * the server-side verifyTurnstile() will reject the submission with
 * `missing-secret` / `missing-token`, which is the correct fail-
 * closed behaviour.
 */
export function Turnstile({ action }: { action: string }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const id = useId();
  if (!siteKey) return null;
  return (
    <div
      className="cf-turnstile"
      data-sitekey={siteKey}
      data-action={action}
      data-theme="light"
      id={`turnstile-${id}`}
    />
  );
}
