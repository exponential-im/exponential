import type { PrismaClient } from "@prisma/client";
import { couldBeHandle, normaliseHandle } from "~/lib/personHandle";

/**
 * Person page handles (`/people/<handle>`), server side.
 *
 * A handle is only ever another way to name a user id. Every `person`
 * procedure turns its route segment into an id here first and then runs the
 * ordinary scope guard (`resolvePersonScope`) on that id, so a handle the
 * viewer may not see gets exactly the answer an unknown id gets. Nothing in
 * this file may answer differently because a handle exists.
 */

/**
 * Turn a `/people/<segment>` route segment (a user id or a handle) into a user
 * id. Never throws and never says whether anything matched: a segment that
 * names nobody is returned unchanged and fails the scope guard like any
 * unknown id.
 *
 * An id wins over a handle. A handle can never be set to an existing id or to
 * the shape of a generated one, so the two only collide if an account is later
 * created with a hand-written id; that account keeps its own URL.
 */
export async function resolvePersonSubjectId(
  db: PrismaClient,
  segment: string,
): Promise<string> {
  // A generated id (or anything else that breaks the handle rules) cannot be a
  // handle, so the common case of an id link costs no extra query.
  if (!couldBeHandle(segment)) return segment;

  const handle = normaliseHandle(segment);
  const matches = await db.user.findMany({
    where: { OR: [{ id: segment }, { handle }] },
    select: { id: true },
    take: 2,
  });
  if (matches.some((user) => user.id === segment)) return segment;
  return matches[0]?.id ?? segment;
}
