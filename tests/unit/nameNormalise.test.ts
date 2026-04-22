import { describe, it, expect } from "vitest";
import { normaliseName, sortedTokens } from "@/lib/validation/nameNormalise";

describe("normaliseName", () => {
  it("lowercases and trims", () => {
    expect(normaliseName("  John SMITH  ")).toBe("john smith");
  });

  it("strips titles", () => {
    expect(normaliseName("Dr. John Smith")).toBe("john smith");
    expect(normaliseName("Chief Alhaji Bashorun")).toBe("bashorun");
    expect(normaliseName("Hajia Aisha")).toBe("aisha");
  });

  it("removes diacritics", () => {
    expect(normaliseName("Chiamaka Okónkwó")).toBe("chiamaka okonkwo");
  });

  it("handles hyphens and punctuation", () => {
    expect(normaliseName("Anne-Marie O'Neill")).toBe("anne marie o neill");
  });

  it("handles empty and nullish", () => {
    expect(normaliseName("")).toBe("");
    // @ts-expect-error — runtime safety check
    expect(normaliseName(undefined)).toBe("");
  });
});

describe("sortedTokens", () => {
  it("sorts tokens alphabetically", () => {
    expect(sortedTokens("john smith")).toEqual(["john", "smith"]);
    expect(sortedTokens("smith john")).toEqual(["john", "smith"]);
  });
});
