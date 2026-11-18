import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { cycleBriefSection, isStatusStale } from "../sections/cycle_brief";
import { runAgendaSections } from "../runSections";
import type { SectionContext } from "../types";

const start = new Date("2030-03-11T14:00:00Z");
const DAY = 86_400_000;

function ctx(db: PrismaClient, productId: string | null = "prod-1"): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", productId } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: start } as CeremonyOccurrence,
    previousOccurrence: null,
    participantUserIds: [],
    projectIds: [],
    now: new Date("2030-03-10T08:00:00Z"),
    workspacePath: "/w/ws",
  };
}
const section = { key: "brief", type: "cycle_brief", title: "Cycle brief outcomes" };

function cycleWith(outcomes: Array<{ id: string; status: string | null; statusSetAt: Date | null }>) {
  return {
    id: "cyc-21",
    name: "Cycle 21",
    product: { slug: "clear" },
    cycleBrief: {
      planSignedOffAt: new Date("2030-03-02T09:00:00Z"),
      outcomes: outcomes.map((o) => ({ ...o, publicText: `Outcome ${o.id}` })),
    },
  };
}

describe("isStatusStale", () => {
  it("is stale at more than 7 days before the occurrence start, fresh at exactly 7", () => {
    expect(isStatusStale(new Date(start.getTime() - 7 * DAY), start)).toBe(false);
    expect(isStatusStale(new Date(start.getTime() - 7 * DAY - 1), start)).toBe(true);
  });
  it("counts a status that was never set as stale", () => {
    expect(isStatusStale(null, start)).toBe(true);
  });
});

describe("cycle_brief section", () => {
  it("lists the active cycle's signed-off outcomes and flags stale statuses relative to the occurrence", async () => {
    const db = mockDeep<PrismaClient>();
    db.list.findFirst.mockResolvedValue(
      cycleWith([
        { id: "fresh", status: "on_track", statusSetAt: new Date(start.getTime() - 2 * DAY) },
        { id: "old", status: "at_risk", statusSetAt: new Date(start.getTime() - 8 * DAY) },
        { id: "never", status: null, statusSetAt: null },
      ]) as never,
    );

    const items = await cycleBriefSection.run(ctx(db), section);

    const where = db.list.findFirst.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ workspaceId: "ws-1", productId: "prod-1", listType: "SPRINT", status: "ACTIVE" });
    expect(items.map((i) => i.refId)).toEqual(["fresh", "old", "never"]);
    expect(items[0]).toMatchObject({
      id: "brief:cycle_outcome:fresh",
      refType: "cycle_outcome",
      title: "Outcome fresh",
      href: "/w/ws/products/clear/cycles/cyc-21",
    });
    expect(items[0]!.detail).toBe("On track · set 9 Mar");
    expect(items[1]!.detail).toContain("stale: older than 7 days");
    expect(items[2]!.detail).toBe("No status yet · stale: never set");
    expect(items[1]!.lines?.[0]).toContainEqual(expect.objectContaining({ warn: true }));
  });

  it("is empty, with a reason, when the active cycle has no signed-off brief", async () => {
    const db = mockDeep<PrismaClient>();
    db.list.findFirst.mockResolvedValue({ ...cycleWith([]), cycleBrief: { planSignedOffAt: null, outcomes: [] } } as never);
    const [run] = await runAgendaSections(ctx(db), [section]);
    expect(run?.items).toEqual([]);
    expect(run?.emptyReason).toMatch(/no signed-off cycle brief/i);
  });

  it("is empty without a product, and never queries", async () => {
    const db = mockDeep<PrismaClient>();
    expect(await cycleBriefSection.run(ctx(db, null), section)).toEqual([]);
    expect(db.list.findFirst).not.toHaveBeenCalled();
  });
});
