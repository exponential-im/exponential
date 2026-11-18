import { describe, it, expect } from "vitest";
import { pillarsAfterProjectChoice, projectsForPillars } from "../captureRules";

const railway = { id: "railway", pillarTagIds: ["devops"] };
const launch = { id: "launch", pillarTagIds: ["gtm"] };
const both = { id: "both", pillarTagIds: ["devops", "gtm"] };
const none = { id: "none", pillarTagIds: [] };

describe("projectsForPillars", () => {
  it("offers every project while no Pillar is ticked", () => {
    expect(projectsForPillars([railway, launch, none], [])).toEqual([railway, launch, none]);
  });

  it("narrows to projects under any ticked Pillar", () => {
    expect(projectsForPillars([railway, launch, both, none], ["devops"])).toEqual([railway, both]);
    expect(projectsForPillars([railway, launch, both, none], ["devops", "gtm"])).toEqual([
      railway,
      launch,
      both,
    ]);
  });
});

describe("pillarsAfterProjectChoice", () => {
  it("ticks the chosen project's Pillars, keeping existing ticks once each", () => {
    expect(pillarsAfterProjectChoice(["gtm"], both)).toEqual(["gtm", "devops"]);
  });

  it("leaves the ticks alone when the project is cleared", () => {
    expect(pillarsAfterProjectChoice(["gtm"], null)).toEqual(["gtm"]);
  });
});
