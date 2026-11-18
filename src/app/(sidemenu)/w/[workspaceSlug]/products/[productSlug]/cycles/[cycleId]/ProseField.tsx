"use client";

import { Text } from "@mantine/core";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";

/**
 * A labelled Markdown field for the brief's prose (a why, a reason, a result
 * note). Markdown is the canonical prose format (ADR-0017), so these use
 * `MarkdownInput`, and every reader renders them with `MarkdownRenderer`.
 */
export function ProseField({
  label,
  description,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Text size="sm" fw={500} className="text-text-primary">
        {label}
      </Text>
      {description && (
        <Text size="xs" className="mb-1 text-text-muted">
          {description}
        </Text>
      )}
      <MarkdownInput value={value} onChange={(next) => onChange(next)} placeholder={placeholder} minRows={2} />
    </div>
  );
}
