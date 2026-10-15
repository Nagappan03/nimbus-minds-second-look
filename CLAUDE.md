# Second Look: project guide for Claude Code

Read this file at the start of every session. It is the source of truth for what we are building.

## What this is
Second Look is a prototype for the Google Cloud AI Builder Cup 2026, theme BFSI (Intelligent Risk, Fraud & Financial Experiences). It reviews the conversation behind a payment (pasted chat, screenshot or voice note) together with the payee, and tells the customer to Proceed, Be careful or Hold before they send money to a scammer. Bank staff review held cases in an ops console. The AI never blocks money on its own; a human confirms every hold.

The builder is Nags, a data engineer who knows React, Node.js and BigQuery. Keep everything simple and readable. Do not introduce languages, frameworks or services that are not listed below. If you think something new is needed, ask first.

## Hard rules
1. This is a fresh project. Write all code and data from scratch. Never copy code, data or config from any employer or client.
2. All data is synthetic. No real personal data anywhere in the repo.
3. No secrets in the repo. Authenticate to Google Cloud with Application Default Credentials (gcloud login locally, the service account on Cloud Run). `.env.local` is git-ignored; `.env.example` lists variable names only.
4. Everything (code comments, docs, UI copy defaults, README) is in English. The UI can show Hindi, Tamil and Bahasa Indonesia output from the model.
5. The app must be built primarily on Google Cloud and use Gemini, and be deployed on Cloud Run.
6. Commit in small steps with clear messages. Push to the public GitHub repo often.

## Stack
- Next.js (App Router), JavaScript only (no TypeScript), plain CSS or CSS modules (no Tailwind, no UI library, no chart library)
- Node.js API routes inside Next.js
- Gemini on Vertex AI via the Google Gen AI SDK for JavaScript (`@google/genai`, Vertex mode). Check the official docs for current model IDs and SDK usage; do not guess from memory. Model ID comes from the `GEMINI_MODEL` env var.
- BigQuery (`@google-cloud/bigquery`) for the synthetic payee risk table
- Firestore (`@google-cloud/firestore`) for saved cases
- Cloud Run for hosting, deployed from a Dockerfile (Next.js standalone output)

## Environment variables (names only)
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `BQ_DATASET`, `FIRESTORE_COLLECTION`

## Folder layout
```
app/page.js                  customer "Check before sending" flow
app/ops/page.js              ops case queue
app/ops/[id]/page.js         case detail and decision buttons
app/evaluation/page.js       evaluation results page (reads data/eval-results.json)
app/api/check/route.js       POST: run the pipeline, save the case, return the verdict
app/api/cases/route.js       GET: list cases
app/api/cases/[id]/route.js  GET one case, PATCH status (confirm hold / release)
app/api/health/route.js      GET: ok
lib/gemini.js                client setup and generateJson(prompt, schema, parts) helper with retry
lib/bigquery.js, lib/firestore.js
lib/pipeline/mask.js         mask account/card numbers, phones, emails, OTP-like codes
lib/pipeline/evidenceReader.js
lib/pipeline/payeeRisk.js
lib/pipeline/patternMatcher.js
lib/pipeline/decide.js
lib/pipeline/runCheck.js     orchestrates the steps; independent steps run with Promise.all
data/typologies.json         about 12 scam types
data/scenarios.json          about 150 labelled scenarios
data/eval-results.json       written by scripts/eval.js
scripts/eval.js, scripts/redteam.js, scripts/seed-bigquery.js
Dockerfile, deploy.sh, README.md, .env.example
```

## Pipeline contracts (JSON)
Every Gemini step uses structured JSON output with a schema, and results are validated before use.

- Evidence Reader returns: `{ language, claimed_identity, claims[], urgency_cues[], payment_instructions, red_flags: [{ quote, why }] }`
- Payee Risk returns: `{ payee_id, account_age_days, prior_reports, flags[], risk_level: "low"|"medium"|"high" }`
- Pattern Matcher returns: `{ matches: [{ type_id, confidence: 0-1, rationale }] }`
- Decision returns: `{ verdict: "PROCEED"|"BE_CAREFUL"|"HOLD", score: 0-100, reasons: [{ text, evidence_quote, source }], next_steps[], explanation_language, explanation }`

Rules for the Decision step: every reason must quote evidence from the conversation or name the payee signal it came from. Genuine payments (a real landlord, a known supplier, a friend repaying) must be allowed to pass. Prefer BE_CAREFUL over HOLD when evidence is thin. Write the explanation in the language the customer selected, in plain words, calm tone, no blame.

## Quality bar
- The customer page loads a demo scenario in one click and shows a verdict in a few seconds.
- Handle errors visibly: if Gemini or a data service fails, the UI says what happened and offers to retry.
- Log each pipeline step's duration (used for the median response time metric).
- Keep functions short. Add a short comment only where the reason is not obvious.
- README explains: what it is, architecture, how to run locally, how to deploy, how to run the evaluation.

## Commands (keep these working)
`npm run dev`, `npm run build`, `npm start`, `npm run eval`, `npm run redteam`, `npm run seed`, `./deploy.sh`

## Build stages
1. Text-only vertical slice: customer page, /api/check, three Gemini steps, mocked payee data, deployed on Cloud Run
2. BigQuery payee risk, Firestore cases, ops console, multilingual output, screenshot and voice input
3. Evaluation harness, red-team script, evaluation page, UI polish
4. Freeze: README, clean-browser test, final deploy

Do only the stage you are asked to do. At the end of each stage, run the app, test it, summarise what works and what does not, and list anything you left out.
