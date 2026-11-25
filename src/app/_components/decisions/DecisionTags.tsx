"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Chip, Group, Loader, Popover, ScrollArea, Stack, Text } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { PillarIcon } from "~/app/_components/pillars/PillarIcon";
import { splitPillarTags } from "~/app/_components/pillars/pillarTags";
import { pillarPath } from "~/lib/pillars/pillarPath";
import { api } from "~/trpc/react";
import { isPillarTag } from "~/types/tag";
import { getTagMantineColor } from "~/utils/tagColors";

interface DecisionTagsProps {
  workspaceId: string;
  workspaceSlug: string;
  decisionId: string;
  canEdit: boolean;
}

/**
 * The Pillars and labels on one Decision (ADR-0086). Each Pillar links to its
 * page, which lists the decision. People who may edit the decision get a
 * picker with the two kinds in separate groups.
 */
export function DecisionTags({ workspaceId, workspaceSlug, decisionId, canEdit }: DecisionTagsProps) {
  const utils = api.useUtils();
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const entity = { entityType: "decision" as const, entityId: decisionId };

  const current = api.tag.listForEntity.useQuery(entity);
  const available = api.tag.list.useQuery({ workspaceId }, { enabled: canEdit && opened });

  const save = api.tag.setEntityTags.useMutation({
    onSuccess: async () => {
      setOpened(false);
      await Promise.all([
        utils.tag.listForEntity.invalidate(entity),
        utils.decision.list.invalidate(),
        utils.pillar.invalidate(),
      ]);
    },
    onError: (error) => {
      notifications.show({ color: "red", title: "Tags not saved", message: error.message });
    },
  });

  const currentTags = current.data ?? [];
  const currentIds = currentTags.map((tag) => tag.id);
  const { pillars, labels } = splitPillarTags(available.data?.allTags ?? [], currentIds);

  // Nothing set and no right to set anything: say nothing.
  if (!canEdit && currentTags.length === 0) return null;

  const open = () => {
    setDraft(currentIds);
    setOpened(true);
  };

  const renderChips = (group: typeof pillars, withIcon: boolean) => (
    <Group gap="xs">
      {group.map((tag) => (
        <Chip
          key={tag.id}
          value={tag.id}
          size="sm"
          variant="light"
          color={getTagMantineColor(tag.color)}
          icon={withIcon ? <PillarIcon size={12} /> : undefined}
        >
          {tag.name}
        </Chip>
      ))}
    </Group>
  );

  return (
    <Group gap={6} wrap="wrap" align="center" mt={8} aria-label="Pillars and labels">
      {currentTags.map((tag) =>
        isPillarTag(tag) ? (
          <Badge
            key={tag.id}
            component={Link}
            href={pillarPath(workspaceSlug, tag)}
            variant="light"
            color={getTagMantineColor(tag.color)}
            leftSection={<PillarIcon size={11} aria-label="Pillar" />}
            className="cursor-pointer"
          >
            {tag.name}
          </Badge>
        ) : (
          <Badge key={tag.id} variant="light" color={getTagMantineColor(tag.color)}>
            {tag.name}
          </Badge>
        ),
      )}
      {canEdit && (
        <Popover opened={opened} onChange={setOpened} position="bottom-start" width={320} shadow="md">
          <Popover.Target>
            <Button
              variant="subtle"
              color="gray"
              size="compact-xs"
              leftSection={<IconPencil size={12} />}
              // Saving replaces the whole set, so the editor waits for the
              // current one: a draft started empty would clear it.
              disabled={!current.isSuccess}
              onClick={open}
            >
              {current.isSuccess && currentTags.length === 0 ? "Add Pillars or labels" : "Edit"}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm">
              {available.isLoading ? (
                <Group justify="center" p="sm">
                  <Loader size="sm" />
                </Group>
              ) : pillars.length + labels.length === 0 ? (
                <Text size="sm" className="text-text-muted">
                  This workspace has no Pillars or labels yet.
                </Text>
              ) : (
                <ScrollArea.Autosize mah={260}>
                  <Chip.Group multiple value={draft} onChange={setDraft}>
                    <Stack gap="xs">
                      {pillars.length > 0 && (
                        <div>
                          <Text size="xs" fw={600} mb={4} className="text-text-muted">
                            Pillars
                          </Text>
                          {renderChips(pillars, true)}
                        </div>
                      )}
                      {labels.length > 0 && (
                        <div>
                          <Text size="xs" fw={600} mb={4} className="text-text-muted">
                            Labels
                          </Text>
                          {renderChips(labels, false)}
                        </div>
                      )}
                    </Stack>
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
                  onClick={() => save.mutate({ ...entity, tagIds: draft })}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}
    </Group>
  );
}
