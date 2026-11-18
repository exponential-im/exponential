/**
 * Which time zone the assistant uses for a person, and what it is told.
 *
 * The order is fixed: the zone saved in the person's profile (Settings →
 * Profile, `User.timezone`), then the zone their browser reports, then none.
 * With none, the assistant asks. It never assumes UTC.
 *
 * The saved zone wins over the browser so a person travelling, or on a machine
 * set to another zone, gets the zone they chose.
 *
 * Pure: the stream route calls it with the saved and the reported zone.
 */
import { describeLocalNow, isValidTimeZone, upcomingDays } from './localNow';

/** Where the zone came from. `detected` = the browser's zone, now saved. */
export type TimeZoneSource = 'saved' | 'detected' | 'browser';

export type ResolvedTimeZone =
  | { zone: string; source: TimeZoneSource }
  | { zone: null; source: null };

/**
 * Pick the zone: saved, then browser, then none. An unknown name in either
 * slot is skipped, so a bad saved value falls back to the browser.
 */
export function resolveTimeZone(input: {
  saved: string | null | undefined;
  browser: string | null | undefined;
}): ResolvedTimeZone {
  if (isValidTimeZone(input.saved)) return { zone: input.saved, source: 'saved' };
  if (isValidTimeZone(input.browser)) return { zone: input.browser, source: 'browser' };
  return { zone: null, source: null };
}

/** Whether the browser's zone should be saved as the person's zone. */
export function shouldSaveDetectedZone(resolved: ResolvedTimeZone): resolved is {
  zone: string;
  source: 'browser';
} {
  return resolved.source === 'browser';
}

const WHERE_TO_CHANGE = 'Settings → Profile';

/**
 * The date-and-time block for the agent's prompt. Built on the server from the
 * resolved zone, so the date the model reads and the zone its tools use agree.
 */
export function timeZonePromptBlock(resolved: ResolvedTimeZone, now: Date): string {
  const rules = [
    '- Read weekdays off the list above; never work one out from memory. Whenever you propose or confirm a date, state it WITH its weekday.',
    "- If a day the user names has already passed this week, say so and ask whether they mean next week; never move it silently.",
  ];

  if (resolved.zone === null) {
    return [
      '🗓️ DATE AND TIME:',
      `- Today in UTC: ${describeLocalNow(now, 'UTC')}. The user's local date may differ.`,
      `- The coming days (UTC): ${upcomingDays(now, 'UTC')}`,
      "- The user's time zone is NOT known: none is saved in their profile and none was detected.",
      '- Do not assume UTC. Before you propose or create anything at a clock time, ask which time zone they are in (a city is enough). Ask once.',
      `- When they answer, use that zone for the rest of the conversation and offer to save it to their profile with set-my-time-zone, only after they say yes. Without that tool, tell them to set it in ${WHERE_TO_CHANGE}; never claim you saved it.`,
      ...rules,
    ].join('\n');
  }

  const origin: Record<TimeZoneSource, string> = {
    saved: `Their time zone is ${resolved.zone}, saved in their profile (${WHERE_TO_CHANGE}).`,
    detected: `Their time zone is ${resolved.zone}. It was detected from their browser and has just been saved to their profile. The first time a date or time matters in this conversation, tell them once that you are using ${resolved.zone} and that they can change it in ${WHERE_TO_CHANGE}.`,
    browser: `Their time zone is ${resolved.zone}, detected from their browser. Nothing is saved in their profile.`,
  };

  return [
    '🗓️ DATE AND TIME:',
    `- The user's local date and time: ${describeLocalNow(now, resolved.zone)}`,
    `- The coming days: ${upcomingDays(now, resolved.zone)}`,
    `- ${origin[resolved.source]}`,
    `- Times the user gives are in ${resolved.zone} unless they name another zone.`,
    `- Asked what time zone you have for them, say ${resolved.zone} and where it came from.`,
    `- If they say they are somewhere else ("I'm in Lisbon this week"), confirm the new zone with them, then save it with set-my-time-zone. Never change it without a yes. Without that tool, use the new zone for this conversation and tell them to change it in ${WHERE_TO_CHANGE}; never claim you saved it.`,
    ...rules,
  ].join('\n');
}
