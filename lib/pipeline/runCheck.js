import { maskText } from "./mask.js";
import { readEvidence } from "./evidenceReader.js";
import { getPayeeRisk } from "./payeeRisk.js";
import { matchPatterns } from "./patternMatcher.js";
import { decide } from "./decide.js";
import { transcribe, linesToText } from "./transcribe.js";
import { logGeminiUsage } from "../gemini.js";
import { newUsage, mergeUsage } from "../usage.js";
import { MAX_CONVERSATION_CHARS } from "../limits.js";

/** Runs fn, stores its duration in timings[name] (ms), and returns its result. */
async function timed(timings, name, fn) {
  const start = performance.now();
  try {
    return await fn();
  } catch (err) {
    err.step = err.step || name;
    throw err;
  } finally {
    timings[name] = Math.round(performance.now() - start);
  }
}

/**
 * Full check: [transcribe screenshot] -> truncate -> mask -> (evidence, payee, patterns
 * in parallel) -> decision. Returns the decision plus the intermediate results, step
 * timings and token usage, or { unreadable: true } if a screenshot shows no conversation.
 * The image and the unmasked transcript are never returned, stored or logged.
 */
export async function runCheck({ payeeId, amount, currency = "INR", conversation = "", image = null, language = "en" }) {
  const timings = {};
  const usage = newUsage();
  const imageUsage = newUsage(); // tokens for reading the screenshot, logged separately
  const source = image ? "screenshot" : "text";
  const totalStart = performance.now();
  const logTokens = (event, extra) =>
    logGeminiUsage(event, mergeUsage(usage, imageUsage), { source, ...extra, ...(image && { transcribe_tokens: imageUsage }) });

  try {
    if (image) {
      const read = await timed(timings, "transcribe", () => transcribe(image, imageUsage));
      conversation = read.is_conversation ? linesToText(read.lines) : "";
      if (!conversation) {
        timings.total = Math.round(performance.now() - totalStart);
        const tokens = logTokens("check_unreadable", { timings_ms: timings });
        return { unreadable: true, source, timings_ms: timings, tokens };
      }
    }

    const truncated = conversation.length > MAX_CONVERSATION_CHARS;
    const masked = await timed(timings, "mask", () => maskText(conversation.slice(0, MAX_CONVERSATION_CHARS)));

    const [evidence, payee, patterns] = await Promise.all([
      timed(timings, "evidence", () => readEvidence(masked.text, amount, usage)),
      timed(timings, "payee", () => getPayeeRisk(payeeId)),
      timed(timings, "patterns", () => matchPatterns(masked.text, amount, usage)),
    ]);

    const decision = await timed(timings, "decide", () =>
      decide({ conversation: masked.text, amount, currency, language, evidence, payee, patterns }, usage)
    );

    timings.total = Math.round(performance.now() - totalStart);
    const tokens = logTokens("check_complete", { verdict: decision.verdict, timings_ms: timings });

    return {
      decision,
      evidence,
      payee,
      patterns,
      masked_counts: masked.counts,
      masked_conversation: masked.text,
      source,
      truncated,
      timings_ms: timings,
      tokens,
    };
  } catch (err) {
    // Failed checks still cost tokens, so they count towards the running total too.
    // A JSON parse error can quote the model's output, which for transcribe is the unmasked transcript.
    const message = err.step === "transcribe" ? "screenshot transcription failed" : err.message;
    logTokens("check_failed", { step: err.step, message });
    throw err;
  }
}
