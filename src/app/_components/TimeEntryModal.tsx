"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPencil,
  IconTrash,
  IconRefresh,
} from "@tabler/icons-react";

import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { DateTimeField } from "./DateTimeField";
import { EditActionModal } from "./EditActionModal";
import { formatElapsedClock } from "~/hooks/useActiveTimer";
import { toPlainText } from "~/lib/content/plainText";
import type { CalendarTimeEntry } from "./calendar/types";

interface TimeEntryModalProps {
  entry: CalendarTimeEntry | null;
  /**
   * With no `entry`, the modal logs a NEW completed entry on this day instead
   * of editing one. The parent should keep it stable while the modal is open.
   */
  createForDate?: Date | null;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const QUARTER_HOUR_MS = 15 * 60 * 1000;

/**
 * Starting bounds for a new entry: the last hour (to the quarter hour) when
 * logging today, otherwise 9–10am on the chosen day.
 */
function defaultNewEntryBounds(day: Date): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(day);
  if (day.toDateString() === now.toDateString()) {
    end.setTime(Math.floor(now.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
  } else {
    end.setHours(10, 0, 0, 0);
  }
  return { start: new Date(end.getTime() - 60 * 60 * 1000), end };
}

const TIME_ENTRY_QUERIES_TO_REFRESH = ["listByDateRange", "listRecent", "getActive"] as const;

/**
 * Slim TimeEntry editor. Action-level edits delegate to the existing
 * `EditActionModal` via the pencil button (nested modal); this modal handles
 * only entry-level state: start/end pickers, action reassignment, and delete.
 *
 * Given `createForDate` and no `entry`, it logs a new completed entry
 * (`timeEntry.create`) against an Action picked here.
 */
export function TimeEntryModal({
  entry,
  createForDate,
  opened,
  onClose,
  onSuccess,
}: TimeEntryModalProps) {
  const utils = api.useUtils();
  const { workspaceId } = useWorkspace();
  const isCreate = !entry && !!createForDate;

  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionName, setActionName] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [editActionOpened, setEditActionOpened] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Set when the nested action editor's Time section changes a piece; this
  // modal's own fields (and the parent's `entry`) may then describe a piece
  // that was edited or deleted underneath it.
  const [timeChangedInside, setTimeChangedInside] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setStartedAt(new Date(entry.startedAt));
    setEndedAt(entry.endedAt ? new Date(entry.endedAt) : null);
    setActionId(entry.action.id);
    setActionName(entry.action.name);
    setQuery("");
  }, [entry]);

  // Each time the create form opens, start from a blank Action and the
  // chosen day's default bounds.
  useEffect(() => {
    if (entry || !createForDate || !opened) return;
    const { start, end } = defaultNewEntryBounds(createForDate);
    setStartedAt(start);
    setEndedAt(end);
    setActionId(null);
    setActionName("");
    setQuery("");
    setPickerOpen(true);
  }, [entry, createForDate, opened]);

  const { data: suggestions = [], isFetching: isFetchingSuggestions } =
    api.action.searchByTitle.useQuery(
    {
      query,
      workspaceId: workspaceId ?? undefined,
      limit: 8,
    },
    { enabled: pickerOpen && query.trim().length > 0 },
  );

  const refreshTimeEntryQueries = () =>
    Promise.all(
      TIME_ENTRY_QUERIES_TO_REFRESH.map((name) => utils.timeEntry[name].invalidate()),
    );

  const createMutation = api.timeEntry.create.useMutation({
    onSuccess: async () => {
      await refreshTimeEntryQueries();
      notifications.show({ title: "Logged", message: "Time entry created", color: "green" });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      notifications.show({ title: "Error", message: err.message, color: "red" });
    },
  });

  const updateMutation = api.timeEntry.update.useMutation({
    onSuccess: async () => {
      await refreshTimeEntryQueries();
      notifications.show({ title: "Saved", message: "Time entry updated", color: "green" });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      notifications.show({ title: "Error", message: err.message, color: "red" });
    },
  });

  const deleteMutation = api.timeEntry.delete.useMutation({
    onSuccess: async () => {
      await refreshTimeEntryQueries();
      notifications.show({ title: "Deleted", message: "Time entry removed", color: "blue" });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      notifications.show({ title: "Error", message: err.message, color: "red" });
    },
  });

  const durationLabel = useMemo(() => {
    if (!startedAt) return "—";
    if (!endedAt) return "running…";
    const ms = Math.max(0, endedAt.getTime() - startedAt.getTime());
    return formatElapsedClock(ms);
  }, [startedAt, endedAt]);

  const isDirty = useMemo(() => {
    if (!entry) return false;
    const startChanged =
      startedAt?.getTime() !== new Date(entry.startedAt).getTime();
    const endChanged =
      (endedAt?.getTime() ?? null) !==
      (entry.endedAt ? new Date(entry.endedAt).getTime() : null);
    const actionChanged = actionId !== entry.action.id;
    return startChanged || endChanged || actionChanged;
  }, [entry, startedAt, endedAt, actionId]);

  if (!entry && !isCreate) return null;

  const handleSave = () => {
    if (!startedAt) return;
    if (endedAt && endedAt.getTime() <= startedAt.getTime()) {
      notifications.show({
        title: "Invalid range",
        message: "End time must be after start time",
        color: "red",
      });
      return;
    }
    if (!entry) {
      // A new entry is always complete: the running Timer is the only way to
      // have an open-ended one.
      if (!actionId || !endedAt) return;
      createMutation.mutate({ actionId, startedAt, endedAt });
      return;
    }
    updateMutation.mutate({
      entryId: entry.id,
      startedAt,
      endedAt,
      actionId: actionId ?? undefined,
    });
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={
          <Group gap="xs">
            <Text fw={600}>Time entry</Text>
            {!entry ? (
              <Badge size="xs" variant="light">
                new
              </Badge>
            ) : entry.status === "PROPOSED" ? (
              <Badge size="xs" variant="outline" color="yellow">
                proposed
              </Badge>
            ) : (
              <Badge size="xs" variant="light" color="green">
                confirmed
              </Badge>
            )}
            {entry && (
              <Tooltip label="Edit underlying action" withArrow>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label="Edit action"
                  onClick={() => setEditActionOpened(true)}
                >
                  <IconPencil size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="sm">
          <div>
            <Text size="xs" c="dimmed">
              Action
            </Text>
            <Group gap="xs" align="center">
              {actionId ? (
                <Text fw={500}>{toPlainText(actionName) || "Untitled"}</Text>
              ) : (
                <Text c="dimmed">Search for the action this time was spent on</Text>
              )}
              {actionId && (
                <Tooltip
                  label={pickerOpen ? "Cancel reassignment" : "Reassign to another action"}
                  withArrow
                >
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label="Reassign"
                    onClick={() => setPickerOpen((v) => !v)}
                  >
                    <IconRefresh size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            {pickerOpen && (
              <Stack gap={4} mt="xs">
                <input
                  type="text"
                  className="rounded border border-border-primary bg-background-primary px-2 py-1 text-sm text-text-primary"
                  placeholder="Search actions…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {query.trim().length > 0 && suggestions.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border border-border-primary bg-surface-secondary">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="block w-full px-2 py-1 text-left text-sm text-text-primary hover:bg-surface-hover"
                        onClick={() => {
                          setActionId(s.id);
                          setActionName(s.name);
                          setPickerOpen(false);
                          setQuery("");
                        }}
                      >
                        {s.name}
                        {s.project?.name && (
                          <span className="ml-2 text-text-muted">
                            · {s.project.name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {query.trim().length > 0 && !isFetchingSuggestions && suggestions.length === 0 && (
                  <Text size="xs" c="dimmed">
                    No matching actions
                  </Text>
                )}
              </Stack>
            )}
          </div>

          <DateTimeField
            label="Started"
            value={startedAt}
            onChange={setStartedAt}
          />

          <DateTimeField
            label="Ended"
            value={endedAt}
            onChange={setEndedAt}
            description={entry ? "Leave blank to keep this entry running" : undefined}
            required={!entry}
          />

          <Text size="xs" c="dimmed">
            Duration: <span className="font-mono">{durationLabel}</span>
          </Text>

          {entry?.note && (
            <div>
              <Text size="xs" c="dimmed">
                Note
              </Text>
              <Text size="sm" className="text-text-primary">
                {entry.note}
              </Text>
            </div>
          )}

          {entry?.status === "PROPOSED" && (
            <Text size="xs" c="dimmed">
              Proposed by the Daily worklog. Saving or deleting confirms it; the
              worklog will not touch it again.
            </Text>
          )}

          <Group justify="space-between" mt="md">
            {entry ? (
              <Tooltip label="Delete entry" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label="Delete entry"
                  onClick={() => {
                    if (window.confirm("Delete this time entry?")) {
                      deleteMutation.mutate({ entryId: entry.id });
                    }
                  }}
                  loading={deleteMutation.isPending}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <span />
            )}
            <Group gap="xs">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              {entry ? (
                <Button
                  onClick={handleSave}
                  disabled={!isDirty || !startedAt}
                  loading={updateMutation.isPending}
                >
                  Save
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={!actionId || !startedAt || !endedAt}
                  loading={createMutation.isPending}
                >
                  Log time
                </Button>
              )}
            </Group>
          </Group>
        </Stack>
      </Modal>

      <EditActionModal
        action={
          entry?.action.id
            ? {
                id: entry.action.id,
                name: actionName,
                description: null,
                status: "ACTIVE",
                priority: "Quick",
                dueDate: null,
                projectId: entry.action.projectId ?? null,
                scheduledStart: null,
                duration: null,
              }
            : null
        }
        opened={editActionOpened}
        onClose={() => {
          setEditActionOpened(false);
          // Close rather than let a Save here write stale start/end back
          // over what was just edited in the Time section.
          if (timeChangedInside) {
            setTimeChangedInside(false);
            onClose();
          }
        }}
        onSuccess={() => {
          void utils.timeEntry.listByDateRange.invalidate();
        }}
        // This modal only lives on the time surfaces (/time, /calendar), so
        // the action editor it opens always shows the Action's time.
        showTimeEntries
        onTimeEntriesChange={() => setTimeChangedInside(true)}
      />
    </>
  );
}
