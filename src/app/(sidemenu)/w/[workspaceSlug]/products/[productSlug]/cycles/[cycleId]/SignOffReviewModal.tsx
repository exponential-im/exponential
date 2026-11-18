"use client";

import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { Panel, Pill } from "~/app/_components/ui";
import type { PendingChange } from "~/server/services/cycleBriefs/changes";

export interface ReviewRow {
  id: string;
  label: string;
  draftText: string;
  draftWhy: string;
  publicText: string | null;
  publicWhy: string | null;
  pendingChange: PendingChange | null;
}

const CHANGE_LABEL: Record<PendingChange, string> = {
  new: "Adds",
  reworded: "Rewords",
  removed: "Removes",
};

function Version({ heading, text, why }: { heading: string; text: string; why: string | null }) {
  return (
    <div>
      <Text size="xs" className="uppercase tracking-wide text-text-muted">
        {heading}
      </Text>
      <Text size="sm" className="text-text-primary">
        {text}
      </Text>
      {why && (
        <Text size="xs" className="text-text-secondary">
          Why: {why}
        </Text>
      )}
    </div>
  );
}

/**
 * The Product owner's review before sign-off (ADR-0085): what the public
 * brief shows now next to what it will show after, one changed row at a time.
 */
export function SignOffReviewModal({
  opened,
  onClose,
  isFirstSignOff,
  rows,
  isSigningOff,
  onSignOff,
}: {
  opened: boolean;
  onClose: () => void;
  isFirstSignOff: boolean;
  rows: ReviewRow[];
  isSigningOff: boolean;
  onSignOff: () => void;
}) {
  const changed = rows.filter((r) => r.pendingChange !== null);
  const unchanged = rows.length - changed.length;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={isFirstSignOff ? "Review and publish the plan" : "Review changes since the last sign-off"}
    >
      <Stack gap="sm">
        <Text size="sm" className="text-text-secondary">
          {isFirstSignOff
            ? "Signing off publishes these on the product's public brief page. Nobody is notified."
            : "Until you sign off, the public page keeps showing the signed-off version. Changed outcomes show the date of the change."}
        </Text>
        {changed.length === 0 && (
          <Text size="sm" className="text-text-muted">
            Nothing has changed since the last sign-off.
          </Text>
        )}
        {changed.map((row) => (
          <Panel key={row.id} variant="muted" padding="sm">
            <Group gap="xs" className="mb-2">
              <Pill tone={row.pendingChange === "removed" ? "danger" : "brand"} size="xs">
                {row.pendingChange ? CHANGE_LABEL[row.pendingChange] : ""}
              </Pill>
              <Text size="xs" className="text-text-muted">
                {row.label}
              </Text>
            </Group>
            {row.pendingChange === "reworded" ? (
              <Stack gap="xs">
                <Version heading="Public now" text={row.publicText ?? ""} why={row.publicWhy} />
                <Version heading="After sign-off" text={row.draftText} why={row.draftWhy} />
              </Stack>
            ) : row.pendingChange === "removed" ? (
              <Version heading="Public now" text={row.publicText ?? ""} why={row.publicWhy} />
            ) : (
              <Version heading="After sign-off" text={row.draftText} why={row.draftWhy} />
            )}
          </Panel>
        ))}
        {unchanged > 0 && changed.length > 0 && (
          <Text size="xs" className="text-text-muted">
            {unchanged} more unchanged.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSignOff} loading={isSigningOff} disabled={changed.length === 0 && !isFirstSignOff}>
            {isFirstSignOff ? "Sign off and publish" : "Sign off changes"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
