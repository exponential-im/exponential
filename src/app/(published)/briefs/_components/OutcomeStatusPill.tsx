import { Pill, type PillTone } from "~/app/_components/ui";
import { OUTCOME_STATUS_LABELS, type OutcomeStatus } from "~/server/services/cycleBriefs/types";

const TONE: Record<OutcomeStatus, PillTone> = {
  on_track: "brand",
  at_risk: "warning",
  done: "neutral",
};

/** An outcome's weekly status for the public page: the label and its date. */
export function OutcomeStatusPill({ status, asOf }: { status: OutcomeStatus | null; asOf: string | null }) {
  if (!status) {
    return (
      <Pill tone="neutral" size="xs">
        No status yet
      </Pill>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Pill tone={TONE[status]} size="xs">
        {OUTCOME_STATUS_LABELS[status]}
      </Pill>
      {asOf && <span className="text-xs text-text-muted">as of {asOf}</span>}
    </span>
  );
}
