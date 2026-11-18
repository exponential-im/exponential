/**
 * Pillar guards on the tag router (ADR-0085): promotion is admin-only and
 * has one entry point, and a Project takes this workspace's active Pillars
 * only. Mocked Prisma, same harness as `crmTagWriteRole.test.ts`.
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

const callerId = "user-1";
const workspaceId = "ws-1";

type Role = "owner" | "admin" | "member" | "viewer";

function stubRole(dbMock: DeepMockProxy<PrismaClient>, role: Role) {
  dbMock.workspaceUser.findUnique.mockResolvedValue({ role, workspaceId } as never);
  dbMock.workspaceUser.findFirst.mockResolvedValue({ role, workspaceId } as never);
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
  return undefined;
}

function tagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tag-devops",
    name: "DevOps",
    slug: "devops",
    color: "avatar-blue",
    description: null,
    category: null,
    isSystem: false,
    workspaceId,
    createdById: callerId,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

let dbMock: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  dbMock = getDbMock();
  mockReset(dbMock);
  dbMock.$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: PrismaClient) => unknown)(dbMock)
      : Promise.all(arg as Promise<unknown>[])) as never);
});

describe("tag.setPillar", () => {
  it("lets an admin promote a workspace tag", async () => {
    stubRole(dbMock, "admin");
    dbMock.tag.findUnique.mockResolvedValue(tagRow() as never);
    dbMock.tag.update.mockResolvedValue(tagRow({ category: "pillar" }) as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.tag.setPillar({ tagId: "tag-devops", isPillar: true });

    expect(dbMock.tag.update).toHaveBeenCalledWith({
      where: { id: "tag-devops" },
      data: { category: "pillar" },
    });
  });

  it("refuses a member", async () => {
    stubRole(dbMock, "member");
    dbMock.tag.findUnique.mockResolvedValue(tagRow() as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(await errorCode(caller.tag.setPillar({ tagId: "tag-devops", isPillar: true }))).toBe(
      "FORBIDDEN",
    );
    expect(dbMock.tag.update).not.toHaveBeenCalled();
  });
});

describe("tag.create and tag.update cannot make or unmake a Pillar", () => {
  it("tag.create refuses category pillar", async () => {
    stubRole(dbMock, "owner");
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.create({ name: "DevOps", color: "avatar-blue", workspaceId, category: "pillar" }),
      ),
    ).toBe("BAD_REQUEST");
    expect(dbMock.tag.create).not.toHaveBeenCalled();
  });

  it("tag.update refuses setting category pillar", async () => {
    stubRole(dbMock, "owner");
    dbMock.tag.findUnique.mockResolvedValue(tagRow() as never);
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(await errorCode(caller.tag.update({ id: "tag-devops", category: "pillar" }))).toBe(
      "BAD_REQUEST",
    );
    expect(dbMock.tag.update).not.toHaveBeenCalled();
  });

  it("tag.update refuses clearing a Pillar's category", async () => {
    stubRole(dbMock, "owner");
    dbMock.tag.findUnique.mockResolvedValue(tagRow({ category: "pillar" }) as never);
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(await errorCode(caller.tag.update({ id: "tag-devops", category: null }))).toBe(
      "BAD_REQUEST",
    );
    expect(dbMock.tag.update).not.toHaveBeenCalled();
  });

  it("tag.update still renames a Pillar", async () => {
    stubRole(dbMock, "member");
    dbMock.tag.findUnique.mockResolvedValue(tagRow({ category: "pillar" }) as never);
    dbMock.tag.findFirst.mockResolvedValue(null as never);
    dbMock.tag.update.mockResolvedValue(tagRow({ name: "Ops", category: "pillar" }) as never);
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.tag.update({ id: "tag-devops", name: "Ops" });
    expect(dbMock.tag.update).toHaveBeenCalledTimes(1);
  });
});

describe("tag.setEntityTags on a project", () => {
  const PROJECT = { workspaceId, pillarTags: [] as { tagId: string }[] };

  function stubEditableProject() {
    stubRole(dbMock, "member");
    dbMock.project.findUnique.mockResolvedValue({
      ...PROJECT,
      createdById: callerId,
      teamId: null,
      isPublic: false,
      isRestricted: false,
    } as never);
    dbMock.projectMember.findFirst.mockResolvedValue(null as never);
    dbMock.projectTag.findMany.mockResolvedValue([] as never);
  }

  it("files a project under a Pillar", async () => {
    stubEditableProject();
    dbMock.tag.findMany.mockResolvedValue([
      { id: "tag-devops", category: "pillar", workspaceId, archivedAt: null },
    ] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.tag.setEntityTags({ entityType: "project", entityId: "proj-1", tagIds: ["tag-devops"] });

    expect(dbMock.projectTag.createMany).toHaveBeenCalledWith({
      data: [{ projectId: "proj-1", tagId: "tag-devops" }],
      skipDuplicates: true,
    });
  });

  it("keeps a tag that was demoted after the project was filed under it, while adding a Pillar", async () => {
    stubEditableProject();
    dbMock.project.findUnique.mockResolvedValue({
      workspaceId,
      pillarTags: [{ tagId: "tag-demoted" }],
      createdById: callerId,
      teamId: null,
      isPublic: false,
      isRestricted: false,
    } as never);
    dbMock.tag.findMany.mockResolvedValue([
      { id: "tag-demoted", category: null, workspaceId, archivedAt: null },
      { id: "tag-devops", category: "pillar", workspaceId, archivedAt: null },
    ] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.tag.setEntityTags({
      entityType: "project",
      entityId: "proj-1",
      tagIds: ["tag-demoted", "tag-devops"],
    });

    expect(dbMock.projectTag.createMany).toHaveBeenCalledWith({
      data: [{ projectId: "proj-1", tagId: "tag-devops" }],
      skipDuplicates: true,
    });
  });

  it("refuses an ordinary label", async () => {
    stubEditableProject();
    dbMock.tag.findMany.mockResolvedValue([
      { id: "tag-bug", category: null, workspaceId, archivedAt: null },
    ] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.setEntityTags({ entityType: "project", entityId: "proj-1", tagIds: ["tag-bug"] }),
      ),
    ).toBe("BAD_REQUEST");
    expect(dbMock.projectTag.createMany).not.toHaveBeenCalled();
  });

  it("refuses a newly added inactive Pillar", async () => {
    stubEditableProject();
    dbMock.tag.findMany.mockResolvedValue([
      { id: "tag-old", category: "pillar", workspaceId, archivedAt: new Date() },
    ] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.setEntityTags({ entityType: "project", entityId: "proj-1", tagIds: ["tag-old"] }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("refuses a Pillar from another workspace", async () => {
    stubEditableProject();
    dbMock.tag.findMany.mockResolvedValue([] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.setEntityTags({ entityType: "project", entityId: "proj-1", tagIds: ["tag-elsewhere"] }),
      ),
    ).toBe("BAD_REQUEST");
  });
});

describe("tag.setEntityTags on a goal and a resource", () => {
  const pillar = { id: "tag-devops", category: "pillar", workspaceId, archivedAt: null };

  it("files a workspace objective under a Pillar, parsing its numeric id", async () => {
    stubRole(dbMock, "member");
    dbMock.goal.findUnique.mockResolvedValue({
      userId: "someone-else",
      driUserId: null,
      workspaceId,
      pillarTags: [],
    } as never);
    dbMock.tag.findMany.mockResolvedValue([pillar] as never);
    dbMock.goalTag.findMany.mockResolvedValue([] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.tag.setEntityTags({ entityType: "goal", entityId: "42", tagIds: ["tag-devops"] });

    expect(dbMock.goalTag.createMany).toHaveBeenCalledWith({
      data: [{ goalId: 42, tagId: "tag-devops" }],
      skipDuplicates: true,
    });
  });

  it("refuses a viewer filing an objective", async () => {
    stubRole(dbMock, "viewer");
    dbMock.goal.findUnique.mockResolvedValue({
      userId: callerId,
      driUserId: null,
      workspaceId,
      pillarTags: [],
    } as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.setEntityTags({ entityType: "goal", entityId: "42", tagIds: ["tag-devops"] }),
      ),
    ).toBe("FORBIDDEN");
    expect(dbMock.goalTag.createMany).not.toHaveBeenCalled();
  });

  it("lets a Resource's owner file it", async () => {
    stubRole(dbMock, "member");
    dbMock.resource.findUnique.mockResolvedValue({ userId: callerId, workspaceId, pillarTags: [] } as never);
    dbMock.tag.findMany.mockResolvedValue([pillar] as never);
    dbMock.resourceTag.findMany.mockResolvedValue([] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.tag.setEntityTags({ entityType: "resource", entityId: "res-1", tagIds: ["tag-devops"] });

    expect(dbMock.resourceTag.createMany).toHaveBeenCalledWith({
      data: [{ resourceId: "res-1", tagId: "tag-devops" }],
      skipDuplicates: true,
    });
  });

  it("never lets anyone else file someone's Resource", async () => {
    stubRole(dbMock, "owner");
    dbMock.resource.findUnique.mockResolvedValue({ userId: "someone-else", workspaceId, pillarTags: [] } as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.setEntityTags({ entityType: "resource", entityId: "res-1", tagIds: ["tag-devops"] }),
      ),
    ).toBe("NOT_FOUND");
    expect(dbMock.resourceTag.createMany).not.toHaveBeenCalled();
  });

  it("refuses a Resource with no workspace", async () => {
    stubRole(dbMock, "member");
    dbMock.resource.findUnique.mockResolvedValue({ userId: callerId, workspaceId: null, pillarTags: [] } as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.setEntityTags({ entityType: "resource", entityId: "res-1", tagIds: ["tag-devops"] }),
      ),
    ).toBe("BAD_REQUEST");
  });
});

describe("tag.setEntityTags on a recurring task", () => {
  const pillar = { id: "tag-devops", category: "pillar", workspaceId, archivedAt: null };

  it("lets its creator file a project-less recurring task under a Pillar", async () => {
    stubRole(dbMock, "member");
    dbMock.recurringTask.findUnique.mockResolvedValue({
      workspaceId,
      createdById: callerId,
      projectId: null,
      pillarTags: [],
    } as never);
    dbMock.tag.findMany.mockResolvedValue([pillar] as never);
    dbMock.recurringTaskTag.findMany.mockResolvedValue([] as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.tag.setEntityTags({ entityType: "recurringTask", entityId: "rt-1", tagIds: ["tag-devops"] });

    expect(dbMock.recurringTaskTag.createMany).toHaveBeenCalledWith({
      data: [{ recurringTaskId: "rt-1", tagId: "tag-devops" }],
      skipDuplicates: true,
    });
  });

  it("hides someone else's project-less recurring task", async () => {
    stubRole(dbMock, "owner");
    dbMock.recurringTask.findUnique.mockResolvedValue({
      workspaceId,
      createdById: "someone-else",
      projectId: null,
      pillarTags: [],
    } as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    expect(
      await errorCode(
        caller.tag.setEntityTags({ entityType: "recurringTask", entityId: "rt-1", tagIds: ["tag-devops"] }),
      ),
    ).toBe("NOT_FOUND");
    expect(dbMock.recurringTaskTag.createMany).not.toHaveBeenCalled();
  });
});
