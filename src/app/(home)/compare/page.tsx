import type { Metadata } from "next";
import Link from "next/link";
import { comparisons } from "./_data/comparisons";
import { FooterSection, MarketingHeader } from "~/app/_components/home";
import { Panel } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

const title = `Compare: Linear, Jira, Plane, OpenProject | ${PRODUCT_NAME}`;
const description = `How ${PRODUCT_NAME} compares with Linear, Jira, Plane and OpenProject, including where each of them is the better choice. Sourced and dated.`;

export function generateMetadata(): Metadata {
  const url = `${getPublicBaseUrlFromEnv()}/compare`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: PRODUCT_NAME,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default function CompareIndexPage() {
  const versus = comparisons.filter((c) => c.kind === "versus");
  const roundups = comparisons.filter((c) => c.kind === "roundup");

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <MarketingHeader />

      <main>
        <section className="pb-12 md:pb-16">
          <div className="mkt-container pt-16 md:pt-24">
            <div className="max-w-3xl">
              <p className="mkt-eyebrow mkt-rise mb-6">Compare</p>
              <h1 className="mkt-h1 mkt-rise mb-6">
                How {PRODUCT_NAME} compares.
              </h1>
              <p className="mkt-lead mkt-rise">
                Honest comparisons with the tools you might be choosing between,
                including where they are the better pick. Every fact about
                another product links to that product&apos;s own pages, with the
                date we read them.
              </p>
            </div>
          </div>
        </section>

        {[
          { heading: `${PRODUCT_NAME} vs`, items: versus },
          { heading: "Alternatives", items: roundups },
        ]
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <section
              key={group.heading}
              className="mkt-section border-t border-border-primary"
            >
              <div className="mkt-container mkt-reveal">
                <h2 className="mkt-h2 mb-10 max-w-3xl">{group.heading}</h2>
                <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {group.items.map((page) => (
                    <li key={page.slug}>
                      <Link
                        href={`/compare/${page.slug}`}
                        className="group block h-full"
                      >
                        <Panel
                          radius="xl"
                          padding="none"
                          className="h-full p-7 transition-colors group-hover:border-border-strong"
                        >
                          <h3 className="mkt-h3 mb-2">{page.eyebrow}</h3>
                          <p className="text-[0.9375rem] leading-relaxed text-text-muted">
                            {page.summary}
                          </p>
                        </Panel>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
      </main>

      <FooterSection />
    </div>
  );
}
