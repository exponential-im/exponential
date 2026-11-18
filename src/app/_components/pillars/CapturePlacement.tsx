"use client";

import { Chip, Group, Select, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { getTagMantineColor } from "~/utils/tagColors";
import { PillarIcon } from "./PillarIcon";
import { pillarsAfterProjectChoice, projectsForPillars } from "./captureRules";

export interface CapturePlacementValue {
  /** Ticked Pillars. May also hold ordinary labels (a form that keeps both in
   * one list); those are left as they are. */
  tagIds: string[];
  /** The optional Project. */
  projectId: string | null;
}

interface CapturePlacementProps {
  /** The workspace the capture files into: asked first, by the surface itself. */
  workspaceId: string;
  value: CapturePlacementValue;
  onChange: (value: CapturePlacementValue) => void;
  /** Offer the Project step too (default true). */
  withProject?: boolean;
  disabled?: boolean;
}

/**
 * The second and third questions of capture (ADR-0085): which Pillars this
 * belongs to, then optionally which Project. Ticking Pillars narrows the
 * Project list to Projects under them; choosing a Project ticks its Pillars.
 * Renders nothing while the workspace has no Pillar and no Project to offer.
 */
export function CapturePlacement({
  workspaceId,
  value,
  onChange,
  withProject = true,
  disabled = false,
}: CapturePlacementProps) {
  const { data: pillars = [] } = api.pillar.list.useQuery(
    { workspaceId },
    { staleTime: 5 * 60 * 1000 },
  );
  const { data: projectData } = api.project.getUserProjects.useQuery(
    { workspaceId },
    { enabled: withProject, staleTime: 60 * 1000 },
  );
  const projects = projectData?.projects ?? [];
  const pillarIds = new Set(pillars.map((p) => p.id));
  const tickedPillars = value.tagIds.filter((id) => pillarIds.has(id));
  const offeredProjects = projectsForPillars(projects, tickedPillars);
  // A chosen project stays listed even if the ticks would hide it.
  const chosen = projects.find((p) => p.id === value.projectId) ?? null;
  const projectOptions = [
    ...offeredProjects,
    ...(chosen && !offeredProjects.includes(chosen) ? [chosen] : []),
  ].map((p) => ({ value: p.id, label: p.name }));

  if (pillars.length === 0 && (!withProject || projects.length === 0)) return null;

  return (
    <Group gap="sm" align="center" wrap="wrap" aria-label="Where this goes">
      {pillars.length > 0 && (
        <Group gap={6} align="center" wrap="wrap">
          <Group gap={4} align="center">
            <PillarIcon size={14} className="text-text-muted" />
            <Text size="xs" className="text-text-muted">
              Pillars
            </Text>
          </Group>
          <Chip.Group
            multiple
            value={tickedPillars}
            onChange={(ticked) =>
              onChange({
                ...value,
                tagIds: [...value.tagIds.filter((id) => !pillarIds.has(id)), ...ticked],
              })
            }
          >
            <Group gap={4}>
              {pillars.map((pillar) => (
                <Chip
                  key={pillar.id}
                  value={pillar.id}
                  size="xs"
                  variant="light"
                  color={getTagMantineColor(pillar.color)}
                  disabled={disabled}
                >
                  {pillar.name}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Group>
      )}
      {withProject && projects.length > 0 && (
        <Select
          aria-label="Project"
          placeholder={tickedPillars.length > 0 ? "No project (file under the Pillars)" : "No project"}
          size="xs"
          w={240}
          searchable
          clearable
          disabled={disabled}
          data={projectOptions}
          value={value.projectId}
          onChange={(projectId) => {
            const project = projects.find((p) => p.id === projectId) ?? null;
            // Only Pillars this picker offers can be ticked, so only those come
            // with the project: a hidden tick could not be removed.
            const offerable = project && {
              ...project,
              pillarTagIds: project.pillarTagIds.filter((id) => pillarIds.has(id)),
            };
            onChange({ tagIds: pillarsAfterProjectChoice(value.tagIds, offerable), projectId });
          }}
          comboboxProps={{ withinPortal: true }}
        />
      )}
    </Group>
  );
}
