import { describe, expect, it } from 'vitest';

import { resolveTimeZone, shouldSaveDetectedZone, timeZonePromptBlock } from '../timeZoneContext';

// Wednesday 18 November 2026, 10:05 UTC = 11:05 in Berlin, 05:05 in New York.
const NOW = new Date('2026-11-18T10:05:00Z');

describe('resolveTimeZone: saved, then browser, then none', () => {
  it('uses the saved zone over a browser reporting another zone', () => {
    expect(resolveTimeZone({ saved: 'Europe/Berlin', browser: 'America/New_York' })).toEqual({
      zone: 'Europe/Berlin',
      source: 'saved',
    });
  });

  it('uses the saved zone when no browser zone is sent (Slack, WhatsApp, API)', () => {
    expect(resolveTimeZone({ saved: 'Europe/Berlin', browser: undefined })).toEqual({
      zone: 'Europe/Berlin',
      source: 'saved',
    });
  });

  it('falls back to the browser zone when nothing is saved', () => {
    expect(resolveTimeZone({ saved: null, browser: 'Europe/Lisbon' })).toEqual({
      zone: 'Europe/Lisbon',
      source: 'browser',
    });
  });

  it('skips a saved value that is not a zone and uses the browser', () => {
    expect(resolveTimeZone({ saved: 'W. Europe Standard Time', browser: 'Europe/Lisbon' })).toEqual({
      zone: 'Europe/Lisbon',
      source: 'browser',
    });
  });

  it('returns no zone, not UTC, when neither is known', () => {
    expect(resolveTimeZone({ saved: null, browser: undefined })).toEqual({ zone: null, source: null });
    expect(resolveTimeZone({ saved: '', browser: 'Not/AZone' })).toEqual({ zone: null, source: null });
  });
});

describe('shouldSaveDetectedZone', () => {
  it('saves only a browser zone used because nothing was saved', () => {
    expect(shouldSaveDetectedZone({ zone: 'Europe/Lisbon', source: 'browser' })).toBe(true);
    expect(shouldSaveDetectedZone({ zone: 'Europe/Berlin', source: 'saved' })).toBe(false);
    expect(shouldSaveDetectedZone({ zone: null, source: null })).toBe(false);
  });
});

describe('timeZonePromptBlock', () => {
  it('gives the local time on the saved zone and says where it came from', () => {
    const block = timeZonePromptBlock({ zone: 'Europe/Berlin', source: 'saved' }, NOW);
    expect(block).toContain('Wednesday 18 November 2026, 11:05, time zone Europe/Berlin (UTC+01:00)');
    expect(block).toContain('saved in their profile (Settings → Profile)');
    expect(block).toContain('Times the user gives are in Europe/Berlin');
    expect(block).toContain('set-my-time-zone');
  });

  it('tells the person once that a detected zone was saved and where to change it', () => {
    const block = timeZonePromptBlock({ zone: 'Europe/Lisbon', source: 'detected' }, NOW);
    expect(block).toContain('detected from their browser and has just been saved');
    expect(block).toContain('they can change it in Settings → Profile');
  });

  it('with no zone, tells the agent to ask and not to assume UTC', () => {
    const block = timeZonePromptBlock({ zone: null, source: null }, NOW);
    expect(block).toContain('NOT known');
    expect(block).toContain('Do not assume UTC');
    expect(block).toContain('ask which time zone they are in');
    expect(block).not.toContain('Times the user gives are in');
  });
});
