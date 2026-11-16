// @vitest-environment node
/**
 * `reportHandledErrorServer` stays synchronous for its callers, but the Bug
 * ticket it files goes to `after()` (Vercel `waitUntil`) instead of a bare
 * `void` promise, so a serverless instance can't freeze before it is filed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { afterMock, captureMock, ingestMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  captureMock: vi.fn(),
  ingestMock: vi.fn(),
}));

vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@sentry/nextjs", () => ({ captureException: captureMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/sentry/SentryBugService", () => ({ ingestSentryBug: ingestMock }));

import { reportHandledErrorServer } from "../reportHandledErrorServer";

function scheduledTask(): () => Promise<unknown> {
  const task = afterMock.mock.calls.at(-1)?.[0] as (() => Promise<unknown>) | undefined;
  if (!task) throw new Error("nothing was handed to after()");
  return task;
}

describe("reportHandledErrorServer", () => {
  const original = process.env.CLIENT_ERROR_BUGS;

  beforeEach(() => {
    afterMock.mockReset();
    captureMock.mockReset();
    ingestMock.mockReset();
    process.env.CLIENT_ERROR_BUGS = "1";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CLIENT_ERROR_BUGS;
    else process.env.CLIENT_ERROR_BUGS = original;
    vi.restoreAllMocks();
  });

  it("captures to Sentry inline and hands the ticket filing to after()", async () => {
    let settle: () => void = () => undefined;
    ingestMock.mockImplementation(() => new Promise<void>((resolve) => { settle = resolve; }));

    reportHandledErrorServer(new Error("boom"), { area: "test.area" });

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(ingestMock).not.toHaveBeenCalled();

    let done = false;
    const running = scheduledTask()().then(() => { done = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    settle();
    await running;
    expect(done).toBe(true);
  });

  it("a failed filing is logged, never rejects the after() task", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    ingestMock.mockRejectedValue(new Error("db down"));

    reportHandledErrorServer(new Error("boom"), { area: "test.area" });

    await expect(scheduledTask()()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("files nothing when CLIENT_ERROR_BUGS is off", () => {
    delete process.env.CLIENT_ERROR_BUGS;

    reportHandledErrorServer(new Error("boom"), { area: "test.area" });

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(afterMock).not.toHaveBeenCalled();
  });
});
