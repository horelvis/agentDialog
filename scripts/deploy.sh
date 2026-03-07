#!/bin/bash
# ============================================
# Manual deploy to Google Cloud Run
# Usage: ./scripts/deploy.sh
# ============================================
set -euo pipefail

# Configuration - edit these
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-agentdialog-api}"
REPO="agentdialog"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_NAME}"

echo "==> Deploying ${SERVICE_NAME} to Cloud Run (${REGION})"
echo "    Project: ${PROJECT_ID}"
echo "    Image:   ${IMAGE}:latest"
echo ""

# 1. Create Artifact Registry repo (first time only, idempotent)
gcloud artifacts repositories describe "${REPO}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" &>/dev/null || \
gcloud artifacts repositories create "${REPO}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --repository-format=docker \
  --description="AgentDialog container images"

# 2. Configure Docker auth for Artifact Registry
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# 3. Build image
echo "==> Building Docker image..."
docker build -f Dockerfile.cloudrun -t "${IMAGE}:latest" .

# 4. Push image
echo "==> Pushing to Artifact Registry..."
docker push "${IMAGE}:latest"

# 5. Deploy to Cloud Run
echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}:latest" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --concurrency=80 \
  --session-affinity

# 6. Get the URL
URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="value(status.url)")

echo ""
echo "==> Deployed successfully!"
echo "    URL: ${URL}"
echo ""
echo "Next steps:"
echo "  1. Set env vars:  gcloud run services update ${SERVICE_NAME} --region=${REGION} --set-env-vars=\"KEY=VALUE\""
echo "  2. Map domain:    gcloud run domain-mappings create --service=${SERVICE_NAME} --domain=api.agentdialog.io --region=${REGION}"
