"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { beneficiaryNinSubmitSchema } from "@/schemas/nin";
import { getServices } from "@/services";
import { requireSession } from "@/server/session";
import { audit } from "@/server/audit";
import { idempotencyKey, traceId, txnRef } from "@/lib/ids";
import { maskNin } from "@/lib/mask";
import { rateLimit } from "@/server/rateLimit";
import { enqueuePrognosis } from "@/server/outbox";
import { notifyNinValidated } from "@/server/notify";
import { updateEnrolleeDob } from "@/services/http/PrognosisMemberClient";
import { recordNinSuccess, recordDobUpdateSuccess } from "@/server/stats";
import { log } from "@/lib/logger";
import type { NinValidationResult } from "@/types/domain";

export interface NinSubmitResult {
  beneficiaryId: string;
  result: NinValidationResult;
  /** The Prognosis write is still happening in the background. */
  writeQueued?: boolean;
}

/**
 * Validate one beneficiary's NIN.
 *
 * Once NIMC (via Qore) says the NIN matches, we return to the client
 * immediately and run the Prognosis update in `after()`. Rationale
 * (client, 17 Apr 2026): "once NIN is verified as correct, there is no
 * need keeping the client waiting — submit it, backend does the work."
 *
 * Safety net: every PASS_AUTO payload is also enqueued to the outbox
 * before we return, so if the `after()` call crashes or the Prognosis
 * write fails retryably, the outbox drain will eventually deliver it.
 */
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

  let writeQueued = false;
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

    // Persist to the outbox first — this is the only thing that MUST
    // happen before the response returns, to guarantee durability.
    await enqueuePrognosis(payload);
    writeQueued = true;

    // The actual Prognosis write + receipt email run AFTER the response
    // is streamed to the browser.
    after(async () => {
      try {
        const write = await svc.prognosis.upsertMemberNin(payload);
        await audit({
          action: `prognosis.upsert.${write.ok ? "ok" : "fail"}`,
          actorType: "system",
          memberId: parsed.beneficiaryId,
          traceId: tid,
          payload: { txnRef: ref },
        });
        if (write.ok) {
          await recordNinSuccess();
          if (result.verifiedFullName) {
            await notifyNinValidated({
              principalEnrolleeId: session.enrolleeId,
              beneficiaryName: result.verifiedFullName,
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        log.error({ err: String(err), txnRef: ref }, "after.prognosis.write.fail");
      }

      // Update the dependant's DOB on Prognosis to the NIMC-verified
      // value. Runs only when the NIN write succeeded — we use the same
      // dobFromNin that was already validated by NIMC a moment ago.
      if (result.dobFromNin) {
        try {
          const dobResult = await updateEnrolleeDob(parsed.beneficiaryId, result.dobFromNin);
          await audit({
            action: `prognosis.dob.update.${dobResult.ok ? "ok" : "fail"}`,
            actorType: "system",
            memberId: parsed.beneficiaryId,
            traceId: tid,
          });
          if (dobResult.ok) await recordDobUpdateSuccess();
        } catch (err) {
          log.error({ err: String(err) }, "after.prognosis.dob.fail");
        }
      }
    });
  }

  revalidatePath("/household");
  return { beneficiaryId: parsed.beneficiaryId, result, writeQueued };
}
