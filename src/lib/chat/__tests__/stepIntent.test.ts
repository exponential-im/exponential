import { describe, it, expect } from 'vitest';
import { cleanStepIntent, intentFirst, splitStepIntent, STEP_INTENT_MAX_CHARS } from '../stepIntent';
import { redactToolArgs } from '~/server/utils/redactToolArgs';

describe('cleanStepIntent', () => {
  it('keeps a plain phrase as written', () => {
    expect(cleanStepIntent("Find Andi's open tickets in Cycle 17")).toBe("Find Andi's open tickets in Cycle 17");
  });

  it('trims and collapses whitespace', () => {
    expect(cleanStepIntent('  Find   open\n\ttickets  ')).toBe('Find open tickets');
  });

  it('cuts to 80 characters', () => {
    const long = `Find ${'very '.repeat(30)}old tickets`;
    const out = cleanStepIntent(long)!;
    expect(out.length).toBe(STEP_INTENT_MAX_CHARS);
    expect(out.endsWith('…')).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
  });

  it('leaves an 80-character phrase whole', () => {
    const exact = 'Find the open tickets for Andi and Sam in Cycle 17 that are due by next Friday!!';
    expect(exact.length).toBe(80);
    expect(cleanStepIntent(exact)).toBe(exact);
  });

  it.each([
    ['not a string', 42],
    ['null', null],
    ['an object', { text: 'Find tickets' }],
    ['empty', ''],
    ['whitespace only', '   \n '],
  ])('drops %s', (_label, raw) => {
    expect(cleanStepIntent(raw)).toBeUndefined();
  });

  it.each([
    ['{', 'Create action {"name":"x"}'],
    ['[', 'Fetch items [1, 2, 3]'],
  ])('drops an intent containing %s', (_char, raw) => {
    expect(cleanStepIntent(raw)).toBeUndefined();
  });

  it.each([
    ['https URL', 'Read https://example.com/page'],
    ['http URL', 'Open http://intranet/report'],
    ['www host', 'Read www.example.com today'],
    ['bare domain with path', 'Fetch example.com/pricing'],
    ['mailto', 'Write to mailto:andi@example.com'],
  ])('drops an intent containing a %s', (_label, raw) => {
    expect(cleanStepIntent(raw)).toBeUndefined();
  });

  it('keeps a sentence-ending full stop and decimal numbers', () => {
    expect(cleanStepIntent('Check version 2.5 notes.')).toBe('Check version 2.5 notes.');
  });

  it('drops an intent with a run maskTokenLike would mask', () => {
    expect(cleanStepIntent(`Look up ${'a1B2'.repeat(10)} record`)).toBeUndefined();
  });

  it('drops an intent sanitizeAIOutput would redact, even when maskTokenLike would not', () => {
    // 24 chars after the prefix: below maskTokenLike's 40, above the API_KEY rule's 20.
    expect(cleanStepIntent('Use sk_abcdefghijklmnopqrstuvwx now')).toBeUndefined();
    expect(cleanStepIntent('Search ghp_' + 'A'.repeat(36))).toBeUndefined();
  });

  it('checks the whole text before the cut, so a secret past character 80 still drops it', () => {
    const raw = `${'Find the tickets for this week '.repeat(3)}sk_abcdefghijklmnopqrstuvwx`;
    expect(raw.indexOf('sk_')).toBeGreaterThan(STEP_INTENT_MAX_CHARS);
    expect(cleanStepIntent(raw)).toBeUndefined();
  });
});

describe('splitStepIntent', () => {
  it('returns the cleaned intent and the args without it', () => {
    expect(splitStepIntent({ assignee: 'Andi', intent: '  Find  open tickets ' })).toEqual({
      intent: 'Find open tickets',
      args: { assignee: 'Andi' },
    });
  });

  it('removes a rejected intent from the args too', () => {
    const out = splitStepIntent({ assignee: 'Andi', intent: 'Read https://example.com' });
    expect(out).toEqual({ args: { assignee: 'Andi' } });
    expect(out).not.toHaveProperty('intent');
  });

  it('leaves args with no intent as they are', () => {
    const args = { assignee: 'Andi' };
    expect(splitStepIntent(args)).toEqual({ args });
    expect(splitStepIntent(undefined)).toEqual({ args: undefined });
  });
});

describe('intentFirst', () => {
  it('moves intent to the front of the persisted args, so the per-call cut keeps it', () => {
    const args = { body: 'The brief covers scope. '.repeat(30), intent: 'Write the project brief' };
    const persisted = redactToolArgs(intentFirst(args));
    expect(persisted.length).toBeLessThan(600);
    expect(persisted.startsWith('{"intent":"Write the project brief"')).toBe(true);
    // Without the move, the cut hides it.
    expect(redactToolArgs(args)).not.toContain('Write the project brief');
  });

  it('leaves args with no intent as they are', () => {
    const args = { a: 1 };
    expect(intentFirst(args)).toBe(args);
  });
});
