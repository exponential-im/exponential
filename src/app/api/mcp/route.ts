/**
 * The hosted MCP endpoint (hosted MCP Agent PRD, D4): Streamable HTTP,
 * stateless, served by the app itself so a self-hosted install serves it at
 * its own address. A client authenticates with `Authorization: Bearer` (an
 * External agent key); tool calls run in-process through tRPC as that
 * principal, through the same procedures and access checks as every other
 * caller.
 */

import { after } from "next/server";

import { flushAnalytics } from "~/server/analytics/posthog";
import { db } from "~/server/db";
import { bearerTokenFrom, resolveBearerToken } from "~/server/services/access/bearer";
import { createInProcessClient } from "~/server/mcp/inProcessClient";
import { serveMcpRequest } from "~/server/mcp/serve";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const token = bearerTokenFrom(req.headers);
  const resolved = token ? await resolveBearerToken(token) : null;
  if (!resolved) {
    return new Response(null, { status: 401 });
  }

  // Tool calls capture analytics through the tRPC middleware; send them once
  // the response is out, as the tRPC route does.
  after(flushAnalytics);

  const client = createInProcessClient({ db, ...resolved, headers: req.headers });
  return serveMcpRequest(req, client);
}
