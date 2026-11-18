import { describe, it, expect } from "vitest";
import { splitPillarTags } from "../pillarTags";

const label = { id: "bug", category: null };
const area = { id: "repo", category: "label" };
const devops = { id: "devops", category: "pillar", archivedAt: null };
const retired = { id: "retired", category: "pillar", archivedAt: new Date("2026-11-01") };

describe("splitPillarTags", () => {
  it("puts Pillars in their own group and everything else with the labels", () => {
    expect(splitPillarTags([label, devops, area])).toEqual({
      pillars: [devops],
      labels: [label, area],
    });
  });

  it("never offers an inactive Pillar the item does not carry", () => {
    expect(splitPillarTags([devops, retired]).pillars).toEqual([devops]);
  });

  it("keeps an inactive Pillar the item already carries", () => {
    expect(splitPillarTags([devops, retired], ["retired"]).pillars).toEqual([devops, retired]);
  });
});
