import { describe, it, expect } from "vitest";
import { describeRecurrence } from "../recurrence";

describe("describeRecurrence", () => {
  it("phrases daily, weekly with days, and monthly patterns", () => {
    expect(describeRecurrence({ repeatPattern: "daily", repeatDays: [], repeatInterval: 1 })).toBe("Every day");
    expect(describeRecurrence({ repeatPattern: "weekly", repeatDays: [4, 1], repeatInterval: 2 })).toBe(
      "Every 2 weeks on Mon, Thu",
    );
    expect(describeRecurrence({ repeatPattern: "monthly", repeatDays: [], repeatInterval: 1 })).toBe("Every month");
  });

  it("falls back for a custom pattern", () => {
    expect(describeRecurrence({ repeatPattern: "custom", repeatDays: [], repeatInterval: 1 })).toBe("Repeats");
  });
});
