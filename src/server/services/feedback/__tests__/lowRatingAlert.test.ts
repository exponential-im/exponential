import { describe, expect, it, vi } from "vitest";

// The ticket lookup pulls in the Prisma singleton; nothing here reaches it.
vi.mock("~/server/services/sentry/SentryBugService", () => ({ findBugTicketUrl: vi.fn() }));

import { buildLowRatingPost, parseToolTrace, readReasons, traceViewPath } from "../lowRatingAlert";

describe("parseToolTrace", () => {
  it("reads status, stored error kind and fault summary", () => {
    const trace = parseToolTrace([
      { name: "getMeetingTranscriptionsTool", args: '{"transcriptionId":"t1"}' },
      {
        name: "queryMeetingContextTool",
        args: "{}",
        isError: true,
        errorCode: "Request failed: 400",
        errorKind: "contract",
        faultSummary: "queryMeetingContextTool: mastra.queryMeetingContext rejected the request",
      },
    ]);
    expect(trace.map((c) => [c.name, c.status, c.errorKind])).toEqual([
      ["getMeetingTranscriptionsTool", "ok", undefined],
      ["queryMeetingContextTool", "failed", "contract"],
    ]);
    expect(trace[1]?.faultSummary).toContain("rejected the request");
  });

  it("classifies the kind for rows written before it was stored", () => {
    const [call] = parseToolTrace([{ name: "webFetch", args: "{}", isError: true, errorCode: "Request failed: 404" }]);
    expect(call?.errorKind).toBe("not-found");
  });

  it("tolerates anything that is not a list of calls", () => {
    expect(parseToolTrace(null)).toEqual([]);
    expect(parseToolTrace("nope")).toEqual([]);
    expect(parseToolTrace([null, 3, { args: 1 }])).toEqual([
      { name: "tool", args: "", argsDropped: false, providerExecuted: false, status: "ok" },
    ]);
  });
});

describe("buildLowRatingPost", () => {
  const base = {
    rating: 1,
    reasons: ["wrong-answer"],
    agentName: "Zoe",
    platform: "manychat",
    pageContextType: "meeting",
    traceUrl: "https://app.test/admin/feedback/trace/abc",
    faultTickets: [],
  };

  it("names the rating, the failed tool by kind, the reason and the trace link", () => {
    const post = buildLowRatingPost({
      ...base,
      trace: parseToolTrace([
        { name: "a", args: "{}" },
        { name: "queryMeetingContextTool", args: "{}", isError: true, errorKind: "contract", errorCode: "SECRET RAW TEXT" },
      ]),
    });
    expect(post.body).toContain("Zoe reply rated 1/5 via manychat on a meeting page");
    expect(post.body).toContain("2 tool calls, 1 failed: queryMeetingContextTool (contract)");
    expect(post.body).toContain("Reason: Wrong answer.");
    expect(post.body).toContain("Trace: https://app.test/admin/feedback/trace/abc");
    expect(post.formattedBody).toContain('<a href="https://app.test/admin/feedback/trace/abc">Open trace</a>');
  });

  it("never carries raw tool error text", () => {
    const post = buildLowRatingPost({
      ...base,
      trace: parseToolTrace([{ name: "t", args: '{"q":"private"}', isError: true, errorCode: "SECRET RAW TEXT" }]),
    });
    expect(post.body + post.formattedBody).not.toContain("SECRET RAW TEXT");
    expect(post.body + post.formattedBody).not.toContain("private");
  });

  it("links a fault ticket when the turn had a filed tool fault", () => {
    const post = buildLowRatingPost({
      ...base,
      trace: [],
      faultTickets: [{ summary: "x: <b>rejected</b>", url: "https://app.test/t/1" }],
    });
    expect(post.body).toContain("no tool calls.");
    expect(post.body).toContain("Known fault: https://app.test/t/1");
    expect(post.formattedBody).toContain("Known fault: x: &lt;b&gt;rejected&lt;/b&gt;");
  });
});

describe("helpers", () => {
  it("reads reasons off metadata and ignores junk", () => {
    expect(readReasons({ reasons: ["too-slow", 4] })).toEqual(["too-slow"]);
    expect(readReasons(null)).toEqual([]);
    expect(readReasons(["too-slow"])).toEqual([]);
  });

  it("builds the trace path", () => {
    expect(traceViewPath("abc")).toBe("/admin/feedback/trace/abc");
  });
});
