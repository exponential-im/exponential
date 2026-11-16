/**
 * The hosted MCP endpoint (`/api/mcp`, hosted MCP Agent PRD, D4 and Seam 1).
 * Real `Request` objects go through the exported handlers, and credentials go
 * through the real bearer resolver: real-format agent keys and real signed
 * JWTs. Prisma, NextAuth, the tRPC handler and analytics are mocked, so what is
 * under test is the route's own decisions and the MCP protocol it speaks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import superjson from "superjson";
import { listTools } from "exponential-mcp/tools";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AUTH_SECRET = "mcp-route-test-secret";
});

const { db, auth, handleTRPCRequest } = vi.hoisted(() => ({
  db: {
    externalAgentKey: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  auth: vi.fn(),
  handleTRPCRequest: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db }));
vi.mock("~/server/auth", () => ({ auth }));
vi.mock("~/server/analytics/posthog", () => ({ flushAnalytics: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("~/server/api/fetchHandler", () => ({ handleTRPCRequest }));

import { DELETE, GET, POST } from "../route";
import { generateJWT, type JWTTokenType } from "~/server/utils/jwt";
import { generateExternalAgentKey, hashExternalAgentKey } from "~/server/utils/external-agent-keys";

const AGENT_KEY = generateExternalAgentKey().secret;
const SHADOW = { id: "user-shadow", email: null, name: "Claude", image: null };
const PERSON = { id: "user-person", email: "person@example.test", name: "Person", image: null, isAdmin: false };
const RUN_TOOLS = ["report_progress", "ask_owner", "finish_run"];

let rpcId = 0;
function rpc(method: string, params: Record<string, unknown> = {}) {
  rpcId += 1;
  return { jsonrpc: "2.0", id: rpcId, method, params };
}

const INITIALIZE = () =>
  rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });

function mcpRequest(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${AGENT_KEY}` }): Request {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
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
  auth.mockResolvedValue({ user: { id: PERSON.id }, expires: "2099-01-01T00:00:00.000Z" });
  db.externalAgentKey.update.mockResolvedValue({});
  db.externalAgentKey.findUnique.mockImplementation(({ where }: { where: { keyHash: string } }) =>
    Promise.resolve(
      where.keyHash === hashExternalAgentKey(AGENT_KEY)
        ? { id: "key-1", expiresAt: null, agent: { shadowUser: SHADOW } }
        : null,
    ),
  );
  db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === PERSON.id ? PERSON : null),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/mcp with an agent key", () => {
  it("answers initialize without issuing a session", async () => {
    const res = await POST(mcpRequest(INITIALIZE()));

    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = (await res.json()) as { result: { serverInfo: { name: string }; capabilities: unknown } };
    expect(body.result.serverInfo.name).toBe("exponential");
    expect(body.result.capabilities).toEqual({ tools: {} });
  });

  it("lists the stdio registry's tools without the run tools", async () => {
    const res = await POST(mcpRequest(rpc("tools/list")));

    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(result.tools).toEqual(JSON.parse(JSON.stringify(listTools())));
    const names = result.tools.map((t) => t.name);
    for (const runTool of RUN_TOOLS) expect(names).not.toContain(runTool);
  });

  it("runs a tool call in-process through tRPC as the agent", async () => {
    handleTRPCRequest.mockResolvedValue(trpcBatchResponse([{ id: "w1", slug: "acme", name: "Acme" }]));

    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} })));

    expect(res.status).toBe(200);
    const { result } = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual([{ id: "w1", slug: "acme", name: "Acme" }]);

    expect(handleTRPCRequest).toHaveBeenCalledTimes(1);
    const [trpcReq, createContext] = handleTRPCRequest.mock.calls[0] as [Request, () => unknown];
    expect(new URL(trpcReq.url).pathname).toBe("/api/trpc/workspace.list");
    expect(createContext()).toMatchObject({
      db,
      session: { user: { id: SHADOW.id, isAdmin: false } },
      tokenType: "agent-key",
    });
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

describe("POST /api/mcp credentials", () => {
  it("accepts a person's api-token JWT and runs as that person", async () => {
    handleTRPCRequest.mockResolvedValue(trpcBatchResponse([]));
    const token = generateJWT(PERSON, { tokenType: "api-token" });

    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} }), bearer(token)));

    expect(res.status).toBe(200);
    const [, createContext] = handleTRPCRequest.mock.calls[0] as [Request, () => unknown];
    expect(createContext()).toMatchObject({ session: { user: { id: PERSON.id } }, tokenType: "api-token" });
  });

  it.each<JWTTokenType>([
    "agent-context",
    "whatsapp-gateway",
    "telegram-gateway",
    "matrix-gateway",
    "voice-session",
    "device-token",
    "extension-token",
  ])("refuses a %s JWT with 401, though it is valid on /api/trpc", async (tokenType) => {
    const token = generateJWT(PERSON, { tokenType });

    const res = await POST(mcpRequest(rpc("tools/list"), bearer(token)));

    expect(res.status).toBe(401);
    expect(db.user.findUnique).toHaveBeenCalled(); // it did resolve; the route refused the type
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });

  it("never authenticates with a session cookie", async () => {
    const res = await POST(mcpRequest(rpc("tools/list"), { cookie: "authjs.session-token=valid-session" }));

    expect(res.status).toBe(401);
    expect(auth).not.toHaveBeenCalled();
  });
});

describe("POST /api/mcp protocol edges", () => {
  async function expectUnauthorized(res: Response, challenge: string) {
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(challenge);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(handleTRPCRequest).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/Unauthorized/);
  }

  it("401s with a bare Bearer challenge when there is no credential", async () => {
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), {})), "Bearer");
  });

  it("401s with invalid_token for a token that is neither a key nor a valid JWT", async () => {
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), bearer("not-a-token"))), 'Bearer error="invalid_token"');
  });

  it("401s for a revoked agent key (its row is gone)", async () => {
    const revoked = generateExternalAgentKey().secret;
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), bearer(revoked))), 'Bearer error="invalid_token"');
  });

  it("401s for an expired agent key", async () => {
    db.externalAgentKey.findUnique.mockResolvedValue({
      id: "key-1",
      expiresAt: new Date(Date.now() - 1000),
      agent: { shadowUser: SHADOW },
    });
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"))), 'Bearer error="invalid_token"');
  });

  it("401s for an expired api-token JWT", async () => {
    const expired = generateJWT(PERSON, { tokenType: "api-token", expiryMinutes: -1 });
    await expectUnauthorized(await POST(mcpRequest(rpc("tools/list"), bearer(expired))), 'Bearer error="invalid_token"');
  });

  it("runs no tool for an unauthenticated tools/call", async () => {
    const res = await POST(mcpRequest(rpc("tools/call", { name: "get_workspaces", arguments: {} }), {}));
    expect(res.status).toBe(401);
    expect(handleTRPCRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", GET],
    ["DELETE", DELETE],
  ])("answers %s with 405 and Allow: POST", async (_method, handler) => {
    const res = handler();

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });

  it("serves initialize and tools/list as two independent requests, with no session between them", async () => {
    const init = await POST(mcpRequest(INITIALIZE()));
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();

    // No Mcp-Session-Id sent back: a different instance could serve this one.
    const list = await POST(mcpRequest(rpc("tools/list"), { ...bearer(AGENT_KEY), "mcp-protocol-version": "2025-06-18" }));
    expect(list.status).toBe(200);
    expect(list.headers.get("mcp-session-id")).toBeNull();
    const { result } = (await list.json()) as { result: { tools: unknown[] } };
    expect(result.tools).toHaveLength(listTools().length);
  });
});
