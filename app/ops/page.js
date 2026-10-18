"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./ops.module.css";
import { LANGUAGE_NAMES, STATUS_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { formatAmount, formatTime } from "./format";

const TABS = [
  { id: "review", label: "Needs review", status: "pending_review" },
  { id: "all", label: "All", status: null },
  { id: "decided", label: "Decided", status: "decided" },
];

// Highest risk first; newest first among equal scores.
const byPriority = (a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt);

export default function OpsQueue() {
  const router = useRouter();
  const [tab, setTab] = useState(TABS[0]);
  const [state, setState] = useState({ status: "loading", cases: [], error: null });

  const load = useCallback(async () => {
    setState({ status: "loading", cases: [], error: null });
    try {
      const query = tab.status ? `?status=${tab.status}` : "";
      const res = await fetch(`/api/cases${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setState({ status: "done", cases: data.cases.sort(byPriority), error: null });
    } catch (err) {
      setState({ status: "error", cases: [], error: err.message });
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab.id}
              className={t.id === tab.id ? styles.tabActive : styles.tab}
              onClick={() => setTab(t)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className={styles.secondary} onClick={load} disabled={state.status === "loading"}>
          Refresh
        </button>
      </div>

      {state.status === "loading" && <p className={styles.muted}>Loading cases…</p>}

      {state.status === "error" && (
        <div className={styles.error} role="alert">
          <p>Could not load cases: {state.error}</p>
          <button className={styles.secondary} onClick={load}>
            Try again
          </button>
        </div>
      )}

      {state.status === "done" && state.cases.length === 0 && (
        <p className={styles.empty}>
          {tab.id === "review" ? "Nothing needs review right now." : "No cases yet."} Cases appear here after a
          customer checks a payment.
        </p>
      )}

      {state.status === "done" && state.cases.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Payee</th>
                <th className={styles.num}>Amount</th>
                <th>Verdict</th>
                <th className={styles.num}>Score</th>
                <th>Status</th>
                <th>Language</th>
              </tr>
            </thead>
            <tbody>
              {state.cases.map((c) => (
                <tr
                  key={c.id}
                  className={styles.row}
                  tabIndex={0}
                  onClick={() => router.push(`/ops/${c.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && router.push(`/ops/${c.id}`)}
                >
                  <td className={styles.nowrap}>{formatTime(c.createdAt)}</td>
                  <td>
                    {c.payee_name || "Unknown payee"}
                    <span className={styles.subtle}>{c.payee_id}</span>
                  </td>
                  <td className={styles.num}>{formatAmount(c.amount, c.currency)}</td>
                  <td>
                    <span className={`${styles.pill} ${styles[c.verdict]}`}>{VERDICT_LABELS[c.verdict]}</span>
                  </td>
                  <td className={styles.num}>{c.score}</td>
                  <td>
                    <span className={`${styles.status} ${styles[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                  </td>
                  <td>{LANGUAGE_NAMES[c.language]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
