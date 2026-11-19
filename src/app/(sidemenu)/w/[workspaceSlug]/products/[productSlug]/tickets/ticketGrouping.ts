import { STATUS_LABELS } from "~/lib/ticket-statuses";
import { PRIORITY_LABELS } from "~/app/_components/product/PriorityIcon";
import { PILLAR_CATEGORY } from "~/types/tag";

// ---------------------------------------------------------------------------
// Group by — pure, testable core of the tickets board grouping.
//
// Maps (tickets, groupByField) → an ordered list of { key, label, items }
// buckets. Most fields produce exactly one bucket per ticket; "pillar" is
// multi-membership (a ticket may land in several Pillar buckets, or in the
// pinned-last "No pillar" bucket).
// ---------------------------------------------------------------------------

export type GroupByField =
  | "none"
  | "status"
  | "priority"
  | "cycle"
  | "epic"
  | "type"
  | "assignee"
  | "pillar";

export const GROUP_BY_OPTIONS: Array<{ value: GroupByField; label: string }> = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "cycle", label: "Cycle" },
  { value: "epic", label: "Epic" },
  { value: "pillar", label: "Pillar" },
  { value: "type", label: "Type" },
  { value: "assignee", label: "DRI" },
];

export interface TicketGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Sentinel key/label for tickets under no Pillar. */
export const NO_PILLAR_KEY = "__no_pillar__";
export const NO_PILLAR_LABEL = "No pillar";

/**
 * A group-by value from a saved preference or an older link. "area" grouped
 * by the retired area tag category, which Pillar replaced (ADR-0086).
 */
export function parseGroupBy(value: string | null | undefined): GroupByField | undefined {
  if (value === "area") return "pillar";
  return GROUP_BY_OPTIONS.find((o) => o.value === value)?.value;
}

const NO_CYCLE_KEY = "No cycle";

/** Minimal ticket shape the grouping logic reads. */
export interface GroupableTicket {
  status?: string | null;
  priority?: number | null;
  cycle?: {
    name?: string | null;
    status?: string | null;
    startDate?: string | Date | null;
  } | null;
  epic?: {
    name?: string | null;
    /** The epic's Pillars: its tickets are under them too. */
    tags?: Array<{ tag: { id: string; name: string; category?: string | null } }> | null;
  } | null;
  type?: string | null;
  assignee?: { name?: string | null } | null;
  tags?: Array<{ tag: { id: string; name: string; category?: string | null } }> | null;
}

/**
 * The (key, label) buckets a single ticket belongs to for a given field.
 * Returns one entry for single-valued fields, and one per Pillar (or the
 * "No pillar" sentinel) for the multi-membership "pillar" field.
 */
function bucketsForTicket(
  t: GroupableTicket,
  field: Exclude<GroupByField, "none">,
): Array<{ key: string; label: string }> {
  switch (field) {
    case "status": {
      const key = t.status ?? "UNKNOWN";
      return [{ key, label: STATUS_LABELS[key] ?? key }];
    }
    case "priority": {
      if (t.priority == null) return [{ key: "unset", label: "No priority" }];
      const key = String(t.priority);
      return [{ key, label: PRIORITY_LABELS[t.priority] ?? key }];
    }
    case "cycle": {
      const name = t.cycle?.name ?? NO_CYCLE_KEY;
      return [{ key: name, label: name }];
    }
    case "epic": {
      const name = t.epic?.name ?? "No epic";
      return [{ key: name, label: name }];
    }
    case "type": {
      const key = t.type ?? "UNKNOWN";
      return [{ key, label: key }];
    }
    case "assignee": {
      const name = t.assignee?.name ?? "Unassigned";
      return [{ key: name, label: name }];
    }
    case "pillar": {
      // A ticket is under its own Pillars and its epic's (a read rule; ADR-0086).
      const pillars = new Map<string, string>();
      for (const x of [...(t.tags ?? []), ...(t.epic?.tags ?? [])]) {
        if (x.tag.category === PILLAR_CATEGORY) pillars.set(x.tag.id, x.tag.name);
      }
      if (pillars.size === 0) return [{ key: NO_PILLAR_KEY, label: NO_PILLAR_LABEL }];
      return [...pillars].map(([key, label]) => ({ key, label }));
    }
  }
}

/** Smart cycle ordering: ACTIVE first, then PLANNED by startDate, "No cycle" last. */
function sortCycleGroups<T extends GroupableTicket>(groups: Array<TicketGroup<T>>): void {
  const cycleStatusOrder: Record<string, number> = {
    ACTIVE: 0,
    PLANNED: 1,
    COMPLETED: 2,
    ARCHIVED: 3,
  };
  groups.sort((a, b) => {
    if (a.key === NO_CYCLE_KEY) return 1;
    if (b.key === NO_CYCLE_KEY) return -1;
    const aCycle = a.items[0]?.cycle;
    const bCycle = b.items[0]?.cycle;
    const aStatus = cycleStatusOrder[aCycle?.status ?? ""] ?? 99;
    const bStatus = cycleStatusOrder[bCycle?.status ?? ""] ?? 99;
    if (aStatus !== bStatus) return aStatus - bStatus;
    const aStart = aCycle?.startDate ? new Date(aCycle.startDate).getTime() : Infinity;
    const bStart = bCycle?.startDate ? new Date(bCycle.startDate).getTime() : Infinity;
    return aStart - bStart;
  });
}

/** Pillar ordering: alphabetical by name, "No pillar" pinned last. */
function sortPillarGroups<T>(groups: Array<TicketGroup<T>>): void {
  groups.sort((a, b) => {
    if (a.key === NO_PILLAR_KEY) return 1;
    if (b.key === NO_PILLAR_KEY) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

/**
 * Bucket tickets into ordered groups for the board's group-by control.
 *
 * - `none` → a single unlabelled bucket containing every ticket.
 * - Single-valued fields (status/priority/cycle/epic/type/assignee) → one
 *   bucket per ticket, in first-seen order (with cycle smart-ordered).
 * - `pillar` → multi-membership: a ticket appears under each of its own and
 *   its epic's Pillars, or in the "No pillar" bucket; ordered alphabetically
 *   with "No pillar" last.
 */
export function groupTickets<T extends GroupableTicket>(
  tickets: T[],
  field: GroupByField,
): Array<TicketGroup<T>> {
  if (field === "none") {
    return [{ key: "all", label: "", items: tickets }];
  }

  const map = new Map<string, TicketGroup<T>>();
  for (const t of tickets) {
    for (const { key, label } of bucketsForTicket(t, field)) {
      const existing = map.get(key);
      if (existing) existing.items.push(t);
      else map.set(key, { key, label, items: [t] });
    }
  }

  const result = Array.from(map.values());

  if (field === "cycle") sortCycleGroups(result);
  else if (field === "pillar") sortPillarGroups(result);

  return result;
}
