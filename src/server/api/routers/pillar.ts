import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  getPillarPage,
  listPillars,
  suggestPillarsFor,
} from "~/server/services/pillars/PillarService";

/**
 * Pillars (ADR-0086): reads for the Pillar page. Promotion lives on the tag
 * router (`tag.setPillar`), because a Pillar is a tag.
 */
export const pillarRouter = createTRPCRouter({
  // Pillars to pre-tick for a capture (the Chrome extension sends the page's
  // title and URL). Suggestions only; the person sees and can untick them.
  suggest: protectedProcedure
    .input(z.object({ workspaceId: z.string(), text: z.string().max(4000) }))
    .query(({ ctx, input }) =>
      suggestPillarsFor({
        db: ctx.db,
        userId: ctx.session.user.id,
        workspaceId: input.workspaceId,
        text: input.text,
      }),
    ),

  list: protectedProcedure
    .input(z.object({ workspaceId: z.string(), includeArchived: z.boolean().optional() }))
    .query(({ ctx, input }) =>
      listPillars({
        db: ctx.db,
        userId: ctx.session.user.id,
        workspaceId: input.workspaceId,
        includeArchived: input.includeArchived ?? false,
      }),
    ),

  // The Pillar page, named the way its URL names it: workspace slug, then the
  // tag's slug (or its id, from links made before slugs; the page then moves
  // to the slug URL).
  get: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        pillar: z.string(),
        includeCompleted: z.boolean().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getPillarPage({
        db: ctx.db,
        userId: ctx.session.user.id,
        workspaceSlug: input.workspaceSlug,
        pillar: input.pillar,
        includeCompleted: input.includeCompleted ?? false,
      }),
    ),
});
