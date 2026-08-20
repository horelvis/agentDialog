#!/bin/bash
# ============================================
# Cleanup Google Cloud secrets for AgentDialog
# Deletes all secrets created for Cloud Run
# Usage: ./scripts/cleanup-secrets.sh
# ============================================
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-agentdialog}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-agentdialog-api}"

echo "==> Project: ${PROJECT_ID}"
echo "==> Service: ${SERVICE_NAME} (${REGION})"
echo ""

# 1. List all secrets in the project
echo "==> Secrets in project:"
gcloud secrets list --project="${PROJECT_ID}" --format="table(name,createTime)" 2>/dev/null || echo "  (none found or no access)"
echo ""

# 2. Remove secret references from Cloud Run service
echo "==> Removing secret references from Cloud Run..."
gcloud run services update "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --clear-secrets \
  2>/dev/null && echo "  Done." || echo "  No secrets to clear or failed."
echo ""

# 3. Delete known secrets
SECRETS=(
  "smtp-password"
  "database-url"
  "redis-url"
  "session-secret"
)

echo "==> Deleting secrets..."
for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "${secret}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "  Deleting: ${secret}"
    gcloud secrets delete "${secret}" --project="${PROJECT_ID}" --quiet
  else
    echo "  Skip (not found): ${secret}"
  fi
done

echo ""
echo "==> Done! Now set env vars in Cloud Run:"
echo ""
echo "  gcloud run services update ${SERVICE_NAME} \\"
echo "    --region=${REGION} \\"
echo "    --update-env-vars=\"\\"
echo "DATABASE_URL=postgresql://...,\\"
echo "REDIS_URL=redis://...,\\"
echo "SESSION_SECRET=...,\\"
echo "NODE_ENV=production,\\"
echo "APP_URL=https://agentdialog.io,\\"
echo "APP_NAME=AgentDialog,\\"
echo "CORS_ORIGINS=https://agentdialog.io,\\"
echo "SMTP_HOST=smtp.gmail.com,\\"
echo "SMTP_PORT=465,\\"
echo "SMTP_SECURE=true,\\"
echo "SMTP_USER=TU_CUENTA_SMTP,\\"
echo "SMTP_FROM=TU_CUENTA_SMTP,\\"
echo "SMTP_PASS=TU_APP_PASSWORD\""
