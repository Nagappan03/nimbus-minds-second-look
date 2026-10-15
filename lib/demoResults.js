// Saved results for the demo scenarios, served instead of calling Gemini when a
// rate limit is hit. Regenerate with `npm run save-demos`.
import saved from "../data/demo-results.json" with { type: "json" };
import { DEMO_SCENARIOS } from "./demoScenarios.js";

const normalise = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** The saved result if this request is one of the demo scenarios, else null. */
export function findDemoResult(conversation) {
  const demo = DEMO_SCENARIOS.find((d) => normalise(d.conversation) === normalise(conversation));
  return demo && saved[demo.id] ? { id: demo.id, ...saved[demo.id] } : null;
}

/** All saved examples, for showing when a limit is hit on a non-demo request. */
export function listDemoResults() {
  return DEMO_SCENARIOS.filter((d) => saved[d.id]).map((d) => ({ id: d.id, label: d.label, ...saved[d.id] }));
}
