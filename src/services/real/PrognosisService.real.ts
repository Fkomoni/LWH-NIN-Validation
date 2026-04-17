import "server-only";
import type { PrognosisService, PrognosisUpsertResult } from "../types";
import { getPrognosisToken } from "../http/PrognosisAuth";
import { getEnrolleeBioData } from "../http/PrognosisMemberClient";
import { log } from "@/lib/logger";

/**
 * PrognosisService — write path.
 *
 * Confirmed endpoint (17 Apr 2026):
 *   POST {BASE}/EnrolleeProfile/UpdateMemberData
 *
 * Confirmed body shape (note the exact casing — it is provider-defined):
 *   {
 *     "Gender":       "Male",
 *     "NIN":          "12345678901",
 *     "PHoneNumber":  "08012345678",
 *     "Enrolleeid":   "EN-00123",
 *     "DOB":          19900115.0     // ISO date → number YYYYMMDD
 *   }
 *
 * The orchestrator gives us memberId (= enrolleeId), NIN, verified name,
 * and the NIN-sourced DOB. Gender + raw phone live on the enrollee bio
 * record, so we re-read the bio here before the write. This is a small
 * extra round-trip but keeps the write idempotent and self-contained,
 * and avoids leaking raw phone numbers through the UI boundary.
 */

const DEFAULT_PATH = "/EnrolleeProfile/UpdateMemberData";

/** "1990-01-15" → 19900115 (a JSON number Prognosis deserialises as double). */
function dobToNumber(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const n = Number(iso.slice(0, 10).replace(/-/g, ""));
  return Number.isFinite(n) ? n : null;
}

export const realPrognosisService: PrognosisService = {
  async upsertMemberNin(payload): Promise<PrognosisUpsertResult> {
    const base = process.env.PROGNOSIS_BASE_URL;
    const path = process.env.PROGNOSIS_NIN_UPDATE_PATH ?? DEFAULT_PATH;
    if (!base) {
      log.error({}, "prognosis.update.missing-base-url");
      return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
    }

    try {
      const bio = await getEnrolleeBioData(payload.memberId);
      if (!bio) {
        log.error({ memberId: payload.memberId }, "prognosis.update.member-not-found");
        return { ok: false, reason: "PROVIDER_ERROR", retryable: false };
      }

      const dobNum = dobToNumber(payload.dobFromNin);
      if (dobNum === null) {
        log.error(
          { memberId: payload.memberId, dob: payload.dobFromNin },
          "prognosis.update.invalid-dob",
        );
        return { ok: false, reason: "PROVIDER_ERROR", retryable: false };
      }

      const body = {
        Gender: bio.gender ?? "",
        NIN: payload.nin,
        PHoneNumber: bio.phone ?? "",
        Enrolleeid: payload.memberId,
        DOB: dobNum,
      };

      const token = await getPrognosisToken();
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "Idempotency-Key": payload.txnRef,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        return { ok: false, reason: "DUPLICATE", retryable: false };
      }
      if (res.status >= 500) {
        return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
      }
      if (!res.ok) {
        // 4xx (not duplicate) — payload rejected. Outbox will hold it
        // until we correct whatever mismatched.
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
