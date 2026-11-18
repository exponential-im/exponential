import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getPillarPage } from "~/server/services/pillars/PillarService";

/**
 * Pillars (ADR-0085): reads for the Pillar page. Promotion lives on the tag
 * router (`tag.setPillar`), because a Pillar is a tag.
 */
export const pillarRouter = createTRPCRouter({
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
