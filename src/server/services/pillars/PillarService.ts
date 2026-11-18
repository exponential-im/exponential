/**
 * Pillars (ADR-0085): a Pillar is a workspace Tag with `category = "pillar"`,
 * promoted to have its own page. This service owns promotion and the Pillar
 * page read.
 *
 * Membership on the page is a read rule, never a write: an item belongs to a
 * Pillar when it carries the Pillar's tag itself, or when its Project or Epic
 * does. Adding or removing a container's Pillar never touches its contents.
 *
 * Every section is filtered with the existing access builders, so a viewer
 * sees on a Pillar page only what they could already see elsewhere.
 */

import type { Prisma, PrismaClient, Tag } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  assertWorkspaceMembership,
  assertWorkspaceRole,
  buildActionAccessWhere,
  buildSharedResourceWhere,
  buildTicketAccessWhere,
  buildWorkspaceProjectAccessWhere,
} from "~/server/services/access";
import { PILLAR_CATEGORY } from "~/types/tag";

/** Workspace roles that may promote, demote or archive a Pillar. */
export const PILLAR_ADMIN_ROLES = ["owner", "admin"] as const;

/** Action statuses never shown on a Pillar page: gone, or not yet real. */
const HIDDEN_ACTION_STATUSES = ["DELETED", "DRAFT"];
/** Action statuses that count as finished (or gone) on a Pillar page. */
const CLOSED_ACTION_STATUSES = ["COMPLETED", "CANCELLED", ...HIDDEN_ACTION_STATUSES];
/** Ticket statuses that count as finished on a Pillar page. */
const CLOSED_TICKET_STATUSES = ["DONE", "DEPLOYED", "ARCHIVED"] as const;
/** Epic statuses that count as finished on a Pillar page. */
const CLOSED_EPIC_STATUSES = ["DONE", "CANCELLED"] as const;
/** Objective statuses that count as finished on a Pillar page. */
const CLOSED_GOAL_STATUSES = ["completed", "archived"];
/** How many open Actions to list under each Project on the page. */
const CONTAINER_WORK_LIMIT = 10;

const userSelect = { id: true, name: true, image: true } as const;

const actionSelect = {
  id: true,
  name: true,
  status: true,
  priority: true,
  dueDate: true,
  projectId: true,
  epicId: true,
  assignees: { select: { user: { select: userSelect } } },
} satisfies Prisma.ActionSelect;

const ticketSelect = {
  id: true,
  title: true,
  shortId: true,
  number: true,
  status: true,
  epicId: true,
  assignee: { select: userSelect },
  product: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.TicketSelect;

export type PillarPageAction = Prisma.ActionGetPayload<{ select: typeof actionSelect }>;
export type PillarPageTicket = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

export interface PillarLooseWork {
  actions: PillarPageAction[];
  tickets: PillarPageTicket[];
}

export interface PillarPageInput {
  db: PrismaClient;
  userId: string;
  tagId: string;
  /** Show finished goals, projects, epics and work too. */
  includeCompleted?: boolean;
}

function pillarNotFound(): TRPCError {
  return new TRPCError({ code: "NOT_FOUND", message: "Pillar not found" });
}

/**
 * Load a Pillar the caller may read: a workspace tag promoted to a Pillar, in
 * a workspace the caller belongs to. Anything else is NOT_FOUND, so a Pillar's
 * existence stays hidden from non-members.
 */
export async function loadReadablePillar(
  db: PrismaClient,
  userId: string,
  tagId: string,
): Promise<Tag & { workspaceId: string }> {
  const tag = await db.tag.findUnique({ where: { id: tagId } });
  if (!tag || tag.category !== PILLAR_CATEGORY || !tag.workspaceId) {
    throw pillarNotFound();
  }
  try {
    await assertWorkspaceMembership(db, userId, tag.workspaceId);
  } catch {
    throw pillarNotFound();
  }
  return { ...tag, workspaceId: tag.workspaceId };
}

/**
 * Promote a workspace tag to a Pillar, or demote it back to a label. Only a
 * workspace owner or admin may do either. Which items carry the tag never
 * changes. Global and system tags belong to no workspace and are never Pillars.
 */
export async function setPillar({
  db,
  userId,
  tagId,
  isPillar,
}: {
  db: PrismaClient;
  userId: string;
  tagId: string;
  isPillar: boolean;
}): Promise<Tag> {
  const tag = await db.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
  if (tag.isSystem || !tag.workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only a workspace's own tags can be Pillars",
    });
  }
  await assertWorkspaceRole(db, userId, tag.workspaceId, PILLAR_ADMIN_ROLES);
  return db.tag.update({
    where: { id: tagId },
    data: isPillar
      ? { category: PILLAR_CATEGORY }
      : // Demoting clears the inactive flag too: it only means something on a Pillar.
        { category: null, archivedAt: null },
  });
}

/**
 * The workspace's Pillars, by name, for any member. Inactive ones only when
 * asked for (the list page's toggle); the sidebar and pickers never show them.
 */
export async function listPillars({
  db,
  userId,
  workspaceId,
  includeArchived = false,
}: {
  db: PrismaClient;
  userId: string;
  workspaceId: string;
  includeArchived?: boolean;
}) {
  await assertWorkspaceMembership(db, userId, workspaceId);
  return db.tag.findMany({
    where: {
      workspaceId,
      category: PILLAR_CATEGORY,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    select: {
      id: true,
      name: true,
      color: true,
      description: true,
      archivedAt: true,
      positions: { select: { positionId: true } },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Check the Pillars a capture ticked (the Chrome extension, Save link, quick
 * add) and return the one workspace they belong to. Each must be an active
 * Pillar, and all of one workspace: a capture files into one workspace.
 * Membership of that workspace is the caller's own check, since it differs
 * for agents.
 */
export async function resolveCapturePillars(
  db: PrismaClient,
  tagIds: readonly string[],
): Promise<string | null> {
  const ids = [...new Set(tagIds)];
  if (ids.length === 0) return null;
  const tags = await db.tag.findMany({
    where: { id: { in: ids } },
    select: { id: true, category: true, workspaceId: true, archivedAt: true },
  });
  const workspaceIds = new Set(tags.map((t) => t.workspaceId));
  const [workspaceId] = workspaceIds;
  if (
    tags.length !== ids.length ||
    workspaceIds.size !== 1 ||
    !workspaceId ||
    tags.some((t) => t.category !== PILLAR_CATEGORY || t.archivedAt)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Pillars must be active Pillars of one workspace",
    });
  }
  return workspaceId;
}

/**
 * Set the Positions shown as accountable for a Pillar (replace-all).
 * Admin-only, like the rest of a Pillar's settings. Display only: nothing
 * assigns or routes work through them (ADR-0085).
 */
export async function setPillarPositions({
  db,
  userId,
  tagId,
  positionIds,
}: {
  db: PrismaClient;
  userId: string;
  tagId: string;
  positionIds: string[];
}): Promise<{ positionIds: string[] }> {
  const tag = await db.tag.findUnique({ where: { id: tagId } });
  if (!tag || tag.category !== PILLAR_CATEGORY || !tag.workspaceId) throw pillarNotFound();
  await assertWorkspaceRole(db, userId, tag.workspaceId, PILLAR_ADMIN_ROLES);
  const ids = [...new Set(positionIds)];
  if (ids.length > 0) {
    const found = await db.position.count({
      where: { id: { in: ids }, workspaceId: tag.workspaceId },
    });
    if (found !== ids.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Every Position must belong to the Pillar's workspace",
      });
    }
  }
  await db.$transaction([
    db.pillarPosition.deleteMany({ where: { tagId, positionId: { notIn: ids } } }),
    db.pillarPosition.createMany({
      data: ids.map((positionId) => ({ tagId, positionId })),
      skipDuplicates: true,
    }),
  ]);
  return { positionIds: ids };
}

/** Slug rule shared with `tag.create`. */
export function slugifyTagName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Create a new workspace tag that is a Pillar from the start (workspace
 * settings). Admin-only, like promotion.
 */
export async function createPillar({
  db,
  userId,
  workspaceId,
  name,
  color,
  description,
}: {
  db: PrismaClient;
  userId: string;
  workspaceId: string;
  name: string;
  color: string;
  description?: string;
}): Promise<Tag> {
  await assertWorkspaceRole(db, userId, workspaceId, PILLAR_ADMIN_ROLES);
  const slug = slugifyTagName(name);
  const existing = await db.tag.findFirst({ where: { slug, workspaceId }, select: { id: true } });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A tag with this name already exists in this workspace. Promote it instead.",
    });
  }
  return db.tag.create({
    data: {
      name,
      slug,
      color,
      description: description?.trim() ? description : null,
      category: PILLAR_CATEGORY,
      workspaceId,
      createdById: userId,
      isSystem: false,
    },
  });
}

/**
 * Mark a Pillar inactive, or active again. Admin-only. Its tag stays on every
 * item; an inactive Pillar is hidden from pickers and the sidebar.
 */
export async function setPillarArchived({
  db,
  userId,
  tagId,
  archived,
}: {
  db: PrismaClient;
  userId: string;
  tagId: string;
  archived: boolean;
}): Promise<Tag> {
  const tag = await db.tag.findUnique({ where: { id: tagId } });
  if (!tag || tag.category !== PILLAR_CATEGORY || !tag.workspaceId) throw pillarNotFound();
  await assertWorkspaceRole(db, userId, tag.workspaceId, PILLAR_ADMIN_ROLES);
  return db.tag.update({
    where: { id: tagId },
    data: { archivedAt: archived ? (tag.archivedAt ?? new Date()) : null },
  });
}

function sortUnassignedFirst<T>(items: T[], isAssigned: (item: T) => boolean): T[] {
  // Array.prototype.sort is stable, so the query's order holds within each half.
  return [...items].sort((a, b) => Number(isAssigned(a)) - Number(isAssigned(b)));
}

/**
 * Everything a Pillar page shows, in display order. See the module comment
 * for the membership rule. Finished items are left out unless
 * `includeCompleted` is set.
 */
export async function getPillarPage({ db, userId, tagId, includeCompleted = false }: PillarPageInput) {
  const pillar = await loadReadablePillar(db, userId, tagId);
  const workspaceId = pillar.workspaceId;
  const actionAccess = buildActionAccessWhere(userId);
  const ticketAccess = buildTicketAccessWhere(userId);
  const actionStatus: Prisma.ActionWhereInput = {
    status: { notIn: includeCompleted ? HIDDEN_ACTION_STATUSES : CLOSED_ACTION_STATUSES },
  };
  const ticketStatus: Prisma.TicketWhereInput = includeCompleted
    ? {}
    : { status: { notIn: [...CLOSED_TICKET_STATUSES] } };
  const carriesTag = { some: { tagId } };
  const [projectAccess, sharedResources] = await Promise.all([
    buildWorkspaceProjectAccessWhere(db, userId, workspaceId),
    buildSharedResourceWhere(db, userId, { workspaceId }),
  ]);
  // A Resource is private to its owner unless filed under a Project the viewer is in.
  const resourceAccess: Prisma.ResourceWhereInput = {
    OR: [{ userId }, ...(sharedResources ? [sharedResources] : [])],
  };
  const containerActions = {
    where: { AND: [actionAccess, actionStatus] },
    select: actionSelect,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: CONTAINER_WORK_LIMIT,
  } satisfies Prisma.Project$actionsArgs;
  // The containers the page lists: the same filters as the projects and epics
  // sections below. Work inside one of them is shown there.
  const shownProject: Prisma.ProjectWhereInput = {
    pillarTags: carriesTag,
    ...(includeCompleted ? {} : { status: "ACTIVE" }),
  };
  const shownEpic: Prisma.EpicWhereInput = {
    tags: carriesTag,
    ...(includeCompleted ? {} : { status: { notIn: [...CLOSED_EPIC_STATUSES] } }),
  };
  // Work that carries the Pillar itself inside a Project or Epic the page does
  // not list (untagged, or finished while "Show completed" is off): listed on
  // its own so it is not lost.
  const outsideShownContainers = {
    NOT: [{ project: shownProject }, { epic: shownEpic }],
  } satisfies Prisma.ActionWhereInput;

  const [
    positions,
    goals,
    projects,
    epics,
    looseActions,
    looseTickets,
    inheritedActions,
    inheritedTickets,
    recurring,
    resources,
  ] = await Promise.all([
    // Who is accountable: Positions and their holders, readable by any member.
    db.pillarPosition.findMany({
      where: { tagId },
      select: {
        position: {
          select: {
            id: true,
            title: true,
            remit: true,
            holders: {
              select: { workspaceUser: { select: { user: { select: userSelect } } } },
            },
          },
        },
      },
      orderBy: { position: { title: "asc" } },
    }),
    // Objectives in a workspace are readable by every member of it.
    db.goal.findMany({
      where: {
        workspaceId,
        pillarTags: carriesTag,
        ...(includeCompleted ? {} : { status: { notIn: CLOSED_GOAL_STATUSES } }),
      },
      select: {
        id: true,
        title: true,
        status: true,
        period: true,
        dueDate: true,
        driUser: { select: userSelect },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
    }),
    db.project.findMany({
      where: {
        AND: [
          projectAccess,
          shownProject,
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        progress: true,
        endDate: true,
        actions: containerActions,
      },
      orderBy: { name: "asc" },
    }),
    // Epics are workspace content: membership (checked above) reads them.
    db.epic.findMany({
      where: { workspaceId, ...shownEpic },
      select: {
        id: true,
        name: true,
        status: true,
        product: { select: { slug: true } },
        tickets: {
          where: { AND: [ticketAccess, ticketStatus] },
          select: ticketSelect,
          orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
          take: CONTAINER_WORK_LIMIT,
        },
        actions: containerActions,
      },
      orderBy: { name: "asc" },
    }),
    db.action.findMany({
      where: {
        AND: [actionAccess, actionStatus, { tags: carriesTag }, { projectId: null, epicId: null }],
      },
      select: actionSelect,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.ticket.findMany({
      where: {
        AND: [ticketAccess, ticketStatus, { product: { workspaceId } }, { tags: carriesTag }, { epicId: null }],
      },
      select: ticketSelect,
      orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.action.findMany({
      where: {
        AND: [
          actionAccess,
          actionStatus,
          { tags: carriesTag },
          { OR: [{ projectId: { not: null } }, { epicId: { not: null } }] },
          outsideShownContainers,
        ],
      },
      select: {
        ...actionSelect,
        project: { select: { id: true, name: true } },
        epic: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.ticket.findMany({
      where: {
        AND: [
          ticketAccess,
          ticketStatus,
          { product: { workspaceId } },
          { tags: carriesTag },
          { epicId: { not: null } },
          { NOT: { epic: shownEpic } },
        ],
      },
      select: { ...ticketSelect, epic: { select: { id: true, name: true } } },
      orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    // Recurring duties still running: no end date, or one still ahead. Seen
    // like an Action: through the project, or by their creator.
    db.recurringTask.findMany({
      where: {
        AND: [
          { workspaceId, pillarTags: carriesTag },
          { OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
          { OR: [{ createdById: userId }, { project: projectAccess }] },
        ],
      },
      select: {
        id: true,
        name: true,
        repeatPattern: true,
        repeatDays: true,
        repeatInterval: true,
        project: { select: { id: true, name: true, slug: true } },
        createdBy: { select: userSelect },
      },
      orderBy: { name: "asc" },
    }),
    db.resource.findMany({
      where: {
        AND: [resourceAccess, { workspaceId, archivedAt: null }, { pillarTags: carriesTag }],
      },
      select: {
        id: true,
        title: true,
        url: true,
        contentType: true,
        readStatus: true,
        user: { select: userSelect },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    pillar: {
      id: pillar.id,
      name: pillar.name,
      color: pillar.color,
      description: pillar.description,
      archivedAt: pillar.archivedAt,
      workspaceId,
    },
    positions: positions.map(({ position: { holders, ...position } }) => ({
      ...position,
      holders: holders.map((h) => h.workspaceUser.user),
    })),
    // A Pillar nobody is accountable for is flagged on its page.
    hasNoPosition: positions.length === 0,
    goals,
    projects,
    epics,
    looseWork: {
      actions: sortUnassignedFirst(looseActions, (a) => a.assignees.length > 0),
      tickets: sortUnassignedFirst(looseTickets, (t) => t.assignee !== null),
    } satisfies PillarLooseWork,
    inheritedWork: { actions: inheritedActions, tickets: inheritedTickets },
    recurring,
    resources,
  };
}

export type PillarPage = Awaited<ReturnType<typeof getPillarPage>>;
