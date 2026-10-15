// Token usage per request and a running total for this server process.
// Prices are USD per 1M tokens from Google's Vertex AI pricing page (Standard,
// global endpoint), checked 2026-10-15. Thinking tokens are billed as output.
// Unknown models are still counted, just without a cost estimate.
const PRICES = {
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
};

const runningTotal = { requests: 0, calls: 0, input: 0, output: 0, thinking: 0, cost_usd: 0 };

export function newUsage() {
  return { calls: 0, input: 0, output: 0, thinking: 0 };
}

/** Adds one Gemini response's usageMetadata to a per-request usage object. */
export function recordUsage(usage, meta) {
  if (!usage || !meta) return;
  usage.calls += 1;
  usage.input += meta.promptTokenCount || 0;
  usage.output += meta.candidatesTokenCount || 0;
  usage.thinking += meta.thoughtsTokenCount || 0;
}

export function estimateCost(usage, model) {
  const price = PRICES[model];
  if (!price) return null;
  const cost = (usage.input * price.input + (usage.output + usage.thinking) * price.output) / 1e6;
  return Number(cost.toFixed(6));
}

/** Adds a finished request to the running total and returns both for logging. */
export function addToRunningTotal(usage, model) {
  const cost = estimateCost(usage, model) || 0;
  runningTotal.requests += 1;
  for (const key of ["calls", "input", "output", "thinking"]) runningTotal[key] += usage[key];
  runningTotal.cost_usd = Number((runningTotal.cost_usd + cost).toFixed(6));
  return { request: { ...usage, cost_usd: cost }, running_total: { ...runningTotal } };
}
