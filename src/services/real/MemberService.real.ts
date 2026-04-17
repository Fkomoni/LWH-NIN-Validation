import "server-only";
import type { MemberService, MemberLookupResult } from "../types";
import type { Household, Person, Relationship } from "@/types/domain";
import {
  getEnrolleeBioData,
  getEnrolleeDependants,
  type PrognosisMember,
} from "../http/PrognosisMemberClient";
import { dobMatches } from "@/lib/validation/dob";
import { isLocked } from "@/server/lockout";
import { maskPhone } from "@/lib/mask";

/**
 * Production MemberService. Reads from Prognosis enrollee endpoints.
 *
 * Phase-2 gaps (tracked in open-questions.md):
 *   - the Prognosis *update* endpoint for writing the verified NIN is
 *     not yet confirmed — `PrognosisService.upsertMemberNin` currently
 *     posts to the mock until we receive the endpoint
 *   - authenticateByPrincipalNin currently re-reads the bio record to
 *     compare the user-supplied DOB with Prognosis's DOB; if Prognosis
 *     returns the real DOB only after NIMC verification, we'll need a
 *     second lookup there too
 */

function relationshipFromString(raw?: string): Relationship {
  if (!raw) return "OTHER";
  const s = raw.toLowerCase();
  if (s.includes("principal") || s.includes("self")) return "PRINCIPAL";
  if (s.includes("spouse") || s.includes("wife") || s.includes("husband")) return "SPOUSE";
  if (s.includes("child") || s.includes("daughter") || s.includes("son")) return "CHILD";
  if (s.includes("parent") || s.includes("mother") || s.includes("father")) return "PARENT";
  return "OTHER";
}

function toPerson(p: PrognosisMember, isPrincipal: boolean): Person {
  return {
    id: p.enrolleeId,
    enrolleeId: p.enrolleeId,
    fullName: p.fullName,
    relationship: isPrincipal ? "PRINCIPAL" : relationshipFromString(p.relationship),
    dob: p.dob ?? "",
    phoneMasked: p.phone ? maskPhone(p.phone) : undefined,
    ninStatus: "NOT_SUBMITTED",
  };
}

async function buildHousehold(enrolleeId: string): Promise<Household | null> {
  const principal = await getEnrolleeBioData(enrolleeId);
  if (!principal) return null;
  const deps = await getEnrolleeDependants(enrolleeId);
  return {
    principal: toPerson(principal, true),
    dependants: deps.map((d) => toPerson(d, false)),
  };
}

export const realMemberService: MemberService = {
  async authenticateByDob({ enrolleeId, dob }): Promise<MemberLookupResult> {
    if (await isLocked(enrolleeId)) return { ok: false, reason: "LOCKED" };
    const household = await buildHousehold(enrolleeId);
    if (!household) return { ok: false, reason: "NOT_FOUND" };
    if (!dobMatches(household.principal.dob, dob)) {
      return { ok: false, reason: "DOB_MISMATCH" };
    }
    return { ok: true, household };
  },

  async authenticateByPrincipalNin({ enrolleeId, dob }): Promise<MemberLookupResult> {
    // We rely on NIMC to supply the DOB-from-NIN; the portal action is
    // responsible for comparing that DOB with the user-supplied `dob`
    // before it calls back into this service. Here we simply confirm
    // the enrollee exists and the user-supplied DOB matches Prognosis.
    if (await isLocked(enrolleeId)) return { ok: false, reason: "LOCKED" };
    const household = await buildHousehold(enrolleeId);
    if (!household) return { ok: false, reason: "NOT_FOUND" };
    if (!dobMatches(household.principal.dob, dob)) {
      return { ok: false, reason: "DOB_MISMATCH" };
    }
    return { ok: true, household };
  },

  async loadHousehold(enrolleeId) {
    const h = await buildHousehold(enrolleeId);
    if (!h) throw new Error("household-not-found");
    return h;
  },
};
