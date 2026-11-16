/**
 * After a deploy, a tab still running the previous build can request chunks
 * or module ids that no longer exist: webpack throws `ChunkLoadError`, or
 * "Cannot read properties of undefined (reading 'call')" from its runtime.
 * The page is broken at that point and a reload fetches the new build, so do
 * it once. A short sessionStorage guard stops a reload loop if the error
 * persists on the fresh page (a genuinely missing chunk).
 */

const STORAGE_KEY = "exp:stale-chunk-reload-at";
export const RELOAD_GUARD_MS = 30_000;

const CHUNK_LOAD_MESSAGE = /^Loading (CSS )?chunk [\w/-]+ failed/;
const WEBPACK_CALL_MESSAGE = /^Cannot read properties of undefined \(reading 'call'\)$/;

export function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  if (CHUNK_LOAD_MESSAGE.test(error.message)) return true;
  // The 'call' TypeError only counts when the webpack runtime threw it.
  return (
    error instanceof TypeError &&
    WEBPACK_CALL_MESSAGE.test(error.message) &&
    /__webpack_require__|\/_next\/static\/chunks\/webpack-/.test(error.stack ?? "")
  );
}

interface ReloadDeps {
  now: () => number;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
}

/** Reloads unless one already happened within RELOAD_GUARD_MS. Returns whether it reloaded. */
export function reloadOnceForStaleChunk(deps: ReloadDeps): boolean {
  const now = deps.now();
  // Without storage there is no loop guard, so leave the page alone
  // (private mode, sandboxed iframe, blocked site data).
  if (!deps.storage) return false;
  try {
    const last = Number(deps.storage.getItem(STORAGE_KEY) ?? 0);
    if (now - last < RELOAD_GUARD_MS) return false;
    deps.storage.setItem(STORAGE_KEY, String(now));
  } catch {
    return false;
  }
  deps.reload();
  return true;
}

export function installStaleChunkReload(): void {
  if (typeof window === "undefined") return;
  const handle = (error: unknown) => {
    if (!isStaleChunkError(error)) return;
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    reloadOnceForStaleChunk({
      now: () => Date.now(),
      storage,
      reload: () => window.location.reload(),
    });
  };
  window.addEventListener("error", (event) => handle(event.error));
  window.addEventListener("unhandledrejection", (event) => handle(event.reason));
}
