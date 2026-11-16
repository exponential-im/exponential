"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuthorizeParams } from "~/server/mcp/oauth/authorizeRequest";
import { api } from "~/trpc/react";

export interface ConsentAgent {
  id: string;
  name: string;
  workspaces: string[];
}

interface AuthorizeFormProps {
  /** The authorization request exactly as received; `approve` re-validates it server-side. */
  request: AuthorizeParams;
  clientName: string;
  agents: ConsentAgent[];
  /** False while `MCP_OAUTH_MODE` is `admin` and the person is not an admin. */
  canApprove: boolean;
  /** The client's redirect URI carrying `access_denied`, built by the server. */
  denyHref: string;
}

/**
 * The choice on the consent page: which External agent the app acts as, then
 * Approve or Deny. Approving navigates to the app's redirect URI with the code.
 */
export function AuthorizeForm({ request, clientName, agents, canApprove, denyHref }: AuthorizeFormProps) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const approve = api.oauthConnection.approve.useMutation({
    onSuccess: ({ redirectTo }) => {
      setIsNavigating(true);
      window.location.href = redirectTo;
    },
    onError: (err) => setError(err.message),
  });

  const deny = (
    <a className="btn-secondary" href={denyHref}>
      Deny
    </a>
  );

  if (!canApprove) {
    return (
      <div className="verify-form">
        <p className="auth-error" role="alert">
          Connecting apps with OAuth is limited to admins on this install for now.
        </p>
        {deny}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="verify-form">
        <p className="auth-error" role="alert">
          You have no External agents yet. Create one in{" "}
          <Link href="/settings/agents" className="consent-link">
            Settings → Agents
          </Link>
          , give it the workspaces {clientName} should reach, then start again from {clientName}.
        </p>
        {deny}
      </div>
    );
  }

  const isBusy = approve.isPending || isNavigating;

  return (
    <form
      className="verify-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        approve.mutate({ request, agentId });
      }}
    >
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <fieldset className="consent-agents">
        <legend className="field__label">Act as</legend>
        {agents.map((agent) => (
          <label key={agent.id} className="consent-agent">
            <input
              type="radio"
              name="agent"
              value={agent.id}
              checked={agentId === agent.id}
              onChange={() => setAgentId(agent.id)}
            />
            <span className="consent-agent__text">
              <span className="consent-agent__name">{agent.name}</span>
              <span className="consent-agent__desc">
                {agent.workspaces.length > 0 ? agent.workspaces.join(", ") : "No workspaces yet"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <button type="submit" className="btn-primary" disabled={isBusy || !agentId}>
        {isBusy ? "Connecting…" : `Approve ${clientName}`}
      </button>
      {deny}
    </form>
  );
}
