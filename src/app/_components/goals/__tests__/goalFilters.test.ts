import { describe, it, expect } from "vitest";
import {
  GOAL_FILTER_CONFIG,
  NO_PILLAR_FILTER_VALUE,
  buildGoalFilterConfig,
  filterGoalRows,
  matchesPillarFilter,
  type GoalLike,
} from "../goalFilters";

const goal = (title: string, pillarIds: string[]): GoalLike => ({
  title,
  status: "active",
  pillarTags: pillarIds.map((tagId) => ({ tagId })),
});

const goals = [
  goal("Ship the API", ["p-eng"]),
  goal("Raise the round", ["p-fund"]),
  goal("Hire a designer", ["p-eng", "p-people"]),
  goal("Unfiled", []),
];

describe("matchesPillarFilter", () => {
  it("passes everything when nothing is selected", () => {
    expect(matchesPillarFilter([], undefined)).toBe(true);
    expect(matchesPillarFilter(["p-eng"], [])).toBe(true);
  });

  it("matches an item under any selected Pillar", () => {
    expect(matchesPillarFilter(["p-eng", "p-people"], ["p-people"])).toBe(true);
    expect(matchesPillarFilter(["p-fund"], ["p-eng"])).toBe(false);
  });

  it("matches an unfiled item only when No Pillar is selected", () => {
    expect(matchesPillarFilter([], ["p-eng"])).toBe(false);
    expect(matchesPillarFilter([], [NO_PILLAR_FILTER_VALUE])).toBe(true);
    expect(matchesPillarFilter(["p-eng"], [NO_PILLAR_FILTER_VALUE])).toBe(false);
  });
});

describe("filterGoalRows by Pillar", () => {
  it("keeps the goals filed under a selected Pillar", () => {
    const titles = filterGoalRows(goals, { pillar: ["p-eng"] }, "").map((g) => g.title);
    expect(titles).toEqual(["Ship the API", "Hire a designer"]);
  });

  it("combines Pillars and No Pillar as alternatives", () => {
    const titles = filterGoalRows(
      goals,
      { pillar: ["p-fund", NO_PILLAR_FILTER_VALUE] },
      "",
    ).map((g) => g.title);
    expect(titles).toEqual(["Raise the round", "Unfiled"]);
  });

  it("treats a goal without pillarTags as unfiled", () => {
    const bare: GoalLike = { title: "Legacy", status: "active" };
    expect(filterGoalRows([bare], { pillar: [NO_PILLAR_FILTER_VALUE] }, "")).toHaveLength(1);
    expect(filterGoalRows([bare], { pillar: ["p-eng"] }, "")).toHaveLength(0);
  });
});

describe("buildGoalFilterConfig", () => {
  it("leaves the Pillar field out when the workspace has no Pillars", () => {
    expect(buildGoalFilterConfig([], {})).toBe(GOAL_FILTER_CONFIG);
  });

  it("keeps the Pillar field while a stale selection is still applied", () => {
    const config = buildGoalFilterConfig([], { pillar: ["p-gone"] });
    expect(config.fields.map((f) => f.key)).toContain("pillar");
  });

  it("offers each Pillar, marks inactive ones, and ends with No Pillar", () => {
    const config = buildGoalFilterConfig(
      [
        { id: "p-eng", name: "Engineering", archivedAt: null },
        { id: "p-old", name: "Legacy", archivedAt: new Date("2026-01-01") },
      ],
      {},
    );
    const field = config.fields.find((f) => f.key === "pillar");
    expect(field?.type).toBe("multi-select");
    expect(field && "options" in field ? field.options : []).toEqual([
      { value: "p-eng", label: "Engineering" },
      { value: "p-old", label: "Legacy (inactive)" },
      { value: NO_PILLAR_FILTER_VALUE, label: "No Pillar" },
    ]);
  });
});
