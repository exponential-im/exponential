import type { TranscriptTurn } from "./types";

/**
 * Re-serialize canonical turns into the readable, speaker-prefixed text the
 * summarizer feed expects (`Name: text` per line, plain text for speaker-less
 * turns). This is the single source of truth that retires the duplicate
 * JSON-sniffing in `extractReadableTranscript`.
 */
export function turnsToReadableText(turns: TranscriptTurn[]): string {
  return turns
    .map((turn) => (turn.speaker ? `${turn.speaker}: ${turn.text}` : turn.text))
    .join("\n");
}

/** `[m:ss]`, the leading stamp the labelled-turns parser reads back. Minutes
 *  run past 59 rather than rolling into hours, which the parser also accepts. */
function formatStamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${m}:${String(s).padStart(2, "0")}]`;
}

/**
 * Re-serialize turns into text the labelled-turns parser parses back into the
 * same turns: `[m:ss] Name: text` per line, the stamp and label dropped where
 * the turn has none. This is what a structured (Fireflies) transcript turns
 * into when someone edits it, since its `sentencesJson` has no text form.
 */
export function turnsToEditableText(turns: TranscriptTurn[]): string {
  return turns
    .map((turn) => {
      const stamp = turn.startTime !== null ? `${formatStamp(turn.startTime)} ` : "";
      const label = turn.speaker ? `${turn.speaker}: ` : "";
      return `${stamp}${label}${turn.text}`;
    })
    .join("\n");
}
