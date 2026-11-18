import { describe, it, expect } from 'vitest';
import {
  asToolErrorKind,
  classifyToolError,
  isRecoveredToolFailure,
  isReportableToolError,
  mastraResultFault,
  summarizeToolError,
  toolErrorSentence,
} from '../toolErrors';

// Verbatim (and cut off mid-object, as the tool row received it) from the
// meeting page where query-meeting-context 400'd on every call.
const WORKSPACE_ID_400 = String.raw`{"message":"Request failed: 400 Bad Request - {\"error\":{\"json\":{\"message\":\"[\\n {\\n \\\"code\\\": \\\"invalid_type\\\",\\n \\\"expected\\\": \\\"string\\\",\\n \\\"received\\\": \\\"undefined\\\",\\n \\\"path\\\": [\\n \\\"workspaceId\\\"\\n ],\\n \\\"message\\\": \\\"Required\\\"\\n }\\n]\",\"code\":-32600,\"data\":{\"code\":\"BAD_REQUEST\",\"httpStatus\":400,\"path\":\"mastra.queryMeetingContext\",\"zodError\":{\"formErrors\":[],\"fieldErrors\":{\"workspaceId\"`;

describe('classifyToolError', () => {
  it('reads an app that rejected the request shape as a contract fault', () => {
    expect(classifyToolError(WORKSPACE_ID_400)).toBe('contract');
    expect(classifyToolError('{"code":"METHOD_NOT_SUPPORTED","httpStatus":405}')).toBe('contract');
  });

  it('lets the HTTP status decide before any phrase in the body', () => {
    expect(classifyToolError('Request failed: 404 Not Found - {"code":"BAD_REQUEST"}')).toBe('not-found');
    expect(classifyToolError('Request failed: 403 Forbidden')).toBe('forbidden');
    expect(classifyToolError('Request failed: 429 Too Many Requests')).toBe('rate-limit');
    expect(classifyToolError('Request failed: 502 Bad Gateway')).toBe('server');
  });

  it('files "not found or access denied" under not-found, not forbidden', () => {
    expect(classifyToolError('Project not found or access denied')).toBe('not-found');
    expect(classifyToolError('You are not a member of this workspace (FORBIDDEN)')).toBe('forbidden');
  });

  it('recognises timeouts and upstream failures without a status', () => {
    expect(classifyToolError('The operation timed out')).toBe('timeout');
    expect(classifyToolError('TypeError: fetch failed')).toBe('server');
  });

  it('reads a call to a tool the agent does not have as no-such-tool, not as missing data', () => {
    // The AI SDK's wording when the chat prompt advertised `createAction`.
    expect(
      classifyToolError("Model tried to call unavailable tool 'createAction'. Available tools: quickCreateActionTool."),
    ).toBe('no-such-tool');
    expect(classifyToolError('Tool with name createAction not found')).toBe('no-such-tool');
    // Missing data is still missing data.
    expect(classifyToolError('Project not found or access denied')).toBe('not-found');
  });

  it('is unknown for empty or unrecognised text', () => {
    expect(classifyToolError(undefined)).toBe('unknown');
    expect(classifyToolError('')).toBe('unknown');
    expect(classifyToolError('boom')).toBe('unknown');
  });
});

describe('toolErrorSentence', () => {
  it('never contains transport vocabulary', () => {
    for (const kind of ['contract', 'server', 'no-such-tool', 'not-found', 'forbidden', 'rate-limit', 'timeout', 'unknown'] as const) {
      const sentence = toolErrorSentence(kind);
      expect(sentence).not.toMatch(/400|zod|json|trpc|bad request|schema/i);
      expect(sentence.length).toBeLessThan(110);
    }
  });

  it('falls back to the unknown sentence when no kind is known', () => {
    expect(toolErrorSentence(undefined)).toBe(toolErrorSentence('unknown'));
  });
});

describe('isReportableToolError', () => {
  it('reports only faults that are ours to fix', () => {
    expect(isReportableToolError('contract')).toBe(true);
    expect(isReportableToolError('server')).toBe(true);
    // Always ours: a prompt or instruction names a tool that does not exist.
    expect(isReportableToolError('no-such-tool')).toBe(true);
    expect(isReportableToolError('not-found')).toBe(false);
    expect(isReportableToolError('forbidden')).toBe(false);
    expect(isReportableToolError('rate-limit')).toBe(false);
    expect(isReportableToolError('timeout')).toBe(false);
    expect(isReportableToolError('unknown')).toBe(false);
  });
});

describe('classifyToolError with an unmapped 4xx', () => {
  it('does not read the rest of the body: a 412 with a stack trace is not a fault to file', () => {
    const raw =
      'Request failed: 412 Precondition Failed - {"error":{"json":{"message":"Semantic search: this install has no OpenAI key.","data":{"code":"PRECONDITION_FAILED","httpStatus":412,"stack":"AiNotConfiguredError\\n at zodError (internal_server_error.js) fetch failed"}}}}';
    expect(classifyToolError(raw)).toBe('unknown');
    expect(isReportableToolError(classifyToolError(raw))).toBe(false);
  });
});

describe('summarizeToolError', () => {
  it('names the tool, the procedure and the field from a nested, cut-off error', () => {
    expect(summarizeToolError('queryMeetingContextTool', WORKSPACE_ID_400)).toBe(
      'queryMeetingContextTool: mastra.queryMeetingContext rejected the request (invalid_type at workspaceId)',
    );
  });

  it('is identical for two occurrences that differ only in ids, so they share one ticket', () => {
    const other = WORKSPACE_ID_400.replace('-32600', '-32601');
    expect(summarizeToolError('queryMeetingContextTool', other)).toBe(
      summarizeToolError('queryMeetingContextTool', WORKSPACE_ID_400),
    );
  });

  it('falls back to the app when no procedure is named', () => {
    expect(summarizeToolError('getAllProjectsTool', '{"code":"METHOD_NOT_SUPPORTED","httpStatus":405}')).toBe(
      'getAllProjectsTool: the app rejected the request',
    );
    expect(summarizeToolError('getAllProjectsTool', 'Request failed: 500 Internal Server Error')).toBe(
      'getAllProjectsTool: the app failed while handling the request',
    );
  });

  it('says the answer is at fault, not the request, when the output failed the tool\'s schema', () => {
    // What the chat route and the tool canary both report for this case.
    const raw = 'ZodError: output failed its schema: Tool output validation failed for get-project-goals. The tool returned invalid output:';
    expect(classifyToolError(raw)).toBe('contract');
    expect(summarizeToolError('getProjectGoalsTool', raw)).toBe(
      "getProjectGoalsTool: the app answered, but the answer fails the tool's output schema",
    );
    // More detail after the marker (the canary sends the failing fields) does not change the title.
    expect(summarizeToolError('getProjectGoalsTool', `${raw}\n- goals.0.lifeDomain: Expected object, received null`)).toBe(
      summarizeToolError('getProjectGoalsTool', raw),
    );
  });

  it('names a phantom tool without the model-specific list of real ones, so recurrences share a ticket', () => {
    expect(
      summarizeToolError('createAction', "Model tried to call unavailable tool 'createAction'. Available tools: a, b, c."),
    ).toBe('createAction: the assistant called a tool that does not exist');
  });

  it('keeps the first line for anything else', () => {
    expect(summarizeToolError('weatherTool', 'boom\nstack line')).toBe('weatherTool: boom');
    expect(summarizeToolError('weatherTool', undefined)).toBe('weatherTool: failed with no message');
  });
});

describe('asToolErrorKind', () => {
  it('accepts known kinds and rejects anything else off the wire', () => {
    expect(asToolErrorKind('contract')).toBe('contract');
    expect(asToolErrorKind('nonsense')).toBeUndefined();
    expect(asToolErrorKind(400)).toBeUndefined();
  });
});

describe('isRecoveredToolFailure', () => {
  const ok = (name: string) => ({ name, status: 'success' });
  const failed = (name: string, errorKind?: 'no-such-tool' | 'contract' | 'unknown') => ({
    name,
    status: 'error',
    errorKind,
  });

  it('a phantom tool call is recovered once anything after it succeeds: nothing ever ran', () => {
    expect(isRecoveredToolFailure(failed('createAction', 'no-such-tool'), [ok('quickCreateActionTool')])).toBe(true);
    expect(isRecoveredToolFailure(failed('createAction', 'no-such-tool'), [])).toBe(false);
  });

  it('a failed call retried successfully on the same tool is recovered', () => {
    expect(
      isRecoveredToolFailure(failed('createCalendarEventTool', 'unknown'), [ok('createCalendarEventTool')]),
    ).toBe(true);
  });

  it('a failure followed by a DIFFERENT tool succeeding is not recovered: the answer may rest on a fallback', () => {
    expect(
      isRecoveredToolFailure(failed('queryMeetingContextTool', 'contract'), [ok('getMeetingTranscriptionsTool')]),
    ).toBe(false);
  });

  it('a later failure of the same tool recovers nothing, and a success is never a failure', () => {
    expect(isRecoveredToolFailure(failed('a', 'unknown'), [failed('a', 'unknown')])).toBe(false);
    expect(isRecoveredToolFailure(ok('a'), [ok('a')])).toBe(false);
  });
});

describe('mastraResultFault', () => {
  it("tells the tool's bad answer from the model's bad arguments", () => {
    expect(mastraResultFault('Tool output validation failed for create-calendar-event. ...')).toBe('output');
    // The model sent the wrong parameter names; the tool never ran.
    expect(
      mastraResultFault('Tool input validation failed for create-calendar-event. Please fix the following errors'),
    ).toBe('input');
    expect(mastraResultFault('You must show the event details to the user')).toBe('other');
    expect(mastraResultFault(undefined)).toBe('other');
  });
});
