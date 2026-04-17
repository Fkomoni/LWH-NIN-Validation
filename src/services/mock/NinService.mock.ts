import "server-only";
import type { NinService } from "../types";
import type { NinValidationResult } from "@/types/domain";
import { verifyNin } from "../http/NimcClient";
import { households } from "@/fixtures/households";
import { isValidNinFormat } from "@/lib/validation/nin";
import { scoreNameMatch } from "@/lib/validation/scoreName";
import { dobMatches } from "@/lib/validation/dob";
import { supportRef, traceId } from "@/lib/ids";

/**
 * Phase-1 NinService implementation. It performs:
 *   1. Format gate
 *   2. An HTTP call to the NIMC client (intercepted by MSW in Phase 1,
 *      pointed at the real endpoint in Phase 2)
 *   3. Name + DOB comparison and tier classification
 *   4. In-memory idempotency (Redis in Phase 2)
 *   5. Fixture mutation to simulate a persistent store
 */

const idempotencyStore = new Map<string, NinValidationResult>();

function findBeneficiary(enrolleeId: string, beneficiaryId: string) {
  const hh = households[enrolleeId];
  if (!hh) return undefined;
  if (hh.principal.id === beneficiaryId) return hh.principal;
  return hh.dependants.find((d) => d.id === beneficiaryId);
}

export const mockNinService: NinService = {
  async validateForBeneficiary({ enrolleeId, beneficiaryId, nin, idempotencyKey }) {
    const cached = idempotencyStore.get(idempotencyKey);
    if (cached) return cached;

    if (!isValidNinFormat(nin)) {
      return { outcome: "FAIL_HARD", message: "NIN must be exactly 11 digits." };
    }

    const beneficiary = findBeneficiary(enrolleeId, beneficiaryId);
    if (!beneficiary) {
      return {
        outcome: "FAIL_HARD",
        message: "We couldn't find this beneficiary on your plan.",
      };
    }

    const call = await verifyNin({ nin, traceId: traceId() });
    if (!call.ok) {
      const kind = call.error.kind;
      // Do NOT cache transient errors — retrying must be able to succeed.
      return {
        outcome: kind === "TIMEOUT" ? "TIMEOUT" : "PROVIDER_ERROR",
        message: "NIMC is temporarily unavailable. Please wait a minute and try again.",
      };
    }

    const nimc = call.data;
    if (nimc.status === "NOT_FOUND") {
      const r: NinValidationResult = {
        outcome: "FAIL_HARD",
        message: "We couldn't verify this NIN with NIMC. Please double-check and try again.",
        supportRef: supportRef(),
      };
      idempotencyStore.set(idempotencyKey, r);
      return r;
    }

    if (nimc.status === "DUPLICATE_NIN") {
      const r: NinValidationResult = {
        outcome: "FAIL_HARD",
        message: "This NIN is already linked to another Leadway Health member.",
        supportRef: supportRef(),
      };
      idempotencyStore.set(idempotencyKey, r);
      return r;
    }

    const { score, tier } = scoreNameMatch(beneficiary.fullName, nimc.fullName ?? "");
    const dobOk = nimc.dob ? dobMatches(beneficiary.dob, nimc.dob) : false;

    let result: NinValidationResult;
    if (!dobOk) {
      result = {
        outcome: "FAIL_HARD",
        nameScore: score,
        dobMatched: false,
        verifiedFullName: nimc.fullName,
        dobFromNin: nimc.dob,
        message: "The date of birth on this NIN doesn't match our records.",
        supportRef: supportRef(),
      };
    } else if (tier === "auto-pass") {
      beneficiary.ninStatus = "UPDATED";
      beneficiary.ninLast3 = nin.slice(-3);
      result = {
        outcome: "PASS_AUTO",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: nimc.fullName,
        dobFromNin: nimc.dob,
        message: "NIN validated and update queued.",
      };
    } else if (tier === "manual-review") {
      beneficiary.ninStatus = "MANUAL_REVIEW";
      result = {
        outcome: "REVIEW_SOFT",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: nimc.fullName,
        dobFromNin: nimc.dob,
        message:
          "We need a manual review of this NIN because the name is close but not an exact match. We'll email you when it's done.",
      };
    } else {
      result = {
        outcome: "FAIL_HARD",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: nimc.fullName,
        dobFromNin: nimc.dob,
        message: "The name on this NIN doesn't match our records.",
        supportRef: supportRef(),
      };
    }

    idempotencyStore.set(idempotencyKey, result);
    return result;
  },
};
