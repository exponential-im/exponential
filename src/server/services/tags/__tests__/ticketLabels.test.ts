/**
 * Unit tests for agent ticket-label resolution (cold.nebula). Mocked Prisma;
 * `setEntityTags` is mocked so these cover only the resolve + merge rules —
 * its own access and scope checks are exercised in the tag router tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../TagAssignmentService", () => ({
  setEntityTags: vi.fn(),
}));

import { setEntityTags } from "../TagAssignmentService";
import {
  applyTicketLabels,
  resolveLabelRefs,
  slugifyLabelRef,
} from "../ticketLabels";

const WS = "ws-1";
const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const setEntityTagsMock = vi.mocked(setEntityTags);

function tag(id: string, slug: string, workspaceId: string | null = WS, name = slug) {
  return { id, name, slug, workspaceId };
}

describe("slugifyLabelRef", () => {
  it("matches tag.create's slug rule", () => {
    expect(slugifyLabelRef("AI buildable")).toBe("ai-buildable");
    expect(slugifyLabelRef("  FROM-NOTION ")).toBe("from-notion");
    expect(slugifyLabelRef("!!")).toBe("");
  });
});

describe("resolveLabelRefs", () => {
  beforeEach(() => mockReset(db));

  it("returns nothing without querying when no refs are given", async () => {
    expect(await resolveLabelRefs(db, WS, ["  ", ""])).toEqual({ tags: [], unresolved: [] });
    expect(db.tag.findMany).not.toHaveBeenCalled();
  });

  it("resolves ids, slugs and display names, scoped to the workspace and global tags", async () => {
    db.tag.findMany.mockResolvedValue([
      tag("t-bug", "bug", null, "Bug"),
      tag("t-ai", "ai-buildable", WS, "ai-buildable"),
    ] as never);

    const result = await resolveLabelRefs(db, WS, ["t-bug", "AI buildable", "nope"]);

    expect(result.tags.map((t) => t.id)).toEqual(["t-bug", "t-ai"]);
    expect(result.unresolved).toEqual(["nope"]);
    expect(db.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { OR: [{ workspaceId: WS }, { workspaceId: null }] },
            {
              OR: [
                { id: { in: ["t-bug", "AI buildable", "nope"] } },
                { slug: { in: ["t-bug", "ai-buildable", "nope"] } },
              ],
            },
          ],
        },
      }),
    );
  });

  it("prefers a workspace tag over a global tag with the same slug", async () => {
    db.tag.findMany.mockResolvedValue([
      tag("t-ws", "devops", WS),
      tag("t-global", "devops", null),
    ] as never);
    expect((await resolveLabelRefs(db, WS, ["devops"])).tags.map((t) => t.id)).toEqual(["t-ws"]);

    db.tag.findMany.mockResolvedValue([
      tag("t-global", "devops", null),
      tag("t-ws", "devops", WS),
    ] as never);
    expect((await resolveLabelRefs(db, WS, ["devops"])).tags.map((t) => t.id)).toEqual(["t-ws"]);
  });

  it("dedupes refs that point at the same tag", async () => {
    db.tag.findMany.mockResolvedValue([tag("t-bug", "bug")] as never);
    const result = await resolveLabelRefs(db, WS, ["bug", "Bug", "t-bug"]);
    expect(result.tags).toHaveLength(1);
    expect(result.unresolved).toEqual([]);
  });
});

describe("applyTicketLabels", () => {
  beforeEach(() => {
    mockReset(db);
    setEntityTagsMock.mockReset();
    setEntityTagsMock.mockImplementation(({ entityId, tagIds }) =>
      Promise.resolve({
        entityType: "ticket",
        entityId,
        tags: tagIds.map((id) => ({ id, name: id, slug: id })) as never,
      }),
    );
  });

  function currentLabels(...ids: string[]) {
    db.ticketTag.findMany.mockResolvedValue(
      ids.map((id) => ({ tagId: id, tag: { id, name: id, slug: id } })) as never,
    );
  }

  const base = { userId: "u-1", ticketId: "tk-1", workspaceId: WS };

  it("returns the current labels and writes nothing when no change is asked", async () => {
    currentLabels("a");
    const result = await applyTicketLabels(db, { ...base, change: {} });
    expect(result).toEqual({ labels: [{ id: "a", name: "a", slug: "a" }], warnings: [] });
    expect(setEntityTagsMock).not.toHaveBeenCalled();
  });

  it("adds to the existing labels through setEntityTags", async () => {
    currentLabels("a");
    db.tag.findMany.mockResolvedValue([tag("b", "b")] as never);

    const result = await applyTicketLabels(db, { ...base, change: { add: ["b"] } });

    expect(setEntityTagsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", entityType: "ticket", entityId: "tk-1", tagIds: ["a", "b"] }),
    );
    expect(result.labels.map((l) => l.id)).toEqual(["a", "b"]);
    expect(result.warnings).toEqual([]);
  });

  it("removes labels and skips unknown add refs with a warning", async () => {
    currentLabels("a", "b");
    db.tag.findMany.mockImplementation(((args: { where: { AND: [unknown, { OR: [{ id: { in: string[] } }] }] } }) => {
      const ids = args.where.AND[1].OR[0].id.in;
      return Promise.resolve(ids.includes("b") ? [tag("b", "b")] : []);
    }) as never);

    const result = await applyTicketLabels(db, {
      ...base,
      change: { add: ["ghost"], remove: ["b"] },
    });

    expect(setEntityTagsMock).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ["a"] }));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"ghost"');
  });

  it("replaces the set when every ref resolves", async () => {
    currentLabels("a", "b");
    db.tag.findMany.mockResolvedValue([tag("c", "c")] as never);

    await applyTicketLabels(db, { ...base, change: { set: ["c"] } });

    expect(setEntityTagsMock).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ["c"] }));
  });

  it("clears every label on an empty set", async () => {
    currentLabels("a");
    await applyTicketLabels(db, { ...base, change: { set: [] } });
    expect(setEntityTagsMock).toHaveBeenCalledWith(expect.objectContaining({ tagIds: [] }));
  });

  it("leaves labels untouched when a set ref is unknown", async () => {
    currentLabels("a", "b");
    db.tag.findMany.mockResolvedValue([tag("c", "c")] as never);

    const result = await applyTicketLabels(db, { ...base, change: { set: ["c", "typo"] } });

    expect(setEntityTagsMock).not.toHaveBeenCalled();
    expect(result.labels.map((l) => l.id)).toEqual(["a", "b"]);
    expect(result.warnings[0]).toContain('"typo"');
    expect(result.warnings[0]).toContain("left unchanged");
  });
});
