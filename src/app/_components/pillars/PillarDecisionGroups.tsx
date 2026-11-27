"use client";

import Link from "next/link";
import { useState } from "react";
import { Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconGavel } from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";
import {
  GENERAL_GROUP_KEY,
  decisionRowText,
  groupDecisionsByLink,
  type GroupableDecision,
} from "~/lib/decision-groups";

/** Decision statuses that no longer stand; struck through when shown. */
const REPLACED_DECISION_STATUSES = new Set(["SUPERSEDED", "DEPRECATED"]);

interface PillarDecision extends GroupableDecision {
  id: string;
  label: string;
  title: string | null;
  statement: string;
  status: string;
}

/** Decided dates are calendar days; read in UTC so a midnight date never shifts a day. */
function formatDecided(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A Pillar's decisions, grouped by what each is linked to (ticket 1004): one
 * group per scope, feature or ticket, so the decisions one piece of work
 * produced read as one line, and "General" (decisions with no link, the ones
 * that apply to the whole Pillar) comes first. Linked groups start collapsed;
 * General starts open.
 */
export function PillarDecisionGroups({
  decisions,
  workspaceSlug,
}: {
  decisions: PillarDecision[];
  workspaceSlug: string;
}) {
  const groups = groupDecisionsByLink(decisions);
  const [open, setOpen] = useState<Set<string>>(() => new Set([GENERAL_GROUP_KEY]));
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Panel padding="sm">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {groups.map((group) => {
          const isOpen = open.has(group.key);
          const Chevron = isOpen ? IconChevronDown : IconChevronRight;
          return (
            <li key={group.key}>
              <UnstyledButton
                onClick={() => toggle(group.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-hover"
              >
                <Chevron size={14} className="shrink-0 text-text-muted" />
                <Text size="sm" fw={500} className="min-w-0 flex-1 truncate text-text-primary">
                  {group.name}
                </Text>
                <Text size="xs" className="shrink-0 text-text-muted">
                  {group.decisions.length}
                </Text>
                <Text size="xs" className="w-24 shrink-0 text-right text-text-muted">
                  {group.newestDecidedAt ? formatDecided(group.newestDecidedAt) : ""}
                </Text>
              </UnstyledButton>
              {isOpen ? (
                group.decisions.length === 0 ? (
                  <Text size="xs" className="py-1 pl-7 text-text-muted">
                    No decision applies to the whole Pillar.
                  </Text>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-6">
                    {group.decisions.map((decision) => (
                      <DecisionRow key={decision.id} decision={decision} workspaceSlug={workspaceSlug} />
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function DecisionRow({ decision, workspaceSlug }: { decision: PillarDecision; workspaceSlug: string }) {
  const replaced = REPLACED_DECISION_STATUSES.has(decision.status);
  const hasTitle = Boolean(decision.title?.trim());
  return (
    <li className="flex items-start gap-2 py-1">
      <span className="mt-0.5 inline-flex shrink-0 text-text-muted">
        <IconGavel size={14} />
      </span>
      <Text size="xs" className="mt-0.5 shrink-0 text-text-muted">
        {decision.label}
      </Text>
      <div className="min-w-0 flex-1">
        <Link
          href={`/w/${workspaceSlug}/decisions/d/${decision.id}`}
          className={`block truncate text-sm hover:underline ${
            replaced ? "text-text-muted line-through" : "text-text-primary"
          }`}
        >
          {decisionRowText(decision)}
        </Link>
        {hasTitle ? (
          <Text size="xs" className="truncate text-text-muted">
            {decision.statement}
          </Text>
        ) : null}
      </div>
      <Text size="xs" className="mt-0.5 shrink-0 text-text-muted">
        {decision.status.toLowerCase()}
      </Text>
      {decision.decidedAt ? (
        <Text size="xs" className="mt-0.5 w-24 shrink-0 text-right text-text-muted">
          {formatDecided(decision.decidedAt)}
        </Text>
      ) : null}
    </li>
  );
}
