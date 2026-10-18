"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { DEMO_SCENARIOS } from "@/lib/demoScenarios";
import VerdictCard from "./components/VerdictCard";
import ScreenshotInput from "./components/ScreenshotInput";
import { labelsFor } from "@/lib/labels";
import { CURRENCIES, defaultCurrency } from "@/lib/currency";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "id", label: "Bahasa Indonesia" },
];

const EMPTY_FORM = { payeeId: "", amount: "", currency: "INR", conversation: "", language: "en" };

export default function CheckForm({ payees }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error | limited
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [limited, setLimited] = useState(null); // { message, examples } when a rate limit is hit
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [mode, setMode] = useState("text"); // text | image
  const [image, setImage] = useState(null); // prepared JPEG { mimeType, data, previewUrl, ... }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // The currency follows the language until the customer picks one themselves.
  function changeLanguage(e) {
    const language = e.target.value;
    setForm({ ...form, language, currency: currencyTouched ? form.currency : defaultCurrency(language) });
  }

  function changeCurrency(e) {
    setCurrencyTouched(true);
    setForm({ ...form, currency: e.target.value });
  }

  function loadDemo(demo) {
    setForm({ ...form, payeeId: demo.payeeId, amount: demo.amount, currency: demo.currency, conversation: demo.conversation });
    setMode("text");
    setStatus("idle");
    setResult(null);
  }

  // A sample screenshot also fills in the payee and amount of the matching demo.
  function loadSampleDetails(sample) {
    const demo = DEMO_SCENARIOS.find((d) => d.id === sample.id);
    if (demo) setForm((f) => ({ ...f, payeeId: demo.payeeId, amount: demo.amount, currency: demo.currency }));
    setStatus("idle");
    setResult(null);
  }

  function showInputError(message) {
    setError(message);
    setStatus("error");
  }

  function requestBody() {
    if (mode === "text") return form;
    const { conversation, ...rest } = form;
    return { ...rest, image: { mimeType: image.mimeType, data: image.data } };
  }

  async function runCheck(e) {
    e?.preventDefault();
    if (mode === "image" && !image) return showInputError("Please add a screenshot first, or switch to Paste text.");
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody()),
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
          <span className={styles.amountRow}>
            <select aria-label="Currency" value={form.currency} onChange={changeCurrency}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input type="number" min="1" step="any" inputMode="decimal" value={form.amount} onChange={update("amount")} placeholder="0" required />
          </span>
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Conversation</span>
          <div className={styles.toggle} role="group" aria-label="How to add the conversation">
            <button type="button" aria-pressed={mode === "text"} onClick={() => setMode("text")} disabled={loading}>
              Paste text
            </button>
            <button type="button" aria-pressed={mode === "image"} onClick={() => setMode("image")} disabled={loading}>
              Upload screenshot
            </button>
          </div>
          {mode === "text" ? (
            <textarea
              aria-label="Conversation"
              rows={8}
              value={form.conversation}
              onChange={update("conversation")}
              placeholder="Paste the chat or message here"
              required
            />
          ) : (
            <ScreenshotInput image={image} onImage={setImage} onSample={loadSampleDetails} onError={showInputError} disabled={loading} />
          )}
        </div>

        <label>
          Explain the result in
          <select value={form.language} onChange={changeLanguage}>
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
        <p className={styles.demoNotice}>
          Demo only. Do not enter real personal or bank details. Checks you submit appear in the demo bank console.
        </p>
        <p className={styles.privacy}>Account numbers, phone numbers, emails and codes are masked before review.</p>
      </form>

      {loading && (
        <div className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {mode === "image" ? "Reading your screenshot and checking the payee…" : "Reading the conversation and checking the payee…"}
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

      {status === "done" && result?.transcript && (
        <details className={styles.transcript}>
          <summary>What we read from your screenshot</summary>
          <p className={styles.privacy}>Personal details are masked. The image itself is not stored.</p>
          <pre>{result.transcript}</pre>
        </details>
      )}

      <footer className={styles.footer}>
        <Link href="/ops">Bank staff view</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/evaluation">Evaluation</Link>
      </footer>
    </main>
  );
}
