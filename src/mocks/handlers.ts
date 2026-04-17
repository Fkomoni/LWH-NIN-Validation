import { http, HttpResponse, delay } from "msw";
import { nimcFixtures, type NimcFixture } from "@/fixtures/nimc";

type Body = { nin?: string };

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
];
