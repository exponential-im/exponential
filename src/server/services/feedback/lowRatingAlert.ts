import type { PrismaClient } from "@prisma/client";

import { asToolErrorKind, classifyToolError, type ToolErrorKind } from "~/lib/chat/toolErrors";
import { lowRatingReasonLabel } from "~/lib/feedback/lowRating";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { fingerprintClientError } from "~/server/services/clientErrors/clientErrorBug";
import { findBugTicketUrl } from "~/server/services/sentry/SentryBugService";
import { escapeHtml, postMatrixOpsMessage } from "~/server/services/sentry/sentryMatrix";

/**
 * A low rating on an agent reply, told to a person.
 *
 * A thumbs-down is the clearest quality signal there is, and until now it
 * went into a table nobody was told about. One post to the ops room per low
 * rating, linking to the admin trace view of the turn.
 *
 * No ticket is filed: a rating is a judgement, not a fault, and a tracker
 * full of auto-filed judgements stops being read. When the rated turn also
 * hit a tool fault that *was* filed (`agent-tool`, see the chat route), the
 * post links to that ticket.
 *
 * The post carries no transcript text and no raw error text: the room is not
 * the access boundary, the admin-only trace view is.
 */

/** One tool call of a turn, as read back from `AiInteractionHistory.toolCalls`. */
export interface TraceToolCall {
  name: string;
  args: string;
  argsDropped: boolean;
  providerExecuted: boolean;
  status: "ok" | "failed";
  /** Set on a failed call. Rows written before the kind was stored are classified from `errorCode`. */
  errorKind?: ToolErrorKind;
  /** Raw (masked, truncated) error text. Admin eyes only. */
  errorCode?: string;
  /** The line an `agent-tool` Bug was fingerprinted from, when one was filed. */
  faultSummary?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Read the stored JSON defensively: it is `Json?`, written by more than one code version. */
export function parseToolTrace(toolCalls: unknown): TraceToolCall[] {
  if (!Array.isArray(toolCalls)) return [];
  const trace: TraceToolCall[] = [];
  for (const raw of toolCalls) {
    if (!raw || typeof raw !== "object") continue;
    const call = raw as Record<string, unknown>;
    const failed = call.isError === true;
    const errorCode = str(call.errorCode);
    trace.push({
      name: str(call.name) ?? "tool",
      args: str(call.args) ?? "",
      argsDropped: call.argsDropped === true,
      providerExecuted: call.providerExecuted === true,
      status: failed ? "failed" : "ok",
      ...(failed ? { errorKind: asToolErrorKind(call.errorKind) ?? classifyToolError(errorCode) } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(str(call.faultSummary) ? { faultSummary: str(call.faultSummary) } : {}),
    });
  }
  return trace;
}

/** Path of the admin trace view for one interaction. */
export function traceViewPath(interactionId: string): string {
  return `/admin/feedback/trace/${encodeURIComponent(interactionId)}`;
}

export interface FaultTicketLink {
  summary: string;
  url: string;
}

/**
 * The tickets already filed for this turn's tool faults. The fingerprint is
 * rebuilt exactly as `reportHandledErrorServer` built it in the chat route
 * (area `agent-tool`, no kind, the fault summary as the message).
 */
export async function findFaultTickets(
  db: PrismaClient,
  trace: readonly TraceToolCall[],
): Promise<FaultTicketLink[]> {
  const summaries = [...new Set(trace.flatMap((c) => (c.faultSummary ? [c.faultSummary] : [])))];
  const links: FaultTicketLink[] = [];
  for (const summary of summaries) {
    const url = await findBugTicketUrl(
      db,
      fingerprintClientError({ area: "agent-tool", message: summary }),
    );
    if (url) links.push({ summary, url });
  }
  return links;
}

export interface LowRatingPostInput {
  rating: number;
  reasons: readonly string[];
  agentName?: string | null;
  platform?: string | null;
  pageContextType?: string | null;
  trace: readonly TraceToolCall[];
  traceUrl: string;
  faultTickets: readonly FaultTicketLink[];
}

/** The ops-room message. Pure, so the wording is tested without a network. */
export function buildLowRatingPost(input: LowRatingPostInput): { body: string; formattedBody: string } {
  const who = input.agentName ?? "agent";
  const where = [
    input.platform ? `via ${input.platform}` : null,
    input.pageContextType ? `on a ${input.pageContextType} page` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const failed = input.trace.filter((c) => c.status === "failed");
  const tools =
    input.trace.length === 0
      ? "no tool calls"
      : failed.length === 0
        ? `${input.trace.length} tool call${input.trace.length === 1 ? "" : "s"}, none failed`
        : `${input.trace.length} tool call${input.trace.length === 1 ? "" : "s"}, ${failed.length} failed: ${[
            ...new Set(failed.map((c) => `${c.name} (${c.errorKind ?? "unknown"})`)),
          ].join(", ")}`;
  const reasons =
    input.reasons.length > 0 ? ` Reason: ${input.reasons.map(lowRatingReasonLabel).join(", ")}.` : "";
  const headline = `${who} reply rated ${input.rating}/5${where ? ` ${where}` : ""}`;
  const detail = `${tools}.${reasons}`;

  const textLinks = [`Trace: ${input.traceUrl}`, ...input.faultTickets.map((t) => `Known fault: ${t.url}`)];
  const htmlLinks = [
    `<a href="${escapeHtml(input.traceUrl)}">Open trace</a>`,
    ...input.faultTickets.map((t) => `<a href="${escapeHtml(t.url)}">Known fault: ${escapeHtml(t.summary)}</a>`),
  ];

  return {
    body: `👎 ${headline}\n${detail}\n${textLinks.join("\n")}`,
    formattedBody: `👎 <strong>${escapeHtml(headline)}</strong><br/>${escapeHtml(detail)}<br/>${htmlLinks.join(" · ")}`,
  };
}

/**
 * Post one low rating to the ops room. Best-effort: returns whether the post
 * went out, and never throws (a rating must not fail because a room is down).
 */
export async function notifyLowRating(db: PrismaClient, feedbackId: string): Promise<boolean> {
  try {
    const feedback = await db.feedback.findUnique({
      where: { id: feedbackId },
      select: {
        rating: true,
        metadata: true,
        aiInteraction: {
          select: {
            id: true,
            agentName: true,
            agentId: true,
            platform: true,
            pageContextType: true,
            toolCalls: true,
          },
        },
      },
    });
    if (!feedback?.aiInteraction) return false;

    const interaction = feedback.aiInteraction;
    const trace = parseToolTrace(interaction.toolCalls);
    const faultTickets = await findFaultTickets(db, trace);
    return await postMatrixOpsMessage(
      buildLowRatingPost({
        rating: feedback.rating,
        reasons: readReasons(feedback.metadata),
        agentName: interaction.agentName ?? interaction.agentId,
        platform: interaction.platform,
        pageContextType: interaction.pageContextType,
        trace,
        traceUrl: `${getPublicBaseUrlFromEnv()}${traceViewPath(interaction.id)}`,
        faultTickets,
      }),
    );
  } catch (error) {
    console.error("[low rating] could not notify the ops room:", error);
    return false;
  }
}

/** The one-tap reasons stored on a rating's metadata. */
export function readReasons(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const reasons = (metadata as Record<string, unknown>).reasons;
  return Array.isArray(reasons) ? reasons.filter((r): r is string => typeof r === "string") : [];
}
