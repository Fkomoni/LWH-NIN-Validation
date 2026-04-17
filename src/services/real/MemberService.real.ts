import "server-only";
import type { MemberService, MemberLookupResult } from "../types";
import type { Household, Person, Relationship } from "@/types/domain";
import {
  getEnrolleeBioData,
  getEnrolleeDependants,
  PrognosisProviderError,
  type PrognosisMember,
} from "../http/PrognosisMemberClient";
import { dobMatches } from "@/lib/validation/dob";
import { isLocked } from "@/server/lockout";
import { maskPhone } from "@/lib/mask";
import { log } from "@/lib/logger";

/**
 * Production MemberService backed by Prognosis.
 *
 * Important: we surface PROVIDER_ERROR (not NOT_FOUND) when the
 * underlying Prognosis call fails. NOT_FOUND triggers the lockout
 * counter; PROVIDER_ERROR does not. This means a Prognosis outage
 * cannot cause a real enrollee to get locked out by accident.
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
  const hasNin = Boolean(p.existingNin && p.existingNin.length >= 3);
  return {
    id: p.enrolleeId,
    enrolleeId: p.enrolleeId,
    fullName: p.fullName,
    relationship: isPrincipal ? "PRINCIPAL" : relationshipFromString(p.relationship),
    dob: p.dob ?? "",
    phoneMasked: p.phone ? maskPhone(p.phone) : undefined,
    // If Prognosis already holds a NIN for this member, show them as
    // already validated; the UI will disable the input row.
    ninStatus: hasNin ? "UPDATED" : "NOT_SUBMITTED",
    ninLast3: hasNin && p.existingNin ? p.existingNin.slice(-3) : undefined,
  };
}

type HouseholdResult =
  | { kind: "ok"; household: Household }
  | { kind: "not-found" }
  | { kind: "provider-error" };

async function loadHouseholdRaw(enrolleeId: string): Promise<HouseholdResult> {
  let principal: PrognosisMember | null;
  try {
    principal = await getEnrolleeBioData(enrolleeId);
  } catch (err) {
    if (err instanceof PrognosisProviderError) {
      log.error({ err: err.message, status: err.status, enrolleeId }, "member.bio.provider-error");
      return { kind: "provider-error" };
    }
    log.error({ err: String(err), enrolleeId }, "member.bio.unexpected");
    return { kind: "provider-error" };
  }
  if (!principal) return { kind: "not-found" };
  const deps = await getEnrolleeDependants(enrolleeId);
  return {
    kind: "ok",
    household: {
      principal: toPerson(principal, true),
      dependants: deps.map((d) => toPerson(d, false)),
    },
  };
}

export const realMemberService: MemberService = {
  async authenticateByDob({ enrolleeId, dob }): Promise<MemberLookupResult> {
    if (await isLocked(enrolleeId)) return { ok: false, reason: "LOCKED" };

    const res = await loadHouseholdRaw(enrolleeId);
    if (res.kind === "provider-error") return { ok: false, reason: "PROVIDER_ERROR" };
    if (res.kind === "not-found") return { ok: false, reason: "NOT_FOUND" };

    const prognosisDate = res.household.principal.dob;
    const userDate = dob;
    const matched = dobMatches(prognosisDate, userDate);

    // Diagnostic: two date fields, renamed so the auto-mask doesn't
    // blank them (auto-mask triggers on keys ending in "dob").
    log.info(
      {
        enrolleeId,
        prognosisDate: prognosisDate || null,
        userDate,
        matched,
      },
      "auth.dob.compare",
    );

    if (!matched) return { ok: false, reason: "DOB_MISMATCH" };
    return { ok: true, household: res.household };
  },

  async authenticateByPrincipalNin({ enrolleeId, dob }): Promise<MemberLookupResult> {
    if (await isLocked(enrolleeId)) return { ok: false, reason: "LOCKED" };

    const res = await loadHouseholdRaw(enrolleeId);
    if (res.kind === "provider-error") return { ok: false, reason: "PROVIDER_ERROR" };
    if (res.kind === "not-found") return { ok: false, reason: "NOT_FOUND" };

    if (!dobMatches(res.household.principal.dob, dob)) {
      return { ok: false, reason: "DOB_MISMATCH" };
    }
    return { ok: true, household: res.household };
  },

  async loadHousehold(enrolleeId) {
    const res = await loadHouseholdRaw(enrolleeId);
    if (res.kind !== "ok") throw new Error("household-not-found");
    return res.household;
  },
};
