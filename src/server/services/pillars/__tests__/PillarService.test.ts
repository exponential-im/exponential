/**
 * PillarService (ADR-0086): promotion guards and which items land in which
 * section of a Pillar page. Mocked Prisma; the access resolvers are mocked to
 * fixed clauses so these tests cover the service's own rules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("~/server/services/access", () => ({
  assertWorkspaceMembership: vi.fn(),
  assertWorkspaceRole: vi.fn(),
  buildActionAccessWhere: vi.fn(() => ({ actionAccess: true })),
  buildTicketAccessWhere: vi.fn(() => ({ ticketAccess: true })),
  buildWorkspaceProjectAccessWhere: vi.fn(() => Promise.resolve({ projectAccess: true })),
  buildSharedResourceWhere: vi.fn(() => Promise.resolve({ sharedResource: true })),
}));

import { assertWorkspaceMembership, assertWorkspaceRole } from "~/server/services/access";
import {
  createPillar,
  getPillarPage,
  listPillars,
  setPillar,
  setPillarArchived,
  setPillarDri,
  setPillarPositions,
  suggestPillarsFor,
} from "../PillarService";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const membershipMock = vi.mocked(assertWorkspaceMembership);
const roleMock = vi.mocked(assertWorkspaceRole);

const WS = "ws-1";
const USER = "user-1";

function tagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tag-devops",
    name: "DevOps",
    slug: "devops",
    color: "avatar-blue",
    description: "Keep production healthy",
    category: "pillar",
    isSystem: false,
    workspaceId: WS,
    createdById: USER,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    workspace: { slug: "acme" },
    ...overrides,
  };
}

function action(id: string, assigned: boolean) {
  return {
    id,
    name: id,
    status: "ACTIVE",
    priority: "Quick",
    dueDate: null,
    projectId: null,
    epicId: null,
    assignees: assigned ? [{ user: { id: "u2", name: "Ana", image: null } }] : [],
  };
}

function ticket(id: string, assigned: boolean) {
  return {
    id,
    title: id,
    shortId: null,
    number: 1,
    status: "BACKLOG",
    epicId: null,
    assignee: assigned ? { id: "u2", name: "Ana", image: null } : null,
    product: { id: "p1", name: "App", slug: "app" },
  };
}

beforeEach(() => {
  mockReset(db);
  membershipMock.mockReset();
  roleMock.mockReset();
});

describe("setPillar", () => {
  it("promotes a workspace tag for an admin, without touching the items that carry it", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow({ category: null }) as never);
    db.tag.update.mockResolvedValue(tagRow() as never);

    await setPillar({ db, userId: USER, tagId: "tag-devops", isPillar: true });

    expect(roleMock).toHaveBeenCalledWith(db, USER, WS, ["owner", "admin"]);
    expect(db.tag.update).toHaveBeenCalledWith({
      where: { id: "tag-devops" },
      data: { category: "pillar" },
    });
    expect(db.actionTag.deleteMany).not.toHaveBeenCalled();
    expect(db.ticketTag.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a member who is not an admin", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow({ category: null }) as never);
    roleMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));

    await expect(
      setPillar({ db, userId: USER, tagId: "tag-devops", isPillar: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.tag.update).not.toHaveBeenCalled();
  });

  it("never promotes a global or system tag", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow({ workspaceId: null }) as never);
    await expect(
      setPillar({ db, userId: USER, tagId: "tag-devops", isPillar: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    db.tag.findUnique.mockResolvedValue(tagRow({ isSystem: true }) as never);
    await expect(
      setPillar({ db, userId: USER, tagId: "tag-devops", isPillar: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.tag.update).not.toHaveBeenCalled();
  });

  it("demoting clears the inactive flag", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow({ archivedAt: new Date() }) as never);
    db.tag.update.mockResolvedValue(tagRow({ category: null }) as never);

    await setPillar({ db, userId: USER, tagId: "tag-devops", isPillar: false });

    expect(db.tag.update).toHaveBeenCalledWith({
      where: { id: "tag-devops" },
      data: { category: null, archivedAt: null },
    });
  });
});

describe("listPillars", () => {
  it("lists a workspace's active Pillars for a member, inactive ones only on request", async () => {
    db.tag.findMany.mockResolvedValue([] as never);

    await listPillars({ db, userId: USER, workspaceId: WS });
    expect(membershipMock).toHaveBeenCalledWith(db, USER, WS);
    expect(db.tag.findMany.mock.calls[0]![0]!.where).toEqual({
      workspaceId: WS,
      category: "pillar",
      archivedAt: null,
    });

    await listPillars({ db, userId: USER, workspaceId: WS, includeArchived: true });
    expect(db.tag.findMany.mock.calls[1]![0]!.where).toEqual({ workspaceId: WS, category: "pillar" });
  });
});

describe("listPillars hasNoDri", () => {
  it("flags each Pillar that has no DRI", async () => {
    db.tag.findMany.mockResolvedValue([
      { id: "a", name: "A", driUserId: null },
      { id: "b", name: "B", driUserId: "u2" },
    ] as never);

    const pillars = await listPillars({ db, userId: USER, workspaceId: WS });
    expect(db.tag.findMany.mock.calls[0]![0]!.select).toMatchObject({ driUserId: true });
    expect(pillars.map((p) => [p.id, p.hasNoDri])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });
});

describe("setPillarPositions", () => {
  beforeEach(() => {
    db.tag.findUnique.mockResolvedValue(tagRow() as never);
    db.$transaction.mockResolvedValue([] as never);
  });

  it("sets the Positions shown for a Pillar, for an admin, from its own workspace", async () => {
    db.position.count.mockResolvedValue(2);

    await setPillarPositions({ db, userId: USER, tagId: "tag-devops", positionIds: ["pos-td", "pos-sre", "pos-td"] });

    expect(roleMock).toHaveBeenCalledWith(db, USER, WS, ["owner", "admin"]);
    expect(db.position.count).toHaveBeenCalledWith({
      where: { id: { in: ["pos-td", "pos-sre"] }, workspaceId: WS },
    });
    expect(db.pillarPosition.deleteMany).toHaveBeenCalledWith({
      where: { tagId: "tag-devops", positionId: { notIn: ["pos-td", "pos-sre"] } },
    });
    expect(db.pillarPosition.createMany).toHaveBeenCalledWith({
      data: [
        { tagId: "tag-devops", positionId: "pos-td" },
        { tagId: "tag-devops", positionId: "pos-sre" },
      ],
      skipDuplicates: true,
    });
  });

  it("refuses a Position from another workspace", async () => {
    db.position.count.mockResolvedValue(0);
    await expect(
      setPillarPositions({ db, userId: USER, tagId: "tag-devops", positionIds: ["elsewhere"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a member who is not an admin", async () => {
    roleMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(
      setPillarPositions({ db, userId: USER, tagId: "tag-devops", positionIds: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("setPillarDri", () => {
  beforeEach(() => {
    db.tag.findUnique.mockResolvedValue(tagRow() as never);
  });

  it("sets a human member of the workspace as DRI, for an admin", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u2", isAgent: false } as never);

    await expect(setPillarDri({ db, userId: USER, tagId: "tag-devops", driUserId: "u2" })).resolves.toEqual({
      driUserId: "u2",
    });

    expect(roleMock).toHaveBeenCalledWith(db, USER, WS, ["owner", "admin"]);
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: "u2", workspaceMemberships: { some: { workspaceId: WS } } },
      select: { id: true, isAgent: true },
    });
    expect(db.tag.update).toHaveBeenCalledWith({ where: { id: "tag-devops" }, data: { driUserId: "u2" } });
  });

  it("clears the DRI without looking anyone up", async () => {
    await setPillarDri({ db, userId: USER, tagId: "tag-devops", driUserId: null });
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.tag.update).toHaveBeenCalledWith({ where: { id: "tag-devops" }, data: { driUserId: null } });
  });

  it("refuses someone outside the workspace", async () => {
    db.user.findFirst.mockResolvedValue(null as never);
    await expect(
      setPillarDri({ db, userId: USER, tagId: "tag-devops", driUserId: "stranger" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.tag.update).not.toHaveBeenCalled();
  });

  it("refuses an agent account", async () => {
    db.user.findFirst.mockResolvedValue({ id: "agent-1", isAgent: true } as never);
    await expect(
      setPillarDri({ db, userId: USER, tagId: "tag-devops", driUserId: "agent-1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("not an agent") });
    expect(db.tag.update).not.toHaveBeenCalled();
  });

  it("refuses a member who is not an admin", async () => {
    roleMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(
      setPillarDri({ db, userId: USER, tagId: "tag-devops", driUserId: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.tag.update).not.toHaveBeenCalled();
  });

  it("only applies to Pillars", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow({ category: null }) as never);
    await expect(
      setPillarDri({ db, userId: USER, tagId: "tag-devops", driUserId: null }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("suggestPillarsFor", () => {
  it("matches the workspace's active Pillars against the text, for a member", async () => {
    db.tag.findMany.mockResolvedValue([
      { id: "devops", name: "DevOps", description: "Backups and monitoring for production", color: "c", archivedAt: null, positions: [] },
      { id: "gtm", name: "Go-to-market", description: "Pricing and launches", color: "c", archivedAt: null, positions: [] },
    ] as never);

    const ids = await suggestPillarsFor({ db, userId: USER, workspaceId: WS, text: "Nightly backups failed in production" });

    expect(membershipMock).toHaveBeenCalledWith(db, USER, WS);
    expect(db.tag.findMany.mock.calls[0]![0]!.where).toMatchObject({ archivedAt: null });
    expect(ids).toEqual(["devops"]);
  });
});

describe("createPillar", () => {
  it("creates a workspace tag that is a Pillar, for an admin", async () => {
    db.tag.findFirst.mockResolvedValue(null as never);
    db.tag.create.mockResolvedValue(tagRow() as never);

    await createPillar({ db, userId: USER, workspaceId: WS, name: "Go-to-market", color: "avatar-blue" });

    expect(roleMock).toHaveBeenCalledWith(db, USER, WS, ["owner", "admin"]);
    expect(db.tag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Go-to-market",
        slug: "go-to-market",
        category: "pillar",
        workspaceId: WS,
        description: null,
      }),
    });
  });

  it("points at promotion when the tag already exists", async () => {
    db.tag.findFirst.mockResolvedValue({ id: "tag-gtm" } as never);
    await expect(
      createPillar({ db, userId: USER, workspaceId: WS, name: "Go-to-market", color: "avatar-blue" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.tag.create).not.toHaveBeenCalled();
  });
});

describe("setPillarArchived", () => {
  it("marks a Pillar inactive without touching the items that carry it", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow() as never);
    db.tag.update.mockResolvedValue(tagRow() as never);

    await setPillarArchived({ db, userId: USER, tagId: "tag-devops", archived: true });

    expect(roleMock).toHaveBeenCalledWith(db, USER, WS, ["owner", "admin"]);
    expect(db.tag.update).toHaveBeenCalledWith({
      where: { id: "tag-devops" },
      data: { archivedAt: expect.any(Date) },
    });
    expect(db.actionTag.deleteMany).not.toHaveBeenCalled();
  });

  it("only applies to Pillars", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow({ category: null }) as never);
    await expect(
      setPillarArchived({ db, userId: USER, tagId: "tag-devops", archived: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getPillarPage", () => {
  beforeEach(() => {
    db.tag.findUnique.mockResolvedValue(tagRow() as never);
    db.project.findMany.mockResolvedValue([] as never);
    db.action.findMany.mockResolvedValue([] as never);
    db.ticket.findMany.mockResolvedValue([] as never);
    db.goal.findMany.mockResolvedValue([] as never);
    db.resource.findMany.mockResolvedValue([] as never);
    db.epic.findMany.mockResolvedValue([] as never);
    db.pillarPosition.findMany.mockResolvedValue([] as never);
    db.recurringTask.findMany.mockResolvedValue([] as never);
  });

  it("hides a tag that is not a Pillar", async () => {
    db.tag.findUnique.mockResolvedValue(tagRow({ category: null }) as never);
    await expect(getPillarPage({ db, userId: USER, tagId: "tag-devops" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("hides a Pillar from someone outside its workspace", async () => {
    membershipMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(getPillarPage({ db, userId: USER, tagId: "tag-devops" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  describe("by URL (workspace slug and tag slug)", () => {
    const byUrl = (pillar: string) => ({ db, userId: USER, workspaceSlug: "acme", pillar });

    it("finds the Pillar by its slug in that workspace, and returns the URL parts", async () => {
      db.tag.findFirst.mockResolvedValue(tagRow() as never);

      const page = await getPillarPage(byUrl("devops"));

      expect(db.tag.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: "devops", workspace: { slug: "acme" } } }),
      );
      expect(db.tag.findUnique).not.toHaveBeenCalled();
      expect(page.pillar).toMatchObject({ id: "tag-devops", slug: "devops", workspaceSlug: "acme" });
    });

    it("is NOT_FOUND for a slug nothing in the workspace has (an old slug after a rename, say)", async () => {
      db.tag.findFirst.mockResolvedValue(null);
      db.tag.findUnique.mockResolvedValue(null);
      await expect(getPillarPage(byUrl("ops"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("is NOT_FOUND for a slug that names a label, not a Pillar", async () => {
      db.tag.findFirst.mockResolvedValue(tagRow({ category: null }) as never);
      await expect(getPillarPage(byUrl("devops"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("hides a Pillar found by slug from someone outside its workspace", async () => {
      db.tag.findFirst.mockResolvedValue(tagRow() as never);
      membershipMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
      await expect(getPillarPage(byUrl("devops"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("still resolves an id in the slug's place (links made before slugs), with the slug to move to", async () => {
      db.tag.findFirst.mockResolvedValue(null);

      const page = await getPillarPage(byUrl("tag-devops"));

      expect(db.tag.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "tag-devops" } }),
      );
      expect(page.pillar).toMatchObject({ id: "tag-devops", slug: "devops", workspaceSlug: "acme" });
    });

    it("hides a Pillar found by id from someone outside its workspace", async () => {
      db.tag.findFirst.mockResolvedValue(null);
      membershipMock.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
      await expect(getPillarPage(byUrl("tag-devops"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("lists the Pillar's active projects with their open actions, tagged or not", async () => {
    const project = { id: "proj-1", name: "Migrate to Railway", actions: [action("untagged", false)] };
    db.project.findMany.mockResolvedValue([project] as never);

    const page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(page.projects).toEqual([project]);
    const where = db.project.findMany.mock.calls[0]![0]!.where!;
    expect(where).toEqual({
      AND: [{ projectAccess: true }, { pillarTags: { some: { tagId: "tag-devops" } }, status: "ACTIVE" }],
    });
  });

  it("takes loose work only from items with no project or epic, the viewer's access applied", async () => {
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    const actionWhere = db.action.findMany.mock.calls[0]![0]!.where!;
    expect(actionWhere.AND).toEqual(
      expect.arrayContaining([
        { actionAccess: true },
        { tags: { some: { tagId: "tag-devops" } } },
        { projectId: null, epicId: null },
      ]),
    );
    const ticketWhere = db.ticket.findMany.mock.calls[0]![0]!.where!;
    expect(ticketWhere.AND).toEqual(
      expect.arrayContaining([
        { ticketAccess: true },
        { product: { workspaceId: WS } },
        { tags: { some: { tagId: "tag-devops" } } },
        { epicId: null },
      ]),
    );
  });

  it("puts unassigned loose work first, keeping the query order otherwise", async () => {
    db.action.findMany.mockResolvedValueOnce([
      action("a-assigned", true),
      action("a-free-1", false),
      action("a-free-2", false),
    ] as never);
    db.ticket.findMany.mockResolvedValueOnce([ticket("t-assigned", true), ticket("t-free", false)] as never);

    const page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(page.looseWork.actions.map((a) => a.id)).toEqual(["a-free-1", "a-free-2", "a-assigned"]);
    expect(page.looseWork.tickets.map((t) => t.id)).toEqual(["t-free", "t-assigned"]);
  });

  it("still returns the page of an inactive Pillar", async () => {
    const archivedAt = new Date("2026-11-01");
    db.tag.findUnique.mockResolvedValue(tagRow({ archivedAt }) as never);

    const page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(page.pillar.archivedAt).toEqual(archivedAt);
  });

  it("lists the workspace's open objectives filed under the Pillar", async () => {
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(db.goal.findMany.mock.calls[0]![0]!.where).toEqual({
      workspaceId: WS,
      pillarTags: { some: { tagId: "tag-devops" } },
      status: { notIn: ["completed", "archived"] },
    });
  });

  it("lists only Resources the viewer owns or shares through a Project", async () => {
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(db.resource.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [
        { OR: [{ userId: USER }, { sharedResource: true }] },
        { workspaceId: WS, archivedAt: null },
        { pillarTags: { some: { tagId: "tag-devops" } } },
      ],
    });
  });

  it("lists the workspace's open epics under the Pillar", async () => {
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(db.epic.findMany.mock.calls[0]![0]!.where).toEqual({
      workspaceId: WS,
      tags: { some: { tagId: "tag-devops" } },
      status: { notIn: ["DONE", "CANCELLED"] },
    });
  });

  it("collects tagged work sitting in a project or epic that does not carry the Pillar", async () => {
    const inherited = { ...action("in-untagged-project", false), project: { id: "p", name: "Other" }, epic: null };
    db.action.findMany.mockResolvedValueOnce([] as never).mockResolvedValueOnce([inherited] as never);

    const page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(page.inheritedWork.actions).toEqual([inherited]);
    const carries = { some: { tagId: "tag-devops" } };
    expect(db.action.findMany.mock.calls[1]![0]!.where!.AND).toEqual(
      expect.arrayContaining([
        { tags: carries },
        { OR: [{ projectId: { not: null } }, { epicId: { not: null } }] },
        {
          NOT: {
            OR: [
              { project: { pillarTags: carries, status: "ACTIVE" } },
              { epic: { tags: carries, status: { notIn: ["DONE", "CANCELLED"] } } },
            ],
          },
        },
      ]),
    );
    expect(db.ticket.findMany.mock.calls[1]![0]!.where!.AND).toEqual(
      expect.arrayContaining([
        { epicId: { not: null } },
        { NOT: { epic: { tags: carries, status: { notIn: ["DONE", "CANCELLED"] } } } },
      ]),
    );
  });

  it("keeps open tagged work visible when its tagged container is finished and hidden", async () => {
    // The exclusion matches only containers the page lists: a DONE epic is not
    // listed while show completed is off, so its open tagged ticket must land
    // with the work filed from elsewhere. With the toggle on, the epic lists it.
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });
    const hiddenOff = db.ticket.findMany.mock.calls[1]![0]!.where!.AND as unknown[];
    expect(hiddenOff).toContainEqual({
      NOT: { epic: { tags: { some: { tagId: "tag-devops" } }, status: { notIn: ["DONE", "CANCELLED"] } } },
    });

    await getPillarPage({ db, userId: USER, tagId: "tag-devops", includeCompleted: true });
    const shownOn = db.ticket.findMany.mock.calls[3]![0]!.where!.AND as unknown[];
    expect(shownOn).toContainEqual({ NOT: { epic: { tags: { some: { tagId: "tag-devops" } } } } });
  });

  it("hides finished items unless show completed is on", async () => {
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });
    expect(db.project.findMany.mock.calls[0]![0]!.where!.AND).toContainEqual({
      pillarTags: { some: { tagId: "tag-devops" } },
      status: "ACTIVE",
    });
    expect(db.ticket.findMany.mock.calls[0]![0]!.where!.AND).toContainEqual({
      status: { notIn: ["DONE", "DEPLOYED", "ARCHIVED"] },
    });

    await getPillarPage({ db, userId: USER, tagId: "tag-devops", includeCompleted: true });

    // The second call of each: project, goal, epic once per page; tickets twice.
    expect(db.project.findMany.mock.calls[1]![0]!.where!.AND).toContainEqual({
      pillarTags: { some: { tagId: "tag-devops" } },
    });
    expect(db.ticket.findMany.mock.calls[2]![0]!.where!.AND).not.toContainEqual({
      status: { notIn: ["DONE", "DEPLOYED", "ARCHIVED"] },
    });
    expect(db.goal.findMany.mock.calls[1]![0]!.where).not.toHaveProperty("status");
    expect(db.epic.findMany.mock.calls[1]![0]!.where).not.toHaveProperty("status");
    // Deleted and draft actions never show.
    expect(db.action.findMany.mock.lastCall![0]!.where!.AND).toContainEqual({
      status: { notIn: ["DELETED", "DRAFT"] },
    });
  });

  it("lists accountable Positions with their holders, and flags a Pillar with none", async () => {
    let page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });
    expect(page.positions).toEqual([]);
    expect(page.hasNoPosition).toBe(true);

    db.pillarPosition.findMany.mockResolvedValue([
      {
        position: {
          id: "pos-td",
          title: "Technical Director",
          remit: "Production",
          holders: [{ workspaceUser: { user: { id: "u2", name: "Ana", image: null } } }],
        },
      },
    ] as never);
    page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });
    expect(page.hasNoPosition).toBe(false);
    expect(page.positions).toEqual([
      {
        id: "pos-td",
        title: "Technical Director",
        remit: "Production",
        holders: [{ id: "u2", name: "Ana", image: null }],
      },
    ]);
  });

  it("returns the Pillar's DRI apart from its Positions, and flags a Pillar with none", async () => {
    let page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });
    expect(page.dri).toBeNull();
    expect(page.hasNoDri).toBe(true);
    expect(db.user.findUnique).not.toHaveBeenCalled();

    db.tag.findUnique.mockResolvedValue(tagRow({ driUserId: "u2" }) as never);
    db.user.findUnique.mockResolvedValue({ id: "u2", name: "Ana", image: null } as never);
    page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u2" },
      select: { id: true, name: true, image: true },
    });
    expect(page.dri).toEqual({ id: "u2", name: "Ana", image: null });
    expect(page.hasNoDri).toBe(false);
  });

  it("lists running recurring duties the viewer can see, through the project or as creator", async () => {
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(db.recurringTask.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [
        { workspaceId: WS, pillarTags: { some: { tagId: "tag-devops" } } },
        { OR: [{ endDate: null }, { endDate: { gte: expect.any(Date) } }] },
        { OR: [{ createdById: USER }, { project: { projectAccess: true } }] },
      ],
    });
  });
});
