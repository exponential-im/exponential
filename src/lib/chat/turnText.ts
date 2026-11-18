/**
 * Splits an assistant turn into the answer the person reads and the text the
 * agent wrote while it worked (ticket 982, rapid.drift).
 *
 * The model narrates between tool calls ("Let me find that action…", "Now let
 * me…"). The chat draws every tool step in one card above the text, so that
 * narration ended up stacked under the card as a stutter, and stayed there
 * after the turn ended. Telling the model not to narrate made it skip the
 * confirmation before calendar writes (mastra PR 98), so the split happens
 * here instead: text after the last tool call is the answer, text before it
 * goes inside the tool card.
 */
export interface TurnText {
  /** Shown as the reply. */
  answer: string;
  /** Shown inside the tool card, behind its toggle. Empty when there is none. */
  working: string;
}

export function splitTurnText(
  content: string,
  answerOffset: number | undefined,
  finished: boolean,
): TurnText {
  const offset = Math.min(Math.max(answerOffset ?? 0, 0), content.length);
  if (offset === 0) return { answer: content, working: '' };

  const answer = content.slice(offset);
  // A finished turn that wrote nothing after its last tool call (it answered,
  // then logged something) would otherwise hide its whole reply in the card.
  if (finished && answer.trim() === '') return { answer: content, working: '' };

  return { answer, working: content.slice(0, offset).trim() };
}
