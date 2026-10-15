#!/usr/bin/env bash
# Deploys Second Look to Cloud Run from the Dockerfile (built by Cloud Build).
# Usage: GOOGLE_CLOUD_PROJECT=my-project ./deploy.sh
# Optional: REGION (Cloud Run region), GOOGLE_CLOUD_LOCATION (Gemini location), GEMINI_MODEL, SERVICE.
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT to your Google Cloud project id}"
REGION="${REGION:-asia-south1}"
GEMINI_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"
MODEL="${GEMINI_MODEL:-gemini-3.5-flash}"
SERVICE="${SERVICE:-second-look}"
SA_NAME="second-look-run"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

echo "Project: $PROJECT | Region: $REGION | Model: $MODEL ($GEMINI_LOCATION)"

echo "Enabling required APIs..."
gcloud services enable run.googleapis.com aiplatform.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT"

# Runtime service account: the app authenticates to Vertex AI as this account (no keys).
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Creating service account $SA_EMAIL..."
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
    --display-name "Second Look Cloud Run runtime"
fi

echo "Granting Vertex AI access to the service account..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${SA_EMAIL}" --role roles/aiplatform.user \
  --condition None --quiet >/dev/null

echo "Building and deploying..."
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 60 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${GEMINI_LOCATION},GEMINI_MODEL=${MODEL}"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
echo "Deployed: $URL"
echo "Health check: curl $URL/api/health"
