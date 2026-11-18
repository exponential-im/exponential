/**
 * What counts as a thumbs-down on an agent reply, and the one-tap reasons
 * offered after one. Shared by the chat UI (the chips), the feedback router
 * (validation) and the admin trace view (labels).
 */

/** A rating at or below this is a low rating: it is announced in the ops room. */
export const LOW_RATING_MAX = 2;

export function isLowRating(rating: number): boolean {
  return rating <= LOW_RATING_MAX;
}

export const LOW_RATING_REASONS = [
  { id: "wrong-answer", label: "Wrong answer" },
  { id: "did-not-do", label: "Didn't do what I asked" },
  { id: "too-slow", label: "Too slow" },
] as const;

export type LowRatingReasonId = (typeof LOW_RATING_REASONS)[number]["id"];

export const LOW_RATING_REASON_IDS = LOW_RATING_REASONS.map((r) => r.id) as [
  LowRatingReasonId,
  ...LowRatingReasonId[],
];

export function lowRatingReasonLabel(id: string): string {
  return LOW_RATING_REASONS.find((r) => r.id === id)?.label ?? id;
}
