/**
 * Single source of truth for runtime-configurable app policy.
 *
 * All values flagged `TODO(client)` are placeholders pending client sign-off
 * (see docs/architecture/open-questions.md). Swap them in this file only —
 * feature code must import from here, never hardcode.
 */

export const appConfig = {
  /**
   * Lockout policy — confirmed per brief: 3 failed attempts in a rolling
   * 1-hour window → 48-hour hard lock on the Enrollee ID.
   */
  lockout: {
    maxFailuresPerWindow: 3,
    windowMs: 60 * 60 * 1000, // 1h rolling
    hardLockMs: 48 * 60 * 60 * 1000, // 48h
  },

  /**
   * Rate limits — per brief.
   */
  rateLimits: {
    authPerMinPerIp: 10,
    ninValidatePerHourPerEnrollee: 5,
    otpPerHourPerPhone: 3,
  },

  /**
   * OTP policy — per brief.
   */
  otp: {
    length: 6,
    ttlMs: 5 * 60 * 1000,
    resendCooldownMs: 30 * 1000,
    maxResends: 3,
  },

  /**
   * Session policy — per brief.
   */
  session: {
    idleMs: 15 * 60 * 1000,
    absoluteMs: 30 * 60 * 1000,
  },

  /**
   * NIN name-match thresholds — Jaro-Winkler on normalised strings.
   * Tunable here so Ops can adjust without redeploy (Phase 2: move to DB).
   */
  nameMatch: {
    autoPassMin: 0.92,
    manualReviewMin: 0.8,
  },

  /**
   * NIN format — per NIMC: exactly 11 numeric digits.
   */
  nin: {
    length: 11,
  },

  /**
   * Support + security-ops contact. TODO(client): replace with real values.
   */
  contact: {
    // TODO(client): confirm support phone + hours
    supportPhone: "+234-000-000-0000",
    supportEmail: "support@leadway.com",
    supportHours: "Mon–Fri, 8am–6pm WAT",
    // TODO(client): confirm the real security-ops mailing list
    securityOpsEmail: "leadway_security_ops@leadway.com",
  },

  timezone: "Africa/Lagos",

  /**
   * When true, services/* resolve to mock implementations and MSW is
   * installed in the browser (Phase 1).
   */
  mocksEnabled: process.env.NEXT_PUBLIC_MOCKS_ENABLED !== "false",
} as const;

export type AppConfig = typeof appConfig;
