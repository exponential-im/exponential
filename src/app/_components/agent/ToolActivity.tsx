'use client';

import { useMemo, useState, memo, type ReactNode } from 'react';
import { Collapse, Loader, UnstyledButton } from '@mantine/core';
import { IconCheck, IconChevronDown, IconChevronRight, IconX, IconAlertTriangle } from '@tabler/icons-react';
import type { ToolCall } from '~/providers/AgentModalProvider';
import { TOOL_DISPLAY, humanizeToolName, isHiddenTool, type ToolDisplay } from './toolDisplayNames';
import { classifyToolError, isRecoveredToolFailure, toolErrorSentence } from '~/lib/chat/toolErrors';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';

interface ToolActivityProps {
  calls: ToolCall[];
  /**
   * What the agent wrote between its tool calls ("Let me look that up…").
   * Kept out of the reply and shown here, behind the toggle (`splitTurnText`).
   */
  working?: string;
  /**
   * The turn has ended. The steps then fold into one summary row, so a long
   * turn leaves one line above its answer instead of a list.
   */
  finished?: boolean;
}

const CARD_CLASS = 'mb-2 space-y-1 rounded-md border border-border-primary bg-surface-secondary px-2 py-1.5';
const ROW_BUTTON_CLASS = 'flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-surface-hover';

// The folded card's one line: how many steps, and how many failed.
export function toolSummaryLabel(stepCount: number, failedCount: number): string {
  if (stepCount === 0) return 'Working notes';
  const steps = `Used ${stepCount} ${stepCount === 1 ? 'tool' : 'tools'}`;
  return failedCount > 0 ? `${steps} · ${failedCount} failed` : steps;
}

interface ToolGroup {
  toolName: string;
  display: ToolDisplay | undefined;
  calls: ToolCall[];
}

// Group consecutive same-name calls. Mixed sequences render multiple groups.
function groupCalls(calls: ToolCall[]): ToolGroup[] {
  const groups: ToolGroup[] = [];
  for (const call of calls) {
    const last = groups[groups.length - 1];
    if (last && last.toolName === call.name) {
      last.calls.push(call);
    } else {
      groups.push({
        toolName: call.name,
        display: TOOL_DISPLAY[call.name],
        calls: [call],
      });
    }
  }
  return groups;
}

function formatCount(template: string, n: number, total?: number): string {
  return template.replace('{n}', String(n)).replace('{total}', String(total ?? n));
}

// The model-written intent wins when the call has one (ticket silver.walnut).
// Otherwise only a curated pickArg may surface an arg value. An unmapped tool
// shows its humanized verb alone — never a guessed arg (no ids, booleans, or
// JSON).
function callLabel(call: ToolCall, display: ToolDisplay | undefined): string {
  if (call.intent) return call.intent;
  const arg = display?.pickArg(call.args);
  if (arg) return arg;
  return display ? display.verb : humanizeToolName(call.name);
}

// A failed call reads as one plain sentence. The raw error is a transport
// artefact (a tRPC envelope, a zod issue list); the server sends it to admins
// only, and it renders as a quiet second line for them.
function FailureDetail({ call }: { call: ToolCall }) {
  const raw = call.errorMsg?.trim();
  return (
    <>
      <span>{toolErrorSentence(call.errorKind ?? classifyToolError(raw))}</span>
      {raw ? (
        <span className="mt-0.5 block max-h-24 overflow-y-auto break-all font-mono text-[11px] text-text-muted">
          {raw}
        </span>
      ) : null}
    </>
  );
}

function StatusIcon({ status }: { status: ToolCall['status'] }) {
  if (status === 'running') return <Loader size="xs" />;
  if (status === 'error') return <IconX size={14} className="text-red-500" />;
  return <IconCheck size={14} className="text-brand-primary" />;
}

const ToolGroupRow = memo(function ToolGroupRow({ group }: { group: ToolGroup }) {
  const { calls, display, toolName } = group;
  const total = calls.length;
  const completedCount = calls.filter((c) => c.status !== 'running').length;
  const errorCount = calls.filter((c) => c.status === 'error').length;
  const successCount = calls.filter((c) => c.status === 'success').length;
  const isRunning = completedCount < total;

  // Single-call shortcut: show inline, no toggle needed.
  const singleCall = total === 1 ? calls[0] : undefined;
  const [open, setOpen] = useState(false);

  let headerLabel: ReactNode;
  let headerIcon: ReactNode;

  if (singleCall) {
    headerIcon = <StatusIcon status={singleCall.status} />;
    if (singleCall.status === 'error') {
      // Calm failure line: the intent or the verb, no arg, no raw error. What
      // went wrong, in plain words, lives behind the row's click-to-expand
      // (rendered below).
      headerLabel = (
        <span className="text-text-secondary text-xs">
          {singleCall.intent ?? display?.verb ?? humanizeToolName(toolName)} — failed
        </span>
      );
    } else if (singleCall.intent) {
      // The icon carries the state (spinner, check), so the intent reads the
      // same while running and when done.
      headerLabel = <span className="text-text-secondary text-xs">{singleCall.intent}</span>;
    } else {
      const verb =
        singleCall.status === 'running'
          ? display?.verb ?? humanizeToolName(toolName)
          : display?.pastTense ?? humanizeToolName(toolName);
      const arg = display?.pickArg(singleCall.args);
      headerLabel = (
        <span className="text-text-secondary text-xs">
          {verb}
          {arg && arg !== verb ? `: ${arg}` : ''}
        </span>
      );
    }
  } else if (isRunning) {
    headerIcon = <Loader size="xs" />;
    const template = display?.progress ?? `${humanizeToolName(toolName)}… {n}/{total}`;
    headerLabel = (
      <span className="text-text-secondary text-xs">
        {formatCount(template, completedCount, total)}
      </span>
    );
  } else if (errorCount > 0) {
    headerIcon = <IconAlertTriangle size={14} className="text-red-500" />;
    headerLabel = (
      <span className="text-text-secondary text-xs">
        {display?.pastTense ?? humanizeToolName(toolName)} — {successCount} of {total} succeeded
      </span>
    );
  } else {
    headerIcon = <IconCheck size={14} className="text-brand-primary" />;
    const template = display?.pluralPast ?? `${humanizeToolName(toolName)} ×{n}`;
    headerLabel = (
      <span className="text-text-secondary text-xs">{formatCount(template, total)}</span>
    );
  }

  if (singleCall) {
    if (singleCall.status === 'error') {
      return (
        <div>
          <UnstyledButton
            onClick={() => setOpen((v) => !v)}
            className={ROW_BUTTON_CLASS}
          >
            {headerIcon}
            {headerLabel}
            <span className="ml-auto text-text-muted">
              {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            </span>
          </UnstyledButton>
          <Collapse in={open}>
            <div className="mt-1 break-words pl-6 pr-2 pb-1 text-xs text-text-secondary">
              <FailureDetail call={singleCall} />
            </div>
          </Collapse>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        {headerIcon}
        {headerLabel}
      </div>
    );
  }

  return (
    <div>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        className={ROW_BUTTON_CLASS}
      >
        {headerIcon}
        {headerLabel}
        <span className="ml-auto text-text-muted">
          {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
      </UnstyledButton>
      <Collapse in={open}>
        <ul className="mt-1 space-y-0.5 pl-6">
          {calls.map((call) => (
            <li key={call.id} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                <StatusIcon status={call.status} />
              </span>
              <span className="min-w-0 text-text-secondary text-xs">
                {callLabel(call, display)}
                {call.status === 'error' ? (
                  <span className="block text-text-muted">
                    <FailureDetail call={call} />
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
});

export const ToolActivity = memo(function ToolActivity({ calls, working, finished = false }: ToolActivityProps) {
  // A failure the assistant got past in the same turn is noise next to a reply
  // that says "Done". Hide it from the person; an admin (the only one who
  // receives raw error text) still sees every call. Plumbing steps (tool
  // search) are hidden from everyone.
  const visible = useMemo(
    () =>
      calls.filter((call, i) => {
        if (isHiddenTool(call.name)) return false;
        if (call.errorMsg) return true;
        const kind = call.errorKind ?? classifyToolError(call.errorMsg);
        return !isRecoveredToolFailure({ ...call, errorKind: kind }, calls.slice(i + 1));
      }),
    [calls],
  );
  const groups = useMemo(() => groupCalls(visible), [visible]);
  const [open, setOpen] = useState(false);
  const notes = working?.trim() ?? '';

  const rows = groups.map((group, idx) => (
    <ToolGroupRow key={`${group.toolName}-${idx}`} group={group} />
  ));

  // While the turn runs, and for a finished turn with one step and nothing
  // written along the way, the steps show as they are.
  if (!finished || (visible.length <= 1 && notes === '')) {
    if (groups.length === 0) return null;
    return (
      <div className={CARD_CLASS}>
        {rows}
      </div>
    );
  }

  const failedCount = visible.filter((c) => c.status === 'error').length;
  return (
    <div className={CARD_CLASS}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={ROW_BUTTON_CLASS}
      >
        {failedCount > 0 ? (
          <IconAlertTriangle size={14} className="text-red-500" />
        ) : (
          <IconCheck size={14} className="text-brand-primary" />
        )}
        <span className="text-text-secondary text-xs">{toolSummaryLabel(visible.length, failedCount)}</span>
        <span className="ml-auto text-text-muted">
          {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
      </UnstyledButton>
      <Collapse in={open}>
        {rows.length > 0 && <div className="space-y-1">{rows}</div>}
        {notes !== '' && (
          // Sized like the step rows: each paragraph inline in a small muted line.
          <div className="space-y-1 px-2 pt-1 pb-1 text-xs leading-5 text-text-muted">
            {notes.split(/\n{2,}/).map((paragraph, i) => (
              <p key={i}>
                <MarkdownRenderer content={paragraph} variant="inline" />
              </p>
            ))}
          </div>
        )}
      </Collapse>
    </div>
  );
});
