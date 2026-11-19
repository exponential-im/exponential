import { describe, expect, it } from "vitest";
import {
  isNameIdentityKey,
  participantDisplayName,
  participantEmail,
  participantIdentityKey,
} from "../participantIdentity";

describe("participantIdentityKey", () => {
  it("uses a real email when there is one", () => {
    expect(participantIdentityKey({ email: "dev@example.com", name: "Dev" })).toBe(
      "dev@example.com",
    );
  });

  it("falls back to a lowercased name sentinel", () => {
    expect(participantIdentityKey({ email: null, name: "Inès" })).toBe("name:inès");
  });

  it("is stable for the same name in different cases", () => {
    expect(participantIdentityKey({ name: "SELIM" })).toBe(
      participantIdentityKey({ name: "selim" }),
    );
  });

  it("still produces a key for a nameless, emailless person", () => {
    // Must not be "" — that would collide with every other such row under
    // @@unique([transcriptionSessionId, email]).
    expect(participantIdentityKey({})).toBe("name:");
  });
});

describe("isNameIdentityKey", () => {
  it("distinguishes the sentinel from an address", () => {
    expect(isNameIdentityKey("name:inès")).toBe(true);
    expect(isNameIdentityKey("dev@example.com")).toBe(false);
    expect(isNameIdentityKey(null)).toBe(false);
  });
});

describe("participantEmail", () => {
  // The reported bug: this value went to `decision.create`, whose
  // `z.string().email()` rejected the whole write.
  it("is null for a name sentinel, never the sentinel itself", () => {
    expect(participantEmail({ email: "name:inès" })).toBeNull();
    expect(participantEmail({ email: "name:selim" })).toBeNull();
  });

  it("passes a real address through", () => {
    expect(participantEmail({ email: "dev@example.com" })).toBe("dev@example.com");
  });

  it("is null for missing input", () => {
    expect(participantEmail({ email: null })).toBeNull();
    expect(participantEmail(null)).toBeNull();
    expect(participantEmail(undefined)).toBeNull();
  });
});

describe("participantDisplayName", () => {
  it("prefers the name column", () => {
    expect(participantDisplayName({ name: "Inès", email: "name:inès" })).toBe("Inès");
  });

  it("falls back to a real email", () => {
    expect(participantDisplayName({ name: null, email: "dev@example.com" })).toBe(
      "dev@example.com",
    );
  });

  it("recovers the name from a sentinel rather than printing it", () => {
    // `name ?? email` used to render "name:inès" on screen.
    expect(participantDisplayName({ name: null, email: "name:inès" })).toBe("inès");
    expect(participantDisplayName({ name: "   ", email: "name:selim" })).toBe("selim");
  });

  it("uses the fallback when nothing is recoverable", () => {
    expect(participantDisplayName({ name: null, email: "name:" })).toBe("Unknown");
    expect(participantDisplayName({ name: null, email: null }, "?")).toBe("?");
  });
});
