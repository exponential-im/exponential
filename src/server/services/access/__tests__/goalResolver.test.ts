/**
 * Unit tests for the goal and key result write rule (`assertCanEditGoal`,
 * `assertCanEditKeyResult`).
 *
 * In a workspace the caller's role decides, so a `viewer` is refused even on
 * a row they created or are the DRI of. A personal row is its owner's (and,
 * for a goal, its DRI's). Someone with no standing on the row gets NOT_FOUND;
 * someone who can see it and may not write gets FORBIDDEN.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  assertCanEditGoal,
  assertCanEditGoals,
  assertCanEditKeyResult,
  assertCanEditKeyResults,
} from "../resolvers/goalResolver";

const userId = "user-1";
const workspaceId = "ws-1";

/** "allowed", or the tRPC code the assert threw. */
async function verdict(p: Promise<void>): Promise<string> {
  try {
    await p;
    return "allowed";
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
}

describe("goal and key result write access", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.teamUser.findFirst.mockResolvedValue(null as never);
  });

  function stubRole(role: string | null) {
    db.workspaceUser.findUnique.mockResolvedValue(
      (role ? { role, workspaceId } : null) as never,
    );
  }

  const goal = (over: Partial<{ userId: string; driUserId: string | null; workspaceId: string | null }>) => ({
    userId: "someone-else",
    driUserId: null,
    workspaceId,
    ...over,
  });
  const keyResult = (over: Partial<{ userId: string; workspaceId: string | null }>) => ({
    userId: "someone-else",
    workspaceId,
    ...over,
  });

  describe("a goal in a workspace", () => {
    it.each(["owner", "admin", "member"])("lets a %s change a colleague's goal", async (role) => {
      stubRole(role);
      expect(await verdict(assertCanEditGoal(db, userId, goal({})))).toBe("allowed");
    });

    it("lets someone who reaches the workspace through a team", async () => {
      stubRole(null);
      db.teamUser.findFirst.mockResolvedValue({ role: "member", team: { workspaceId } } as never);
      expect(await verdict(assertCanEditGoal(db, userId, goal({})))).toBe("allowed");
    });

    it("refuses a viewer with FORBIDDEN", async () => {
      stubRole("viewer");
      expect(await verdict(assertCanEditGoal(db, userId, goal({})))).toBe("FORBIDDEN");
    });

    it("refuses a viewer who created the goal", async () => {
      stubRole("viewer");
      expect(await verdict(assertCanEditGoal(db, userId, goal({ userId })))).toBe("FORBIDDEN");
    });

    it("refuses a viewer who is the goal's DRI", async () => {
      stubRole("viewer");
      expect(await verdict(assertCanEditGoal(db, userId, goal({ driUserId: userId })))).toBe("FORBIDDEN");
    });

    it("hides the goal from a stranger with NOT_FOUND", async () => {
      stubRole(null);
      expect(await verdict(assertCanEditGoal(db, userId, goal({})))).toBe("NOT_FOUND");
    });

    it("tells an owner who left the workspace why, with FORBIDDEN", async () => {
      stubRole(null);
      expect(await verdict(assertCanEditGoal(db, userId, goal({ userId })))).toBe("FORBIDDEN");
    });
  });

  describe("a personal goal", () => {
    it("is its owner's", async () => {
      expect(await verdict(assertCanEditGoal(db, userId, goal({ userId, workspaceId: null })))).toBe("allowed");
    });

    it("is its DRI's too", async () => {
      expect(
        await verdict(assertCanEditGoal(db, userId, goal({ driUserId: userId, workspaceId: null }))),
      ).toBe("allowed");
    });

    it("is NOT_FOUND to anyone else, without a workspace lookup", async () => {
      expect(await verdict(assertCanEditGoal(db, userId, goal({ workspaceId: null })))).toBe("NOT_FOUND");
      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
    });
  });

  it("answers a missing goal with NOT_FOUND and the caller's message", async () => {
    await expect(
      assertCanEditGoal(db, userId, null, { notFound: "Goal not found or unauthorized" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Goal not found or unauthorized" });
  });

  describe("a key result", () => {
    it("is writable by a member of its workspace who does not own it", async () => {
      stubRole("member");
      expect(await verdict(assertCanEditKeyResult(db, userId, keyResult({})))).toBe("allowed");
    });

    it("refuses a viewer, including one who owns it", async () => {
      stubRole("viewer");
      expect(await verdict(assertCanEditKeyResult(db, userId, keyResult({})))).toBe("FORBIDDEN");
      expect(await verdict(assertCanEditKeyResult(db, userId, keyResult({ userId })))).toBe("FORBIDDEN");
    });

    it("hides it from a stranger with NOT_FOUND", async () => {
      stubRole(null);
      expect(await verdict(assertCanEditKeyResult(db, userId, keyResult({})))).toBe("NOT_FOUND");
    });

    it("is its owner's when personal, and NOT_FOUND to anyone else", async () => {
      expect(
        await verdict(assertCanEditKeyResult(db, userId, keyResult({ userId, workspaceId: null }))),
      ).toBe("allowed");
      expect(
        await verdict(assertCanEditKeyResult(db, userId, keyResult({ workspaceId: null }))),
      ).toBe("NOT_FOUND");
    });

    it("answers a missing key result with NOT_FOUND", async () => {
      expect(await verdict(assertCanEditKeyResult(db, userId, null))).toBe("NOT_FOUND");
    });
  });
});

describe("the batch forms, for a write that links to rows by id", () => {
  // `project.create` names goals and key results by id (ticket calm.daisy).
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    // A member of ws-1, nothing anywhere else.
    db.workspaceUser.findUnique.mockImplementation(((args: {
      where: { userId_workspaceId: { workspaceId: string } };
    }) =>
      Promise.resolve(
        args.where.userId_workspaceId.workspaceId === workspaceId
          ? { role: "member", workspaceId }
          : null,
      )) as never);
  });

  const goalRow = (id: number, inWorkspaceId: string | null, ownerId = "someone-else") => ({
    id,
    userId: ownerId,
    driUserId: null,
    workspaceId: inWorkspaceId,
  });
  const keyResultRow = (id: string, inWorkspaceId: string | null, ownerId = "someone-else") => ({
    id,
    userId: ownerId,
    workspaceId: inWorkspaceId,
  });

  describe("assertCanEditGoals", () => {
    it("allows an empty list without a query", async () => {
      expect(await verdict(assertCanEditGoals(db, userId, []))).toBe("allowed");
      expect(db.goal.findMany).not.toHaveBeenCalled();
    });

    it("allows goals the user can change, in one lookup", async () => {
      db.goal.findMany.mockResolvedValue([goalRow(1, workspaceId), goalRow(2, null, userId)] as never);

      expect(await verdict(assertCanEditGoals(db, userId, [1, 2, 2]))).toBe("allowed");
      expect(db.goal.findMany).toHaveBeenCalledTimes(1);
    });

    it("refuses the set when one goal is out of reach", async () => {
      db.goal.findMany.mockResolvedValue([goalRow(1, workspaceId), goalRow(2, "ws-other")] as never);

      expect(await verdict(assertCanEditGoals(db, userId, [1, 2]))).toBe("NOT_FOUND");
    });

    it("refuses an id with no row, and an id that is not a number, the same way", async () => {
      db.goal.findMany.mockResolvedValue([] as never);

      expect(await verdict(assertCanEditGoals(db, userId, [404]))).toBe("NOT_FOUND");
      expect(await verdict(assertCanEditGoals(db, userId, [Number.NaN]))).toBe("NOT_FOUND");
    });
  });

  describe("assertCanEditKeyResults", () => {
    it("allows an empty list without a query", async () => {
      expect(await verdict(assertCanEditKeyResults(db, userId, []))).toBe("allowed");
      expect(db.keyResult.findMany).not.toHaveBeenCalled();
    });

    it("allows key results the user can change", async () => {
      db.keyResult.findMany.mockResolvedValue([
        keyResultRow("kr-1", workspaceId),
        keyResultRow("kr-2", null, userId),
      ] as never);

      expect(await verdict(assertCanEditKeyResults(db, userId, ["kr-1", "kr-2"]))).toBe("allowed");
    });

    it("refuses the set when one key result is out of reach, or does not exist", async () => {
      db.keyResult.findMany.mockResolvedValue([keyResultRow("kr-1", workspaceId)] as never);

      expect(await verdict(assertCanEditKeyResults(db, userId, ["kr-1", "kr-404"]))).toBe("NOT_FOUND");

      db.keyResult.findMany.mockResolvedValue([
        keyResultRow("kr-1", workspaceId),
        keyResultRow("kr-2", "ws-other"),
      ] as never);

      expect(await verdict(assertCanEditKeyResults(db, userId, ["kr-1", "kr-2"]))).toBe("NOT_FOUND");
    });
  });
});
