import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { getPublicBaseUrl } from "~/lib/urls";
import { listPublicBriefs, publicBriefPath, publicBriefsPath } from "~/server/services/cycleBriefs/public";
import { BriefShell, formatBriefDate, formatCycleWindow } from "../../_components/BriefShell";
import { OutcomeStatusPill } from "../../_components/OutcomeStatusPill";
import { OutcomeResultPill } from "../../_components/OutcomeResultPill";

/** Never cached: a sign-off or a status change must show at once. */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string; productSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug, productSlug } = await params;
  const result = await listPublicBriefs(db, workspaceSlug, productSlug);
  if (!result) return { title: "Not found" };
  const baseUrl = await getPublicBaseUrl();
  const url = `${baseUrl}${publicBriefsPath(workspaceSlug, productSlug)}`;
  const title = `${result.product.name} cycle briefs`;
  const description = `What ${result.product.name} aims for each cycle, why, and how it is going.`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, type: "website", url } };
}

/**
 * A product's one stable public URL (D-0096): every signed-off Cycle brief,
 * newest first. 404 until the first brief is signed off.
 */
export default async function PublicBriefsIndexPage({ params }: Params) {
  const { workspaceSlug, productSlug } = await params;
  const result = await listPublicBriefs(db, workspaceSlug, productSlug);
  if (!result) notFound();
  const { product, briefs } = result;

  return (
    <BriefShell productName={product.name} indexHref={publicBriefsPath(product.workspaceSlug, product.slug)}>
      <h1 className="mb-2 text-3xl font-bold text-text-primary">What {product.name} is working on</h1>
      <p className="mb-10 text-sm text-text-muted">
        One plan per cycle, signed off by the product owner. Newest first.
      </p>
      <div className="space-y-12">
        {briefs.map((brief) => {
          const window = formatCycleWindow(brief.startDate, brief.endDate);
          return (
            <article key={brief.cycleSlug} className="border-b border-border-primary pb-10 last:border-b-0">
              <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">
                {window ?? `Signed off ${formatBriefDate(brief.signedOffAt)}`}
              </p>
              <h2 className="mb-4 text-2xl font-semibold text-text-primary">
                <Link
                  href={publicBriefPath(product.workspaceSlug, product.slug, brief.cycleSlug)}
                  className="hover:underline"
                >
                  {brief.cycleName}
                </Link>
              </h2>
              <ul className="space-y-3">
                {brief.outcomes.map((outcome, index) => (
                  <li key={index} className="flex flex-col gap-1">
                    <span className="text-base text-text-primary">{outcome.text}</span>
                    {brief.closed ? (
                      <OutcomeResultPill result={outcome.result} />
                    ) : (
                      <OutcomeStatusPill
                        status={outcome.status}
                        asOf={outcome.statusSetAt ? formatBriefDate(outcome.statusSetAt) : null}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </BriefShell>
  );
}
