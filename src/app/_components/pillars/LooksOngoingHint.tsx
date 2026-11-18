"use client";

import Link from "next/link";
import { ActionIcon, Group, Text } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconX } from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";
import { PillarIcon } from "./PillarIcon";
import { LOOKS_ONGOING_AFTER_DAYS, looksOngoing } from "./looksOngoing";

interface LooksOngoingHintProps {
  project: { id: string; status: string; endDate: Date | string | null; createdAt: Date | string };
  workspaceSlug: string;
  className?: string;
}

/**
 * On a Project that has run a long time with no end date: a dismissible hint
 * that it may be a Pillar. Converting is done by hand (ADR-0085).
 */
export function LooksOngoingHint({ project, workspaceSlug, className }: LooksOngoingHintProps) {
  if (!looksOngoing(project)) return null;
  // Keyed so the stored dismissal never changes key mid-life.
  return (
    <Hint key={project.id} projectId={project.id} workspaceSlug={workspaceSlug} className={className} />
  );
}

function Hint({
  projectId,
  workspaceSlug,
  className,
}: {
  projectId: string;
  workspaceSlug: string;
  className?: string;
}) {
  const [dismissed, setDismissed] = useLocalStorage<boolean>({
    key: `looks-ongoing-dismissed:${projectId}`,
    defaultValue: false,
    getInitialValueInEffect: false,
  });
  if (dismissed) return null;

  return (
    <Panel
      variant="muted"
      padding="sm"
      role="note"
      aria-label="This project may be a Pillar"
      className={className}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <PillarIcon size={16} className="shrink-0 text-text-muted" />
          <Text size="sm" className="text-text-secondary">
            This project has been active for over {LOOKS_ONGOING_AFTER_DAYS} days with no end date. If it
            never finishes, it may be a Pillar: a standing area of work.{" "}
            <Link href={`/w/${workspaceSlug}/settings?section=pillars`} className="underline">
              Set up a Pillar
            </Link>
          </Text>
        </Group>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>
    </Panel>
  );
}
