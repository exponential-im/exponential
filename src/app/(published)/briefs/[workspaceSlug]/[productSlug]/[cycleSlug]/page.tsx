import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { getPublicBaseUrl } from "~/lib/urls";
import { getPublicBrief, publicBriefPath, publicBriefsPath } from "~/server/services/cycleBriefs/public";
import { BriefShell, formatBriefDate, formatCycleWindow } from "../../../_components/BriefShell";
import { OutcomeStatusPill } from "../../../_components/OutcomeStatusPill";

/** Never cached: a sign-off or a status change must show at once. */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string; productSlug: string; cycleSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug, productSlug, cycleSlug } = await params;
  const result = await getPublicBrief(db, workspaceSlug, productSlug, cycleSlug);
  if (!result) return { title: "Not found" };
  const baseUrl = await getPublicBaseUrl();
  const url = `${baseUrl}${publicBriefPath(workspaceSlug, productSlug, cycleSlug)}`;
  const title = `${result.product.name}: ${result.brief.cycleName}`;
  const description = `What ${result.product.name} aims for in ${result.brief.cycleName}, and why.`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, type: "article", url } };
}

/** One signed-off Cycle brief: its outcomes as the Product owner signed them off. */
export default async function PublicBriefPage({ params }: Params) {
  const { workspaceSlug, productSlug, cycleSlug } = await params;
  const result = await getPublicBrief(db, workspaceSlug, productSlug, cycleSlug);
  if (!result) notFound();
  const { product, brief } = result;
  const window = formatCycleWindow(brief.startDate, brief.endDate);

  return (
    <BriefShell productName={product.name} indexHref={publicBriefsPath(product.workspaceSlug, product.slug)}>
      <article>
        <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">
          {product.name}
          {window ? ` · ${window}` : ""}
        </p>
        <h1 className="mb-2 text-3xl font-bold text-text-primary">{brief.cycleName}</h1>
        <p className="mb-8 text-sm text-text-muted">Signed off {formatBriefDate(brief.signedOffAt)}</p>

        <h2 className="mb-4 text-lg font-semibold text-text-primary">What this cycle aims for</h2>
        <ol className="space-y-6">
          {brief.outcomes.map((outcome, index) => (
            <li key={index} className="border-l-2 border-border-primary pl-4">
              <div className="mb-1">
                <OutcomeStatusPill
                  status={outcome.status}
                  asOf={outcome.statusSetAt ? formatBriefDate(outcome.statusSetAt) : null}
                />
              </div>
              <p className="text-base font-medium text-text-primary">{outcome.text}</p>
              <p className="mt-1 text-sm text-text-secondary">
                <span className="text-text-muted">Why: </span>
                {outcome.why}
              </p>
            </li>
          ))}
        </ol>
      </article>
    </BriefShell>
  );
}
