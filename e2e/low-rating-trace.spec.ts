/**
 * A thumbs-down on an agent reply reaches a person with the tool trace
 * attached (ticket bronze.tide).
 *
 * The whole path, in the real chat: a turn whose tool call the app rejected,
 * a 1-star rating, the post that lands in the ops room, and the admin trace
 * view that post links to. Then the access rule: the trace is refused to a
 * signed-in person who is not an admin.
 *
 * Mastra and the ops room (Matrix) are one stub started by this spec on the
 * port the dev server was told to use for both (playwright.config.ts). The
 * stub port is shared with the other `chromium-mastra-stub` specs, which run
 * one file at a time.
 *
 * See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import http from "node:http";
import type { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";
import { mintSessionCookie } from "../scripts/dev-fixture/session";
import { loadFixture, E2E_MASTRA_STUB_PORT } from "./fixture-data";

loadDevEnvOrThrow();

test.describe.configure({ mode: "serial" });

const fixture = loadFixture();
/** First hit on a `next dev` route pays the compile cost. */
const FIRST_PAINT_TIMEOUT = 60_000;
const APP_URL = `http://localhost:${process.env.E2E_PORT ?? "3100"}`;
const FIXTURE_EMAIL = "dev-fixture@exponential.test";
/** Unique to this spec, so its rows can be found and removed by a literal. */
const QUESTION = "bronze-tide-e2e: what did they say about the two user stories?";
const REPLY = "I could not find that in the meeting.";
const RUN_ID = "e2e-run-bronze-tide";
const RAW_TOOL_ERROR =
  'Request failed: 400 {"error":{"json":{"message":"[{\\"code\\":\\"invalid_type\\",\\"path\\":[\\"workspaceId\\"]}]","code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,"path":"mastra.queryMeetingContext"}}}}';

const sse = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\n\n`;

let db: PrismaClient;
let stub: http.Server;
let userId: string;
let wasAdmin = false;
const opsPosts: { body: string; formatted_body: string }[] = [];

/** Remove what this spec wrote, by the unique question text. Never by a captured id. */
async function cleanUp() {
  await db.feedback.deleteMany({ where: { aiInteraction: { userMessage: QUESTION } } });
  await db.aiInteractionHistory.deleteMany({ where: { userMessage: QUESTION } });
}

test.beforeAll(async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client();
  const user = await db.user.findUniqueOrThrow({
    where: { email: FIXTURE_EMAIL },
    select: { id: true, isAdmin: true },
  });
  userId = user.id;
  wasAdmin = user.isAdmin;
  await cleanUp();

  stub = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (part: Buffer) => (raw += part.toString()));
    req.on("end", () => {
      const url = req.url ?? "";
      if (req.method === "PUT" && url.startsWith("/_matrix/client/v3/rooms/")) {
        opsPosts.push(JSON.parse(raw) as { body: string; formatted_body: string });
        res.setHeader("content-type", "application/json");
        res.end('{"event_id":"$e2e"}');
        return;
      }
      if (req.method === "GET" && /^\/api\/agents\/?(\?|$)/.test(url)) {
        // The chat lists the agents and defaults to Zoe.
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ zoeAgent: { name: "Zoe", instructions: "E2E stub." } }));
        return;
      }
      if (!/^\/api\/agents\/[^/]+\/stream/.test(url)) {
        res.statusCode = 404;
        res.end("{}");
        return;
      }
      // One turn: the agent calls a tool, the app rejects the request (the
      // ticket 957 failure), and the agent answers around it.
      res.setHeader("content-type", "text/event-stream");
      res.write(
        sse({
          type: "tool-call",
          runId: RUN_ID,
          payload: { toolName: "queryMeetingContextTool", toolCallId: "call-1", args: { query: "user stories" } },
        }),
      );
      res.write(
        sse({
          type: "tool-error",
          runId: RUN_ID,
          payload: { toolName: "queryMeetingContextTool", toolCallId: "call-1", error: RAW_TOOL_ERROR },
        }),
      );
      res.write(sse({ type: "text-delta", runId: RUN_ID, payload: { text: REPLY } }));
      res.write(
        sse({
          type: "step-finish",
          runId: RUN_ID,
          payload: { stepResult: { reason: "stop" }, output: { usage: {} }, metadata: { modelId: "claude-sonnet-5-5" } },
        }),
      );
      res.write(sse({ type: "finish", runId: RUN_ID, payload: { stepResult: { reason: "stop" }, output: { usage: {} } } }));
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => stub.listen(E2E_MASTRA_STUB_PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
  await cleanUp();
  await db.user.update({ where: { email: FIXTURE_EMAIL }, data: { isAdmin: wasAdmin } });
  await db.$disconnect();
});

test("a 1-star rating in the chat posts once to the ops room, and the link opens the trace for an admin only", async ({
  page,
  browser,
}) => {
  const ticketsBefore = await db.ticket.count();

  // ── The turn, in the real chat drawer ────────────────────────────────
  // The chat routes to Zoe from the agent list; a message sent before the
  // list has loaded goes through AI agent selection instead, which needs OpenAI.
  const agentsLoaded = page.waitForResponse((r) => r.url().includes("mastra.getMastraAgents") && r.ok(), {
    timeout: FIRST_PAINT_TIMEOUT,
  });
  await page.goto(`/w/${fixture.workspaceSlug}/projects`);
  await page.getByRole("button", { name: "Open Zoe" }).click({ timeout: FIRST_PAINT_TIMEOUT });
  await agentsLoaded;
  const composer = page.getByPlaceholder("Ask anything");
  await composer.fill(QUESTION);
  await composer.press("Enter");
  await expect(page.getByText(REPLY)).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

  // The row the rating will point at carries what the trace needs.
  await expect
    .poll(async () => db.aiInteractionHistory.count({ where: { userMessage: QUESTION } }), { timeout: 15_000 })
    .toBe(1);
  const interaction = await db.aiInteractionHistory.findFirstOrThrow({
    where: { userMessage: QUESTION },
    select: { id: true, mastraRunId: true, pageContextType: true, toolCalls: true, systemUserId: true },
  });
  expect(interaction.systemUserId).toBe(userId);
  expect(interaction.mastraRunId).toBe(RUN_ID);
  expect(interaction.toolCalls).toMatchObject([
    { name: "queryMeetingContextTool", isError: true, errorKind: "contract" },
  ]);

  // ── The thumbs-down ──────────────────────────────────────────────────
  const startedAt = Date.now();
  await expect(page.getByText("Rate this response:")).toBeVisible();
  // Mantine's Rating keeps its radio inputs visually hidden; the star a
  // person clicks is the input's label (dispatched: the zero-star label overlaps it).
  const oneStar = await page.getByRole("radio", { name: "1", exact: true }).first().getAttribute("id");
  await page.locator(`label[for="${oneStar}"]`).dispatchEvent("click");
  await expect(page.getByRole("button", { name: "Wrong answer" })).toBeVisible();

  // One post, well inside a minute, carrying the link and no content.
  await expect.poll(() => opsPosts.length, { timeout: 60_000 }).toBe(1);
  expect(Date.now() - startedAt).toBeLessThan(60_000);
  const post = opsPosts[0]!;
  const tracePath = `/admin/feedback/trace/${interaction.id}`;
  expect(post.body).toContain("rated 1/5");
  expect(post.body).toContain("1 tool call, 1 failed: queryMeetingContextTool (contract)");
  expect(post.body).toContain(tracePath);
  expect(post.body + post.formatted_body).not.toContain("user stories");
  expect(post.body + post.formatted_body).not.toContain(REPLY);
  expect(post.body + post.formatted_body).not.toContain("invalid_type");

  // ── Why, in one tap, plus a note: stored on the same rating ──────────
  await page.getByRole("button", { name: "Wrong answer" }).click();
  await page.getByPlaceholder("Anything else? (optional)").fill("It said nothing was there.");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Thanks for your feedback!")).toBeVisible();
  await expect
    .poll(
      async () =>
        db.feedback.findMany({
          where: { aiInteractionId: interaction.id },
          select: { rating: true, content: true, metadata: true },
        }),
      { timeout: 15_000 },
    )
    .toMatchObject([
      { rating: 1, content: "It said nothing was there.", metadata: { reasons: ["wrong-answer"] } },
    ]);
  await page.screenshot({ path: test.info().outputPath("low-rating-reasons.png") });

  // The reason and the note did not post again, and no ticket was filed.
  expect(opsPosts).toHaveLength(1);
  expect(await db.ticket.count()).toBe(ticketsBefore);

  // ── Not an admin: the trace is refused, by the page and by the query ─
  await page.goto(tracePath);
  await expect(page).not.toHaveURL(/\/admin\//, { timeout: FIRST_PAINT_TIMEOUT });
  const refused = await page.request.get(
    `/api/trpc/feedback.getInteractionTrace?input=${encodeURIComponent(
      JSON.stringify({ json: { interactionId: interaction.id } }),
    )}`,
  );
  expect(refused.status()).toBe(403);
  expect(await refused.text()).not.toContain(QUESTION);

  // ── An admin follows the link from the post ──────────────────────────
  // The session token copies isAdmin when minted, so flip then mint.
  await db.user.update({ where: { email: FIXTURE_EMAIL }, data: { isAdmin: true } });
  const admin = await mintSessionCookie(db, { email: FIXTURE_EMAIL });
  const adminContext = await browser.newContext({ storageState: undefined });
  await adminContext.addCookies([
    { name: admin.cookieName, value: admin.cookieValue, url: APP_URL, httpOnly: true, sameSite: "Lax" },
  ]);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${APP_URL}${tracePath}`);
  await expect(adminPage.getByRole("heading", { name: "Turn trace" })).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
  await expect(adminPage.getByText(QUESTION)).toBeVisible();
  await expect(adminPage.getByText(REPLY)).toBeVisible();
  await expect(adminPage.getByText("queryMeetingContextTool", { exact: true })).toBeVisible();
  await expect(adminPage.getByText("failed · contract")).toBeVisible();
  await expect(adminPage.getByText(/^Request failed: 400 .*invalid_type/)).toBeVisible();
  await expect(adminPage.getByText("claude-sonnet-5-5")).toBeVisible();
  await expect(adminPage.getByText(RUN_ID, { exact: true })).toBeVisible();
  await expect(adminPage.getByText(new RegExp(`railway logs --service mastra .* \\| grep -B2 -A60 ${RUN_ID}`))).toBeVisible();
  await expect(adminPage.getByText("Wrong answer")).toBeVisible();
  await expect(adminPage.getByText("It said nothing was there.")).toBeVisible();

  // One action puts the turn forward for the eval set.
  await adminPage.getByRole("button", { name: "Promote to eval candidate" }).click();
  await expect(adminPage.getByRole("button", { name: "Remove from eval candidates" })).toBeVisible();
  await adminPage.screenshot({ path: test.info().outputPath("turn-trace.png"), fullPage: true });
  await adminContext.close();
});
