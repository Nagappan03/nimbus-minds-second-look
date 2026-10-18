// Server-side checks for an uploaded screenshot. The browser has already
// downscaled it; here we only make sure it really is one of the allowed types.
// The image is kept in memory for the Gemini call and never stored or logged.
import { IMAGE_TYPES } from "./limits.js";

const UNSUPPORTED = "Unsupported image type. Please upload a PNG, JPEG or WebP screenshot.";

// The first bytes of each format, so a renamed file cannot pass as an image.
function detectType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Returns { image: { mimeType, data } } or { error, status }. */
export function validateImage(image) {
  const { mimeType, data } = image || {};
  if (!IMAGE_TYPES.includes(mimeType)) return { error: UNSUPPORTED, status: 415 };
  if (typeof data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return { error: "The screenshot could not be read. Please try another image.", status: 400 };
  }
  if (detectType(Buffer.from(data.slice(0, 32), "base64")) !== mimeType) return { error: UNSUPPORTED, status: 415 };
  return { image: { mimeType, data } };
}
