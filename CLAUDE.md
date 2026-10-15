# Second Look: project guide for Claude Code

Read this file at the start of every session. It is the source of truth for what we are building.

## What this is
Second Look is a prototype for the Google Cloud AI Builder Cup 2026, theme BFSI (Intelligent Risk, Fraud & Financial Experiences). It reviews the conversation behind a payment (pasted chat, screenshot or voice note) together with the payee, and tells the customer to Proceed, Be careful or Hold before they send money to a scammer. Bank staff review held cases in an ops console. The AI never blocks money on its own; a human confirms every hold.

The builder is Nags, a data engineer who knows React, Node.js and BigQuery. Keep everything simple and readable. Do not introduce languages, frameworks or services that are not listed below. If you think something new is needed, ask first.

## Hard rules
1. This is a fresh project. Write all code and data from scratch. Never copy code, data or config from any employer or client.
2. All data is synthetic. No real personal data anywhere in the repo.
3. No secrets in the repo. On Cloud Run, authenticate with the service account (no keys). Locally, use `GEMINI_API_KEY` from `.env.local` when it is set (see Cost guardrails), otherwise Application Default Credentials (gcloud login). `.env.local` is git-ignored; `.env.example` lists variable names only.
4. Everything (code comments, docs, UI copy defaults, README) is in English. The UI can show Hindi, Tamil and Bahasa Indonesia output from the model.
5. The app must be built primarily on Google Cloud and use Gemini, and be deployed on Cloud Run.
6. Commit in small steps with clear messages. Push to the public GitHub repo often.

## Stack
- Next.js (App Router), JavaScript only (no TypeScript), plain CSS or CSS modules (no Tailwind, no UI library, no chart library)
- Node.js API routes inside Next.js
- Gemini via the Google Gen AI SDK for JavaScript (`@google/genai`): Vertex AI mode on Cloud Run and for final evaluation runs, the Gemini API with a free-tier key for local development. Check the official docs for current model IDs and SDK usage; do not guess from memory. Model ID comes from the `GEMINI_MODEL` env var.
- BigQuery (`@google-cloud/bigquery`) for the synthetic payee risk table
- Firestore (`@google-cloud/firestore`) for saved cases
- Cloud Run for hosting, deployed from a Dockerfile (Next.js standalone output)

## Environment variables (names only)
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `GEMINI_API_KEY` (local only), `DAILY_RUN_LIMIT`, `BQ_DATASET`, `FIRESTORE_COLLECTION`

## Cost guardrails
These rules apply to all code and to every stage. They override the earlier "no API key" rule for local development.

1. **Model:** use the cheapest Gemini model that gives acceptable results (Flash-class or lighter). Never use a Pro model without asking Nags. When proposing a model, state its ID and its price per million input and output tokens from Google's official pricing page. Current choice: `gemini-3.1-flash-lite` on the `global` endpoint, $0.25 input / $1.50 output per 1M tokens (Vertex AI Standard, checked 2026-10-15; regional endpoints cost 10% more).
2. **Per call:** every Gemini call sets `maxOutputTokens` (800 by default, lower where possible) and a low temperature. Truncate conversation text to 6,000 characters, resize images to 1024px at most on the longest side, and limit audio to 60 seconds. Limits live in `lib/limits.js`.
3. **Rate limits on `/api/check`:** at most `DAILY_RUN_LIMIT` (default 200) pipeline runs per day and 5 per minute per IP. When a limit is hit, return a friendly message and serve the saved example results for the three demo scenarios (`data/demo-results.json`) instead of calling Gemini. Stage 1 uses an in-memory counter; Stage 2 moves it to Firestore so the limit is global.
4. **Token logging:** log token usage (input, output, thinking, estimated cost) per request and keep a running total in the server log.
5. **Cloud Run flags:** `--max-instances 2 --min-instances 0 --concurrency 8 --timeout 60 --memory 512Mi --cpu 1`.
6. **Data services:** every BigQuery query sets a 100 MB maximum bytes billed. Every Firestore read has a limit.
7. **Evaluation scripts:** `scripts/eval.js` and `scripts/redteam.js` take `--limit N` (default 20), print a token estimate before running, ask for confirmation above 40 scenarios, and cache results so unchanged scenarios are not re-run.
8. **Local development:** use `GEMINI_API_KEY` from `.env.local` (free tier) when it is set. Use Vertex AI only on Cloud Run and for final evaluation runs (run those with `GEMINI_API_KEY` empty). Never set `GEMINI_API_KEY` on Cloud Run.

## Folder layout
```
app/page.js                  customer "Check before sending" page (server: passes payee ids and names only)
app/CheckForm.js             customer form, demo buttons, loading/error/limit states
app/components/VerdictCard.js  localised verdict card (customer page and ops case page)
app/ops/layout.js            ops shell with the "Demo console, synthetic data only" banner
app/ops/page.js              ops case queue
app/ops/[id]/page.js         case detail, decision buttons and case summary draft
app/ops/format.js            time and amount formatting for the ops pages
app/evaluation/page.js       evaluation results page (reads data/eval-results.json)
app/api/check/route.js       POST: run the pipeline, save the case, return the verdict
app/api/cases/route.js       GET: list cases
app/api/cases/[id]/route.js  GET one case, PATCH status (confirm hold / release)
app/api/cases/[id]/summary/route.js  POST: Gemini draft of a case summary (counts towards run limits)
app/api/health/route.js      GET: ok
lib/gemini.js                client setup, generateJson(prompt, schema, parts, options) with retry, usage logging
lib/usage.js                 token counts, cost estimate and running total
lib/limits.js                size limits and rate limits (cost guardrails)
lib/rateLimit.js             per-IP per-minute limit (memory) and global daily limit (Firestore)
lib/http.js                  readJsonBody with the 50 KB limit
lib/bigquery.js              payee lookup (100 MB max billed, 5 s timeout)
lib/firestore.js             cases, reviewer decisions, daily run counter
lib/labels.js                verdict card text in four languages; ops labels
lib/highlight.js             highlights quoted evidence in the conversation
lib/caseSummary.js           case summary prompt and call
lib/demoScenarios.js         the three demo conversations
lib/demoResults.js           saved demo results served when a limit is hit
lib/pipeline/mask.js         mask account/card numbers, phones, emails, OTP-like codes
lib/pipeline/evidenceReader.js
lib/pipeline/payeeRisk.js    BigQuery lookup with local fallback
lib/pipeline/patternMatcher.js
lib/pipeline/decide.js
lib/pipeline/runCheck.js     orchestrates the steps; independent steps run with Promise.all
data/typologies.json         12 scam types
data/payees-seed.json        300 synthetic payees (BigQuery seed and fallback)
data/demo-results.json       saved demo results (npm run save-demos)
data/scenarios.json          about 150 labelled scenarios
data/eval-results.json       written by scripts/eval.js
scripts/eval.js, scripts/redteam.js
scripts/seed-bigquery.js     npm run seed
scripts/generate-payees.js   regenerates data/payees-seed.json
scripts/save-demo-results.js npm run save-demos
scripts/mask-demo.js         npm run mask-demo
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
2. BigQuery payee risk, Firestore cases, ops console, multilingual output
3. Evaluation harness and evaluation page, screenshot input, red-team script, UI polish; voice note input only if time allows
4. Freeze: README, clean-browser test, final deploy

Do only the stage you are asked to do. At the end of each stage, run the app, test it, summarise what works and what does not, and list anything you left out.
