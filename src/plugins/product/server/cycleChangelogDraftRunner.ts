import type { PrismaClient, Prisma } from "@prisma/client";
import { buildCycleChangelog } from "./cycleChangelog";
import { writeChangelogDraft, type DraftClient } from "./cycleChangelogDraft";
import { loadChangelogInputs } from "./cycleChangelogLoader";

/**
 * Generate a cycle's written change log and store it. Used by the "Draft with
 * AI" button and by the cron that drafts each cycle once it ends.
 *
 * Access is NOT enforced here — the caller resolves workspace access first.
 */

export type DraftRunResult =
  | { outcome: "drafted"; model: string; tokensIn: number; tokensOut: number }
  /** A person has edited the stored draft; regenerating needs `overwriteEdited`. */
  | { outcome: "skipped_edited" }
  /** Nothing shipped in the cycle, so there is nothing to write about. */
  | { outcome: "skipped_empty" }
  /**
   * A legacy cycle shared by several products: its change log is read one
   * product at a time, so a single written draft would show every product the
   * others' tickets. Those cycles keep the raw per-product view.
   */
  | { outcome: "skipped_shared" };

export async function draftCycleChangelog(
  db: PrismaClient,
  args: {
    cycleId: string;
    userId?: string;
    overwriteEdited?: boolean;
    client?: DraftClient;
  },
): Promise<DraftRunResult> {
  const cycle = await db.list.findUniqueOrThrow({
    where: { id: args.cycleId },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      productId: true,
      startDate: true,
      endDate: true,
      cycleGoal: true,
      changelogDraft: { select: { source: true, updatedAt: true } },
    },
  });
  if (cycle.changelogDraft?.source === "edited" && !args.overwriteEdited) {
    return { outcome: "skipped_edited" };
  }
  if (!cycle.startDate || !cycle.endDate) return { outcome: "skipped_empty" };
  if (await isSharedAcrossProducts(db, cycle)) return { outcome: "skipped_shared" };

  const window = {
    id: cycle.id,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
  };
  const inputs = (
    await loadChangelogInputs(db, {
      workspaceId: cycle.workspaceId,
      productId: cycle.productId,
      cycles: [window],
      withBodies: true,
    })
  ).get(cycle.id) ?? { tickets: [], pullRequests: [] };

  // Unfolded: the model merges the lone PRs into themes itself.
  const changelog = buildCycleChangelog({ ...inputs, foldSmallChanges: false });
  if (changelog.sections.length === 0) return { outcome: "skipped_empty" };

  const draft = await writeChangelogDraft(
    {
      cycleName: cycle.name,
      cycleGoal: cycle.cycleGoal,
      changelog,
      tickets: inputs.tickets,
    },
    {
      client: args.client,
      log: { db, workspaceId: cycle.workspaceId, userId: args.userId },
    },
  );

  const data = {
    content: draft.content as unknown as Prisma.InputJsonValue,
    source: "generated",
    model: draft.model,
    tokensIn: draft.tokensIn,
    tokensOut: draft.tokensOut,
    generatedAt: new Date(),
    updatedById: args.userId ?? null,
  };
  // The model call takes minutes, so the guard above can be stale by now. The
  // write lands only on the revision this run started from: a draft someone
  // saved meanwhile is never overwritten. An explicit overwrite covers the
  // edited revision the person confirmed, not later edits.
  const prior = cycle.changelogDraft;
  if (prior) {
    const { count } = await db.cycleChangelogDraft.updateMany({
      where: { cycleId: cycle.id, updatedAt: prior.updatedAt },
      data,
    });
    if (count === 0) return { outcome: "skipped_edited" };
  } else {
    const { count } = await db.cycleChangelogDraft.createMany({
      data: [{ cycleId: cycle.id, ...data }],
      skipDuplicates: true,
    });
    // Another run stored a draft first: replace it only if nobody edited it.
    if (count === 0) {
      const replaced = await db.cycleChangelogDraft.updateMany({
        where: { cycleId: cycle.id, source: { not: "edited" } },
        data,
      });
      if (replaced.count === 0) return { outcome: "skipped_edited" };
    }
  }

  return {
    outcome: "drafted",
    model: draft.model,
    tokensIn: draft.tokensIn,
    tokensOut: draft.tokensOut,
  };
}

/**
 * A cycle with no product of its own, in a workspace with more than one
 * product. With a single product every ticket in the cycle is that product's,
 * so one draft is right for it.
 */
export async function isSharedAcrossProducts(
  db: PrismaClient,
  cycle: { productId: string | null; workspaceId: string | null },
): Promise<boolean> {
  if (cycle.productId || !cycle.workspaceId) return false;
  const products = await db.product.count({
    where: { workspaceId: cycle.workspaceId },
  });
  return products > 1;
}

/** How long after a cycle ends the cron still drafts it. */
const DRAFT_WINDOW_DAYS = 14;
/** Each draft is one model call; cap a single sweep. */
const MAX_DRAFTS_PER_SWEEP = 2;
/** Cycles looked at per sweep — empty ones are skipped without a model call. */
const MAX_CANDIDATES_PER_SWEEP = 25;

/**
 * Cron sweep: draft every cycle that ended in the last two weeks and has no
 * draft yet. A cycle where nothing shipped stores nothing and is looked at
 * again next sweep, which costs a query, not a model call.
 */
export async function runDueChangelogDrafts(
  db: PrismaClient,
  now: Date,
): Promise<{ cycleId: string; outcome: string; error?: string }[]> {
  const due = await db.list.findMany({
    where: {
      listType: "SPRINT",
      status: { in: ["ACTIVE", "COMPLETED"] },
      endDate: {
        lt: now,
        gte: new Date(now.getTime() - DRAFT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      },
      startDate: { not: null },
      changelogDraft: { is: null },
    },
    orderBy: { endDate: "asc" },
    take: MAX_CANDIDATES_PER_SWEEP,
    select: { id: true },
  });

  const results: { cycleId: string; outcome: string; error?: string }[] = [];
  let modelCalls = 0;
  for (const { id } of due) {
    if (modelCalls >= MAX_DRAFTS_PER_SWEEP) break;
    try {
      const result = await draftCycleChangelog(db, { cycleId: id });
      results.push({ cycleId: id, outcome: result.outcome });
      if (result.outcome === "drafted") modelCalls++;
    } catch (error) {
      modelCalls++;
      results.push({
        cycleId: id,
        outcome: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
