/**
 * OKR periods, shared by the client views and the server. A period is a
 * string like "Q1-2026", "H2-2026" or "Annual-2026"; a Key result may also
 * carry an explicit `periodEnd` that takes precedence.
 */

/**
 * Parse `"Q1-2026" | "Q2-2026" | ... | "Annual-2026" | "H1-2026"` into date range.
 * `end` is the period's last day (local midnight), not the instant it ends.
 */
export function periodDateRange(period: string): { start: Date; end: Date } | null {
  const match = /^(Q[1-4]|H[12]|Annual)-(\d{4})$/.exec(period);
  if (!match) return null;
  const [, type, yearStr] = match;
  const year = parseInt(yearStr ?? "0", 10);

  switch (type) {
    case "Q1":
      return { start: new Date(year, 0, 1), end: new Date(year, 2, 31) };
    case "Q2":
      return { start: new Date(year, 3, 1), end: new Date(year, 5, 30) };
    case "Q3":
      return { start: new Date(year, 6, 1), end: new Date(year, 8, 30) };
    case "Q4":
      return { start: new Date(year, 9, 1), end: new Date(year, 11, 31) };
    case "H1":
      return { start: new Date(year, 0, 1), end: new Date(year, 5, 30) };
    case "H2":
      return { start: new Date(year, 6, 1), end: new Date(year, 11, 31) };
    case "Annual":
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
    default:
      return null;
  }
}

/** Objective statuses under which a Key result still takes check-ins. */
const OPEN_GOAL_STATUSES = new Set(["planned", "active"]);

/**
 * Whether a Key result is still open: its Objective is planned or active, and
 * its period has not ended. The end is `periodEnd` when set, otherwise the
 * end of its period string; either way the last day counts in full. A period
 * that can't be parsed, with no `periodEnd`, is treated as ended, so nothing
 * writes to a Key result whose dates nobody can tell.
 *
 * Pillar Metrics feed only open Key results (ADR-0087).
 */
export function isKeyResultOpen(
  keyResult: { period: string; periodEnd: Date | null },
  goal: { status: string },
  now: Date = new Date(),
): boolean {
  if (!OPEN_GOAL_STATUSES.has(goal.status)) return false;
  const lastDay = keyResult.periodEnd ?? periodDateRange(keyResult.period)?.end ?? null;
  if (!lastDay) return false;
  const endsAt = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
  return now < endsAt;
}
