/**
 * Goal and Key Result Write Resolver
 *
 * Who may CHANGE a goal (objective) or a key result. Reading is decided
 * elsewhere (`verifyGoalAccess` in goalService, and the read procedures): the
 * owner, the DRI, or any member of the row's workspace, a `viewer` included.
 *
 * Writing follows where the row lives:
 *
 * - **In a workspace** it is workspace content, so the caller's role there
 *   decides: `owner`, `admin`, `member` or team-derived access may write; a
 *   `viewer` may not, even on a row they created or are the DRI of. Being
 *   named on the row is not a way around a read-only seat.
 * - **Personal** (no workspace): its owner, or for a goal its DRI.
 *
 * Every refusal is one of two errors, so callers do not have to choose:
 * NOT_FOUND for someone with no standing on the row (its existence stays
 * hidden), FORBIDDEN for someone who can see it and may only read.
 */

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import {
  assertWorkspaceWriteRole,
  resolveWritableWorkspace,
} from "./workspaceResolver";

/** The columns of a goal that decide who may change it. */
export interface GoalWriteSubject {
  userId: string;
  driUserId: string | null;
  workspaceId: string | null;
}

/** The columns of a key result that decide who may change it. */
export interface KeyResultWriteSubject {
  userId: string;
  workspaceId: string | null;
}

interface WriteRefusalMessages {
  /** For a missing row, or one the caller has no standing on. */
  notFound: string;
}

async function assertRowWritable(
  db: PrismaClient,
  userId: string,
  row: { workspaceId: string | null; isNamedOnRow: boolean } | null,
  messages: WriteRefusalMessages,
): Promise<void> {
  const notFound = () =>
    new TRPCError({ code: "NOT_FOUND", message: messages.notFound });
  if (!row) throw notFound();

  if (!row.workspaceId) {
    if (!row.isNamedOnRow) throw notFound();
    return;
  }

  // Null for a non-member, FORBIDDEN for a member who may only read.
  const writable = await resolveWritableWorkspace(db, userId, row.workspaceId);
  if (writable) return;

  // Someone named on the row knows it exists, so tell them why they are
  // refused instead of pretending it is not there.
  if (row.isNamedOnRow) {
    await assertWorkspaceWriteRole(db, userId, row.workspaceId);
  }
  throw notFound();
}

/**
 * Assert the user may change this goal. Pass the already-fetched row (or null
 * when the lookup found nothing) so the caller does not query twice.
 */
export async function assertCanEditGoal(
  db: PrismaClient,
  userId: string,
  goal: GoalWriteSubject | null,
  messages: WriteRefusalMessages = { notFound: "Objective not found" },
): Promise<void> {
  await assertRowWritable(
    db,
    userId,
    goal && {
      workspaceId: goal.workspaceId,
      isNamedOnRow: goal.userId === userId || goal.driUserId === userId,
    },
    messages,
  );
}

/**
 * Assert the user may change every goal in `goalIds`: the gate for a write
 * that links something to goals it names by id (a new project's `goalIds`).
 * Linking is a change to the goal, so it follows {@link assertCanEditGoal}.
 *
 * One lookup for the set. An id with no row behind it is refused like a goal
 * the user has no standing on, so the answer does not say which ids exist.
 */
export async function assertCanEditGoals(
  db: PrismaClient,
  userId: string,
  goalIds: number[],
): Promise<void> {
  const ids = [...new Set(goalIds)];
  if (ids.length === 0) return;

  // `NaN` is what a non-numeric id parses to; it names no goal.
  const lookupIds = ids.filter((id) => Number.isInteger(id));
  const goals = lookupIds.length
    ? await db.goal.findMany({
        where: { id: { in: lookupIds } },
        select: { id: true, userId: true, driUserId: true, workspaceId: true },
      })
    : [];
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  for (const id of ids) {
    await assertCanEditGoal(db, userId, byId.get(id) ?? null);
  }
}

/**
 * Assert the user may change every key result in `keyResultIds`. The batch
 * form of {@link assertCanEditKeyResult}, as {@link assertCanEditGoals} is
 * for goals.
 */
export async function assertCanEditKeyResults(
  db: PrismaClient,
  userId: string,
  keyResultIds: string[],
): Promise<void> {
  const ids = [...new Set(keyResultIds)];
  if (ids.length === 0) return;

  const keyResults = await db.keyResult.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true, workspaceId: true },
  });
  const byId = new Map(keyResults.map((keyResult) => [keyResult.id, keyResult]));
  for (const id of ids) {
    await assertCanEditKeyResult(db, userId, byId.get(id) ?? null);
  }
}

/**
 * Assert the user may change this key result. Same rule as
 * {@link assertCanEditGoal}; a key result has an owner and no DRI path.
 */
export async function assertCanEditKeyResult(
  db: PrismaClient,
  userId: string,
  keyResult: KeyResultWriteSubject | null,
  messages: WriteRefusalMessages = { notFound: "Key result not found" },
): Promise<void> {
  await assertRowWritable(
    db,
    userId,
    keyResult && {
      workspaceId: keyResult.workspaceId,
      isNamedOnRow: keyResult.userId === userId,
    },
    messages,
  );
}
