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

  // The write endpoint needs an API key in addition to the bearer token;
  // without it Prognosis responds with 401 "API Key is missing" and we
  // non-retryably fail the write. Warn loudly at boot.
  if (!process.env.PROGNOSIS_API_KEY) {
    log.warn(
      {},
      "startup.missing-prognosis-api-key: set PROGNOSIS_API_KEY (and PROGNOSIS_API_KEY_HEADER if the header isn't X-API-Key) to enable /EnrolleeProfile/UpdateMemberData; reads will still work but writes will 401.",
    );
  }
}
