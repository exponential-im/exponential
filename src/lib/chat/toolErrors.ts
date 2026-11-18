/**
 * What a failed agent tool call means, for the two audiences that need it.
 *
 * A tool's raw error is a transport artefact: a tRPC envelope, a zod issue
 * list, an HTTP status line, often nested and cut off mid-JSON. Shown to the
 * person chatting it reads as the product breaking in their face; shown to
 * nobody it lets a tool fail on every call for months. So one pure classifier
 * feeds both sides:
 *
 *  - the chat UI turns the kind into one plain sentence (`toolErrorSentence`);
 *  - the chat route files a Bug for the kinds that are ours to fix
 *    (`isReportableToolError`), titled by `summarizeToolError` so every
 *    recurrence lands on the same ticket.
 *
 * Pure and dependency-free: imported by client components and the route.
 */

export type ToolErrorKind =
  /** The app rejected the shape of the tool's request, or the method. Tool and app disagree. */
  | 'contract'
  /**
   * The model called a tool the agent does not have. Nothing ran. Always ours:
   * a prompt or an instruction names a tool that does not exist.
   */
  | 'no-such-tool'
  | 'not-found'
  | 'forbidden'
  | 'rate-limit'
  | 'timeout'
  /** The app or an upstream service failed while handling a valid request. */
  | 'server'
  | 'unknown';

const KINDS: readonly ToolErrorKind[] = [
  'contract',
  'no-such-tool',
  'not-found',
  'forbidden',
  'rate-limit',
  'timeout',
  'server',
  'unknown',
];

/** Narrow a wire value (a stream frame's `kind`) to a known kind. */
export function asToolErrorKind(value: unknown): ToolErrorKind | undefined {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
    ? (value as ToolErrorKind)
    : undefined;
}

function kindFromStatus(status: number): ToolErrorKind | undefined {
  if (status === 404) return 'not-found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 429) return 'rate-limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 400 || status === 405 || status === 415 || status === 422) return 'contract';
  if (status >= 500 && status <= 599) return 'server';
  return undefined;
}

/**
 * Bucket a tool's error text. Order matters: an explicit HTTP status wins,
 * then tRPC code names, then looser phrases. "Project not found or access
 * denied" is `not-found`, so that check runs before `forbidden`.
 */
export function classifyToolError(message: string | undefined | null): ToolErrorKind {
  if (!message) return 'unknown';
  const text = message.toLowerCase();

  const status = /request failed:\s*(\d{3})\b/.exec(text) ?? /httpstatus\W{1,4}(\d{3})\b/.exec(text);
  if (status?.[1]) {
    const code = Number(status[1]);
    const fromStatus = kindFromStatus(code);
    if (fromStatus) return fromStatus;
    // Any other 4xx (a 412 "connect your calendar first", a 409) is the app
    // answering on purpose. Stop here: the phrases below would otherwise match
    // words in the rest of the body, such as a dev server's stack trace.
    if (code >= 400 && code <= 499) return 'unknown';
  }

  // Before `not-found`: "tool X not found" is a missing tool, not missing data.
  if (/unavailable tool|no such tool|nosuchtool|tool\b.{0,80}\b(not found|does not exist|is not available)|not a valid tool/.test(text)) {
    return 'no-such-tool';
  }
  if (/not_found|not found/.test(text)) return 'not-found';
  if (/forbidden|unauthorized|access denied|permission denied/.test(text)) return 'forbidden';
  if (/too_many_requests|rate limit|rate-limit/.test(text)) return 'rate-limit';
  if (/timeout|timed out|etimedout|aborterror/.test(text)) return 'timeout';
  if (/bad_request|zoderror|invalid_type|method_not_supported|unprocessable_content|parse_error/.test(text)) {
    return 'contract';
  }
  if (/internal_server_error|fetch failed|econnrefused|econnreset|enotfound|bad gateway|service unavailable/.test(text)) {
    return 'server';
  }
  return 'unknown';
}

const SENTENCES: Record<ToolErrorKind, string> = {
  contract: "This step isn't working right now. The problem is on our side, not something you did.",
  server: 'Something went wrong on our side while doing this. It is not something you did.',
  'no-such-tool': 'The assistant reached for a tool it does not have. Nothing was changed.',
  'not-found': "Couldn't find that, or you don't have access to it.",
  forbidden: "You don't have access to this.",
  'rate-limit': 'Too many requests just now. Try again in a minute.',
  timeout: 'This took too long and was stopped.',
  unknown: "This step didn't work.",
};

/** The one plain sentence a person sees for a failed step. */
export function toolErrorSentence(kind: ToolErrorKind | undefined): string {
  return SENTENCES[kind ?? 'unknown'];
}

/**
 * Whether a failure is a fault in the product that someone has to fix.
 * `not-found`, `forbidden`, `rate-limit` and `timeout` are ordinary outcomes
 * of a person's or the model's request; filing them would bury the real ones.
 */
export function isReportableToolError(kind: ToolErrorKind): boolean {
  return kind === 'contract' || kind === 'server' || kind === 'no-such-tool';
}

/**
 * Whether a failed call is noise to the person chatting: the assistant got
 * past it within the same turn, so the turn's outcome is not in doubt.
 *
 *  - A call to a tool that does not exist never ran anything.
 *  - A call that failed and was then retried successfully on the SAME tool
 *    (wrong parameter names, a transient error) did its job the second time.
 *
 * A failure followed by a different tool succeeding is NOT recovered: the
 * answer may rest on a fallback, and the person should see that a step failed.
 * Still reported and still in the trace; this only governs the chat's tool row.
 */
export function isRecoveredToolFailure(
  call: { name: string; status: string; errorKind?: ToolErrorKind },
  laterCalls: ReadonlyArray<{ name: string; status: string }>,
): boolean {
  if (call.status !== 'error') return false;
  if (call.errorKind === 'no-such-tool') return laterCalls.some((c) => c.status === 'success');
  return laterCalls.some((c) => c.status === 'success' && c.name === call.name);
}

// The raw text is JSON nested inside JSON strings, so quotes arrive with any
// number of backslashes and newlines as literal "\n". These tolerate both and
// a message cut off mid-object.
const ESCAPED_QUOTE = String.raw`[\\"]+`;
const PROCEDURE_RE = new RegExp(String.raw`path${ESCAPED_QUOTE}\s*:\s*${ESCAPED_QUOTE}([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)`);
const ISSUE_CODE_RE = new RegExp(String.raw`code${ESCAPED_QUOTE}\s*:\s*${ESCAPED_QUOTE}([a-z_]+)`);
const ISSUE_PATH_RE = new RegExp(
  String.raw`path${ESCAPED_QUOTE}\s*:\s*\[(?:\s|\\+n)*${ESCAPED_QUOTE}([A-Za-z0-9_]+)`,
  'g',
);

/** The marker both reporters (chat route, tool canary) put on an output-schema failure. */
const OUTPUT_SCHEMA_RE = /output failed its schema/i;

/**
 * What a Mastra `{ error: true, message }` tool result means.
 *
 * Mastra returns two different failures in that same shape, both as a
 * "successful" result:
 *  - `output`: the tool ran and its answer failed the tool's own output
 *    schema. Ours to fix, and it fails on every call.
 *  - `input`: the MODEL sent arguments the tool's input schema rejects. The
 *    tool never ran; the model reads the message and retries. A slip, not a
 *    fault, and filing each one buries the real ones.
 * Treating every such result as `output` filed a bug that sent its reader to
 * the wrong schema (auto-filed ticket 968).
 */
export function mastraResultFault(message: string | undefined | null): 'output' | 'input' | 'other' {
  const text = (message ?? '').toLowerCase();
  if (text.includes('output validation failed')) return 'output';
  if (text.includes('input validation failed')) return 'input';
  return 'other';
}

/**
 * A short, stable line naming the fault: which tool, which app procedure,
 * which field. Stable matters more than complete: the Bug ticket's dedup
 * fingerprint is built from this text, so it must not carry ids or the query.
 *
 *   queryMeetingContextTool: mastra.queryMeetingContext rejected the request
 *   (invalid_type at workspaceId)
 */
export function summarizeToolError(toolName: string, message: string | undefined | null): string {
  const raw = message ?? '';
  const kind = classifyToolError(raw);
  const procedure = PROCEDURE_RE.exec(raw)?.[1];

  // The app answered; the answer is what is wrong. Said in those words so the
  // person fixing it looks at the tool's output schema, not at its request.
  if (OUTPUT_SCHEMA_RE.test(raw)) {
    return `${toolName}: ${procedure ?? 'the app'} answered, but the answer fails the tool's output schema`;
  }

  if (kind === 'contract') {
    const fields = new Set<string>();
    for (const match of raw.matchAll(ISSUE_PATH_RE)) {
      if (match[1]) fields.add(match[1]);
    }
    const code = ISSUE_CODE_RE.exec(raw)?.[1];
    const where = fields.size > 0 ? ` at ${[...fields].sort().join(', ')}` : '';
    const detail = code || where ? ` (${code ?? 'invalid input'}${where})` : '';
    return `${toolName}: ${procedure ?? 'the app'} rejected the request${detail}`;
  }

  if (kind === 'no-such-tool') {
    return `${toolName}: the assistant called a tool that does not exist`;
  }

  if (kind === 'server') {
    return `${toolName}: ${procedure ?? 'the app'} failed while handling the request`;
  }

  const firstLine = raw.split('\n')[0]?.trim() ?? '';
  return `${toolName}: ${firstLine.slice(0, 160) || 'failed with no message'}`;
}
