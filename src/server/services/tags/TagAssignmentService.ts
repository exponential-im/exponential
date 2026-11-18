import type { PrismaClient, Tag } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  assertWorkspaceMembership,
  assertWorkspaceWriteRole,
  canEditAction,
  canEditProject,
  getActionAccess,
  getProjectAccess,
  hasProjectAccess,
} from "~/server/services/access";
import { PILLAR_CATEGORY } from "~/types/tag";

export type TagEntityType = "action" | "ticket" | "feature" | "epic" | "project";

/**
 * Entities that take Pillars only, never ordinary labels (ADR-0085): a
 * Project, Goal or Resource is filed under a standing area, not labelled.
 */
const PILLAR_ONLY_ENTITY_TYPES: ReadonlySet<TagEntityType> = new Set(["project"]);

interface EntityResolution {
  workspaceId: string;
  /** Existing tag IDs on the entity (in stable order). */
  currentTagIds: string[];
}

interface SetEntityTagsInput {
  db: PrismaClient;
  userId: string;
  entityType: TagEntityType;
  entityId: string;
  tagIds: string[];
}

interface ListForEntityInput {
  db: PrismaClient;
  userId: string;
  entityType: TagEntityType;
  entityId: string;
}

interface SetEntityTagsResult {
  entityType: TagEntityType;
  entityId: string;
  tags: Tag[];
}

/**
 * Loads the entity's workspace and current tags, and checks the caller may
 * read (`"view"`) or change (`"edit"`) its tags. For a ticket, feature or
 * epic that is workspace membership to read and a write role to change: a
 * read-only viewer sees tags but never sets them. An action is gated on its
 * own edit rule either way.
 */
async function resolveEntity(
  db: PrismaClient,
  userId: string,
  entityType: TagEntityType,
  entityId: string,
  level: "view" | "edit",
): Promise<EntityResolution> {
  switch (entityType) {
    case "action": {
      const action = await db.action.findUnique({
        where: { id: entityId },
        select: {
          workspaceId: true,
          project: { select: { workspaceId: true } },
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!action) throwNotFound("Action");
      const access = await getActionAccess(db, userId, entityId);
      if (!access || !canEditAction(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to tag this action",
        });
      }
      const workspaceId = action.workspaceId ?? action.project?.workspaceId ?? null;
      if (!workspaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Action has no workspace; cannot validate tag scope",
        });
      }
      return {
        workspaceId,
        currentTagIds: action.tags.map((t) => t.tagId),
      };
    }
    case "ticket": {
      const ticket = await db.ticket.findUnique({
        where: { id: entityId },
        select: {
          product: { select: { workspaceId: true } },
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!ticket) throwNotFound("Ticket");
      await requireWorkspaceAccess(db, userId, ticket.product.workspaceId, level);
      return {
        workspaceId: ticket.product.workspaceId,
        currentTagIds: ticket.tags.map((t) => t.tagId),
      };
    }
    case "feature": {
      const feature = await db.feature.findUnique({
        where: { id: entityId },
        select: {
          product: { select: { workspaceId: true } },
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!feature) throwNotFound("Feature");
      await requireWorkspaceAccess(db, userId, feature.product.workspaceId, level);
      return {
        workspaceId: feature.product.workspaceId,
        currentTagIds: feature.tags.map((t) => t.tagId),
      };
    }
    case "epic": {
      const epic = await db.epic.findUnique({
        where: { id: entityId },
        select: {
          workspaceId: true,
          tags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!epic) throwNotFound("Epic");
      await requireWorkspaceAccess(db, userId, epic.workspaceId, level);
      return {
        workspaceId: epic.workspaceId,
        currentTagIds: epic.tags.map((t) => t.tagId),
      };
    }
    case "project": {
      const project = await db.project.findUnique({
        where: { id: entityId },
        select: {
          workspaceId: true,
          pillarTags: { select: { tagId: true }, orderBy: { createdAt: "asc" } },
        },
      });
      if (!project) throwNotFound("Project");
      const access = await getProjectAccess(db, userId, entityId);
      const allowed = level === "edit" ? canEditProject(access) : hasProjectAccess(access);
      if (!allowed) {
        // A project the caller cannot see stays hidden.
        if (!hasProjectAccess(access)) throwNotFound("Project");
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to change this project's Pillars",
        });
      }
      return {
        workspaceId: requireEntityWorkspace(project.workspaceId, "Project"),
        currentTagIds: project.pillarTags.map((t) => t.tagId),
      };
    }
  }
}

/** A tag is workspace-scoped, so an entity with no workspace carries none. */
function requireEntityWorkspace(workspaceId: string | null, label: string): string {
  if (!workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} has no workspace; cannot validate tag scope`,
    });
  }
  return workspaceId;
}

function throwNotFound(label: string): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: `${label} not found`,
  });
}

async function requireWorkspaceAccess(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  level: "view" | "edit",
): Promise<void> {
  // Centralized resolvers: direct OR team-based membership. A hand-rolled
  // workspaceUser lookup here used to deny team-based members.
  if (level === "edit") await assertWorkspaceWriteRole(db, userId, workspaceId);
  else await assertWorkspaceMembership(db, userId, workspaceId);
}

/**
 * Every tag must be global or belong to the entity's workspace. A Pillar-only
 * entity takes only this workspace's Pillars. An inactive (archived) Pillar is
 * never newly added, but one already on the entity stays.
 */
async function validateTagsForWorkspace(
  db: PrismaClient,
  entityType: TagEntityType,
  workspaceId: string,
  tagIds: string[],
  currentTagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const validTags = await db.tag.findMany({
    where: {
      id: { in: tagIds },
      OR: [{ workspaceId: null }, { workspaceId }],
    },
    select: { id: true, category: true, workspaceId: true, archivedAt: true },
  });
  if (validTags.length !== tagIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more tags are not available in this workspace",
    });
  }
  if (PILLAR_ONLY_ENTITY_TYPES.has(entityType)) {
    const nonPillar = validTags.some(
      (t) => t.category !== PILLAR_CATEGORY || t.workspaceId !== workspaceId,
    );
    if (nonPillar) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `A ${entityType} can only be filed under this workspace's Pillars`,
      });
    }
  }
  const current = new Set(currentTagIds);
  if (validTags.some((t) => t.archivedAt && !current.has(t.id))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An inactive Pillar cannot be added",
    });
  }
}

async function applyTagSet(
  db: PrismaClient,
  entityType: TagEntityType,
  entityId: string,
  desiredTagIds: string[],
  currentTagIds: string[],
): Promise<void> {
  const desired = new Set(desiredTagIds);
  const current = new Set(currentTagIds);
  const toAdd = desiredTagIds.filter((id) => !current.has(id));
  const toRemove = currentTagIds.filter((id) => !desired.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) return;

  await db.$transaction(async (tx) => {
    switch (entityType) {
      case "action":
        if (toRemove.length > 0) {
          await tx.actionTag.deleteMany({
            where: { actionId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.actionTag.createMany({
            data: toAdd.map((tagId) => ({ actionId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
      case "ticket":
        if (toRemove.length > 0) {
          await tx.ticketTag.deleteMany({
            where: { ticketId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.ticketTag.createMany({
            data: toAdd.map((tagId) => ({ ticketId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
      case "feature":
        if (toRemove.length > 0) {
          await tx.featureTag.deleteMany({
            where: { featureId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.featureTag.createMany({
            data: toAdd.map((tagId) => ({ featureId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
      case "epic":
        if (toRemove.length > 0) {
          await tx.epicTag.deleteMany({
            where: { epicId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.epicTag.createMany({
            data: toAdd.map((tagId) => ({ epicId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
      case "project":
        if (toRemove.length > 0) {
          await tx.projectTag.deleteMany({
            where: { projectId: entityId, tagId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.projectTag.createMany({
            data: toAdd.map((tagId) => ({ projectId: entityId, tagId })),
            skipDuplicates: true,
          });
        }
        return;
    }
  });
}

async function loadTagsForEntity(
  db: PrismaClient,
  entityType: TagEntityType,
  entityId: string,
): Promise<Tag[]> {
  switch (entityType) {
    case "action": {
      const rows = await db.actionTag.findMany({
        where: { actionId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
    case "ticket": {
      const rows = await db.ticketTag.findMany({
        where: { ticketId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
    case "feature": {
      const rows = await db.featureTag.findMany({
        where: { featureId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
    case "epic": {
      const rows = await db.epicTag.findMany({
        where: { epicId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
    case "project": {
      const rows = await db.projectTag.findMany({
        where: { projectId: entityId },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => r.tag);
    }
  }
}

export async function setEntityTags({
  db,
  userId,
  entityType,
  entityId,
  tagIds,
}: SetEntityTagsInput): Promise<SetEntityTagsResult> {
  const uniqueTagIds = [...new Set(tagIds)];

  const { workspaceId, currentTagIds } = await resolveEntity(
    db,
    userId,
    entityType,
    entityId,
    "edit",
  );

  await validateTagsForWorkspace(db, entityType, workspaceId, uniqueTagIds, currentTagIds);
  await applyTagSet(db, entityType, entityId, uniqueTagIds, currentTagIds);

  const tags = await loadTagsForEntity(db, entityType, entityId);
  return { entityType, entityId, tags };
}

export async function listForEntity({
  db,
  userId,
  entityType,
  entityId,
}: ListForEntityInput): Promise<Tag[]> {
  await resolveEntity(db, userId, entityType, entityId, "view");
  return loadTagsForEntity(db, entityType, entityId);
}
