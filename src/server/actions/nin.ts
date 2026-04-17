"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { beneficiaryNinSubmitSchema } from "@/schemas/nin";
import { getServices } from "@/services";
import { requireSession } from "@/server/session";
import { audit } from "@/server/audit";
import { idempotencyKey, traceId, txnRef } from "@/lib/ids";
import { maskNin } from "@/lib/mask";
import { rateLimit } from "@/server/rateLimit";
import { enqueuePrognosis } from "@/server/outbox";
import { notifyNinValidated } from "@/server/notify";
import { appConfig } from "@/config/app";
import type { NinValidationResult } from "@/types/domain";

export interface NinSubmitResult {
  beneficiaryId: string;
  result: NinValidationResult;
  retryScheduled?: boolean;
}

/** Validate a single beneficiary's NIN end-to-end. */
export async function submitBeneficiaryNin(input: unknown): Promise<NinSubmitResult> {
  const session = await requireSession();
  const parsed = beneficiaryNinSubmitSchema.parse(input);
  const key = parsed.idempotencyKey ?? idempotencyKey();
  const tid = traceId();

  const limit = await rateLimit.ninValidateEnrollee(session.enrolleeId);
  if (!limit.ok) {
    return {
      beneficiaryId: parsed.beneficiaryId,
      result: {
        outcome: "FAIL_HARD",
        message:
          "You've tried to validate too many times recently. Please wait an hour and try again.",
      },
    };
  }

  const h = await headers();
  const ip = h.get("x-client-ip") ?? "0.0.0.0";

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
    ip,
    payload: { nin: maskNin(parsed.nin), score: result.nameScore, dob: result.dobMatched },
  });

  let retryScheduled = false;
  if (result.outcome === "PASS_AUTO" && result.verifiedFullName && result.dobFromNin) {
    const ref = txnRef();
    const payload = {
      memberId: parsed.beneficiaryId,
      nin: parsed.nin,
      verifiedFullName: result.verifiedFullName,
      dobFromNin: result.dobFromNin,
      validationStatus: "VALIDATED" as const,
      validatedAt: new Date().toISOString(),
      source: "self-service-portal" as const,
      txnRef: ref,
    };
    const write = await svc.prognosis.upsertMemberNin(payload);
    await audit({
      action: `prognosis.upsert.${write.ok ? "ok" : "fail"}`,
      actorType: "system",
      memberId: parsed.beneficiaryId,
      traceId: tid,
      payload: { txnRef: ref },
    });
    if (!write.ok && write.retryable) {
      await enqueuePrognosis(payload);
      retryScheduled = true;
    }

    if (appConfig.sendReceiptEmail) {
      // Best-effort; never block the flow. Real email path falls back
      // silently when the member has no email on file.
      await notifyNinValidated({
        fullName: result.verifiedFullName,
      }).catch(() => undefined);
    }
  }

  revalidatePath("/household");
  return { beneficiaryId: parsed.beneficiaryId, result, retryScheduled };
}
