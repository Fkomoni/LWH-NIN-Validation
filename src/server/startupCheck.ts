import "server-only";
import { log } from "@/lib/logger";
import { appConfig } from "@/config/app";

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

  // PROGNOSIS_API_KEY + PROGNOSIS_API_KEY_HEADER are both optional.
  // When absent we forward the dynamically-issued bearer token as the
  // X-API-Key value, matching the client's confirmed auth model (the
  // "key" is the login-issued token that rotates every 6 hours).
}
