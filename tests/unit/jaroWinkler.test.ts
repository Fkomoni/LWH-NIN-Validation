import { describe, it, expect } from "vitest";
import { jaroSimilarity, jaroWinkler } from "@/lib/validation/jaroWinkler";

describe("jaroSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(jaroSimilarity("abc", "abc")).toBe(1);
  });
  it("returns 0 when one string is empty", () => {
    expect(jaroSimilarity("", "abc")).toBe(0);
    expect(jaroSimilarity("abc", "")).toBe(0);
  });
  it("classic reference values", () => {
    // Winkler's paper: MARTHA vs. MARHTA ≈ 0.944 jaro, 0.961 JW
    expect(jaroSimilarity("martha", "marhta")).toBeCloseTo(0.944, 2);
    expect(jaroSimilarity("dixon", "dicksonx")).toBeCloseTo(0.767, 2);
  });
});

describe("jaroWinkler", () => {
  it("is 1 for identical strings", () => {
    expect(jaroWinkler("abc", "abc")).toBe(1);
  });
  it("prefix bonus matches reference", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
    expect(jaroWinkler("dixon", "dicksonx")).toBeCloseTo(0.813, 2);
  });
  it("is lower for completely different strings", () => {
    expect(jaroWinkler("cat", "dog")).toBe(0);
  });
  it("handles order-reversed tokens poorly without pre-sort", () => {
    // Sanity: JW is position-sensitive, so reversed tokens score lower.
    expect(jaroWinkler("john smith", "smith john")).toBeLessThan(0.8);
  });
});
