import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// `createCaller` imports the whole router tree; seed what it reads at load.
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {},
}));
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

const notifyLowRating = vi.hoisted(() => vi.fn(async () => true));
vi.mock("~/server/services/feedback/lowRatingAlert", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/services/feedback/lowRatingAlert")>()),
  notifyLowRating,
}));
// No mock for runAfterResponse: outside a request `after()` throws and the
// helper starts the task at once, so the call below is already made.

import { createMockCaller } from "~/test/trpc-helpers";

const db = mockDeep<PrismaClient>();
const USER = "user-1";

function asUser(isAdmin = false) {
  return createMockCaller({ userId: USER, db, isAdmin });
}

describe("feedback.submitAgentFeedback", () => {
  beforeEach(() => {
    mockReset(db);
    notifyLowRating.mockClear();
    db.aiInteractionHistory.findUnique.mockResolvedValue({ systemUserId: USER } as never);
    db.feedback.findFirst.mockResolvedValue(null);
    db.feedback.create.mockResolvedValue({ id: "fb-1" } as never);
    db.feedback.update.mockResolvedValue({ id: "fb-1" } as never);
  });

  it("posts a low rating to the ops room once and files no ticket", async () => {
    await asUser().feedback.submitAgentFeedback({ aiInteractionId: "ix-1", rating: 1 });

    expect(notifyLowRating).toHaveBeenCalledTimes(1);
    expect(notifyLowRating).toHaveBeenCalledWith(db, "fb-1");
    const created = db.feedback.create.mock.calls[0]?.[0].data;
    expect(created?.rating).toBe(1);
    expect((created?.metadata as Record<string, unknown>).opsNotifiedAt).toEqual(expect.any(String));
    expect(db.ticket.create).not.toHaveBeenCalled();
    expect(db.featureRequest.create).not.toHaveBeenCalled();
  });

  it("stores the reasons and note on the same rating without a second post", async () => {
    db.feedback.findFirst.mockResolvedValue({
      id: "fb-1",
      content: "",
      metadata: { opsNotifiedAt: "2026-11-17T10:00:00.000Z" },
    } as never);

    await asUser().feedback.submitAgentFeedback({
      aiInteractionId: "ix-1",
      rating: 1,
      reasons: ["wrong-answer", "too-slow"],
      comment: "It made up a quote.",
    });

    expect(db.feedback.create).not.toHaveBeenCalled();
    const updated = db.feedback.update.mock.calls[0]?.[0];
    expect(updated?.where).toEqual({ id: "fb-1" });
    expect(updated?.data.content).toBe("It made up a quote.");
    expect(updated?.data.metadata).toMatchObject({
      reasons: ["wrong-answer", "too-slow"],
      opsNotifiedAt: "2026-11-17T10:00:00.000Z",
    });
    expect(notifyLowRating).not.toHaveBeenCalled();
  });

  it("does not post for a good rating", async () => {
    await asUser().feedback.submitAgentFeedback({ aiInteractionId: "ix-1", rating: 4 });
    expect(notifyLowRating).not.toHaveBeenCalled();
  });

  it("refuses a rating on someone else's reply", async () => {
    db.aiInteractionHistory.findUnique.mockResolvedValue({ systemUserId: "someone-else" } as never);
    await expect(
      asUser().feedback.submitAgentFeedback({ aiInteractionId: "ix-1", rating: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.feedback.create).not.toHaveBeenCalled();
    expect(notifyLowRating).not.toHaveBeenCalled();
  });

  it("rejects a reason that is not one of the offered ones", async () => {
    await expect(
      asUser().feedback.submitAgentFeedback({
        aiInteractionId: "ix-1",
        rating: 1,
        reasons: ["made-up"] as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("feedback.getInteractionTrace", () => {
  beforeEach(() => mockReset(db));

  it("is refused to a signed-in person who is not an admin", async () => {
    await expect(asUser(false).feedback.getInteractionTrace({ interactionId: "ix-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.aiInteractionHistory.findUnique).not.toHaveBeenCalled();
  });

  it("gives an admin the turn, the tool trace and the logs command", async () => {
    db.aiInteractionHistory.findUnique.mockResolvedValue({
      id: "ix-1",
      createdAt: new Date("2026-11-17T12:00:00.000Z"),
      platform: "manychat",
      agentId: "zoe",
      agentName: null,
      model: "claude-sonnet-5-5",
      conversationId: "c-1",
      workspaceId: "w-1",
      pageContextType: "meeting",
      mastraRunId: "run-abc",
      anthropicRequestId: null,
      promptVersion: null,
      responseTime: 4200,
      hadError: true,
      errorMessage: null,
      userMessage: "What did they say?",
      aiResponse: "Nothing found.",
      toolCalls: [{ name: "queryMeetingContextTool", args: "{}", isError: true, errorCode: "Request failed: 400", errorKind: "contract" }],
      user: { name: "Ada", email: "ada@test.com" },
      feedback: [
        {
          id: "fb-1",
          rating: 1,
          content: "wrong",
          metadata: { reasons: ["wrong-answer"], evalCandidateAt: "2026-11-17T13:00:00.000Z" },
          createdAt: new Date("2026-11-17T12:05:00.000Z"),
          user: { name: "Ada", email: "ada@test.com" },
        },
      ],
    } as never);

    const trace = await asUser(true).feedback.getInteractionTrace({ interactionId: "ix-1" });

    expect(trace.model).toBe("claude-sonnet-5-5");
    expect(trace.pageContextType).toBe("meeting");
    expect(trace.toolCalls).toMatchObject([{ name: "queryMeetingContextTool", status: "failed", errorKind: "contract" }]);
    expect(trace.mastraLogsCommand).toBe(
      "railway logs --service mastra --since 2026-11-17T11:58:00.000Z --until 2026-11-17T12:02:00.000Z -n 5000 | grep -B2 -A60 run-abc",
    );
    expect(trace.ratings).toMatchObject([{ rating: 1, reasons: ["wrong-answer"], note: "wrong", isEvalCandidate: true }]);
    expect(trace.faultTickets).toEqual([]);
  });
});

describe("feedback.setEvalCandidate", () => {
  beforeEach(() => mockReset(db));

  it("is admin only", async () => {
    await expect(asUser(false).feedback.setEvalCandidate({ feedbackId: "fb-1", candidate: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("flags the rating and keeps the rest of its metadata", async () => {
    db.feedback.findUnique.mockResolvedValue({ id: "fb-1", feature: "agent_response", metadata: { reasons: ["too-slow"] } } as never);
    db.feedback.update.mockResolvedValue({} as never);
    await asUser(true).feedback.setEvalCandidate({ feedbackId: "fb-1", candidate: true });
    expect(db.feedback.update.mock.calls[0]?.[0].data.metadata).toMatchObject({
      reasons: ["too-slow"],
      evalCandidateAt: expect.any(String) as string,
      evalCandidateBy: USER,
    });
  });
});
