import "server-only";
import { createHash } from "node:crypto";
import { hostname } from "node:os";

/**
 * Centralised env-secret access.
 *
 * Rules:
 *   - Production (NODE_ENV=production) → REQUIRE the env var; throw
 *     at first use if absent or too short. The mocks flag does NOT
 *     widen this: a prod deploy with NEXT_PUBLIC_MOCKS_ENABLED=true
 *     would otherwise silently fall through to the deterministic
 *     dev fallback (guessable from the container hostname).
 *   - Dev / test → derive a **deterministic-per-machine** fallback
 *     from the host name. It is NOT committable and NOT guessable
 *     from the public source.
 *
 * The old inline fallbacks (`"dev-only-secret-do-not-use-in-prod"`,
 * `"dev-only-admin-secret"`, `"dev-only-otp-pepper"`) are gone. Those
 * strings were public via the repo, so any process that silently fell
 * through to them was forgeable.
 */

const MIN_LEN = 24;

function isLiveProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function deriveDevFallback(name: string): string {
  // sha256 of a per-process stable input — different on every machine,
  // never the same as the public repo, and non-persistent across clean
  // checkouts. Used only when mocks are on or NODE_ENV !== production.
  return createHash("sha256")
    .update(`lwh-dev-fallback:${name}:${hostname()}`)
    .digest("hex");
}

/** Required secret. Throws in live production when missing. */
export function requireSecret(name: string, opts: { minLen?: number } = {}): string {
  const min = opts.minLen ?? MIN_LEN;
  const v = process.env[name];
  if (v && v.length >= min) return v;
  if (isLiveProduction()) {
    throw new Error(
      `Missing or weak ${name}: must be at least ${min} chars in production.`,
    );
  }
  return deriveDevFallback(name);
}

/**
 * For a plaintext password (ADMIN_BOOTSTRAP_PASSWORD): in production
 * we refuse to authenticate when unset. In dev we surface the derived
 * value once so the developer knows what to type.
 */
export function requireAdminBootstrapPassword(): string {
  const v = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (v && v.length >= 10) return v;
  if (isLiveProduction()) {
    throw new Error(
      "ADMIN_BOOTSTRAP_PASSWORD must be set to a strong value in production.",
    );
  }
  return deriveDevFallback("ADMIN_BOOTSTRAP_PASSWORD");
}

/**
 * Comma-separated allow-list of permitted admin email addresses.
 * Throws in live production when unset/empty so the bootstrap login
 * flow cannot accept an attacker-chosen email with the shared
 * ADMIN_BOOTSTRAP_PASSWORD. In dev/mock mode, an empty list is
 * permitted and means "any email" (preserves the walkthrough UX).
 */
export function adminAllowList(): Set<string> {
  const raw = process.env.ADMIN_ALLOWED_EMAILS ?? "";
  const list = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (list.size === 0 && isLiveProduction()) {
    throw new Error(
      "ADMIN_ALLOWED_EMAILS must be set (comma-separated) in production.",
    );
  }
  return list;
}
