import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS } from "~/lib/text-limits";
import { getWorkspaceMembership } from "~/server/services/access";
import { getPublicBrief } from "~/server/services/cycleBriefs/public";
import { OUTCOME_STATUSES } from "~/server/services/cycleBriefs/types";
import { pendingChange } from "~/server/services/cycleBriefs/changes";
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

/**
 * Only a person who is a Product owner of the brief's product signs off
 * (D-0092). An agent never does, even one left in the owner list (ADR-0070).
 */
async function assertProductOwner(db: PrismaClient, userId: string, productId: string) {
  const owner = await db.productOwner.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { user: { select: { isAgent: true } } },
  });
  if (!owner || owner.user.isAgent) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a Product owner can sign off this brief",
    });
  }
}

async function loadProductWithAccess(
  db: PrismaClient,
  userId: string,
  productId: string,
  level: WorkspaceAccessLevel,
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, workspaceId: true },
  });
  if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  await assertWorkspaceAccess(db, userId, product.workspaceId, level);
  return product;
}

export const cycleBriefRouter = createTRPCRouter({
  /** The people who sign off this product's Cycle briefs. */
  listProductOwners: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId, "view");
      const rows = await ctx.db.productOwner.findMany({
        where: { productId: input.productId },
        orderBy: { createdAt: "asc" },
        select: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
      return rows.map((r) => r.user);
    }),

  /** People who may be made Product owners: the workspace's direct members, agents left out. */
  listOwnerCandidates: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      const product = await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId, "view");
      const rows = await ctx.db.workspaceUser.findMany({
        where: { workspaceId: product.workspaceId, user: { isAgent: false } },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      return rows
        .map((r) => r.user)
        .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
    }),

  /**
   * Replace a product's owners. Workspace owners and admins only. Every owner
   * must be a person in the workspace: an Assistant or External agent is
   * rejected (D-0092).
   */
  setProductOwners: protectedProcedure
    .input(z.object({ productId: z.string(), userIds: z.array(z.string()).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const product = await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId, "view");
      const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, product.workspaceId);
      if (membership?.role !== "owner" && membership?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners and admins can set Product owners",
        });
      }
      const userIds = [...new Set(input.userIds)];
      const users = await ctx.db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, isAgent: true },
      });
      if (users.length !== userIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      if (users.some((u) => u.isAgent)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A Product owner must be a person, not an Assistant or agent",
        });
      }
      for (const userId of userIds) {
        if (!(await getWorkspaceMembership(ctx.db, userId, product.workspaceId))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A Product owner must be a member of the workspace",
          });
        }
      }
      await ctx.db.$transaction([
        ctx.db.productOwner.deleteMany({
          where: { productId: product.id, userId: { notIn: userIds } },
        }),
        ctx.db.productOwner.createMany({
          data: userIds.map((userId) => ({ productId: product.id, userId })),
          skipDuplicates: true,
        }),
      ]);
      return { userIds };
    }),

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
      const [brief, owner, ownerCount] = await Promise.all([
        ctx.db.cycleBrief.findUnique({
          where: { cycleId: cycle.id },
          include: {
            outcomes: { where: { removedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
          },
        }),
        cycle.productId
          ? ctx.db.productOwner.findUnique({
              where: { productId_userId: { productId: cycle.productId, userId: ctx.session.user.id } },
              select: { user: { select: { isAgent: true } } },
            })
          : null,
        cycle.productId
          ? ctx.db.productOwner.count({ where: { productId: cycle.productId, user: { isAgent: false } } })
          : 0,
      ]);
      const outcomes = (brief?.outcomes ?? []).map((o) => ({ ...o, pendingChange: pendingChange(o) }));
      return {
        /** Legacy workspace-shared cycles get no brief. */
        canHaveBrief: cycle.productId !== null,
        isProductOwner: owner !== null && !owner.user.isAgent,
        /** No Product owner means nobody can sign off (open decision 2): the UI prompts to set one. */
        hasProductOwner: ownerCount > 0,
        cycleGoal: cycle.cycleGoal,
        brief: brief ? { ...brief, outcomes } : null,
        /** Something the next sign-off would change on the public brief. */
        hasPendingChanges: !brief?.planSignedOffAt || outcomes.some((o) => o.pendingChange !== null),
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
   * Ask to remove an outcome (or take the request back with `remove: false`).
   * One that was never public is deleted at once; a public one stays public
   * until the Product owner signs off the removal (D-0091).
   */
  requestRemoveOutcome: protectedProcedure
    .input(z.object({ outcomeId: z.string(), remove: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const outcome = await loadOutcomeWithAccess(ctx.db, ctx.session.user.id, input.outcomeId, "edit");
      const row = await ctx.db.cycleOutcome.findUniqueOrThrow({
        where: { id: outcome.id },
        select: { publicText: true },
      });
      if (input.remove && row.publicText === null) {
        await ctx.db.cycleOutcome.delete({ where: { id: outcome.id } });
        return { deleted: true };
      }
      await ctx.db.cycleOutcome.update({
        where: { id: outcome.id },
        data: { removeRequested: input.remove },
      });
      return { deleted: false };
    }),

  /**
   * The Product owner signs off the plan: every outcome's draft becomes its
   * public snapshot, in one transaction. The first sign-off is the consent to
   * publish (open decision 6); nobody is notified (open decision 1).
   *
   * After the first sign-off, an outcome that is added or reworded gets
   * `changedAt` (shown publicly as "changed on"), and a requested removal
   * takes effect.
   */
  signOff: protectedProcedure
    .input(z.object({ briefId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const brief = await loadBriefWithAccess(ctx.db, userId, input.briefId, "view");
      await assertProductOwner(ctx.db, userId, brief.productId);

      const outcomes = await ctx.db.cycleOutcome.findMany({
        where: { briefId: brief.id, removedAt: null },
        select: {
          id: true,
          draftText: true,
          draftWhy: true,
          publicText: true,
          publicWhy: true,
          removeRequested: true,
          removedAt: true,
        },
      });
      if (outcomes.every((o) => o.removeRequested)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add at least one outcome before signing off",
        });
      }

      const now = new Date();
      const isFirstSignOff = brief.planSignedOffAt === null;
      await ctx.db.$transaction([
        ...outcomes.flatMap((o) => {
          const change = pendingChange(o);
          if (o.removeRequested) {
            return [ctx.db.cycleOutcome.update({ where: { id: o.id }, data: { removedAt: now } })];
          }
          if (change === null) return [];
          return [
            ctx.db.cycleOutcome.update({
              where: { id: o.id },
              data: {
                publicText: o.draftText,
                publicWhy: o.draftWhy,
                ...(isFirstSignOff ? {} : { changedAt: now }),
              },
            }),
          ];
        }),
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

  /**
   * The weekly status of an outcome: anyone with edit access sets it, and it
   * is public at once, with its date, without sign-off (D-0097). It is never
   * derived from tickets. Closed briefs take results instead.
   */
  setStatus: protectedProcedure
    .input(z.object({ outcomeId: z.string(), status: z.enum(OUTCOME_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      const outcome = await loadOutcomeWithAccess(ctx.db, ctx.session.user.id, input.outcomeId, "edit");
      if (outcome.brief.closedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This cycle is closed: give the outcome a final result instead",
        });
      }
      return ctx.db.cycleOutcome.update({
        where: { id: outcome.id },
        data: { status: input.status, statusSetAt: new Date(), statusSetById: ctx.session.user.id },
        select: { id: true, status: true, statusSetAt: true },
      });
    }),

  /** One signed-off brief as the public sees it. Null when not public. */
  publicGet: publicProcedure
    .input(z.object({ workspaceSlug: z.string(), productSlug: z.string(), cycleSlug: z.string() }))
    .query(({ ctx, input }) =>
      getPublicBrief(ctx.db, input.workspaceSlug, input.productSlug, input.cycleSlug),
    ),
});
