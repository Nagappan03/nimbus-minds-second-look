// Runs the pipeline once for each demo scenario (English) and saves the results
// to data/demo-results.json. /api/check serves these when a rate limit is hit,
// so the demo still works without calling Gemini. Costs 3 pipeline runs.
// Run: npm run save-demos   (reads .env.local)
import { writeFileSync } from "node:fs";
import { runCheck } from "../lib/pipeline/runCheck.js";
import { DEMO_SCENARIOS } from "../lib/demoScenarios.js";

const results = {};
for (const demo of DEMO_SCENARIOS) {
  const result = await runCheck({
    payeeId: demo.payeeId,
    amount: Number(demo.amount),
    conversation: demo.conversation,
    language: "en",
  });
  // Keep only what the verdict card needs.
  results[demo.id] = { decision: result.decision, timings_ms: result.timings_ms };
  console.log(`${demo.id}: ${result.decision.verdict} (${result.decision.score})`);
}

writeFileSync(new URL("../data/demo-results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
console.log("Saved data/demo-results.json");
