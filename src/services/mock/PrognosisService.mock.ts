import type { PrognosisService, PrognosisUpsertResult } from "../types";

const seen = new Map<string, PrognosisUpsertResult>();

export const mockPrognosisService: PrognosisService = {
  async upsertMemberNin(payload) {
    const existing = seen.get(payload.txnRef);
    if (existing) return existing;

    // Simulate a flaky downstream once in a while when the payload signals it.
    if (payload.memberId.endsWith("-flaky")) {
      const r: PrognosisUpsertResult = {
        ok: false,
        reason: "PROVIDER_ERROR",
        retryable: true,
      };
      // Don't cache transient errors.
      return r;
    }

    const r: PrognosisUpsertResult = { ok: true, txnRef: payload.txnRef };
    seen.set(payload.txnRef, r);
    return r;
  },
};
