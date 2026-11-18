import { Pill, type PillTone } from "~/app/_components/ui";
import { OUTCOME_RESULT_LABELS, type OutcomeResult } from "~/server/services/cycleBriefs/types";

const TONE: Record<OutcomeResult, PillTone> = {
  achieved: "brand",
  partly: "warning",
  missed: "danger",
};

/** An outcome's final result on the public page, once the cycle has closed. */
export function OutcomeResultPill({ result }: { result: OutcomeResult | null }) {
  return (
    <Pill tone={result ? TONE[result] : "neutral"} size="xs">
      {result ? OUTCOME_RESULT_LABELS[result] : "Result to come"}
    </Pill>
  );
}
