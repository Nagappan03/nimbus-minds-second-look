#!/usr/bin/env bash
# Deploys Second Look to Cloud Run from the Dockerfile (built by Cloud Build).
# Usage: GOOGLE_CLOUD_PROJECT=my-project ./deploy.sh
# Optional: REGION (Cloud Run region), GOOGLE_CLOUD_LOCATION (Gemini location), GEMINI_MODEL,
# DAILY_RUN_LIMIT, BQ_DATASET, FIRESTORE_COLLECTION, SERVICE.
# Before the first deploy: create the Firestore database and seed BigQuery (see README).
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT to your Google Cloud project id}"
REGION="${REGION:-asia-south1}"
GEMINI_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"
MODEL="${GEMINI_MODEL:-gemini-3.1-flash-lite}"
DAILY_LIMIT="${DAILY_RUN_LIMIT:-200}"
DATASET="${BQ_DATASET:-second_look}"
COLLECTION="${FIRESTORE_COLLECTION:-cases}"
SERVICE="${SERVICE:-second-look}"
SA_NAME="second-look-run"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

echo "Project: $PROJECT | Region: $REGION | Model: $MODEL ($GEMINI_LOCATION)"

echo "Enabling required APIs..."
gcloud services enable run.googleapis.com aiplatform.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  bigquery.googleapis.com firestore.googleapis.com --project "$PROJECT"

# Runtime service account: the app authenticates to Vertex AI as this account (no keys).
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Creating service account $SA_EMAIL..."
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
    --display-name "Second Look Cloud Run runtime"
fi

# A new service account can take a few seconds to become usable, so a grant
# may fail with "does not exist". Retry up to 5 times, 10 seconds apart.
grant_role() {
  local role="$1"
  for attempt in 1 2 3 4 5; do
    if gcloud projects add-iam-policy-binding "$PROJECT" \
      --member "serviceAccount:${SA_EMAIL}" --role "$role" \
      --condition None --quiet >/dev/null 2>&1; then
      echo "  granted $role"
      return 0
    fi
    if [ "$attempt" -lt 5 ]; then
      echo "  $role not granted yet (attempt $attempt of 5), waiting 10 s for the service account..."
      sleep 10
    fi
  done
  echo "Could not grant $role to $SA_EMAIL after 5 attempts." >&2
  return 1
}

echo "Granting roles to the service account..."
grant_role roles/aiplatform.user     # Gemini on Vertex AI
grant_role roles/datastore.user      # Firestore cases and the daily run counter
grant_role roles/bigquery.dataViewer # read the payees table
grant_role roles/bigquery.jobUser    # run the payee lookup query

echo "Building and deploying..."
# Cost guardrails (CLAUDE.md): small, scale-to-zero service. GEMINI_API_KEY is never set here;
# Cloud Run always uses Vertex AI through the service account.
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --max-instances 2 \
  --min-instances 0 \
  --concurrency 8 \
  --timeout 60 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${GEMINI_LOCATION},GEMINI_MODEL=${MODEL},DAILY_RUN_LIMIT=${DAILY_LIMIT},BQ_DATASET=${DATASET},FIRESTORE_COLLECTION=${COLLECTION}"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
echo "Deployed: $URL"
echo "Health check: curl $URL/api/health"
