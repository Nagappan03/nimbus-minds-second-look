import styles from "./page.module.css";

const VERDICTS = {
  PROCEED: { label: "Looks fine to send", className: styles.proceed },
  BE_CAREFUL: { label: "Be careful", className: styles.careful },
  HOLD: { label: "Hold: please do not send yet", className: styles.hold },
};

const SOURCE_LABELS = { conversation: "From the chat", payee: "Payee record" };

// Payee signals arrive as ids like "new_account"; show them as plain words.
const evidenceText = (r) => (r.source === "payee" ? r.evidence_quote.replace(/_/g, " ") : r.evidence_quote);

export default function VerdictCard({ result }) {
  const { decision, timings_ms } = result;
  const v = VERDICTS[decision.verdict];

  return (
    <section className={`${styles.verdict} ${v.className}`} aria-live="polite">
      {result.saved_example && (
        <p className={styles.savedNote}>
          {result.notice} <strong>This is a saved example, not a live check of your conversation.</strong>
        </p>
      )}
      <div className={styles.verdictHead}>
        <h2>{v.label}</h2>
        <span className={styles.score} title="Risk score from 0 (safe) to 100">
          Risk {decision.score}/100
        </span>
      </div>

      <p className={styles.explanation}>{decision.explanation}</p>
      {result.truncated && (
        <p className={styles.footnote}>The conversation was long, so only the first 6,000 characters were checked.</p>
      )}

      {decision.reasons.length > 0 && (
        <>
          <h3>Why</h3>
          <ul className={styles.reasons}>
            {decision.reasons.map((r, i) => (
              <li key={i}>
                <p>{r.text}</p>
                <blockquote>
                  <span className={styles.source}>{SOURCE_LABELS[r.source]}</span> “{evidenceText(r)}”
                  {!r.quote_verified && <em className={styles.unverified}> (wording not found exactly in the chat)</em>}
                </blockquote>
              </li>
            ))}
          </ul>
        </>
      )}

      {decision.next_steps.length > 0 && (
        <>
          <h3>What to do next</h3>
          <ol className={styles.steps}>
            {decision.next_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}

      <p className={styles.footnote}>
        Second Look gives advice only. If a payment is held, a member of bank staff reviews it before anything is
        blocked.{" "}
        {result.saved_example ? "Saved example result." : `Checked in ${(timings_ms.total / 1000).toFixed(1)} s.`}
      </p>
    </section>
  );
}
