import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { ThinkingStatus } from '../ThinkingStatus';
import { narrateTool } from '../thinkingMessages';
import type { ToolCall } from '~/providers/AgentModalProvider';

const call = (overrides: Partial<ToolCall>): ToolCall => ({
  id: 'call-1',
  name: 'getAllProjectsTool',
  status: 'running',
  ...overrides,
});

// Ticket silver.walnut: the running call's intent replaces the narration.
describe('ThinkingStatus', () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the running call's intent when it has one", () => {
    render(<ThinkingStatus toolCalls={[call({ intent: "Find Andi's open tickets in Cycle 17" })]} />);
    expect(screen.getByRole('status')).toHaveTextContent("Find Andi's open tickets in Cycle 17");
  });

  it('narrates the tool when the running call has no intent', () => {
    render(<ThinkingStatus toolCalls={[call({})]} />);
    expect(screen.getByRole('status')).toHaveTextContent(narrateTool('getAllProjectsTool'));
  });

  it('uses the most recent running call', () => {
    render(
      <ThinkingStatus
        toolCalls={[
          call({ id: 'a', status: 'success', intent: 'Old step' }),
          call({ id: 'b', intent: 'Check the calendar for Friday' }),
        ]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Check the calendar for Friday');
  });
});
