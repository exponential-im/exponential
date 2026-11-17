/**
 * Clients identified by a client ID metadata document (hosted MCP Agent PRD,
 * D10). DNS and fetch are injected, so no test touches the network; Prisma is
 * mocked. Modelled on the ICS feed guard's tests (feedUrlGuard.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { isMetadataDocumentClientId, METADATA_DOCUMENT_TTL_MS, resolveMetadataClient } from "../metadataClient";

const URL_ID = "https://claude.ai/oauth/claude-code-client-metadata";
const DOCUMENT = {
  client_id: URL_ID,
  client_name: "Claude Code",
  redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
};

const resolvePublic = async () => ["160.79.104.10"];
const resolvePrivate = async () => ["10.0.0.5"];

let db: DeepMockProxy<PrismaClient>;
let fetchMock: ReturnType<typeof vi.fn>;

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const resolve = (deps: { resolveHost?: () => Promise<string[]> } = {}) =>
  resolveMetadataClient(db, URL_ID, { fetch: fetchMock as unknown as typeof fetch, resolveHost: resolvePublic, ...deps });

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  db.oAuthClient.findUnique.mockResolvedValue(null);
  db.oAuthClient.upsert.mockImplementation((args) =>
    Promise.resolve({ id: "cuid-1", kind: "metadata", metadataUrl: URL_ID, ...args.create }) as never,
  );
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(DOCUMENT));
});

describe("isMetadataDocumentClientId", () => {
  it.each([
    [URL_ID, true],
    ["https://example.com/client.json?v=2", true],
    ["http://localhost:47124/client.json", true], // NODE_ENV is "test": the local escape hatch
    ["cmwke0ebw000006hn2bsly4m7", false], // a registered client's id
    ["https://example.com", false], // no path
    ["https://example.com/", false],
    ["http://example.com/client.json", false], // not https
    ["https://example.com/client.json#frag", false],
    ["https://user:pass@example.com/client.json", false],
    ["https://example.com/a/../client.json", false],
    ["https://example.com/./client.json", false],
  ])("%s → %s", (clientId, expected) => {
    expect(isMetadataDocumentClientId(clientId)).toBe(expected);
  });
});

describe("resolveMetadataClient", () => {
  it("fetches the document and upserts a metadata client with its name and redirect URIs", async () => {
    const result = await resolve();

    expect(result).toEqual({
      ok: true,
      client: expect.objectContaining({ kind: "metadata", name: "Claude Code", redirectUris: DOCUMENT.redirect_uris }) as unknown,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      URL_ID,
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) as unknown }),
    );
    expect(db.oAuthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { metadataUrl: URL_ID },
        create: expect.objectContaining({ kind: "metadata", metadataUrl: URL_ID, fetchedAt: expect.any(Date) as unknown }) as unknown,
      }),
    );
  });

  it("does not refetch inside 24 hours: a second authorization reuses the cached client", async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      id: "cuid-1",
      kind: "metadata",
      name: "Claude Code",
      redirectUris: DOCUMENT.redirect_uris,
      metadataUrl: URL_ID,
      fetchedAt: new Date(Date.now() - 60 * 60 * 1000),
    } as never);

    const result = await resolve();

    expect(result).toMatchObject({ ok: true, client: { id: "cuid-1", name: "Claude Code" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it("refetches after 24 hours", async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      id: "cuid-1",
      kind: "metadata",
      name: "Old name",
      redirectUris: ["https://old.example/cb"],
      metadataUrl: URL_ID,
      fetchedAt: new Date(Date.now() - METADATA_DOCUMENT_TTL_MS - 1000),
    } as never);

    await resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.oAuthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ name: "Claude Code", redirectUris: DOCUMENT.redirect_uris }) as unknown }),
    );
  });

  it("refuses a host that resolves to a private address, without fetching", async () => {
    const result = await resolve({ resolveHost: resolvePrivate });

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/private or loopback/) as unknown });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it("refuses a literal private address, without fetching", async () => {
    const result = await resolveMetadataClient(db, "https://169.254.169.254/latest/meta-data", {
      fetch: fetchMock as unknown as typeof fetch,
      resolveHost: resolvePublic,
    });

    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a document whose client_id is not its own URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...DOCUMENT, client_id: "https://evil.example/client.json" }));

    expect(await resolve()).toEqual({ ok: false, message: expect.stringMatching(/different client_id/) as unknown });
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["a redirect (never followed)", () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/c.json" } }), /HTTP 302/],
    ["a 404", () => new Response("nope", { status: 404 }), /HTTP 404/],
    ["a body that is not JSON", () => jsonResponse("<html>"), /not JSON/],
    ["a document over 64 KB", () => jsonResponse({ ...DOCUMENT, padding: "x".repeat(70 * 1024) }), /64 KB/],
    ["a confidential client", () => jsonResponse({ ...DOCUMENT, token_endpoint_auth_method: "private_key_jwt" }), /only public clients/],
    ["a plain-http redirect URI", () => jsonResponse({ ...DOCUMENT, redirect_uris: ["http://evil.example/cb"] }), /not usable/],
    ["no redirect URIs", () => jsonResponse({ ...DOCUMENT, redirect_uris: [] }), /not usable/],
  ])("refuses %s", async (_label, response, message) => {
    fetchMock.mockResolvedValue(response());

    expect(await resolve()).toEqual({ ok: false, message: expect.stringMatching(message) as unknown });
    expect(db.oAuthClient.upsert).not.toHaveBeenCalled();
  });

  it("refuses when the fetch itself fails, even with a stale copy cached", async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      id: "cuid-1",
      kind: "metadata",
      name: "Claude Code",
      redirectUris: DOCUMENT.redirect_uris,
      metadataUrl: URL_ID,
      fetchedAt: new Date(Date.now() - METADATA_DOCUMENT_TTL_MS - 1000),
    } as never);
    fetchMock.mockRejectedValue(new Error("timeout"));

    expect(await resolve()).toEqual({ ok: false, message: expect.stringMatching(/could not be fetched/) as unknown });
  });

  it("names a client that sends no name after its host", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ client_id: URL_ID, redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }));

    expect(await resolve()).toMatchObject({ ok: true, client: { name: "claude.ai" } });
  });
});
