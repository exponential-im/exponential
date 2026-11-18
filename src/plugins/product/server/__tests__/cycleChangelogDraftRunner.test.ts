import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

vi.mock("../cycleChangelogLoader", () => ({
  loadChangelogInputs: vi.fn(),
}));
vi.mock("../cycleChangelogDraft", () => ({
  writeChangelogDraft: vi.fn(),
}));

import { loadChangelogInputs } from "../cycleChangelogLoader";
import { writeChangelogDraft } from "../cycleChangelogDraft";
import { draftCycleChangelog, runDueChangelogDrafts } from "../cycleChangelogDraftRunner";

const db = mockDeep<PrismaClient>();
const editedAt = new Date("2026-11-18T10:00:00.000Z");

function cycle(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Cycle 18",
    workspaceId: "w1",
    productId: "p1",
    startDate: new Date("2026-11-01"),
    endDate: new Date("2026-11-14"),
    cycleGoal: null,
    changelogDraft: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  vi.mocked(loadChangelogInputs).mockResolvedValue(
    new Map([
      [
        "c1",
        {
          tickets: [
            {
              id: "t1",
              number: 1,
              shortId: null,
              title: "Memory fix",
              type: "BUG",
              status: "DONE",
              points: 3,
              featureId: null,
              featureName: null,
              prUrl: null,
              branchName: null,
            },
          ],
          pullRequests: [],
        },
      ],
    ]),
  );
  vi.mocked(writeChangelogDraft).mockResolvedValue({
    content: { sections: [] },
    model: "claude-opus-5-5",
    tokensIn: 10,
    tokensOut: 5,
  });
});

describe("draftCycleChangelog", () => {
  it("does not overwrite a draft someone saved while the model was writing", async () => {
    db.list.findUniqueOrThrow.mockResolvedValue(
      cycle({ changelogDraft: { source: "generated", updatedAt: editedAt } }) as never,
    );
    // The stored revision moved on during the call, so the conditional write matches nothing.
    db.cycleChangelogDraft.updateMany.mockResolvedValue({ count: 0 });

    const result = await draftCycleChangelog(db, { cycleId: "c1" });

    expect(result).toEqual({ outcome: "skipped_edited" });
    expect(db.cycleChangelogDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cycleId: "c1", updatedAt: editedAt } }),
    );
  });

  it("overwrites only the edited revision the person confirmed", async () => {
    db.list.findUniqueOrThrow.mockResolvedValue(
      cycle({ changelogDraft: { source: "edited", updatedAt: editedAt } }) as never,
    );
    db.cycleChangelogDraft.updateMany.mockResolvedValue({ count: 1 });

    const result = await draftCycleChangelog(db, { cycleId: "c1", overwriteEdited: true });

    expect(result.outcome).toBe("drafted");
    expect(db.cycleChangelogDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cycleId: "c1", updatedAt: editedAt } }),
    );
  });

  it("skips an edited draft without calling the model", async () => {
    db.list.findUniqueOrThrow.mockResolvedValue(
      cycle({ changelogDraft: { source: "edited", updatedAt: editedAt } }) as never,
    );

    expect(await draftCycleChangelog(db, { cycleId: "c1" })).toEqual({
      outcome: "skipped_edited",
    });
    expect(writeChangelogDraft).not.toHaveBeenCalled();
  });

  it("keeps an edited draft another run stored first", async () => {
    db.list.findUniqueOrThrow.mockResolvedValue(cycle() as never);
    db.cycleChangelogDraft.createMany.mockResolvedValue({ count: 0 });
    db.cycleChangelogDraft.updateMany.mockResolvedValue({ count: 0 });

    const result = await draftCycleChangelog(db, { cycleId: "c1" });

    expect(result).toEqual({ outcome: "skipped_edited" });
    expect(db.cycleChangelogDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cycleId: "c1", source: { not: "edited" } },
      }),
    );
  });

  it("creates the first draft", async () => {
    db.list.findUniqueOrThrow.mockResolvedValue(cycle() as never);
    db.cycleChangelogDraft.createMany.mockResolvedValue({ count: 1 });

    const result = await draftCycleChangelog(db, { cycleId: "c1" });

    expect(result.outcome).toBe("drafted");
    expect(db.cycleChangelogDraft.updateMany).not.toHaveBeenCalled();
  });

  it("does not draft a cycle shared by several products", async () => {
    db.list.findUniqueOrThrow.mockResolvedValue(cycle({ productId: null }) as never);
    db.product.count.mockResolvedValue(2);

    expect(await draftCycleChangelog(db, { cycleId: "c1" })).toEqual({
      outcome: "skipped_shared",
    });
    expect(writeChangelogDraft).not.toHaveBeenCalled();
  });

  it("drafts a shared cycle when the workspace has one product", async () => {
    db.list.findUniqueOrThrow.mockResolvedValue(cycle({ productId: null }) as never);
    db.product.count.mockResolvedValue(1);
    db.cycleChangelogDraft.createMany.mockResolvedValue({ count: 1 });

    expect((await draftCycleChangelog(db, { cycleId: "c1" })).outcome).toBe("drafted");
  });
});

describe("runDueChangelogDrafts", () => {
  it("leaves shared cycles of multi-product workspaces out of the candidate query", async () => {
    db.product.groupBy.mockResolvedValue([{ workspaceId: "w-multi" }] as never);
    db.list.findMany.mockResolvedValue([]);

    await runDueChangelogDrafts(db, new Date("2026-11-18T12:00:00Z"));

    expect(db.list.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { productId: null, workspaceId: { in: ["w-multi"] } },
        }),
      }),
    );
  });

  it("adds no exclusion when no workspace has several products", async () => {
    db.product.groupBy.mockResolvedValue([] as never);
    db.list.findMany.mockResolvedValue([]);

    await runDueChangelogDrafts(db, new Date("2026-11-18T12:00:00Z"));

    const where = db.list.findMany.mock.calls[0]![0]!.where!;
    expect(where).not.toHaveProperty("NOT");
  });
});
