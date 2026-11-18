/**
 * A finished chat turn leaves one summary line above its answer, not a
 * stack of "Let me…" narration (ticket 982, rapid.drift).
 *
 * The turn is the German-slots chat that prompted the ticket, replayed into
 * the real drawer: `/api/chat/stream` is answered in the browser with the
 * wire protocol the route sends (text interleaved with `__exp_tool__` frames),
 * so no Mastra, model or database row is involved. What it checks is the
 * client: the parser's answer offset, `splitTurnText`, and the folded
 * `ToolActivity` card. The one stub on the shared Mastra stub port only lists
 * the agents, so the drawer routes to Zoe without AI agent selection.
 *
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import http from "node:http";
import { loadFixture, E2E_MASTRA_STUB_PORT } from "./fixture-data";

const fixture = loadFixture();
let stub: http.Server;

test.beforeAll(async () => {
  stub = http.createServer((req, res) => {
    if (req.method === "GET" && /^\/api\/agents\/?(\?|$)/.test(req.url ?? "")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ zoeAgent: { name: "Zoe", instructions: "E2E stub." } }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => stub.listen(E2E_MASTRA_STUB_PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});
/** First hit on a `next dev` route pays the compile cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

const toolFrames = (id: string, name: string) =>
  `\n__exp_tool__:${JSON.stringify({ phase: "call", id, name, args: {} })}\n` +
  `\n__exp_tool__:${JSON.stringify({ phase: "result", id, name })}\n`;

const NARRATION = "Let me get your today's actions to find that German speaking task:";
const ANSWER = "German speaking practice: one recurring event, 08:30–08:50 every Monday, Wednesday and Friday. Create it?";

// The route starts each text block after a tool call on a new paragraph.
const TURN =
  "I'll help you set up those German speaking slots." +
  toolFrames("t1", "toolSearch") +
  "\n\n" +
  NARRATION +
  toolFrames("t2", "getTodaysActionsTool") +
  "\n\n" +
  "Perfect! I found your action. Your calendar is connected." +
  toolFrames("t3", "checkCalendarConnectionTool") +
  toolFrames("t4", "toolSearch") +
  "\n\n" +
  ANSWER;

test("a finished turn folds its steps and narration into one line above the answer", async ({ page }) => {
  await page.route("**/api/chat/stream", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: TURN }),
  );

  // A message sent before the agent list loads goes through AI agent
  // selection, which needs OpenAI; wait for the list first.
  const agentsLoaded = page.waitForResponse((r) => r.url().includes("mastra.getMastraAgents") && r.ok(), {
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  await page.getByRole("button", { name: "Open Zoe" }).click({ timeout: FIRST_PAINT_TIMEOUT });
  await agentsLoaded;

  const composer = page.getByPlaceholder("Ask anything");
  await composer.fill("rapid-drift-e2e: set up German speaking slots Mon/Wed/Fri at 8:30");
  await composer.press("Enter");

  // The answer is the text after the last tool call, and nothing else.
  await expect(page.getByText(ANSWER)).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  // The folded card keeps its contents mounted at zero height, so "hidden"
  // here means out of sight, not out of the DOM.
  await expect(page.getByText(NARRATION)).not.toBeInViewport();
  await expect(page.getByText(/I'll help you set up/)).not.toBeInViewport();

  // One summary row: two visible steps, tool search never shown.
  const summary = page.getByRole("button", { name: "Used 2 tools" });
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText(/Tool search/i)).toHaveCount(0);
  await test.info().attach("folded", { body: await page.screenshot(), contentType: "image/png" });

  // Opening it shows the steps and what the agent wrote along the way.
  await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Fetched today's tasks")).toBeInViewport();
  await expect(page.getByText(NARRATION)).toBeInViewport();
  await expect(page.getByText(/Tool search/i)).toHaveCount(0);
  await page.waitForTimeout(400); // let the Collapse finish opening for the screenshot
  await test.info().attach("opened", { body: await page.screenshot(), contentType: "image/png" });
});
