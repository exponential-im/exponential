import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";

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
  buildActionAccessWhere,
  buildActionEditWhere,
  buildActionDeleteWhere,
  canEditAction,
  canViewAction,
  checkActionPermission,
} from "../resolvers/actionResolver";
import {
  buildProjectEditWhere,
  canEditProject,
  hasProjectAccess,
  isProjectInsider,
} from "../resolvers/projectResolver";
import type { ProjectAccess, ProjectMemberRole, WorkspaceRole } from "../types";
import { matchesWhere } from "~/test/prismaWhere";

/**
 * The bulk action writes (`bulkDelete`, `bulkReschedule`, `bulkDefer`,
 * `bulkAssignProject`, `assign`, `unassign`) scope their `updateMany` /
 * `deleteMany` with these builders. They must admit exactly the rows the
 * per-row checks (`canEditAction`, `checkActionPermission(…, "delete")`)
 * would — a looser clause lets a write reach rows the single-action path
 * refuses.
 */

const ME = "me";
const OTHER = "other";

type DirectWorkspaceRole = Exclude<WorkspaceRole, "guest">;

interface ProjectRow {
  createdById: string;
  isPublic: boolean;
  isRestricted: boolean;
  projectMembers: { userId: string; role: ProjectMemberRole }[];
  team: { members: { userId: string }[] } | null;
  workspace: {
    members: { userId: string; role: DirectWorkspaceRole }[];
    teams: { members: { userId: string }[] }[];
  } | null;
}

interface ActionRow {
  createdById: string;
  /**
   * The creator's agent row. Null when a person created the action; when an
   * agent did (its shadow user is `createdById`), the person who owns it.
   */
  createdBy: { externalAgentShadow: { ownerId: string } | null };
  assignees: { userId: string }[];
  project: ProjectRow | null;
}

const byPerson: ActionRow["createdBy"] = { externalAgentShadow: null };
const byAgentOf = (ownerId: string): ActionRow["createdBy"] => ({
  externalAgentShadow: { ownerId },
});

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    createdById: OTHER,
    isPublic: false,
    isRestricted: false,
    projectMembers: [],
    team: null,
    workspace: { members: [], teams: [] },
    ...overrides,
  };
}

function action(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    createdById: OTHER,
    createdBy: byPerson,
    assignees: [],
    project: project(),
    ...overrides,
  };
}

function inWorkspace(role: DirectWorkspaceRole): ProjectRow["workspace"] {
  return { members: [{ userId: ME, role }], teams: [] };
}

/**
 * What `getProjectAccess` resolves for ME from this row — including
 * `getWorkspaceMembership`'s rule that a direct WorkspaceUser row wins over
 * team-via-workspace access (which resolves to `member`).
 */
function projectAccessOf(p: ProjectRow): ProjectAccess {
  const member = p.projectMembers.find((m) => m.userId === ME);
  const direct = p.workspace?.members.find((m) => m.userId === ME);
  const viaTeam = p.workspace?.teams.some((t) => t.members.some((m) => m.userId === ME));
  const workspaceRole: WorkspaceRole | undefined =
    direct?.role ?? (viaTeam ? "member" : undefined);
  return {
    isCreator: p.createdById === ME,
    isMember: !!member,
    memberRole: member?.role,
    isTeamMember: !!p.team?.members.some((m) => m.userId === ME),
    isWorkspaceMember: !!workspaceRole,
    workspaceRole,
    isPublic: p.isPublic,
    isRestricted: p.isRestricted,
  };
}

function actionAccessOf(a: ActionRow) {
  const pa = a.project ? projectAccessOf(a.project) : null;
  return {
    isCreator: a.createdById === ME,
    isCreatorAgentOwner: a.createdBy.externalAgentShadow?.ownerId === ME,
    isAssignee: a.assignees.some((x) => x.userId === ME),
    hasProjectAccess: pa ? hasProjectAccess(pa) : false,
    canEditProject: pa ? canEditProject(pa) : false,
    isProjectInsider: pa ? isProjectInsider(pa) : false,
  };
}

const canEdit = (a: ActionRow) => matchesWhere({ ...a }, buildActionEditWhere(ME));
const canDelete = (a: ActionRow) => matchesWhere({ ...a }, buildActionDeleteWhere(ME));
const canRead = (a: ActionRow) => matchesWhere({ ...a }, buildActionAccessWhere(ME));

// ── Arbitraries ─────────────────────────────────────────────────────

const userArb = fc.constantFrom(ME, OTHER);
const membersArb = fc.boolean().map((has) => (has ? [{ userId: ME }] : []));

const projectArb: fc.Arbitrary<ProjectRow> = fc.record({
  createdById: userArb,
  isPublic: fc.boolean(),
  isRestricted: fc.boolean(),
  projectMembers: fc.option(fc.constantFrom<ProjectMemberRole>("viewer", "editor", "admin"), {
    nil: undefined,
  }).map((role) => (role ? [{ userId: ME, role }] : [])),
  team: fc.option(fc.record({ members: membersArb }), { nil: null }),
  workspace: fc.option(
    fc.record({
      members: fc
        .option(fc.constantFrom<DirectWorkspaceRole>("viewer", "member", "admin", "owner"), {
          nil: undefined,
        })
        .map((role) => (role ? [{ userId: ME, role }] : [])),
      teams: fc.boolean().map((has) => (has ? [{ members: [{ userId: ME }] }] : [])),
    }),
    { nil: null },
  ),
});

// Who wrote the row: ME, another person, or an agent's shadow user, whose
// owner is ME or someone else. A shadow user is never a person's own id.
const AGENT = "agent-shadow";
const creatorArb: fc.Arbitrary<Pick<ActionRow, "createdById" | "createdBy">> = fc.oneof(
  userArb.map((createdById) => ({ createdById, createdBy: byPerson })),
  userArb.map((ownerId) => ({ createdById: AGENT, createdBy: byAgentOf(ownerId) })),
);

const actionArb: fc.Arbitrary<ActionRow> = fc
  .tuple(
    creatorArb,
    fc.record({
      assignees: membersArb,
      project: fc.option(projectArb, { nil: null }),
    }),
  )
  .map(([creator, rest]) => ({ ...creator, ...rest }));

// ── Mirror properties ───────────────────────────────────────────────

describe("buildActionAccessWhere mirrors canViewAction", () => {
  it("admits a row iff the per-row view check does", () => {
    fc.assert(
      fc.property(actionArb, (a) => {
        expect(canRead(a)).toBe(canViewAction(actionAccessOf(a)));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("buildActionEditWhere mirrors canEditAction", () => {
  it("admits a row iff the per-row edit check does", () => {
    fc.assert(
      fc.property(actionArb, (a) => {
        expect(canEdit(a)).toBe(canEditAction(actionAccessOf(a)));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("buildActionDeleteWhere mirrors checkActionPermission('delete')", () => {
  it("admits a row iff the per-row delete check does", () => {
    fc.assert(
      fc.property(actionArb, (a) => {
        expect(canDelete(a)).toBe(checkActionPermission(actionAccessOf(a), "delete"));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("buildProjectEditWhere mirrors canEditProject", () => {
  it("admits a project iff the per-row edit check does", () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        expect(matchesWhere({ ...p }, buildProjectEditWhere(ME))).toBe(
          canEditProject(projectAccessOf(p)),
        );
      }),
      { numRuns: 2000 },
    );
  });
});

// ── The cases the read clause got wrong ─────────────────────────────

describe("write scoping vs the read clause", () => {
  it("public-project outsider can read but not edit or delete", () => {
    const a = action({ project: project({ isPublic: true, workspace: null }) });
    expect(canRead(a)).toBe(true);
    expect(canEdit(a)).toBe(false);
    expect(canDelete(a)).toBe(false);
  });

  it("workspace viewer can read but not edit or delete", () => {
    const a = action({ project: project({ workspace: inWorkspace("viewer") }) });
    expect(canRead(a)).toBe(true);
    expect(canEdit(a)).toBe(false);
    expect(canDelete(a)).toBe(false);
  });

  it("workspace viewer stays a viewer even when in a team linked to the workspace", () => {
    const a = action({
      project: project({
        workspace: {
          members: [{ userId: ME, role: "viewer" }],
          teams: [{ members: [{ userId: ME }] }],
        },
      }),
    });
    expect(canEdit(a)).toBe(false);
  });

  it.each<DirectWorkspaceRole>(["member", "admin", "owner"])(
    "workspace %s can edit and delete",
    (role) => {
      const a = action({ project: project({ workspace: inWorkspace(role) }) });
      expect(canEdit(a)).toBe(true);
      expect(canDelete(a)).toBe(true);
    },
  );

  it("team-via-workspace access (no direct row) edits as member", () => {
    const a = action({
      project: project({ workspace: { members: [], teams: [{ members: [{ userId: ME }] }] } }),
    });
    expect(canEdit(a)).toBe(true);
  });

  it("member of the project's own team edits even as a workspace viewer", () => {
    const a = action({
      project: project({ team: { members: [{ userId: ME }] }, workspace: inWorkspace("viewer") }),
    });
    expect(canEdit(a)).toBe(true);
  });

  it("assignee can edit but not hard-delete", () => {
    const a = action({ assignees: [{ userId: ME }], project: project({ isPublic: true }) });
    expect(canEdit(a)).toBe(true);
    expect(canDelete(a)).toBe(false);
  });

  it("creator can edit and delete a project-less action", () => {
    const a = action({ createdById: ME, project: null });
    expect(canEdit(a)).toBe(true);
    expect(canDelete(a)).toBe(true);
  });

  it("the owner of the agent that created a project-less action reads, edits and deletes it", () => {
    // What an MCP `actions.create` with no project and no assignee writes.
    const a = action({ createdById: AGENT, createdBy: byAgentOf(ME), project: null });
    expect(canRead(a)).toBe(true);
    expect(canEdit(a)).toBe(true);
    expect(canDelete(a)).toBe(true);
  });

  it("someone else's agent grants nothing, whatever the caller's workspace role", () => {
    const projectLess = action({ createdById: AGENT, createdBy: byAgentOf(OTHER), project: null });
    expect(canRead(projectLess)).toBe(false);
    expect(canEdit(projectLess)).toBe(false);
    expect(canDelete(projectLess)).toBe(false);

    // In a restricted project the caller cannot reach, owning the workspace's
    // other agents is not a way in either.
    const restricted = action({
      createdById: AGENT,
      createdBy: byAgentOf(OTHER),
      project: project({ isRestricted: true, workspace: inWorkspace("member") }),
    });
    expect(canRead(restricted)).toBe(false);
  });

  it("restricted project: workspace member is refused, owner escape hatch allowed", () => {
    const asMember = action({
      project: project({ isRestricted: true, workspace: inWorkspace("member") }),
    });
    const asOwner = action({
      project: project({ isRestricted: true, workspace: inWorkspace("owner") }),
    });
    expect(canEdit(asMember)).toBe(false);
    expect(canEdit(asOwner)).toBe(true);
  });

  it("never grants a write through isPublic", () => {
    const mentionsPublic = (v: unknown): boolean =>
      typeof v === "object" && v !== null &&
      Object.entries(v).some(([k, x]) => k === "isPublic" || mentionsPublic(x));
    expect(mentionsPublic(buildActionEditWhere(ME))).toBe(false);
    expect(mentionsPublic(buildActionDeleteWhere(ME))).toBe(false);
  });
});
