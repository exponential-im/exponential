import { describe, it, expect } from "vitest";
import { keywords, suggestPillars } from "../suggestPillars";

const devops = {
  id: "devops",
  name: "DevOps",
  description: "Deploys, backups, monitoring and on-call for production infrastructure.",
};
const gtm = {
  id: "gtm",
  name: "Go-to-market",
  description: "Pricing, launches, positioning, sales and marketing campaigns.",
};
const health = { id: "health", name: "Health", description: null };

describe("keywords", () => {
  it("drops short words, stopwords, URL noise and words with digits, and stems plurals", () => {
    expect([...keywords("https://www.example.com/the-backups-are-running-v2-2026")]).toEqual([
      "example",
      "backup",
      "runn",
    ]);
  });
});

describe("suggestPillars", () => {
  it("suggests a Pillar named in the text", () => {
    expect(suggestPillars([devops, gtm, health], "Health check for the new gym routine")).toEqual(["health"]);
  });

  it("suggests a Pillar sharing two keywords with its description", () => {
    expect(suggestPillars([devops, gtm], "Postgres backups failing in production")).toEqual(["devops"]);
  });

  it("does not suggest on a single shared keyword", () => {
    expect(suggestPillars([devops, gtm], "Production of the school play")).toEqual([]);
  });

  it("ranks a name match above a description match", () => {
    const pricing = { id: "pricing", name: "Pricing", description: null };
    expect(suggestPillars([gtm, pricing], "Pricing page for the launch campaign")).toEqual([
      "pricing",
      "gtm",
    ]);
  });

  it("suggests nothing for empty text", () => {
    expect(suggestPillars([devops], "   ")).toEqual([]);
  });
});
