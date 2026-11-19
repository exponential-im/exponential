import { describe, expect, it } from "vitest";
import { pillarPath } from "../pillarPath";

describe("pillarPath", () => {
  it("names the Pillar by its slug", () => {
    expect(pillarPath("clear", { id: "cmrkmmtbu0050jl04i32mkwk9", slug: "devops" })).toBe(
      "/w/clear/pillars/devops",
    );
  });

  it("keeps the id when the slug is empty (a name the slug rule strips entirely)", () => {
    expect(pillarPath("clear", { id: "cmrkmmtbu0050jl04i32mkwk9", slug: "" })).toBe(
      "/w/clear/pillars/cmrkmmtbu0050jl04i32mkwk9",
    );
  });
});
