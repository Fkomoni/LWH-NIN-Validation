import { describe, it, expect } from "vitest";
import { maskNin, maskPhone, maskEmail, maskName, maskPii } from "@/lib/mask";

describe("maskNin", () => {
  it("keeps only the last 3 digits", () => {
    expect(maskNin("12345678901")).toBe("********901");
  });
  it("handles short strings defensively", () => {
    expect(maskNin("12")).toBe("***");
  });
});

describe("maskPhone", () => {
  it("masks the middle", () => {
    const out = maskPhone("+2348012345678");
    expect(out.startsWith("+234")).toBe(true);
    expect(out.endsWith("678")).toBe(true);
    expect(out).toContain("*");
  });
});

describe("maskEmail", () => {
  it("keeps only the initial and domain", () => {
    expect(maskEmail("adaora@example.com")).toBe("a***@example.com");
  });
  it("handles malformed input", () => {
    expect(maskEmail("nope")).toBe("***");
  });
});

describe("maskName", () => {
  it("masks each token", () => {
    expect(maskName("Adekunle Bashorun")).toBe("A*** B***");
  });
});

describe("maskPii", () => {
  it("masks well-known keys deep-ish", () => {
    const masked = maskPii({
      nin: "12345678901",
      phone: "+2348012345678",
      email: "a@b.com",
      fullName: "Adekunle Bashorun",
      dob: "1985-06-15",
      nonsensitive: "hello",
    });
    expect(masked.nin).not.toBe("12345678901");
    expect(masked.phone).not.toBe("+2348012345678");
    expect(masked.email).not.toBe("a@b.com");
    expect(masked.fullName).not.toBe("Adekunle Bashorun");
    expect(masked.dob).toBe("****-**-**");
    expect(masked.nonsensitive).toBe("hello");
  });
});
