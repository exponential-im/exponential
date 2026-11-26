"use client";

import { useEffect, useRef, useState } from "react";
import {
  SegmentedControl,
  Badge,
  Button,
  Group,
  Menu,
  ActionIcon,
} from "@mantine/core";
import { IconPaperclip } from "@tabler/icons-react";
import { CommentInput } from "~/app/_components/shared/CommentInput";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import type { StatusOption } from "./activityTypes";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

interface ActivityComposerProps {
  onAddComment: (content: string) => Promise<void>;
  isSubmittingComment?: boolean;

  onAddUpdate?: (content: string, status: string) => Promise<void>;
  isSubmittingUpdate?: boolean;
  statusOptions?: StatusOption[];
  defaultStatus?: string;

  mentionCandidates?: MentionCandidate[];
  entityId?: string;

  commentPlaceholder?: string;
  updatePlaceholder?: string;

  /**
   * Set to a non-zero number to switch the composer to Update mode and focus
   * it — how a "Post update" / "Update" button elsewhere on the page opens
   * it. The composer calls `onFocusUpdateHandled` once it has, and the parent
   * resets the signal to 0, so a later remount (the drawer renders the
   * composer only while its Activity tab is open) doesn't refocus.
   */
  focusUpdateSignal?: number;
  onFocusUpdateHandled?: () => void;
}

export function ActivityComposer({
  onAddComment,
  isSubmittingComment,
  onAddUpdate,
  isSubmittingUpdate,
  statusOptions,
  defaultStatus,
  mentionCandidates,
  entityId,
  commentPlaceholder = "Leave a comment...",
  updatePlaceholder = "Write an update...",
  focusUpdateSignal = 0,
  onFocusUpdateHandled,
}: ActivityComposerProps) {
  const hasUpdateMode = !!onAddUpdate && !!statusOptions?.length;
  const [mode, setMode] = useState<"comment" | "update">(
    hasUpdateMode ? "update" : "comment",
  );
  const [selectedStatus, setSelectedStatus] = useState(
    defaultStatus ?? statusOptions?.[0]?.key ?? "",
  );
  const [updateContent, setUpdateContent] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const [pendingFocus, setPendingFocus] = useState(false);

  useEffect(() => {
    if (!focusUpdateSignal || !hasUpdateMode) return;
    setMode("update");
    setPendingFocus(true);
  }, [focusUpdateSignal, hasUpdateMode]);

  // Focus after the update textarea has rendered (the mode switch above may
  // have just mounted it).
  useEffect(() => {
    if (!pendingFocus || mode !== "update") return;
    const textarea = rootRef.current?.querySelector("textarea");
    if (textarea) {
      textarea.focus();
      textarea.scrollIntoView({ block: "nearest" });
    }
    setPendingFocus(false);
    onFocusUpdateHandled?.();
  }, [pendingFocus, mode, onFocusUpdateHandled]);

  const currentStatus = statusOptions?.find((s) => s.key === selectedStatus);
  const CurrentStatusIcon = currentStatus?.icon;

  const handlePostUpdate = () => {
    if (!updateContent.trim() || !onAddUpdate) return;
    onAddUpdate(updateContent.trim(), selectedStatus).then(() => {
      setUpdateContent("");
    }).catch(() => {
      // error handled by caller via mutation
    });
  };

  // Simple comment-only mode — no border wrapper
  if (!hasUpdateMode) {
    return (
      <CommentInput
        onSubmit={onAddComment}
        isSubmitting={isSubmittingComment}
        placeholder={commentPlaceholder}
        mentionCandidates={mentionCandidates}
        actionId={entityId}
      />
    );
  }

  return (
    <div ref={rootRef} className="rounded-lg border border-border-primary">
      {/* Top bar: Comment/Update toggle + status dropdown */}
      <div className="border-b border-border-primary px-4 py-3">
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={mode}
            onChange={(val) => setMode(val as "comment" | "update")}
            data={[
              { label: "Comment", value: "comment" },
              { label: "Update", value: "update" },
            ]}
          />
          {mode === "update" && currentStatus && CurrentStatusIcon && (
            <Menu shadow="md" width={180}>
              <Menu.Target>
                <Badge
                  variant="outline"
                  color={currentStatus.mantineColor}
                  leftSection={<CurrentStatusIcon size={14} />}
                  className="cursor-pointer"
                  size="lg"
                >
                  {currentStatus.label}
                </Badge>
              </Menu.Target>
              <Menu.Dropdown>
                {statusOptions?.map((opt) => {
                  const OptIcon = opt.icon;
                  return (
                    <Menu.Item
                      key={opt.key}
                      leftSection={
                        <OptIcon
                          size={16}
                          style={{ color: opt.color }}
                        />
                      }
                      onClick={() => setSelectedStatus(opt.key)}
                    >
                      {opt.label}
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </div>

      {/* Content area */}
      <div className="px-4 pt-3 pb-2">
        {mode === "comment" ? (
          <CommentInput
            onSubmit={onAddComment}
            isSubmitting={isSubmittingComment}
            placeholder={commentPlaceholder}
            mentionCandidates={mentionCandidates}
            actionId={entityId}
          />
        ) : (
          <>
            <MarkdownInput
              value={updateContent}
              onChange={(value) => setUpdateContent(value)}
              placeholder={updatePlaceholder}
              minRows={4}
              maxRows={8}
              variant="unstyled"
              disabled={isSubmittingUpdate}
              mentionNames={mentionCandidates?.map((c) => c.name)}
            />

            {/* Bottom bar: attachment + actions */}
            <div className="border-t border-border-primary pt-3 mt-2">
              <Group justify="flex-end" gap="sm">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  className="mr-auto"
                >
                  <IconPaperclip size={18} />
                </ActionIcon>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setUpdateContent("")}
                  disabled={isSubmittingUpdate}
                >
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  size="xs"
                  color="brand"
                  onClick={handlePostUpdate}
                  loading={isSubmittingUpdate}
                  disabled={!updateContent.trim()}
                >
                  Post update
                </Button>
              </Group>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
