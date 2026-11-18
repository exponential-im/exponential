/**
 * The chat system prompt in ManyChat.tsx must not invent tools (grand.fig).
 *
 * It used to carry a hand-written "Available tools:" list. One name on it,
 * `createAction`, was not a tool the assistant has, so the model called it,
 * failed, and retried with the real one: a red "failed" row above "Done!".
 * A whole Fireflies wizard told it to call five more that never existed.
 *
 * The model receives its real tools from Mastra. The prompt may point at a
 * few of them by id where that helps (which tool reads the page on screen),
 * and every such id is listed here. The list was checked by hand against the
 * Mastra repo's `main` on 2026-11-18; the Mastra repo's tool inventory is the
 * source of truth. Adding an id here means checking it exists there.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(join(__dirname, "..", "ManyChat.tsx"), "utf8");

/** Tool ids the prompt may reference. Each exists as `id: "<id>"` in the Mastra repo. */
const REAL_TOOL_IDS = new Set([
  "get-all-goals",
  "get-all-projects",
  "get-meeting-transcriptions",
  "query-meeting-context",
  "get-meeting-insights",
  "get-project-context",
  "get-project-actions",
  "list-tickets",
  "list-cycles",
  "add-ticket-dependencies",
]);

describe("ManyChat system prompt", () => {
  it("carries no hand-written list of available tools", () => {
    expect(SOURCE).not.toMatch(/Available tools:/i);
  });

  it("names none of the tools that never existed", () => {
    for (const phantom of [
      "createAction",
      "updateAction",
      "retrieveActions",
      "createGitHubIssue",
      "get_project_context",
      "firefliesCheckExisting",
      "firefliesTestApiKey",
      "firefliesCreateIntegration",
      "firefliesGenerateWebhookToken",
      "firefliesGetWebhookUrl",
    ]) {
      expect(SOURCE, `the prompt mentions "${phantom}"`).not.toMatch(new RegExp(`\\b${phantom}(Tool)?\\b`));
    }
  });

  it("references only tool ids that are on the checked list", () => {
    // How the prompt points at a tool: call/use/→ followed by a quoted or
    // backticked kebab-case id.
    const referenced = new Set<string>();
    const pattern = /(?:call(?: the)?|use|with|into|→)\s+\\?[`']([a-z]+(?:-[a-z]+)+)\\?[`']/g;
    for (const match of SOURCE.matchAll(pattern)) {
      if (match[1]) referenced.add(match[1]);
    }
    // Slash-separated pairs: `list-tickets\` / \`list-cycles`.
    for (const match of SOURCE.matchAll(/\/\s+\\?`([a-z]+(?:-[a-z]+)+)\\?`/g)) {
      if (match[1]) referenced.add(match[1]);
    }

    expect(referenced.size).toBeGreaterThan(4);
    for (const id of referenced) {
      expect(REAL_TOOL_IDS.has(id), `"${id}" is named in the prompt but is not on the checked list`).toBe(true);
    }
  });
});
