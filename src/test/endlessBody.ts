/**
 * A request whose body never ends, sent the way a chunked upload arrives: no
 * Content-Length, just more bytes. A reader that buffers the whole body before
 * checking its size never returns on it; one that caps while streaming stops
 * as soon as it passes the cap. `pulled()` says how much was read before then.
 */
export function endlessRequest(headers: Record<string, string>, chunkBytes = 1024) {
  let pulled = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += chunkBytes;
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x61));
    },
    cancel() {
      cancelled = true;
    },
  });
  // A standalone Headers: happy-dom's Request would drop or rewrite some headers.
  const request = { headers: new Headers(headers), body, text: () => new Promise<string>(() => undefined) };
  return {
    request: request as unknown as Request,
    pulled: () => pulled,
    cancelled: () => cancelled,
  };
}
