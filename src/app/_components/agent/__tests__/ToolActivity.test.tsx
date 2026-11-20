import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '~/test/test-utils';
import '@testing-library/jest-dom/vitest';
import { ToolActivity } from '../ToolActivity';
import type { ToolCall } from '~/providers/AgentModalProvider';

const call = (overrides: Partial<ToolCall>): ToolCall => ({
  id: 'call-1',
  name: 'createProjectTool',
  status: 'success',
  ...overrides,
});

describe('ToolActivity', () => {
  afterEach(() => {
    cleanup();
  });

  it('labels a mapped tool with its curated pickArg', () => {
    render(
      <ToolActivity
        calls={[call({ args: { name: 'Website relaunch' } })]}
      />,
    );

    expect(screen.getByText(/Created project: Website relaunch/)).toBeInTheDocument();
  });

  it('never renders an arg value for an unmapped tool', () => {
    render(
      <ToolActivity
        calls={[
          call({
            name: 'doMysteryThingTool',
            args: { includeCompleted: 'false', workspaceId: 'cmx123abc' },
          }),
        ]}
      />,
    );

    expect(screen.getByText('Do mystery thing')).toBeInTheDocument();
    expect(screen.queryByText(/false/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cmx123abc/)).not.toBeInTheDocument();
  });

  it('renders a failed call as one calm line, with a plain sentence behind expand', () => {
    const rawError = '{"code":"METHOD_NOT_SUPPORTED","httpStatus":405}';
    render(
      <ToolActivity
        calls={[
          call({
            name: 'getAllProjectsTool',
            status: 'error',
            errorMsg: rawError,
            args: { includeCompleted: 'false' },
          }),
        ]}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Get projects — failed');
    expect(row).not.toHaveTextContent('METHOD_NOT_SUPPORTED');
    expect(row).not.toHaveTextContent('false');

    fireEvent.click(row);
    // The raw text only exists on the call when the server sent it (admins).
    expect(screen.getByText(rawError)).toBeInTheDocument();
    expect(
      screen.getByText("This step isn't working right now. The problem is on our side, not something you did."),
    ).toBeInTheDocument();
  });

  it('shows a non-admin the sentence alone: no raw error reaches the page', () => {
    render(
      <ToolActivity
        calls={[
          call({ id: 'a', name: 'queryMeetingContextTool', status: 'error', errorKind: 'contract', args: { query: 'Cyril' } }),
          call({ id: 'b', name: 'queryMeetingContextTool', status: 'error', errorKind: 'contract', args: { query: 'Cyril stories' } }),
        ]}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Searched meeting notes — 0 of 2 succeeded');
    fireEvent.click(row);
    expect(
      screen.getAllByText("This step isn't working right now. The problem is on our side, not something you did."),
    ).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/400|BAD_REQUEST|zodError|workspaceId/);
  });

  it('falls back to a plain sentence when a failed call carries nothing at all', () => {
    render(
      <ToolActivity
        calls={[call({ name: 'getUserWorkspacesTool', status: 'error' })]}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText("This step didn't work.")).toBeInTheDocument();
  });

  it('hides a phantom tool call the assistant got past, leaving only the step that worked', () => {
    render(
      <ToolActivity
        calls={[
          call({ id: 'a', name: 'createAction', status: 'error', errorKind: 'no-such-tool' }),
          call({ id: 'b', name: 'quickCreateActionTool', status: 'success', args: { name: 'Parse outputs' } }),
        ]}
      />,
    );

    expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Create action/)).not.toBeInTheDocument();
    expect(screen.getByText(/Created task: Parse outputs/)).toBeInTheDocument();
  });

  it('still shows an admin the recovered failure, with its raw error', () => {
    render(
      <ToolActivity
        calls={[
          call({
            id: 'a',
            name: 'createAction',
            status: 'error',
            errorKind: 'no-such-tool',
            errorMsg: "Model tried to call unavailable tool 'createAction'.",
          }),
          call({ id: 'b', name: 'quickCreateActionTool', status: 'success', args: { name: 'Parse outputs' } }),
        ]}
      />,
    );

    expect(screen.getByText('Create action — failed')).toBeInTheDocument();
  });

  it('keeps a failure visible when a different tool answered instead', () => {
    render(
      <ToolActivity
        calls={[
          call({ id: 'a', name: 'queryMeetingContextTool', status: 'error', errorKind: 'contract' }),
          call({ id: 'b', name: 'getUserWorkspacesTool', status: 'success' }),
        ]}
      />,
    );

    expect(screen.getByText('Search meeting notes — failed')).toBeInTheDocument();
  });
});

// Ticket 982 (rapid.drift): a finished turn leaves one line, not a list.
describe('ToolActivity — finished turns and plumbing', () => {
  afterEach(() => {
    cleanup();
  });

  const turnCalls: ToolCall[] = [
    call({ id: 'a', name: 'toolSearch' }),
    call({ id: 'b', name: 'getTodaysActionsTool' }),
    call({ id: 'c', name: 'checkCalendarConnectionTool' }),
    call({ id: 'd', name: 'toolSearch' }),
  ];

  it('never shows tool search', () => {
    render(<ToolActivity calls={turnCalls} />);
    expect(screen.queryByText(/Tool search/i)).not.toBeInTheDocument();
    expect(screen.getByText("Fetched today's tasks")).toBeInTheDocument();
  });

  it('shows each step while the turn is still running', () => {
    render(<ToolActivity calls={turnCalls} working="Let me look that up." finished={false} />);
    expect(screen.getByText("Fetched today's tasks")).toBeInTheDocument();
    expect(screen.queryByText(/Used \d tools/)).not.toBeInTheDocument();
    expect(screen.queryByText('Let me look that up.')).not.toBeInTheDocument();
  });

  it('folds a finished turn into one summary row, counting only visible steps', () => {
    render(<ToolActivity calls={turnCalls} working="Let me look that up." finished />);
    const summary = screen.getByRole('button', { name: /Used 2 tools/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the steps and the working text once the summary is opened', () => {
    render(<ToolActivity calls={turnCalls} working="Let me look that up." finished />);
    fireEvent.click(screen.getByRole('button', { name: /Used 2 tools/ }));
    expect(screen.getByRole('button', { name: /Used 2 tools/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText("Fetched today's tasks")).toBeInTheDocument();
    expect(screen.getByText('Let me look that up.')).toBeInTheDocument();
  });

  it('leaves a finished single step with no working text as it is', () => {
    render(<ToolActivity calls={[call({ args: { name: 'Website relaunch' } })]} finished />);
    expect(screen.getByText(/Created project: Website relaunch/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Used/ })).not.toBeInTheDocument();
  });

  it('says how many steps failed in the summary', () => {
    render(
      <ToolActivity
        calls={[
          call({ id: 'x', name: 'getTodaysActionsTool' }),
          call({ id: 'y', name: 'createCalendarEventTool', status: 'error', errorKind: 'rejected' }),
        ]}
        finished
      />,
    );
    expect(screen.getByRole('button', { name: /Used 2 tools · 1 failed/ })).toBeInTheDocument();
  });

  it('renders nothing for a turn whose only step was tool search', () => {
    render(<ToolActivity calls={[call({ name: 'toolSearch' })]} finished />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Tool search|Used/)).not.toBeInTheDocument();
  });
});

// Ticket silver.walnut: the model-written intent replaces the table label.
describe('ToolActivity — step intent', () => {
  afterEach(() => {
    cleanup();
  });

  const intent = "Find Andi's open tickets in Cycle 17";

  it('shows the intent for a running single call, and falls back to the table label without one', () => {
    render(<ToolActivity calls={[call({ name: 'quickCreateActionTool', status: 'running', args: { name: 'Pay Malte' }, intent: 'Add a task to pay Malte' })]} />);
    expect(screen.getByText('Add a task to pay Malte')).toBeInTheDocument();
    expect(screen.queryByText(/Create task/)).not.toBeInTheDocument();
    cleanup();

    render(<ToolActivity calls={[call({ name: 'quickCreateActionTool', status: 'running', args: { name: 'Pay Malte' } })]} />);
    expect(screen.getByText('Create task: Pay Malte')).toBeInTheDocument();
  });

  it('shows the same intent when the single call is done (the icon carries the state)', () => {
    render(<ToolActivity calls={[call({ args: { name: 'Website relaunch' }, intent: 'Start the website relaunch project' })]} />);
    expect(screen.getByText('Start the website relaunch project')).toBeInTheDocument();
    expect(screen.queryByText(/Created project/)).not.toBeInTheDocument();
  });

  it('reads "{intent} — failed" for a failed single call, and the verb without one', () => {
    render(<ToolActivity calls={[call({ name: 'getAllProjectsTool', status: 'error', errorKind: 'contract', intent })]} />);
    expect(screen.getByRole('button')).toHaveTextContent(`${intent} — failed`);
    cleanup();

    render(<ToolActivity calls={[call({ name: 'getAllProjectsTool', status: 'error', errorKind: 'contract' })]} />);
    expect(screen.getByRole('button')).toHaveTextContent('Get projects — failed');
  });

  it('shows each call\'s intent inside an expanded group, with the table label as fallback, and keeps the group header', () => {
    render(
      <ToolActivity
        calls={[
          call({ id: 'a', name: 'quickCreateActionTool', args: { name: 'Pay Malte' }, intent: 'Add a task to pay Malte' }),
          call({ id: 'b', name: 'quickCreateActionTool', args: { name: 'Book venue' } }),
        ]}
      />,
    );
    const header = screen.getByRole('button', { name: /Created 2 tasks/ });
    expect(screen.queryByText('Add a task to pay Malte')).not.toBeVisible();
    fireEvent.click(header);
    expect(screen.getByText('Add a task to pay Malte')).toBeInTheDocument();
    expect(screen.getByText('Book venue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Created 2 tasks/ })).toBeInTheDocument();
  });

  it('keeps the folded summary for a finished turn', () => {
    render(
      <ToolActivity
        calls={[
          call({ id: 'a', name: 'getTodaysActionsTool', intent: "Check today's tasks" }),
          call({ id: 'b', name: 'checkCalendarConnectionTool', intent: 'Check the calendar is connected' }),
        ]}
        finished
      />,
    );
    expect(screen.getByRole('button', { name: /Used 2 tools/ })).toBeInTheDocument();
  });
});
