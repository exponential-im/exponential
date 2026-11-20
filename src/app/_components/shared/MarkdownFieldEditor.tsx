"use client";

import { RichDocEditor } from "~/app/_components/shared/RichDocEditor";

interface MarkdownFieldEditorProps {
  /** The stored Markdown. Loaded once per mount. */
  markdown: string | null;
  /** Members edit in place; everyone else gets a read-only render. */
  editable?: boolean;
  placeholder?: string;
  /**
   * Persist the edited Markdown, or null when the person cleared it. Throw to
   * keep the edit unsaved; the engine shows the error and retries on the next
   * change.
   */
  onSave: (markdown: string | null) => Promise<unknown>;
}

/**
 * A plain-Markdown field edited with the same surface as a Knowledge Page:
 * the shared {@link RichDocEditor} engine (slash menu, bubble formatting,
 * debounced autosave), for records that store a Markdown string only — no
 * ProseMirror document or `docVersion`, such as an epic's or a Pillar's
 * description. Every save writes the Markdown projection back and there is no
 * stale-write guard: last write wins, as for the record's other fields.
 *
 * Hosts must key this component by record (`key={id}`): the engine loads its
 * content exactly once per mount, so a host that remounts it should first
 * patch its cached record with what `onSave` wrote.
 */
export function MarkdownFieldEditor({
  markdown,
  editable = true,
  placeholder,
  onSave,
}: MarkdownFieldEditorProps) {
  return (
    <RichDocEditor
      initialDoc={null}
      initialMarkdown={markdown}
      editable={editable}
      placeholder={placeholder}
      onSave={async ({ markdown: next }) => {
        await onSave(next.trim() ? next : null);
      }}
    />
  );
}
