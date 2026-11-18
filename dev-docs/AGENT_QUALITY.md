# Agent quality

How we find, fix and prevent bad answers from the AI assistant. Read this before working on any report that a chat "went wrong", and before changing an agent tool, an agent prompt, or a procedure an agent tool calls.

The rule that everything here serves: **every incident leaves a check behind.** A fix without a check is half done.

## Why this exists

In November 2026 the assistant on a meeting page answered a question from the first 2,000 characters of a transcript, after its search tool had failed on every call for six months (ticket 957, `woody.spider`). The reply looked fine. No test, alert or ticket had noticed. The layers below are what was missing.

## When a chat goes wrong

### 1. Capture

- Thumbs-down the reply in the chat.
- Keep the page URL and one line on what you expected.
- A screenshot helps when the tool card shows a failed step.

### 2. Diagnose into one of four causes

Each cause has a different fix, so name it before fixing anything.

| Cause | What it looks like | Where the fix goes |
|---|---|---|
| **Broken tool** | A tool errored, or returned wrong or partial data | The tool (Mastra repo) or the procedure it calls (this repo) |
| **Missing ability** | No tool can do what was asked | A new tool or a new input on an existing one |
| **Missing context** | The agent did not know what the person was looking at | The page's `useRegisterPageContext` data and `formatPageContextData` in `ManyChat.tsx` |
| **Model behaviour** | Tools and context were right and the answer was still wrong | The agent's instructions (Mastra repo) or the chat prompt in `ManyChat.tsx` |

To find the cause, read the turn, not the reply:

- The `AiInteractionHistory` row has the tool calls, their status and the error text.
- An auto-filed ticket titled `agent-tool: …` or `agent-stream: …` may already exist. Search before filing.
- Mastra's logs: see "Handled app errors and agent failures" in `OBSERVABILITY.md`.

A reply can be wrong for two causes at once. Ticket 957 was a broken tool **and** a missing ability (no way to ask for one meeting) **and** model behaviour (concluding from a partial read). File one ticket and list each cause.

### 3. File one bug

Use `/to-bug`. Label it `agent-quality`. The body names the cause or causes from the table.

### 4. Fix it, and add a check at the cheapest layer that would have caught it

| Layer | Catches | Model needed | Where |
|---|---|---|---|
| Contract test | A tool sending a request the app would reject | No | `contracts/README.md` here; `docs/tool-contracts.md` in the Mastra repo |
| Unit test | Wrong logic in a tool, a procedure or a page's context | No | Beside the code |
| Tool canary | A tool that fails against a running app: auth, access, a renamed column, an output that fails its own schema | No | `docs/tool-canary.md` in the Mastra repo; `src/server/services/toolCanary/` here |
| Eval case | The agent choosing the wrong tool, or answering wrongly from good data | Yes | `src/mastra/evals/` in the Mastra repo; `scripts/eval-prompt.ts` here (ADR-0012, ADR-0013) |

Pick the first row that applies. A model-behaviour incident always becomes an eval case, because no other layer can see it.

### 5. Verify on a live model

Run a real chat before calling it done: "Running a real agent chat locally" in `AGENT_VISUAL_TESTING.md`. If you could not, say so in the PR in plain words.

## What reports problems without anyone asking

| Signal | What it does | Status |
|---|---|---|
| Broken-tool tickets | A tool call the app rejects, or whose output fails its schema, is filed as `agent-tool: <tool>: …` on first sight, one ticket per tool and fault (`src/lib/chat/toolErrors.ts`) | Live |
| Tool canary | Calls every read tool daily against a non-production app, files failures, posts to the ops room | Merged; off until a non-production target is configured |
| Daily agent-health digest | Posts the day's failed turns and most-failing tools to the ops room | Live |
| Thumbs-down with trace | A low rating posts to the ops room with a link to the full turn and tool trace | Merged (PR 1186, ticket 960 `bronze.tide`); first production post not yet confirmed |
| Golden eval set | 20 to 30 real questions graded on tool trajectory and on the answer | Ticket 961 `blue.arrow`, not started |
| Live smoke test on a capped dev key | One real agent turn, locally and in CI | Ticket 962 `loud.spruce`, in review; needs the key |

Update the Status column when one of these changes. A row that says "Live" must be true.

## Labels

Both are workspace labels in Exponential.

- **`agent-quality`**: the goal. Any work aimed at making the agents answer better: a bug, a test, a feedback loop, a prompt or tool fix.
- **`automated-testing`**: the mechanism. Any check that runs without a person: contract tests, canaries, evals, smoke tests. Not agent-specific.

A contract test for agent tools carries both. A bug in a tool carries `agent-quality` only. `mastra-agents` and `devops` already cover area and ownership; do not add finer labels such as `evals` or `canary`.

## Rules for changes that touch agents

- **Changing a procedure an agent tool calls:** regenerate the contract (`npm run contracts:generate`) and follow `contracts/README.md`. Date inputs use `z.coerce.date()`: Mastra sends dates as strings.
- **Adding or changing a tool:** it needs a contract case and, if it reads, a canary probe. Both suites fail without them.
- **A tool that returns part of something** (a truncated transcript, the first page of a list) says so in a field the model can read, with how to get the rest. The agent must never conclude "not found" or "not said" from a partial read.
- **A failed tool step** is shown to the person as one plain sentence. Raw error text goes to admins only.
- **Agent prompts** do not tell the model to announce tool failures or guess their cause. It answers when a fallback worked, and says what it could not check when that limits the answer.
- **Narration between tool calls** ("Let me look that up…") is handled by the chat, not the prompt: text written before the last tool call folds into the tool card (`splitTurnText` in `src/lib/chat/turnText.ts`). A "don't narrate" prompt rule made the Assistant create calendar events without asking (ticket 982, mastra PR 98), so do not add one.

## Related

- `OBSERVABILITY.md`: how errors become tickets and ops posts.
- `AGENT_VISUAL_TESTING.md`: running the app and a real chat locally.
- `KNOWLEDGE_BASE_RAG.md`: the search behind the meeting and knowledge tools.
- ADR-0012 and ADR-0013: the Thread judge and prompt replay.
