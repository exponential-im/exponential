/**
 * `mastra.createCalendarEvent` and repeating events (the German-practice
 * report of 2026-11-18): one event with a rule, never a rule silently dropped.
 *
 * Mocked Prisma via `createMockCaller`; harness mirrors `mastraTicketLabels.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

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

const createEvent = vi.fn();
vi.mock("~/server/services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/services")>()),
  getCalendarService: () => ({ createEvent }),
}));

import { createMockCaller } from "~/test/trpc-helpers";

const EVENT = {
  summary: "German speaking practice",
  start: { dateTime: "2026-11-18T07:30:00.000Z", timeZone: "Europe/Berlin" },
  end: { dateTime: "2026-11-18T07:50:00.000Z", timeZone: "Europe/Berlin" },
};
const RULE = "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR";

describe("mastra.createCalendarEvent recurrence", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    vi.clearAllMocks();
    createEvent.mockResolvedValue({ id: "e1", summary: EVENT.summary, htmlLink: "https://cal/e1" });
  });

  it("passes the rule and the zone through to the calendar", async () => {
    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await caller.mastra.createCalendarEvent({ ...EVENT, recurrence: [RULE] });

    expect(createEvent).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ recurrence: [RULE], start: EVENT.start }),
    );
  });

  it("sends no recurrence field for a single event", async () => {
    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await caller.mastra.createCalendarEvent(EVENT);

    expect(createEvent.mock.calls[0]?.[1]).not.toHaveProperty("recurrence");
  });

  it("refuses a repeating event with no zone: it would drift at every clock change", async () => {
    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await expect(
      caller.mastra.createCalendarEvent({
        ...EVENT,
        start: { dateTime: EVENT.start.dateTime },
        recurrence: [RULE],
      }),
    ).rejects.toThrow(/needs start.timeZone/);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("refuses a repeating event on Microsoft rather than creating a single one", async () => {
    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await expect(
      caller.mastra.createCalendarEvent({ ...EVENT, provider: "microsoft", recurrence: [RULE] }),
    ).rejects.toThrow(/only supported for Google/);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects anything that is not an RRULE line", async () => {
    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    await expect(
      caller.mastra.createCalendarEvent({ ...EVENT, recurrence: ["every monday; drop table"] }),
    ).rejects.toThrow();
  });
});
