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
   * NIN name-match thresholds — Jaro-Winkler on normalised strings
   * (title-stripped, diacritic-folded, token-sorted).
   *
   * Client policy (17 Apr 2026): 50% name + 100% DOB is enough to
   * auto-pass. Manual-review band kept narrow for edge cases where
   * names are very different (e.g. married-name change) but DOB still
   * matches — ops can approve after a quick look.
   *
   * DOB match remains strict (exact ISO equality) regardless of tier.
   */
  nameMatch: {
    autoPassMin: 0.5,
    manualReviewMin: 0.4,
  },

  /**
   * NIN format — per NIMC: exactly 11 numeric digits.
   */
  nin: {
    length: 11,
  },

  /**
   * Support + security-ops contact.
   * Security-ops email confirmed by client (17 Apr 2026): f-komoni-mbaekwe@leadway.com
   */
  contact: {
    // Confirmed by client 17 Apr 2026.
    supportPhone: "07080627051 / 02012801051",
    supportEmail: "healthcare@leadway.com",
    securityOpsEmail: "f-komoni-mbaekwe@leadway.com",
  },

  /** Send a receipt email on successful NIN validation (confirmed). */
  sendReceiptEmail: true,

  timezone: "Africa/Lagos",

  /**
   * When true, services/* resolve to mock implementations and MSW is
   * installed in the browser (Phase 1).
   */
  mocksEnabled: process.env.NEXT_PUBLIC_MOCKS_ENABLED !== "false",
} as const;

export type AppConfig = typeof appConfig;
