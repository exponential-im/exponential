import { describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({ default: {} }));
vi.mock('~/env', () => ({ env: {} }));

const { shouldRecord } = await import('../SessionReplay');

describe('shouldRecord', () => {
  it.each(['/onboarding', '/welcome', '/welcome/menu', '/w/exponential', '/w/exponential/projects/abc'])(
    'records %s',
    (path) => {
      expect(shouldRecord(path)).toBe(true);
    },
  );

  it.each(['/', '/home', '/w/clear', '/w/clear/products', '/w/exponential-labs', '/welcome-back', '/docs'])(
    'does not record %s',
    (path) => {
      expect(shouldRecord(path)).toBe(false);
    },
  );
});
