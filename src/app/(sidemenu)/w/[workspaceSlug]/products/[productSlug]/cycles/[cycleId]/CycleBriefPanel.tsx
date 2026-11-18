"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Group, MultiSelect, Select, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconExternalLink, IconPlus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { Panel, Pill, SectionHeader } from "~/app/_components/ui";
import {
  OUTCOME_STATUSES,
  OUTCOME_STATUS_LABELS,
  isOutcomeStatus,
} from "~/server/services/cycleBriefs/types";

import { SignOffReviewModal } from "./SignOffReviewModal";

const PENDING_LABEL = {
  new: "Not public yet",
  reworded: "Change waits for sign-off",
  removed: "Removal waits for sign-off",
} as const;

const STATUS_OPTIONS = OUTCOME_STATUSES.map((value) => ({ value, label: OUTCOME_STATUS_LABELS[value] }));

interface OutcomeDraft {
  text: string;
  why: string;
  featureIds: string[];
  goalId: number | null;
}

interface LinkOptions {
  features: Array<{ id: string; name: string }>;
  objectives: Array<{ id: number; title: string }>;
}

function OutcomeForm({
  initial,
  options,
  submitLabel,
  isSaving,
  onSubmit,
  onCancel,
}: {
  initial: OutcomeDraft;
  options: LinkOptions | undefined;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (draft: OutcomeDraft) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial.text);
  const [why, setWhy] = useState(initial.why);
  const [featureIds, setFeatureIds] = useState(initial.featureIds);
  const [goalId, setGoalId] = useState(initial.goalId);
  const canSave = text.trim().length > 0 && why.trim().length > 0;
  return (
    <Stack gap="xs">
      <Textarea
        label="Outcome"
        description="One aim, in plain language a user would understand"
        placeholder="The Sudan team uses the app every week"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={1}
      />
      <Textarea
        label="Why"
        description="Required: why this matters to the people reading the brief"
        value={why}
        onChange={(e) => setWhy(e.currentTarget.value)}
        autosize
        minRows={1}
      />
      <Group grow align="flex-start">
        <MultiSelect
          size="xs"
          label="Features"
          description="For the team; not shown publicly"
          data={(options?.features ?? []).map((f) => ({ value: f.id, label: f.name }))}
          value={featureIds}
          onChange={setFeatureIds}
          searchable
          clearable
        />
        <Select
          size="xs"
          label="Objective"
          description="At most one; not shown publicly"
          data={(options?.objectives ?? []).map((g) => ({ value: String(g.id), label: g.title }))}
          value={goalId === null ? null : String(goalId)}
          onChange={(v) => setGoalId(v ? Number(v) : null)}
          searchable
          clearable
        />
      </Group>
      <Group gap="xs">
        <Button
          size="xs"
          disabled={!canSave}
          loading={isSaving}
          onClick={() => onSubmit({ text, why, featureIds, goalId })}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button size="xs" variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Group>
    </Stack>
  );
}

/**
 * The internal editor for a cycle's brief (ADR-0085): the team drafts
 * outcomes, a Product owner signs them off, and only then do they show on the
 * product's public brief URL.
 */
export function CycleBriefPanel({
  cycleId,
  workspaceSlug,
  productSlug,
  cycleSlug,
}: {
  cycleId: string;
  workspaceSlug: string;
  productSlug: string;
  cycleSlug: string;
}) {
  const utils = api.useUtils();
  const { data } = api.product.cycleBrief.getForCycle.useQuery({ cycleId });
  const briefId = data?.brief?.id;
  const { data: linkOptions } = api.product.cycleBrief.linkOptions.useQuery(
    { briefId: briefId ?? "" },
    { enabled: !!briefId },
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const invalidate = () => utils.product.cycleBrief.getForCycle.invalidate({ cycleId });
  const onError = (err: { message: string }) =>
    notifications.show({ color: "red", title: "Cycle brief", message: err.message });

  const createBrief = api.product.cycleBrief.create.useMutation({ onSuccess: invalidate, onError });
  const upsertOutcome = api.product.cycleBrief.upsertOutcome.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      setIsAdding(false);
      await invalidate();
    },
    onError,
  });
  const signOff = api.product.cycleBrief.signOff.useMutation({
    onSuccess: async () => {
      setIsReviewing(false);
      await invalidate();
    },
    onError,
  });
  const requestRemove = api.product.cycleBrief.requestRemoveOutcome.useMutation({ onSuccess: invalidate, onError });
  const setStatus = api.product.cycleBrief.setStatus.useMutation({ onSuccess: invalidate, onError });

  if (!data?.canHaveBrief) return null;
  const { brief, isProductOwner, hasProductOwner, hasPendingChanges, cycleGoal } = data;
  const ownersHref = `/w/${workspaceSlug}/products/${productSlug}/settings?section=owners`;
  const publicHref = `/briefs/${workspaceSlug}/${productSlug}/${cycleSlug}`;

  if (!brief) {
    return (
      <Panel padding="md">
        <SectionHeader title="Cycle brief" className="mb-2" />
        <Text size="sm" className="mb-3 text-text-secondary">
          A public, plain-language plan for people outside the team: what this cycle aims for and why.
          It goes public when a Product owner signs it off.
        </Text>
        <Button size="xs" loading={createBrief.isPending} onClick={() => createBrief.mutate({ cycleId })}>
          Start the brief
        </Button>
      </Panel>
    );
  }

  const isPublic = brief.planSignedOffAt !== null;

  return (
    <Panel padding="md">
      <SectionHeader
        title="Cycle brief"
        count={brief.outcomes.length}
        className="mb-3"
        action={
          isPublic ? (
            <a
              href={publicHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
            >
              Public page <IconExternalLink size={12} />
            </a>
          ) : (
            <Pill tone="neutral" size="xs">
              Not public
            </Pill>
          )
        }
      />

      {brief.outcomes.length === 0 && !isAdding && (
        <Text size="sm" className="mb-3 text-text-muted">
          No outcomes yet. Write three or four aims for this cycle, each with why it matters.
        </Text>
      )}

      <Stack gap="sm">
        {brief.outcomes.map((outcome) =>
          editingId === outcome.id ? (
            <Panel key={outcome.id} variant="muted" padding="sm">
              <OutcomeForm
                options={linkOptions}
                initial={{
                  text: outcome.draftText,
                  why: outcome.draftWhy,
                  featureIds: outcome.features.map((f) => f.feature.id),
                  goalId: outcome.goalId,
                }}
                submitLabel="Save"
                isSaving={upsertOutcome.isPending}
                onSubmit={(d) => upsertOutcome.mutate({ briefId: brief.id, outcomeId: outcome.id, ...d })}
                onCancel={() => setEditingId(null)}
              />
            </Panel>
          ) : (
            <Panel key={outcome.id} variant="muted" padding="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Text size="sm" className="font-medium text-text-primary">
                    {outcome.draftText}
                  </Text>
                  <Text size="xs" className="mt-1 text-text-secondary">
                    Why: {outcome.draftWhy}
                  </Text>
                  {(outcome.features.length > 0 || outcome.goal) && (
                    <Text size="xs" className="mt-1 text-text-muted">
                      {[
                        outcome.features.length > 0
                          ? `Features: ${outcome.features.map((f) => f.feature.name).join(", ")}`
                          : null,
                        outcome.goal ? `Objective: ${outcome.goal.title}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  )}
                </div>
                <Group gap={4} wrap="nowrap">
                  {outcome.pendingChange !== "removed" && (
                    <Button size="compact-xs" variant="subtle" onClick={() => setEditingId(outcome.id)}>
                      Edit
                    </Button>
                  )}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color={outcome.pendingChange === "removed" ? undefined : "red"}
                    onClick={() =>
                      requestRemove.mutate({ outcomeId: outcome.id, remove: outcome.pendingChange !== "removed" })
                    }
                  >
                    {outcome.pendingChange === "removed" ? "Keep" : "Remove"}
                  </Button>
                </Group>
              </Group>
              {outcome.pendingChange && (
                <Pill tone={outcome.pendingChange === "removed" ? "danger" : "warning"} size="xs" className="mt-2">
                  {PENDING_LABEL[outcome.pendingChange]}
                </Pill>
              )}
              <Group gap="xs" className="mt-2">
                <Select
                  size="xs"
                  w={140}
                  placeholder="Set status"
                  aria-label="Weekly status"
                  data={STATUS_OPTIONS}
                  value={isOutcomeStatus(outcome.status) ? outcome.status : null}
                  disabled={brief.closedAt !== null}
                  onChange={(value) => {
                    if (isOutcomeStatus(value)) setStatus.mutate({ outcomeId: outcome.id, status: value });
                  }}
                />
                <Text size="xs" className="text-text-muted">
                  {outcome.statusSetAt
                    ? `as of ${new Date(outcome.statusSetAt).toLocaleDateString()} · public at once`
                    : "Set weekly; goes public at once, no sign-off"}
                </Text>
              </Group>
            </Panel>
          ),
        )}

        {isAdding ? (
          <Panel variant="muted" padding="sm">
            <OutcomeForm
              options={linkOptions}
              initial={{
                text: brief.outcomes.length === 0 ? (cycleGoal ?? "") : "",
                why: "",
                featureIds: [],
                goalId: null,
              }}
              submitLabel="Add outcome"
              isSaving={upsertOutcome.isPending}
              onSubmit={(d) => upsertOutcome.mutate({ briefId: brief.id, ...d })}
              onCancel={() => setIsAdding(false)}
            />
          </Panel>
        ) : (
          <Group>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setIsAdding(true)}>
              Add outcome
            </Button>
          </Group>
        )}
      </Stack>

      <Group justify="space-between" className="mt-4">
        {hasProductOwner ? (
          <Text size="xs" className="text-text-muted">
            {brief.planSignedOffAt
              ? `Signed off ${new Date(brief.planSignedOffAt).toLocaleDateString()}`
              : "Only a Product owner can sign off the plan."}
          </Text>
        ) : (
          <Text size="xs" className="text-text-muted">
            This product has no Product owner, so nobody can sign off the brief.{" "}
            <Link href={ownersHref} className="text-text-primary underline">
              Set a Product owner
            </Link>
          </Text>
        )}
        {isProductOwner && (
          <Button
            size="xs"
            onClick={() => setIsReviewing(true)}
            disabled={brief.outcomes.length === 0 || !hasPendingChanges}
          >
            {isPublic ? "Review and sign off changes" : "Review and publish"}
          </Button>
        )}
      </Group>

      <SignOffReviewModal
        opened={isReviewing}
        onClose={() => setIsReviewing(false)}
        isFirstSignOff={!isPublic}
        isSigningOff={signOff.isPending}
        onSignOff={() => signOff.mutate({ briefId: brief.id })}
        rows={brief.outcomes.map((o, i) => ({
          id: o.id,
          label: `Outcome ${i + 1}`,
          draftText: o.draftText,
          draftWhy: o.draftWhy,
          publicText: o.publicText,
          publicWhy: o.publicWhy,
          pendingChange: isPublic ? o.pendingChange : o.pendingChange === "removed" ? null : "new",
        }))}
      />
    </Panel>
  );
}
