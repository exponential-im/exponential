/**
 * Team Access Resolver
 *
 * Resolves team membership and role for a given user.
 * Single source of truth for "does this user belong to this team?"
 */

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import type { TeamMembership, TeamRole } from "../types";

export async function getTeamMembership(
  db: PrismaClient,
  userId: string,
  teamId: string,
): Promise<TeamMembership | null> {
  const membership = await db.teamUser.findUnique({
    where: {
      userId_teamId: { userId, teamId },
    },
    select: { role: true, teamId: true },
  });

  if (!membership) return null;

  return {
    role: membership.role as TeamRole,
    teamId: membership.teamId,
  };
}

/**
 * Assert that the user belongs to the team, at any role, throwing `FORBIDDEN`
 * otherwise. Returns the membership.
 *
 * For a write that names a team by id without being a team procedure, where
 * the `requireTeamMembership` middleware does not fit because the id is
 * optional: `project.create` filing a new project under a team. Every team
 * member may edit the team's resources (`TEAM_PERMISSION_MAP.edit`), so
 * membership is the whole test. A team that does not exist answers the same
 * as one the user is not in.
 */
export async function assertTeamMembership(
  db: PrismaClient,
  userId: string,
  teamId: string,
): Promise<TeamMembership> {
  const membership = await getTeamMembership(db, userId, teamId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this team.",
    });
  }
  return membership;
}

/** Get all teams a user belongs to */
export async function getUserTeams(
  db: PrismaClient,
  userId: string,
): Promise<TeamMembership[]> {
  const memberships = await db.teamUser.findMany({
    where: { userId },
    select: { role: true, teamId: true },
  });

  return memberships.map((m) => ({
    role: m.role as TeamRole,
    teamId: m.teamId,
  }));
}
