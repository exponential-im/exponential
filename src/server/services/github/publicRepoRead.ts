import { Octokit } from "@octokit/rest";

import { classifyIntegrationError, toIntegrationTRPCError } from "~/server/utils/integrationErrors";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

/**
 * Read a *public* repository for the public product timeline.
 *
 * The server's `GITHUB_TOKEN` only buys a higher rate limit here — the repo is
 * public. When that token expires GitHub answers every call with 401 "Bad
 * credentials", and before this the timeline's queries failed as 500s
 * (humble.delta) for as long as nobody rotated it. Now a rejected or missing
 * token falls back to an unauthenticated read (60 requests/hour per IP, plenty
 * for a cached changelog), and the expired token is reported once per server
 * instance with a message that says what to do, instead of once per visitor.
 *
 * A failure the fallback can't recover from is mapped to a typed tRPC error
 * (BAD_GATEWAY / TOO_MANY_REQUESTS) so the page shows its "couldn't reach
 * GitHub" state rather than the request reaching Sentry as a 500.
 */

let reportedRejectedToken = false;

/** Test seam: forget that the rejected token was already reported. */
export function resetPublicRepoReadReporting(): void {
  reportedRejectedToken = false;
}

function isRejectedCredentials(error: unknown): boolean {
  return classifyIntegrationError(error, "GitHub")?.kind === "auth";
}

export async function readPublicRepo<T>(
  read: (octokit: Octokit) => Promise<T>,
  options: {
    token?: string;
    /** Injectable for tests. */
    createClient?: (token?: string) => Octokit;
  } = {},
): Promise<T> {
  const createClient =
    options.createClient ?? ((token?: string) => (token ? new Octokit({ auth: token }) : new Octokit()));
  const token = options.token?.trim();

  try {
    if (token) {
      try {
        return await read(createClient(token));
      } catch (error) {
        if (!isRejectedCredentials(error)) throw error;
        if (!reportedRejectedToken) {
          reportedRejectedToken = true;
          reportHandledErrorServer(
            new Error(
              "GITHUB_TOKEN was rejected by GitHub (Bad credentials). The public product timeline is falling back to unauthenticated reads; rotate the token.",
              { cause: error },
            ),
            { area: "github.publicRepoRead", kind: "config" },
          );
        }
      }
    }
    return await read(createClient());
  } catch (error) {
    throw toIntegrationTRPCError(error, { provider: "GitHub" }) ?? error;
  }
}
