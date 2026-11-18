"use client";

import { useState } from "react";
import { Button, Group, Select, Stack, Text, Textarea } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { Panel, Pill, SectionHeader } from "~/app/_components/ui";
import type { PendingChange } from "~/server/services/cycleBriefs/changes";

export interface ExclusionRow {
  id: string;
  draftText: string;
  draftReason: string;
  insightId: string | null;
  insight: { id: string; title: string } | null;
  pendingChange: PendingChange | null;
}

interface ExclusionDraft {
  text: string;
  reason: string;
  insightId: string | null;
}

const PENDING_LABEL: Record<PendingChange, string> = {
  new: "Not public yet",
  reworded: "Change waits for sign-off",
  removed: "Removal waits for sign-off",
};

function ExclusionForm({
  initial,
  insights,
  submitLabel,
  isSaving,
  onSubmit,
  onCancel,
}: {
  initial: ExclusionDraft;
  insights: Array<{ id: string; title: string }>;
  submitLabel: string;
  isSaving: boolean;
  onSubmit: (draft: ExclusionDraft) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial.text);
  const [reason, setReason] = useState(initial.reason);
  const [insightId, setInsightId] = useState(initial.insightId);
  return (
    <Stack gap="xs">
      <Textarea
        label="Not this cycle"
        placeholder="Arabic translation of the dashboard"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={1}
      />
      <Textarea
        label="Reason"
        description="Required: why it is not happening this cycle"
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        autosize
        minRows={1}
      />
      <Select
        size="xs"
        label="Answers feedback"
        description="Optional: the Insight this item answers; not shown publicly"
        data={insights.map((i) => ({ value: i.id, label: i.title }))}
        value={insightId}
        onChange={setInsightId}
        searchable
        clearable
      />
      <Group gap="xs">
        <Button
          size="xs"
          disabled={!text.trim() || !reason.trim()}
          loading={isSaving}
          onClick={() => onSubmit({ text, reason, insightId })}
        >
          {submitLabel}
        </Button>
        <Button size="xs" variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

/** The brief's cut line (D-0095): what the team is not doing this cycle, and why. */
export function NotThisCycleSection({
  rows,
  insights,
  isSaving,
  onSave,
  onRemove,
}: {
  rows: ExclusionRow[];
  insights: Array<{ id: string; title: string }>;
  isSaving: boolean;
  onSave: (draft: ExclusionDraft & { exclusionId?: string }, done: () => void) => void;
  onRemove: (exclusionId: string, remove: boolean) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  return (
    <div className="mt-5">
      <SectionHeader title="Not this cycle" count={rows.length} className="mb-2" />
      <Stack gap="sm">
        {rows.length === 0 && !isAdding && (
          <Text size="sm" className="text-text-muted">
            Nothing cut yet. Say what is not happening this cycle, and why, so readers are not left guessing.
          </Text>
        )}
        {rows.map((row) =>
          editingId === row.id ? (
            <Panel key={row.id} variant="muted" padding="sm">
              <ExclusionForm
                initial={{ text: row.draftText, reason: row.draftReason, insightId: row.insightId }}
                insights={insights}
                submitLabel="Save"
                isSaving={isSaving}
                onSubmit={(d) => onSave({ ...d, exclusionId: row.id }, () => setEditingId(null))}
                onCancel={() => setEditingId(null)}
              />
            </Panel>
          ) : (
            <Panel key={row.id} variant="muted" padding="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Text size="sm" className="font-medium text-text-primary">
                    {row.draftText}
                  </Text>
                  <Text size="xs" className="mt-1 text-text-secondary">
                    Reason: {row.draftReason}
                  </Text>
                  {row.insight && (
                    <Text size="xs" className="mt-1 text-text-muted">
                      Answers: {row.insight.title}
                    </Text>
                  )}
                </div>
                <Group gap={4} wrap="nowrap">
                  {row.pendingChange !== "removed" && (
                    <Button size="compact-xs" variant="subtle" onClick={() => setEditingId(row.id)}>
                      Edit
                    </Button>
                  )}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color={row.pendingChange === "removed" ? undefined : "red"}
                    onClick={() => onRemove(row.id, row.pendingChange !== "removed")}
                  >
                    {row.pendingChange === "removed" ? "Keep" : "Remove"}
                  </Button>
                </Group>
              </Group>
              {row.pendingChange && (
                <Pill tone={row.pendingChange === "removed" ? "danger" : "warning"} size="xs" className="mt-2">
                  {PENDING_LABEL[row.pendingChange]}
                </Pill>
              )}
            </Panel>
          ),
        )}
        {isAdding ? (
          <Panel variant="muted" padding="sm">
            <ExclusionForm
              initial={{ text: "", reason: "", insightId: null }}
              insights={insights}
              submitLabel="Add item"
              isSaving={isSaving}
              onSubmit={(d) => onSave(d, () => setIsAdding(false))}
              onCancel={() => setIsAdding(false)}
            />
          </Panel>
        ) : (
          <Group>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setIsAdding(true)}>
              Add a Not this cycle item
            </Button>
          </Group>
        )}
      </Stack>
    </div>
  );
}
