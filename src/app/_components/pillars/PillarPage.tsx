"use client";

import { PillarIcon } from "./PillarIcon";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Container, Group, Skeleton, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import {
  IconBookmark,
  IconCircleDashed,
  IconFolder,
  IconTarget,
  IconTicket,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Panel, Pill, SectionHeader, EmptyState } from "~/app/_components/ui";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { getTagMantineColor } from "~/utils/tagColors";

type PillarPageData = RouterOutputs["pillar"]["get"];
type PageAction = PillarPageData["looseWork"]["actions"][number];
type PageTicket = PillarPageData["looseWork"]["tickets"][number];
type PageUser = { id: string; name: string | null; image: string | null };

interface PillarPageProps {
  tagId: string;
  workspaceSlug: string;
}

/**
 * A Pillar's page (ADR-0085): everything happening in one standing area of
 * the workspace's work. Sections run top to bottom in the order the PRD gives.
 */
export function PillarPage({ tagId, workspaceSlug }: PillarPageProps) {
  const { data, isLoading, error } = api.pillar.get.useQuery({ tagId });

  if (isLoading) {
    return (
      <Container size="lg" className="py-8">
        <Skeleton height={36} width={260} mb="md" />
        <Skeleton height={18} width={420} mb="xl" />
        <Skeleton height={160} mb="md" />
        <Skeleton height={160} />
      </Container>
    );
  }

  if (error ?? !data) {
    return (
      <Container size="lg" className="py-8">
        <EmptyState
          icon={PillarIcon}
          title="Pillar not found"
          message="It may have been turned back into a label, or you are not a member of its workspace."
        />
      </Container>
    );
  }

  const { pillar, goals, projects, looseWork, resources } = data;
  const looseCount = looseWork.actions.length + looseWork.tickets.length;

  return (
    <Container size="lg" className="py-8">
      <header className="mb-8">
        <Group gap="sm" align="center" mb="xs">
          <ThemeIcon variant="light" size="lg" radius="md" color={getTagMantineColor(pillar.color)}>
            <PillarIcon size={20} />
          </ThemeIcon>
          <Title order={1} className="text-text-primary">
            {pillar.name}
          </Title>
          {pillar.archivedAt && <Pill tone="warning">Inactive</Pill>}
        </Group>
        {pillar.description ? (
          <div className="max-w-3xl text-text-secondary">
            <MarkdownRenderer content={pillar.description} variant="compact" />
          </div>
        ) : (
          <Text size="sm" className="text-text-muted">
            No description yet. Say what good looks like for this area in workspace settings.
          </Text>
        )}
      </header>

      <div className="flex flex-col gap-8">
        <section aria-label="Goals">
          <SectionHeader title="Goals" icon={<IconTarget size={14} />} count={goals.length} className="mb-3" />
          {goals.length === 0 ? (
            <EmptyState compact message="No open goal is filed under this Pillar." />
          ) : (
            <Panel padding="sm">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {goals.map((goal) => (
                  <WorkRow
                    key={goal.id}
                    href={`/w/${workspaceSlug}/goals/${goal.id}`}
                    icon={<IconTarget size={14} />}
                    label={goal.title}
                    meta={
                      goal.period ? (
                        <Text size="xs" className="shrink-0 text-text-muted">
                          {goal.period}
                        </Text>
                      ) : undefined
                    }
                    people={goal.driUser ? [goal.driUser] : []}
                    emptyPeopleLabel="No DRI"
                  />
                ))}
              </ul>
            </Panel>
          )}
        </section>

        <section aria-label="Projects">
          <SectionHeader title="Active projects" icon={<IconFolder size={14} />} count={projects.length} className="mb-3" />
          {projects.length === 0 ? (
            <EmptyState compact message="No active project is filed under this Pillar." />
          ) : (
            <div className="flex flex-col gap-3">
              {projects.map((project) => (
                <Panel key={project.id} padding="md">
                  <Group justify="space-between" mb={project.actions.length > 0 ? "sm" : 0}>
                    <Link
                      href={`/w/${workspaceSlug}/projects/${project.slug}-${project.id}`}
                      className="font-medium text-text-primary hover:underline"
                    >
                      {project.name}
                    </Link>
                    <Text size="xs" className="text-text-muted">
                      {Math.round(project.progress)}%
                    </Text>
                  </Group>
                  {project.actions.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {project.actions.map((action) => (
                        <ActionRow key={action.id} action={action} workspaceSlug={workspaceSlug} />
                      ))}
                    </ul>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Loose work">
          <SectionHeader
            title="Loose work"
            icon={<IconCircleDashed size={14} />}
            count={looseCount}
            className="mb-3"
          />
          {looseCount === 0 ? (
            <EmptyState compact message="Nothing open is filed here without a project or epic." />
          ) : (
            <Panel padding="sm">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {looseWork.tickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} workspaceSlug={workspaceSlug} />
                ))}
                {looseWork.actions.map((action) => (
                  <ActionRow key={action.id} action={action} workspaceSlug={workspaceSlug} />
                ))}
              </ul>
            </Panel>
          )}
        </section>

        <section aria-label="Resources">
          <SectionHeader
            title="Resources"
            icon={<IconBookmark size={14} />}
            count={resources.length}
            className="mb-3"
          />
          {resources.length === 0 ? (
            <EmptyState compact message="No reading or reference is filed under this Pillar." />
          ) : (
            <Panel padding="sm">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {resources.map((resource) => (
                  <WorkRow
                    key={resource.id}
                    href={`/w/${workspaceSlug}/knowledge-base/${resource.id}`}
                    icon={<IconBookmark size={14} />}
                    label={resource.title}
                    people={[resource.user]}
                  />
                ))}
              </ul>
            </Panel>
          )}
        </section>
      </div>
    </Container>
  );
}

function WorkRow({
  href,
  icon,
  label,
  meta,
  people,
  emptyPeopleLabel = "Unassigned",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  meta?: ReactNode;
  people: PageUser[];
  emptyPeopleLabel?: string;
}) {
  return (
    <li className="flex items-center gap-2 py-1">
      <span className="inline-flex shrink-0 text-text-muted">{icon}</span>
      <Link href={href} className="min-w-0 flex-1 truncate text-sm text-text-primary hover:underline">
        {label}
      </Link>
      {meta}
      {people.length === 0 ? (
        <Pill size="xs">{emptyPeopleLabel}</Pill>
      ) : (
        <Avatar.Group spacing="xs">
          {people.slice(0, 3).map((person) => (
            <Tooltip key={person.id} label={person.name ?? "Someone"}>
              <Avatar src={person.image} size={20} radius="xl" alt={person.name ?? ""}>
                {person.name?.charAt(0) ?? "?"}
              </Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      )}
    </li>
  );
}

function ActionRow({ action, workspaceSlug }: { action: PageAction; workspaceSlug: string }) {
  return (
    <WorkRow
      href={`/w/${workspaceSlug}/actions/${action.id}`}
      icon={<IconCircleDashed size={14} />}
      label={action.name}
      people={action.assignees.map((a) => a.user)}
    />
  );
}

function TicketRow({ ticket, workspaceSlug }: { ticket: PageTicket; workspaceSlug: string }) {
  return (
    <WorkRow
      href={`/w/${workspaceSlug}/products/${ticket.product.slug}/tickets/${ticket.id}`}
      icon={<IconTicket size={14} />}
      label={ticket.title}
      meta={
        <Text size="xs" className="shrink-0 text-text-muted">
          {ticket.shortId ?? `#${ticket.number}`}
        </Text>
      }
      people={ticket.assignee ? [ticket.assignee] : []}
    />
  );
}
