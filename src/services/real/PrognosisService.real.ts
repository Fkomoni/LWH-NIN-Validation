import "server-only";
import type { PrognosisService, PrognosisUpsertResult } from "../types";
import { getPrognosisToken } from "../http/PrognosisAuth";
import { log } from "@/lib/logger";

/**
 * PrognosisService — write path.
 *
 * ⚠️ GAP (tracked in docs/architecture/open-questions.md §A2):
 * Leadway has confirmed the Prognosis **read** endpoints
 * (GetEnrolleeBioDataByEnrolleeID, GetEnrolleeDependantsByEnrolleeID)
 * and the Login endpoint, but we have NOT yet been given the
 * **update** endpoint for writing a verified NIN onto an enrollee
 * record. Until the client confirms it, this file posts to the path
 * configured by `PROGNOSIS_NIN_UPDATE_PATH` (defaulting to a plausible
 * "/EnrolleeProfile/UpdateEnrolleeNIN") and treats any 4xx as a
 * configuration error rather than a data error — the outbox will park
 * the write safely without double-calling NIMC.
 *
 * When the real endpoint + body shape land, only this file needs to
 * change; the `PrognosisUpdatePayload` at the call site is stable.
 */

const DEFAULT_PATH = "/EnrolleeProfile/UpdateEnrolleeNIN";

export const realPrognosisService: PrognosisService = {
  async upsertMemberNin(payload): Promise<PrognosisUpsertResult> {
    const base = process.env.PROGNOSIS_BASE_URL;
    const path = process.env.PROGNOSIS_NIN_UPDATE_PATH ?? DEFAULT_PATH;
    if (!base) {
      log.error({}, "prognosis.update.missing-base-url");
      return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
    }

    try {
      const token = await getPrognosisToken();
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "Idempotency-Key": payload.txnRef,
        },
        body: JSON.stringify({
          EnrolleeID: payload.memberId,
          NIN: payload.nin,
          VerifiedFullName: payload.verifiedFullName,
          DateOfBirth: payload.dobFromNin,
          ValidationStatus: payload.validationStatus,
          ValidatedAt: payload.validatedAt,
          Source: payload.source,
          TxnRef: payload.txnRef,
        }),
      });
      if (res.status === 409) {
        return { ok: false, reason: "DUPLICATE", retryable: false };
      }
      if (res.status >= 500) {
        return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
      }
      if (!res.ok) {
        // 4xx (not duplicate) — likely our payload doesn't match the
        // real endpoint contract. The outbox will hold it until the
        // endpoint is confirmed and redeployed.
        log.error({ status: res.status, path }, "prognosis.update.4xx");
        return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
      }
      return { ok: true, txnRef: payload.txnRef };
    } catch (err) {
      log.error({ err: String(err) }, "prognosis.update.fail");
      return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
    }
  },
};
