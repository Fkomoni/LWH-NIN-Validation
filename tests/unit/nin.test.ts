import { describe, it, expect } from "vitest";
import { isValidNinFormat } from "@/lib/validation/nin";

describe("isValidNinFormat", () => {
  it("accepts 11 digits", () => {
    expect(isValidNinFormat("12345678901")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isValidNinFormat("  12345678901  ")).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["1234567890", "10 digits"],
    ["123456789012", "12 digits"],
    ["1234567890a", "non-digit"],
    ["12345 78901", "space inside"],
  ])("rejects %j (%s)", (input) => {
    expect(isValidNinFormat(input)).toBe(false);
  });
});
