/**
 * The hosted MCP endpoint (`/api/mcp`, hosted MCP Agent PRD, D4 and Seam 1).
 * Real `Request` objects go through the exported handlers. The bearer
 * resolver's DB lookup, the tRPC handler and analytics are mocked, so what is
 * under test is the route's own decisions and the MCP protocol it speaks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import superjson from "superjson";
import { listTools } from "exponential-mcp/tools";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { resolveBearerToken, handleTRPCRequest } = vi.hoisted(() => ({
  resolveBearerToken: vi.fn(),
  handleTRPCRequest: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db: { marker: "db" } }));
vi.mock("~/server/analytics/posthog", () => ({ flushAnalytics: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("~/server/services/access/bearer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/services/access/bearer")>()),
  resolveBearerToken,
}));
vi.mock("~/server/api/fetchHandler", () => ({ handleTRPCRequest }));

import { POST } from "../route";

const AGENT_KEY = "exp_agent_testkey";
const AGENT_SESSION = {
  user: { id: "user-shadow", email: null, name: "Claude", image: null, isAdmin: false },
  expires: "2099-01-01T00:00:00.000Z",
};
const RUN_TOOLS = ["report_progress", "ask_owner", "finish_run"];

let rpcId = 0;
function rpc(method: string, params: Record<string, unknown> = {}) {
  rpcId += 1;
  return { jsonrpc: "2.0", id: rpcId, method, params };
}

function mcpRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${AGENT_KEY}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** A tRPC batch response carrying one superjson-encoded result. */
function trpcBatchResponse(data: unknown): Response {
  return new Response(JSON.stringify([{ result: { data: superjson.serialize(data) } }]), {
    headers: { "content-type": "application/json" },
  });
}

const globalFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", globalFetch);
  resolveBearerToken.mockImplementation((token: string) =>
    Promise.resolve(token === AGENT_KEY ? { session: AGENT_SESSION, tokenType: "agent-key", agentRunId: undefined } : null),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/mcp with an agent key", () => {
  it("answers initialize without issuing a session", async () => {
    const res = await POST(
      mcpRequest(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } })),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = (await res.json()) as { result: { serverInfo: { name: string }; capabilities: unknown } };
    expect(body.result.serverInfo.name).toBe("exponential");
    expect(body.result.capabilities).toEqual({ tools: {} });
    expect(resolveBearerToken).toHaveBeenCalledWith(AGENT_KEY);
  });

  it("lists the stdio registry's tools without the run tools", async () => {
    const res = await POST(mcpRequest(rpc("tools/list")));

    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(result.tools).toEqual(JSON.parse(JSON.stringify(listTools())));
    const names = result.tools.map((t) => t.name);
    for (const runTool of RUN_TOOLS) expect(names).not.toContain(runTool);
  });

  it("runs a tool call in-process through tRPC as the resolved principal", async () => {
    handleTRPCRequest.mockResolvedValue(trpcBatchResponse([{ id: "w1", slug: "acme", name: "Acme" }]));

    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} })));

    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual([{ id: "w1", slug: "acme", name: "Acme" }]);

    expect(handleTRPCRequest).toHaveBeenCalledTimes(1);
    const [trpcReq, createContext] = handleTRPCRequest.mock.calls[0] as [Request, () => unknown];
    expect(new URL(trpcReq.url).pathname).toBe("/api/trpc/workspace.list");
    expect(createContext()).toMatchObject({ db: { marker: "db" }, session: AGENT_SESSION, tokenType: "agent-key" });
    // Nothing went over the network.
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("refuses a run tool", async () => {
    const res = await POST(mcpRequest(rpc("tools/call", { name: "finish_run", arguments: { summary: "x", readyToClose: true } })));

    const { result } = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Unknown tool: finish_run/);
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });
});
