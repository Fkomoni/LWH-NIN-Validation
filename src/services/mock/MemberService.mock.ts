import type { MemberService, MemberLookupResult } from "../types";
import { households, validPrincipalNins } from "@/fixtures/households";
import { dobMatches } from "@/lib/validation/dob";

/**
 * In-memory MemberService used in Phase 1. A few enrolleeIds are reserved
 * to simulate server state:
 *   LWH-0006  always returns { ok: false, reason: "LOCKED" }
 *   LWH-9999  always returns PROVIDER_ERROR (for error-path rendering)
 */
export const mockMemberService: MemberService = {
  async authenticateByDob({ enrolleeId, dob }): Promise<MemberLookupResult> {
    if (enrolleeId === "LWH-9999") return { ok: false, reason: "PROVIDER_ERROR" };
    if (enrolleeId === "LWH-0006") return { ok: false, reason: "LOCKED" };

    const hh = households[enrolleeId];
    if (!hh) return { ok: false, reason: "NOT_FOUND" };
    if (!dobMatches(hh.principal.dob, dob)) {
      return {
        ok: false,
        reason: "DOB_MISMATCH",
        memberFullName: hh.principal.fullName,
      };
    }
    return { ok: true, household: hh };
  },

  async authenticateByPrincipalNin({ enrolleeId, nin, dob }): Promise<MemberLookupResult> {
    if (enrolleeId === "LWH-0006") return { ok: false, reason: "LOCKED" };
    const hh = households[enrolleeId];
    if (!hh) return { ok: false, reason: "NOT_FOUND" };
    const ref = validPrincipalNins[enrolleeId];
    if (!ref || ref.nin !== nin || !dobMatches(ref.dob, dob)) {
      return {
        ok: false,
        reason: "DOB_MISMATCH",
        memberFullName: hh.principal.fullName,
      };
    }
    return { ok: true, household: hh };
  },

  async loadHousehold(enrolleeId) {
    const hh = households[enrolleeId];
    if (!hh) throw new Error("household-not-found");
    return hh;
  },
};
