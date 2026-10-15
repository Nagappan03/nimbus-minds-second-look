"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { DEMO_SCENARIOS } from "@/lib/demoScenarios";
import VerdictCard from "./components/VerdictCard";
import { labelsFor } from "@/lib/labels";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "id", label: "Bahasa Indonesia" },
];

const EMPTY_FORM = { payeeId: "", amount: "", conversation: "", language: "en" };

export default function CheckForm({ payees }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error | limited
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [limited, setLimited] = useState(null); // { message, examples } when a rate limit is hit

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  function loadDemo(demo) {
    setForm({ ...form, payeeId: demo.payeeId, amount: demo.amount, conversation: demo.conversation });
    setStatus("idle");
    setResult(null);
  }

  async function runCheck(e) {
    e?.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({ error: "The server sent an unreadable reply." }));
      if (res.status === 429 && data.examples) {
        setLimited({ message: data.error, examples: data.examples });
        setStatus("limited");
        return;
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data);
      setStatus("done");
    } catch (err) {
      // fetch throws TypeError when the network itself is down.
      setError(err instanceof TypeError ? "Could not reach the server. Check your connection." : err.message);
      setStatus("error");
    }
  }

  function showExample(example) {
    setResult({ ...example, saved_example: true, notice: limited?.message });
    setStatus("done");
  }

  const loading = status === "loading";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Second Look</h1>
        <p>Check before sending. Paste the chat that asked you to pay, and we will look at it with you.</p>
      </header>

      <section className={styles.demos} aria-label="Demo scenarios">
        <span>Try a demo:</span>
        {DEMO_SCENARIOS.map((d) => (
          <button key={d.id} type="button" onClick={() => loadDemo(d)} disabled={loading}>
            {d.label}
          </button>
        ))}
      </section>

      <form className={styles.card} onSubmit={runCheck}>
        <label>
          Payee
          <input list="payee-list" value={form.payeeId} onChange={update("payeeId")} placeholder="e.g. PAYEE-1001" required />
          <datalist id="payee-list">
            {payees.map((p) => (
              <option key={p.payee_id} value={p.payee_id}>
                {p.display_name}
              </option>
            ))}
          </datalist>
        </label>

        <label>
          Amount
          <input type="number" min="1" step="any" inputMode="decimal" value={form.amount} onChange={update("amount")} placeholder="0" required />
        </label>

        <label>
          Conversation
          <textarea rows={8} value={form.conversation} onChange={update("conversation")} placeholder="Paste the chat or message here" required />
        </label>

        <label>
          Explain the result in
          <select value={form.language} onChange={update("language")}>
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <button className={styles.primary} type="submit" disabled={loading}>
          {loading ? "Checking…" : "Check before sending"}
        </button>
        <p className={styles.privacy}>Account numbers, phone numbers, emails and codes are masked before review.</p>
      </form>

      {loading && (
        <div className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          Reading the conversation and checking the payee…
        </div>
      )}

      {status === "error" && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" onClick={runCheck}>
            {labelsFor(form.language).tryAgain}
          </button>
        </div>
      )}

      {status === "limited" && limited && (
        <div className={styles.notice} role="status">
          <p>{limited.message}</p>
          <div className={styles.demos}>
            {limited.examples.map((ex) => (
              <button key={ex.id} type="button" onClick={() => showExample(ex)}>
                See example: {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "done" && result && <VerdictCard result={result} />}

      <footer className={styles.footer}>
        <Link href="/ops">Bank staff view</Link>
      </footer>
    </main>
  );
}
