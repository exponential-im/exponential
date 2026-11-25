/**
 * Pillars and labels on a Decision (ADR-0086): the tag service follows the
 * decision resolver, and a decision takes labels as well as Pillars. Mocked
 * Prisma; the resolver's verdicts are mocked so these tests cover the tag
 * service's own rules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("~/server/services/access", () => ({
  getDecisionAccess: vi.fn(() => Promise.resolve({})),
  canViewDecision: vi.fn(),
  canEditDecision: vi.fn(),
}));

import { canEditDecision, canViewDecision } from "~/server/services/access";
import { listForEntity, setEntityTags } from "../TagAssignmentService";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const canView = vi.mocked(canViewDecision);
const canEdit = vi.mocked(canEditDecision);

const WS = "ws-1";
const USER = "user-1";
const DECISION = "dec-1";

function decisionRow(tagIds: string[] = []) {
  return {
    workspaceId: WS,
    projectId: null,
    reviewState: "CONFIRMED",
    transcriptionSession: null,
    tags: tagIds.map((tagId) => ({ tagId })),
  };
}

const pillar = { id: "tag-dq", category: "pillar", workspaceId: WS, archivedAt: null };
const label = { id: "tag-bug", category: null, workspaceId: WS, archivedAt: null };

const set = (tagIds: string[]) =>
  setEntityTags({ db, userId: USER, entityType: "decision", entityId: DECISION, tagIds });

beforeEach(() => {
  mockReset(db);
  canView.mockReset().mockReturnValue(true);
  canEdit.mockReset().mockReturnValue(true);
  db.decision.findUnique.mockResolvedValue(decisionRow() as never);
  db.decisionTag.findMany.mockResolvedValue([] as never);
  db.$transaction.mockImplementation(((run: (tx: unknown) => unknown) => run(db)) as never);
});

describe("setEntityTags on a decision", () => {
  it("files a decision under a Pillar and a label together", async () => {
    db.tag.findMany.mockResolvedValue([pillar, label] as never);

    await set(["tag-dq", "tag-bug"]);

    expect(db.decisionTag.createMany).toHaveBeenCalledWith({
      data: [
        { decisionId: DECISION, tagId: "tag-dq" },
        { decisionId: DECISION, tagId: "tag-bug" },
      ],
      skipDuplicates: true,
    });
  });

  it("removes what is no longer picked and leaves the rest", async () => {
    db.decision.findUnique.mockResolvedValue(decisionRow(["tag-dq", "tag-bug"]) as never);
    db.tag.findMany.mockResolvedValue([pillar] as never);

    await set(["tag-dq"]);

    expect(db.decisionTag.deleteMany).toHaveBeenCalledWith({
      where: { decisionId: DECISION, tagId: { in: ["tag-bug"] } },
    });
    expect(db.decisionTag.createMany).not.toHaveBeenCalled();
  });

  it("refuses a tag from another workspace", async () => {
    db.tag.findMany.mockResolvedValue([] as never);

    await expect(set(["tag-elsewhere"])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.decisionTag.createMany).not.toHaveBeenCalled();
  });

  it("refuses someone who may read the decision but not edit it", async () => {
    canEdit.mockReturnValue(false);

    await expect(set(["tag-dq"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.decisionTag.createMany).not.toHaveBeenCalled();
  });

  it("hides a decision the caller may not read", async () => {
    canView.mockReturnValue(false);

    await expect(set(["tag-dq"])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("listForEntity on a decision", () => {
  it("returns the decision's tags to someone who may read it, editor or not", async () => {
    canEdit.mockReturnValue(false);
    db.decisionTag.findMany.mockResolvedValue([{ tag: pillar }] as never);

    const tags = await listForEntity({ db, userId: USER, entityType: "decision", entityId: DECISION });

    expect(tags).toEqual([pillar]);
  });

  it("hides the tags of a decision the caller may not read", async () => {
    canView.mockReturnValue(false);

    await expect(
      listForEntity({ db, userId: USER, entityType: "decision", entityId: DECISION }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
