import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Outbox retry: enqueue → drain too-early → drain after backoff.
 * The prognosis mock is stubbed via vi.mock so this test doesn't touch
 * the MSW layer.
 */

const upsertMock = vi.fn();
vi.mock("@/services", () => ({
  getServices: () => ({ prognosis: { upsertMemberNin: upsertMock } }),
}));

vi.mock("@/lib/logger", () => ({
  log: { info() {}, warn() {}, error() {}, debug() {} },
}));

import { enqueuePrognosis, drainPrognosisOutbox } from "@/server/outbox";
import { getMemoryKv } from "@/server/kv/memory";

describe("outbox", () => {
  beforeEach(async () => {
    await getMemoryKv().del("outbox:prognosis");
    upsertMock.mockReset();
    upsertMock
      .mockResolvedValueOnce({ ok: false, reason: "PROVIDER_ERROR", retryable: true })
      .mockResolvedValueOnce({ ok: true, txnRef: "t1" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reschedules on retryable failure then succeeds", async () => {
    await enqueuePrognosis({
      memberId: "m-1",
      nin: "12345678901",
      verifiedFullName: "X",
      dobFromNin: "1985-06-15",
      validationStatus: "VALIDATED",
      validatedAt: "2026-01-01T00:00:00Z",
      source: "self-service-portal",
      txnRef: "t1",
    });

    // nextAt is 1s after enqueue — drain now should be a no-op.
    let r = await drainPrognosisOutbox();
    expect(r.processed).toBe(0);
    expect(r.remaining).toBe(1);

    // Advance past backoff, first attempt fails → reschedule.
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    r = await drainPrognosisOutbox();
    expect(r.processed).toBe(0);
    expect(r.remaining).toBe(1);

    // Advance past the next backoff (5s), second attempt succeeds.
    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    r = await drainPrognosisOutbox();
    expect(r.processed).toBe(1);
    expect(r.remaining).toBe(0);
  });
});
