// @vitest-environment node
/**
 * Route-handler tests for the public insight status read: the gates in front of
 * `readInsightStatuses` (covered in services/forms/__tests__/insightStatus.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { findFirst, checkRateLimit, readInsightStatuses } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  checkRateLimit: vi.fn(),
  readInsightStatuses: vi.fn(),
}));
vi.mock("~/server/db", () => ({ db: { form: { findFirst } } }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit,
}));
vi.mock("~/server/services/forms/insightStatus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/services/forms/insightStatus")>()),
  readInsightStatuses,
}));

import { POST } from "../[slug]/insights/status/route";

function post(body: unknown): Promise<Response> {
  const request = new Request("https://app.test/api/forms/board/insights/status", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(request, { params: Promise.resolve({ slug: "board" }) });
}

const optedInForm = {
  slug: "board",
  workspaceId: "ws-1",
  destinations: [{ type: "create_insight", config: { exposeStatus: true } }],
};

beforeEach(() => {
  findFirst.mockReset().mockResolvedValue(optedInForm);
  checkRateLimit.mockReset().mockResolvedValue({ success: true, retryAfterSeconds: 0 });
  readInsightStatuses.mockReset().mockResolvedValue([]);
});

describe("POST /api/forms/[slug]/insights/status", () => {
  it("returns the statuses for an opted-in, active form", async () => {
    const statuses = [{ ref: "a.b", status: "INBOX" }];
    readInsightStatuses.mockResolvedValue(statuses);

    const res = await post({ refs: ["a.b"] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, insights: statuses });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "board", isActive: true } }),
    );
    expect(readInsightStatuses).toHaveBeenCalledWith(expect.anything(), optedInForm, ["a.b"]);
  });

  it.each([
    ["the form does not exist or is inactive", null],
    ["the form has not opted in", { ...optedInForm, destinations: [{ type: "create_insight", config: {} }] }],
  ])("404s without reading when %s", async (_name, form) => {
    findFirst.mockResolvedValue(form);

    const res = await post({ refs: ["a.b"] });

    expect(res.status).toBe(404);
    expect(readInsightStatuses).not.toHaveBeenCalled();
  });

  it.each([
    ["refs is missing", {}],
    ["refs is not an array", { refs: "a.b" }],
    ["a ref is not a string", { refs: ["a.b", 3] }],
    ["there are too many refs", { refs: Array.from({ length: 51 }, () => "a.b") }],
    ["a ref is too long", { refs: ["a." + "b".repeat(200)] }],
    ["the body is not JSON", "not json"],
  ])("400s when %s", async (_name, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("429s when the IP is over its limit", async () => {
    checkRateLimit.mockResolvedValue({ success: false, retryAfterSeconds: 30 });

    const res = await post({ refs: ["a.b"] });

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "forms-insight-status-ip", key: "203.0.113.7" }),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });
});
