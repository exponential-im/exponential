import { z } from "zod";
import { OKR_PERIOD_PATTERN } from "~/plugins/okr/client/utils/periodUtils";

/**
 * A period a key result can be moved to. Validated on write so a typo
 * ("Q5-2026", "2026-Q1") can't file a key result under a period no view
 * ever selects, where it would silently disappear.
 */
export const okrPeriodSchema = z
  .string()
  .regex(
    OKR_PERIOD_PATTERN,
    'Period must look like "Q1-2026", "H2-2026" or "Annual-2026"',
  );

/**
 * The extra columns a period change writes. `periodStart` / `periodEnd` are
 * an optional explicit range set at creation; once the period moves they
 * describe the old one, so they are cleared rather than left contradicting
 * it. An unchanged (or absent) period writes nothing extra.
 */
export function periodChangeData(
  currentPeriod: string,
  nextPeriod: string | undefined,
): { periodStart?: null; periodEnd?: null } {
  if (nextPeriod === undefined || nextPeriod === currentPeriod) return {};
  return { periodStart: null, periodEnd: null };
}
