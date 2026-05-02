import { describe, it, expect } from "vitest";
import { isIsoDate, dobMatches, isPlausibleDob } from "@/lib/validation/dob";

describe("isIsoDate", () => {
  it("accepts valid ISO dates", () => {
    expect(isIsoDate("1985-06-15")).toBe(true);
    expect(isIsoDate("2000-02-29")).toBe(true); // leap year
  });

  it("rejects invalid formats and calendar-impossible dates", () => {
    expect(isIsoDate("1985/06/15")).toBe(false);
    expect(isIsoDate("85-06-15")).toBe(false);
    expect(isIsoDate("1985-13-01")).toBe(false);
    expect(isIsoDate("2001-02-29")).toBe(false); // not leap
    expect(isIsoDate("1985-06-32")).toBe(false);
  });
});

describe("dobMatches", () => {
  it("matches only on exact ISO equality", () => {
    expect(dobMatches("1985-06-15", "1985-06-15")).toBe(true);
    expect(dobMatches("1985-06-15", "1985-6-15")).toBe(false);
    expect(dobMatches("1985-06-15", "1985-06-14")).toBe(false);
  });
});

describe("isPlausibleDob", () => {
  it("rejects future dates", () => {
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(isPlausibleDob(future)).toBe(false);
  });
  it("accepts a reasonable adult DOB", () => {
    expect(isPlausibleDob("1985-06-15")).toBe(true);
  });
  it("rejects unreasonably old DOBs", () => {
    expect(isPlausibleDob("1800-01-01", 0, 120)).toBe(false);
  });
});
