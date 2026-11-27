"use client";

import Link from "next/link";
import { ActionIcon, Badge, Text, Tooltip } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { decisionStatusBadge } from "~/app/_components/decisions/DetailPreview";
import { decisionRowText } from "~/lib/decision-groups";

/**
 * The Decisions block for a feature - decisions linked "implemented by" it
 * or one of its scopes (ADR-0060); a scope-linked row carries the scope's
 * version. Grouped by status rather than by a link type: an OPEN decision
 * linked to a feature reads as a question raised on it, everything else as a
 * decision the feature carries out.
 *
 * Renders nothing until something is linked, so features without decisions
 * keep the page they had.
 */
export function FeatureDecisionsSection({
  featureId,
  workspaceId,
  workspaceSlug,
}: {
  featureId: string;
  workspaceId: string | null | undefined;
  workspaceSlug: string | undefined;
}) {
  const { data: decisions } = api.decision.listForFeature.useQuery(
    { workspaceId: workspaceId ?? "", featureId },
    { enabled: !!workspaceId && !!featureId },
  );

  if (!decisions || decisions.length === 0) return null;

  const openQuestions = decisions.filter((d) => d.status === "OPEN");
  const decided = decisions.filter((d) => d.status !== "OPEN");

  return (
    <CollapsibleSection
      title="Decisions"
      meta={
        openQuestions.length > 0
          ? `${decided.length} decided · ${openQuestions.length} open`
          : String(decided.length)
      }
    >
      <div className="flex flex-col gap-3">
        {openQuestions.length > 0 && (
          <DecisionGroup
            title="Open questions"
            decisions={openQuestions}
            workspaceSlug={workspaceSlug}
          />
        )}
        {decided.length > 0 && (
          <DecisionGroup
            title="Decisions"
            decisions={decided}
            workspaceSlug={workspaceSlug}
          />
        )}
      </div>
    </CollapsibleSection>
  );
}

export interface DecisionRow {
  id: string;
  label: string;
  /** The outcome in six words or fewer; the row text when set (ticket 1004). */
  title?: string | null;
  statement: string;
  status: string;
  decidedAt?: Date | string | null;
  /** The feature's scope this decision is linked to, if any (ticket 1004). */
  scope?: { version: string } | null;
}

function formatDecidedAt(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One titled group of decision rows - shared by the feature and ticket
 * pages. `onRemove` adds a hover control that removes the row's link (the
 * decision itself is untouched).
 */
export function DecisionGroup<T extends DecisionRow>({
  title,
  decisions,
  workspaceSlug,
  onRemove,
}: {
  title: string;
  decisions: T[];
  workspaceSlug: string | undefined;
  onRemove?: (decision: T) => void;
}) {
  return (
    <div>
      <Text fz={11} fw={600} className="text-text-muted mb-1.5">
        {title}
      </Text>
      {/* The container-list grammar (see DESIGN.md): one bordered container,
          divider-separated rows - same as Scopes, Requirements, and Tickets. */}
      <div className="border border-border-primary rounded-lg overflow-hidden">
        {decisions.map((decision, i) => {
          const badge = decisionStatusBadge(decision.status);
          const decided = formatDecidedAt(decision.decidedAt);
          return (
            <Link
              key={decision.id}
              href={`/w/${workspaceSlug}/decisions/d/${decision.id}`}
              className={`group flex items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-surface-hover ${i < decisions.length - 1 ? "border-b border-border-primary" : ""}`}
            >
              <Text size="xs" className="text-text-muted font-mono w-14 shrink-0">
                {decision.label}
              </Text>
              <div className="flex-1 min-w-0">
                <Text size="sm" className="text-text-primary" lineClamp={1}>
                  {decisionRowText(decision)}
                </Text>
                {decision.title?.trim() ? (
                  <Text size="xs" className="text-text-muted" lineClamp={1}>
                    {decision.statement}
                  </Text>
                ) : null}
              </div>
              {decision.scope ? (
                <Badge size="xs" variant="outline" color="gray" className="shrink-0">
                  {decision.scope.version}
                </Badge>
              ) : null}
              {decided && (
                <Text size="xs" className="text-text-muted shrink-0">
                  {decided}
                </Text>
              )}
              <Badge size="xs" variant="light" color={badge.color} className="shrink-0">
                {badge.label}
              </Badge>
              {onRemove && (
                <Tooltip label="Remove link" withinPortal>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={`Remove link to ${decision.label}`}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemove(decision);
                    }}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
