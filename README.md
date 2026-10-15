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
- Each step's duration is logged as one JSON line (`check_complete`) and returned as `timings_ms`.

**Model:** `gemini-3.5-flash` on Vertex AI, called through the Google Gen AI SDK (`@google/genai`) in Vertex mode (`enterprise: true`) in `asia-south1`, the same region as the Cloud Run service. (The model is not offered in `us-central1`, and the `global` endpoint was slow and unreliable during testing.) The model is set by the `GEMINI_MODEL` env var.

## Run locally

Prerequisites: Node.js 20 or newer, the gcloud CLI, and a Google Cloud project with the Vertex AI API enabled.

```bash
gcloud auth application-default login
```

```bash
gcloud services enable aiplatform.googleapis.com --project YOUR_PROJECT_ID
```

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
GOOGLE_CLOUD_LOCATION=asia-south1
GEMINI_MODEL=gemini-3.5-flash
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

## Deploy to Cloud Run

`deploy.sh` enables the required APIs and creates a runtime service account (`second-look-run`) with the Vertex AI User role. It then builds the Dockerfile with Cloud Build, deploys to Cloud Run (`asia-south1`, at most 3 instances) with public access and sets the env vars.

```bash
gcloud auth login
```

```bash
gcloud config set project YOUR_PROJECT_ID
```

```bash
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID ./deploy.sh
```

Optional overrides: `REGION` (default `asia-south1`), `GOOGLE_CLOUD_LOCATION` (default `asia-south1`), `GEMINI_MODEL` (default `gemini-3.5-flash`), `SERVICE` (default `second-look`).

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

Returns `{ decision, evidence, payee, patterns, masked_counts, timings_ms }`, where `decision` is:

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

`GET /api/health` returns `{ "status": "ok" }`.

## Evaluation

The evaluation harness (`npm run eval`) and red-team script (`npm run redteam`) are added in Stage 3.
