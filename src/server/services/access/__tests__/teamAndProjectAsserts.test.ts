/**
 * Unit tests for `assertTeamMembership` and `assertCanEditProjects`: the
 * asserts behind a write that names a team or projects by id without being a
 * team or project procedure (ticket calm.daisy).
 *
 * Mocked Prisma — no real DB.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { assertTeamMembership } from "../resolvers/teamResolver";
import { assertCanEditProjects } from "../resolvers/projectResolver";

const userId = "user-1";
const workspaceId = "ws-1";

/** "allowed", or the tRPC code the assert threw. */
async function verdict(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "allowed";
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
}

describe("assertTeamMembership", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("returns the membership of a team member, at any role", async () => {
    db.teamUser.findUnique.mockResolvedValue({ role: "member", teamId: "team-1" } as never);

    await expect(assertTeamMembership(db, userId, "team-1")).resolves.toEqual({
      role: "member",
      teamId: "team-1",
    });
  });

  it("refuses someone who is not in the team, or a team that does not exist", async () => {
    db.teamUser.findUnique.mockResolvedValue(null as never);

    expect(await verdict(assertTeamMembership(db, userId, "team-other"))).toBe("FORBIDDEN");
  });
});

describe("assertCanEditProjects", () => {
  let db: DeepMockProxy<PrismaClient>;

  const project = (id: string, inWorkspaceId: string) => ({
    id,
    createdById: "someone-else",
    teamId: null,
    workspaceId: inWorkspaceId,
    isPublic: false,
    isRestricted: false,
  });
  const PROJECTS = [
    project("mine", workspaceId),
    project("also-mine", workspaceId),
    project("foreign", "ws-other"),
    { ...project("public", "ws-other"), isPublic: true },
  ];

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    db.project.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(PROJECTS.find((p) => p.id === args.where.id) ?? null)) as never);
    db.projectMember.findFirst.mockResolvedValue(null as never);
    db.teamUser.findFirst.mockResolvedValue(null as never);
    // A member of ws-1, nothing anywhere else.
    db.workspaceUser.findUnique.mockImplementation(((args: {
      where: { userId_workspaceId: { workspaceId: string } };
    }) =>
      Promise.resolve(
        args.where.userId_workspaceId.workspaceId === workspaceId
          ? { role: "member", workspaceId }
          : null,
      )) as never);
  });

  const check = (ids: string[]) => verdict(assertCanEditProjects(db, userId, ids, "No"));

  it("allows an empty list without a query", async () => {
    expect(await check([])).toBe("allowed");
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it("allows projects the user can edit", async () => {
    expect(await check(["mine", "also-mine", "mine"])).toBe("allowed");
  });

  it("refuses the set when one project is out of reach", async () => {
    expect(await check(["mine", "foreign"])).toBe("FORBIDDEN");
  });

  it("refuses a public project the user can only view", async () => {
    expect(await check(["public"])).toBe("FORBIDDEN");
  });

  it("refuses an id with no project behind it", async () => {
    expect(await check(["project-404"])).toBe("FORBIDDEN");
  });

  it("carries the caller's message", async () => {
    await expect(assertCanEditProjects(db, userId, ["foreign"], "Not that project")).rejects.toThrow(
      "Not that project",
    );
  });
});
