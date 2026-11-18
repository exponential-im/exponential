import { describe, expect, it } from "vitest";
import { isPublished } from "../schedule";

describe("isPublished", () => {
  const now = new Date("2026-11-17T09:00:00Z");

  it("publishes posts dated today or earlier", () => {
    expect(isPublished("2026-11-17", now)).toBe(true);
    expect(isPublished("2026-02-26", now)).toBe(true);
  });

  it("holds back posts dated in the future", () => {
    expect(isPublished("2026-11-24", now)).toBe(false);
    expect(isPublished("2026-11-17T10:00:00Z", now)).toBe(false);
  });

  it("never hides a post with a missing or unreadable date", () => {
    expect(isPublished(undefined, now)).toBe(true);
    expect(isPublished("soon", now)).toBe(true);
  });
});
