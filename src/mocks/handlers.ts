import { http, HttpResponse, delay } from "msw";
import { nimcFixtures, type NimcFixture } from "@/fixtures/nimc";

type Body = { nin?: string };

/** Same txnRef returns the same result — simulates Prognosis idempotency. */
const prognosisSeen = new Map<string, { status: number }>();
/** How many times each member has been pushed — used by the flaky scenario. */
const prognosisAttempts = new Map<string, number>();

/**
 * MSW handlers for the provider APIs. Phase-1 only — Phase 2 wires real
 * endpoints behind the same `NimcClient` / future `PrognosisClient`.
 */
export const handlers = [
  http.post("http://mock.nimc.local/v1/verify", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Body;
    const nin = body.nin ?? "";
    const fx: NimcFixture = nimcFixtures[nin] ?? { outcome: "NOT_FOUND" };

    if (fx.outcome === "TIMEOUT") {
      // Let AbortController trip. 10s > the client's 5s timeout.
      await delay(10_000);
      return HttpResponse.json({ status: "NOT_FOUND" });
    }
    if (fx.outcome === "PROVIDER_ERROR") {
      return new HttpResponse("upstream error", { status: 502 });
    }
    return HttpResponse.json({
      status: fx.outcome,
      fullName: fx.fullName,
      dob: fx.dob,
    });
  }),

  http.post("http://mock.prognosis.local/v1/members/nin", async ({ request }) => {
    const key = request.headers.get("Idempotency-Key") ?? "";
    const existing = prognosisSeen.get(key);
    if (existing) return new HttpResponse(null, { status: existing.status });

    const body = (await request.json().catch(() => ({}))) as { memberId?: string };
    const memberId = body.memberId ?? "";

    // Flaky-downstream simulation: memberIds ending "-flaky" 5xx on the
    // first attempt and succeed afterwards. Used to exercise the outbox.
    const attempts = (prognosisAttempts.get(memberId) ?? 0) + 1;
    prognosisAttempts.set(memberId, attempts);
    if (memberId.endsWith("-flaky") && attempts === 1) {
      return new HttpResponse("upstream error", { status: 502 });
    }

    prognosisSeen.set(key, { status: 200 });
    return HttpResponse.json({ ok: true });
  }),
];
