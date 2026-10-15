// Shared helpers for API routes.

export const MAX_BODY_BYTES = 50 * 1024;

/**
 * Reads a JSON body, refusing anything over MAX_BODY_BYTES before parsing.
 * Checks Content-Length first, then counts bytes while streaming, because the
 * header can be missing (chunked uploads) or wrong.
 * Returns { data } or { error, status }.
 */
export async function readJsonBody(request) {
  const tooLarge = { error: "Request is too large (max 50 KB).", status: 413 };
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge;
  if (!request.body) return { error: "Request body must be JSON.", status: 400 };

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return tooLarge;
    }
    chunks.push(value);
  }

  try {
    return { data: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { error: "Request body must be JSON.", status: 400 };
  }
}
