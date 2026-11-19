"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Group, MultiSelect, Select, Stack, Text, TextInput } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconArchive, IconArrowBackUp, IconPencil, IconPlus } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { TAG_COLORS, type TagColor, PILLAR_CATEGORY } from "~/types/tag";
import { getTagMantineColor } from "~/utils/tagColors";
import { pillarPath } from "~/lib/pillars/pillarPath";
import { Panel, EmptyState } from "~/app/_components/ui";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { PillarIcon } from "~/app/_components/pillars/PillarIcon";
import { SettingsField, SettingsSection } from "./SettingsShell";

type WorkspaceTag = RouterOutputs["tag"]["list"]["workspaceTags"][number];

const COLOR_OPTIONS = TAG_COLORS.filter((c) => c.startsWith("avatar-")).map((value) => ({
  value,
  label: value.replace("avatar-", ""),
}));

function onError(title: string) {
  return (error: { message: string }) =>
    notifications.show({ color: "red", title, message: error.message });
}

/**
 * Workspace settings → Pillars (ADR-0086): promote a tag to a Pillar or
 * create a new one, say what good looks like, retire one, or turn it back into
 * a label. Owners and admins only; promoting never changes which items carry
 * the tag.
 */
export function WorkspacePillarsSettings({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const utils = api.useUtils();
  const { data, isLoading } = api.tag.list.useQuery({ workspaceId });
  const { data: pillarRows } = api.pillar.list.useQuery({ workspaceId, includeArchived: true });
  const { data: positionData } = api.position.list.useQuery({ workspaceId });
  const positionOptions = (positionData?.positions ?? []).map((p) => ({ value: p.id, label: p.title }));
  const positionIdsByPillar = new Map(
    (pillarRows ?? []).map((p) => [p.id, p.positions.map((x) => x.positionId)]),
  );
  const workspaceTags = data?.workspaceTags ?? [];
  const pillars = workspaceTags.filter((t) => t.category === PILLAR_CATEGORY);
  const active = pillars.filter((t) => !t.archivedAt);
  const inactive = pillars.filter((t) => t.archivedAt);
  const promotable = workspaceTags.filter((t) => t.category !== PILLAR_CATEGORY && !t.isSystem);

  const refresh = async () => {
    await Promise.all([utils.tag.list.invalidate(), utils.pillar.invalidate()]);
  };

  const setPillar = api.tag.setPillar.useMutation({
    onSuccess: refresh,
    onError: onError("Could not change the Pillar"),
  });
  const setArchived = api.tag.setPillarArchived.useMutation({
    onSuccess: refresh,
    onError: onError("Could not change the Pillar"),
  });

  const [promoteId, setPromoteId] = useState<string | null>(null);

  const demote = (tag: WorkspaceTag) =>
    modals.openConfirmModal({
      title: `Turn ${tag.name} back into a label?`,
      children: (
        <Text size="sm">
          Its page goes away. Every item keeps the tag, as an ordinary label.
        </Text>
      ),
      labels: { confirm: "Turn into a label", cancel: "Cancel" },
      onConfirm: () => setPillar.mutate({ tagId: tag.id, isPillar: false }),
    });

  return (
    <>
      <SettingsSection
        icon={PillarIcon}
        title="Pillars"
        count={active.length}
        description="Standing areas of this workspace's work that never finish, such as DevOps or Go-to-market. Projects, goals, epics, tickets, actions and resources can be filed under several. Each Pillar has a page."
      >
        <Stack gap="md">
          {isLoading ? null : active.length === 0 ? (
            <EmptyState
              compact
              message="No Pillars yet. Promote a tag that already names an area of work, or create one."
            />
          ) : (
            active.map((tag) => (
              <PillarRow
                key={tag.id}
                tag={tag}
                workspaceSlug={workspaceSlug}
                onSaved={refresh}
                positionOptions={positionOptions}
                positionIds={positionIdsByPillar.get(tag.id) ?? []}
                actions={
                  <>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconArchive size={12} />}
                      onClick={() => setArchived.mutate({ tagId: tag.id, archived: true })}
                    >
                      Make inactive
                    </Button>
                    <Button size="compact-xs" variant="subtle" color="gray" onClick={() => demote(tag)}>
                      Turn into label
                    </Button>
                  </>
                }
              />
            ))
          )}
        </Stack>
      </SettingsSection>

      <SettingsSection
        icon={IconPlus}
        title="Add a Pillar"
        description="Promoting keeps the tag on every item that already carries it."
      >
        <Stack gap="lg">
          <SettingsField label="Promote a tag">
            <Group gap="xs" wrap="nowrap">
              <Select
                aria-label="Tag to promote"
                placeholder={promotable.length === 0 ? "No tags to promote" : "Choose a tag"}
                data={promotable.map((t) => ({ value: t.id, label: t.name }))}
                value={promoteId}
                onChange={setPromoteId}
                searchable
                disabled={promotable.length === 0}
                className="min-w-0 flex-1"
              />
              <Button
                disabled={!promoteId}
                loading={setPillar.isPending}
                onClick={() => {
                  if (!promoteId) return;
                  setPillar.mutate(
                    { tagId: promoteId, isPillar: true },
                    { onSuccess: () => setPromoteId(null) },
                  );
                }}
              >
                Promote
              </Button>
            </Group>
          </SettingsField>
          <NewPillarForm workspaceId={workspaceId} onCreated={refresh} />
        </Stack>
      </SettingsSection>

      {inactive.length > 0 && (
        <SettingsSection
          icon={IconArchive}
          title="Inactive Pillars"
          count={inactive.length}
          description="Hidden from pickers and the sidebar. Items keep them, and their pages still open."
        >
          <Stack gap="md">
            {inactive.map((tag) => (
              <PillarRow
                key={tag.id}
                tag={tag}
                workspaceSlug={workspaceSlug}
                onSaved={refresh}
                actions={
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    leftSection={<IconArrowBackUp size={12} />}
                    onClick={() => setArchived.mutate({ tagId: tag.id, archived: false })}
                  >
                    Make active
                  </Button>
                }
              />
            ))}
          </Stack>
        </SettingsSection>
      )}
    </>
  );
}

function PillarRow({
  tag,
  workspaceSlug,
  actions,
  onSaved,
  positionOptions,
  positionIds,
}: {
  tag: WorkspaceTag;
  workspaceSlug: string;
  actions: React.ReactNode;
  onSaved: () => Promise<void>;
  /** When given, the Positions accountable for this Pillar can be chosen. */
  positionOptions?: { value: string; label: string }[];
  positionIds?: string[];
}) {
  const setPositions = api.tag.setPillarPositions.useMutation({
    onSuccess: onSaved,
    onError: onError("Positions not saved"),
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.description ?? "");
  const update = api.tag.update.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await onSaved();
    },
    onError: onError("Description not saved"),
  });

  return (
    <Panel padding="md" aria-label={`Pillar ${tag.name}`}>
      <Group justify="space-between" align="center" mb="xs" wrap="wrap">
        <Badge
          component={Link}
          href={pillarPath(workspaceSlug, tag)}
          variant="light"
          color={getTagMantineColor(tag.color)}
          leftSection={<PillarIcon size={11} />}
          className="cursor-pointer"
        >
          {tag.name}
        </Badge>
        <Group gap={4}>
          {!editing && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconPencil size={12} />}
              onClick={() => {
                setDraft(tag.description ?? "");
                setEditing(true);
              }}
            >
              {tag.description ? "Edit description" : "Add description"}
            </Button>
          )}
          {actions}
        </Group>
      </Group>
      {editing ? (
        <Stack gap="xs">
          <MarkdownInput
            value={draft}
            onChange={(value) => setDraft(value)}
            placeholder="What good looks like for this area"
            minRows={3}
          />
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="subtle" color="gray" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="xs"
              loading={update.isPending}
              onClick={() => update.mutate({ id: tag.id, description: draft })}
            >
              Save
            </Button>
          </Group>
        </Stack>
      ) : tag.description ? (
        <div className="text-sm text-text-secondary">
          <MarkdownRenderer content={tag.description} variant="compact" />
        </div>
      ) : (
        <Text size="sm" className="text-text-muted">
          No description yet.
        </Text>
      )}
      {positionOptions && (
        <MultiSelect
          mt="sm"
          size="xs"
          label="Accountable Positions"
          description="Shown on the Pillar's page as who to ask. Work is never routed through them."
          placeholder={positionOptions.length === 0 ? "This workspace has no Positions yet" : "Choose Positions"}
          data={positionOptions}
          value={positionIds ?? []}
          disabled={positionOptions.length === 0 || setPositions.isPending}
          searchable
          clearable
          onChange={(next) => setPositions.mutate({ tagId: tag.id, positionIds: next })}
          comboboxProps={{ withinPortal: true }}
        />
      )}
    </Panel>
  );
}

function NewPillarForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("avatar-blue");
  const [description, setDescription] = useState("");
  const create = api.tag.createPillar.useMutation({
    onSuccess: async () => {
      setName("");
      setDescription("");
      await onCreated();
    },
    onError: onError("Pillar not created"),
  });

  return (
    <SettingsField label="Or create a new one">
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput
            aria-label="New Pillar name"
            placeholder="e.g. Go-to-market"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={50}
            className="min-w-0 flex-1"
          />
          <Select
            aria-label="Colour"
            data={COLOR_OPTIONS}
            value={color}
            onChange={(value) => value && setColor(value as TagColor)}
            allowDeselect={false}
            w={140}
          />
        </Group>
        <MarkdownInput
          value={description}
          onChange={(value) => setDescription(value)}
          placeholder="What good looks like for this area (optional)"
          minRows={2}
        />
        <Group justify="flex-end">
          <Button
            disabled={!name.trim()}
            loading={create.isPending}
            onClick={() =>
              create.mutate({ workspaceId, name: name.trim(), color, description: description || undefined })
            }
          >
            Create Pillar
          </Button>
        </Group>
      </Stack>
    </SettingsField>
  );
}
