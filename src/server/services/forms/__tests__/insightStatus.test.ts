// @vitest-environment node
/**
 * Unit tests for the insight status reference: the signed capability a
 * `create_insight` form hands back at intake, and the state it can be traded
 * for. Pins that a ref only verifies for the form that issued it, that the read
 * is scoped to insights that form created, and that nothing but triage state
 * leaves. Prisma is mocked, so no real DB is touched.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  exposesInsightStatus,
  insightIdFromStatusRef,
  insightStatusRefFor,
  insightStatusRefFromOutcomes,
  readInsightStatuses,
} from "../insightStatus";
import { formInsightSource } from "../destinations/CreateInsightDestination";

const db = mockDeep<PrismaClient>();
const form = { slug: "board", workspaceId: "ws-1" };
const optedIn = [
  { type: "create_insight", config: { productId: "p1", exposeStatus: true } },
];

beforeEach(() => {
  mockReset(db);
  process.env.AUTH_SECRET = "test-secret";
});

describe("insight status ref", () => {
  it("round-trips for the form that issued it", () => {
    const ref = insightStatusRefFor("board", "ins1");
    expect(insightIdFromStatusRef("board", ref)).toBe("ins1");
  });

  it.each([
    ["another form's slug", () => insightIdFromStatusRef("other", insightStatusRefFor("board", "ins1"))],
    ["a swapped insight id", () => insightIdFromStatusRef("board", insightStatusRefFor("board", "ins1").replace("ins1", "ins2"))],
    ["a bare insight id", () => insightIdFromStatusRef("board", "ins1")],
    ["an empty signature", () => insightIdFromStatusRef("board", "ins1.")],
    ["a different signing secret", () => insightIdFromStatusRef("board", insightStatusRefFor("board", "ins1", "other-secret"))],
  ])("rejects %s", (_name, read) => {
    expect(read()).toBeNull();
  });
});

describe("exposesInsightStatus", () => {
  it("is true only when a create_insight destination sets exposeStatus: true", () => {
    expect(exposesInsightStatus(optedIn)).toBe(true);
    expect(exposesInsightStatus([{ type: "create_insight", config: { productId: "p1" } }])).toBe(false);
    expect(exposesInsightStatus([{ type: "create_insight", config: { exposeStatus: "true" } }])).toBe(false);
    expect(exposesInsightStatus([{ type: "create_deal", config: { exposeStatus: true } }])).toBe(false);
    expect(exposesInsightStatus(null)).toBe(false);
  });
});

describe("insightStatusRefFromOutcomes", () => {
  const created = [{ type: "create_insight", ok: true, detail: { insightId: "ins1" } }];

  it("returns a verifiable ref when the form opted in and an insight was created", () => {
    const ref = insightStatusRefFromOutcomes("board", optedIn, created);
    expect(ref && insightIdFromStatusRef("board", ref)).toBe("ins1");
  });

  it("returns null when the form did not opt in", () => {
    expect(
      insightStatusRefFromOutcomes("board", [{ type: "create_insight", config: {} }], created),
    ).toBeNull();
  });

  it("returns null when the destination failed", () => {
    expect(
      insightStatusRefFromOutcomes("board", optedIn, [
        { type: "create_insight", ok: false, error: "boom" },
      ]),
    ).toBeNull();
  });
});

describe("readInsightStatuses", () => {
  it("never queries when no ref verifies", async () => {
    expect(await readInsightStatuses(db, form, ["ins1", "ins2.forged"])).toEqual([]);
    expect(db.insight.findMany).not.toHaveBeenCalled();
  });

  it("scopes the read to verified ids created through this form in its workspace", async () => {
    db.insight.findMany.mockResolvedValue([]);
    const ref = insightStatusRefFor("board", "ins1");

    await readInsightStatuses(db, form, [ref, "ins2.forged"]);

    expect(db.insight.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["ins1"] },
          source: "form:board",
          product: { workspaceId: "ws-1" },
        },
      }),
    );
  });

  it("returns triage state only, keyed by ref", async () => {
    const ref = insightStatusRefFor("board", "ins1");
    db.insight.findMany.mockResolvedValue([
      {
        id: "ins1",
        status: "LINKED",
        publishedAt: new Date(),
        parkedAt: null,
        features: [{ feature: { status: "IN_PROGRESS" } }],
        duplicateOf: null,
      },
    ] as never);

    expect(await readInsightStatuses(db, form, [ref])).toEqual([
      {
        ref,
        status: "LINKED",
        published: true,
        parked: false,
        duplicate: false,
        featureStatuses: ["IN_PROGRESS"],
      },
    ]);
  });

  it("reports a duplicate with the state of the insight it defers to", async () => {
    const ref = insightStatusRefFor("board", "ins1");
    db.insight.findMany.mockResolvedValue([
      {
        id: "ins1",
        status: "INBOX",
        publishedAt: null,
        parkedAt: null,
        features: [],
        duplicateOf: {
          status: "LINKED",
          publishedAt: new Date(),
          parkedAt: null,
          features: [{ feature: { status: "SHIPPED" } }],
          product: { workspaceId: "ws-1" },
        },
      },
    ] as never);

    expect(await readInsightStatuses(db, form, [ref])).toEqual([
      {
        ref,
        status: "LINKED",
        published: true,
        parked: false,
        duplicate: true,
        featureStatuses: ["SHIPPED"],
      },
    ]);
  });

  it("never reports a canonical insight from another workspace", async () => {
    const ref = insightStatusRefFor("board", "ins1");
    db.insight.findMany.mockResolvedValue([
      {
        id: "ins1",
        status: "INBOX",
        publishedAt: null,
        parkedAt: null,
        features: [],
        duplicateOf: {
          status: "LINKED",
          publishedAt: new Date(),
          parkedAt: null,
          features: [{ feature: { status: "SHIPPED" } }],
          product: { workspaceId: "ws-other" },
        },
      },
    ] as never);

    expect(await readInsightStatuses(db, form, [ref])).toEqual([
      {
        ref,
        status: "INBOX",
        published: false,
        parked: false,
        duplicate: false,
        featureStatuses: [],
      },
    ]);
  });

  it("reads with the same source stamp the create_insight destination writes", async () => {
    db.insight.findMany.mockResolvedValue([]);
    await readInsightStatuses(db, form, [insightStatusRefFor("board", "ins1")]);

    const call = db.insight.findMany.mock.calls[0]![0]!;
    expect(call.where?.source).toBe(formInsightSource("board"));
  });
});
