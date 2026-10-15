# Second Look

Second Look checks the conversation behind a payment before a customer sends money. The customer pastes the chat that asked them to pay and enters the payee and amount. Gemini reviews it with the payee's risk signals and returns **Proceed**, **Be careful** or **Hold**. Each reason quotes the evidence it is based on, and the explanation can be in English, Hindi, Tamil or Bahasa Indonesia.

The AI never blocks money on its own. A Hold is advice, and bank staff confirm every hold. The ops console for staff is added in Stage 2.

Built for the Google Cloud AI Builder Cup 2026 (BFSI theme). All data in this repo is synthetic.

## Status

Stage 1, the text-only vertical slice:

- Customer page with three one-click demo scenarios
- `POST /api/check` runs the pipeline and returns the decision with step timings
- Payee data comes from a local file of 10 invented payees (`data/payees.json`)

BigQuery, Firestore, the ops console, screenshots and voice notes come in Stage 2.

## Architecture

```
Browser (app/page.js)
   │  POST /api/check { payeeId, amount, conversation, language }
   ▼
Next.js API route (Cloud Run)
   └─ lib/pipeline/runCheck.js
        1. mask.js           hide account/card numbers, phones, emails, UPI ids, OTPs
        2. in parallel:
           ├─ evidenceReader.js  Gemini: claims, urgency, payment instructions, quoted red flags
           ├─ payeeRisk.js       payee age, prior reports, flags → low / medium / high
           └─ patternMatcher.js  Gemini: match against 12 scam types (data/typologies.json)
        3. decide.js         Gemini: verdict, score, reasons with evidence, next steps, explanation
```

- Every Gemini call uses structured JSON output with a schema (`lib/gemini.js`). Results are validated, a malformed response is retried once, and each call times out after 25 s.
- Conversation text is masked before it is sent to Gemini.
- Decision guardrails: quotes are checked against the conversation (`quote_verified`), and a payee rated high risk never gets **Proceed**.
- Each step's duration and the token usage are logged as one JSON line (`check_complete`) and returned as `timings_ms` and `tokens`.

**Model:** `gemini-3.1-flash-lite`, the cheapest Gemini model that passed our test scenarios. It costs $0.25 per 1M input tokens and $1.50 per 1M output tokens (Vertex AI Standard, `global` endpoint), about $0.002 per check. The model is set by the `GEMINI_MODEL` env var. The SDK is the Google Gen AI SDK (`@google/genai`): Vertex AI mode (`enterprise: true`) on Cloud Run, and the Gemini API with a free-tier key for local development.

## Cost guardrails

Full rules are in `CLAUDE.md`. In short:

- Each Gemini call has an output token cap (400 to 800) and temperature 0.1, with minimal thinking.
- Conversations are truncated to 6,000 characters (`lib/limits.js`).
- `/api/check` allows `DAILY_RUN_LIMIT` runs per day (default 200) and 5 per minute per IP. Over a limit it serves saved demo results (`data/demo-results.json`) and does not call Gemini. The counter is in memory per instance for now.
- Every check logs its token usage, estimated cost and the server's running total (`check_complete` log line).
- Cloud Run runs with at most 2 instances, scales to zero and has a 60 s timeout.

## Run locally

Prerequisites: Node.js 20 or newer.

```bash
cp .env.example .env.local
```

For everyday development, use a free-tier Gemini API key from Google AI Studio. Put it in `.env.local` (never commit it):

```
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=your-free-tier-key
DAILY_RUN_LIMIT=200
```

Free-tier requests may be used by Google to improve its products, which is fine here because all data is synthetic.

To use Vertex AI locally instead (for example for final evaluation runs), leave `GEMINI_API_KEY` empty and set:

```
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
GOOGLE_CLOUD_LOCATION=global
```

Then log in once with Application Default Credentials:

```bash
gcloud auth application-default login
```

(`BQ_DATASET` and `FIRESTORE_COLLECTION` are not used until Stage 2.)

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000, click a demo button, then click **Check before sending**.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build (standalone output) |
| `npm start` | Serve the production build locally |
| `npm run mask-demo` | Show masking before and after on sample strings |
| `npm run save-demos` | Re-run the three demos (3 Gemini runs) and save the results that are served when a limit is hit |

## Deploy to Cloud Run

`deploy.sh` enables the required APIs and creates a runtime service account (`second-look-run`) with the Vertex AI User role. It then builds the Dockerfile with Cloud Build, deploys to Cloud Run in `asia-south1` with public access and the cost flags (`--max-instances 2 --min-instances 0 --concurrency 8 --timeout 60 --memory 512Mi --cpu 1`), and sets the env vars. `GEMINI_API_KEY` is never set on Cloud Run, and the code ignores it there.

```bash
gcloud auth login
```

```bash
gcloud config set project YOUR_PROJECT_ID
```

```bash
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID ./deploy.sh
```

Optional overrides: `REGION` (default `asia-south1`), `GOOGLE_CLOUD_LOCATION` (default `global`), `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), `DAILY_RUN_LIMIT` (default `200`), `SERVICE` (default `second-look`).

The script prints the service URL. Check that the service is up:

```bash
curl https://YOUR-SERVICE-URL/api/health
```

If the build step fails with a permissions error, the Cloud Build service account may need the `roles/run.builder` role. The gcloud error message names the account.

## API

`POST /api/check`

```json
{ "payeeId": "PAYEE-1004", "amount": 95000, "conversation": "…", "language": "en" }
```

Returns `{ decision, evidence, payee, patterns, masked_counts, truncated, timings_ms, tokens }`, where `decision` is:

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

Errors return `{ error, step, retryable }`: 400 for bad input, 502 when Gemini fails, 500 otherwise.

When a rate limit is hit, a demo conversation gets its saved result with `saved_example: true` and a `notice`. Any other conversation gets 429 `{ error, limited, examples }`.

`GET /api/health` returns `{ "status": "ok" }`.

## Evaluation

The evaluation harness (`npm run eval`) and red-team script (`npm run redteam`) are added in Stage 3.
