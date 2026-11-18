import { describe, expect, it } from "vitest";
import { pendingChange } from "../changes";

const base = { draftText: "A", draftWhy: "B", publicText: "A", publicWhy: "B", removeRequested: false, removedAt: null };

describe("pendingChange", () => {
  it("is null when the public version matches the draft", () => {
    expect(pendingChange(base)).toBeNull();
  });
  it("sees a never-public outcome as new", () => {
    expect(pendingChange({ ...base, publicText: null, publicWhy: null })).toBe("new");
  });
  it("sees a changed text or why as reworded", () => {
    expect(pendingChange({ ...base, draftText: "A2" })).toBe("reworded");
    expect(pendingChange({ ...base, draftWhy: "B2" })).toBe("reworded");
  });
  it("sees a requested removal of a public outcome as removed", () => {
    expect(pendingChange({ ...base, removeRequested: true })).toBe("removed");
  });
  it("ignores rows already removed", () => {
    expect(pendingChange({ ...base, removeRequested: true, removedAt: new Date() })).toBeNull();
  });
});
