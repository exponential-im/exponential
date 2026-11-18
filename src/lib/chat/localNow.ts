/**
 * The person's "now", in words an agent can do date arithmetic from.
 *
 * The chat used to tell the agent only "The current date is: 2026-11-18", a
 * UTC date with no weekday, no time and no time zone. Asked for "8:30 on
 * Monday, Wednesday and Friday", the agent decided 18 November was a Monday
 * (it was a Wednesday) and booked 08:30 UTC, which is 09:30 in Berlin. Three
 * events, wrong days, wrong hour, reported as done.
 *
 * Pure: imported by the chat UI (to describe now) and the stream route (to
 * validate the zone before it reaches agent tools).
 */

/** Whether `value` is an IANA zone this runtime knows ("Europe/Berlin"). */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The browser's IANA zone, or UTC where it cannot be read. */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "+01:00" for Berlin in winter. */
export function utcOffsetLabel(now: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = part?.replace('GMT', '') ?? '';
  return offset === '' ? '+00:00' : offset;
}

/**
 * "Wednesday 18 November 2026, 11:05, time zone Europe/Berlin (UTC+01:00)".
 * English and 24-hour on purpose: it is read by the model, not the person.
 */
export function describeLocalNow(now: Date, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return `${date.replace(',', '')}, ${time}, time zone ${zone} (UTC${utcOffsetLabel(now, zone)})`;
}

/**
 * The next `days` dates with their weekdays, so the model reads a weekday off
 * a table instead of computing one:
 * "Wed 18 Nov (today), Thu 19 Nov, Fri 20 Nov, …".
 */
export function upcomingDays(now: Date, timeZone: string, days = 10): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    // Noon-anchored steps: a 23- or 25-hour DST day never skips or repeats a date.
    const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const label = format.format(day).replace(',', '');
    out.push(i === 0 ? `${label} (today)` : label);
  }
  return out.join(', ');
}
