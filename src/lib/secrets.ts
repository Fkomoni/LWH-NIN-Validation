import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
 * Verify a candidate admin bootstrap password.
 *
 * In production we require ADMIN_BOOTSTRAP_PASSWORD_HASH — an
 * scrypt-derived, timing-safe-comparable digest with the format:
 *
 *     scrypt$<Nlog2>$<saltB64>$<keyB64>
 *
 * Generated once off-line with `node scripts/hash-admin-password.mjs`
 * (or any scrypt implementation that matches the same parameters).
 * The plaintext ADMIN_BOOTSTRAP_PASSWORD is honoured only outside
 * live production (dev walkthrough), so the bootstrap credential
 * never lives in plaintext in the Render dashboard.
 *
 * If neither is set in dev/test, we fall back to the deterministic
 * per-machine derivation so the walkthrough still works.
 */
export function verifyAdminBootstrapPassword(candidate: string): boolean {
  const hashEnv = process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH;
  if (hashEnv && hashEnv.startsWith("scrypt$")) {
    return verifyScryptEncoded(candidate, hashEnv);
  }

  // Dev / test paths only.
  if (isLiveProduction()) {
    throw new Error(
      "ADMIN_BOOTSTRAP_PASSWORD_HASH must be set (scrypt$... format) in production.",
    );
  }
  const plaintext =
    (process.env.ADMIN_BOOTSTRAP_PASSWORD && process.env.ADMIN_BOOTSTRAP_PASSWORD.length >= 10
      ? process.env.ADMIN_BOOTSTRAP_PASSWORD
      : undefined) ?? deriveDevFallback("ADMIN_BOOTSTRAP_PASSWORD");
  return timingSafeEqualString(candidate, plaintext);
}

/** scrypt$<Nlog2>$<saltB64>$<keyB64> — a small, dependency-free format. */
function verifyScryptEncoded(candidate: string, encoded: string): boolean {
  try {
    const parts = encoded.split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt") return false;
    const nLog2 = Number(parts[1]);
    if (!Number.isInteger(nLog2) || nLog2 < 14 || nLog2 > 20) return false;
    const salt = Buffer.from(parts[2]!, "base64");
    const key = Buffer.from(parts[3]!, "base64");
    const N = 1 << nLog2;
    const derived = scryptSync(candidate, salt, key.length, { N, r: 8, p: 1 });
    return derived.length === key.length && timingSafeEqual(derived, key);
  } catch {
    return false;
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Convenience for offline bootstrap: generate an scrypt-encoded hash
 * string to paste into ADMIN_BOOTSTRAP_PASSWORD_HASH. Kept here so a
 * one-liner works in a dev REPL without extra files:
 *   node -e "import('./src/lib/secrets').then(m => console.log(m.hashAdminPassword('my-new-password')))"
 */
export function hashAdminPassword(plaintext: string, nLog2 = 15): string {
  const salt = randomBytes(16);
  const N = 1 << nLog2;
  const key = scryptSync(plaintext, salt, 32, { N, r: 8, p: 1 });
  return `scrypt$${nLog2}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Comma-separated allow-list of permitted admin email addresses
 * with optional per-email role suffix:
 *
 *   alice@leadway.com:ADMIN, bob@leadway.com:OPS, carol@leadway.com
 *
 * Recognised roles: READ_ONLY | OPS | ADMIN. An entry without a
 * colon-suffix defaults to READ_ONLY (safest default — explicit
 * elevation must be intentional). Throws in live production when
 * unset/empty so the bootstrap login flow cannot accept an
 * attacker-chosen email with the shared bootstrap password. In
 * dev/mock mode, an empty list means "any email is permitted as
 * ADMIN" (preserves the walkthrough UX).
 */
export type AdminRoleLiteral = "READ_ONLY" | "OPS" | "ADMIN";

const KNOWN_ROLES: ReadonlySet<AdminRoleLiteral> = new Set([
  "READ_ONLY",
  "OPS",
  "ADMIN",
]);

export function adminAllowList(): Map<string, AdminRoleLiteral> {
  const raw = process.env.ADMIN_ALLOWED_EMAILS ?? "";
  const map = new Map<string, AdminRoleLiteral>();
  for (const rawItem of raw.split(",")) {
    const trimmed = rawItem.trim();
    if (!trimmed) continue;
    const [emailPart, rolePart] = trimmed.split(":");
    const email = (emailPart ?? "").trim().toLowerCase();
    if (!email) continue;
    const roleUpper = (rolePart ?? "").trim().toUpperCase() as AdminRoleLiteral;
    const role = KNOWN_ROLES.has(roleUpper) ? roleUpper : "READ_ONLY";
    map.set(email, role);
  }
  if (map.size === 0 && isLiveProduction()) {
    throw new Error(
      "ADMIN_ALLOWED_EMAILS must be set (comma-separated, optionally with :ROLE suffix) in production.",
    );
  }
  return map;
}
