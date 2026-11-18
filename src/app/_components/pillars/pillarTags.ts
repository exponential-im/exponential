import { PILLAR_CATEGORY } from "~/types/tag";

export interface PickableTag {
  id: string;
  category?: string | null;
  archivedAt?: Date | string | null;
}

/**
 * Split a tag picker's options into Pillars and ordinary labels (ADR-0085),
 * so a picker can show Pillars as their own group. An inactive Pillar is never
 * offered for new assignment, but stays listed while the item already carries
 * it, so it can be seen and removed.
 */
export function splitPillarTags<T extends PickableTag>(
  tags: readonly T[],
  selectedIds: readonly string[] = [],
): { pillars: T[]; labels: T[] } {
  const selected = new Set(selectedIds);
  const pillars: T[] = [];
  const labels: T[] = [];
  for (const tag of tags) {
    if (tag.category !== PILLAR_CATEGORY) labels.push(tag);
    else if (!tag.archivedAt || selected.has(tag.id)) pillars.push(tag);
  }
  return { pillars, labels };
}
