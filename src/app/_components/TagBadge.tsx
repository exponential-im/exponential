import { Badge, Tooltip } from '@mantine/core';
import { getTagMantineColor } from '~/utils/tagColors';
import { PillarIcon } from '~/app/_components/pillars/PillarIcon';
import { PILLAR_CATEGORY } from '~/types/tag';

interface TagBadgeProps {
  tag: {
    id: string;
    name: string;
    slug?: string;
    color: string;
    /** "pillar" marks a Pillar (ADR-0085), drawn with the Pillar glyph. */
    category?: string | null;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  withTooltip?: boolean;
  onClick?: (tagId: string) => void;
}

export function TagBadge({ tag, size = 'sm', withTooltip = false, onClick }: TagBadgeProps) {
  const badge = (
    <Badge
      size={size}
      variant="light"
      color={getTagMantineColor(tag.color)}
      leftSection={tag.category === PILLAR_CATEGORY ? <PillarIcon size={10} aria-label="Pillar" /> : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(tag.id); } : undefined}
    >
      {tag.name}
    </Badge>
  );

  if (withTooltip) {
    return (
      <Tooltip label={onClick ? `Filter by "${tag.name}"` : tag.name}>
        {badge}
      </Tooltip>
    );
  }

  return badge;
}

interface TagBadgeListProps {
  tags: Array<TagBadgeProps['tag']>;
  maxDisplay?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  onTagClick?: (tagId: string) => void;
}

export function TagBadgeList({ tags, maxDisplay = 3, size = 'sm', onTagClick }: TagBadgeListProps) {
  if (!tags || tags.length === 0) return null;

  const displayTags = tags.slice(0, maxDisplay);
  const overflowCount = tags.length - maxDisplay;

  return (
    <>
      {displayTags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} size={size} onClick={onTagClick} withTooltip={!!onTagClick} />
      ))}
      {overflowCount > 0 && (
        <Tooltip
          label={tags.slice(maxDisplay).map(t => t.name).join(', ')}
          multiline
          w={200}
        >
          <Badge size={size} variant="light" color="gray">
            +{overflowCount}
          </Badge>
        </Tooltip>
      )}
    </>
  );
}
