import "server-only";
import type { PrognosisService, PrognosisUpsertResult } from "../types";
import { upsertMemberNin } from "../http/PrognosisClient";
import { log } from "@/lib/logger";

/**
 * PrognosisService — delegates to the HTTP client (intercepted by MSW
 * in Phase 1). Returns the result shape expected by the orchestrator;
 * retries live in the outbox (src/server/outbox.ts), not here.
 */
export const mockPrognosisService: PrognosisService = {
  async upsertMemberNin(payload): Promise<PrognosisUpsertResult> {
    const res = await upsertMemberNin(payload);
    if (res.ok) return { ok: true, txnRef: res.txnRef };
    log.warn(
      { txnRef: res.txnRef, error: res.error, retryable: res.retryable },
      "prognosis.upsert.fail",
    );
    return {
      ok: false,
      reason: res.error === "DUPLICATE" ? "DUPLICATE" : "PROVIDER_ERROR",
      retryable: res.retryable,
    };
  },
};
