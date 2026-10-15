import { GoogleGenAI } from "@google/genai";

// Vertex AI (Gemini Enterprise Agent Platform) mode. No API key: the SDK uses
// Application Default Credentials (gcloud login locally, the service account on Cloud Run).
let client;

function getClient() {
  if (!client) {
    client = new GoogleGenAI({
      enterprise: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || "global",
    });
  }
  return client;
}

function getModel() {
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

async function callOnce(contents, schema) {
  const response = await getClient().models.generateContent({
    model: getModel(),
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      temperature: 0.2,
      // Low thinking keeps each step fast; the prompts are short and structured.
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  });
  return JSON.parse(response.text);
}

/**
 * Sends a prompt (plus optional parts) to Gemini and returns parsed JSON.
 * Retries once when the response is not valid JSON or fails `validate`.
 * Throws GeminiError with a readable message otherwise.
 */
export async function generateJson(prompt, schema, parts = [], validate = () => true) {
  const contents = [{ role: "user", parts: toParts(prompt, parts) }];
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await callOnce(contents, schema);
      if (validate(data)) return data;
      lastError = new Error("response did not match the expected shape");
    } catch (err) {
      // Only malformed output is worth retrying; auth/config/quota errors are not.
      if (!(err instanceof SyntaxError)) {
        throw new GeminiError(`Gemini request failed: ${err.message}`, err);
      }
      lastError = err;
    }
  }
  throw new GeminiError(`Gemini returned a malformed response twice: ${lastError.message}`, lastError);
}
