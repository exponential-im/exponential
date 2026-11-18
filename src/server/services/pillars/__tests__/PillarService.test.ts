/**
 * PillarService (ADR-0085): promotion guards and which items land in which
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
import { createPillar, getPillarPage, listPillars, setPillar, setPillarArchived } from "../PillarService";

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

  it("lists the Pillar's active projects with their open actions, tagged or not", async () => {
    const project = { id: "proj-1", name: "Migrate to Railway", actions: [action("untagged", false)] };
    db.project.findMany.mockResolvedValue([project] as never);

    const page = await getPillarPage({ db, userId: USER, tagId: "tag-devops" });

    expect(page.projects).toEqual([project]);
    const where = db.project.findMany.mock.calls[0]![0]!.where!;
    expect(where).toEqual({
      AND: [{ projectAccess: true }, { pillarTags: { some: { tagId: "tag-devops" } } }, { status: "ACTIVE" }],
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
        { NOT: [{ project: { pillarTags: carries } }, { epic: { tags: carries } }] },
      ]),
    );
    expect(db.ticket.findMany.mock.calls[1]![0]!.where!.AND).toEqual(
      expect.arrayContaining([{ epicId: { not: null } }, { NOT: { epic: { tags: carries } } }]),
    );
  });

  it("hides finished items unless show completed is on", async () => {
    await getPillarPage({ db, userId: USER, tagId: "tag-devops" });
    expect(db.project.findMany.mock.calls[0]![0]!.where!.AND).toContainEqual({ status: "ACTIVE" });
    expect(db.ticket.findMany.mock.calls[0]![0]!.where!.AND).toContainEqual({
      status: { notIn: ["DONE", "DEPLOYED", "ARCHIVED"] },
    });

    await getPillarPage({ db, userId: USER, tagId: "tag-devops", includeCompleted: true });

    // The second call of each: project, goal, epic once per page; tickets twice.
    expect(db.project.findMany.mock.calls[1]![0]!.where!.AND).not.toContainEqual({ status: "ACTIVE" });
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
});
