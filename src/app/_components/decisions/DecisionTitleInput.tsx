"use client";

import { useState } from "react";
import { ActionIcon, Button, Group, Modal, Stack, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { DECISION_TITLE_MAX_WORDS, countTitleWords } from "~/lib/decision-groups";

/**
 * A decision's short title: the outcome, the row text in every decision list
 * (ticket 1004). Optional; a decision without one reads by its statement.
 * The six-word maximum is advice, so a longer title warns but still saves.
 */
export function DecisionTitleInput({
  value,
  onChange,
  onSubmitShortcut,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Cmd/Ctrl+Enter, for forms that submit from any field. */
  onSubmitShortcut?: () => void;
  autoFocus?: boolean;
}) {
  const words = countTitleWords(value);
  const tooLong = words > DECISION_TITLE_MAX_WORDS;
  return (
    <TextInput
      label="Title"
      description={`State the outcome, not the topic, in ${DECISION_TITLE_MAX_WORDS} words or fewer.`}
      placeholder="Text place beats Dataminr location"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      maxLength={120}
      data-autofocus={autoFocus || undefined}
      error={
        tooLong
          ? `${words} words. Try ${DECISION_TITLE_MAX_WORDS} or fewer so the list stays easy to scan.`
          : undefined
      }
      onKeyDown={(e) => {
        if (onSubmitShortcut && e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmitShortcut();
      }}
    />
  );
}

/**
 * The pencil beside a decision's heading: edit its title in a small modal.
 * Saves through `decision.update`; an empty title clears it, so the decision
 * reads by its statement again.
 */
export function EditDecisionTitleButton({
  workspaceId,
  decisionId,
  title,
}: {
  workspaceId: string;
  decisionId: string;
  title: string | null;
}) {
  const utils = api.useUtils();
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState(title ?? "");
  const update = api.decision.update.useMutation({
    onSuccess: async () => {
      await utils.decision.get.invalidate({ workspaceId, decisionId });
      await utils.decision.list.invalidate();
      setOpened(false);
    },
    onError: (error) =>
      notifications.show({ title: "Couldn't save the title", message: error.message, color: "red" }),
  });
  const save = () =>
    update.mutate({ workspaceId, decisionId, title: value.trim() ? value.trim() : null });

  return (
    <>
      <Tooltip label={title ? "Edit title" : "Add a title"}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={title ? "Edit title" : "Add a title"}
          onClick={() => {
            setValue(title ?? "");
            setOpened(true);
          }}
        >
          <IconPencil size={16} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Decision title" centered>
        <Stack gap="md">
          <DecisionTitleInput value={value} onChange={setValue} onSubmitShortcut={save} autoFocus />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setOpened(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button onClick={save} loading={update.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
