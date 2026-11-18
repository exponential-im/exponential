/**
 * What a Product owner's next sign-off would change on the public brief
 * (D-0091). Pure, so the router and the review screen agree on it.
 */

export type PendingChange = "new" | "reworded" | "removed";

export interface SnapshotRow {
  draftText: string;
  draftWhy: string;
  publicText: string | null;
  publicWhy: string | null;
  removeRequested: boolean;
  removedAt: Date | string | null;
}

/** The change waiting on this row, or null when the public version matches the draft. */
export function pendingChange(row: SnapshotRow): PendingChange | null {
  if (row.removedAt) return null;
  if (row.removeRequested) return row.publicText === null ? null : "removed";
  if (row.publicText === null) return "new";
  if (row.publicText !== row.draftText || row.publicWhy !== row.draftWhy) return "reworded";
  return null;
}
