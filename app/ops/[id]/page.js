"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "../ops.module.css";
import VerdictCard from "@/app/components/VerdictCard";
import typologies from "@/data/typologies.json";
import { highlightSegments } from "@/lib/highlight";
import { LANGUAGE_NAMES, STATUS_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { formatAmount, formatTime } from "../format";

const STEP_NAMES = { mask: "Masking", evidence: "Evidence reader", payee: "Payee risk", patterns: "Pattern matcher", decide: "Decision", total: "Total" };
const typologyName = (id) => typologies.find((t) => t.id === id)?.name || id;

export default function CaseDetail() {
  const { id } = useParams();
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });
    try {
      const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setState({ status: "done", data: body.case, error: null });
    } catch (err) {
      setState({ status: "error", data: null, error: err.message });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "loading") return <p className={styles.muted}>Loading case…</p>;
  if (state.status === "error") {
    return (
      <div className={styles.error} role="alert">
        <p>Could not load this case: {state.error}</p>
        <button className={styles.secondary} onClick={load}>
          Try again
        </button>{" "}
        <Link href="/ops">Back to the queue</Link>
      </div>
    );
  }

  const c = state.data;
  return (
    <article className={styles.detail}>
      <Link href="/ops" className={styles.back}>
        ← Back to the queue
      </Link>
      <CaseHeader c={c} />
      <Reasons reasons={c.decision.reasons} />
      <Conversation text={c.conversation_masked} reasons={c.decision.reasons} truncated={c.truncated} />
      <PayeeSignals payee={c.payee_signals} />
      <Patterns matches={c.patterns?.matches || []} />
      <section className={styles.section}>
        <h2>What the customer saw ({LANGUAGE_NAMES[c.language]})</h2>
        <VerdictCard result={{ decision: c.decision, timings_ms: c.timings_ms, truncated: c.truncated }} />
      </section>
      <Timings timings={c.timings_ms} tokens={c.tokens} />
      <DecisionPanel c={c} onDecided={(updated) => setState({ status: "done", data: updated, error: null })} />
      <SummaryPanel caseId={c.id} />
    </article>
  );
}

function CaseHeader({ c }) {
  return (
    <header className={styles.caseHeader}>
      <div className={styles.caseTitle}>
        <span className={`${styles.pill} ${styles[c.verdict]}`}>{VERDICT_LABELS[c.verdict]}</span>
        <span className={styles.bigScore}>Score {c.score}/100</span>
        <span className={`${styles.status} ${styles[c.status]}`}>{STATUS_LABELS[c.status]}</span>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Payee</dt>
          <dd>
            {c.payee_name || "Unknown payee"} <span className={styles.subtle}>{c.payee_id}</span>
          </dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{formatAmount(c.amount)}</dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>{formatTime(c.createdAt)}</dd>
        </div>
        <div>
          <dt>Case id</dt>
          <dd className={styles.mono}>{c.id}</dd>
        </div>
      </dl>
      {c.status === "pending_review" && (
        <a href="#decision" className={styles.jump}>
          Go to decision ↓
        </a>
      )}
    </header>
  );
}

function QuoteBadge({ reason }) {
  if (reason.source === "payee") return <span className={`${styles.badge} ${styles.badgePayee}`}>Payee signal</span>;
  return reason.quote_verified ? (
    <span className={`${styles.badge} ${styles.badgeOk}`}>Quote verified</span>
  ) : (
    <span className={`${styles.badge} ${styles.badgeWarn}`}>Quote not found in chat</span>
  );
}

function Reasons({ reasons }) {
  return (
    <section className={styles.section}>
      <h2>Reasons</h2>
      {reasons.length === 0 && <p className={styles.muted}>No reasons were given.</p>}
      <ul className={styles.reasonList}>
        {reasons.map((r, i) => (
          <li key={i}>
            <p>{r.text}</p>
            <blockquote>
              “{r.evidence_quote}” <QuoteBadge reason={r} />
            </blockquote>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Conversation({ text, reasons, truncated }) {
  const quotes = reasons.filter((r) => r.source === "conversation").map((r) => r.evidence_quote);
  return (
    <section className={styles.section}>
      <h2>Conversation (masked)</h2>
      <p className={styles.muted}>
        Account numbers, phones, emails and codes were masked before review. Quoted evidence is highlighted.
        {truncated && " Only the first 6,000 characters were checked."}
      </p>
      <pre className={styles.conversation}>
        {highlightSegments(text, quotes).map((s, i) => (s.highlight ? <mark key={i}>{s.text}</mark> : s.text))}
      </pre>
    </section>
  );
}

function PayeeSignals({ payee }) {
  if (!payee) return null;
  const rows = [
    ["Risk level", payee.risk_level],
    ["Account age", payee.account_age_days == null ? "unknown" : `${payee.account_age_days} days`],
    ["Prior fraud reports", payee.prior_reports],
    ["Inbound senders (24 h)", payee.inbound_senders_24h ?? "unknown"],
    ["Pass-through ratio", payee.pass_through_ratio == null ? "unknown" : `${Math.round(payee.pass_through_ratio * 100)}% moved out within an hour`],
    ["Flags", payee.flags?.length ? payee.flags.map((f) => f.replace(/_/g, " ")).join(", ") : "none"],
  ];
  return (
    <section className={styles.section}>
      <h2>
        Payee signals{" "}
        <span className={`${styles.badge} ${payee.source === "bigquery" ? styles.badgeOk : styles.badgeWarn}`}>
          Source: {payee.source === "bigquery" ? "BigQuery" : "local fallback"}
        </span>
      </h2>
      <dl className={styles.kv}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Patterns({ matches }) {
  return (
    <section className={styles.section}>
      <h2>Matched scam types</h2>
      {matches.length === 0 ? (
        <p className={styles.muted}>No known scam type matched.</p>
      ) : (
        <ul className={styles.patternList}>
          {matches.map((m) => (
            <li key={m.type_id}>
              <div className={styles.patternHead}>
                <strong>{typologyName(m.type_id)}</strong>
                <span>{Math.round(m.confidence * 100)}%</span>
              </div>
              <div className={styles.meter}>
                <span style={{ width: `${Math.round(m.confidence * 100)}%` }} />
              </div>
              <p className={styles.muted}>{m.rationale}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Timings({ timings, tokens }) {
  return (
    <section className={styles.section}>
      <h2>Step timings</h2>
      <dl className={styles.kv}>
        {Object.entries(STEP_NAMES)
          .filter(([key]) => timings?.[key] != null)
          .map(([key, name]) => (
            <div key={key}>
              <dt>{name}</dt>
              <dd>{timings[key]} ms</dd>
            </div>
          ))}
        {tokens && (
          <div>
            <dt>Gemini tokens</dt>
            <dd>
              {tokens.input} in, {tokens.output} out, {tokens.calls} calls
              {tokens.cost_usd != null && ` (about $${tokens.cost_usd.toFixed(4)})`}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function DecisionPanel({ c, onDecided }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(null); // the decision being saved
  const [error, setError] = useState(null);

  async function decide(decision) {
    setSaving(decision);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      onDecided(body.case);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className={`${styles.section} ${styles.decision}`} id="decision">
      <h2>Decision</h2>
      {c.status === "no_action" && <p className={styles.muted}>The customer was told the payment looks fine. No review is needed.</p>}

      {(c.status === "hold_confirmed" || c.status === "released") && (
        <p>
          <strong>{STATUS_LABELS[c.status]}</strong> by {c.reviewer} on {formatTime(c.reviewed_at)}.
          {c.review_note && <span className={styles.noteText}>Note: {c.review_note}</span>}
        </p>
      )}

      {c.status === "pending_review" && (
        <>
          <label className={styles.noteLabel}>
            Note (optional)
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What you checked and why" />
          </label>
          <div className={styles.actions}>
            <button className={styles.holdButton} onClick={() => decide("confirm_hold")} disabled={!!saving}>
              {saving === "confirm_hold" ? "Saving…" : "Confirm hold"}
            </button>
            <button className={styles.releaseButton} onClick={() => decide("release")} disabled={!!saving}>
              {saving === "release" ? "Saving…" : "Release"}
            </button>
          </div>
          {error && (
            <p className={styles.inlineError} role="alert">
              Could not save the decision: {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SummaryPanel({ caseId }) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef(null);

  async function generate() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setDraft(body.summary);
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (permissions, embedded browsers): select the text instead.
      boxRef.current?.select();
      setError("Copying is blocked in this browser. The text is selected: press Ctrl+C (Cmd+C on a Mac).");
    }
  }

  return (
    <section className={styles.section}>
      <h2>Case summary</h2>
      <p className={styles.muted}>A short AI draft in suspicious-activity-report style. Review and edit it before use; it is not saved.</p>
      {status !== "done" && (
        <button className={styles.secondary} onClick={generate} disabled={status === "loading"}>
          {status === "loading" ? "Drafting…" : "Draft case summary"}
        </button>
      )}
      {status === "done" && (
        <>
          <textarea ref={boxRef} className={styles.summaryBox} rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button className={styles.secondary} onClick={generate}>
              Draft again
            </button>
          </div>
        </>
      )}
      {error && (
        <p className={styles.inlineError} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
