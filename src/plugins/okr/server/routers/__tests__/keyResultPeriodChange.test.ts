/**
 * Moving a key result to another period — okr.update (the UI, SDK and MCP)
 * and mastra.updateOkrKeyResult (the assistant).
 *
 * External behavior under test:
 * - `period` is written when it changes, and the explicit periodStart /
 *   periodEnd range set at creation is cleared because it describes the old
 *   period.
 * - An unchanged or absent period writes neither.
 * - A malformed period is refused before anything is read or written.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import { createMockCaller } from "~/test/trpc-helpers";
import { periodChangeData } from "~/plugins/okr/server/keyResultPeriod";

const OWNER_ID = "user-owner";
const KR_ID = "kr-1";

// A personal key result: the owner can always edit it, so access needs no
// workspace or team stubs and the tests stay about the period.
const KR_ROW = {
  id: KR_ID,
  userId: OWNER_ID,
  driUserId: OWNER_ID,
  workspaceId: null,
  goalId: 42,
  title: "Grow weekly actives to 500",
  targetValue: 500,
  currentValue: 120,
  status: "on-track",
  confidence: null,
  period: "Q4-2026",
  periodStart: new Date("2026-10-01"),
  periodEnd: new Date("2026-12-31"),
};

describe("periodChangeData", () => {
  const NOW = new Date("2026-11-18T12:00:00Z");

  it("clears the explicit range only when the period actually moves", () => {
    expect(periodChangeData("Q4-2026", "Q1-2027", NOW)).toEqual({
      periodStart: null,
      periodEnd: null,
    });
    expect(periodChangeData("Q4-2026", "Q4-2026", NOW)).toEqual({});
    expect(periodChangeData("Q4-2026", undefined, NOW)).toEqual({});
  });

  it("allows a move from last year through two years ahead", () => {
    for (const period of ["Q1-2025", "Annual-2026", "H2-2028"]) {
      expect(periodChangeData("Q4-2026", period, NOW)).toEqual({
        periodStart: null,
        periodEnd: null,
      });
    }
  });

  it.each(["Q1-2206", "Q4-2024", "Annual-2029", "Annual-0999"])(
    "refuses a move to %s, outside the reachable years",
    (period) => {
      expect(() => periodChangeData("Q4-2026", period, NOW)).toThrow(
        expect.objectContaining({ code: "BAD_REQUEST" }) as unknown as Error,
      );
    },
  );

  it("never range-checks an unchanged period, however old", () => {
    expect(periodChangeData("Q2-2019", "Q2-2019", NOW)).toEqual({});
  });
});

describe.each([
  {
    name: "okr.update",
    update: (
      caller: ReturnType<typeof createMockCaller>,
      input: { id: string; period?: string; title?: string },
    ) => caller.okr.update(input),
  },
  {
    name: "mastra.updateOkrKeyResult",
    update: (
      caller: ReturnType<typeof createMockCaller>,
      input: { id: string; period?: string; title?: string },
    ) => caller.mastra.updateOkrKeyResult(input),
  },
])("$name — changing the period", ({ update }) => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    // The reachable-year window is relative to now; pin it so the cases
    // below mean the same thing every year.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
    db = getDbMock();
    mockReset(db);
    db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
    db.keyResult.update.mockImplementation((async (args: {
      data: Record<string, unknown>;
    }) => ({
      ...KR_ROW,
      ...args.data,
      goal: { id: 42, title: "Grow the product" },
    })) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves the key result and clears the stale range", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await update(caller, { id: KR_ID, period: "Q1-2027" });

    expect(db.keyResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: KR_ID },
        data: expect.objectContaining({
          period: "Q1-2027",
          periodStart: null,
          periodEnd: null,
        }) as unknown,
      }),
    );
  });

  it("leaves the range alone when the period is resent unchanged", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await update(caller, { id: KR_ID, period: "Q4-2026", title: "Renamed" });

    const data = db.keyResult.update.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty("periodStart");
    expect(data).not.toHaveProperty("periodEnd");
  });

  it("does not touch the period when none is passed", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await update(caller, { id: KR_ID, title: "Renamed" });

    const data = db.keyResult.update.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty("period");
    expect(data).not.toHaveProperty("periodStart");
  });

  it("refuses a move to a year nobody can reach, without writing", async () => {
    const caller = createMockCaller({ userId: OWNER_ID, db });

    await expect(
      update(caller, { id: KR_ID, period: "Q1-2206" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.keyResult.update).not.toHaveBeenCalled();
  });

  it.each(["Q5-2026", "2027-Q1", "Annual 2027", ""])(
    "refuses the malformed period %j before reading or writing",
    async (period) => {
      const caller = createMockCaller({ userId: OWNER_ID, db });

      await expect(update(caller, { id: KR_ID, period })).rejects.toMatchObject(
        { code: "BAD_REQUEST" },
      );
      expect(db.keyResult.findFirst).not.toHaveBeenCalled();
      expect(db.keyResult.update).not.toHaveBeenCalled();
    },
  );
});
