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

  it("initial-only surname auto-passes at the 50% threshold", () => {
    // Client policy (Apr 2026): 50% name match + exact DOB = auto-pass.
    const r = scoreNameMatch("Janet Smith", "J. Smith");
    expect(r.tier).toBe("auto-pass");
    expect(r.score).toBeGreaterThanOrEqual(0.5);
  });

  it("non-overlapping character sets → fail", () => {
    // Single-token disjoint strings drive Jaro-Winkler to 0, well
    // below the 0.40 manual-review floor. (Space characters in
    // multi-token strings contribute to the similarity, so we use
    // single tokens here to isolate the pure-letter case.)
    const r = scoreNameMatch("aaaa", "zzzz");
    expect(r.tier).toBe("fail");
    expect(r.score).toBeLessThan(0.4);
  });
});
