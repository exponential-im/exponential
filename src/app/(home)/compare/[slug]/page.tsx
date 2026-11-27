import { notFound } from "next/navigation";
import Link from "next/link";
import { IconCheck } from "@tabler/icons-react";
import {
  getAllComparisonSlugs,
  getComparisonBySlug,
} from "../_data/comparisons";
import type { RoundupPage, VersusPage } from "../_data/types";
import { CTAButton } from "~/app/_components/home/shared/CTAButton";
import { FooterSection, MarketingHeader } from "~/app/_components/home";
import { Panel } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { serializeJsonLd } from "~/lib/jsonLd";

interface ComparePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllComparisonSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ComparePageProps) {
  const { slug } = await params;
  const page = getComparisonBySlug(slug);

  if (!page) {
    return { title: "Comparison Not Found" };
  }

  const url = `${getPublicBaseUrlFromEnv()}/compare/${slug}`;
  const title = `${page.seoTitle} | ${PRODUCT_NAME}`;

  return {
    title,
    description: page.seoDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title,
      description: page.seoDescription,
      url,
      siteName: PRODUCT_NAME,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.seoDescription,
      images: ["/og-image.png"],
    },
  };
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <IconCheck
            size={18}
            stroke={2}
            aria-hidden="true"
            className="mt-1 shrink-0 text-text-muted"
          />
          <span className="text-[0.9375rem] leading-relaxed text-text-primary">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Points({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {items.map((item) => (
        <Panel key={item.title} radius="xl" padding="none" className="p-7">
          <h3 className="mkt-h3 mb-2">{item.title}</h3>
          <p className="text-[0.9375rem] leading-relaxed text-text-muted">
            {item.body}
          </p>
        </Panel>
      ))}
    </div>
  );
}

function VersusBody({ page }: { page: VersusPage }) {
  return (
    <>
      {/* Who should pick which */}
      <section className="mkt-section border-t border-border-primary">
        <div className="mkt-container mkt-reveal">
          <h2 className="mkt-h2 mb-10 max-w-3xl">Which one fits your team</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Panel radius="xl" padding="none" className="p-7">
              <h3 className="mkt-h3 mb-5">Choose {page.competitor} if</h3>
              <CheckList items={page.pickCompetitor} />
            </Panel>
            <Panel radius="xl" padding="none" className="p-7">
              <h3 className="mkt-h3 mb-5">Choose {PRODUCT_NAME} if</h3>
              <CheckList items={page.pickExponential} />
            </Panel>
          </div>
        </div>
      </section>

      {/* Side by side */}
      <section className="mkt-section border-t border-border-primary">
        <div className="mkt-container mkt-reveal">
          <div className="mb-10 max-w-3xl">
            <h2 className="mkt-h2 mb-4">
              {PRODUCT_NAME} and {page.competitor}, side by side
            </h2>
            <p className="mkt-body">
              {page.competitor} facts are from {page.competitor}&apos;s own
              pages, read on {page.checkedOn}. The sources are listed at the
              bottom of this page.
            </p>
          </div>
          {/* Phones: one row per feature, both products stacked under it. */}
          <Panel
            as="dl"
            radius="xl"
            padding="none"
            className="divide-y divide-border-primary md:hidden"
          >
            {page.rows.map((row) => (
              <div key={row.label} className="space-y-3 p-5">
                <dt className="font-medium text-text-primary">{row.label}</dt>
                <dd className="text-[0.9375rem] leading-relaxed text-text-secondary">
                  <span className="block text-sm font-medium text-text-muted">
                    {PRODUCT_NAME}
                  </span>
                  {row.exponential}
                </dd>
                <dd className="text-[0.9375rem] leading-relaxed text-text-secondary">
                  <span className="block text-sm font-medium text-text-muted">
                    {page.competitor}
                  </span>
                  {row.competitor}
                </dd>
              </div>
            ))}
          </Panel>
          <Panel
            radius="xl"
            padding="none"
            className="hidden overflow-x-auto md:block"
          >
            <table className="w-full min-w-[640px] text-left text-[0.9375rem]">
              <thead>
                <tr className="border-b border-border-primary text-sm text-text-muted">
                  <th scope="col" className="w-1/5 p-5 font-medium">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="p-5 font-medium">
                    {PRODUCT_NAME}
                  </th>
                  <th scope="col" className="p-5 font-medium">
                    {page.competitor}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {page.rows.map((row) => (
                  <tr key={row.label} className="align-top">
                    <th
                      scope="row"
                      className="p-5 font-medium text-text-primary"
                    >
                      {row.label}
                    </th>
                    <td className="p-5 leading-relaxed text-text-secondary">
                      {row.exponential}
                    </td>
                    <td className="p-5 leading-relaxed text-text-secondary">
                      {row.competitor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </section>

      {/* Honest strengths */}
      <section className="mkt-section border-t border-border-primary">
        <div className="mkt-container mkt-reveal">
          <h2 className="mkt-h2 mb-10 max-w-3xl">
            Where {page.competitor} is stronger
          </h2>
          <Points items={page.competitorStrengths} />
        </div>
      </section>

      <section className="mkt-section border-t border-border-primary">
        <div className="mkt-container mkt-reveal">
          <h2 className="mkt-h2 mb-10 max-w-3xl">
            Where {PRODUCT_NAME} is different
          </h2>
          <Points items={page.exponentialDifferences} />
        </div>
      </section>

      {/* Moving over */}
      <section className="mkt-section border-t border-border-primary">
        <div className="mkt-container mkt-reveal">
          <div className="max-w-3xl">
            <h2 className="mkt-h2 mb-6">{page.migration.heading}</h2>
            <div className="space-y-5">
              {page.migration.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mkt-body">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function RoundupBody({ page }: { page: RoundupPage }) {
  return (
    <>
      <section className="mkt-section border-t border-border-primary">
        <div className="mkt-container mkt-reveal">
          <div className="max-w-3xl">
            <h2 className="mkt-h2 mb-6">How we compared them</h2>
            <CheckList items={page.criteria} />
          </div>
        </div>
      </section>

      <section className="mkt-section border-t border-border-primary">
        <div className="mkt-container mkt-reveal">
          <h2 className="mkt-h2 mb-4 max-w-3xl">The alternatives</h2>
          <p className="mkt-body mb-10 max-w-3xl">
            Read from each project&apos;s own pages on {page.checkedOn}. Yes,
            we included ourselves; we&apos;ve tried to be as fair about us as
            about everyone else.
          </p>
          <div className="space-y-5">
            {page.alternatives.map((alt) => (
              <Panel key={alt.name} radius="xl" padding="none" className="p-7">
                <h3 className="mkt-h3 mb-5">
                  {alt.href ? (
                    <Link href={alt.href} className="hover:underline">
                      {alt.name}
                    </Link>
                  ) : (
                    alt.name
                  )}
                </h3>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-[0.9375rem] leading-relaxed md:grid-cols-2">
                  {(
                    [
                      ["Licence", alt.licence],
                      ["Hosting", alt.hosting],
                      ["Pricing", alt.pricing],
                      ["Agents and AI", alt.agents],
                      ["Best for", alt.bestFor],
                      ["Watch out for", alt.watchOut],
                    ] as const
                  ).map(([term, value]) => (
                    <div key={term}>
                      <dt className="text-sm font-medium text-text-muted">
                        {term}
                      </dt>
                      <dd className="text-text-primary">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { slug } = await params;
  const page = getComparisonBySlug(slug);

  if (!page) {
    notFound();
  }

  const baseUrl = getPublicBaseUrlFromEnv();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: PRODUCT_NAME, item: baseUrl },
        {
          "@type": "ListItem",
          position: 2,
          name: "Compare",
          item: `${baseUrl}/compare`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: page.eyebrow,
          item: `${baseUrl}/compare/${page.slug}`,
        },
      ],
    },
  ];

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />

      <MarketingHeader />

      <main>
        <section className="pb-16 md:pb-24">
          <div className="mkt-container pt-16 md:pt-24">
            <div className="max-w-3xl">
              <p className="mkt-eyebrow mkt-rise mb-6">{page.eyebrow}</p>
              <h1 className="mkt-h1 mkt-rise mb-6">{page.headline}</h1>
              <p className="mkt-lead mkt-rise mb-4">{page.intro}</p>
              <p className="mkt-rise mb-10 text-sm text-text-muted">
                Checked on {page.checkedOn}. Prices and plans change; the
                sources below link to the current versions.
              </p>
              <div className="mkt-rise flex flex-wrap items-center gap-x-8 gap-y-5">
                <CTAButton href="/signin" variant="pill" size="large">
                  Try {PRODUCT_NAME} free
                </CTAButton>
                <CTAButton href="/docs/self-hosting" variant="text">
                  Self-host it
                </CTAButton>
              </div>
            </div>
          </div>
        </section>

        {page.kind === "versus" ? (
          <VersusBody page={page} />
        ) : (
          <RoundupBody page={page} />
        )}

        {/* FAQ, sources, related */}
        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal">
            <h2 className="mkt-h2 mb-10 max-w-3xl">Questions</h2>
            <div className="max-w-3xl space-y-8">
              {page.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="mkt-h3 mb-2">{faq.question}</h3>
                  <p className="mkt-body">{faq.answer}</p>
                </div>
              ))}
            </div>

            <h2 className="mkt-h3 mb-4 mt-16">Sources (read {page.checkedOn})</h2>
            <ul className="max-w-3xl space-y-2 text-[0.9375rem]">
              {page.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="text-text-secondary underline underline-offset-4 hover:text-text-primary"
                  >
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>

            <h2 className="mkt-h3 mb-4 mt-16">Related</h2>
            <ul className="flex flex-wrap gap-3">
              {page.related.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="mkt-btn mkt-btn-ghost">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal text-center">
            <h2 className="mkt-h2 mb-5">See for yourself</h2>
            <p className="mkt-body mx-auto mb-10 max-w-xl">
              Free to start, open source, and the same code if you&apos;d
              rather run it yourself.
            </p>
            <CTAButton href="/signin" variant="pill" size="large">
              Get started free
            </CTAButton>
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  );
}
