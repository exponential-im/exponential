/**
 * project.getUserProjects for capture pickers (ADR-0085, inner.tiger): each
 * project comes with its active Pillars only, so a capture never ticks an
 * inactive one it cannot show. Mocked Prisma, same harness as tagPillar.test.
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

let dbMock: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  dbMock = getDbMock();
  mockReset(dbMock);
});

describe("project.getUserProjects", () => {
  it("returns each project's active Pillar ids, asking only for active Pillars", async () => {
    dbMock.project.findMany.mockResolvedValue([
      { id: "p1", name: "Railway", slug: "railway", pillarTags: [{ tagId: "devops" }] },
    ] as never);

    const caller = createMockCaller({ userId: "user-1", db: dbMock });
    const result = await caller.project.getUserProjects({ workspaceId: "ws-1" });

    expect(result.projects).toEqual([
      { id: "p1", name: "Railway", slug: "railway", pillarTagIds: ["devops"] },
    ]);
    const args = dbMock.project.findMany.mock.calls[0]![0]!;
    expect(args.select).toMatchObject({
      pillarTags: {
        where: { tag: { category: "pillar", archivedAt: null } },
        select: { tagId: true },
      },
    });
  });
});
