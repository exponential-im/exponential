"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconExternalLink, IconPlus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { Panel, Pill, SectionHeader } from "~/app/_components/ui";

interface OutcomeDraft {
  text: string;
  why: string;
}

function OutcomeForm({
  initial,
  submitLabel,
  isSaving,
  onSubmit,
  onCancel,
}: {
  initial: OutcomeDraft;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (draft: OutcomeDraft) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial.text);
  const [why, setWhy] = useState(initial.why);
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
      <Group gap="xs">
        <Button size="xs" disabled={!canSave} loading={isSaving} onClick={() => onSubmit({ text, why })}>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

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
  const signOff = api.product.cycleBrief.signOff.useMutation({ onSuccess: invalidate, onError });

  if (!data?.canHaveBrief) return null;
  const { brief, isProductOwner, hasProductOwner, cycleGoal } = data;
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

  const onSignOff = () => {
    modals.openConfirmModal({
      title: isPublic ? "Sign off changes" : "Sign off and publish",
      children: (
        <Text size="sm">
          {isPublic
            ? "The outcomes as drafted replace what the public brief shows."
            : "The outcomes as drafted go public on the product's brief page. Nobody is notified."}
        </Text>
      ),
      labels: { confirm: "Sign off", cancel: "Cancel" },
      onConfirm: () => signOff.mutate({ briefId: brief.id }),
    });
  };

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
                initial={{ text: outcome.draftText, why: outcome.draftWhy }}
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
                </div>
                <Button size="compact-xs" variant="subtle" onClick={() => setEditingId(outcome.id)}>
                  Edit
                </Button>
              </Group>
            </Panel>
          ),
        )}

        {isAdding ? (
          <Panel variant="muted" padding="sm">
            <OutcomeForm
              initial={{ text: brief.outcomes.length === 0 ? (cycleGoal ?? "") : "", why: "" }}
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
          <Button size="xs" onClick={onSignOff} loading={signOff.isPending} disabled={brief.outcomes.length === 0}>
            {isPublic ? "Sign off changes" : "Sign off and publish"}
          </Button>
        )}
      </Group>
    </Panel>
  );
}
