/**
 * Foreign keys taken from the input and never checked against the caller
 * (ticket calm.daisy). Found during the viewer write audit; none of these is a
 * viewer path. Each let someone who may legitimately write in one place attach
 * to, or write into, something they have no access to:
 *
 * - `project.create` wrote `teamId`, `driId`, `goalIds` and `keyResultIds` as
 *   given;
 * - `goal.createGoal`, and the `createGoal` service the Assistant uses, took
 *   `driUserId` and `projectId` the same way;
 * - `okr.updateLinkedProjects` linked any project ids, where `okr.linkProject`
 *   asks for edit access to the one it links;
 * - `mastra.unlinkProjectFromKeyResult` did not ask for edit access to the
 *   project, where `okr.unlinkProject` does;
 * - `mastra.recordChannelSummary` was open to any signed-in user.
 *
 * Each block checks that a caller without access is refused and nothing is
 * written, and that a caller with access still goes through to the write.
 * Mocked Prisma, same harness as `viewerWriteAudit.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
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
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = {
  current: null,
};
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
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
import { createGoal } from "~/server/services/goalService";
import type { Context } from "~/server/auth/types";

const callerId = "user-1";
const colleagueId = "user-2";
/** Someone who shares no workspace with the caller. */
const strangerId = "user-9";
const workspaceId = "ws-1";
/** A workspace the caller does not belong to. */
const foreignWorkspaceId = "ws-2";
/** A workspace the caller belongs to as a `viewer`. */
const viewedWorkspaceId = "ws-3";

type Role = "owner" | "admin" | "member" | "viewer";
type Db = DeepMockProxy<PrismaClient>;

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
}

/** Fresh mock, with both `$transaction` forms settling against it. */
function resetDb(): Db {
  const dbMock = getDbMock();
  mockReset(dbMock);
  dbMock.$transaction.mockImplementation(((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(dbMock)
      : Promise.all(arg as Promise<unknown>[])) as never);
  return dbMock;
}

/**
 * Direct WorkspaceUser rows, as `[userId, workspaceId, role]`. Anyone not
 * listed is outside that workspace. The default is the world every block
 * starts from: the caller and a colleague write in `ws-1`, the caller only
 * views `ws-3`, and nobody here is in `ws-2`.
 */
function stubMemberships(
  db: Db,
  rows: Array<[string, string, Role]> = [
    [callerId, workspaceId, "member"],
    [colleagueId, workspaceId, "member"],
    [callerId, viewedWorkspaceId, "viewer"],
  ],
) {
  db.workspaceUser.findUnique.mockImplementation(((args: {
    where: { userId_workspaceId: { userId: string; workspaceId: string } };
  }) => {
    const key = args.where.userId_workspaceId;
    const row = rows.find(([u, w]) => u === key.userId && w === key.workspaceId);
    return Promise.resolve(row ? { role: row[2], workspaceId: row[1] } : null);
  }) as never);
  db.teamUser.findFirst.mockResolvedValue(null as never);
}

const projectIn = (id: string, inWorkspaceId: string) => ({
  id,
  name: id,
  createdById: colleagueId,
  teamId: null,
  workspaceId: inWorkspaceId,
  isPublic: false,
  isRestricted: false,
});

/** A project in the caller's workspace: a member there can edit it. */
const OWN_PROJECT = projectIn("project-own", workspaceId);
/** A project in a workspace the caller is not in. */
const FOREIGN_PROJECT = projectIn("project-foreign", foreignWorkspaceId);
/** A project in a workspace the caller only views. */
const VIEWED_PROJECT = projectIn("project-viewed", viewedWorkspaceId);

function stubProjects(db: Db) {
  const projects = [OWN_PROJECT, FOREIGN_PROJECT, VIEWED_PROJECT];
  db.project.findUnique.mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve(projects.find((p) => p.id === args.where.id) ?? null)) as never);
  db.projectMember.findFirst.mockResolvedValue(null as never);
}

const goalIn = (id: number, inWorkspaceId: string | null, ownerId = colleagueId) => ({
  id,
  title: `Goal ${id}`,
  status: "active",
  userId: ownerId,
  driUserId: null,
  workspaceId: inWorkspaceId,
  parentGoalId: null,
});

const keyResultIn = (id: string, inWorkspaceId: string | null, ownerId = colleagueId) => ({
  id,
  title: id,
  userId: ownerId,
  workspaceId: inWorkspaceId,
  goalId: 7,
});

// ── project.create ────────────────────────────────────────────────────

describe("project.create foreign keys (mocked)", () => {
  const input = { name: "New project", status: "ACTIVE", priority: "NONE" };
  let db: Db;

  beforeEach(() => {
    db = resetDb();
    stubMemberships(db);
    db.project.findFirst.mockResolvedValue(null);
    db.project.create.mockResolvedValue({ id: "project-new", name: "New project", workspaceId: null } as never);
    db.project.update.mockResolvedValue({ id: "project-new" } as never);
    db.keyResultProject.createMany.mockResolvedValue({ count: 1 } as never);
  });

  const create = (extra: Record<string, unknown>) =>
    createMockCaller({ userId: callerId, db }).project.create({ ...input, ...extra });

  const expectNothingWritten = () => {
    expect(db.project.create).not.toHaveBeenCalled();
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.keyResultProject.createMany).not.toHaveBeenCalled();
  };

  describe("teamId", () => {
    it("refuses a team the caller is not in and writes nothing", async () => {
      db.teamUser.findUnique.mockResolvedValue(null as never);

      expect(await errorCode(create({ teamId: "team-other" }))).toBe("FORBIDDEN");
      expectNothingWritten();
    });

    it("files the project under a team the caller belongs to", async () => {
      db.teamUser.findUnique.mockResolvedValue({ role: "member", teamId: "team-1" } as never);

      await create({ teamId: "team-1" });

      expect(db.project.create.mock.calls[0]?.[0].data).toMatchObject({ teamId: "team-1" });
    });
  });

  describe("driId", () => {
    it("refuses a DRI who is not in the project's workspace and writes nothing", async () => {
      expect(await errorCode(create({ workspaceId, driId: strangerId }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("accepts a DRI picked from the workspace's members", async () => {
      await create({ workspaceId, driId: colleagueId });

      expect(db.project.create.mock.calls[0]?.[0].data).toMatchObject({ driId: colleagueId });
    });

    it("refuses anyone but the caller as DRI of a project with no workspace", async () => {
      // No workspace means no roster to check the name against: the colleague
      // could not even open the project they would be accountable for.
      expect(await errorCode(create({ driId: colleagueId }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("lets the caller name themself DRI of a project with no workspace", async () => {
      await create({ driId: callerId });

      expect(db.project.create.mock.calls[0]?.[0].data).toMatchObject({ driId: callerId });
      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("goalIds", () => {
    it("refuses a goal in a workspace the caller is not in and writes nothing", async () => {
      db.goal.findMany.mockResolvedValue([goalIn(7, foreignWorkspaceId)] as never);

      expect(await errorCode(create({ goalIds: ["7"] }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("refuses a goal in a workspace the caller only views", async () => {
      db.goal.findMany.mockResolvedValue([goalIn(7, viewedWorkspaceId, callerId)] as never);

      expect(await errorCode(create({ goalIds: ["7"] }))).toBe("FORBIDDEN");
      expectNothingWritten();
    });

    it("refuses someone else's personal goal", async () => {
      db.goal.findMany.mockResolvedValue([goalIn(7, null, strangerId)] as never);

      expect(await errorCode(create({ goalIds: ["7"] }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("refuses a goal id that does not exist, or is not a number", async () => {
      db.goal.findMany.mockResolvedValue([] as never);

      expect(await errorCode(create({ goalIds: ["404"] }))).toBe("NOT_FOUND");
      expect(await errorCode(create({ goalIds: ["not-a-number"] }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("refuses the whole create when one goal of several is out of reach", async () => {
      db.goal.findMany.mockResolvedValue([goalIn(7, workspaceId), goalIn(8, foreignWorkspaceId)] as never);

      expect(await errorCode(create({ workspaceId, goalIds: ["7", "8"] }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("links a goal the caller can edit", async () => {
      db.goal.findMany.mockResolvedValue([goalIn(7, workspaceId)] as never);

      await create({ workspaceId, goalIds: ["7"] });

      expect(db.project.update.mock.calls[0]?.[0].data).toMatchObject({
        goals: { connect: [{ id: 7 }] },
      });
    });
  });

  describe("keyResultIds", () => {
    it("refuses a key result in a workspace the caller is not in and writes nothing", async () => {
      db.keyResult.findMany.mockResolvedValue([keyResultIn("kr-1", foreignWorkspaceId)] as never);

      expect(await errorCode(create({ keyResultIds: ["kr-1"] }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("refuses a key result in a workspace the caller only views", async () => {
      db.keyResult.findMany.mockResolvedValue([keyResultIn("kr-1", viewedWorkspaceId, callerId)] as never);

      expect(await errorCode(create({ keyResultIds: ["kr-1"] }))).toBe("FORBIDDEN");
      expectNothingWritten();
    });

    it("refuses a key result id that does not exist", async () => {
      db.keyResult.findMany.mockResolvedValue([] as never);

      expect(await errorCode(create({ keyResultIds: ["kr-404"] }))).toBe("NOT_FOUND");
      expectNothingWritten();
    });

    it("links a key result the caller can edit", async () => {
      db.keyResult.findMany.mockResolvedValue([keyResultIn("kr-1", workspaceId)] as never);

      await create({ workspaceId, keyResultIds: ["kr-1"] });

      expect(db.keyResultProject.createMany.mock.calls[0]?.[0]).toMatchObject({
        data: [{ keyResultId: "kr-1", projectId: "project-new" }],
      });
    });
  });

  it("still creates a bare project without looking any of this up", async () => {
    await create({});

    expect(db.project.create).toHaveBeenCalledTimes(1);
    expect(db.teamUser.findUnique).not.toHaveBeenCalled();
    expect(db.goal.findMany).not.toHaveBeenCalled();
    expect(db.keyResult.findMany).not.toHaveBeenCalled();
  });
});

// ── goal create: the router's inline path and the shared service ──────

interface GoalCreateInput {
  title: string;
  workspaceId?: string;
  driUserId?: string;
  projectId?: string;
}

describe.each([
  {
    path: "goal.createGoal",
    run: (db: Db, input: GoalCreateInput) =>
      createMockCaller({ userId: callerId, db }).goal.createGoal(input),
  },
  {
    // What `mastra.createOkrObjective` and `bulkCreateStructure` call.
    path: "the createGoal service",
    run: (db: Db, input: GoalCreateInput) =>
      createGoal({
        ctx: { db, session: { user: { id: callerId } } } as unknown as Context,
        input,
      }),
  },
])("$path foreign keys (mocked)", ({ run }) => {
  let db: Db;

  beforeEach(() => {
    db = resetDb();
    stubMemberships(db);
    stubProjects(db);
    db.goal.create.mockResolvedValue(goalIn(7, null, callerId) as never);
  });

  describe("driUserId", () => {
    it("refuses a DRI who is not in the goal's workspace and writes nothing", async () => {
      expect(
        await errorCode(run(db, { title: "Grow revenue", workspaceId, driUserId: strangerId })),
      ).toBe("NOT_FOUND");
      expect(db.goal.create).not.toHaveBeenCalled();
    });

    it("accepts a DRI picked from the workspace's members", async () => {
      await run(db, { title: "Grow revenue", workspaceId, driUserId: colleagueId });

      expect(db.goal.create.mock.calls[0]?.[0].data).toMatchObject({
        driUserId: colleagueId,
        workspaceId,
      });
    });

    it("refuses anyone but the caller as DRI of a personal goal", async () => {
      // The DRI of a personal goal can edit it, so this would hand a stranger
      // a goal and pull their name into the caller's list.
      expect(await errorCode(run(db, { title: "Run a marathon", driUserId: strangerId }))).toBe(
        "NOT_FOUND",
      );
      expect(db.goal.create).not.toHaveBeenCalled();
    });

    it("still defaults the DRI of a personal goal to the caller, with no lookup", async () => {
      await run(db, { title: "Run a marathon" });

      expect(db.goal.create.mock.calls[0]?.[0].data).toMatchObject({
        driUserId: callerId,
        workspaceId: null,
      });
      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("projectId", () => {
    it("refuses a project in a workspace the caller is not in and writes nothing", async () => {
      expect(
        await errorCode(run(db, { title: "Grow revenue", projectId: FOREIGN_PROJECT.id })),
      ).toBe("FORBIDDEN");
      expect(db.goal.create).not.toHaveBeenCalled();
    });

    it("refuses a project the caller can only view", async () => {
      expect(
        await errorCode(run(db, { title: "Grow revenue", projectId: VIEWED_PROJECT.id })),
      ).toBe("FORBIDDEN");
      expect(db.goal.create).not.toHaveBeenCalled();
    });

    it("refuses a project id that does not exist", async () => {
      expect(await errorCode(run(db, { title: "Grow revenue", projectId: "project-404" }))).toBe(
        "FORBIDDEN",
      );
      expect(db.goal.create).not.toHaveBeenCalled();
    });

    it("links a project the caller can edit", async () => {
      await run(db, { title: "Grow revenue", workspaceId, projectId: OWN_PROJECT.id });

      expect(db.goal.create.mock.calls[0]?.[0].data).toMatchObject({
        projects: { connect: [{ id: OWN_PROJECT.id }] },
      });
    });
  });
});

// ── okr.updateLinkedProjects ──────────────────────────────────────────

describe("okr.updateLinkedProjects project gate (mocked)", () => {
  // The caller's own key result, in a workspace they write in: the key result
  // side passes, so only the projects decide.
  const keyResult = keyResultIn("kr-1", workspaceId, callerId);
  let db: Db;

  beforeEach(() => {
    db = resetDb();
    stubMemberships(db);
    stubProjects(db);
    db.keyResult.findFirst.mockResolvedValue(keyResult as never);
    db.keyResult.findUnique.mockResolvedValue(keyResult as never);
    db.keyResultProject.findMany.mockResolvedValue([] as never);
    db.keyResultProject.deleteMany.mockResolvedValue({ count: 0 } as never);
    db.keyResultProject.createMany.mockResolvedValue({ count: 1 } as never);
  });

  const linkedNow = (...projectIds: string[]) =>
    db.keyResultProject.findMany.mockResolvedValue(
      projectIds.map((projectId) => ({ projectId })) as never,
    );
  const update = (projectIds: string[]) =>
    createMockCaller({ userId: callerId, db }).okr.updateLinkedProjects({
      keyResultId: keyResult.id,
      projectIds,
    });
  const expectNothingWritten = () => {
    expect(db.keyResultProject.deleteMany).not.toHaveBeenCalled();
    expect(db.keyResultProject.createMany).not.toHaveBeenCalled();
  };

  it("refuses to link a project in a workspace the caller is not in, and writes nothing", async () => {
    expect(await errorCode(update([FOREIGN_PROJECT.id]))).toBe("FORBIDDEN");
    expectNothingWritten();
  });

  it("refuses to link a project the caller can only view", async () => {
    expect(await errorCode(update([VIEWED_PROJECT.id]))).toBe("FORBIDDEN");
    expectNothingWritten();
  });

  it("refuses the whole batch when one project of several is out of reach", async () => {
    expect(await errorCode(update([OWN_PROJECT.id, FOREIGN_PROJECT.id]))).toBe("FORBIDDEN");
    expectNothingWritten();
  });

  it("refuses a project id that does not exist", async () => {
    expect(await errorCode(update(["project-404"]))).toBe("FORBIDDEN");
    expectNothingWritten();
  });

  it("refuses to unlink a project the caller cannot edit, as okr.unlinkProject does", async () => {
    linkedNow(FOREIGN_PROJECT.id);

    expect(await errorCode(update([]))).toBe("FORBIDDEN");
    expectNothingWritten();
  });

  it("links a project the caller can edit", async () => {
    await update([OWN_PROJECT.id]);

    expect(db.keyResultProject.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [{ keyResultId: keyResult.id, projectId: OWN_PROJECT.id }],
    });
  });

  it("leaves an existing link the caller cannot edit alone when it is not being changed", async () => {
    // The modal posts the full set on every save. A link someone else made to
    // a project the caller cannot edit must not block adding another.
    linkedNow(FOREIGN_PROJECT.id);

    await update([FOREIGN_PROJECT.id, OWN_PROJECT.id]);

    expect(db.keyResultProject.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [
        { keyResultId: keyResult.id, projectId: FOREIGN_PROJECT.id },
        { keyResultId: keyResult.id, projectId: OWN_PROJECT.id },
      ],
    });
  });

  it("unlinks a project the caller can edit", async () => {
    linkedNow(OWN_PROJECT.id);

    await update([]);

    expect(db.keyResultProject.deleteMany).toHaveBeenCalledTimes(1);
  });
});

// ── mastra.unlinkProjectFromKeyResult ─────────────────────────────────

describe("mastra.unlinkProjectFromKeyResult project gate (mocked)", () => {
  // A colleague's key result in the caller's workspace: a member may change
  // it, so only the project decides. Same rule as the human okr.unlinkProject.
  const keyResult = keyResultIn("kr-1", workspaceId);
  let db: Db;

  beforeEach(() => {
    db = resetDb();
    stubMemberships(db);
    stubProjects(db);
    db.keyResult.findFirst.mockResolvedValue(keyResult as never);
    db.keyResultProject.deleteMany.mockResolvedValue({ count: 1 } as never);
  });

  const unlink = (projectId: string) =>
    createMockCaller({ userId: callerId, db }).mastra.unlinkProjectFromKeyResult({
      keyResultId: keyResult.id,
      projectId,
    });

  it("refuses a project in a workspace the caller is not in and writes nothing", async () => {
    expect(await errorCode(unlink(FOREIGN_PROJECT.id))).toBe("FORBIDDEN");
    expect(db.keyResultProject.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a project the caller can only view", async () => {
    expect(await errorCode(unlink(VIEWED_PROJECT.id))).toBe("FORBIDDEN");
    expect(db.keyResultProject.deleteMany).not.toHaveBeenCalled();
  });

  it("unlinks a project the caller can edit", async () => {
    await unlink(OWN_PROJECT.id);

    expect(db.keyResultProject.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("answers the same as okr.unlinkProject for the same caller and project", async () => {
    const human = (projectId: string) =>
      createMockCaller({ userId: callerId, db }).okr.unlinkProject({
        keyResultId: keyResult.id,
        projectId,
      });

    for (const project of [OWN_PROJECT, FOREIGN_PROJECT, VIEWED_PROJECT]) {
      expect(await errorCode(unlink(project.id))).toBe(await errorCode(human(project.id)));
    }
  });
});

// ── mastra.recordChannelSummary ───────────────────────────────────────

describe("mastra.recordChannelSummary credential gate (mocked)", () => {
  // ADR-0023: the chat gateway pushes finished summaries, and the endpoint
  // routes them by ChannelLink into that link's workspace feed, attributed to
  // the link's creator. Its comment said "only the trusted gateway", but any
  // signed-in user could call it for any linked channel id.
  const input = {
    provider: "whatsapp",
    externalId: "12345@g.us",
    summary: "Three messages about the Friday release.",
    windowStart: "2026-06-16T00:00:00.000Z",
    windowEnd: "2026-06-17T00:00:00.000Z",
    messageCount: 3,
  };
  let db: Db;

  beforeEach(() => {
    db = resetDb();
    db.channelLink.findFirst.mockResolvedValue({
      id: "cl-1",
      provider: input.provider,
      externalId: input.externalId,
      workspaceId: foreignWorkspaceId,
      projectId: null,
      isActive: true,
      direction: "inbound",
      createdById: colleagueId,
    } as never);
    db.workspaceActivityEvent.findFirst.mockResolvedValue(null as never);
    db.workspaceActivityEvent.create.mockResolvedValue({ id: "event-1" } as never);
  });

  const record = (tokenType?: string) =>
    createMockCaller({ userId: callerId, db, tokenType }).mastra.recordChannelSummary(input);

  const expectNothingWritten = () => {
    expect(db.channelLink.findFirst).not.toHaveBeenCalled();
    expect(db.workspaceActivityEvent.create).not.toHaveBeenCalled();
    expect(db.workspaceActivityEvent.update).not.toHaveBeenCalled();
  };

  it("refuses a signed-in person (cookie session) and writes nothing", async () => {
    expect(await errorCode(record())).toBe("FORBIDDEN");
    expectNothingWritten();
  });

  it.each(["api-token", "agent-context", "agent-key", "voice-session"])(
    "refuses a %s credential and writes nothing",
    async (tokenType) => {
      expect(await errorCode(record(tokenType))).toBe("FORBIDDEN");
      expectNothingWritten();
    },
  );

  it("records a summary the WhatsApp gateway pushes", async () => {
    const result = await record("whatsapp-gateway");

    expect(result).toMatchObject({ status: "recorded", deduped: false });
    expect(db.workspaceActivityEvent.create).toHaveBeenCalledTimes(1);
  });
});
