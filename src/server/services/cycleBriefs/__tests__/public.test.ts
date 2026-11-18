import { describe, expect, it } from "vitest";
import { projectPublicBrief, type BriefProjectionInput } from "../public";

/**
 * The public projection is the one place a Cycle brief leaves the database
 * for anonymous readers. These tests feed it a row stuffed with everything
 * the team sees (drafts, who set a status, names, ids) and check none of it
 * comes out (D-0094, D-0097).
 */

const SECRET_NAME = "Noah Secretname";
const SECRET_DRAFT = "DRAFT-reworded-not-signed-off";

function row(overrides: Partial<BriefProjectionInput> = {}): BriefProjectionInput {
  // Extra fields mimic a careless `include` upstream; the projection must ignore them.
  const outcome = {
    id: "outcome_cuid_1",
    position: 0,
    publicText: "The Sudan team uses the app every week",
    publicWhy: "Their usage decides the next country",
    removedAt: null,
    status: "at_risk",
    statusSetAt: new Date("2030-03-09T10:00:00Z"),
    changedAt: null,
    statusSetById: "user_cuid_secret",
    statusSetBy: { name: SECRET_NAME },
    draftText: SECRET_DRAFT,
    draftWhy: SECRET_DRAFT,
    goalId: 98,
    features: [{ featureId: "feature_cuid_1", feature: { name: "Ticket 1234" } }],
  };
  return {
    planSignedOffAt: new Date("2030-03-02T09:00:00Z"),
    cycle: { name: "Cycle 21", slug: "cycle-21", startDate: new Date("2030-03-02"), endDate: new Date("2030-03-16") },
    outcomes: [outcome],
    planSignedOffById: "user_cuid_owner",
    ...overrides,
  } as BriefProjectionInput;
}

describe("projectPublicBrief", () => {
  it("returns nothing for a brief whose plan was never signed off", () => {
    expect(projectPublicBrief(row({ planSignedOffAt: null }))).toBeNull();
  });

  it("shows the live status with the date it was set", () => {
    const brief = projectPublicBrief(row());
    expect(brief?.outcomes[0]).toEqual({
      text: "The Sudan team uses the app every week",
      why: "Their usage decides the next country",
      status: "at_risk",
      statusSetAt: new Date("2030-03-09T10:00:00Z"),
      changedAt: null,
    });
  });

  it("never leaks drafts, who set a status, names or ids", () => {
    const json = JSON.stringify(projectPublicBrief(row()));
    for (const secret of [
      SECRET_NAME,
      SECRET_DRAFT,
      "user_cuid_secret",
      "user_cuid_owner",
      "outcome_cuid_1",
      "feature_cuid_1",
      "Ticket 1234",
      "goalId",
      "statusSetById",
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it("hides outcomes that were never signed off or whose removal was signed off", () => {
    const brief = projectPublicBrief(
      row({
        outcomes: [
          { position: 0, publicText: null, publicWhy: null, removedAt: null, status: null, statusSetAt: null, changedAt: null },
          { position: 1, publicText: "Gone", publicWhy: "x", removedAt: new Date(), status: null, statusSetAt: null, changedAt: null },
          { position: 2, publicText: "Kept", publicWhy: "y", removedAt: null, status: null, statusSetAt: null, changedAt: null },
        ],
      }),
    );
    expect(brief?.outcomes.map((o) => o.text)).toEqual(["Kept"]);
  });

  it("drops a status value outside the vocabulary", () => {
    const brief = projectPublicBrief(
      row({
        outcomes: [
          { position: 0, publicText: "A", publicWhy: "b", removedAt: null, status: "derived_from_tickets", statusSetAt: new Date(), changedAt: null },
        ],
      }),
    );
    expect(brief?.outcomes[0]).toMatchObject({ status: null, statusSetAt: null, changedAt: null });
  });
});
