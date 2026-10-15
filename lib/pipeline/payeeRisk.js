// Payee signals come from the BigQuery payees table. If BigQuery fails, the
// same synthetic rows are read from data/payees-seed.json so a check can still
// finish; `source` says which one was used.
import { lookupPayee } from "../bigquery.js";
import seed from "../../data/payees-seed.json" with { type: "json" };

function unknownPayee(id, source) {
  // No history to lean on, so we neither trust nor accuse.
  return {
    payee_id: id || "UNKNOWN",
    display_name: null,
    account_age_days: null,
    prior_reports: 0,
    inbound_senders_24h: null,
    pass_through_ratio: null,
    flags: ["not_in_payee_records"],
    risk_level: "medium",
    source,
  };
}

export async function getPayeeRisk(payeeId) {
  const id = String(payeeId || "").trim().toUpperCase();
  try {
    const row = await lookupPayee(id);
    return row ? { ...row, source: "bigquery" } : unknownPayee(id, "bigquery");
  } catch (err) {
    console.warn(JSON.stringify({ event: "bigquery_fallback", message: err.message }));
    const row = seed.find((p) => p.payee_id === id);
    return row ? { ...row, source: "local-fallback" } : unknownPayee(id, "local-fallback");
  }
}

/** Ids and display names only: this list is sent to the browser, risk data is not. */
export function listPayees() {
  return seed.map(({ payee_id, display_name }) => ({ payee_id, display_name }));
}

/** Display name for a payee id, for saving with a case (no BigQuery call). */
export function payeeName(payeeId) {
  return seed.find((p) => p.payee_id === payeeId)?.display_name || null;
}
