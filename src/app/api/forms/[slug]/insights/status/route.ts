import { type NextRequest, NextResponse } from "next/server";

import { db } from "~/server/db";
import {
  MAX_STATUS_REFS,
  MAX_STATUS_REF_LENGTH,
  exposesInsightStatus,
  readInsightStatuses,
} from "~/server/services/forms/insightStatus";
import {
  checkRateLimit,
  clientIpFrom,
  tooManyRequestsInit,
} from "~/server/utils/rateLimit";

/**
 * Public **insight status read**: POST /api/forms/[slug]/insights/status with
 * `{ refs: string[] }`, the `insightRef`s the intake returned. Answers with the
 * triage state of those insights and nothing else (see
 * ~/server/services/forms/insightStatus). Unauthenticated: the signed ref is
 * the capability, and the form must have opted in with `exposeStatus`.
 *
 * POST rather than GET so refs never land in URLs, and so in access logs.
 */
export const dynamic = "force-dynamic";

const WINDOW_SECONDS = 60;
const IP_MAX = 60;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const ipCheck = await checkRateLimit({
    name: "forms-insight-status-ip",
    key: clientIpFrom(request.headers),
    limit: IP_MAX,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!ipCheck.success) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      tooManyRequestsInit(ipCheck),
    );
  }

  let body: { refs?: unknown };
  try {
    body = (await request.json()) as { refs?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }
  const refs = body.refs;
  if (
    !Array.isArray(refs) ||
    refs.length > MAX_STATUS_REFS ||
    !refs.every(
      (ref): ref is string =>
        typeof ref === "string" && ref.length <= MAX_STATUS_REF_LENGTH,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `refs must be an array of at most ${MAX_STATUS_REFS} strings of at most ${MAX_STATUS_REF_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  const form = await db.form.findFirst({
    where: { slug, isActive: true },
    select: { slug: true, workspaceId: true, destinations: true },
  });
  // A form that has not opted in looks exactly like one that does not exist.
  if (!form || !exposesInsightStatus(form.destinations)) {
    return NextResponse.json(
      { ok: false, error: "Form not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    insights: await readInsightStatuses(db, form, refs),
  });
}
