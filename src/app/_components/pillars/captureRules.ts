/**
 * Capture asks Workspace, then Pillars, then an optional Project (ADR-0085).
 * The pure rules of that picker, shared by every capture surface.
 */

export interface CaptureProject {
  id: string;
  pillarTagIds: readonly string[];
}

/**
 * The projects to offer once Pillars are ticked: those under any ticked
 * Pillar. With none ticked, every project.
 */
export function projectsForPillars<P extends CaptureProject>(
  projects: readonly P[],
  tagIds: readonly string[],
): P[] {
  if (tagIds.length === 0) return [...projects];
  const ticked = new Set(tagIds);
  return projects.filter((p) => p.pillarTagIds.some((id) => ticked.has(id)));
}

/**
 * Choosing a project ticks its Pillars too, keeping what was already ticked.
 * Clearing the project leaves the ticks alone.
 */
export function pillarsAfterProjectChoice(
  tagIds: readonly string[],
  project: CaptureProject | null,
): string[] {
  if (!project) return [...tagIds];
  return [...new Set([...tagIds, ...project.pillarTagIds])];
}
