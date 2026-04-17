import type { NinService } from "../types";
import type { NinValidationResult } from "@/types/domain";
import { nimcFixtures } from "@/fixtures/nimc";
import { households } from "@/fixtures/households";
import { isValidNinFormat } from "@/lib/validation/nin";
import { scoreNameMatch } from "@/lib/validation/scoreName";
import { dobMatches } from "@/lib/validation/dob";

/**
 * In-memory idempotency table for the mock. Real NinService will use
 * Redis + Postgres.
 */
const idempotencyStore = new Map<string, NinValidationResult>();

function supportRef(): string {
  return `LWH-${Date.now().toString(36).toUpperCase()}`;
}

function findBeneficiary(enrolleeId: string, beneficiaryId: string) {
  const hh = households[enrolleeId];
  if (!hh) return undefined;
  if (hh.principal.id === beneficiaryId) return hh.principal;
  return hh.dependants.find((d) => d.id === beneficiaryId);
}

export const mockNinService: NinService = {
  async validateForBeneficiary({ enrolleeId, beneficiaryId, nin, idempotencyKey }) {
    const idemCached = idempotencyStore.get(idempotencyKey);
    if (idemCached) return idemCached;

    if (!isValidNinFormat(nin)) {
      return {
        outcome: "FAIL_HARD",
        message: "NIN must be exactly 11 digits.",
      };
    }

    const beneficiary = findBeneficiary(enrolleeId, beneficiaryId);
    if (!beneficiary) {
      return {
        outcome: "FAIL_HARD",
        message: "We couldn't find this beneficiary on your plan.",
      };
    }

    const fixture = nimcFixtures[nin];
    if (!fixture) {
      const r: NinValidationResult = {
        outcome: "FAIL_HARD",
        message: "We couldn't verify this NIN with NIMC. Please double-check and try again.",
        supportRef: supportRef(),
      };
      idempotencyStore.set(idempotencyKey, r);
      return r;
    }

    if (fixture.outcome === "TIMEOUT" || fixture.outcome === "PROVIDER_ERROR") {
      // Transient — do NOT cache idempotency so retry can succeed next time.
      return {
        outcome: fixture.outcome === "TIMEOUT" ? "TIMEOUT" : "PROVIDER_ERROR",
        message:
          "NIMC is temporarily unavailable. Please wait a minute and try again.",
      };
    }

    if (fixture.outcome === "DUPLICATE_NIN") {
      const r: NinValidationResult = {
        outcome: "FAIL_HARD",
        message: "This NIN is already linked to another Leadway Health member.",
        supportRef: supportRef(),
      };
      idempotencyStore.set(idempotencyKey, r);
      return r;
    }

    const { score, tier } = scoreNameMatch(beneficiary.fullName, fixture.fullName ?? "");
    const dobOk = fixture.dob ? dobMatches(beneficiary.dob, fixture.dob) : false;

    let result: NinValidationResult;
    if (!dobOk) {
      result = {
        outcome: "FAIL_HARD",
        nameScore: score,
        dobMatched: false,
        verifiedFullName: fixture.fullName,
        dobFromNin: fixture.dob,
        message: "The date of birth on this NIN doesn't match our records.",
        supportRef: supportRef(),
      };
    } else if (tier === "auto-pass") {
      // Mutate the fixture so subsequent reads (e.g. the Done page) see the
      // new status — production uses Postgres as the source of truth.
      beneficiary.ninStatus = "UPDATED";
      beneficiary.ninLast3 = nin.slice(-3);
      result = {
        outcome: "PASS_AUTO",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: fixture.fullName,
        dobFromNin: fixture.dob,
        message: "NIN validated and update queued.",
      };
    } else if (tier === "manual-review") {
      beneficiary.ninStatus = "MANUAL_REVIEW";
      result = {
        outcome: "REVIEW_SOFT",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: fixture.fullName,
        dobFromNin: fixture.dob,
        message:
          "We need a manual review of this NIN because the name is close but not an exact match. We'll email you when it's done.",
      };
    } else {
      result = {
        outcome: "FAIL_HARD",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: fixture.fullName,
        dobFromNin: fixture.dob,
        message: "The name on this NIN doesn't match our records.",
        supportRef: supportRef(),
      };
    }

    idempotencyStore.set(idempotencyKey, result);
    return result;
  },
};
