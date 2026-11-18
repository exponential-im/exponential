/**
 * Actions extracted from a meeting land in the right workspace, and a spoken
 * assignee name only matches people in that workspace.
 *
 * Before: the workspace came from the target project alone, so a meeting with
 * no project produced actions with no workspace — invisible to the
 * workspace's views, and with no roster in the Assign picker. And the name
 * match ran across every user in the database.
 *
 * Prisma never runs here: `~/server/db` is a deep mock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("~/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { db: mockDeep<PrismaClient>() };
});

import { db as dbSingleton } from "~/server/db";
import { InternalActionProcessor } from "../InternalActionProcessor";

const db = dbSingleton as unknown as DeepMockProxy<PrismaClient>;

/** The `data` each `action.create` call was given. */
function createdData(): Array<Record<string, unknown>> {
  return db.action.create.mock.calls.map(
    (call) => (call[0] as { data: Record<string, unknown> }).data,
  );
}

describe("InternalActionProcessor", () => {
  beforeEach(() => {
    mockReset(db);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    db.action.create.mockImplementation(((args: { data: { name: string } }) =>
      Promise.resolve({ id: "a1", name: args.data.name, createdById: "u1" })) as never);
  });

  it("takes the meeting's workspace when the meeting has no project", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({ workspaceId: "w-meeting" } as never);

    const processor = new InternalActionProcessor({
      userId: "u1",
      transcriptionId: "t1",
      actionStatus: "DRAFT",
    });
    await processor.processActionItems([{ text: "One" }, { text: "Two" }]);

    expect(createdData().map((d) => d.workspaceId)).toEqual(["w-meeting", "w-meeting"]);
    // Resolved once per run, not once per action.
    expect(db.transcriptionSession.findUnique).toHaveBeenCalledTimes(1);
  });

  it("prefers the target project's workspace", async () => {
    db.project.findUnique.mockResolvedValue({ workspaceId: "w-project" } as never);
    db.transcriptionSession.findUnique.mockResolvedValue({ workspaceId: "w-meeting" } as never);

    const processor = new InternalActionProcessor({
      userId: "u1",
      projectId: "p1",
      transcriptionId: "t1",
    });
    await processor.processActionItems([{ text: "One" }]);

    expect(createdData()[0]?.workspaceId).toBe("w-project");
    expect(db.transcriptionSession.findUnique).not.toHaveBeenCalled();
  });

  it("leaves the workspace empty when neither project nor meeting has one", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({ workspaceId: null } as never);

    const processor = new InternalActionProcessor({ userId: "u1", transcriptionId: "t1" });
    await processor.processActionItems([{ text: "One" }]);

    expect(createdData()[0]?.workspaceId).toBeNull();
  });

  it("only matches a spoken assignee against the workspace's members", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({ workspaceId: "w-meeting" } as never);
    db.user.findFirst.mockResolvedValue(null);

    const processor = new InternalActionProcessor({ userId: "u1", transcriptionId: "t1" });
    await processor.processActionItems([{ text: "One", assignee: "Selim Fekih" }]);

    expect(db.user.findFirst).toHaveBeenCalled();
    for (const call of db.user.findFirst.mock.calls) {
      expect(call[0]).toMatchObject({
        where: { workspaceMemberships: { some: { workspaceId: "w-meeting" } } },
      });
    }
  });
});
