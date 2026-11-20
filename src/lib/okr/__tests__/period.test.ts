import { describe, it, expect } from "vitest";
import { isKeyResultOpen, periodDateRange } from "../period";

const active = { status: "active" };

describe("periodDateRange", () => {
  it.each([
    ["Q1-2026", new Date(2026, 0, 1), new Date(2026, 2, 31)],
    ["Q4-2026", new Date(2026, 9, 1), new Date(2026, 11, 31)],
    ["H2-2026", new Date(2026, 6, 1), new Date(2026, 11, 31)],
    ["Annual-2027", new Date(2027, 0, 1), new Date(2027, 11, 31)],
  ])("parses %s", (period, start, end) => {
    expect(periodDateRange(period)).toEqual({ start, end });
  });

  it("returns null for anything else", () => {
    expect(periodDateRange("2026-Q1")).toBeNull();
    expect(periodDateRange("Q5-2026")).toBeNull();
  });
});

/** An instant in UTC, so these tests read the same in any timezone. */
const utc = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m, d, h, min));

describe("isKeyResultOpen", () => {
  it("is open through the last day of a quarter, and closed from UTC midnight after it", () => {
    const kr = { period: "Q4-2026", periodEnd: null };
    expect(isKeyResultOpen(kr, active, utc(2026, 10, 20))).toBe(true);
    expect(isKeyResultOpen(kr, active, utc(2026, 11, 31, 23, 59))).toBe(true);
    expect(isKeyResultOpen(kr, active, utc(2027, 0, 1))).toBe(false);
  });

  it("follows the period for half-year and annual Key results", () => {
    expect(isKeyResultOpen({ period: "H1-2026", periodEnd: null }, active, utc(2026, 5, 30, 12))).toBe(true);
    expect(isKeyResultOpen({ period: "H1-2026", periodEnd: null }, active, utc(2026, 6, 1))).toBe(false);
    expect(isKeyResultOpen({ period: "Annual-2026", periodEnd: null }, active, utc(2026, 11, 31))).toBe(true);
    expect(isKeyResultOpen({ period: "Annual-2025", periodEnd: null }, active, utc(2026, 0, 1))).toBe(false);
  });

  it("prefers an explicit periodEnd (a date at UTC midnight) over the period string, counting its last day in full", () => {
    const kr = { period: "Q4-2026", periodEnd: utc(2026, 10, 15) };
    expect(isKeyResultOpen(kr, active, utc(2026, 10, 15, 23, 59))).toBe(true);
    expect(isKeyResultOpen(kr, active, utc(2026, 10, 16))).toBe(false);
    // And one that runs past its period string's end.
    expect(isKeyResultOpen({ period: "Q3-2026", periodEnd: utc(2026, 11, 1) }, active, utc(2026, 10, 20))).toBe(true);
  });

  it("is open for a planned or active Objective only", () => {
    const kr = { period: "Q4-2026", periodEnd: null };
    const now = utc(2026, 10, 20);
    expect(isKeyResultOpen(kr, { status: "planned" }, now)).toBe(true);
    expect(isKeyResultOpen(kr, { status: "completed" }, now)).toBe(false);
    expect(isKeyResultOpen(kr, { status: "archived" }, now)).toBe(false);
  });

  it("treats a period nobody can parse, with no periodEnd, as ended", () => {
    expect(isKeyResultOpen({ period: "someday", periodEnd: null }, active, utc(2026, 10, 20))).toBe(false);
  });
});
