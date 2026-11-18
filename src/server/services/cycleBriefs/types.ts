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

/** A Cycle outcome's final result, given by a person after the cycle closes (D-0098). */
export const OUTCOME_RESULTS = ["achieved", "partly", "missed"] as const;
export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

export const OUTCOME_RESULT_LABELS: Record<OutcomeResult, string> = {
  achieved: "Achieved",
  partly: "Partly",
  missed: "Missed",
};

export function isOutcomeResult(value: string | null | undefined): value is OutcomeResult {
  return (OUTCOME_RESULTS as readonly string[]).includes(value ?? "");
}
