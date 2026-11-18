import { describe, it, expect } from 'vitest';
import { describeLocalNow, isValidTimeZone, upcomingDays, utcOffsetLabel } from '../localNow';

// The moment of the report: Wednesday 18 November 2026, 10:05 UTC.
const NOW = new Date('2026-11-18T10:05:00Z');

describe('describeLocalNow', () => {
  it('gives the weekday, the local time and the zone with its offset', () => {
    expect(describeLocalNow(NOW, 'Europe/Berlin')).toBe(
      'Wednesday 18 November 2026, 11:05, time zone Europe/Berlin (UTC+01:00)',
    );
  });

  it('is the local date, not the UTC one, near midnight', () => {
    const lateUtc = new Date('2026-11-18T23:30:00Z');
    expect(describeLocalNow(lateUtc, 'Europe/Berlin')).toContain('Thursday 19 November 2026, 00:30');
    expect(describeLocalNow(lateUtc, 'America/Los_Angeles')).toContain('Wednesday 18 November 2026, 15:30');
  });

  it('falls back to UTC for a zone it does not know', () => {
    expect(describeLocalNow(NOW, 'Mars/Olympus')).toBe(
      'Wednesday 18 November 2026, 10:05, time zone UTC (UTC+00:00)',
    );
  });
});

describe('upcomingDays', () => {
  it('lists each date with its weekday, so 18 November is never read as a Monday', () => {
    expect(upcomingDays(NOW, 'Europe/Berlin', 6)).toBe(
      'Wed 18 Nov (today), Thu 19 Nov, Fri 20 Nov, Sat 21 Nov, Sun 22 Nov, Mon 23 Nov',
    );
  });

  it('does not skip or repeat a date across a daylight-saving change', () => {
    // Clocks go back in Berlin on Sunday 25 October 2026.
    expect(upcomingDays(new Date('2026-10-24T10:00:00Z'), 'Europe/Berlin', 3)).toBe(
      'Sat 24 Oct (today), Sun 25 Oct, Mon 26 Oct',
    );
  });
});

describe('utcOffsetLabel', () => {
  it('follows daylight saving', () => {
    expect(utcOffsetLabel(NOW, 'Europe/Berlin')).toBe('+01:00');
    expect(utcOffsetLabel(new Date('2026-07-01T10:00:00Z'), 'Europe/Berlin')).toBe('+02:00');
    expect(utcOffsetLabel(NOW, 'UTC')).toBe('+00:00');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects anything else a client could send', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('CET; DROP TABLE')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone('x'.repeat(100))).toBe(false);
  });
});
