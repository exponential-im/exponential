"use client";

import Link from "next/link";
import { useState } from "react";
import { Container, Group, Skeleton, Switch, Text, ThemeIcon, Title } from "@mantine/core";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { Panel, Pill, EmptyState } from "~/app/_components/ui";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { getTagMantineColor } from "~/utils/tagColors";
import { pillarPath } from "~/lib/pillars/pillarPath";
import { PillarIcon } from "./PillarIcon";

/**
 * Every Pillar in the workspace (ADR-0086): the standing areas of its work,
 * each linking to its page.
 */
export function PillarsList() {
  const { workspace, workspaceId, userRole } = useWorkspace();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: pillars, isLoading } = api.pillar.list.useQuery(
    { workspaceId: workspaceId ?? "", includeArchived },
    { enabled: !!workspaceId, placeholderData: (previous) => previous },
  );
  const canManage = userRole === "owner" || userRole === "admin";

  if (!workspace || isLoading) {
    return (
      <Container size="lg" className="py-8">
        <Skeleton height={36} width={200} mb="xl" />
        <Skeleton height={90} mb="md" />
        <Skeleton height={90} />
      </Container>
    );
  }

  return (
    <Container size="lg" className="py-8">
      <Group justify="space-between" align="flex-start" mb="xs">
        <Title order={1} className="text-text-primary">
          Pillars
        </Title>
        <Switch
          label="Show inactive"
          size="sm"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
          className="pt-2"
        />
      </Group>
      <Text size="sm" mb="lg" className="max-w-3xl text-text-secondary">
        The standing areas of {workspace.name}&apos;s work: the things that never finish. Each page
        gathers the goals, projects, epics, loose work and reading filed under it.
        {canManage && (
          <>
            {" "}
            <Link href={`/w/${workspace.slug}/settings?section=pillars`} className="underline">
              Manage Pillars
            </Link>
          </>
        )}
      </Text>

      {!pillars || pillars.length === 0 ? (
        <EmptyState
          icon={PillarIcon}
          title="No Pillars yet"
          message={
            canManage
              ? "Promote a tag that names an area of work, such as DevOps, in workspace settings."
              : "A workspace admin can promote a tag to a Pillar in workspace settings."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <Panel
              key={pillar.id}
              as={Link}
              href={pillarPath(workspace.slug, pillar)}
              interactive
              padding="md"
            >
              <Group gap="sm" mb={pillar.description ? "xs" : 0} wrap="nowrap">
                <ThemeIcon variant="light" radius="md" color={getTagMantineColor(pillar.color)}>
                  <PillarIcon size={16} />
                </ThemeIcon>
                <Text fw={600} className="truncate text-text-primary">
                  {pillar.name}
                </Text>
                {pillar.archivedAt && <Pill size="xs">Inactive</Pill>}
                {pillar.hasNoDri && (
                  <Pill size="xs" tone="warning">
                    No DRI
                  </Pill>
                )}
              </Group>
              {pillar.description && (
                <div className="line-clamp-3 text-sm text-text-secondary">
                  <MarkdownRenderer content={pillar.description} variant="compact" />
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </Container>
  );
}
