import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getPillarPage, listPillars } from "~/server/services/pillars/PillarService";

/**
 * Pillars (ADR-0085): reads for the Pillar page. Promotion lives on the tag
 * router (`tag.setPillar`), because a Pillar is a tag.
 */
export const pillarRouter = createTRPCRouter({
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

  get: protectedProcedure
    .input(z.object({ tagId: z.string(), includeCompleted: z.boolean().optional() }))
    .query(({ ctx, input }) =>
      getPillarPage({
        db: ctx.db,
        userId: ctx.session.user.id,
        tagId: input.tagId,
        includeCompleted: input.includeCompleted ?? false,
      }),
    ),
});
