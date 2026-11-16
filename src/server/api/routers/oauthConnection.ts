/**
 * OAuth connections for MCP clients (hosted MCP Agent PRD, D11). Every
 * procedure is `humanOnlyProcedure`: an agent credential, an OAuth access
 * token included, can never grant access to anything.
 *
 * V2 form of `approve`: the person binds the connection to an External agent
 * they already own. Creating the agent from the consent screen is V3.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, humanOnlyProcedure } from "~/server/api/trpc";
import {
  authorizeParamsSchema,
  authorizeSuccessRedirect,
  validateAuthorizeRequest,
} from "~/server/mcp/oauth/authorizeRequest";
import { clientKeyFor } from "~/server/mcp/oauth/clients";
import { mcpOAuthMode } from "~/server/mcp/oauth/metadata";
import {
  AUTHORIZATION_CODE_LIFETIME_MS,
  AUTHORIZATION_CODE_PREFIX,
  generateOAuthSecret,
} from "~/server/mcp/oauth/tokens";

export const oauthConnectionRouter = createTRPCRouter({
  /**
   * Approve an authorization request: re-validate it, bind the connection to
   * the chosen agent and return the client's redirect URI carrying a one-time
   * code, `state` and `iss`.
   */
  approve: humanOnlyProcedure
    .input(z.object({ request: authorizeParamsSchema, agentId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const mode = mcpOAuthMode();
      if (mode === "off") throw new TRPCError({ code: "NOT_FOUND" });
      if (mode === "admin" && !ctx.session.user.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Connecting apps with OAuth is limited to admins on this install for now.",
        });
      }

      const validation = await validateAuthorizeRequest(ctx.db, input.request);
      if (validation.kind !== "valid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.kind === "invalid-client" ? validation.message : "This authorization request is not valid.",
        });
      }
      const { request } = validation;
      const ownerId = ctx.session.user.id;

      // One of the person's own External agents, and not an Assistant's principal.
      const agent = await ctx.db.externalAgent.findFirst({
        where: { id: input.agentId, ownerId, assistant: { is: null } },
        select: { id: true },
      });
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "You have no External agent with that id." });

      const clientKey = clientKeyFor(request.client);
      const code = generateOAuthSecret(AUTHORIZATION_CODE_PREFIX);

      await ctx.db.$transaction(async (tx) => {
        const existing = await tx.oAuthConnection.findUnique({
          where: { ownerId_clientKey: { ownerId, clientKey } },
          select: { id: true, agentId: true },
        });

        let connectionId: string;
        if (existing) {
          // Rebinding to another agent must not carry the old agent's tokens over.
          if (existing.agentId !== agent.id) {
            await tx.oAuthToken.deleteMany({ where: { connectionId: existing.id } });
            await tx.oAuthAuthorizationCode.deleteMany({ where: { connectionId: existing.id } });
          }
          await tx.oAuthConnection.update({
            where: { id: existing.id },
            data: {
              clientId: request.client.id,
              clientName: request.client.name,
              agentId: agent.id,
              resource: request.resource,
              disconnectedAt: null,
            },
          });
          connectionId = existing.id;
        } else {
          const created = await tx.oAuthConnection.create({
            data: {
              ownerId,
              clientId: request.client.id,
              clientKey,
              clientName: request.client.name,
              agentId: agent.id,
              resource: request.resource,
            },
            select: { id: true },
          });
          connectionId = created.id;
        }

        await tx.oAuthAuthorizationCode.create({
          data: {
            connectionId,
            codeHash: code.hash,
            codeChallenge: request.codeChallenge,
            redirectUri: request.redirectUri,
            expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME_MS),
          },
        });
      });

      return { redirectTo: authorizeSuccessRedirect(request.redirectUri, code.secret, request.state) };
    }),
});
