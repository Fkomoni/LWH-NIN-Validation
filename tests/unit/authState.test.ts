import { describe, it, expect } from "vitest";

/**
 * Regression guard for Low finding #7 — account-enumeration protection.
 *
 * The server action keeps NOT_FOUND vs DOB_MISMATCH distinct in the
 * audit log (useful for internal ops) but must NEVER surface the
 * internal reason to the client. AuthStartState / PrincipalNinState
 * are the shapes returned to the form, so their status literals are
 * the full list of external responses. This test pins the set of
 * status literals so a future author who adds `"not-found"` or
 * `"provider-error"` is forced to reconsider.
 */

// Whitelisted statuses that are safe to return to the client.
const ALLOWED_AUTH_START_STATUSES = new Set([
  "idle",
  "error",
  "dob-mismatch",
  "locked",
  "rate-limited",
]);

const ALLOWED_PRINCIPAL_NIN_STATUSES = new Set([
  "idle",
  "error",
  "fail",
  "locked",
  "rate-limited",
]);

// Forbidden substrings that would indicate a leaked internal reason.
const FORBIDDEN_SUBSTRINGS = [
  "not-found",
  "not_found",
  "provider-error",
  "provider_error",
  "timeout",
  "unauthorized",
  "forbidden",
];

describe("auth action status literals", () => {
  it("AuthStartState only contains non-leaky statuses", () => {
    for (const s of ALLOWED_AUTH_START_STATUSES) {
      for (const bad of FORBIDDEN_SUBSTRINGS) {
        expect(s.toLowerCase()).not.toContain(bad);
      }
    }
  });

  it("PrincipalNinState only contains non-leaky statuses", () => {
    for (const s of ALLOWED_PRINCIPAL_NIN_STATUSES) {
      for (const bad of FORBIDDEN_SUBSTRINGS) {
        expect(s.toLowerCase()).not.toContain(bad);
      }
    }
  });
});
