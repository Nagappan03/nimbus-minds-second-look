import { maskText } from "./mask.js";
import { readEvidence } from "./evidenceReader.js";
import { getPayeeRisk } from "./payeeRisk.js";
import { matchPatterns } from "./patternMatcher.js";
import { decide } from "./decide.js";

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
 * Full check: mask -> (evidence, payee, patterns in parallel) -> decision.
 * Returns the decision plus the intermediate results and step timings.
 */
export async function runCheck({ payeeId, amount, conversation, language = "en" }) {
  const timings = {};
  const totalStart = performance.now();

  const masked = await timed(timings, "mask", () => maskText(conversation));

  const [evidence, payee, patterns] = await Promise.all([
    timed(timings, "evidence", () => readEvidence(masked.text, amount)),
    timed(timings, "payee", () => getPayeeRisk(payeeId)),
    timed(timings, "patterns", () => matchPatterns(masked.text, amount)),
  ]);

  const decision = await timed(timings, "decide", () =>
    decide({ conversation: masked.text, amount, language, evidence, payee, patterns })
  );

  timings.total = Math.round(performance.now() - totalStart);
  console.log(JSON.stringify({ event: "check_complete", verdict: decision.verdict, timings_ms: timings }));

  return {
    decision,
    evidence,
    payee,
    patterns,
    masked_counts: masked.counts,
    timings_ms: timings,
  };
}
