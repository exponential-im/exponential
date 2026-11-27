import { describe, expect, it } from "vitest";
import {
  countTitleWords,
  decisionRowText,
  groupDecisionsByLink,
  scopeGroupName,
  type DecisionGroupLink,
} from "../decision-groups";

const geocoding = { id: "feat-geo", name: "Geocoding of signals" };
const v5 = { id: "scope-v5", version: "V5", description: "Dataminr text location", feature: geocoding };
const ticket = { id: "tkt-1", number: 1630, shortId: "calm.otter", title: "Locate Dataminr signals" };

function decision(id: string, decidedAt: string | null, links: DecisionGroupLink[]) {
  return { id, decidedAt, links };
}

describe("decisionRowText", () => {
  it("shows the title when there is one", () => {
    expect(decisionRowText({ title: "Text place beats Dataminr location", statement: "A long sentence." })).toBe(
      "Text place beats Dataminr location",
    );
  });

  it("falls back to the statement for a decision with no title", () => {
    expect(decisionRowText({ title: null, statement: "A long sentence." })).toBe("A long sentence.");
    expect(decisionRowText({ title: "   ", statement: "A long sentence." })).toBe("A long sentence.");
    expect(decisionRowText({ statement: "A long sentence." })).toBe("A long sentence.");
  });
});

describe("countTitleWords", () => {
  it("counts words, ignoring extra spaces", () => {
    expect(countTitleWords("  Text place  beats Dataminr location ")).toBe(5);
    expect(countTitleWords("")).toBe(0);
  });
});

describe("groupDecisionsByLink", () => {
  it("puts unlinked decisions in General, first, and keeps General when it is empty", () => {
    const groups = groupDecisionsByLink([decision("d1", "2026-11-25", [{ scope: v5 }])]);
    expect(groups.map((g) => [g.name, g.decisions.length])).toEqual([
      ["General", 0],
      ["Geocoding of signals > V5: Dataminr text location", 1],
    ]);
  });

  it("files a decision with several links in one group only: scope, then feature, then ticket", () => {
    const groups = groupDecisionsByLink([
      decision("all-three", "2026-11-25", [{ ticket }, { feature: geocoding }, { scope: v5 }]),
      decision("feature-and-ticket", "2026-11-24", [{ ticket }, { feature: geocoding }]),
      decision("ticket-only", "2026-11-23", [{ ticket }]),
    ]);
    expect(groups.map((g) => [g.kind, g.decisions.map((d) => d.id)])).toEqual([
      ["general", []],
      ["scope", ["all-three"]],
      ["feature", ["feature-and-ticket"]],
      ["ticket", ["ticket-only"]],
    ]);
    expect(groups.flatMap((g) => g.decisions)).toHaveLength(3);
  });

  it("counts each group and dates it by its newest decided date", () => {
    const groups = groupDecisionsByLink([
      decision("a", "2026-11-20", [{ scope: v5 }]),
      decision("b", "2026-11-25", [{ scope: v5 }]),
      decision("c", null, [{ scope: v5 }]),
    ]);
    const scope = groups.find((g) => g.kind === "scope")!;
    expect(scope.decisions).toHaveLength(3);
    expect(scope.newestDecidedAt?.toISOString().slice(0, 10)).toBe("2026-11-25");
  });

  it("orders linked groups newest decided first, undated last", () => {
    const groups = groupDecisionsByLink([
      decision("old", "2026-01-01", [{ ticket }]),
      decision("undated", null, [{ feature: geocoding }]),
      decision("new", "2026-11-25", [{ scope: v5 }]),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["general", "scope", "ticket", "feature"]);
  });
});

describe("scopeGroupName", () => {
  it("names the scope by its version alone when it has no description", () => {
    expect(scopeGroupName({ ...v5, description: " " })).toBe("Geocoding of signals > V5");
  });
});
