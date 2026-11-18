/**
 * Cycle brief vocabularies (ADR-0085). Stored as strings; these lists are the
 * only values the router accepts.
 */

/** A Cycle outcome's weekly status, set by a person (D-0097). Never derived from tickets. */
export const OUTCOME_STATUSES = ["on_track", "at_risk", "done"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const OUTCOME_STATUS_LABELS: Record<OutcomeStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  done: "Done",
};

export function isOutcomeStatus(value: string | null | undefined): value is OutcomeStatus {
  return (OUTCOME_STATUSES as readonly string[]).includes(value ?? "");
}
