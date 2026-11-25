import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";

/**
 * `confirmDraft` publishes a reviewed draft, or — when the draft resolves an
 * open question — applies it to that target decision. The target is a
 * DIFFERENT row from the one the router authorized, so it gets its own
 * access check; these tests pin that, and the refusal to resurrect a
 * rejected draft.
 */
const getDecisionAccess = vi.hoisted(() => vi.fn());
const canEditDecision = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/access/resolvers/decisionResolver", () => ({
  getDecisionAccess,
  canEditDecision,
}));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity: vi.fn(async () => true) }));

import { confirmDraft } from "../decisionService";

const WORKSPACE_ID = "ws-1";
const HUMAN = { kind: "human", userId: "u-1", surface: "web" } as const;
const DRAFT = {
  id: "draft-1",
  workspaceId: WORKSPACE_ID,
  number: 9,
  statement: "The peek drawer ships first",
  status: "ACCEPTED",
  reviewState: "DRAFT",
  decidedAt: new Date("2026-09-08T07:00:00.000Z"),
  supersededById: null as string | null,
  source: "MEETING",
  transcriptionSessionId: "m-1",
  body: null,
  evidence: [],
};
const TARGET = {
  id: "open-1",
  number: 2,
  statement: "Should the peek drawer ship first?",
  status: "OPEN",
  body: null,
  decidedAt: null,
  transcriptionSessionId: "m-other",
  evidence: [],
  projectId: null,
  workspaceId: WORKSPACE_ID,
  reviewState: "CONFIRMED",
  transcriptionSession: { id: "m-other", userId: "someone-else", projectId: null, workspaceId: WORKSPACE_ID },
};

describe("confirmDraft", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    getDecisionAccess.mockReset();
    canEditDecision.mockReset();
    db.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: PrismaClient) => Promise<unknown>)(db));
    db.decisionTag.findMany.mockResolvedValue([] as never);
  });

  it("refuses to confirm a rejected draft", async () => {
    db.decision.findFirst.mockResolvedValue({ ...DRAFT, reviewState: "REJECTED" } as never);

    await expect(
      confirmDraft(db, { decisionId: "draft-1", workspaceId: WORKSPACE_ID, userId: "u-1", principal: HUMAN }),
    ).rejects.toThrow(/rejected draft cannot be confirmed/i);
    // Rejection is how a reviewer refuses a hallucinated draft, and how the
    // extractor knows not to propose it again. Confirming past it undoes both.
    expect(db.decision.update).not.toHaveBeenCalled();
  });

  it("access-checks the resolution target, which is not the row the router authorized", async () => {
    db.decision.findFirst
      .mockResolvedValueOnce({ ...DRAFT, supersededById: "open-1" } as never)
      .mockResolvedValueOnce(TARGET as never);
    getDecisionAccess.mockResolvedValue({ hasMeeting: true, canEditMeeting: false });
    canEditDecision.mockReturnValue(false);

    await expect(
      confirmDraft(db, { decisionId: "draft-1", workspaceId: WORKSPACE_ID, userId: "u-1", principal: HUMAN }),
    ).rejects.toThrow(/no longer available/i);

    expect(getDecisionAccess).toHaveBeenCalledWith(db, "u-1", expect.objectContaining({ id: "open-1" }));
    // Nothing partial: the target keeps its status and the draft survives for
    // the reviewer to reject or log by hand.
    expect(db.decision.update).not.toHaveBeenCalled();
    expect(db.decision.deleteMany).not.toHaveBeenCalled();
  });

  it("applies the resolution when the caller may edit the target", async () => {
    db.decision.findFirst
      .mockResolvedValueOnce({ ...DRAFT, supersededById: "open-1" } as never)
      .mockResolvedValueOnce(TARGET as never);
    getDecisionAccess.mockResolvedValue({ hasMeeting: true, canEditMeeting: true });
    canEditDecision.mockReturnValue(true);
    db.decision.update.mockResolvedValue({ ...TARGET, status: "ACCEPTED", supersededBy: null } as never);
    db.decision.deleteMany.mockResolvedValue({ count: 1 } as never);

    const result = await confirmDraft(db, { decisionId: "draft-1", workspaceId: WORKSPACE_ID, userId: "u-1", principal: HUMAN });

    expect(result.id).toBe("open-1");
    // Conditional on the row still being a draft, so a concurrent confirm
    // cannot absorb it twice.
    expect(db.decision.deleteMany).toHaveBeenCalledWith({
      where: { id: "draft-1", workspaceId: WORKSPACE_ID, reviewState: "DRAFT" },
    });
    expect(db.decisionTag.createMany).not.toHaveBeenCalled();
  });

  it("moves the draft's Pillars and labels to the decision it resolves", async () => {
    db.decision.findFirst
      .mockResolvedValueOnce({ ...DRAFT, supersededById: "open-1" } as never)
      .mockResolvedValueOnce(TARGET as never);
    getDecisionAccess.mockResolvedValue({ hasMeeting: true, canEditMeeting: true });
    canEditDecision.mockReturnValue(true);
    db.decision.update.mockResolvedValue({ ...TARGET, status: "ACCEPTED", supersededBy: null } as never);
    db.decision.deleteMany.mockResolvedValue({ count: 1 } as never);
    db.decisionTag.findMany.mockResolvedValue([{ tagId: "tag-dq" }, { tagId: "tag-bug" }] as never);

    await confirmDraft(db, { decisionId: "draft-1", workspaceId: WORKSPACE_ID, userId: "u-1", principal: HUMAN });

    // Deleting the draft cascades to its tag rows, so they are read first and
    // added to the target's own; a tag it already carries is not duplicated.
    expect(db.decisionTag.findMany.mock.invocationCallOrder[0]!).toBeLessThan(
      db.decision.deleteMany.mock.invocationCallOrder[0]!,
    );
    expect(db.decisionTag.createMany).toHaveBeenCalledWith({
      data: [
        { decisionId: "open-1", tagId: "tag-dq" },
        { decisionId: "open-1", tagId: "tag-bug" },
      ],
      skipDuplicates: true,
    });
  });

  it("moves no tags when another confirm absorbed the draft first", async () => {
    db.decision.findFirst
      .mockResolvedValueOnce({ ...DRAFT, supersededById: "open-1" } as never)
      .mockResolvedValueOnce(TARGET as never);
    getDecisionAccess.mockResolvedValue({ hasMeeting: true, canEditMeeting: true });
    canEditDecision.mockReturnValue(true);
    db.decision.deleteMany.mockResolvedValue({ count: 0 } as never);
    db.decision.findUniqueOrThrow.mockResolvedValue(TARGET as never);
    db.decisionTag.findMany.mockResolvedValue([{ tagId: "tag-dq" }] as never);

    await confirmDraft(db, { decisionId: "draft-1", workspaceId: WORKSPACE_ID, userId: "u-1", principal: HUMAN });

    expect(db.decisionTag.createMany).not.toHaveBeenCalled();
  });
});
