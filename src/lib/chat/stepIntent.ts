/**
 * Step intent: the short phrase the model writes in a tool call to say what
 * the call is for ("Find Andi's open tickets in Cycle 17"). Mastra adds it as
 * an optional `intent` field on every Zoe and Assistant tool (mastra ticket
 * cozy.olive); the chat shows it on the tool row instead of the table label
 * (ticket silver.walnut).
 *
 * Tool frames skip `sanitizeAIOutput` (they are metadata, not prose), so the
 * route cleans the intent here before it reaches the browser. The rules are
 * strict on purpose: a label is decoration, so when in doubt it is dropped
 * and the row falls back to the table label.
 */
import { sanitizeAIOutput } from '~/lib/sanitize-output';
import { maskTokenLike } from '~/server/utils/redactToolArgs';

export const STEP_INTENT_FIELD = 'intent';
export const STEP_INTENT_MAX_CHARS = 80;
/** Mastra's schema caps `intent` at 120; the persisted copy is held to the same. */
export const PERSISTED_STEP_INTENT_MAX_CHARS = 120;

// A scheme ("https://", "mailto:"), a "www." host, or a bare domain with a path.
const URL_LIKE = /[a-z][a-z0-9+.-]*:\/\/|\bmailto:|\bwww\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\//i;
// Structured data, not a phrase: JSON, arrays, template braces.
const STRUCTURED = /[{[]/;

/**
 * The intent made safe to show, or undefined to fall back to the table label.
 *
 * Trims, collapses whitespace, and cuts to 80 characters. Drops the intent if
 * `sanitizeAIOutput` would redact anything, or if it contains `{`, `[`, a URL,
 * or a run that `maskTokenLike` would mask. The checks run on the whole text,
 * before the cut, so a secret cannot hide past the 80th character.
 */
export function cleanStepIntent(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text === '') return undefined;
  if (STRUCTURED.test(text)) return undefined;
  if (URL_LIKE.test(text)) return undefined;
  if (maskTokenLike(text) !== text) return undefined;
  if (sanitizeAIOutput(text).redacted) return undefined;
  return cutToChars(text, STEP_INTENT_MAX_CHARS);
}

// Cut on code points, not UTF-16 units, so an emoji at the cut is never split.
function cutToChars(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

/**
 * Split a tool call's args into the cleaned intent and the args without it.
 * The `intent` key is removed from the returned args whether or not it was
 * clean, so the raw text never rides along on the frame.
 */
export function splitStepIntent(args: unknown): { intent?: string; args: unknown } {
  if (!args || typeof args !== 'object' || Array.isArray(args) || !(STEP_INTENT_FIELD in args)) {
    return { args };
  }
  const { [STEP_INTENT_FIELD]: raw, ...rest } = args as Record<string, unknown>;
  const intent = cleanStepIntent(raw);
  return intent ? { intent, args: rest } : { args: rest };
}

/**
 * The intent as persisted for traces and judges. Unlike the display copy it is
 * never dropped, so a fill-rate count sees every intent the model wrote, but
 * it is scrubbed (token-like runs and secret shapes redacted) and cut to 120
 * characters so it cannot crowd the real args out of the 500-character cut.
 */
function persistableIntent(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  return cutToChars(sanitizeAIOutput(maskTokenLike(text)).text, PERSISTED_STEP_INTENT_MAX_CHARS);
}

/**
 * The args with `intent` moved to the front, for the persisted copy. That copy
 * is cut at 500 characters per call, and the model writes `intent` last (it is
 * the last field in the schema), so on a large call the cut would hide it from
 * traces and judges. The intent is scrubbed and capped (`persistableIntent`).
 * A non-string intent is left where it is.
 */
export function intentFirst(args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args) || !(STEP_INTENT_FIELD in args)) {
    return args;
  }
  const { [STEP_INTENT_FIELD]: intent, ...rest } = args as Record<string, unknown>;
  if (typeof intent !== 'string') return args;
  return { [STEP_INTENT_FIELD]: persistableIntent(intent), ...rest };
}
