import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
 * How far a move may reach, in years either side of now. The Goals page only
 * offers this year and next, so a typo like "Q1-2206" for "Q1-2026" would
 * file the key result where nobody finds it without editing the URL. Last
 * year stays in reach for back-filling, two years ahead for planning.
 */
const MOVE_YEARS_BACK = 1;
const MOVE_YEARS_AHEAD = 2;

/**
 * The extra columns a period change writes. `periodStart` / `periodEnd` are
 * an optional explicit range set at creation; once the period moves they
 * describe the old one, so they are cleared rather than left contradicting
 * it. An unchanged (or absent) period writes nothing extra and is never
 * range-checked, so resending an old key result's own period still works.
 * A move to a year outside the window is refused.
 */
export function periodChangeData(
  currentPeriod: string,
  nextPeriod: string | undefined,
  now: Date = new Date(),
): { periodStart?: null; periodEnd?: null } {
  if (nextPeriod === undefined || nextPeriod === currentPeriod) return {};

  const year = Number(nextPeriod.slice(-4));
  const thisYear = now.getFullYear();
  if (year < thisYear - MOVE_YEARS_BACK || year > thisYear + MOVE_YEARS_AHEAD) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A key result can move to a period between ${thisYear - MOVE_YEARS_BACK} and ${thisYear + MOVE_YEARS_AHEAD}; "${nextPeriod}" is outside that`,
    });
  }

  return { periodStart: null, periodEnd: null };
}
