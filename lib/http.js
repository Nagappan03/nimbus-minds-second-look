// Shared helpers for API routes.

import { MAX_BODY_BYTES } from "./limits.js";

export { MAX_BODY_BYTES };

const kb = (bytes) => Math.round(bytes / 1024);

/**
 * Reads a JSON body, refusing anything over maxBytes (default 50 KB) before parsing.
 * Checks Content-Length first, then counts bytes while streaming, because the
 * header can be missing (chunked uploads) or wrong.
 * Returns { data, bytes } or { error, status }.
 */
export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const tooLarge = { error: `Request is too large (max ${kb(maxBytes)} KB).`, status: 413 };
  if (Number(request.headers.get("content-length")) > maxBytes) return tooLarge;
  if (!request.body) return { error: "Request body must be JSON.", status: 400 };

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return tooLarge;
    }
    chunks.push(value);
  }

  try {
    return { data: JSON.parse(Buffer.concat(chunks).toString("utf8")), bytes: size };
  } catch {
    return { error: "Request body must be JSON.", status: 400 };
  }
}
