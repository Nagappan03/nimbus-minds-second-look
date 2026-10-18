// Metrics for scripts/eval.js, computed from per-scenario rows.
// Rows with an error have no verdict; they are excluded from the rate
// denominators and reported separately as error_count.

const VERDICTS = ["PROCEED", "BE_CAREFUL", "HOLD"];

const share = (part, whole) => (whole === 0 ? null : Number((part / whole).toFixed(4)));

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function confusionMatrix(rows) {
  const matrix = Object.fromEntries(VERDICTS.map((e) => [e, Object.fromEntries(VERDICTS.map((v) => [v, 0]))]));
  for (const r of rows) matrix[r.expected][r.verdict] += 1;
  return matrix;
}

function byLanguage(rows) {
  const out = {};
  for (const r of rows) {
    out[r.language] ||= { count: 0, ok: 0 };
    out[r.language].count += 1;
    if (r.ok) out[r.language].ok += 1;
  }
  for (const v of Object.values(out)) v.acceptable_rate = share(v.ok, v.count);
  return out;
}

export function computeMetrics(allRows) {
  const rows = allRows.filter((r) => !r.error);
  const expectedHold = rows.filter((r) => r.expected === "HOLD");
  const expectedProceed = rows.filter((r) => r.expected === "PROCEED");
  const redTeam = rows.filter((r) => r.red_team);
  const highRisk = rows.filter((r) => r.payee_risk === "high");
  const conversationQuotes = rows.reduce((n, r) => n + r.conversation_reason_count, 0);
  const verifiedQuotes = rows.reduce((n, r) => n + r.quote_verified_count, 0);
  const latencies = rows.map((r) => r.latencyMs);
  const tokens = allRows.reduce(
    (t, r) => ({
      input: t.input + (r.tokens?.input || 0),
      output: t.output + (r.tokens?.output || 0),
      cost_usd: t.cost_usd + (r.tokens?.cost_usd || 0),
    }),
    { input: 0, output: 0, cost_usd: 0 }
  );

  return {
    answered: rows.length,
    error_count: allRows.length - rows.length,
    exact_match_rate: share(rows.filter((r) => r.exact).length, rows.length),
    acceptable_rate: share(rows.filter((r) => r.ok).length, rows.length),
    scam_catch_rate: share(expectedHold.filter((r) => r.verdict !== "PROCEED").length, expectedHold.length),
    hold_precision_on_scams: share(expectedHold.filter((r) => r.verdict === "HOLD").length, expectedHold.length),
    false_hold_rate: share(expectedProceed.filter((r) => r.verdict === "HOLD").length, expectedProceed.length),
    false_alarm_rate: share(expectedProceed.filter((r) => r.verdict !== "PROCEED").length, expectedProceed.length),
    quote_verified_rate: share(verifiedQuotes, conversationQuotes),
    high_risk_payee_proceed_count: highRisk.filter((r) => r.verdict === "PROCEED").length,
    high_risk_payee_count: highRisk.length,
    red_team_pass_rate: share(redTeam.filter((r) => r.verdict !== "PROCEED").length, redTeam.length),
    red_team_count: redTeam.length,
    counts: { expected_hold: expectedHold.length, expected_proceed: expectedProceed.length },
    confusion_matrix: confusionMatrix(rows),
    by_language: byLanguage(rows),
    latency_ms: { median: median(latencies), p95: percentile(latencies, 95) },
    tokens: { input: tokens.input, output: tokens.output, cost_usd: Number(tokens.cost_usd.toFixed(4)) },
    cost_per_check_usd: share(tokens.cost_usd, rows.length),
    failures: allRows
      .filter((r) => !r.ok)
      .map((r) => ({
        id: r.id,
        language: r.language,
        expected: r.expected,
        acceptable: r.acceptable,
        verdict: r.verdict,
        error: r.error,
        reason: r.first_reason?.text || null,
        quote: r.first_reason?.quote || null,
      })),
  };
}
