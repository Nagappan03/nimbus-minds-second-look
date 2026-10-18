import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import styles from "./evaluation.module.css";
import { LANGUAGE_NAMES, VERDICT_LABELS } from "@/lib/labels";

export const metadata = { title: "Second Look: evaluation" };

const VERDICTS = ["PROCEED", "BE_CAREFUL", "HOLD"];

// Read when the page is built (no API calls, no cost). Re-run `npm run eval` and rebuild to refresh.
function loadResults() {
  const file = join(process.cwd(), "data", "eval-results.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const pct = (v) => (v == null ? "n/a" : `${Math.round(v * 1000) / 10}%`);
const seconds = (ms) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);

export default function EvaluationPage() {
  const results = loadResults();
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Evaluation</h1>
        <nav className={styles.nav}>
          <Link href="/">Customer page</Link>
          <Link href="/ops">Bank staff view</Link>
        </nav>
      </header>

      <p className={styles.note}>
        <strong>How to read this:</strong> {results ? `${results.scenarioCount} synthetic` : "Synthetic"} scenarios written by the builders; results show
        agreement with our own labels, not independent validation. Single model. No real customer data.
      </p>

      {results ? <Results r={results} /> : <p className={styles.empty}>No evaluation results yet. Run <code>npm run eval</code> to create them.</p>}
    </main>
  );
}

function Results({ r }) {
  const m = r.metrics;
  const tiles = [
    ["Scenarios tested", r.scenarioCount, m.error_count ? `${m.error_count} errored` : "all answered"],
    ["Scam catch rate", pct(m.scam_catch_rate), `expected Hold not answered Proceed (n=${m.counts.expected_hold})`],
    ["False holds on genuine payments", pct(m.false_hold_rate), `expected Proceed answered Hold (n=${m.counts.expected_proceed})`],
    ["Quotes verified", pct(m.quote_verified_rate), "quoted evidence found in the chat"],
    ["Median response time", seconds(m.latency_ms.median), `p95 ${seconds(m.latency_ms.p95)}`],
    ["Cost per check", m.cost_per_check_usd == null ? "n/a" : `$${m.cost_per_check_usd.toFixed(4)}`, `${r.model}`],
  ];
  return (
    <>
      <p className={styles.meta}>
        Model {r.model} · generated {new Date(r.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </p>

      <section className={styles.tiles}>
        {tiles.map(([label, value, sub]) => (
          <div key={label} className={styles.tile}>
            <span className={styles.tileLabel}>{label}</span>
            <span className={styles.tileValue}>{value}</span>
            <span className={styles.tileSub}>{sub}</span>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Agreement with our labels</h2>
        <dl className={styles.kv}>
          <div><dt>Exact match</dt><dd>{pct(m.exact_match_rate)}</dd></div>
          <div><dt>Acceptable verdict</dt><dd>{pct(m.acceptable_rate)}</dd></div>
          <div><dt>Hold on expected-Hold scams</dt><dd>{pct(m.hold_precision_on_scams)}</dd></div>
          <div><dt>Any warning on genuine payments</dt><dd>{pct(m.false_alarm_rate)}</dd></div>
          <div><dt>High-risk payees answered Proceed</dt><dd>{m.high_risk_payee_proceed_count} of {m.high_risk_payee_count}</dd></div>
          <div><dt>Tokens (in / out)</dt><dd>{m.tokens.input.toLocaleString("en-IN")} / {m.tokens.output.toLocaleString("en-IN")} (${m.tokens.cost_usd.toFixed(3)})</dd></div>
        </dl>
      </section>

      <section className={styles.section}>
        <h2>Confusion matrix</h2>
        <p className={styles.muted}>Rows are our expected verdict, columns are what Second Look answered.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Expected ↓ / Got →</th>
                {VERDICTS.map((v) => <th key={v} className={styles.num}>{VERDICT_LABELS[v]}</th>)}
              </tr>
            </thead>
            <tbody>
              {VERDICTS.map((e) => (
                <tr key={e}>
                  <th scope="row">{VERDICT_LABELS[e]}</th>
                  {VERDICTS.map((v) => (
                    <td key={v} className={`${styles.num} ${e === v ? styles.diagonal : ""}`}>{m.confusion_matrix[e][v]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2>By language</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Language</th><th className={styles.num}>Scenarios</th><th className={styles.num}>Acceptable</th></tr>
            </thead>
            <tbody>
              {Object.entries(m.by_language).map(([lang, v]) => (
                <tr key={lang}>
                  <td>{LANGUAGE_NAMES[lang] || lang}</td>
                  <td className={styles.num}>{v.count}</td>
                  <td className={styles.num}>{pct(v.acceptable_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Red team</h2>
        <p>
          {m.red_team_count === 0
            ? "No red-team scenarios in this run."
            : `${pct(m.red_team_pass_rate)} of ${m.red_team_count} red-team scenarios (prompt injection and evasion attempts) were not answered Proceed.`}
        </p>
      </section>

      <section className={styles.section}>
        <h2>Failures ({m.failures.length})</h2>
        {m.failures.length === 0 ? (
          <p className={styles.muted}>Every answered scenario got an acceptable verdict.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Scenario</th><th>Expected</th><th>Got</th><th>First reason and quote</th></tr>
              </thead>
              <tbody>
                {m.failures.map((f) => (
                  <tr key={f.id}>
                    <td className={styles.nowrap}>{f.id}<span className={styles.subtle}>{LANGUAGE_NAMES[f.language] || f.language}</span></td>
                    <td>{VERDICT_LABELS[f.expected]}</td>
                    <td>{f.verdict ? VERDICT_LABELS[f.verdict] : "Error"}</td>
                    <td>
                      {f.error || f.reason}
                      {f.quote && <span className={styles.quote}>“{f.quote}”</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
