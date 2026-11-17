/**
 * `POST /api/oauth/revoke` (RFC 7009; hosted MCP Agent PRD, D9): a client
 * revokes its access or refresh token when it signs out. Form-encoded in, an
 * empty 200 out, whether or not the token was known. 404 while
 * `MCP_OAUTH_MODE` is off.
 */

import { db } from "~/server/db";
import { oauthError, publicPreflight, readOAuthForm, whenOAuthEnabled } from "~/server/mcp/oauth/http";
import { revokeToken } from "~/server/mcp/oauth/revocation";

export const runtime = "nodejs";

/** Largest revocation request body read, in bytes. */
const MAX_BODY_BYTES = 8 * 1024;

export const POST = whenOAuthEnabled(async (req: Request): Promise<Response> => {
  const form = await readOAuthForm(req, MAX_BODY_BYTES);
  if (form instanceof Response) return form;

  const token = form.get("token");
  if (!token) return oauthError(400, "invalid_request", "token is required.");

  await revokeToken(db, { token, clientId: form.get("client_id") });
  return new Response(null, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*", "cache-control": "no-store" },
  });
});

export const OPTIONS = whenOAuthEnabled(() => publicPreflight("POST"));
