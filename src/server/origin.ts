import "server-only";
import { headers } from "next/headers";

/**
 * Defence-in-depth Origin check for Server Actions.
 *
 * Next 15 already verifies the Origin/Host on server-action POSTs,
 * and our session cookies are SameSite=strict. This helper is an
 * additional guard: every mutating action calls assertSameOrigin()
 * before performing work, so a misconfigured proxy that strips the
 * Origin header, or a future relaxation of Next's built-in check,
 * does not leave the action exposed.
 *
 * The allow-list is sourced from ALLOWED_ORIGINS (comma-separated
 * absolute URLs like "https://portal.leadwayhealth.com"). In dev /
 * test the check is skipped when the variable is unset so the local
 * loopback flow keeps working.
 */
export class OriginForbiddenError extends Error {
  constructor(public readonly origin: string | null) {
    super("FORBIDDEN_ORIGIN");
    this.name = "OriginForbiddenError";
  }
}

function allowList(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function assertSameOrigin(): Promise<void> {
  const allow = allowList();
  if (allow.size === 0) {
    if (process.env.NODE_ENV === "production") {
      // In production, an empty allow-list is a misconfiguration —
      // fail closed so we don't silently disable the guard.
      throw new OriginForbiddenError(null);
    }
    return; // dev / test: skip.
  }
  const h = await headers();
  const origin = h.get("origin");
  if (origin && allow.has(origin)) return;
  // Fall back to Referer when Origin is missing (older browsers).
  const referer = h.get("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      if (allow.has(`${u.protocol}//${u.host}`)) return;
    } catch {
      /* fall through */
    }
  }
  throw new OriginForbiddenError(origin);
}
