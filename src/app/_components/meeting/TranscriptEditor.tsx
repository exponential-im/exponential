"use client";

import { useState } from "react";
import { Button, Textarea } from "@mantine/core";
import { IconFileText } from "@tabler/icons-react";

interface TranscriptEditorProps {
  /** The text to start from: the stored transcript, or its stamped text form
   *  when it was stored as structured sentences. */
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Edit a meeting's transcript as plain text, the way the Notes tab edits
 * notes. Not Markdown: a transcript is `[m:ss] Name: text` lines the
 * labelled-turns parser reads back into turns (ADR-0032), so it is edited
 * in a plain, monospaced textarea.
 */
export function TranscriptEditor({ initialValue, onSave, onCancel }: TranscriptEditorProps) {
  const [draft, setDraft] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    try {
      await onSave(draft);
    } catch {
      // onSave surfaces its own error notification; stay in edit mode.
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mp-tldr">
      <div className="mp-tldr__head">
        <IconFileText size={12} /> Edit transcript
        <span className="mp-spacer" />
      </div>
      <p className="mp-tldr__text">
        One turn per line, as <code>[m:ss] Name: what they said</code>. The time and name are
        optional.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        placeholder="[0:00] Alice: Welcome everyone."
        autosize
        minRows={10}
        maxRows={30}
        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
        aria-label="Transcript"
      />
      <div className="mp-tldr__foot">
        <Button size="xs" loading={isSaving} onClick={() => void save()}>
          Save
        </Button>
        <Button size="xs" variant="subtle" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
