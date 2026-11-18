/**
 * Read side of Cycle briefs (ADR-0085): what `/briefs/<workspace>/<product>`
 * and its detail pages show. Only a brief whose plan a Product owner signed
 * off is public, and only the signed-off snapshot of each outcome
 * (`publicText` / `publicWhy`) is shown, never the draft. Weekly status is
 * the one live part (D-0097).
 *
 * `projectPublicBrief` is the single function that decides what leaves the
 * database. It never returns who set a status, draft fields, ticket data,
 * Objective, Feature or Insight ids, or any person's name (D-0094).
 */
import type { PrismaClient } from "@prisma/client";
import { isOutcomeStatus, type OutcomeStatus } from "./types";

export interface PublicCycleOutcome {
  text: string;
  why: string;
  /** Live weekly status, public without sign-off (D-0097). */
  status: OutcomeStatus | null;
  /** When the status was set: the page shows "as of <date>". */
  statusSetAt: Date | null;
  /** When a sign-off after the first changed this outcome (D-0091). */
  changedAt: Date | null;
}

export interface PublicCycleBrief {
  cycleName: string;
  cycleSlug: string;
  startDate: Date | null;
  endDate: Date | null;
  signedOffAt: Date;
  outcomes: PublicCycleOutcome[];
}

export interface PublicProduct {
  name: string;
  slug: string;
  workspaceName: string;
  workspaceSlug: string;
}

/** The row shape the projection reads. Extra fields are ignored, never copied. */
export interface BriefProjectionInput {
  planSignedOffAt: Date | null;
  cycle: { name: string; slug: string; startDate: Date | null; endDate: Date | null };
  outcomes: Array<{
    position: number;
    publicText: string | null;
    publicWhy: string | null;
    removedAt: Date | null;
    status: string | null;
    statusSetAt: Date | null;
    changedAt: Date | null;
  }>;
}

/**
 * The public view of one brief, or null when its plan was never signed off.
 * Builds every field by hand so a new column can never leak by accident.
 */
export function projectPublicBrief(brief: BriefProjectionInput): PublicCycleBrief | null {
  if (!brief.planSignedOffAt) return null;
  const outcomes = brief.outcomes
    .filter((o) => o.publicText !== null && o.removedAt === null)
    .sort((a, b) => a.position - b.position)
    .map((o) => {
      const status = isOutcomeStatus(o.status) ? o.status : null;
      return {
        text: o.publicText ?? "",
        why: o.publicWhy ?? "",
        status,
        statusSetAt: status ? o.statusSetAt : null,
        changedAt: o.changedAt,
      };
    });
  return {
    cycleName: brief.cycle.name,
    cycleSlug: brief.cycle.slug,
    startDate: brief.cycle.startDate,
    endDate: brief.cycle.endDate,
    signedOffAt: brief.planSignedOffAt,
    outcomes,
  };
}

const PROJECTION_SELECT = {
  planSignedOffAt: true,
  cycle: { select: { name: true, slug: true, startDate: true, endDate: true } },
  outcomes: {
    select: {
      position: true,
      publicText: true,
      publicWhy: true,
      removedAt: true,
      status: true,
      statusSetAt: true,
      changedAt: true,
    },
  },
} as const;

async function findPublicProduct(
  db: PrismaClient,
  workspaceSlug: string,
  productSlug: string,
): Promise<{ id: string; product: PublicProduct } | null> {
  const workspace = await db.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!workspace) return null;
  const product = await db.product.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: productSlug } },
    select: { id: true, name: true, slug: true },
  });
  if (!product) return null;
  return {
    id: product.id,
    product: {
      name: product.name,
      slug: product.slug,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
    },
  };
}

/** One signed-off brief of a product, by its cycle's slug; null if not public. */
export async function getPublicBrief(
  db: PrismaClient,
  workspaceSlug: string,
  productSlug: string,
  cycleSlug: string,
): Promise<{ product: PublicProduct; brief: PublicCycleBrief } | null> {
  const found = await findPublicProduct(db, workspaceSlug, productSlug);
  if (!found) return null;
  const row = await db.cycleBrief.findFirst({
    where: {
      productId: found.id,
      planSignedOffAt: { not: null },
      cycle: { slug: cycleSlug },
    },
    select: PROJECTION_SELECT,
  });
  const brief = row ? projectPublicBrief(row) : null;
  if (!brief) return null;
  return { product: found.product, brief };
}

export function publicBriefsPath(workspaceSlug: string, productSlug: string): string {
  return `/briefs/${workspaceSlug}/${productSlug}`;
}

export function publicBriefPath(workspaceSlug: string, productSlug: string, cycleSlug: string): string {
  return `${publicBriefsPath(workspaceSlug, productSlug)}/${cycleSlug}`;
}
