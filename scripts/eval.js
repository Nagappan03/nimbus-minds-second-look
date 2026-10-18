// Evaluation harness: runs labelled scenarios through the same pipeline the app
// uses (runCheck, including the BigQuery payee lookup) and writes
// data/eval-results.json. It does not go through the HTTP route, does not save
// cases to Firestore and does not touch the daily run counter.
//
// Run: npm run eval -- [--limit N] [--tag red_team] [--concurrency N] [--yes] [--fresh]
//                      [--file path] [--dry-run]
// Results are cached per scenario in data/eval-cache.json, so reruns of
// unchanged scenarios cost nothing.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { runCheck } from "../lib/pipeline/runCheck.js";
import { getModel, getBackend } from "../lib/gemini.js";
import { estimateCost } from "../lib/usage.js";
import { computeMetrics } from "./evalMetrics.js";

const root = new URL("../", import.meta.url);
const CACHE_FILE = new URL("data/eval-cache.json", root);
const RESULTS_FILE = new URL("data/eval-results.json", root);
const CONFIRM_ABOVE = 40;
// Rough tokens per check, used only when no cached run gives a better figure.
const DEFAULT_TOKENS = { input: 3100, output: 750, thinking: 0 };

// Any change to these files changes the prompts or pipeline, so it invalidates the cache.
const PROMPT_FILES = [
  "lib/pipeline/mask.js",
  "lib/pipeline/evidenceReader.js",
  "lib/pipeline/patternMatcher.js",
  "lib/pipeline/decide.js",
  "lib/gemini.js",
  "data/typologies.json",
];

function parseArgs(argv) {
  const args = { limit: 10, tag: null, concurrency: 2, yes: false, fresh: false, file: "data/scenarios.json", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--tag") args.tag = argv[++i];
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--yes") args.yes = true;
    else if (a === "--fresh") args.fresh = true;
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown flag ${a}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error("--limit must be a positive integer");
  if (args.tag && args.tag !== "red_team") throw new Error('--tag only supports "red_team"');
  args.concurrency = Math.min(3, Math.max(1, Number.isInteger(args.concurrency) ? args.concurrency : 2));
  return args;
}

const sha = (text) => createHash("sha256").update(text).digest("hex");
const readJson = (url, fallback) => (existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : fallback);

function promptVersion() {
  return sha(PROMPT_FILES.map((f) => readFileSync(new URL(f, root), "utf8")).join("\n")).slice(0, 12);
}

/** Assigns each scenario a payee with the same risk level, rotating through them in file order. */
function assignPayees(scenarios) {
  const payees = readJson(new URL("data/payees-seed.json", root), []);
  const byRisk = {};
  for (const p of [...payees].sort((a, b) => a.payee_id.localeCompare(b.payee_id))) {
    (byRisk[p.risk_level] ||= []).push(p.payee_id);
  }
  const seen = {};
  return new Map(
    scenarios.map((s) => {
      const list = byRisk[s.payee_risk];
      if (!list?.length) throw new Error(`No payee with risk_level ${s.payee_risk} for ${s.id}`);
      const n = (seen[s.payee_risk] = (seen[s.payee_risk] ?? -1) + 1);
      return [s.id, list[n % list.length]];
    })
  );
}

function toRow(scenario, payeeId, result, latencyMs) {
  const { decision, tokens } = result;
  const quoting = decision.reasons.filter((r) => r.source === "conversation");
  const first = decision.reasons[0];
  return {
    id: scenario.id,
    language: scenario.language,
    payee_risk: scenario.payee_risk,
    payee_id: payeeId,
    payee_source: result.payee.source,
    scam_type: scenario.scam_type,
    red_team: Boolean(scenario.red_team),
    expected: scenario.expected,
    acceptable: scenario.acceptable,
    verdict: decision.verdict,
    score: decision.score,
    ok: scenario.acceptable.includes(decision.verdict),
    exact: decision.verdict === scenario.expected,
    quote_verified_count: quoting.filter((r) => r.quote_verified).length,
    conversation_reason_count: quoting.length,
    reason_count: decision.reasons.length,
    latencyMs,
    tokens: { input: tokens.input, output: tokens.output, cost_usd: tokens.cost_usd },
    first_reason: first ? { text: first.text, quote: first.evidence_quote, source: first.source } : null,
    error: null,
  };
}

function errorRow(scenario, payeeId, err) {
  return {
    id: scenario.id,
    language: scenario.language,
    payee_risk: scenario.payee_risk,
    payee_id: payeeId,
    scam_type: scenario.scam_type,
    red_team: Boolean(scenario.red_team),
    expected: scenario.expected,
    acceptable: scenario.acceptable,
    verdict: null,
    score: null,
    ok: false,
    exact: false,
    quote_verified_count: 0,
    conversation_reason_count: 0,
    reason_count: 0,
    latencyMs: null,
    tokens: null,
    first_reason: null,
    error: `${err.step ? err.step + ": " : ""}${err.message}`,
  };
}

/** One scenario through runCheck, retried once on failure; never throws. */
async function runScenario(scenario, payeeId) {
  const input = {
    payeeId,
    amount: Number(scenario.amount),
    currency: scenario.currency,
    conversation: scenario.lines.join("\n"),
    language: scenario.language,
  };
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const start = performance.now();
    try {
      const result = await runCheck(input);
      return toRow(scenario, payeeId, result, Math.round(performance.now() - start));
    } catch (err) {
      lastError = err;
    }
  }
  return errorRow(scenario, payeeId, lastError);
}

/** Runs tasks with at most `limit` in flight. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}

function perCheckEstimate(cache, model) {
  const runs = Object.values(cache).filter((r) => r.tokens && !r.error);
  if (runs.length === 0) return { ...DEFAULT_TOKENS, cost_usd: estimateCost(DEFAULT_TOKENS, model) ?? 0.003 };
  const avg = (key) => Math.round(runs.reduce((n, r) => n + r.tokens[key], 0) / runs.length);
  const tokens = { input: avg("input"), output: avg("output") };
  return { ...tokens, cost_usd: estimateCost({ ...tokens, thinking: 0 }, model) ?? 0.003 };
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

const pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

function printSummary(m, scenarioCount, runCost) {
  const rows = [
    ["Scenarios (answered / errors)", `${scenarioCount} (${m.answered} / ${m.error_count})`],
    ["Exact match", pct(m.exact_match_rate)],
    ["Acceptable", pct(m.acceptable_rate)],
    [`Scam catch (expected HOLD, n=${m.counts.expected_hold})`, pct(m.scam_catch_rate)],
    ["HOLD on expected-HOLD", pct(m.hold_precision_on_scams)],
    [`False hold (expected PROCEED, n=${m.counts.expected_proceed})`, pct(m.false_hold_rate)],
    ["False alarm (expected PROCEED)", pct(m.false_alarm_rate)],
    ["Quote verified", pct(m.quote_verified_rate)],
    ["High-risk payee answered PROCEED", `${m.high_risk_payee_proceed_count} of ${m.high_risk_payee_count}`],
    [`Red-team not PROCEED (n=${m.red_team_count})`, pct(m.red_team_pass_rate)],
    ["Latency median / p95", `${m.latency_ms.median} ms / ${m.latency_ms.p95} ms`],
    ["Tokens in / out (all results)", `${m.tokens.input} / ${m.tokens.output}`],
    ["Cost of these results", `$${m.tokens.cost_usd.toFixed(4)} (about $${(m.cost_per_check_usd ?? 0).toFixed(4)} per check)`],
    ["Cost of this run (cache misses)", `$${runCost.toFixed(4)}`],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  console.log("\nMetric".padEnd(width + 3) + "Value");
  for (const [k, v] of rows) console.log(`${k.padEnd(width + 2)}${v}`);

  console.log("\nConfusion matrix (rows: expected, columns: verdict)");
  console.log("".padEnd(12) + ["PROCEED", "BE_CAREFUL", "HOLD"].map((v) => v.padStart(11)).join(""));
  for (const [exp, cols] of Object.entries(m.confusion_matrix)) {
    console.log(exp.padEnd(12) + Object.values(cols).map((n) => String(n).padStart(11)).join(""));
  }
  console.log("\nBy language: " + Object.entries(m.by_language).map(([l, v]) => `${l} ${pct(v.acceptable_rate)} (n=${v.count})`).join(", "));
  if (m.failures.length) {
    console.log("\nFailures:");
    for (const f of m.failures) {
      console.log(`- ${f.id} [${f.language}] expected ${f.expected}, got ${f.verdict ?? "ERROR"}${f.error ? ` (${f.error})` : ""}${f.quote ? ` | "${f.quote}"` : ""}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileUrl = new URL(args.file, root);
  if (!existsSync(fileUrl)) throw new Error(`Scenario file not found: ${args.file}`);
  const all = JSON.parse(readFileSync(fileUrl, "utf8")).scenarios;
  const payeeFor = assignPayees(all); // assigned over the full file so --limit/--tag never change it
  const selected = all.filter((s) => !args.tag || s.red_team).slice(0, args.limit);

  const model = getModel();
  const version = promptVersion();
  const cache = args.fresh ? {} : readJson(CACHE_FILE, {});
  const keyFor = (s) => sha(JSON.stringify(s) + model + version + payeeFor.get(s.id));
  const toRun = selected.filter((s) => !cache[keyFor(s)]);

  const est = perCheckEstimate(readJson(CACHE_FILE, {}), model);
  console.log(`Model ${model} (${getBackend()}), prompt version ${version}`);
  console.log(`Scenarios: ${selected.length} selected, ${selected.length - toRun.length} cached, ${toRun.length} to run`);
  console.log(
    `Estimate for the runs: ~${toRun.length * est.input} input + ~${toRun.length * est.output} output tokens, ` +
      `about $${(toRun.length * est.cost_usd).toFixed(3)} ($${est.cost_usd.toFixed(4)} per check)`
  );
  if (args.dryRun) return;
  if (toRun.length > CONFIRM_ABOVE && !args.yes && !(await confirm(`Run ${toRun.length} scenarios with Gemini? [y/N] `))) {
    console.log("Cancelled.");
    return;
  }

  // runCheck logs one JSON line per call; keep the console readable during the run.
  const log = console.log;
  console.log = (...a) => (typeof a[0] === "string" && a[0].startsWith('{"event"') ? undefined : log(...a));
  let done = 0;
  const fresh = await pool(toRun, args.concurrency, async (s) => {
    const row = await runScenario(s, payeeFor.get(s.id));
    log(`[${++done}/${toRun.length}] ${s.id} ${row.error ? "ERROR " + row.error : `${row.verdict} (${row.ok ? "ok" : "not ok"}) ${row.latencyMs} ms`}`);
    if (!row.error) cache[keyFor(s)] = row; // errors are not cached, so a rerun tries again
    return row;
  });
  console.log = log;
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n");

  const freshById = new Map(fresh.map((r) => [r.id, r]));
  const rows = selected.map((s) => freshById.get(s.id) || cache[keyFor(s)]);
  const metrics = computeMetrics(rows);
  const runCost = fresh.reduce((n, r) => n + (r.tokens?.cost_usd || 0), 0);
  writeFileSync(
    RESULTS_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), model, promptVersion: version, scenarioCount: rows.length, metrics, rows }, null, 2) + "\n"
  );
  printSummary(metrics, rows.length, runCost);
  console.log("\nWrote data/eval-results.json");
}

main()
  .then(() => process.exit(0)) // open Gemini/BigQuery connections would otherwise keep Node running
  .catch((err) => {
    console.error(`eval failed: ${err.message}`);
    process.exit(1);
  });
