import "server-only";
import type { PrognosisService, PrognosisUpsertResult } from "../types";
import { getPrognosisToken } from "../http/PrognosisAuth";
import { getEnrolleeBioData } from "../http/PrognosisMemberClient";
import { log } from "@/lib/logger";

/**
 * PrognosisService — write path.
 *
 * Confirmed endpoint + shapes (17 Apr 2026):
 *
 *   POST {BASE}/EnrolleeProfile/UpdateMemberData
 *   {
 *     "Gender":      "Male",
 *     "NIN":         "12345678901",
 *     "PHoneNumber": "08012345678",    // note the exact casing
 *     "Enrolleeid":  "EN-00123",
 *     "DOB":         19900115.0         // ISO date → YYYYMMDD number
 *   }
 *
 *   200 OK
 *   {
 *     "status": 200,
 *     "result": {
 *       "Success": true,
 *       "Message": "Member updated successfully.",
 *       "NewId":   "EN-00123-A",
 *       "Data":    [ { … } ]
 *     }
 *   }
 *
 *   On a **logical** failure the endpoint may still return HTTP 200
 *   with `result.Success === false` and a `Message` explaining the
 *   rejection (duplicate NIN, invalid DOB, missing field, etc.). We
 *   treat that as non-retryable so the outbox doesn't retry forever
 *   on a deterministic rejection — ops can inspect the log and requeue
 *   by hand if needed.
 */

const PATH = "/EnrolleeProfile/UpdateMemberData";

/** "1990-01-15" → 19900115 (a JSON number Prognosis deserialises as double). */
function dobToNumber(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const n = Number(iso.slice(0, 10).replace(/-/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface UpdateMemberDataResult {
  Success?: boolean;
  Message?: string;
  NewId?: string | number;
  Data?: unknown[];
}

/**
 * Prognosis writes use a different response envelope from reads.
 *   Success path:  { status: 200, result: { Success, Message, NewId, Data } }
 *   Auth failure:  { success: false, message: "…", timestamp: "…" }
 * So we look at both shapes when deciding the outcome.
 */
interface UpdateMemberDataResponse {
  status?: number;
  result?: UpdateMemberDataResult;
  // Alternate (flat) envelope — used by the auth gateway
  success?: boolean;
  message?: string;
  timestamp?: string;
}

function readOutcome(parsed: UpdateMemberDataResponse | null): {
  success?: boolean;
  message?: string;
  newId?: string | number;
} {
  if (!parsed) return {};
  if (parsed.result) {
    return {
      success: parsed.result.Success,
      message: parsed.result.Message,
      newId: parsed.result.NewId,
    };
  }
  return { success: parsed.success, message: parsed.message };
}

function messageSuggestsDuplicate(msg?: string): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes("duplicate") || m.includes("already") || m.includes("exist");
}

export const realPrognosisService: PrognosisService = {
  async upsertMemberNin(payload): Promise<PrognosisUpsertResult> {
    const base = process.env.PROGNOSIS_BASE_URL;
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

      log.info(
        {
          path: PATH,
          memberId: payload.memberId,
          txnRef: payload.txnRef,
          bodyKeys: Object.keys(body),
          hasGender: Boolean(body.Gender),
          hasPhone: Boolean(body.PHoneNumber),
          dob: body.DOB,
        },
        "prognosis.update.request",
      );

      const token = await getPrognosisToken();

      // Writes send the same `Authorization: Bearer <jwt>` that reads
      // use. This is the stable baseline. We've confirmed via live
      // probing that writes additionally fail with:
      //   - "API Key is missing"           — gateway wants another
      //                                      header we have no value for
      //   - "JWT is not well formed"       — app-level JWT validator
      //                                      rejects our token structure
      // which suggests our API user is read-scope-only on writes. Only
      // Leadway can fix this on their side; our code is structurally
      // correct and handles whatever credential they eventually provide.
      const useBearer = (process.env.PROGNOSIS_WRITE_AUTH_BEARER ?? "true") !== "false";
      const authValue = useBearer ? `Bearer ${token}` : token;

      const envHeader = process.env.PROGNOSIS_API_KEY_HEADER;
      const wantsSecondary =
        !!envHeader &&
        envHeader.trim().length > 0 &&
        envHeader.toLowerCase() !== "authorization" &&
        envHeader.toLowerCase() !== "none";

      const headers = new Headers();
      headers.set("accept", "application/json");
      headers.set("content-type", "application/json");
      headers.set("Authorization", authValue);
      headers.set("Idempotency-Key", payload.txnRef);

      let keyHeaderName: string | null = null;
      if (wantsSecondary) {
        keyHeaderName = envHeader!;
        const secondaryBearer =
          (process.env.PROGNOSIS_API_KEY_BEARER ?? "true") !== "false";
        const rawValue = process.env.PROGNOSIS_API_KEY ?? token;
        headers.set(keyHeaderName, secondaryBearer ? `Bearer ${rawValue}` : rawValue);
      }

      log.info(
        {
          path: PATH,
          txnRef: payload.txnRef,
          headerNames: [...headers.keys()],
          authorizationLen: headers.get("Authorization")?.length ?? 0,
          authorizationHead: headers.get("Authorization")?.slice(0, 12) ?? null,
          authUsesBearer: useBearer,
          keyHeader: keyHeaderName,
        },
        "prognosis.update.headers",
      );

      const res = await fetch(`${base}${PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const parsed = (await res.json().catch(() => null)) as UpdateMemberDataResponse | null;
      const outcome = readOutcome(parsed);

      log.info(
        {
          path: PATH,
          status: res.status,
          keys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
          success: outcome.success,
          message: outcome.message,
          txnRef: payload.txnRef,
        },
        "prognosis.update.response",
      );

      if (res.status === 401 || res.status === 403) {
        // Write endpoint is rejecting our bearer token. Not retryable —
        // the outbox will keep bouncing off it until creds/scope are
        // corrected.
        log.error(
          { status: res.status, message: outcome.message, txnRef: payload.txnRef },
          "prognosis.update.unauthorized",
        );
        return { ok: false, reason: "PROVIDER_ERROR", retryable: false };
      }
      if (res.status >= 500) {
        log.error(
          { status: res.status, txnRef: payload.txnRef },
          "prognosis.update.5xx",
        );
        return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
      }
      if (res.status === 409) {
        return { ok: false, reason: "DUPLICATE", retryable: false };
      }
      if (!res.ok) {
        log.error(
          { status: res.status, message: outcome.message, txnRef: payload.txnRef },
          "prognosis.update.4xx",
        );
        return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
      }

      if (outcome.success === true) {
        log.info(
          { memberId: payload.memberId, newId: outcome.newId, txnRef: payload.txnRef },
          "prognosis.update.ok",
        );
        return { ok: true, txnRef: payload.txnRef };
      }

      // Logical failure — log the Message and do NOT retry by default.
      log.warn(
        { memberId: payload.memberId, message: outcome.message, txnRef: payload.txnRef },
        "prognosis.update.rejected",
      );
      if (messageSuggestsDuplicate(outcome.message)) {
        return { ok: false, reason: "DUPLICATE", retryable: false };
      }
      return { ok: false, reason: "PROVIDER_ERROR", retryable: false };
    } catch (err) {
      log.error({ err: String(err) }, "prognosis.update.fail");
      return { ok: false, reason: "PROVIDER_ERROR", retryable: true };
    }
  },
};
