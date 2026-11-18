/** How long an active Project with no end date runs before it looks like a Pillar. */
export const LOOKS_ONGOING_AFTER_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A Project is finite. One that has been active for more than 90 days with
 * no end date may really be a standing area of work: a Pillar (ADR-0085).
 * Derived on read; nothing is stored.
 */
export function looksOngoing(
  project: { status: string; endDate: Date | string | null; createdAt: Date | string },
  now: Date = new Date(),
): boolean {
  if (project.status !== "ACTIVE" || project.endDate) return false;
  const ageMs = now.getTime() - new Date(project.createdAt).getTime();
  return ageMs > LOOKS_ONGOING_AFTER_DAYS * DAY_MS;
}
