import { describe, it, expect } from 'vitest';
import { parseChatStreamBuffer } from '../streamProtocol';
import { splitTurnText } from '../turnText';

const toolFrame = (payload: Record<string, unknown>) =>
  `\n__exp_tool__:${JSON.stringify(payload)}\n`;
const call = (id: string, name: string) => toolFrame({ phase: 'call', id, name });
const result = (id: string, name: string) => toolFrame({ phase: 'result', id, name });

// The shape of the German-slots turn (ticket 982): narration between every
// lookup, then the confirmation after the last one.
const narratedTurn =
  "I'll help you set up those German speaking slots." +
  call('t1', 'toolSearch') +
  result('t1', 'toolSearch') +
  "Let me get your today's actions to find that German speaking task:" +
  call('t2', 'get-todays-actions') +
  result('t2', 'get-todays-actions') +
  'Perfect! I found your action. Your calendar is connected.' +
  call('t3', 'check-calendar-connection') +
  result('t3', 'check-calendar-connection') +
  '\n\n**German speaking practice**, Mon/Wed/Fri 08:30–08:50. Should I create this?';

describe('answerOffset from the stream parser', () => {
  it('is 0 for a turn with no tool calls', () => {
    expect(parseChatStreamBuffer('Just an answer.').answerOffset).toBe(0);
  });

  it('points just past the last tool frame, in rendered-text coordinates', () => {
    const parsed = parseChatStreamBuffer(narratedTurn);
    const answer = parsed.displayText.slice(parsed.answerOffset);
    expect(answer.trim()).toBe('**German speaking practice**, Mon/Wed/Fri 08:30–08:50. Should I create this?');
    expect(parsed.displayText.slice(0, parsed.answerOffset)).toContain("Let me get your today's actions");
  });

  it('ignores keepalive characters when counting', () => {
    const parsed = parseChatStreamBuffer('\u200BLooking.\u200B' + call('t1', 'x') + 'Answer\u200B.');
    expect(parsed.displayText.slice(parsed.answerOffset).trim()).toBe('Answer.');
  });

  it('treats everything as working text while a tool frame is still arriving', () => {
    const parsed = parseChatStreamBuffer('Let me check that.\n__exp_tool__:{"phase":"ca');
    expect(parsed.displayText).toBe('Let me check that.');
    expect(parsed.answerOffset).toBe(parsed.displayText.length);
  });
});

describe('splitTurnText', () => {
  it('leaves a turn without tool calls alone', () => {
    expect(splitTurnText('Hello', undefined, true)).toEqual({ answer: 'Hello', working: '' });
    expect(splitTurnText('Hello', 0, false)).toEqual({ answer: 'Hello', working: '' });
  });

  it('moves the narration into working text and keeps the answer', () => {
    const parsed = parseChatStreamBuffer(narratedTurn);
    const turn = splitTurnText(parsed.displayText, parsed.answerOffset, true);
    expect(turn.answer).not.toMatch(/Let me|Perfect!/);
    expect(turn.answer).toMatch(/Should I create this\?/);
    expect(turn.working).toMatch(/^I'll help you set up/);
    expect(turn.working).toMatch(/Your calendar is connected\.$/);
  });

  it('shows nothing as the answer while the agent is still between tools', () => {
    const turn = splitTurnText('Let me check that.', 'Let me check that.'.length, false);
    expect(turn).toEqual({ answer: '', working: 'Let me check that.' });
  });

  it('keeps the whole reply visible when a finished turn wrote nothing after its last tool', () => {
    const text = 'Done: the event is in your calendar.';
    expect(splitTurnText(text, text.length, true)).toEqual({ answer: text, working: '' });
  });

  it('clamps an offset past the end of the text', () => {
    expect(splitTurnText('abc', 99, true)).toEqual({ answer: 'abc', working: '' });
  });
});
