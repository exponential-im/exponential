// Tag color options from the design system
export const TAG_COLORS = [
  'avatar-red',
  'avatar-teal',
  'avatar-blue',
  'avatar-green',
  'avatar-yellow',
  'avatar-plum',
  'avatar-mint',
  'avatar-lightYellow',
  'avatar-lightPurple',
  'avatar-lightBlue',
  'avatar-orange',
  'avatar-lightGreen',
  'avatar-lightRed',
  'avatar-skyBlue',
  'avatar-paleGreen',
  'avatar-paleYellow',
  'avatar-lavender',
  'avatar-powderBlue',
  'avatar-lightPink',
  'avatar-lightGray',
  'brand-primary',
  'brand-success',
  'brand-warning',
  'brand-error',
  'brand-info',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/**
 * `Tag.category` of a Pillar: a workspace tag promoted to have its own page
 * (ADR-0086). Every other category value, null included, is an ordinary label.
 */
export const PILLAR_CATEGORY = 'pillar';

/** True when the tag is a Pillar (active or not). */
/** Room for a Pillar's "what good looks like" (Markdown); a label's stays short in practice. */
export const TAG_DESCRIPTION_MAX = 2000;

export function isPillarTag(tag: { category: string | null }): boolean {
  return tag.category === PILLAR_CATEGORY;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: TagColor;
  description: string | null;
  category: string | null; // "pillar" = a Pillar (ADR-0086); null or "label" = an ordinary label
  isSystem: boolean;
  archivedAt?: Date | null; // set on an inactive Pillar
  workspaceId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionTag {
  id: string;
  actionId: string;
  tagId: string;
  createdAt: Date;
  tag: Tag;
}

// System tag slugs for reference
export const SYSTEM_TAG_SLUGS = [
  'bug',
  'agenda-item',
  'feature',
  'enhancement',
  'question',
  'documentation',
  'urgent',
  'blocked',
  'needs-review',
  'meeting-followup',
  'research',
  'idea',
] as const;

export type SystemTagSlug = (typeof SYSTEM_TAG_SLUGS)[number];
