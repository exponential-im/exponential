/**
 * The two app procedures behind the agent's meeting tools (woody.spider):
 *
 *  - `mastra.queryMeetingContext` searches Meetings the caller can VIEW (not
 *    only ones whose chunks carry their userId), and can search inside one
 *    Meeting by id.
 *  - `mastra.getMeetingTranscriptions` can fetch one Meeting by id, and says
 *    "not found" rather than returning an empty list the agent would read as
 *    "no meetings".
 *
 * Mocked Prisma via `createMockCaller`; harness mirrors `mastraTicketLabels.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

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
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

const searchMock = vi.fn();
vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({ search: searchMock }),
  KnowledgeService: { formatForAIContext: () => "" },
}));

import { buildTranscriptionAccessWhere } from "~/server/services/access";
import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";
const WS = "ws-1";

describe("mastra meeting tools (woody.spider)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    vi.clearAllMocks();
    searchMock.mockResolvedValue([]);
    dbMock.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WS } as never);
  });

  describe("queryMeetingContext", () => {
    it("still requires a workspace: the scope is not optional", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        // @ts-expect-error — the missing field is the point of the test.
        caller.mastra.queryMeetingContext({ query: "user stories" }),
      ).rejects.toThrow(/workspaceId/);
      expect(searchMock).not.toHaveBeenCalled();
    });

    it("searches Meetings the caller can view, not only chunks they indexed", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.mastra.queryMeetingContext({ query: "user stories", workspaceId: WS });

      expect(searchMock).toHaveBeenCalledWith(
        "user stories",
        expect.objectContaining({
          workspaceId: WS,
          userId: USER_ID,
          userIdExemptSourceTypes: ["transcription"],
          transcriptionViewerId: USER_ID,
          sourceId: undefined,
        }),
      );
    });

    it("searches inside one Meeting when given its id", async () => {
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.mastra.queryMeetingContext({
        query: "user stories",
        workspaceId: WS,
        transcriptionId: "meeting-1",
        // Ignored: a single Meeting is by definition a transcription search.
        sourceTypes: ["page"],
      });

      expect(searchMock).toHaveBeenCalledWith(
        "user stories",
        expect.objectContaining({ sourceId: "meeting-1", sourceTypes: ["transcription"] }),
      );
    });

    it("refuses a workspace the caller is not in", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);
      dbMock.teamUser.findFirst.mockResolvedValue(null);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await expect(
        caller.mastra.queryMeetingContext({ query: "x", workspaceId: "ws-other" }),
      ).rejects.toThrow(/Workspace not found or access denied/);
      expect(searchMock).not.toHaveBeenCalled();
    });
  });

  describe("getMeetingTranscriptions", () => {
    const MEETING = {
      id: "meeting-1",
      title: "Daily Standup",
      transcription: "x".repeat(50_000),
      createdAt: new Date("2026-11-16T09:00:00Z"),
      meetingDate: new Date("2026-11-16T09:00:00Z"),
      projectId: null,
      summary: "Standup",
    };

    it("fetches one Meeting by id, whole, behind the access rule", async () => {
      dbMock.transcriptionSession.findMany.mockResolvedValue([MEETING] as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      const result = await caller.mastra.getMeetingTranscriptions({
        workspaceId: WS,
        transcriptionId: "meeting-1",
      });

      const where = dbMock.transcriptionSession.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toEqual({
        AND: [
          buildTranscriptionAccessWhere(USER_ID),
          { id: "meeting-1" },
          { OR: [{ workspaceId: WS }, { workspaceId: null }] },
        ],
      });
      // The app never cuts the transcript; how much the model reads is the tool's call.
      expect(result.transcriptions[0]?.transcript).toHaveLength(50_000);
    });

    it("says not found for an id the caller cannot see, rather than an empty list", async () => {
      dbMock.transcriptionSession.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await expect(
        caller.mastra.getMeetingTranscriptions({ transcriptionId: "meeting-secret" }),
      ).rejects.toThrow(/Meeting not found or access denied/);
    });

    it("an empty list stays an empty list when no id was asked for", async () => {
      dbMock.transcriptionSession.findMany.mockResolvedValue([]);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await expect(caller.mastra.getMeetingTranscriptions({})).resolves.toEqual({
        transcriptions: [],
        total: 0,
      });
    });
  });
});
