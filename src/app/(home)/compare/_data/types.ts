/**
 * Comparison pages at /compare/[slug]. They make public claims about other
 * companies' products, so every competitor fact must come from that company's
 * own public pages, listed in `sources`, and `checkedOn` must say when. Re-check
 * prices and plans before changing a page; they move.
 */

export interface ComparisonSource {
  label: string;
  url: string;
}

export interface ComparisonRow {
  label: string;
  exponential: string;
  competitor: string;
}

export interface ComparisonPoint {
  title: string;
  body: string;
}

export interface ComparisonFaq {
  question: string;
  answer: string;
}

interface ComparisonPageBase {
  slug: string;
  /** Search-result title; " | Exponential" is appended. Keep it ≤ 46 characters. */
  seoTitle: string;
  /** ≤ 160 characters. */
  seoDescription: string;
  eyebrow: string;
  headline: string;
  intro: string;
  /** When the competitor facts were last read from `sources`, e.g. "15 November 2026". */
  checkedOn: string;
  faqs: ComparisonFaq[];
  sources: ComparisonSource[];
  related: { label: string; href: string }[];
}

/** Exponential against one product. */
export interface VersusPage extends ComparisonPageBase {
  kind: "versus";
  competitor: string;
  /** One sentence for the /compare index. */
  summary: string;
  pickCompetitor: string[];
  pickExponential: string[];
  rows: ComparisonRow[];
  /** Where the competitor is the better choice. Keep this honest and specific. */
  competitorStrengths: ComparisonPoint[];
  exponentialDifferences: ComparisonPoint[];
  migration: { heading: string; paragraphs: string[] };
}

export interface Alternative {
  name: string;
  /** Our own comparison page, when there is one. */
  href?: string;
  licence: string;
  hosting: string;
  pricing: string;
  agents: string;
  bestFor: string;
  watchOut: string;
}

/** Several alternatives to one product, Exponential among them. */
export interface RoundupPage extends ComparisonPageBase {
  kind: "roundup";
  /** One sentence for the /compare index. */
  summary: string;
  criteria: string[];
  alternatives: Alternative[];
}

export type ComparisonPage = VersusPage | RoundupPage;
