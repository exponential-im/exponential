import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS } from "~/lib/text-limits";
import { AccessControlService, getWorkspaceMembership } from "~/server/services/access";
import { getPublicBrief, listPublicBriefs } from "~/server/services/cycleBriefs/public";
import { OUTCOME_RESULTS, OUTCOME_STATUSES } from "~/server/services/cycleBriefs/types";
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
 * Feature links must be Features of the brief's product, and the Objective
 * must be one of the brief's workspace (D-0090).
 */
async function assertLinksBelong(
  db: PrismaClient,
  brief: { productId: string; workspaceId: string },
  featureIds: string[] | undefined,
  goalId: number | null | undefined,
) {
  if (featureIds?.length) {
    const count = await db.feature.count({
      where: { id: { in: [...new Set(featureIds)] }, productId: brief.productId },
    });
    if (count !== new Set(featureIds).size) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "An outcome can only link to Features of the same product",
      });
    }
  }
  if (goalId !== undefined && goalId !== null) {
    const goal = await db.goal.findUnique({ where: { id: goalId }, select: { workspaceId: true } });
    if (goal?.workspaceId !== brief.workspaceId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Objective not found in this workspace" });
    }
  }
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
      // Workspace owners and admins: the centralized `manage_members` gate (ACCESS_CONTROL.md).
      const access = await new AccessControlService(ctx.db).canAccess({
        userId: ctx.session.user.id,
        resourceType: "workspace",
        resourceId: product.workspaceId,
        permission: "manage_members",
      });
      if (!access.allowed) {
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
        select: { id: true, workspaceId: true, productId: true, listType: true, cycleGoal: true, status: true },
      });
      if (!cycle || cycle.listType !== "SPRINT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await assertWorkspaceAccess(ctx.db, ctx.session.user.id, cycle.workspaceId, "view");
      const [brief, owner, ownerCount] = await Promise.all([
        ctx.db.cycleBrief.findUnique({
          where: { cycleId: cycle.id },
          include: {
            outcomes: {
              where: { removedAt: null },
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              include: {
                features: { select: { feature: { select: { id: true, name: true } } } },
                goal: { select: { id: true, title: true } },
                carriedFrom: { select: { brief: { select: { cycle: { select: { name: true } } } } } },
              },
            },
            exclusions: {
              where: { removedAt: null },
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              include: { insight: { select: { id: true, title: true } } },
            },
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
      const exclusions = (brief?.exclusions ?? []).map((x) => ({
        ...x,
        pendingChange: pendingChange({ ...x, draftWhy: x.draftReason, publicWhy: x.publicReason }),
      }));
      return {
        /** Legacy workspace-shared cycles get no brief. */
        canHaveBrief: cycle.productId !== null,
        isProductOwner: owner !== null && !owner.user.isAgent,
        /** No Product owner means nobody can sign off (open decision 2): the UI prompts to set one. */
        hasProductOwner: ownerCount > 0,
        cycleGoal: cycle.cycleGoal,
        /** Results replace weekly status once the cycle is completed. */
        isCycleCompleted: cycle.status === "COMPLETED",
        brief: brief ? { ...brief, outcomes, exclusions } : null,
        /** Something the next sign-off would change on the public brief. */
        hasPendingChanges:
          !brief?.planSignedOffAt ||
          outcomes.some((o) => o.pendingChange !== null) ||
          exclusions.some((x) => x.pendingChange !== null),
      };
    }),

  /** Start the brief of a product cycle. Idempotent per cycle. */
  create: protectedProcedure
    .input(z.object({ cycleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cycle = await ctx.db.list.findUnique({
        where: { id: input.cycleId },
        select: { id: true, workspaceId: true, productId: true, listType: true, status: true },
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
        create: {
          cycleId: cycle.id,
          productId: cycle.productId,
          workspaceId: cycle.workspaceId,
          // A brief started on a cycle that already completed is closed from the start.
          closedAt: cycle.status === "COMPLETED" ? new Date() : null,
        },
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
        /** Features of the same product, for the team. Omit to leave the links as they are. */
        featureIds: z.array(z.string()).max(20).optional(),
        /** At most one Objective (D-0090); null clears it. Omit to leave it. */
        goalId: z.number().int().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brief = await loadBriefWithAccess(ctx.db, ctx.session.user.id, input.briefId, "edit");
      await assertLinksBelong(ctx.db, brief, input.featureIds, input.goalId);
      const links = {
        ...(input.goalId !== undefined ? { goalId: input.goalId } : {}),
      };
      const featureLinks = (outcomeId: string) =>
        input.featureIds === undefined
          ? []
          : [
              ctx.db.cycleOutcomeFeature.deleteMany({
                where: { outcomeId, featureId: { notIn: input.featureIds } },
              }),
              ctx.db.cycleOutcomeFeature.createMany({
                data: input.featureIds.map((featureId) => ({ outcomeId, featureId })),
                skipDuplicates: true,
              }),
            ];
      if (input.outcomeId) {
        const outcome = await loadOutcomeWithAccess(ctx.db, ctx.session.user.id, input.outcomeId, "edit");
        if (outcome.briefId !== brief.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Outcome not found" });
        }
        const [updated] = await ctx.db.$transaction([
          ctx.db.cycleOutcome.update({
            where: { id: outcome.id },
            data: { draftText: input.text, draftWhy: input.why, ...links },
          }),
          ...featureLinks(outcome.id),
        ]);
        return updated;
      }
      const last = await ctx.db.cycleOutcome.findFirst({
        where: { briefId: brief.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const created = await ctx.db.cycleOutcome.create({
        data: {
          briefId: brief.id,
          position: (last?.position ?? -1) + 1,
          draftText: input.text,
          draftWhy: input.why,
          ...links,
        },
      });
      if (input.featureIds?.length) await ctx.db.$transaction(featureLinks(created.id));
      return created;
    }),

  /** What an outcome may link to: this product's Features and the workspace's Objectives. */
  linkOptions: protectedProcedure
    .input(z.object({ briefId: z.string() }))
    .query(async ({ ctx, input }) => {
      const brief = await loadBriefWithAccess(ctx.db, ctx.session.user.id, input.briefId, "view");
      const [features, objectives, insights] = await Promise.all([
        ctx.db.feature.findMany({
          where: { productId: brief.productId, status: { not: "ARCHIVED" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        ctx.db.goal.findMany({
          where: { workspaceId: brief.workspaceId, status: { not: "archived" } },
          select: { id: true, title: true },
          orderBy: { title: "asc" },
        }),
        ctx.db.insight.findMany({
          where: { productId: brief.productId, status: { not: "DISMISSED" }, duplicateOfId: null },
          select: { id: true, title: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      ]);
      return { features, objectives, insights };
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
   * Add or edit a "Not this cycle" item (D-0095): what the team is not doing
   * this cycle, with a required reason and, optionally, the feedback Insight
   * it answers. Signed off with the plan.
   */
  upsertExclusion: protectedProcedure
    .input(
      z.object({
        briefId: z.string(),
        exclusionId: z.string().optional(),
        text: requiredText("Item", TEXT_LIMITS.SHORT),
        reason: requiredText("Reason", TEXT_LIMITS.SHORT),
        insightId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const brief = await loadBriefWithAccess(ctx.db, ctx.session.user.id, input.briefId, "edit");
      if (input.insightId) {
        const insight = await ctx.db.insight.findUnique({
          where: { id: input.insightId },
          select: { productId: true },
        });
        if (insight?.productId !== brief.productId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An item can only link to an Insight of the same product",
          });
        }
      }
      const data = {
        draftText: input.text,
        draftReason: input.reason,
        ...(input.insightId !== undefined ? { insightId: input.insightId } : {}),
      };
      if (input.exclusionId) {
        const existing = await ctx.db.cycleBriefExclusion.findUnique({
          where: { id: input.exclusionId },
          select: { briefId: true, removedAt: true },
        });
        if (existing?.briefId !== brief.id || existing.removedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
        }
        return ctx.db.cycleBriefExclusion.update({ where: { id: input.exclusionId }, data });
      }
      const last = await ctx.db.cycleBriefExclusion.findFirst({
        where: { briefId: brief.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return ctx.db.cycleBriefExclusion.create({
        data: { briefId: brief.id, position: (last?.position ?? -1) + 1, ...data },
      });
    }),

  /** Remove a "Not this cycle" item; like outcomes, a public one waits for sign-off. */
  requestRemoveExclusion: protectedProcedure
    .input(z.object({ exclusionId: z.string(), remove: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.cycleBriefExclusion.findUnique({
        where: { id: input.exclusionId },
        select: { id: true, briefId: true, publicText: true, removedAt: true },
      });
      if (!row || row.removedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      await loadBriefWithAccess(ctx.db, ctx.session.user.id, row.briefId, "edit");
      if (input.remove && row.publicText === null) {
        await ctx.db.cycleBriefExclusion.delete({ where: { id: row.id } });
        return { deleted: true };
      }
      await ctx.db.cycleBriefExclusion.update({
        where: { id: row.id },
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

      const exclusions = await ctx.db.cycleBriefExclusion.findMany({
        where: { briefId: brief.id, removedAt: null },
        select: {
          id: true,
          draftText: true,
          draftReason: true,
          publicText: true,
          publicReason: true,
          removeRequested: true,
          removedAt: true,
        },
      });

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
        ...exclusions.flatMap((x) => {
          if (x.removeRequested) {
            return [ctx.db.cycleBriefExclusion.update({ where: { id: x.id }, data: { removedAt: now } })];
          }
          if (x.publicText === x.draftText && x.publicReason === x.draftReason) return [];
          return [
            ctx.db.cycleBriefExclusion.update({
              where: { id: x.id },
              data: { publicText: x.draftText, publicReason: x.draftReason },
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

  /**
   * An outcome's final result once the cycle is COMPLETED: Achieved, Partly
   * or Missed, with an optional note (D-0098). A person's step, public at
   * once like status; nothing writes it automatically.
   */
  setResult: protectedProcedure
    .input(
      z.object({
        outcomeId: z.string(),
        result: z.enum(OUTCOME_RESULTS),
        note: z.string().trim().max(TEXT_LIMITS.SHORT).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const outcome = await loadOutcomeWithAccess(ctx.db, ctx.session.user.id, input.outcomeId, "edit");
      const cycle = await ctx.db.list.findUnique({
        where: { id: outcome.brief.cycleId },
        select: { status: true },
      });
      if (cycle?.status !== "COMPLETED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A final result can only be given once the cycle is completed",
        });
      }
      return ctx.db.cycleOutcome.update({
        where: { id: outcome.id },
        data: {
          result: input.result,
          ...(input.note !== undefined ? { resultNote: input.note ? input.note : null } : {}),
        },
        select: { id: true, result: true, resultNote: true },
      });
    }),

  /**
   * The previous brief of the same product, with its outcomes, for the
   * Product owner to carry over or drop at planning. Nothing rolls over on
   * its own (D-0098).
   */
  carryOverCandidates: protectedProcedure
    .input(z.object({ briefId: z.string() }))
    .query(async ({ ctx, input }) => {
      const brief = await loadBriefWithAccess(ctx.db, ctx.session.user.id, input.briefId, "view");
      const cycle = await ctx.db.list.findUniqueOrThrow({
        where: { id: brief.cycleId },
        select: { startDate: true, createdAt: true },
      });
      const previous = await ctx.db.cycleBrief.findFirst({
        where: {
          productId: brief.productId,
          id: { not: brief.id },
          cycle: cycle.startDate ? { startDate: { lt: cycle.startDate } } : { createdAt: { lt: cycle.createdAt } },
        },
        orderBy: cycle.startDate ? { cycle: { startDate: "desc" } } : { cycle: { createdAt: "desc" } },
        select: {
          id: true,
          cycle: { select: { name: true } },
          outcomes: {
            where: { removedAt: null },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true, draftText: true, publicText: true, result: true, status: true },
          },
        },
      });
      if (!previous) return null;
      const carried = await ctx.db.cycleOutcome.findMany({
        where: { briefId: brief.id, carriedFromId: { in: previous.outcomes.map((o) => o.id) }, removedAt: null },
        select: { carriedFromId: true },
      });
      const carriedIds = new Set(carried.map((c) => c.carriedFromId));
      return {
        cycleName: previous.cycle.name,
        outcomes: previous.outcomes.map((o) => ({
          id: o.id,
          text: o.publicText ?? o.draftText,
          result: o.result,
          status: o.status,
          isCarried: carriedIds.has(o.id),
        })),
      };
    }),

  /**
   * The Product owner carries an outcome of an earlier brief of the same
   * product into this one, as a new draft (it goes public at the next
   * sign-off) marked "carried over from <cycle>". Never automatic (D-0098).
   */
  carryOver: protectedProcedure
    .input(z.object({ outcomeId: z.string(), toBriefId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const target = await loadBriefWithAccess(ctx.db, userId, input.toBriefId, "view");
      await assertProductOwner(ctx.db, userId, target.productId);
      const source = await ctx.db.cycleOutcome.findUnique({
        where: { id: input.outcomeId },
        select: {
          id: true,
          draftText: true,
          draftWhy: true,
          publicText: true,
          publicWhy: true,
          goalId: true,
          removedAt: true,
          features: { select: { featureId: true } },
          brief: {
            select: { id: true, productId: true, cycle: { select: { startDate: true, createdAt: true } } },
          },
        },
      });
      if (!source || source.removedAt || source.brief.productId !== target.productId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Outcome not found in this product" });
      }
      const targetCycle = await ctx.db.list.findUniqueOrThrow({
        where: { id: target.cycleId },
        select: { startDate: true, createdAt: true },
      });
      // Earlier by start date, as carryOverCandidates orders them; by creation when either has no dates.
      const sourceCycle = source.brief.cycle;
      const isEarlier =
        sourceCycle.startDate && targetCycle.startDate
          ? sourceCycle.startDate < targetCycle.startDate
          : sourceCycle.createdAt < targetCycle.createdAt;
      if (source.brief.id === target.id || !isEarlier) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Carry an outcome over from an earlier cycle" });
      }
      const already = await ctx.db.cycleOutcome.findFirst({
        where: { briefId: target.id, carriedFromId: source.id, removedAt: null },
        select: { id: true },
      });
      if (already) {
        throw new TRPCError({ code: "CONFLICT", message: "This outcome is already carried over" });
      }
      const last = await ctx.db.cycleOutcome.findFirst({
        where: { briefId: target.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return ctx.db.cycleOutcome.create({
        data: {
          briefId: target.id,
          position: (last?.position ?? -1) + 1,
          // The wording readers last saw, so the carried aim reads the same.
          draftText: source.publicText ?? source.draftText,
          draftWhy: source.publicWhy ?? source.draftWhy,
          goalId: source.goalId,
          carriedFromId: source.id,
          features: { create: source.features.map((f) => ({ featureId: f.featureId })) },
        },
      });
    }),

  /** A product's signed-off briefs, newest first. Null when it has none. */
  publicList: publicProcedure
    .input(z.object({ workspaceSlug: z.string(), productSlug: z.string() }))
    .query(({ ctx, input }) => listPublicBriefs(ctx.db, input.workspaceSlug, input.productSlug)),

  /** One signed-off brief as the public sees it. Null when not public. */
  publicGet: publicProcedure
    .input(z.object({ workspaceSlug: z.string(), productSlug: z.string(), cycleSlug: z.string() }))
    .query(({ ctx, input }) =>
      getPublicBrief(ctx.db, input.workspaceSlug, input.productSlug, input.cycleSlug),
    ),
});
