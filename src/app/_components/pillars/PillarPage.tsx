"use client";

import { PillarIcon } from "./PillarIcon";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Avatar,
  Container,
  Group,
  Skeleton,
  Switch,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowsSplit,
  IconBookmark,
  IconCircleDashed,
  IconFolder,
  IconStack2,
  IconTarget,
  IconTicket,
  IconUserCheck,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Panel, Pill, SectionHeader, EmptyState } from "~/app/_components/ui";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { getTagMantineColor } from "~/utils/tagColors";

type PillarPageData = RouterOutputs["pillar"]["get"];
type PageAction = PillarPageData["looseWork"]["actions"][number];
type PageTicket = PillarPageData["looseWork"]["tickets"][number];
type PageUser = { id: string; name: string | null; image: string | null };

/** Statuses, across goals, projects, epics, tickets and actions, that read as finished. */
const FINISHED_STATUSES = new Set([
  "completed",
  "archived",
  "COMPLETED",
  "CANCELLED",
  "DONE",
  "DEPLOYED",
  "ARCHIVED",
]);

function isFinished(status: string): boolean {
  return FINISHED_STATUSES.has(status);
}

interface PillarPageProps {
  tagId: string;
  workspaceSlug: string;
}

/**
 * A Pillar's page (ADR-0085): everything happening in one standing area of
 * the workspace's work. Sections run top to bottom in the order the PRD gives.
 */
export function PillarPage({ tagId, workspaceSlug }: PillarPageProps) {
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const { data, isLoading, error } = api.pillar.get.useQuery(
    { tagId, includeCompleted },
    { placeholderData: (previous) => previous },
  );

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

  const { pillar, positions, hasNoPosition, goals, projects, epics, looseWork, inheritedWork, resources } =
    data;
  const looseCount = looseWork.actions.length + looseWork.tickets.length;
  const inheritedCount = inheritedWork.actions.length + inheritedWork.tickets.length;
  const doneHint = includeCompleted ? "" : "open ";

  return (
    <Container size="lg" className="py-8">
      <header className="mb-8">
        <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
          <Group gap="sm" align="center">
            <ThemeIcon variant="light" size="lg" radius="md" color={getTagMantineColor(pillar.color)}>
              <PillarIcon size={20} />
            </ThemeIcon>
            <Title order={1} className="text-text-primary">
              {pillar.name}
            </Title>
            {pillar.archivedAt && <Pill tone="warning">Inactive</Pill>}
          </Group>
          <Switch
            label="Show completed"
            size="sm"
            checked={includeCompleted}
            onChange={(event) => setIncludeCompleted(event.currentTarget.checked)}
            className="shrink-0 pt-2"
          />
        </Group>
        {pillar.description ? (
          <div className="max-w-3xl text-text-secondary">
            <MarkdownRenderer content={pillar.description} variant="compact" />
          </div>
        ) : (
          <Text size="sm" className="text-text-muted">
            No description yet. Say what good looks like for this area in{" "}
            <Link href={`/w/${workspaceSlug}/settings?section=pillars`} className="underline">
              workspace settings
            </Link>
            .
          </Text>
        )}
      </header>

      <div className="flex flex-col gap-8">
        <PageSection label="Accountable" icon={<IconUserCheck size={14} />} count={positions.length}>
          {hasNoPosition ? (
            <Panel padding="sm" className="flex items-center gap-2">
              <Pill tone="warning">No one accountable</Pill>
              <Text size="sm" className="text-text-secondary">
                No Position is accountable for this Pillar yet, so nobody knows who to ask.{" "}
                <Link href={`/w/${workspaceSlug}/settings?section=pillars`} className="underline">
                  Add one in workspace settings
                </Link>
                .
              </Text>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {positions.map((position) => (
                <Panel key={position.id} padding="sm">
                  <Group justify="space-between" wrap="nowrap" mb={4}>
                    <Text fw={600} size="sm" className="truncate text-text-primary">
                      {position.title}
                    </Text>
                    {position.holders.length === 0 ? (
                      <Pill size="xs" tone="warning">
                        Vacant
                      </Pill>
                    ) : (
                      <Avatar.Group spacing="xs">
                        {position.holders.slice(0, 4).map((holder) => (
                          <Tooltip key={holder.id} label={holder.name ?? "Someone"}>
                            <Avatar src={holder.image} size={22} radius="xl" alt={holder.name ?? ""}>
                              {holder.name?.charAt(0) ?? "?"}
                            </Avatar>
                          </Tooltip>
                        ))}
                      </Avatar.Group>
                    )}
                  </Group>
                  <Text size="xs" className="text-text-muted">
                    {position.holders.map((h) => h.name ?? "Someone").join(", ") || "Nobody holds it"}
                  </Text>
                </Panel>
              ))}
            </div>
          )}
        </PageSection>

        <PageSection label="Goals" icon={<IconTarget size={14} />} count={goals.length}>
          {goals.length === 0 ? (
            <EmptyState compact message={`No ${doneHint}goal is filed under this Pillar.`} />
          ) : (
            <Panel padding="sm">
              <WorkList>
                {goals.map((goal) => (
                  <WorkRow
                    key={goal.id}
                    href={`/w/${workspaceSlug}/goals/${goal.id}`}
                    icon={<IconTarget size={14} />}
                    label={goal.title}
                    finished={isFinished(goal.status)}
                    meta={goal.period ? <MetaText>{goal.period}</MetaText> : undefined}
                    people={goal.driUser ? [goal.driUser] : []}
                    emptyPeopleLabel="No DRI"
                  />
                ))}
              </WorkList>
            </Panel>
          )}
        </PageSection>

        <PageSection
          label="Projects"
          title={includeCompleted ? "Projects" : "Active projects"}
          icon={<IconFolder size={14} />}
          count={projects.length}
        >
          {projects.length === 0 ? (
            <EmptyState compact message={`No ${includeCompleted ? "" : "active "}project is filed under this Pillar.`} />
          ) : (
            <div className="flex flex-col gap-3">
              {projects.map((project) => (
                <ContainerCard
                  key={project.id}
                  href={`/w/${workspaceSlug}/projects/${project.slug}-${project.id}`}
                  name={project.name}
                  finished={project.status !== "ACTIVE"}
                  meta={<MetaText>{Math.round(project.progress)}%</MetaText>}
                  itemCount={project.actions.length}
                >
                  {project.actions.map((action) => (
                    <ActionRow key={action.id} action={action} workspaceSlug={workspaceSlug} />
                  ))}
                </ContainerCard>
              ))}
            </div>
          )}
        </PageSection>

        <PageSection label="Epics" icon={<IconStack2 size={14} />} count={epics.length}>
          {epics.length === 0 ? (
            <EmptyState compact message={`No ${doneHint}epic is filed under this Pillar.`} />
          ) : (
            <div className="flex flex-col gap-3">
              {epics.map((epic) => (
                <ContainerCard
                  key={epic.id}
                  href={
                    epic.product
                      ? `/w/${workspaceSlug}/products/${epic.product.slug}/epics/${epic.id}`
                      : undefined
                  }
                  name={epic.name}
                  finished={isFinished(epic.status)}
                  itemCount={epic.tickets.length + epic.actions.length}
                >
                  {epic.tickets.map((ticket) => (
                    <TicketRow key={ticket.id} ticket={ticket} workspaceSlug={workspaceSlug} />
                  ))}
                  {epic.actions.map((action) => (
                    <ActionRow key={action.id} action={action} workspaceSlug={workspaceSlug} />
                  ))}
                </ContainerCard>
              ))}
            </div>
          )}
        </PageSection>

        <PageSection label="Loose work" icon={<IconCircleDashed size={14} />} count={looseCount}>
          {looseCount === 0 ? (
            <EmptyState compact message={`Nothing ${doneHint}is filed here without a project or epic.`} />
          ) : (
            <Panel padding="sm">
              <WorkList>
                {looseWork.tickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} workspaceSlug={workspaceSlug} />
                ))}
                {looseWork.actions.map((action) => (
                  <ActionRow key={action.id} action={action} workspaceSlug={workspaceSlug} />
                ))}
              </WorkList>
            </Panel>
          )}
        </PageSection>

        {inheritedCount > 0 && (
          <PageSection
            label="Filed here from other work"
            icon={<IconArrowsSplit size={14} />}
            count={inheritedCount}
          >
            <Text size="xs" className="mb-2 text-text-muted">
              These carry this Pillar themselves, inside a project or epic not listed above.
            </Text>
            <Panel padding="sm">
              <WorkList>
                {inheritedWork.tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    workspaceSlug={workspaceSlug}
                    container={ticket.epic?.name}
                  />
                ))}
                {inheritedWork.actions.map((action) => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    workspaceSlug={workspaceSlug}
                    container={action.project?.name ?? action.epic?.name}
                  />
                ))}
              </WorkList>
            </Panel>
          </PageSection>
        )}

        <PageSection label="Resources" icon={<IconBookmark size={14} />} count={resources.length}>
          {resources.length === 0 ? (
            <EmptyState compact message="No reading or reference is filed under this Pillar." />
          ) : (
            <Panel padding="sm">
              <WorkList>
                {resources.map((resource) => (
                  <WorkRow
                    key={resource.id}
                    href={`/w/${workspaceSlug}/knowledge-base/${resource.id}`}
                    icon={<IconBookmark size={14} />}
                    label={resource.title}
                    people={[resource.user]}
                  />
                ))}
              </WorkList>
            </Panel>
          )}
        </PageSection>
      </div>
    </Container>
  );
}

function PageSection({
  label,
  title,
  icon,
  count,
  children,
}: {
  /** Accessible name of the region. */
  label: string;
  /** Visible heading; defaults to the label. */
  title?: string;
  icon: ReactNode;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <SectionHeader title={title ?? label} icon={icon} count={count} className="mb-3" />
      {children}
    </section>
  );
}

function WorkList({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col gap-1 p-0">{children}</ul>;
}

function MetaText({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" className="shrink-0 text-text-muted">
      {children}
    </Text>
  );
}

/** A Project or Epic under the Pillar, with the work inside it (tagged or not). */
function ContainerCard({
  href,
  name,
  finished,
  meta,
  itemCount,
  children,
}: {
  href?: string;
  name: string;
  finished: boolean;
  meta?: ReactNode;
  /** How many rows the children render. */
  itemCount: number;
  children: ReactNode;
}) {
  const hasWork = itemCount > 0;
  return (
    <Panel padding="md">
      <Group justify="space-between" mb={hasWork ? "sm" : 0}>
        <Group gap="xs">
          {href ? (
            <Link href={href} className="font-medium text-text-primary hover:underline">
              {name}
            </Link>
          ) : (
            <span className="font-medium text-text-primary">{name}</span>
          )}
          {finished && <Pill size="xs">Done</Pill>}
        </Group>
        {meta}
      </Group>
      {hasWork && <WorkList>{children}</WorkList>}
    </Panel>
  );
}

function WorkRow({
  href,
  icon,
  label,
  meta,
  people,
  finished = false,
  emptyPeopleLabel = "Unassigned",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  meta?: ReactNode;
  people: PageUser[];
  finished?: boolean;
  emptyPeopleLabel?: string;
}) {
  return (
    <li className="flex items-center gap-2 py-1">
      <span className="inline-flex shrink-0 text-text-muted">{icon}</span>
      <Link
        href={href}
        className={`min-w-0 flex-1 truncate text-sm hover:underline ${
          finished ? "text-text-muted line-through" : "text-text-primary"
        }`}
      >
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

function ActionRow({
  action,
  workspaceSlug,
  container,
}: {
  action: PageAction;
  workspaceSlug: string;
  /** The Project or Epic it sits in, when that is not obvious from the section. */
  container?: string;
}) {
  return (
    <WorkRow
      href={`/w/${workspaceSlug}/actions/${action.id}`}
      icon={<IconCircleDashed size={14} />}
      label={action.name}
      finished={isFinished(action.status)}
      meta={container ? <MetaText>in {container}</MetaText> : undefined}
      people={action.assignees.map((a) => a.user)}
    />
  );
}

function TicketRow({
  ticket,
  workspaceSlug,
  container,
}: {
  ticket: PageTicket;
  workspaceSlug: string;
  container?: string;
}) {
  return (
    <WorkRow
      href={`/w/${workspaceSlug}/products/${ticket.product.slug}/tickets/${ticket.id}`}
      icon={<IconTicket size={14} />}
      label={ticket.title}
      finished={isFinished(ticket.status)}
      meta={
        <MetaText>
          {container ? `in ${container} · ` : ""}
          {ticket.shortId ?? `#${ticket.number}`}
        </MetaText>
      }
      people={ticket.assignee ? [ticket.assignee] : []}
    />
  );
}
