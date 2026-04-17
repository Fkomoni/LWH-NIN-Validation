import { describe, it, expect } from "vitest";
import { scoreNameMatch } from "@/lib/validation/scoreName";

describe("scoreNameMatch", () => {
  it("exact match → auto-pass", () => {
    const r = scoreNameMatch("Adekunle Bashorun", "Adekunle Bashorun");
    expect(r.score).toBe(1);
    expect(r.tier).toBe("auto-pass");
  });

  it("case + diacritics + title differences → auto-pass", () => {
    const r = scoreNameMatch("Dr. Chiamaka Okónkwó", "CHIAMAKA OKONKWO");
    expect(r.tier).toBe("auto-pass");
  });

  it("reversed token order → auto-pass (token-sort strategy)", () => {
    const r = scoreNameMatch("Okoro Chidinma", "Chidinma Okoro");
    expect(r.tier).toBe("auto-pass");
  });

  it("initial-only surname drops to manual review", () => {
    const r = scoreNameMatch("Janet Smith", "J. Smith");
    expect(["manual-review", "fail"]).toContain(r.tier);
    expect(r.score).toBeLessThan(0.92);
  });

  it("completely different names → fail", () => {
    const r = scoreNameMatch("Adekunle Bashorun", "Grace Okoro");
    expect(r.tier).toBe("fail");
  });
});
