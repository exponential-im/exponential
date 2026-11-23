import { createHmac } from "node:crypto";

import { type PrismaClient } from "@prisma/client";

import { safeSignatureEquals } from "~/server/utils/webhookSignature";

import { parseFormDestinations } from "./formSchema";
import { type DestinationOutcome } from "./runDestinations";

/**
 * **Insight status reference** — the keyless link between a `create_insight`
 * Form destination and whatever submitted to it (an in-app feedback board, say).
 *
 * A form whose `create_insight` destination sets `exposeStatus: true` answers a
 * submission with an `insightRef`, and `POST /api/forms/[slug]/insights/status`
 * trades refs for the current triage state of those insights. Nothing else is
 * readable: no title, no body, no author, no comments.
 *
 * The ref is `<insightId>.<HMAC>`, so it is a capability rather than a guessable
 * id: only a caller the intake handed a ref to can read that insight's state,
 * and only through the form that created it. It is stateless (no column, no
 * table), signed with a key derived from `AUTH_SECRET`.
 */

const SIGNING_CONTEXT = "form-insight-status:v1";

/** Most refs one status request may carry. */
export const MAX_STATUS_REFS = 50;

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign insight status references");
  }
  return secret;
}

// An insight id is a cuid and never contains ":", so the slug cannot bleed into it.
function signatureFor(slug: string, insightId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${SIGNING_CONTEXT}:${insightId}:${slug}`)
    .digest("base64url");
}

export function insightStatusRefFor(
  slug: string,
  insightId: string,
  secret: string = signingSecret(),
): string {
  return `${insightId}.${signatureFor(slug, insightId, secret)}`;
}

/** The insight id a ref names, or null when the ref was not issued for this form. */
export function insightIdFromStatusRef(
  slug: string,
  ref: string,
  secret: string = signingSecret(),
): string | null {
  const dot = ref.indexOf(".");
  if (dot <= 0) return null;
  const insightId = ref.slice(0, dot);
  const signature = ref.slice(dot + 1);
  return safeSignatureEquals(signature, signatureFor(slug, insightId, secret))
    ? insightId
    : null;
}

/** Whether a form's stored destinations opt its insights into status reads. */
export function exposesInsightStatus(destinationsJson: unknown): boolean {
  return parseFormDestinations(destinationsJson).some(
    (dest) => dest.type === "create_insight" && dest.config.exposeStatus === true,
  );
}

/** The ref to hand back from intake, when the form opted in and an insight was created. */
export function insightStatusRefFromOutcomes(
  slug: string,
  destinationsJson: unknown,
  outcomes: DestinationOutcome[],
): string | null {
  if (!exposesInsightStatus(destinationsJson)) return null;
  const created = outcomes.find(
    (outcome) => outcome.type === "create_insight" && outcome.ok,
  );
  const insightId = created?.detail?.insightId;
  return typeof insightId === "string"
    ? insightStatusRefFor(slug, insightId)
    : null;
}

export interface PublicInsightStatus {
  ref: string;
  /** Triage state: INBOX, TRIAGED, LINKED or DISMISSED. */
  status: string;
  /** Explicitly published to the feedback board by a person. */
  published: boolean;
  parked: boolean;
  /** Marked a duplicate; the other fields then describe the insight it defers to. */
  duplicate: boolean;
  /** Status of each linked feature (IDEA, DEFINED, IN_PROGRESS, SHIPPED, ...). */
  featureStatuses: string[];
}

const statusSelect = {
  status: true,
  publishedAt: true,
  parkedAt: true,
  features: { select: { feature: { select: { status: true } } } },
} as const;

/**
 * Current state of the insights the given refs name. Refs that do not verify,
 * or whose insight is gone or was not created through this form, are simply
 * absent from the result, so a caller cannot tell those cases apart.
 */
export async function readInsightStatuses(
  db: PrismaClient,
  form: { slug: string; workspaceId: string },
  refs: string[],
): Promise<PublicInsightStatus[]> {
  const refById = new Map<string, string>();
  for (const ref of refs) {
    const insightId = insightIdFromStatusRef(form.slug, ref);
    if (insightId) refById.set(insightId, ref);
  }
  if (refById.size === 0) return [];

  const insights = await db.insight.findMany({
    where: {
      id: { in: [...refById.keys()] },
      source: `form:${form.slug}`,
      product: { workspaceId: form.workspaceId },
    },
    select: {
      id: true,
      ...statusSelect,
      duplicateOf: { select: statusSelect },
    },
  });

  return insights.map((insight) => {
    // A duplicate defers to its canonical insight (chains are flattened at write time).
    const state = insight.duplicateOf ?? insight;
    return {
      ref: refById.get(insight.id)!,
      status: state.status,
      published: state.publishedAt !== null,
      parked: state.parkedAt !== null,
      duplicate: insight.duplicateOf !== null,
      featureStatuses: state.features.map((link) => link.feature.status),
    };
  });
}
