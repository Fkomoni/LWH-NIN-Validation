/**
 * NIMC response fixtures keyed by the NIN the user submits. The mock
 * NinService picks one of these; any NIN not in the map returns NOT_FOUND
 * so tests can target specific edge cases deterministically.
 */

export type NimcFixtureOutcome =
  | "MATCH"            // exact name + DOB match
  | "MATCH_INITIAL"    // name match degraded to initial (manual review)
  | "MISMATCH_NAME"    // score < 0.80
  | "DOB_MISMATCH"
  | "DUPLICATE_NIN"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "NOT_FOUND";

export interface NimcFixture {
  outcome: NimcFixtureOutcome;
  fullName?: string;
  dob?: string;
}

export const nimcFixtures: Record<string, NimcFixture> = {
  /* Happy path — principal + dependants for LWH-0001 */
  "12345678901": { outcome: "MATCH", fullName: "Adekunle Bashorun", dob: "1985-06-15" },
  "12345678902": { outcome: "MATCH", fullName: "Adaora Bashorun", dob: "1988-09-02" },
  "12345678903": { outcome: "MATCH", fullName: "Zainab Bashorun", dob: "2015-02-11" },

  /* Duplicate across beneficiaries (LWH-0004) */
  "44444444401": { outcome: "DUPLICATE_NIN", fullName: "Tunde Bakare", dob: "1990-01-20" },

  /* Diacritics + married surname + initials (LWH-0005) */
  "55555555501": { outcome: "MATCH", fullName: "CHIAMAKA OKONKWO SMITH", dob: "1988-12-01" },
  "55555555502": { outcome: "MATCH_INITIAL", fullName: "JANET SMITH", dob: "2019-05-17" },

  /* Validate-with-NIN for LWH-0007 principal (DOB fallback) */
  "77777777707": { outcome: "MATCH", fullName: "Emmanuel Adeyemi", dob: "1984-08-08" },

  /* Provider flaky (LWH-0009) */
  "99999999901": { outcome: "TIMEOUT" },
  "99999999902": { outcome: "PROVIDER_ERROR" },

  /* Name mismatch hard-fail */
  "10000000001": { outcome: "MISMATCH_NAME", fullName: "Completely Different", dob: "1985-06-15" },

  /* DOB mismatch */
  "10000000002": { outcome: "DOB_MISMATCH", fullName: "Adekunle Bashorun", dob: "1990-01-01" },
};
