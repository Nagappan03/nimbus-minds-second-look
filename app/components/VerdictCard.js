import styles from "./VerdictCard.module.css";
import { labelsFor } from "@/lib/labels";

const TONES = { PROCEED: styles.proceed, BE_CAREFUL: styles.careful, HOLD: styles.hold };

// Payee signals arrive as ids like "new_account"; show them as plain words.
const evidenceText = (r) => (r.source === "payee" ? r.evidence_quote.replace(/_/g, " ") : r.evidence_quote);

/**
 * The verdict as the customer sees it, in the language of the explanation.
 * Also used on the ops case page to show exactly what the customer saw.
 */
export default function VerdictCard({ result }) {
  const { decision, timings_ms } = result;
  const t = labelsFor(decision.explanation_language);

  return (
    <section className={`${styles.verdict} ${TONES[decision.verdict]}`} aria-live="polite">
      {result.saved_example && (
        <p className={styles.savedNote}>
          {result.notice} <strong>{t.savedExample}</strong>
        </p>
      )}
      <div className={styles.verdictHead}>
        <h2>{t[decision.verdict]}</h2>
        <span className={styles.score}>
          {t.risk} {decision.score}/100
        </span>
      </div>

      <p className={styles.explanation}>{decision.explanation}</p>
      {result.truncated && <p className={styles.footnote}>{t.truncated}</p>}

      {decision.reasons.length > 0 && (
        <>
          <h3>{t.why}</h3>
          <ul className={styles.reasons}>
            {decision.reasons.map((r, i) => (
              <li key={i}>
                <p>{r.text}</p>
                <blockquote>
                  <span className={styles.source}>{t[r.source]}</span> “{evidenceText(r)}”
                  {!r.quote_verified && <em className={styles.unverified}> {t.unverified}</em>}
                </blockquote>
              </li>
            ))}
          </ul>
        </>
      )}

      {decision.next_steps.length > 0 && (
        <>
          <h3>{t.next}</h3>
          <ol className={styles.steps}>
            {decision.next_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}

      <p className={styles.footnote}>
        {t.footnote} {result.saved_example ? t.savedResult : t.checkedIn((timings_ms.total / 1000).toFixed(1))}
      </p>
    </section>
  );
}
