"use client";

import { api } from "~/trpc/react";
import { MarkdownFieldEditor } from "~/app/_components/shared/MarkdownFieldEditor";

interface EpicDescriptionEditorProps {
  epicId: string;
  /** The epic's description. Epics store Markdown only — no `bodyDoc`. */
  description: string | null;
}

/**
 * The epic description editor: the shared {@link MarkdownFieldEditor}, the
 * same surface as the ticket body, wired to the epic's plain Markdown
 * `description`.
 *
 * Hosts must key this component by epic (`key={epicId}`): the engine loads its
 * content exactly once per mount.
 */
export function EpicDescriptionEditor({
  epicId,
  description,
}: EpicDescriptionEditorProps) {
  const utils = api.useUtils();
  const updateEpic = api.epic.update.useMutation();

  return (
    <MarkdownFieldEditor
      markdown={description}
      placeholder="Add a description..."
      onSave={async (next) => {
        await updateEpic.mutateAsync({ id: epicId, description: next });
        // The engine loads its content once per mount, from whatever the cache
        // holds — patch it so a remount shows this edit, not the old text.
        utils.epic.getById.setData({ id: epicId }, (old) =>
          old ? { ...old, description: next } : old,
        );
      }}
    />
  );
}
