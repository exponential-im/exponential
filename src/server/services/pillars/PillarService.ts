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
  buildTicketAccessWhere,
  buildWorkspaceProjectAccessWhere,
} from "~/server/services/access";
import { PILLAR_CATEGORY } from "~/types/tag";

/** Workspace roles that may promote, demote or archive a Pillar. */
export const PILLAR_ADMIN_ROLES = ["owner", "admin"] as const;

/** Action statuses that count as finished (or gone) on a Pillar page. */
const CLOSED_ACTION_STATUSES = ["COMPLETED", "CANCELLED", "DELETED", "DRAFT"];
/** Ticket statuses that count as finished on a Pillar page. */
const CLOSED_TICKET_STATUSES = ["DONE", "DEPLOYED", "ARCHIVED"] as const;
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

function sortUnassignedFirst<T>(items: T[], isAssigned: (item: T) => boolean): T[] {
  // Array.prototype.sort is stable, so the query's order holds within each half.
  return [...items].sort((a, b) => Number(isAssigned(a)) - Number(isAssigned(b)));
}

/**
 * Everything a Pillar page shows, in display order. See the module comment
 * for the membership rule.
 */
export async function getPillarPage({ db, userId, tagId }: PillarPageInput) {
  const pillar = await loadReadablePillar(db, userId, tagId);
  const workspaceId = pillar.workspaceId;
  const actionAccess = buildActionAccessWhere(userId);
  const openAction: Prisma.ActionWhereInput = {
    status: { notIn: CLOSED_ACTION_STATUSES },
  };
  const openTicket: Prisma.TicketWhereInput = {
    status: { notIn: [...CLOSED_TICKET_STATUSES] },
  };
  const projectAccess = await buildWorkspaceProjectAccessWhere(db, userId, workspaceId);

  const [projects, looseActions, looseTickets] = await Promise.all([
    db.project.findMany({
      where: {
        AND: [
          projectAccess,
          { pillarTags: { some: { tagId } } },
          { status: "ACTIVE" },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        progress: true,
        endDate: true,
        actions: {
          where: { AND: [actionAccess, openAction] },
          select: actionSelect,
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
          take: CONTAINER_WORK_LIMIT,
        },
      },
      orderBy: { name: "asc" },
    }),
    db.action.findMany({
      where: {
        AND: [
          actionAccess,
          openAction,
          { tags: { some: { tagId } } },
          { projectId: null, epicId: null },
        ],
      },
      select: actionSelect,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.ticket.findMany({
      where: {
        AND: [
          buildTicketAccessWhere(userId),
          openTicket,
          { product: { workspaceId } },
          { tags: { some: { tagId } } },
          { epicId: null },
        ],
      },
      select: ticketSelect,
      orderBy: [{ priority: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
  ]);

  const looseWork: PillarLooseWork = {
    actions: sortUnassignedFirst(looseActions, (a) => a.assignees.length > 0),
    tickets: sortUnassignedFirst(looseTickets, (t) => t.assignee !== null),
  };

  return {
    pillar: {
      id: pillar.id,
      name: pillar.name,
      color: pillar.color,
      description: pillar.description,
      archivedAt: pillar.archivedAt,
      workspaceId,
    },
    projects,
    looseWork,
  };
}

export type PillarPage = Awaited<ReturnType<typeof getPillarPage>>;
