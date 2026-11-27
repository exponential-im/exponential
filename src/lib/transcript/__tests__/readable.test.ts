import { describe, expect, it } from "vitest";
import { parseTranscript } from "../registry";
import { turnsToEditableText, turnsToReadableText } from "../readable";
import type { TranscriptInput } from "../types";
import { FIREFLIES_SENTENCES, GRANOLA_TIMESTAMPED, MELISSA_PLAIN_TEXT } from "./fixtures";

function input(partial: Partial<TranscriptInput>): TranscriptInput {
  return { transcription: null, sentencesJson: null, participants: [], ...partial };
}

describe("turnsToReadableText", () => {
  it("round-trips structured Fireflies turns to speaker-prefixed lines", () => {
    const turns = parseTranscript(input({ sentencesJson: FIREFLIES_SENTENCES }));
    expect(turnsToReadableText(turns)).toBe(
      [
        "Alice: Welcome everyone.",
        "Alice: Thanks for joining.",
        "Bob: Happy to be here.",
        "Carol: Let me share an update.",
      ].join("\n"),
    );
  });

  it("round-trips a plain-text Me:/Them: paste to readable dialogue", () => {
    const turns = parseTranscript(input({ transcription: MELISSA_PLAIN_TEXT }));
    expect(turnsToReadableText(turns)).toBe(
      [
        "Me: Hey Melissa, thanks for hopping on.",
        "Them: Of course! I wanted to walk through the onboarding flow and the couple of edge cases we hit last week.",
        "Me: Perfect. Here's where it breaks.",
        "Them: Got it — that lines up with what I saw.",
      ].join("\n"),
    );
  });

  it("emits bare text for a speaker-less fallback turn", () => {
    const turns = parseTranscript(input({ transcription: "freeform note" }));
    expect(turnsToReadableText(turns)).toBe("freeform note");
  });
});

describe("turnsToEditableText", () => {
  it("writes structured Fireflies turns as stamped, labelled lines", () => {
    const turns = parseTranscript(input({ sentencesJson: FIREFLIES_SENTENCES }));
    expect(turnsToEditableText(turns)).toBe(
      [
        "[0:00] Alice: Welcome everyone.",
        "[0:02] Alice: Thanks for joining.",
        "[0:04] Bob: Happy to be here.",
        "[0:06] Carol: Let me share an update.",
      ].join("\n"),
    );
  });

  it("parses back into the same turns, so an untouched edit changes nothing", () => {
    for (const source of [
      input({ sentencesJson: FIREFLIES_SENTENCES }),
      input({ transcription: GRANOLA_TIMESTAMPED }),
      input({ transcription: MELISSA_PLAIN_TEXT }),
    ]) {
      const turns = parseTranscript(source);
      const reparsed = parseTranscript(input({ transcription: turnsToEditableText(turns) }));
      expect(reparsed.map(({ speaker, text, startTime }) => ({ speaker, text, startTime }))).toEqual(
        turns.map(({ speaker, text, startTime }) => ({ speaker, text, startTime })),
      );
    }
  });

  it("keeps accented and non-Latin speaker names through the round trip", () => {
    const sentences = [
      { text: "Welcome everyone.", speaker_name: "José García", start_time: 0 },
      { text: "Thanks.", speaker_name: "李明", start_time: 4 },
    ];
    const turns = parseTranscript(input({ sentencesJson: sentences }));
    const reparsed = parseTranscript(input({ transcription: turnsToEditableText(turns) }));
    expect(reparsed.map((t) => [t.speaker, t.text])).toEqual([
      ["José García", "Welcome everyone."],
      ["李明", "Thanks."],
    ]);
  });
});
