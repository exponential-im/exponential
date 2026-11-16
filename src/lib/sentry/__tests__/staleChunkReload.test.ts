import { describe, expect, it, vi } from "vitest";
import {
  RELOAD_GUARD_MS,
  isStaleChunkError,
  reloadOnceForStaleChunk,
} from "../staleChunkReload";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("isStaleChunkError", () => {
  it("recognises ChunkLoadError and chunk-load messages", () => {
    const e = new Error("Loading chunk 123 failed.");
    e.name = "ChunkLoadError";
    expect(isStaleChunkError(e)).toBe(true);
    expect(isStaleChunkError(new Error("Loading CSS chunk app/layout failed"))).toBe(true);
  });

  it("recognises the runtime 'call' TypeError only with a webpack stack", () => {
    const runtime = new TypeError("Cannot read properties of undefined (reading 'call')");
    runtime.stack = "TypeError: ...\n    at __webpack_require__ (https://x/_next/static/chunks/webpack-ab12.js:1:1)";
    const app = new TypeError("Cannot read properties of undefined (reading 'call')");
    app.stack = "TypeError: ...\n    at onClick (https://x/_next/static/chunks/app/page.js:1:1)";
    expect(isStaleChunkError(runtime)).toBe(true);
    expect(isStaleChunkError(app)).toBe(false);
  });

  it("ignores ordinary errors and non-errors", () => {
    expect(isStaleChunkError(new Error("boom"))).toBe(false);
    expect(isStaleChunkError("Loading chunk 1 failed")).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  it("reloads once, then holds off inside the guard window", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let now = 1_000_000;
    const deps = { now: () => now, storage, reload };
    expect(reloadOnceForStaleChunk(deps)).toBe(true);
    now += RELOAD_GUARD_MS - 1;
    expect(reloadOnceForStaleChunk(deps)).toBe(false);
    now += 2;
    expect(reloadOnceForStaleChunk(deps)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("never reloads without storage (no loop guard)", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk({ now: () => 1, storage: null, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
