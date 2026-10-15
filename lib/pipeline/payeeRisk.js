// Stage 1: payee signals come from a small local file of invented payees.
// Stage 2 replaces the lookup with a BigQuery query; the returned shape stays the same.
import payees from "../../data/payees.json" with { type: "json" };

// Flags that describe trust rather than risk; they do not raise the risk level.
const POSITIVE_FLAGS = new Set(["paid_by_customer_before", "registered_business"]);

function riskLevel({ account_age_days, prior_reports, flags }) {
  const riskyFlags = flags.filter((f) => !POSITIVE_FLAGS.has(f));
  if (prior_reports >= 2 || (prior_reports >= 1 && account_age_days < 60)) return "high";
  if (prior_reports >= 1 || account_age_days < 90 || riskyFlags.length > 0) return "medium";
  return "low";
}

export async function getPayeeRisk(payeeId) {
  const id = String(payeeId || "").trim().toUpperCase();
  const row = payees.find((p) => p.payee_id === id);
  if (!row) {
    // Unknown payee: no history to lean on, so we neither trust nor accuse.
    return {
      payee_id: id || "UNKNOWN",
      name: null,
      account_age_days: null,
      prior_reports: 0,
      flags: ["not_in_payee_records"],
      risk_level: "medium",
    };
  }
  return { ...row, risk_level: riskLevel(row) };
}

export function listPayees() {
  return payees.map(({ payee_id, name }) => ({ payee_id, name }));
}
