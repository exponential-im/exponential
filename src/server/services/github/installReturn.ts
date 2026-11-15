import type { PrismaClient } from "@prisma/client";
import { getWorkspaceMembership } from "~/server/services/access";
import {
  workspaceGithubSettingsPath,
  type GithubInstallResult,
} from "~/lib/github/installResult";

/** The workspace id an install was started from, read from the `state` it carried. */
export function workspaceIdFromInstallState(
  state: string | null | undefined,
): string | null {
  if (!state) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(state, "base64").toString());
    const workspaceId = (parsed as { workspaceId?: unknown } | null)
      ?.workspaceId;
    return typeof workspaceId === "string" && workspaceId ? workspaceId : null;
  } catch {
    return null;
  }
}

/**
 * Where to send someone whose GitHub App install was started from a workspace:
 * that workspace's GitHub section, saying how it went.
 *
 * Null when the state names no workspace (the legacy project flow) or one the
 * caller cannot open, so nobody is redirected into a workspace that would turn
 * them away. This only chooses a redirect target; it grants nothing.
 */
export async function resolveInstallReturnPath(
  db: PrismaClient,
  state: string | null | undefined,
  userId: string,
  result?: GithubInstallResult,
): Promise<string | null> {
  const workspaceId = workspaceIdFromInstallState(state);
  if (!workspaceId) return null;

  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!membership) return null;

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (!workspace) return null;

  return workspaceGithubSettingsPath(workspace.slug, result);
}
