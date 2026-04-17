/**
 * Canonical scenario matrix — each row maps to a spec edge case and
 * describes the enrolleeId + NIN(s) to feed during walkthroughs / e2e
 * tests. The UI surfaces this in a dev-only scenario picker during Phase 1.
 */

export interface Scenario {
  id: string;
  title: string;
  enrolleeId: string;
  dob: string;
  principalNin?: string;
  dependantNins?: Record<string, string>;
  notes: string;
}

export const scenarios: Scenario[] = [
  {
    id: "happy-path",
    title: "Happy path — 2 dependants",
    enrolleeId: "LWH-0001",
    dob: "1985-06-15",
    principalNin: "12345678901",
    dependantNins: { "LWH-0001-D1": "12345678902", "LWH-0001-D2": "12345678903" },
    notes: "All validate and update Prognosis.",
  },
  {
    id: "zero-dependants",
    title: "Principal with zero dependants",
    enrolleeId: "LWH-0002",
    dob: "1979-03-22",
    notes: "Household view shows principal only.",
  },
  {
    id: "already-verified",
    title: "Dependants already verified",
    enrolleeId: "LWH-0003",
    dob: "1972-11-05",
    notes: "Rows render as Validated; inputs disabled.",
  },
  {
    id: "duplicate-nin",
    title: "Duplicate NIN across beneficiaries",
    enrolleeId: "LWH-0004",
    dob: "1990-01-20",
    notes: "Submitting the same NIN twice is rejected client-side.",
  },
  {
    id: "diacritics-and-married",
    title: "Diacritics + married surname",
    enrolleeId: "LWH-0005",
    dob: "1988-12-01",
    principalNin: "55555555501",
    dependantNins: { "LWH-0005-D1": "55555555502" },
    notes: "Dependant lands in manual-review tier (initial match).",
  },
  {
    id: "locked-account",
    title: "Locked user retries within 48h",
    enrolleeId: "LWH-0006",
    dob: "1980-01-01",
    notes: "Any attempt returns a generic security message.",
  },
  {
    id: "dob-mismatch-nin-fallback",
    title: "DOB mismatch → NIN fallback",
    enrolleeId: "LWH-0007",
    dob: "1984-08-08",
    principalNin: "77777777707",
    notes: "User first enters wrong DOB, then validates with NIN.",
  },
  {
    id: "otp-fallback",
    title: "OTP recovery flow",
    enrolleeId: "LWH-0008",
    dob: "1993-06-21",
    notes: "6-digit OTP, 5-min TTL, 30-s resend cooldown, max 3 resends.",
  },
  {
    id: "nimc-flaky",
    title: "NIMC downtime / 5xx / timeout",
    enrolleeId: "LWH-0009",
    dob: "1987-02-19",
    dependantNins: { "LWH-0009-D1": "99999999901" },
    notes: "First attempt times out; second attempt hits PROVIDER_ERROR.",
  },
  {
    id: "hard-name-fail",
    title: "Hard name mismatch (< 0.80)",
    enrolleeId: "LWH-0001",
    dob: "1985-06-15",
    dependantNins: { "LWH-0001-D1": "10000000001" },
    notes: "Row shows Failed with support reference.",
  },
  {
    id: "hard-dob-fail",
    title: "NIMC DOB mismatch",
    enrolleeId: "LWH-0001",
    dob: "1985-06-15",
    dependantNins: { "LWH-0001-D1": "10000000002" },
    notes: "Row shows Failed — DOB mismatch; no Prognosis write.",
  },
];
