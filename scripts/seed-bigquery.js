// Loads data/payees-seed.json into the BigQuery payees table.
// Creates the dataset (asia-south1) if needed, then runs a load job with
// WRITE_TRUNCATE, so running it again replaces the table contents.
// Load jobs are free; no streaming inserts are used.
// Run: npm run seed   (reads GOOGLE_CLOUD_PROJECT and BQ_DATASET from .env.local)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBigQuery, getDataset, BQ_LOCATION, PAYEES_TABLE } from "../lib/bigquery.js";

const SCHEMA = [
  { name: "payee_id", type: "STRING", mode: "REQUIRED" },
  { name: "display_name", type: "STRING", mode: "REQUIRED" },
  { name: "account_age_days", type: "INT64", mode: "REQUIRED" },
  { name: "prior_reports", type: "INT64", mode: "REQUIRED" },
  { name: "inbound_senders_24h", type: "INT64", mode: "REQUIRED" },
  { name: "pass_through_ratio", type: "FLOAT64", mode: "REQUIRED" },
  { name: "flags", type: "STRING", mode: "REPEATED" },
  { name: "risk_level", type: "STRING", mode: "REQUIRED" },
];

const bigquery = getBigQuery();
const datasetId = getDataset();
const payees = JSON.parse(readFileSync(new URL("../data/payees-seed.json", import.meta.url), "utf8"));

const dataset = bigquery.dataset(datasetId);
const [exists] = await dataset.exists();
if (!exists) {
  await bigquery.createDataset(datasetId, { location: BQ_LOCATION });
  console.log(`Created dataset ${datasetId} in ${BQ_LOCATION}`);
}

// A load job reads from a file, so write the rows as newline-delimited JSON first.
const dir = mkdtempSync(join(tmpdir(), "payees-"));
const file = join(dir, "payees.ndjson");
writeFileSync(file, payees.map((p) => JSON.stringify(p)).join("\n") + "\n");

try {
  const [job] = await dataset.table(PAYEES_TABLE).load(file, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    schema: { fields: SCHEMA },
    createDisposition: "CREATE_IF_NEEDED",
    writeDisposition: "WRITE_TRUNCATE",
    location: BQ_LOCATION,
  });
  const errors = job.status?.errors;
  if (errors?.length) throw new Error(JSON.stringify(errors));
  console.log(`Loaded ${job.statistics?.load?.outputRows} rows into ${datasetId}.${PAYEES_TABLE}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
