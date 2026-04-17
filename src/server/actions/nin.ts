"use server";

import { revalidatePath } from "next/cache";
import { beneficiaryNinSubmitSchema } from "@/schemas/nin";
import { getServices } from "@/services";
import { requireSession } from "@/server/session";
import { audit } from "@/server/audit";
import { idempotencyKey, traceId, txnRef } from "@/lib/ids";
import { maskNin } from "@/lib/mask";
import type { NinValidationResult } from "@/types/domain";

export interface NinSubmitResult {
  beneficiaryId: string;
  result: NinValidationResult;
}

/**
 * Validate a single beneficiary's NIN and — on auto-pass — forward to
 * Prognosis. Invoked per row from the household screen; callers can also
 * call it in a loop for the "Validate all" button.
 */
export async function submitBeneficiaryNin(input: unknown): Promise<NinSubmitResult> {
  const session = await requireSession();
  const parsed = beneficiaryNinSubmitSchema.parse(input);
  const key = parsed.idempotencyKey ?? idempotencyKey();
  const tid = traceId();

  const svc = getServices();
  const result = await svc.nin.validateForBeneficiary({
    enrolleeId: session.enrolleeId,
    beneficiaryId: parsed.beneficiaryId,
    nin: parsed.nin,
    idempotencyKey: key,
  });

  await audit({
    action: `nin.submit.${result.outcome.toLowerCase()}`,
    actorType: "portal-user",
    actorId: session.enrolleeId,
    memberId: parsed.beneficiaryId,
    traceId: tid,
    payload: { nin: maskNin(parsed.nin), score: result.nameScore, dob: result.dobMatched },
  });

  if (result.outcome === "PASS_AUTO" && result.verifiedFullName && result.dobFromNin) {
    const ref = txnRef();
    const write = await svc.prognosis.upsertMemberNin({
      memberId: parsed.beneficiaryId,
      nin: parsed.nin,
      verifiedFullName: result.verifiedFullName,
      dobFromNin: result.dobFromNin,
      validationStatus: "VALIDATED",
      validatedAt: new Date().toISOString(),
      source: "self-service-portal",
      txnRef: ref,
    });
    await audit({
      action: `prognosis.upsert.${write.ok ? "ok" : "fail"}`,
      actorType: "system",
      memberId: parsed.beneficiaryId,
      traceId: tid,
      payload: { txnRef: ref },
    });
  }

  revalidatePath("/household");
  return { beneficiaryId: parsed.beneficiaryId, result };
}
