import type { Household, Person } from "@/types/domain";

/**
 * Fixture matrix — each principal covers one or more of the 12 edge cases
 * in the brief. The enrolleeId doubles as the scenario key.
 *
 * Canonical principals (every one uses DOB 1985-06-15 unless noted):
 *   LWH-0001  Happy path — 2 dependants
 *   LWH-0002  Zero dependants
 *   LWH-0003  All dependants already verified
 *   LWH-0004  Duplicate NIN across beneficiaries
 *   LWH-0005  Name with diacritics / married surname
 *   LWH-0006  Locked account (simulated)
 *   LWH-0007  DOB mismatch → NIN fallback works
 *   LWH-0008  OTP-only recovery
 *   LWH-0009  Provider-flaky path (NIMC 5xx)
 */

function p(partial: Partial<Person> & Pick<Person, "id" | "enrolleeId" | "fullName">): Person {
  return {
    dob: "1985-06-15",
    relationship: "CHILD",
    ninStatus: "NOT_SUBMITTED",
    ...partial,
  };
}

/** Phone number → enrolleeId map for mock phone-based login.
 *  Use these numbers in dev/test to exercise the phone path. */
export const phoneToEnrolleeId: Record<string, string> = {
  "08012340001": "LWH-0001",
  "08012340002": "LWH-0002",
  "08012340007": "LWH-0007",
  "08012340006": "LWH-0006", // always-locked account
};

export const households: Record<string, Household> = {
  "LWH-0001": {
    principal: p({
      id: "m-0001",
      enrolleeId: "LWH-0001",
      fullName: "Adekunle Bashorun",
      relationship: "PRINCIPAL",
      phoneMasked: "+234 80**** 245",
    }),
    dependants: [
      p({
        id: "m-0001a",
        enrolleeId: "LWH-0001-D1",
        fullName: "Adaora Bashorun",
        relationship: "SPOUSE",
        dob: "1988-09-02",
      }),
      p({
        id: "m-0001b",
        enrolleeId: "LWH-0001-D2",
        fullName: "Zainab Bashorun",
        relationship: "CHILD",
        dob: "2015-02-11",
      }),
    ],
  },

  "LWH-0002": {
    principal: p({
      id: "m-0002",
      enrolleeId: "LWH-0002",
      fullName: "Grace Okoro",
      relationship: "PRINCIPAL",
      phoneMasked: "+234 81**** 910",
      dob: "1979-03-22",
    }),
    dependants: [],
  },

  "LWH-0003": {
    principal: p({
      id: "m-0003",
      enrolleeId: "LWH-0003",
      fullName: "Chinedu Eze",
      relationship: "PRINCIPAL",
      ninStatus: "VALIDATED",
      ninLast3: "187",
      dob: "1972-11-05",
    }),
    dependants: [
      p({
        id: "m-0003a",
        enrolleeId: "LWH-0003-D1",
        fullName: "Ngozi Eze",
        relationship: "SPOUSE",
        ninStatus: "VALIDATED",
        ninLast3: "302",
        dob: "1975-07-14",
      }),
    ],
  },

  "LWH-0004": {
    principal: p({
      id: "m-0004",
      enrolleeId: "LWH-0004",
      fullName: "Tunde Bakare",
      relationship: "PRINCIPAL",
      phoneMasked: "+234 70**** 001",
      dob: "1990-01-20",
    }),
    dependants: [
      p({
        id: "m-0004a",
        enrolleeId: "LWH-0004-D1",
        fullName: "Funke Bakare",
        relationship: "SPOUSE",
        dob: "1991-04-10",
      }),
    ],
  },

  "LWH-0005": {
    principal: p({
      id: "m-0005",
      enrolleeId: "LWH-0005",
      fullName: "Chiamaka Okónkwo-Smith", // diacritic + hyphenated married surname
      relationship: "PRINCIPAL",
      phoneMasked: "+234 80**** 555",
      dob: "1988-12-01",
    }),
    dependants: [
      p({
        id: "m-0005a",
        enrolleeId: "LWH-0005-D1",
        fullName: "J. Smith",
        relationship: "CHILD",
        dob: "2019-05-17",
      }),
    ],
  },

  "LWH-0006": {
    principal: p({
      id: "m-0006",
      enrolleeId: "LWH-0006",
      fullName: "Locked Account",
      relationship: "PRINCIPAL",
      phoneMasked: "+234 80**** 999",
      dob: "1980-01-01",
    }),
    dependants: [],
  },

  "LWH-0007": {
    principal: p({
      id: "m-0007",
      enrolleeId: "LWH-0007",
      fullName: "Emmanuel Adeyemi",
      relationship: "PRINCIPAL",
      phoneMasked: "+234 80**** 707",
      dob: "1984-08-08", // stored — user will try wrong DOB first
    }),
    dependants: [
      p({
        id: "m-0007a",
        enrolleeId: "LWH-0007-D1",
        fullName: "Ifeoluwa Adeyemi",
        relationship: "CHILD",
        dob: "2012-10-10",
      }),
    ],
  },

  "LWH-0008": {
    principal: p({
      id: "m-0008",
      enrolleeId: "LWH-0008",
      fullName: "Bisola Ogunleye",
      relationship: "PRINCIPAL",
      phoneMasked: "+234 81**** 808",
      dob: "1993-06-21",
    }),
    dependants: [],
  },

  "LWH-0009": {
    principal: p({
      id: "m-0009",
      enrolleeId: "LWH-0009",
      fullName: "Obinna Umeh",
      relationship: "PRINCIPAL",
      phoneMasked: "+234 81**** 999",
      dob: "1987-02-19",
    }),
    dependants: [
      p({
        id: "m-0009a",
        enrolleeId: "LWH-0009-D1",
        fullName: "Kamsi Umeh",
        relationship: "CHILD",
        dob: "2018-03-04",
      }),
    ],
  },
};

export const validPrincipalNins: Record<string, { nin: string; dob: string; verifiedName: string }> = {
  "LWH-0001": { nin: "12345678901", dob: "1985-06-15", verifiedName: "Adekunle Bashorun" },
  "LWH-0007": { nin: "77777777707", dob: "1984-08-08", verifiedName: "Emmanuel Adeyemi" },
};
