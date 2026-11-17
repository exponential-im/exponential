/**
 * Reading an OAuth request body under a cap (hosted MCP Agent PRD, D9). The
 * token, revoke and register endpoints take unauthenticated requests, so a
 * body without a Content-Length must be cut off while it streams, not read
 * whole and measured afterwards.
 */

import { describe, it, expect } from "vitest";

import { endlessRequest } from "~/test/endlessBody";
import { readCappedText, readOAuthForm } from "../http";

const FORM = { "content-type": "application/x-www-form-urlencoded" };

/** A request with a finite body, headers kept as a server sees them. */
function requestWith(body: string, headers: Record<string, string> = {}): Request {
  const req = new Request("https://app.example.test/api/oauth/token", { method: "POST", body });
  Object.defineProperty(req, "headers", { value: new Headers({ ...FORM, ...headers }) });
  return req;
}

describe("readCappedText", () => {
  it("returns a body within the cap", async () => {
    expect(await readCappedText(requestWith("grant_type=refresh_token"), 64)).toBe("grant_type=refresh_token");
  });

  it("refuses a body over the cap", async () => {
    expect(await readCappedText(requestWith("x".repeat(65)), 64)).toBeNull();
  });

  it("refuses a declared Content-Length over the cap without reading the body", async () => {
    const endless = endlessRequest({ ...FORM, "content-length": "999999" });

    expect(await readCappedText(endless.request, 8 * 1024)).toBeNull();
    expect(endless.pulled()).toBeLessThanOrEqual(1024); // at most the stream's own first pull
  });

  it("cuts off a chunked body with no Content-Length as soon as it passes the cap", async () => {
    const endless = endlessRequest(FORM);

    expect(await readCappedText(endless.request, 8 * 1024)).toBeNull();
    expect(endless.pulled()).toBeLessThanOrEqual(8 * 1024 + 2 * 1024);
    expect(endless.cancelled()).toBe(true);
  });
});

describe("readOAuthForm", () => {
  it("refuses an endless chunked body with invalid_request", async () => {
    const result = await readOAuthForm(endlessRequest(FORM).request, 8 * 1024);

    expect(result).toBeInstanceOf(Response);
    expect(await (result as Response).json()).toMatchObject({ error: "invalid_request" });
  });

  it("parses a form within the cap", async () => {
    const result = await readOAuthForm(requestWith("token=abc&token_type_hint=refresh_token"), 8 * 1024);

    expect(result).toBeInstanceOf(URLSearchParams);
    expect((result as URLSearchParams).get("token")).toBe("abc");
  });
});
