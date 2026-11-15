/**
 * The per-row side of "the owner of an agent reaches what that agent created".
 *
 * An agent writes as its shadow user (ADR-0049), so an Action it creates with
 * no project and no assignee had exactly one reader: the agent. Its owner
 * could not find it in search, open it, or tick it off. `getActionAccess`
 * now resolves the creating agent's owner, and the owner stands where the
 * creator stands. The Prisma WHERE twins are property-tested against these
 * checks in `actionWriteWhere.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// `actionResolver` pulls in `~/server/db` transitively, which validates env at
// module load. Seed the minimum before imports (same as permissions.test.ts).
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
});

import {
  canEditAction,
  canViewAction,
  checkActionPermission,
  getActionAccess,
} from "../resolvers/actionResolver";

const OWNER = "user-owner";
const TEAMMATE = "user-teammate";
const AGENT_SHADOW = "user-agent-shadow";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

/** The row an MCP `actions.create` with no project and no assignee writes. */
function stubAgentCreatedAction(ownerId: string | null) {
  db.action.findUnique.mockResolvedValue({
    createdById: AGENT_SHADOW,
    projectId: null,
    assignees: [],
    createdBy: { externalAgentShadow: ownerId ? { ownerId } : null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("getActionAccess — the creating agent's owner", () => {
  beforeEach(() => {
    mockReset(db);
  });

  it("reads the creator's agent row in the same query as the action", async () => {
    stubAgentCreatedAction(OWNER);
    await getActionAccess(db, OWNER, "action-1");

    expect(db.action.findUnique).toHaveBeenCalledTimes(1);
    expect(db.action.findUnique.mock.calls[0]?.[0]?.select).toMatchObject({
      createdBy: { select: { externalAgentShadow: { select: { ownerId: true } } } },
    });
  });

  it("lets the owner view, edit and delete a project-less action their agent created", async () => {
    stubAgentCreatedAction(OWNER);
    const access = await getActionAccess(db, OWNER, "action-1");

    expect(access).toMatchObject({
      isCreator: false,
      isCreatorAgentOwner: true,
      isAssignee: false,
      hasProjectAccess: false,
    });
    expect(canViewAction(access!)).toBe(true);
    expect(canEditAction(access!)).toBe(true);
    expect(checkActionPermission(access!, "delete")).toBe(true);
  });

  it("gives a teammate nothing: the action stays personal to the agent and its owner", async () => {
    stubAgentCreatedAction(OWNER);
    const access = await getActionAccess(db, TEAMMATE, "action-1");

    expect(access?.isCreatorAgentOwner).toBe(false);
    expect(canViewAction(access!)).toBe(false);
    expect(canEditAction(access!)).toBe(false);
    expect(checkActionPermission(access!, "delete")).toBe(false);
  });

  it("is false when a person, not an agent, created the action", async () => {
    stubAgentCreatedAction(null);
    const access = await getActionAccess(db, OWNER, "action-1");

    expect(access?.isCreatorAgentOwner).toBe(false);
    expect(canViewAction(access!)).toBe(false);
  });
});
