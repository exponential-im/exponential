import { describe, it, expect } from "vitest";
import { looksOngoing } from "../looksOngoing";

const now = new Date("2026-11-18T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

describe("looksOngoing", () => {
  it("flags an active project with no end date older than 90 days", () => {
    expect(looksOngoing({ status: "ACTIVE", endDate: null, createdAt: daysAgo(91) }, now)).toBe(true);
  });

  it("leaves a younger project alone", () => {
    expect(looksOngoing({ status: "ACTIVE", endDate: null, createdAt: daysAgo(89) }, now)).toBe(false);
  });

  it("leaves a project with an end date, or one that is not active, alone", () => {
    expect(looksOngoing({ status: "ACTIVE", endDate: daysAgo(-10), createdAt: daysAgo(200) }, now)).toBe(false);
    expect(looksOngoing({ status: "ON_HOLD", endDate: null, createdAt: daysAgo(200) }, now)).toBe(false);
  });
});
