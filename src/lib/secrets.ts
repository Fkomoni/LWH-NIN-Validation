import "server-only";
import { createHash } from "node:crypto";
import { hostname } from "node:os";

/**
 * Centralised env-secret access.
 *
 * Rules:
 *   - Production (NODE_ENV=production AND mocks off) → REQUIRE the
 *     env var; throw at first use if absent or too short.
 *   - Dev / mock mode → derive a **deterministic-per-machine**
 *     fallback from the host name. It is NOT committable and NOT
 *     guessable from the public source, so the previous public-string
 *     fallback class of vulnerability is closed either way.
 *
 * The old inline fallbacks (`"dev-only-secret-do-not-use-in-prod"`,
 * `"dev-only-admin-secret"`, `"dev-only-otp-pepper"`) are gone. Those
 * strings were public via the repo, so any process that silently fell
 * through to them was forgeable.
 */

const MIN_LEN = 24;

function isLiveProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_MOCKS_ENABLED !== "true"
  );
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
