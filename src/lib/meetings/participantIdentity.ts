/**
 * `TranscriptionSessionParticipant.email` is an **identity key**, not always an
 * email address.
 *
 * The column is `String` (not null) and carries the row's half of
 * `@@unique([transcriptionSessionId, email])`, so every participant needs a
 * value — including the ones a transcript only ever names ("Inès", "Selim"),
 * who have no address at all. Those get the sentinel `name:<lowercased name>`
 * so repeated adds dedupe instead of colliding on `""`.
 *
 * That makes the column safe to key on and unsafe to read as an email. Reading
 * it directly is how `name:inès` reached `decision.create`'s
 * `z.string().email()` and failed the whole write — and, on the paths that skip
 * validation, how it got stored as a decider's email address.
 *
 * So: key on the raw column, and go through {@link participantEmail} /
 * {@link participantDisplayName} for anything a person or another schema sees.
 */

/** Prefix marking an identity key that stands in for a missing address. */
const NAME_KEY_PREFIX = "name:";

/**
 * The identity key for a person, for writing and for `where` clauses.
 *
 * Callers must pass the *resolved* email (a member's or contact's), not
 * whatever a transcript guessed.
 */
export function participantIdentityKey(person: {
  email?: string | null;
  name?: string | null;
}): string {
  return person.email ?? `${NAME_KEY_PREFIX}${(person.name ?? "").toLowerCase()}`;
}

/** True when this key is the name sentinel rather than a real address. */
export function isNameIdentityKey(key: string | null | undefined): boolean {
  return key != null && key.startsWith(NAME_KEY_PREFIX);
}

/**
 * The participant's real email address, or null when they have none.
 *
 * Use this anywhere the value leaves the participant table — a decider, a
 * notification, an export, anything validated as an email.
 */
export function participantEmail(
  participant: { email?: string | null } | null | undefined,
): string | null {
  const key = participant?.email;
  if (!key || isNameIdentityKey(key)) return null;
  return key;
}

/**
 * What to call a participant: their name, else their real email, else a last
 * resort.
 *
 * The `name ?? email` idiom this replaces printed `name:inès` on screen
 * whenever the name column happened to be empty.
 */
export function participantDisplayName(
  participant: { name?: string | null; email?: string | null },
  fallback = "Unknown",
): string {
  const name = participant.name?.trim();
  if (name) return name;

  const email = participantEmail(participant);
  if (email) return email;

  // A name-sentinel key still holds the name that built it — better than
  // "Unknown" for a transcript-only speaker whose `name` column never filled.
  const key = participant.email;
  if (isNameIdentityKey(key)) {
    const recovered = key!.slice(NAME_KEY_PREFIX.length).trim();
    if (recovered) return recovered;
  }
  return fallback;
}
