import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS } from "~/lib/text-limits";
import { getPublicBrief } from "~/server/services/cycleBriefs/public";
import { assertWorkspaceAccess, type WorkspaceAccessLevel } from "./product";

/**
 * Cycle briefs (ADR-0085): one public, plain-language plan per product Cycle.
 *
 * Each outcome holds its draft (`draftText` / `draftWhy`, what the team edits)
 * and its signed-off snapshot (`publicText` / `publicWhy`, what the public
 * route shows) side by side. Only a Product owner's `signOff` copies the
 * draft to the snapshot.
 */

/** Trimmed, required, bounded text with a field-named message. */
function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long: max ${max.toLocaleString()} characters.`);
}

const BRIEF_SELECT = {
  id: true,
  cycleId: true,
  productId: true,
  workspaceId: true,
  planSignedOffAt: true,
  closedAt: true,
} as const;

async function loadBriefWithAccess(
  db: PrismaClient,
  userId: string,
  briefId: string,
  level: WorkspaceAccessLevel,
) {
  const brief = await db.cycleBrief.findUnique({ where: { id: briefId }, select: BRIEF_SELECT });
  if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "Cycle brief not found" });
  await assertWorkspaceAccess(db, userId, brief.workspaceId, level);
  return brief;
}

async function loadOutcomeWithAccess(
  db: PrismaClient,
  userId: string,
  outcomeId: string,
  level: WorkspaceAccessLevel,
) {
  const outcome = await db.cycleOutcome.findUnique({
    where: { id: outcomeId },
    select: { id: true, briefId: true, removedAt: true, brief: { select: BRIEF_SELECT } },
  });
  if (!outcome || outcome.removedAt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Outcome not found" });
  }
  await assertWorkspaceAccess(db, userId, outcome.brief.workspaceId, level);
  return outcome;
}

/** Only a Product owner of the brief's product signs off (D-0092). */
async function assertProductOwner(db: PrismaClient, userId: string, productId: string) {
  const owner = await db.productOwner.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { userId: true },
  });
  if (!owner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a Product owner can sign off this brief",
    });
  }
}

export const cycleBriefRouter = createTRPCRouter({
  /** The brief of one cycle for the team: drafts, snapshots and status. Null when none exists yet. */
  getForCycle: protectedProcedure
    .input(z.object({ cycleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const cycle = await ctx.db.list.findUnique({
        where: { id: input.cycleId },
        select: { id: true, workspaceId: true, productId: true, listType: true, cycleGoal: true },
      });
      if (!cycle || cycle.listType !== "SPRINT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await assertWorkspaceAccess(ctx.db, ctx.session.user.id, cycle.workspaceId, "view");
      const [brief, owner] = await Promise.all([
        ctx.db.cycleBrief.findUnique({
          where: { cycleId: cycle.id },
          include: {
            outcomes: { where: { removedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
          },
        }),
        cycle.productId
          ? ctx.db.productOwner.findUnique({
              where: { productId_userId: { productId: cycle.productId, userId: ctx.session.user.id } },
              select: { userId: true },
            })
          : null,
      ]);
      return {
        /** Legacy workspace-shared cycles get no brief. */
        canHaveBrief: cycle.productId !== null,
        isProductOwner: owner !== null,
        cycleGoal: cycle.cycleGoal,
        brief,
      };
    }),

  /** Start the brief of a product cycle. Idempotent per cycle. */
  create: protectedProcedure
    .input(z.object({ cycleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cycle = await ctx.db.list.findUnique({
        where: { id: input.cycleId },
        select: { id: true, workspaceId: true, productId: true, listType: true },
      });
      if (!cycle || cycle.listType !== "SPRINT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await assertWorkspaceAccess(ctx.db, ctx.session.user.id, cycle.workspaceId, "edit");
      if (!cycle.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a product's cycle can have a brief",
        });
      }
      return ctx.db.cycleBrief.upsert({
        where: { cycleId: cycle.id },
        create: { cycleId: cycle.id, productId: cycle.productId, workspaceId: cycle.workspaceId },
        update: {},
        select: BRIEF_SELECT,
      });
    }),

  /** Add an outcome, or edit an outcome's draft. Never touches the signed-off snapshot. */
  upsertOutcome: protectedProcedure
    .input(
      z.object({
        briefId: z.string(),
        outcomeId: z.string().optional(),
        text: requiredText("Outcome", TEXT_LIMITS.SHORT),
        why: requiredText("Why", TEXT_LIMITS.SHORT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brief = await loadBriefWithAccess(ctx.db, ctx.session.user.id, input.briefId, "edit");
      if (input.outcomeId) {
        const outcome = await loadOutcomeWithAccess(ctx.db, ctx.session.user.id, input.outcomeId, "edit");
        if (outcome.briefId !== brief.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Outcome not found" });
        }
        return ctx.db.cycleOutcome.update({
          where: { id: outcome.id },
          data: { draftText: input.text, draftWhy: input.why },
        });
      }
      const last = await ctx.db.cycleOutcome.findFirst({
        where: { briefId: brief.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return ctx.db.cycleOutcome.create({
        data: {
          briefId: brief.id,
          position: (last?.position ?? -1) + 1,
          draftText: input.text,
          draftWhy: input.why,
        },
      });
    }),

  /**
   * The Product owner signs off the plan: every outcome's draft becomes its
   * public snapshot, in one transaction. The first sign-off is the consent to
   * publish (open decision 6); nobody is notified (open decision 1).
   */
  signOff: protectedProcedure
    .input(z.object({ briefId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const brief = await loadBriefWithAccess(ctx.db, userId, input.briefId, "view");
      await assertProductOwner(ctx.db, userId, brief.productId);

      const outcomes = await ctx.db.cycleOutcome.findMany({
        where: { briefId: brief.id, removedAt: null },
        select: { id: true, draftText: true, draftWhy: true },
      });
      if (outcomes.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add at least one outcome before signing off",
        });
      }

      const now = new Date();
      await ctx.db.$transaction([
        ...outcomes.map((o) =>
          ctx.db.cycleOutcome.update({
            where: { id: o.id },
            data: { publicText: o.draftText, publicWhy: o.draftWhy },
          }),
        ),
        ctx.db.cycleBrief.update({
          where: { id: brief.id },
          data: {
            planSignedOffAt: brief.planSignedOffAt ?? now,
            planSignedOffById: userId,
          },
        }),
      ]);
      return { signedOffAt: brief.planSignedOffAt ?? now };
    }),

  /** One signed-off brief as the public sees it. Null when not public. */
  publicGet: publicProcedure
    .input(z.object({ workspaceSlug: z.string(), productSlug: z.string(), cycleSlug: z.string() }))
    .query(({ ctx, input }) =>
      getPublicBrief(ctx.db, input.workspaceSlug, input.productSlug, input.cycleSlug),
    ),
});
