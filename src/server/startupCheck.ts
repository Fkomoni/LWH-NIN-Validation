import "server-only";
import { log } from "@/lib/logger";
import { appConfig } from "@/config/app";
import { validateProviderUrl } from "@/lib/urlAllowList";

/**
 * Startup config sanity check.
 *
 * Fires once per process from instrumentation. We do NOT throw here —
 * the landing page and /api/healthz must stay up even if a provider
 * credential is missing, so Render can still deploy and an operator
 * can fill in the values from the dashboard.
 *
 * Every finding is logged once at warn level with a stable prefix so
 * it's greppable in Render log search.
 */

const REAL_MODE_REQUIRED = [
  "AUTH_SECRET",
  "ADMIN_SECRET",
  "OTP_HMAC_SECRET",
  "PROGNOSIS_BASE_URL",
  "PROGNOSIS_USERNAME",
  "PROGNOSIS_PASSWORD",
  "QORE_TOKEN_URL",
  "QORE_NIN_VERIFY_URL",
  "QORE_CLIENT_ID",
] as const;

const REAL_MODE_EITHER_OR: Array<[string, string]> = [
  ["QORE_SECRET_KEY", "VITE_CORE_SECRET_KEY"],
];

let ran = false;

export function runStartupCheck(): void {
  if (ran) return;
  ran = true;

  const mode = appConfig.mocksEnabled ? "mock" : "live";
  log.info({ mode, tz: appConfig.timezone }, "startup.ready");

  // Refuse to boot with mocks enabled in production. The mocks path
  // short-circuits real HTTP clients and uses the in-memory fixtures
  // for Member/NIN/OTP/Notification. Running that in production would
  // mean a real user could authenticate against a hard-coded fixture.
  if (process.env.NODE_ENV === "production" && appConfig.mocksEnabled) {
    throw new Error(
      "startup.fatal: NEXT_PUBLIC_MOCKS_ENABLED must be 'false' in production.",
    );
  }

  // Require a durable KV in live production. In-memory KV loses
  // OTP / lockout / rate-limit / outbox state across restarts and
  // across instances, so every control built on top of KV becomes
  // unreliable.
  if (process.env.NODE_ENV === "production" && !appConfig.mocksEnabled) {
    const hasUpstash = !!(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    );
    const hasPostgres = !!process.env.DATABASE_URL;
    if (!hasUpstash && !hasPostgres) {
      throw new Error(
        "startup.fatal: live production requires a durable KV — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or provision DATABASE_URL.",
      );
    }
  }

  if (appConfig.mocksEnabled) return;

  const missing: string[] = [];
  for (const key of REAL_MODE_REQUIRED) {
    if (!process.env[key]) missing.push(key);
  }
  for (const [a, b] of REAL_MODE_EITHER_OR) {
    if (!process.env[a] && !process.env[b]) missing.push(`${a} or ${b}`);
  }

  if (missing.length > 0) {
    log.warn(
      { missing },
      "startup.missing-env: real mode enabled but some provider credentials are absent; affected flows will return PROVIDER_ERROR until configured",
    );
  }

  // Deployment hygiene: if we rely on x-forwarded-for for rate-limit
  // keys, log a prominent warning so the operator knows the reverse
  // proxy must strip attacker-supplied tail hops before appending its
  // own. Rate limits without this invariant are bypassable.
  if (process.env.TRUST_XFF_LAST_HOP === "true") {
    log.warn(
      {},
      "startup.xff.trusted: TRUST_XFF_LAST_HOP=true — the reverse proxy MUST strip attacker-supplied X-Forwarded-For values",
    );
  }

  // Provider URL allow-list. Each outbound URL is validated against
  // a known-good hostname suffix so a compromised Render dashboard
  // or a mistyped value cannot redirect PII to an attacker host.
  // Non-fatal at startup: we warn and let the relevant flows fail
  // at call time rather than refusing to boot the whole app over a
  // single typo'd base URL.
  const providers: Array<[string, string, string[]]> = [
    ["PROGNOSIS_BASE_URL", process.env.PROGNOSIS_BASE_URL ?? "", ["leadwayhealth.com"]],
    ["QORE_TOKEN_URL", process.env.QORE_TOKEN_URL ?? "", ["qoreid.com", "qoreid.app"]],
    ["QORE_NIN_VERIFY_URL", process.env.QORE_NIN_VERIFY_URL ?? "", ["qoreid.com", "qoreid.app"]],
  ];
  for (const [name, value, hosts] of providers) {
    if (!value) continue;
    try {
      validateProviderUrl(value, { allowedHostSuffixes: hosts, label: name });
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), env: name },
        "startup.provider-url.rejected",
      );
    }
  }

  // PROGNOSIS_API_KEY / _HEADER are optional — the bearer token
  // from /ApiUsers/Login is the primary auth and is sent on the
  // Authorization header automatically. Only set these if Leadway
  // provisions a SEPARATE static key on a different header.
}
