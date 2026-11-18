/**
 * `cycle_brief`: the signed-off outcomes of the Cycle brief (ADR-0085) for
 * the ceremony's product's ACTIVE cycle, each with its weekly status and the
 * date it was set. An outcome whose status was never set, or was set more
 * than 7 days before the occurrence starts, is flagged stale: the weekly
 * check-in is where it gets a fresh one (D-0097).
 */
import { OUTCOME_STATUS_LABELS, isOutcomeStatus } from "~/server/services/cycleBriefs/types";
import type { AgendaItem, AgendaItemLine, SectionModule } from "../types";

export const STALE_STATUS_DAYS = 7;
const DAY_MS = 86_400_000;

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Stale when never set, or set more than `STALE_STATUS_DAYS` before the occurrence starts. */
export function isStatusStale(statusSetAt: Date | null, occurrenceStart: Date): boolean {
  if (!statusSetAt) return true;
  return occurrenceStart.getTime() - statusSetAt.getTime() > STALE_STATUS_DAYS * DAY_MS;
}

export const cycleBriefSection: SectionModule = {
  type: "cycle_brief",
  emptyReason: "No signed-off Cycle brief for this product's active cycle",
  async run(ctx, section) {
    const productId = ctx.ceremony.productId;
    if (!productId) return [];
    const cycle = await ctx.db.list.findFirst({
      where: { workspaceId: ctx.workspaceId, productId, listType: "SPRINT", status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        product: { select: { slug: true } },
        cycleBrief: {
          select: {
            planSignedOffAt: true,
            outcomes: {
              where: { publicText: { not: null }, removedAt: null },
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              select: { id: true, publicText: true, status: true, statusSetAt: true },
            },
          },
        },
      },
    });
    const brief = cycle?.cycleBrief;
    if (!cycle || !brief?.planSignedOffAt) return [];

    const start = ctx.occurrence.scheduledStart;
    const href = cycle.product ? `${ctx.workspacePath}/products/${cycle.product.slug}/cycles/${cycle.id}` : null;
    return brief.outcomes.map((outcome, order): AgendaItem => {
      const status = isOutcomeStatus(outcome.status) ? OUTCOME_STATUS_LABELS[outcome.status] : "No status yet";
      const stale = isStatusStale(outcome.statusSetAt, start);
      const setOn = outcome.statusSetAt ? `set ${shortDate(outcome.statusSetAt)}` : null;
      const staleText = stale
        ? outcome.statusSetAt
          ? `stale: older than ${STALE_STATUS_DAYS} days`
          : "stale: never set"
        : null;
      const line: AgendaItemLine = [
        { text: [status, setOn].filter(Boolean).join(" · ") },
        ...(staleText ? [{ text: ` · ${staleText}`, warn: true }] : []),
      ];
      return {
        id: `${section.key}:cycle_outcome:${outcome.id}`,
        sectionKey: section.key,
        title: outcome.publicText ?? "",
        refType: "cycle_outcome",
        refId: outcome.id,
        order,
        detail: [status, setOn, staleText].filter(Boolean).join(" · "),
        lines: [line],
        href,
      };
    });
  },
};
