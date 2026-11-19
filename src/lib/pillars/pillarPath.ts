/**
 * A Pillar page's URL (ADR-0086): the workspace's slug, then the tag's slug.
 * Every link to a Pillar page builds it here. An id in the slug's place still
 * resolves, and the page moves it onto this form.
 *
 * A tag named only in characters the slug rule drops (`健康`, an emoji) has an
 * empty slug; its URL keeps the id, or every link would open the list instead.
 */
export function pillarPath(workspaceSlug: string, pillar: { id: string; slug: string }): string {
  return `/w/${workspaceSlug}/pillars/${pillar.slug || pillar.id}`;
}
