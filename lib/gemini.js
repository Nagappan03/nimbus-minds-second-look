import { GoogleGenAI } from "@google/genai";
import { recordUsage } from "./usage.js";

// A stalled request must fail visibly instead of hanging the customer's check.
const TIMEOUT_MS = 25000;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;

let client;

/**
 * Local development uses the free-tier Gemini API key when GEMINI_API_KEY is set.
 * Cloud Run (K_SERVICE is set there) always uses Vertex AI with the service account,
 * as do final evaluation runs (run them with GEMINI_API_KEY empty).
 */
export function getBackend() {
  return process.env.GEMINI_API_KEY && !process.env.K_SERVICE ? "gemini-api" : "vertex";
}

function getClient() {
  if (!client) {
    client =
      getBackend() === "gemini-api"
        ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        : new GoogleGenAI({
            enterprise: true,
            project: process.env.GOOGLE_CLOUD_PROJECT,
            location: process.env.GOOGLE_CLOUD_LOCATION || "global",
          });
  }
  return client;
}

export function getModel() {
  const model = process.env.GEMINI_MODEL;
  if (!model) throw new Error("GEMINI_MODEL is not set");
  return model;
}

export class GeminiError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "GeminiError";
    this.cause = cause;
  }
}

/**
 * Turns the optional extra parts into SDK parts.
 * Strings become text parts; { mimeType, data } (base64) become inline data
 * (used later for screenshots and voice notes).
 */
function toParts(prompt, parts = []) {
  const extra = parts.map((p) =>
    typeof p === "string" ? { text: p } : { inlineData: { mimeType: p.mimeType, data: p.data } }
  );
  return [{ text: prompt }, ...extra];
}

async function callOnce(contents, schema, maxOutputTokens, usage) {
  const response = await getClient().models.generateContent({
    model: getModel(),
    contents,
    config: {
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      maxOutputTokens,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      // Minimal thinking: thinking tokens are billed as output and these steps are short.
      thinkingConfig: { thinkingLevel: "MINIMAL" },
    },
  });
  recordUsage(usage, response.usageMetadata);
  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    // Retrying with the same cap would fail the same way, so do not spend a second call.
    throw new GeminiError(`Gemini output hit the ${maxOutputTokens}-token limit`);
  }
  return JSON.parse(response.text);
}

/**
 * Sends a prompt (plus optional parts) to Gemini and returns parsed JSON.
 * Options: validate(data) -> boolean, maxOutputTokens (default 800),
 * usage (an object that collects this request's token counts).
 * Retries once when the response is not valid JSON or fails `validate`.
 */
export async function generateJson(prompt, schema, parts = [], options = {}) {
  const { validate = () => true, maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS, usage } = options;
  const contents = [{ role: "user", parts: toParts(prompt, parts) }];
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await callOnce(contents, schema, maxOutputTokens, usage);
      if (validate(data)) return data;
      lastError = new Error("response did not match the expected shape");
    } catch (err) {
      if (err instanceof GeminiError) throw err;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new GeminiError(`Gemini did not respond within ${TIMEOUT_MS / 1000} s`, err);
      }
      // Only malformed output is worth retrying; auth/config/quota errors are not.
      if (!(err instanceof SyntaxError)) {
        throw new GeminiError(`Gemini request failed: ${err.message}`, err);
      }
      lastError = err;
    }
  }
  throw new GeminiError(`Gemini returned a malformed response twice: ${lastError.message}`, lastError);
}
