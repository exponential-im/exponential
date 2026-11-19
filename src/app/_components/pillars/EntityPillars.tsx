"use client";

import { PillarIcon } from "./PillarIcon";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, Button, Chip, Group, Loader, Popover, ScrollArea, Stack, Text } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { PILLAR_CATEGORY, isPillarTag } from "~/types/tag";
import { getTagMantineColor } from "~/utils/tagColors";

/** Entities that take Pillars only (never ordinary labels). */
export type PillarEntityType = "project" | "goal" | "resource";

interface EntityPillarsProps {
  entityType: PillarEntityType;
  entityId: string;
  workspaceId: string;
  workspaceSlug: string;
  /** Show the Pillars without the editor (someone who may only read the item). */
  readOnly?: boolean;
  /** Frame the control (a section with a heading, say). Not called when nothing is shown. */
  wrapper?: (content: ReactNode) => ReactNode;
}

/**
 * The Pillars a Project, Goal or Resource is filed under (ADR-0086), each a
 * link to its Pillar page, with an editor for people who may change them.
 * Inactive Pillars already on the item stay shown, but are never offered.
 */
export function EntityPillars({
  entityType,
  entityId,
  workspaceId,
  workspaceSlug,
  readOnly = false,
  wrapper = (content) => content,
}: EntityPillarsProps) {
  const utils = api.useUtils();
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);

  const current = api.tag.listForEntity.useQuery({ entityType, entityId });
  const pillars = api.tag.list.useQuery(
    { workspaceId, category: PILLAR_CATEGORY },
    { enabled: !readOnly },
  );

  const save = api.tag.setEntityTags.useMutation({
    onSuccess: async () => {
      setOpened(false);
      await Promise.all([
        utils.tag.listForEntity.invalidate({ entityType, entityId }),
        utils.pillar.invalidate(),
      ]);
    },
    onError: (error) => {
      notifications.show({ color: "red", title: "Pillars not saved", message: error.message });
    },
  });

  const currentTags = current.data ?? [];
  const currentIds = currentTags.map((t) => t.id);
  const activePillars = (pillars.data?.workspaceTags ?? []).filter(
    (t) => !t.archivedAt || currentIds.includes(t.id),
  );
  // A tag the item still carries but that is no longer a Pillar (turned back
  // into a label) stays offered, so it can be unticked.
  const offered = [
    ...activePillars,
    ...currentTags.filter((t) => !activePillars.some((p) => p.id === t.id)),
  ];

  // Nothing filed and nothing to file under (or no right to): say nothing.
  if (
    !current.isLoading &&
    currentTags.length === 0 &&
    (readOnly || (!pillars.isLoading && offered.length === 0))
  ) {
    return null;
  }

  const open = () => {
    setDraft(currentIds);
    setOpened(true);
  };

  return wrapper(
    <Group gap={6} wrap="wrap" align="center">
      {currentTags.length === 0 && !readOnly && (
        <Text size="xs" className="text-text-muted">
          Not under any Pillar
        </Text>
      )}
      {currentTags.map((tag) =>
        isPillarTag(tag) ? (
          <Badge
            key={tag.id}
            component={Link}
            href={`/w/${workspaceSlug}/pillars/${tag.id}`}
            variant="light"
            color={getTagMantineColor(tag.color)}
            leftSection={<PillarIcon size={11} />}
            className="cursor-pointer"
          >
            {tag.name}
          </Badge>
        ) : (
          // Turned back into a label since: no Pillar page to open. It stays
          // shown, and removable in the editor.
          <Badge key={tag.id} variant="light" color={getTagMantineColor(tag.color)}>
            {tag.name}
          </Badge>
        ),
      )}
      {!readOnly && (
      <Popover opened={opened} onChange={setOpened} position="bottom-start" width={300} shadow="md">
        <Popover.Target>
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            leftSection={<IconPencil size={12} />}
            onClick={open}
          >
            {currentTags.length === 0 ? "Add Pillar" : "Edit"}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <Text size="sm" fw={500}>
              Pillars
            </Text>
            {pillars.isLoading ? (
              <Group justify="center" p="sm">
                <Loader size="sm" />
              </Group>
            ) : offered.length === 0 ? (
              <Text size="sm" className="text-text-muted">
                This workspace has no Pillars yet. An admin can promote a tag in workspace settings.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={220}>
                <Chip.Group multiple value={draft} onChange={setDraft}>
                  <Group gap="xs">
                    {offered.map((tag) => (
                      <Chip
                        key={tag.id}
                        value={tag.id}
                        size="sm"
                        variant="light"
                        color={getTagMantineColor(tag.color)}
                      >
                        {tag.name}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </ScrollArea.Autosize>
            )}
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="subtle" color="gray" onClick={() => setOpened(false)}>
                Cancel
              </Button>
              <Button
                size="xs"
                loading={save.isPending}
                onClick={() => save.mutate({ entityType, entityId, tagIds: draft })}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
      )}
    </Group>,
  );
}
