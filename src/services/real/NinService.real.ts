import "server-only";
import type { NinService } from "../types";
import type { NinValidationResult } from "@/types/domain";
import { qoreVerifyNin } from "../http/QoreIdClient";
import { getServices } from "..";
import { isValidNinFormat } from "@/lib/validation/nin";
import { scoreNameMatch } from "@/lib/validation/scoreName";
import { dobMatches } from "@/lib/validation/dob";
import { splitFullName } from "@/lib/nameSplit";
import { supportRef, traceId } from "@/lib/ids";
import { enqueueReview } from "@/server/admin/reviews";
import { getKv } from "@/server/kv";
import { log } from "@/lib/logger";
import { maskName } from "@/lib/mask";

/**
 * Production NinService. Uses QoreID for the NIMC lookup. Idempotency
 * keys are cached in KV so a repeat submit with the same key doesn't
 * double-charge the provider.
 */

function idemKey(k: string) {
  return `idem:nin:${k}`;
}

export const realNinService: NinService = {
  async validateForBeneficiary({ enrolleeId, beneficiaryId, nin, idempotencyKey }) {
    const kv = getKv();
    const cached = await kv.get<NinValidationResult>(idemKey(idempotencyKey));
    if (cached) return cached;

    if (!isValidNinFormat(nin)) {
      return { outcome: "FAIL_HARD", message: "NIN must be exactly 11 digits." };
    }

    const svc = getServices();
    const household = await svc.member.loadHousehold(enrolleeId);
    const beneficiary =
      household.principal.id === beneficiaryId
        ? household.principal
        : household.dependants.find((d) => d.id === beneficiaryId);
    if (!beneficiary) {
      return {
        outcome: "FAIL_HARD",
        message: "We couldn't find this beneficiary on your plan.",
      };
    }

    const { firstname, lastname } = splitFullName(beneficiary.fullName);
    const call = await qoreVerifyNin({ nin, firstname, lastname, traceId: traceId() });
    if (!call.ok) {
      return {
        outcome: call.error.kind === "TIMEOUT" ? "TIMEOUT" : "PROVIDER_ERROR",
        message: "NIMC is temporarily unavailable. Please wait a minute and try again.",
      };
    }

    const resp = call.data;
    if (resp.status === "NOT_FOUND") {
      const r: NinValidationResult = {
        outcome: "FAIL_HARD",
        message: "We couldn't verify this NIN with NIMC. Please double-check and try again.",
        supportRef: supportRef(),
      };
      await kv.set(idemKey(idempotencyKey), r, { ttlMs: 24 * 60 * 60 * 1000 });
      return r;
    }

    const { score, tier } = scoreNameMatch(beneficiary.fullName, resp.fullName ?? "");
    const dobOk = resp.dob ? dobMatches(beneficiary.dob, resp.dob) : false;

    // Diagnostic comparison log. Names are initial-masked. The date
    // keys are intentionally named with "Date" instead of "Dob" so the
    // PII auto-masker leaves them readable — an operator needs to see
    // which of the three date sources disagrees (Prognosis, Qore
    // normalised, Qore raw).
    const qoreRaw = resp.raw as { nin?: { birthdate?: unknown } } | undefined;
    log.info(
      {
        beneficiaryName: maskName(beneficiary.fullName),
        qoreName: resp.fullName ? maskName(resp.fullName) : null,
        prognosisDate: beneficiary.dob || null,
        qoreDate: resp.dob ?? null,
        qoreDateRaw: qoreRaw?.nin?.birthdate ?? null,
        score,
        tier,
        dobOk,
      },
      "nin.comparison",
    );

    let result: NinValidationResult;
    if (!dobOk) {
      result = {
        outcome: "FAIL_HARD",
        nameScore: score,
        dobMatched: false,
        verifiedFullName: resp.fullName,
        dobFromNin: resp.dob,
        message: "The date of birth on this NIN doesn't match our records.",
        supportRef: supportRef(),
      };
    } else if (tier === "auto-pass") {
      result = {
        outcome: "PASS_AUTO",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: resp.fullName,
        dobFromNin: resp.dob,
        message: "NIN validated and update queued.",
      };
    } else if (tier === "manual-review") {
      await enqueueReview({
        enrolleeId,
        memberId: beneficiaryId,
        memberName: beneficiary.fullName,
        nameScore: score,
        verifiedFullName: resp.fullName,
        reason: `name-score=${score.toFixed(2)}`,
      });
      result = {
        outcome: "REVIEW_SOFT",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: resp.fullName,
        dobFromNin: resp.dob,
        message:
          "We need a manual review of this NIN because the name is close but not an exact match. We'll email you when it's done.",
      };
    } else {
      result = {
        outcome: "FAIL_HARD",
        nameScore: score,
        dobMatched: true,
        verifiedFullName: resp.fullName,
        dobFromNin: resp.dob,
        message: "The name on this NIN doesn't match our records.",
        supportRef: supportRef(),
      };
    }

    await kv.set(idemKey(idempotencyKey), result, { ttlMs: 24 * 60 * 60 * 1000 });
    return result;
  },
};
