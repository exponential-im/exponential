/**
 * Decision titles and the Pillar page's grouping (ticket 1004).
 *
 * A decision's row text is its short `title` (the outcome), falling back to
 * the one-sentence `statement` on rows logged before titles existed.
 *
 * The Pillar page groups decisions by what they are linked to, so the ten
 * decisions one grilling session wrote on one scope read as one piece of work
 * and do not hide the decisions that apply to the whole Pillar. The link is
 * the one source of the grouping: a decision linked to several items lands in
 * one group only, by preference scope, then feature, then ticket. A decision
 * with no link is "General", always the first group.
 */

/** The advised maximum length of a title, in words. The UI warns past it; nothing enforces it. */
export const DECISION_TITLE_MAX_WORDS = 6;

/** The text a decision list shows for a row: the title, or the statement when it has none. */
export function decisionRowText(decision: { title?: string | null; statement: string }): string {
  const title = decision.title?.trim();
  return title ? title : decision.statement;
}

/** Words in a title, for the "six words or fewer" hint. */
export function countTitleWords(title: string): number {
  const trimmed = title.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export interface DecisionGroupLink {
  scope?: {
    id: string;
    version: string;
    description: string;
    feature: { id: string; name: string };
  } | null;
  feature?: { id: string; name: string } | null;
  ticket?: { id: string; number: number; shortId?: string | null; title: string } | null;
}

export interface GroupableDecision {
  decidedAt: Date | string | null;
  links: DecisionGroupLink[];
}

export type DecisionGroupKind = "general" | "scope" | "feature" | "ticket";

export interface DecisionGroup<T extends GroupableDecision> {
  /** Stable across renders: `general`, or the kind and id of the linked item. */
  key: string;
  kind: DecisionGroupKind;
  /** The linked item's name; "General" for unlinked decisions. */
  name: string;
  decisions: T[];
  /** The newest `decidedAt` in the group, or null when none has one. */
  newestDecidedAt: Date | null;
}

export const GENERAL_GROUP_KEY = "general";

/** A scope reads with its feature: "Geocoding of signals > V5: Dataminr text location". */
export function scopeGroupName(scope: NonNullable<DecisionGroupLink["scope"]>): string {
  const description = scope.description.trim();
  const scopeName = description ? `${scope.version}: ${description}` : scope.version;
  return `${scope.feature.name} > ${scopeName}`;
}

function ticketGroupName(ticket: NonNullable<DecisionGroupLink["ticket"]>): string {
  return `${ticket.shortId ?? `#${ticket.number}`} ${ticket.title}`;
}

/** The single group a decision belongs in, by the scope → feature → ticket preference. */
function groupFor(links: DecisionGroupLink[]): { key: string; kind: DecisionGroupKind; name: string } {
  const scope = links.find((l) => l.scope)?.scope;
  if (scope) return { key: `scope:${scope.id}`, kind: "scope", name: scopeGroupName(scope) };
  const feature = links.find((l) => l.feature)?.feature;
  if (feature) return { key: `feature:${feature.id}`, kind: "feature", name: feature.name };
  const ticket = links.find((l) => l.ticket)?.ticket;
  if (ticket) return { key: `ticket:${ticket.id}`, kind: "ticket", name: ticketGroupName(ticket) };
  return { key: GENERAL_GROUP_KEY, kind: "general", name: "General" };
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Group decisions by their link. "General" is always first and always
 * present, even when empty, so the page can say the Pillar has no decisions
 * of its own. The linked groups follow, newest decided first; decisions keep
 * their input order inside a group.
 */
export function groupDecisionsByLink<T extends GroupableDecision>(decisions: T[]): DecisionGroup<T>[] {
  const general: DecisionGroup<T> = {
    key: GENERAL_GROUP_KEY,
    kind: "general",
    name: "General",
    decisions: [],
    newestDecidedAt: null,
  };
  const linked = new Map<string, DecisionGroup<T>>();

  for (const decision of decisions) {
    const target = groupFor(decision.links);
    let group = target.kind === "general" ? general : linked.get(target.key);
    if (!group) {
      group = { ...target, decisions: [], newestDecidedAt: null };
      linked.set(target.key, group);
    }
    group.decisions.push(decision);
    const decidedAt = toDate(decision.decidedAt);
    if (decidedAt && (!group.newestDecidedAt || decidedAt > group.newestDecidedAt)) {
      group.newestDecidedAt = decidedAt;
    }
  }

  const rest = [...linked.values()].sort((a, b) => {
    const at = a.newestDecidedAt?.getTime() ?? -Infinity;
    const bt = b.newestDecidedAt?.getTime() ?? -Infinity;
    if (at !== bt) return bt - at;
    return a.name.localeCompare(b.name);
  });
  return [general, ...rest];
}
