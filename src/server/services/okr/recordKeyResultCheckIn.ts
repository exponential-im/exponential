/**
 * The one write path for a Key result's value (ADR-0050): a check-in.
 *
 * Every caller that records a value goes through here: the UI (`okr.checkIn`),
 * agents (`mastra.checkInOkrKeyResult`), and Pillar Metrics feeding the Key
 * results that name them (ADR-0087). Each caller does its own permission
 * check first; this function does none.
 *
 * It writes the check-in row and the KR's new value and auto status in one
 * transaction. The manual `statusOverride` is never touched (ADR-0004). After
 * the response it recomputes the parent Objective's health. For a workspace
 * KR it records a `checked_in` activity event; personal KRs stay silent.
 */

import type { KeyResult, KeyResultCheckIn, PrismaClient } from "@prisma/client";
import { computeGoalHealth } from "~/server/services/goalService";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { runAfterResponseReported } from "~/server/utils/runAfterResponse";

/** The fields of a Key result a check-in reads. Callers pass the row they loaded for their own checks. */
export type CheckInKeyResult = Pick<
  KeyResult,
  "id" | "goalId" | "workspaceId" | "title" | "startValue" | "targetValue" | "currentValue" | "status"
>;

/**
 * The auto status for a value: progress from start to target, at least 100%
 * is achieved, 70% on track, 40% at risk, anything less off track. A KR with
 * no range (target at or below start) reads as off track.
 */
export function keyResultStatusFor(
  keyResult: Pick<KeyResult, "startValue" | "targetValue">,
  newValue: number,
): string {
  const range = keyResult.targetValue - keyResult.startValue;
  const progress = range > 0 ? ((newValue - keyResult.startValue) / range) * 100 : 0;
  if (progress >= 100) return "achieved";
  if (progress >= 70) return "on-track";
  if (progress >= 40) return "at-risk";
  return "off-track";
}

export async function recordKeyResultCheckIn(
  db: PrismaClient,
  {
    keyResult,
    newValue,
    notes,
    actorUserId,
  }: {
    keyResult: CheckInKeyResult;
    newValue: number;
    notes?: string | null;
    actorUserId: string;
  },
): Promise<{ checkIn: KeyResultCheckIn; keyResult: KeyResult }> {
  const status = keyResultStatusFor(keyResult, newValue);

  const [checkIn, updated] = await db.$transaction([
    db.keyResultCheckIn.create({
      data: {
        keyResultId: keyResult.id,
        previousValue: keyResult.currentValue,
        newValue,
        notes,
        createdById: actorUserId,
      },
    }),
    db.keyResult.update({
      where: { id: keyResult.id },
      data: { currentValue: newValue, status },
    }),
  ]);

  runAfterResponseReported("keyResult.checkIn.goalHealth", () =>
    computeGoalHealth({ ctx: { db }, goalId: keyResult.goalId }),
  );

  // Only the act is logged, never the health recompute it triggers. The
  // event's entityId is the check-in row; metadata carries the KR's title and
  // id so the feed can label the row and open the KR drawer.
  if (keyResult.workspaceId) {
    await recordActivity(db, {
      workspaceId: keyResult.workspaceId,
      userId: actorUserId,
      entityType: "key_result",
      entityId: checkIn.id,
      action: "checked_in",
      metadata: { title: keyResult.title, keyResultId: keyResult.id },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  return { checkIn, keyResult: updated };
}
