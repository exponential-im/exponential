"use client";

import { useEffect, useState } from "react";
import { Text, Textarea } from "@mantine/core";

interface InlineEditableTitleProps {
  /** The stored title. Local edits reset to it whenever it changes upstream. */
  value: string;
  /** Members edit in place; everyone else sees the static heading. */
  editable: boolean;
  /**
   * Persist a changed, non-empty title (already trimmed). Return the save's
   * promise so a rejected save puts the stored title back in the field.
   */
  onCommit: (next: string) => void | Promise<unknown>;
  /** Accessible name of the field, such as "Page title". */
  ariaLabel: string;
  placeholder?: string;
  /** CSS font size, shared by the heading and the field. Defaults to the page title's 2.5rem. */
  fontSize?: string;
}

/**
 * A title that edits in place, the way a Knowledge Page's does: the heading
 * itself is the field, with no edit button or border. Saves on blur or Enter
 * when the text changed; an empty or unchanged title snaps back to the stored
 * one. Read-only viewers get a plain `h1` in the same type, so the page looks
 * the same to editors and viewers.
 */
export function InlineEditableTitle({
  value,
  editable,
  onCommit,
  ariaLabel,
  placeholder = "Untitled",
  fontSize = "2.5rem",
}: InlineEditableTitleProps) {
  const [title, setTitle] = useState(value);

  // Keep local state in sync if the upstream title changes (e.g. agent edit).
  useEffect(() => setTitle(value), [value]);

  const commit = () => {
    const next = title.trim();
    if (!next || next === value) {
      setTitle(value);
      return;
    }
    void Promise.resolve(onCommit(next)).catch(() => setTitle(value));
  };

  if (!editable) {
    return (
      <Text
        component="h1"
        className="font-bold leading-[1.2] tracking-[-0.01em] text-text-primary"
        style={{ fontSize }}
      >
        {value}
      </Text>
    );
  }

  // A textarea, not an input, so a long title wraps onto new lines like the
  // read-only heading does instead of being clipped by the column. Titles are
  // still single-line: Enter commits and pasted newlines become spaces.
  return (
    <Textarea
      value={title}
      onChange={(e) => setTitle(e.currentTarget.value.replace(/\r?\n/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setTitle(value);
          // Blur after the reset has rendered, so commit() sees no change.
          const field = e.currentTarget;
          requestAnimationFrame(() => field.blur());
        }
      }}
      autosize
      minRows={1}
      variant="unstyled"
      placeholder={placeholder}
      aria-label={ariaLabel}
      // `minHeight` lives on a class, not in `styles.input`: react-textarea-autosize
      // throws in development when it is passed as an inline style.
      classNames={{ input: "min-h-0" }}
      styles={{
        input: {
          fontSize,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          height: "auto",
          padding: 0,
          resize: "none",
          overflow: "hidden",
        },
      }}
    />
  );
}
