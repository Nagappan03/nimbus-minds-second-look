# Second Look

Second Look checks the conversation behind a payment before a customer sends money. The customer pastes the chat that asked them to pay, or uploads a screenshot of it, and enters the payee, amount and currency. Gemini reviews it with the payee's risk signals and returns **Proceed**, **Be careful** or **Hold**. Each reason quotes the evidence it is based on, and the result can be shown in English, Hindi, Tamil or Bahasa Indonesia.

The AI never blocks money on its own. A Hold is advice: every check is saved as a case, and bank staff confirm or release each hold in the ops console.

Built for the Google Cloud AI Builder Cup 2026 (BFSI theme). All data in this repo is synthetic.

## Status

Stage 2 is done:

- Customer page (`/`) with three one-click demo scenarios and a fully localised verdict card
- Payee risk from BigQuery (300 synthetic payees), with a local fallback if BigQuery fails
- Every check saved as a Firestore case (masked text only)
- Ops console (`/ops`) to review cases, confirm holds or release them, and draft a case summary
- Global daily run limit kept in Firestore

Stage 3 so far:

- Evaluation harness (`npm run eval`) and evaluation page (`/evaluation`); the full run is still to do
- Screenshot input: upload a chat screenshot (or try one of three synthetic samples); Gemini transcribes it and the transcript goes through the same pipeline
- Currency (INR, IDR, SGD, USD) on every check, case and evaluation scenario

Still to do: the full evaluation run, the red-team script and UI polish (voice notes only if time allows).

## Architecture

```
Customer page (/)                       Ops console (/ops, /ops/[id])
   │ POST /api/check                       │ GET /api/cases, GET/PATCH /api/cases/[id]
   ▼                                       │ POST /api/cases/[id]/summary (optional AI draft)
Next.js API routes on Cloud Run ◄──────────┘
   ├─ rate limits: 5/min per IP (memory), DAILY_RUN_LIMIT/day (Firestore counter)
   ├─ lib/pipeline/runCheck.js
   │    0. transcribe.js     (screenshots only) Gemini reads the chat image into "Speaker: text" lines
   │    1. mask.js           hide account/card numbers, phones, emails, UPI ids, OTPs
   │    2. in parallel:
   │       ├─ evidenceReader.js  Gemini: claims, urgency, payment instructions, quoted red flags
   │       ├─ payeeRisk.js       BigQuery payees table (fallback: data/payees-seed.json)
   │       └─ patternMatcher.js  Gemini: match against 12 scam types (data/typologies.json)
   │    3. decide.js         Gemini: verdict, score, reasons with evidence, next steps, explanation
   └─ lib/firestore.js       save the case: masked text, verdict, signals, timings, status
```

- Every Gemini call uses structured JSON output with a schema (`lib/gemini.js`). Results are validated, a malformed response is retried once, and each call times out after 25 s.
- Conversation text is masked before it reaches Gemini or Firestore. The raw text is never stored.
- **Screenshots are processed in memory and never stored.** The browser shrinks the image to at most 1024 px and re-encodes it as JPEG before sending. The server sends it to Gemini for transcription only. The image and the unmasked transcript are never written to Firestore or the logs; the case keeps only the masked transcript, tagged `source: screenshot`. If the image does not show a conversation, the customer is told so and the rest of the pipeline does not run.
- Decision guardrails: quotes are checked against the conversation (`quote_verified`), and a payee rated high risk never gets **Proceed**.
- Payee risk signals stay on the server. The customer page only receives payee ids and display names.
- Case status: `pending_review` for Hold and Be careful, `no_action` for Proceed. A reviewer moves `pending_review` to `hold_confirmed` or `released`; any other change is rejected.
- Each step's duration and the token usage are logged as one JSON line (`check_complete`).

**Model:** `gemini-3.1-flash-lite`, the cheapest Gemini model that passed our test scenarios. It costs $0.25 per 1M input tokens and $1.50 per 1M output tokens (Vertex AI Standard, `global` endpoint). A text check makes 3 Gemini calls and costs about $0.0013–0.0024; a screenshot check adds a transcription call (about 1,500 input tokens for the image) and costs about $0.002–0.0032 in our tests. Budget $0.003–0.005 per check to be safe. The model is set by the `GEMINI_MODEL` env var. The SDK is the Google Gen AI SDK (`@google/genai`): Vertex AI mode (`enterprise: true`) on Cloud Run, and the Gemini API with a free-tier key for local development.

## Cost guardrails

Full rules are in `CLAUDE.md`. In short:

- Each Gemini call has an output token cap (400 to 800), temperature 0.1 and minimal thinking.
- Conversations are truncated to 6,000 characters (`lib/limits.js`). Request bodies over 50 KB get a 413, or over 700 KB when a screenshot is attached.
- Screenshots: one image, PNG, JPEG or WebP, at most 8 MB before processing; downscaled in the browser to 1024 px on the longest side. A screenshot check counts as one run against the limits, including when no conversation could be read.
- `/api/check` and the case summary share a global limit of `DAILY_RUN_LIMIT` runs per day (default 200), counted in one Firestore document per day, and 5 per minute per IP. Over the limit, Gemini is not called and the saved demo results (`data/demo-results.json`) are served instead.
- Every Gemini request logs its token usage, estimated cost and the server's running total.
- BigQuery queries are capped at 100 MB billed and 5 s. Firestore reads are limited (one document, or at most 50 cases).
- Cloud Run runs with at most 2 instances, scales to zero and has a 60 s timeout.

## Data

| File | What it is |
| --- | --- |
| `data/payees-seed.json` | 300 synthetic payees (208 low, 59 medium, 33 high risk), generated by `scripts/generate-payees.js`. High-risk payees follow mule patterns: a very new account, many inbound senders, high pass-through and prior reports. Display names are neutral at every risk level. |
| `data/typologies.json` | 12 scam types with signals and the question a customer should ask |
| `data/demo-results.json` | Saved results for the three demos, served when a limit is hit |
| `data/scenarios.json` | Labelled evaluation scenarios written by the builders (the count used is recorded in `data/eval-results.json` as `scenarioCount`) |
| `public/samples/*.png` | Three synthetic chat screenshots of the demos (rent, officer, investment), made with `npm run make-samples` |

## Google Cloud setup (once per project)

You need a project with billing enabled. These commands use `nimbus-minds-second-look`; replace it with your project id.

```bash
gcloud config set project nimbus-minds-second-look
```

Create the Firestore database (Native mode, `asia-south1`; the location cannot be changed later):

```bash
gcloud firestore databases create --database="(default)" --location=asia-south1 --type=firestore-native
```

Create the index the ops console needs to filter cases by status:

```bash
gcloud firestore indexes composite create --database="(default)" --collection-group=cases --query-scope=collection --field-config=field-path=status,order=ascending --field-config=field-path=createdAt,order=descending
```

Load the payees into BigQuery (creates dataset `BQ_DATASET` in `asia-south1`; re-running replaces the table):

```bash
npm run seed
```

The Cloud Run service account needs these roles. `deploy.sh` grants them, retrying while a new account propagates:

| Role | Why |
| --- | --- |
| `roles/aiplatform.user` | Call Gemini on Vertex AI |
| `roles/datastore.user` | Read and write Firestore cases and the run counter |
| `roles/bigquery.dataViewer` | Read the payees table |
| `roles/bigquery.jobUser` | Run the payee lookup query |

To grant one by hand:

```bash
gcloud projects add-iam-policy-binding nimbus-minds-second-look --member=serviceAccount:second-look-run@nimbus-minds-second-look.iam.gserviceaccount.com --role=roles/datastore.user --condition=None
```

## Run locally

Prerequisites: Node.js 20 or newer and the gcloud CLI.

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
GOOGLE_CLOUD_PROJECT=nimbus-minds-second-look
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=your-free-tier-key
DAILY_RUN_LIMIT=200
BQ_DATASET=second_look
FIRESTORE_COLLECTION=cases
```

With `GEMINI_API_KEY` set (a free-tier key from Google AI Studio), local runs call the Gemini API. Leave it empty to use Vertex AI, for example for final evaluation runs. Free-tier requests may be used by Google to improve its products, which is fine here because all data is synthetic. Never commit the key.

BigQuery and Firestore always use Application Default Credentials, so log in once:

```bash
gcloud auth application-default login
```

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000, click a demo button, then click **Check before sending**. Open http://localhost:3000/ops (or the **Bank staff view** link) to review the case.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build (standalone output) |
| `npm start` | Serve the production build locally |
| `npm run seed` | Load `data/payees-seed.json` into BigQuery |
| `npm run mask-demo` | Show masking before and after on sample strings |
| `npm run save-demos` | Re-run the three demos (3 Gemini runs) and save the results served when a limit is hit |
| `npm run make-samples` | Render the three sample screenshots with headless Chrome (set `CHROME_PATH` if Chrome is elsewhere) |
| `npm run eval` | Run the evaluation scenarios (see Evaluation) |

## Deploy to Cloud Run

Do the Google Cloud setup above first. `deploy.sh` enables the required APIs, creates the runtime service account (`second-look-run`), grants its roles, builds the Dockerfile with Cloud Build and deploys to Cloud Run in `asia-south1`. It deploys with public access, the cost flags (`--max-instances 2 --min-instances 0 --concurrency 8 --timeout 60 --memory 512Mi --cpu 1`) and the env vars. `GEMINI_API_KEY` is never set on Cloud Run, and the code ignores it there.

```bash
gcloud auth login
```

```bash
GOOGLE_CLOUD_PROJECT=nimbus-minds-second-look ./deploy.sh
```

Optional overrides: `REGION` (default `asia-south1`), `GOOGLE_CLOUD_LOCATION` (default `global`), `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), `DAILY_RUN_LIMIT` (default `200`), `BQ_DATASET` (default `second_look`), `FIRESTORE_COLLECTION` (default `cases`), `SERVICE` (default `second-look`).

Check that the service is up:

```bash
curl https://YOUR-SERVICE-URL/api/health
```

If the build step fails with a permissions error, the Cloud Build service account may need the `roles/run.builder` role. The gcloud error message names the account.

The per-IP limit uses the last `X-Forwarded-For` entry, which Google's front end appends; earlier entries can be forged by the caller. To confirm this on the deployed service, run the command below. It sends six checks with different forged addresses, and the sixth should be refused. It uses five Gemini runs, about $0.01.

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -H "X-Forwarded-For: 10.0.0.$i" -H "Content-Type: application/json" -d '{"payeeId":"PAYEE-1003","amount":100,"conversation":"Arjun: sending back the 100 I owe you","language":"en"}' https://YOUR-SERVICE-URL/api/check; done
```

The output should end with `429`.

## API

`POST /api/check`

```json
{ "payeeId": "PAYEE-1004", "amount": 95000, "currency": "INR", "conversation": "…", "language": "en" }
```

or, with a screenshot instead of text (base64 PNG, JPEG or WebP):

```json
{ "payeeId": "PAYEE-1004", "amount": 95000, "currency": "INR", "language": "en", "image": { "mimeType": "image/jpeg", "data": "…" } }
```

Returns `{ case_id, decision, payee: { payee_id, display_name }, source, transcript, truncated, timings_ms, tokens }`, where `transcript` is the masked text read from a screenshot (null for pasted text) and `decision` is:

```json
{
  "verdict": "PROCEED | BE_CAREFUL | HOLD",
  "score": 0,
  "reasons": [{ "text": "…", "evidence_quote": "…", "source": "conversation | payee", "quote_verified": true }],
  "next_steps": ["…"],
  "explanation_language": "en",
  "explanation": "…"
}
```

Errors return `{ error, step, retryable }`: 400 for bad input, 413 for bodies over 50 KB (700 KB with a screenshot), 415 for an unsupported image type, 422 when no conversation could be read from a screenshot, 502 when Gemini fails, 500 otherwise. If saving the case fails, the verdict is still returned with `case_id: null`.

When a rate limit is hit, a demo conversation gets its saved result with `saved_example: true` and a `notice`. Any other conversation gets 429 `{ error, limited, examples }`.

`GET /api/cases?status=pending_review|no_action|hold_confirmed|released|decided` returns `{ cases }`: newest first, at most 50.

`GET /api/cases/[id]` returns `{ case }`.

`PATCH /api/cases/[id]` with `{ "decision": "confirm_hold" | "release", "note": "…" }` moves a `pending_review` case to `hold_confirmed` or `released`. It records reviewer `demo-analyst` and the time. Other transitions return 409.

`POST /api/cases/[id]/summary` returns `{ summary, tokens }`: an AI draft of at most 200 words. It is not saved and counts towards the run limit.

`GET /api/health` returns `{ "status": "ok" }`.

## Evaluation

`npm run eval` runs the labelled scenarios in `data/scenarios.json` through the same pipeline as the app (`runCheck`, including the BigQuery payee lookup), without saving cases or touching the daily counter, and writes `data/eval-results.json`. The `/evaluation` page shows those results.

Flags: `--limit N` (default 10), `--tag red_team`, `--concurrency N` (default 2, max 3), `--yes` (skip the confirmation asked above 40 uncached scenarios), `--fresh` (ignore the cache), `--file path` and `--dry-run` (print the plan and cost estimate only). Results are cached per scenario in `data/eval-cache.json` (git-ignored) and are re-run only when the scenario, model, payee or prompt files change.

```bash
npm run eval -- --limit 5 --dry-run
```

How to read the results: the synthetic scenarios (count in `data/eval-results.json`, shown on `/evaluation`) were written by the builders, so results show agreement with our own labels, not independent validation. Single model. No real customer data.

The red-team script (`npm run redteam`) is still to do.
