import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { getPublicBaseUrl } from "~/lib/urls";
import { getPublicBrief, publicBriefPath, publicBriefsPath } from "~/server/services/cycleBriefs/public";
import { BriefShell, formatBriefDate, formatCycleWindow } from "../../../_components/BriefShell";
import { OutcomeStatusPill } from "../../../_components/OutcomeStatusPill";
import { OutcomeResultPill } from "../../../_components/OutcomeResultPill";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

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

        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          {brief.closed ? "What this cycle aimed for, and how it went" : "What this cycle aims for"}
        </h2>
        <ol className="space-y-6">
          {brief.outcomes.map((outcome, index) => (
            <li key={index} className="border-l-2 border-border-primary pl-4">
              <div className="mb-1">
                {brief.closed ? (
                  <OutcomeResultPill result={outcome.result} />
                ) : (
                  <OutcomeStatusPill
                    status={outcome.status}
                    asOf={outcome.statusSetAt ? formatBriefDate(outcome.statusSetAt) : null}
                  />
                )}
              </div>
              <p className="text-base font-medium text-text-primary">{outcome.text}</p>
              {outcome.carriedFromCycle && (
                <p className="text-xs text-text-muted">Carried over from {outcome.carriedFromCycle}</p>
              )}
              <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">Why</p>
              <MarkdownRenderer content={outcome.why} variant="compact" />
              {brief.closed && outcome.resultNote && (
                <>
                  <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">Result</p>
                  <MarkdownRenderer content={outcome.resultNote} variant="compact" />
                </>
              )}
              {outcome.changedAt && (
                <p className="mt-1 text-xs text-text-muted">Changed on {formatBriefDate(outcome.changedAt)}</p>
              )}
            </li>
          ))}
        </ol>

        {brief.exclusions.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Not this cycle</h2>
            <ul className="space-y-4">
              {brief.exclusions.map((item, index) => (
                <li key={index}>
                  <p className="text-base text-text-primary">{item.text}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">Because</p>
                  <MarkdownRenderer content={item.reason} variant="compact" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </BriefShell>
  );
}
