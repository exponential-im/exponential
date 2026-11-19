/**
 * A Pillar page's URL (ADR-0086): the workspace's slug, then the tag's slug.
 * Every link to a Pillar page builds it here. An id in the slug's place still
 * resolves, and the page moves it onto this form.
 */
export function pillarPath(workspaceSlug: string, pillarSlug: string): string {
  return `/w/${workspaceSlug}/pillars/${pillarSlug}`;
}
