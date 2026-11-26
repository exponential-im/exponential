"use client";

import { Menu, Tooltip } from "@mantine/core";
import { IconEdit } from "@tabler/icons-react";

export interface UpdateProgressKr {
  id: string;
  code: string;
  title: string;
}

const UPDATE_PROGRESS_CLASS =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-text-inverse disabled:opacity-60";

/**
 * "Update progress" hero CTA (ADR-free; reuses the existing check-in modal).
 * On a KR it opens that KR's modal directly. On an objective it routes to a
 * KR's modal: a picker when there are several KRs, straight through for one,
 * and a disabled+tooltip state for none (an objective has no value of its own).
 */
export function UpdateProgressButton({
  kind,
  keyResultId,
  objectiveKrs,
  onUpdateProgress,
}: {
  kind: "objective" | "keyResult";
  keyResultId?: string;
  objectiveKrs?: UpdateProgressKr[];
  onUpdateProgress?: (keyResultId: string) => void;
}) {
  const label = (
    <>
      <IconEdit size={13} /> Update progress
      <span
        className="ml-1 rounded px-1 py-px text-[10px]"
        style={{ background: "var(--color-cta-overlay-light)" }}
      >
        U
      </span>
    </>
  );

  // Key result: open its check-in modal directly.
  if (kind === "keyResult") {
    return (
      <button
        type="button"
        onClick={() => keyResultId && onUpdateProgress?.(keyResultId)}
        className={UPDATE_PROGRESS_CLASS}
        style={{ background: "var(--color-brand-primary)" }}
      >
        {label}
      </button>
    );
  }

  const krs = objectiveKrs ?? [];

  // No KRs: an objective has no value of its own — nudge to add one.
  if (krs.length === 0) {
    return (
      <Tooltip label="Add a key result first">
        <span className="inline-flex">
          <button
            type="button"
            disabled
            className={UPDATE_PROGRESS_CLASS}
            style={{ background: "var(--color-brand-primary)" }}
          >
            {label}
          </button>
        </span>
      </Tooltip>
    );
  }

  // Exactly one KR: skip the picker.
  if (krs.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onUpdateProgress?.(krs[0]!.id)}
        className={UPDATE_PROGRESS_CLASS}
        style={{ background: "var(--color-brand-primary)" }}
      >
        {label}
      </button>
    );
  }

  // Several KRs: pick which one to check in.
  return (
    <Menu position="bottom-start" width={260}>
      <Menu.Target>
        <button
          type="button"
          className={UPDATE_PROGRESS_CLASS}
          style={{ background: "var(--color-brand-primary)" }}
        >
          {label}
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Which key result?</Menu.Label>
        {krs.map((kr) => (
          <Menu.Item key={kr.id} onClick={() => onUpdateProgress?.(kr.id)}>
            <span className="font-mono text-[11px] text-text-muted">
              {kr.code}
            </span>{" "}
            {kr.title}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
