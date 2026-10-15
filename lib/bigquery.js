import { BigQuery } from "@google-cloud/bigquery";

// Cost guardrails: every query is capped at 100 MB billed and 5 seconds.
export const BQ_LOCATION = "asia-south1";
export const PAYEES_TABLE = "payees";
const MAX_BYTES_BILLED = String(100 * 1024 * 1024);
const TIMEOUT_MS = 5000;

let client;

export function getBigQuery() {
  if (!client) client = new BigQuery({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  return client;
}

export function getDataset() {
  const dataset = process.env.BQ_DATASET;
  // The dataset name goes into the SQL text (it cannot be a query parameter), so only allow safe names.
  if (!dataset || !/^[A-Za-z0-9_]+$/.test(dataset)) throw new Error("BQ_DATASET is missing or invalid");
  return dataset;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`BigQuery did not respond within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Returns the payee row for this id, or null if the table has no such payee. */
export async function lookupPayee(payeeId) {
  const table = `\`${process.env.GOOGLE_CLOUD_PROJECT}.${getDataset()}.${PAYEES_TABLE}\``;
  const query = `
    SELECT payee_id, display_name, account_age_days, prior_reports,
           inbound_senders_24h, pass_through_ratio, flags, risk_level
    FROM ${table}
    WHERE payee_id = @payeeId
    LIMIT 1`;
  const [rows] = await withTimeout(
    getBigQuery().query({
      query,
      params: { payeeId },
      location: BQ_LOCATION,
      maximumBytesBilled: MAX_BYTES_BILLED,
      jobTimeoutMs: TIMEOUT_MS,
    }),
    TIMEOUT_MS
  );
  return rows[0] || null;
}
