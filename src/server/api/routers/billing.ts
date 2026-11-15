import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { assertWorkspaceRole } from "~/server/services/access";
import { FREE_ALLOWANCE_MICROS, resolveBillingMode } from "~/server/services/billing/config";
import { getPeriodUsage } from "~/server/services/billing/usage";

export const billingRouter = createTRPCRouter({
  /**
   * What the Billing tab shows for a workspace: owners and admins only.
   *
   * On an install that does not meter (`BILLING_MODE` unset or `off`) it
   * answers `{ mode: "off" }` without touching the database, and the settings
   * page shows no Billing tab.
   *
   * Usage is a share of the month's allowance with no unit: never a cost, a
   * token count or the allowance itself.
   */
  getStatus: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const mode = resolveBillingMode(process.env);
      if (mode === "off") return { mode } as const;

      await assertWorkspaceRole(ctx.db, ctx.session.user.id, input.workspaceId, ["owner", "admin"]);
      const usage = await getPeriodUsage(ctx.db, input.workspaceId);
      return {
        mode,
        /** Whole percent of the month's allowance used; above 100 once it is passed. */
        usedPercent: Math.round((usage.usedMicros / FREE_ALLOWANCE_MICROS) * 100),
        /** When the month's count starts again. */
        resetsAt: usage.periodEnd,
      } as const;
    }),
});
