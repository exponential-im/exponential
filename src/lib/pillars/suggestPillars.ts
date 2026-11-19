/**
 * Which Pillars a capture probably belongs to (ADR-0086, V3): a cheap keyword
 * match of the captured text (page title and URL, a pasted note, an Action's
 * name) against each Pillar's name and description. Used only to pre-tick
 * Pillars a person can see and untick; never to file anything by itself.
 */

export interface SuggestablePillar {
  id: string;
  name: string;
  description: string | null;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "our", "your", "you", "are",
  "was", "were", "will", "have", "has", "not", "all", "any", "but", "can", "out", "about",
  "what", "when", "where", "which", "who", "how", "why", "its", "it's", "they", "them",
  "their", "there", "then", "than", "also", "just", "more", "most", "such", "very", "www",
  "http", "https", "com", "org", "net", "html", "good", "looks", "like", "work",
]);

/** Lower-case word stems of three letters or more, stopwords and words with digits dropped. */
export function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    // Words with digits are ids, dates and versions, not topics.
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/[0-9]/.test(w))
    // A crude stem, so "deploy", "deploys" and "deploying" meet.
    .map((w) => w.replace(/(ing|ed|es|s)$/, ""))
    .filter((w) => w.length >= 3);
  return new Set(words);
}

/**
 * Pillars to pre-tick for `text`, best first. A Pillar is suggested when its
 * whole name appears in the text, or when the text shares at least two
 * keywords with its name and description.
 */
export function suggestPillars(pillars: readonly SuggestablePillar[], text: string): string[] {
  const words = keywords(text);
  if (words.size === 0) return [];
  const haystack = ` ${[...words].join(" ")} `;
  const scored = pillars.flatMap((pillar) => {
    const nameWords = [...keywords(pillar.name)];
    const nameHit = nameWords.length > 0 && haystack.includes(` ${nameWords.join(" ")} `);
    const shared = [...keywords(`${pillar.name} ${pillar.description ?? ""}`)].filter((w) =>
      words.has(w),
    ).length;
    const score = (nameHit ? 10 : 0) + shared;
    return nameHit || shared >= 2 ? [{ id: pillar.id, score }] : [];
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.id);
}
