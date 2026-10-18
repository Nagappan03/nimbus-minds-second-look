import { maskText } from "./mask.js";
import { readEvidence } from "./evidenceReader.js";
import { getPayeeRisk } from "./payeeRisk.js";
import { matchPatterns } from "./patternMatcher.js";
import { decide } from "./decide.js";
import { logGeminiUsage } from "../gemini.js";
import { newUsage } from "../usage.js";
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
 * Full check: truncate -> mask -> (evidence, payee, patterns in parallel) -> decision.
 * Returns the decision plus the intermediate results, step timings and token usage.
 */
export async function runCheck({ payeeId, amount, currency = "INR", conversation, language = "en" }) {
  const timings = {};
  const usage = newUsage();
  const totalStart = performance.now();
  const truncated = conversation.length > MAX_CONVERSATION_CHARS;

  try {
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
    const tokens = logGeminiUsage("check_complete", usage, { verdict: decision.verdict, timings_ms: timings });

    return {
      decision,
      evidence,
      payee,
      patterns,
      masked_counts: masked.counts,
      masked_conversation: masked.text,
      truncated,
      timings_ms: timings,
      tokens,
    };
  } catch (err) {
    // Failed checks still cost tokens, so they count towards the running total too.
    logGeminiUsage("check_failed", usage, { step: err.step, message: err.message });
    throw err;
  }
}
