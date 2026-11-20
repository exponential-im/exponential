/**
 * Pins the behaviour of the two Key-result check-in procedures before they
 * share one service (ticket happy.spire, Pillar metrics PRD):
 *
 * - `okr.checkIn` (the UI path) and `mastra.checkInOkrKeyResult` (the agent
 *   path) both write the check-in row and the KR's new value and auto status
 *   in one transaction, with the same progress thresholds, and never touch
 *   the manual `statusOverride` (ADR-0004).
 * - Only `okr.checkIn` schedules the goal-health recompute after the
 *   response and records a `checked_in` activity event.
 *
 * Mocked Prisma (CLAUDE.md "Test database safety"); the goal-health
 * recompute and the after-response scheduler are mocked so the test sees
 * what was scheduled, not the recompute itself.
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

const scheduled = vi.hoisted(() => ({ labels: [] as string[] }));
vi.mock("~/server/utils/runAfterResponse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/utils/runAfterResponse")>();
  return {
    ...actual,
    runAfterResponseReported: vi.fn((label: string) => {
      scheduled.labels.push(label);
    }),
  };
});

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

const OWNER_ID = "user-owner";
const WORKSPACE_ID = "ws-1";
const KR_ID = "kr-1";

const KR_ROW = {
  id: KR_ID,
  userId: OWNER_ID,
  workspaceId: WORKSPACE_ID,
  goalId: 42,
  title: "Reach 100 customers",
  startValue: 0,
  targetValue: 100,
  currentValue: 20,
  status: "off-track",
  statusOverride: "on-track",
};

let db: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  db = getDbMock();
  mockReset(db);
  scheduled.labels = [];
  db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE_ID } as never);
  db.teamUser.findFirst.mockResolvedValue(null as never);
  db.keyResult.findFirst.mockResolvedValue(KR_ROW as never);
  db.keyResultCheckIn.create.mockResolvedValue({
    id: "checkin-1",
    previousValue: 20,
    newValue: 0,
    notes: null,
    createdAt: new Date("2026-11-20T10:00:00Z"),
  } as never);
  db.keyResult.update.mockResolvedValue({ ...KR_ROW } as never);
  db.workspaceActivityEvent.create.mockResolvedValue({ id: "evt-1" } as never);
  db.$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: PrismaClient) => unknown)(db)
      : Promise.all(arg as Promise<unknown>[])) as never);
});

type CheckIn = (caller: ReturnType<typeof createMockCaller>, newValue: number) => Promise<unknown>;

const paths: [string, CheckIn][] = [
  ["okr.checkIn", (caller, newValue) => caller.okr.checkIn({ keyResultId: KR_ID, newValue, notes: "n" })],
  [
    "mastra.checkInOkrKeyResult",
    (caller, newValue) => caller.mastra.checkInOkrKeyResult({ keyResultId: KR_ID, newValue, notes: "n" }),
  ],
];

describe.each(paths)("%s", (_name, checkIn) => {
  it.each([
    [100, "achieved"],
    [120, "achieved"],
    [70, "on-track"],
    [40, "at-risk"],
    [39, "off-track"],
  ])("a value of %s on a 0→100 KR sets the auto status to %s", async (newValue, status) => {
    await checkIn(createMockCaller({ userId: OWNER_ID, db }), newValue);
    expect(db.keyResult.update).toHaveBeenCalledWith({
      where: { id: KR_ID },
      data: { currentValue: newValue, status },
    });
  });

  it("reads a KR with no range (target equals start) as off-track", async () => {
    db.keyResult.findFirst.mockResolvedValue({ ...KR_ROW, startValue: 5, targetValue: 5 } as never);
    await checkIn(createMockCaller({ userId: OWNER_ID, db }), 50);
    expect(db.keyResult.update).toHaveBeenCalledWith({
      where: { id: KR_ID },
      data: { currentValue: 50, status: "off-track" },
    });
  });

  it("writes the check-in row and the KR update in one transaction, leaving statusOverride alone", async () => {
    await checkIn(createMockCaller({ userId: OWNER_ID, db }), 70);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.keyResultCheckIn.create).toHaveBeenCalledWith({
      data: {
        keyResultId: KR_ID,
        previousValue: 20,
        newValue: 70,
        notes: "n",
        createdById: OWNER_ID,
      },
    });
    const update = db.keyResult.update.mock.calls[0]![0]!;
    expect(update.data).not.toHaveProperty("statusOverride");
  });

  it("refuses a viewer without writing anything", async () => {
    db.workspaceUser.findUnique.mockResolvedValue({ role: "viewer", workspaceId: WORKSPACE_ID } as never);
    await expect(checkIn(createMockCaller({ userId: OWNER_ID, db }), 70)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.keyResultCheckIn.create).not.toHaveBeenCalled();
  });
});

describe("okr.checkIn side effects", () => {
  it("schedules the goal-health recompute and records one checked_in activity event", async () => {
    await createMockCaller({ userId: OWNER_ID, db }).okr.checkIn({ keyResultId: KR_ID, newValue: 70 });
    expect(scheduled.labels).toEqual(["keyResult.checkIn.goalHealth"]);
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
    expect(db.workspaceActivityEvent.create.mock.calls[0]![0]!.data).toMatchObject({
      entityType: "key_result",
      action: "checked_in",
      entityId: "checkin-1",
    });
  });

  it("returns the check-in row", async () => {
    await expect(
      createMockCaller({ userId: OWNER_ID, db }).okr.checkIn({ keyResultId: KR_ID, newValue: 70 }),
    ).resolves.toMatchObject({ id: "checkin-1" });
  });
});

describe("mastra.checkInOkrKeyResult side effects", () => {
  it("looks the KR up by owner, and schedules no goal-health recompute and no activity event", async () => {
    await createMockCaller({ userId: OWNER_ID, db }).mastra.checkInOkrKeyResult({
      keyResultId: KR_ID,
      newValue: 70,
    });
    expect(db.keyResult.findFirst).toHaveBeenCalledWith({ where: { id: KR_ID, userId: OWNER_ID } });
    expect(scheduled.labels).toEqual([]);
    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
  });

  it("returns the check-in and the updated KR in the agent's shape", async () => {
    await expect(
      createMockCaller({ userId: OWNER_ID, db }).mastra.checkInOkrKeyResult({ keyResultId: KR_ID, newValue: 70 }),
    ).resolves.toEqual({
      checkIn: {
        id: "checkin-1",
        previousValue: 20,
        newValue: 0,
        notes: null,
        createdAt: "2026-11-20T10:00:00.000Z",
      },
      keyResult: {
        id: KR_ID,
        title: KR_ROW.title,
        currentValue: 20,
        targetValue: 100,
        status: "off-track",
      },
    });
  });
});
