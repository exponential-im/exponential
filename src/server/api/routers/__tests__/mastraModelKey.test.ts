/**
 * `mastra.getModelKey`: the one place a workspace's own Anthropic key leaves
 * the app. It goes to the Mastra server only, and only for a workspace the
 * turn's user belongs to. Everyone else gets FORBIDDEN or a null that says
 * nothing about whether a key exists.
 *
 * Mocked Prisma (`vitest-mock-extended`), same harness as
 * `mastraCallAgent.test.ts`. The key store itself is covered by
 * `modelKey.test.ts`.
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

const getWorkingModelKey = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/billing/modelKey", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getWorkingModelKey,
}));

import { createMockCaller } from "~/test/trpc-helpers";
import { MASTRA_SERVER_KEY_HEADER } from "~/server/utils/mastraServerAuth";

const USER_ID = "user-1";
const WORKSPACE = "ws-1";
const SERVER_KEY = "mastra-server-secret";
const WORKSPACE_KEY = "sk-ant-api03-workspace-key-not-real";

describe("mastra.getModelKey", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const original = { mode: process.env.BILLING_MODE, serverKey: process.env.MASTRA_SERVER_API_KEY };

  /** A callback from Mastra for a turn by USER_ID, presenting `serverKey` (or no server key at all). */
  const ask = (serverKey?: string) =>
    createMockCaller({
      userId: USER_ID,
      db: dbMock,
      tokenType: "agent-context",
      headers: new Headers(serverKey === undefined ? {} : { [MASTRA_SERVER_KEY_HEADER]: serverKey }),
    }).mastra.getModelKey({ workspaceId: WORKSPACE });

  function isMember(member: boolean) {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      (member ? { role: "member", workspaceId: WORKSPACE } : null) as never,
    );
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    process.env.BILLING_MODE = "meter";
    process.env.MASTRA_SERVER_API_KEY = SERVER_KEY;
    getWorkingModelKey.mockReset().mockResolvedValue(WORKSPACE_KEY);
    isMember(true);
  });

  afterEach(() => {
    if (original.mode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = original.mode;
    if (original.serverKey === undefined) delete process.env.MASTRA_SERVER_API_KEY;
    else process.env.MASTRA_SERVER_API_KEY = original.serverKey;
  });

  it("gives the Mastra server the key of a workspace the turn's user belongs to", async () => {
    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: WORKSPACE_KEY });
    expect(getWorkingModelKey).toHaveBeenCalledWith(expect.anything(), WORKSPACE);
  });

  it("refuses a caller that holds the agent token but not the server key", async () => {
    await expect(ask()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ask("not-the-server-key")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });

  it("refuses everyone when this install has no server key configured", async () => {
    delete process.env.MASTRA_SERVER_API_KEY;

    await expect(ask(SERVER_KEY)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ask("")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });

  it("answers null, without reading the key, when the user is not in the workspace", async () => {
    isMember(false);

    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: null });
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });

  it("answers null when the workspace has no working key", async () => {
    getWorkingModelKey.mockResolvedValue(null);

    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: null });
  });

  it("answers null without touching the database on an install that does not meter", async () => {
    delete process.env.BILLING_MODE;

    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: null });
    expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });
});
