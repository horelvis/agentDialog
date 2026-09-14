#!/usr/bin/env bash
# End-to-end smoke of the on-premise stack: build the onprem image, generate a
# fresh .env, bring up the whole stack, create an agent with the operator CLI
# and drive a real query through the API. Fails the run if any step cannot.
#
# Uses no fixed ports or volumes: SMOKE_PORT defaults to 3999, and everything
# is torn down (down -v) on exit, successful or not.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.onprem.yml"
TEMPLATE="$REPO_ROOT/.env.onprem.example"
PORT="${SMOKE_PORT:-3999}"
IMAGE="agentdialog:onprem-smoke"

SMOKE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/onprem-smoke-XXXXXX")"
trap 'docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$SMOKE_DIR"' EXIT

echo "[onprem-smoke] building the onprem image (slow step)..."
docker build --target onprem -t "$IMAGE" "$REPO_ROOT"

echo "[onprem-smoke] generating a fresh .env..."
cp "$TEMPLATE" "$SMOKE_DIR/.env.onprem.example"
(cd "$SMOKE_DIR" && bun run "$REPO_ROOT/scripts/admin.ts" init-env >/dev/null)

# The compose interpolates POSTGRES_PASSWORD and PORT from the shell; the app's
# env_file is the generated one, whose DATABASE_URL carries the same password.
export POSTGRES_PASSWORD
POSTGRES_PASSWORD="$(grep '^POSTGRES_PASSWORD=' "$SMOKE_DIR/.env" | cut -d= -f2)"
export PORT
export ONPREM_ENV_FILE="$SMOKE_DIR/.env"

echo "[onprem-smoke] starting the stack..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo "[onprem-smoke] waiting for /health..."
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "[onprem-smoke] healthy"
    break
  fi
  sleep 1
done
HEALTH="$(curl -fsS "http://localhost:$PORT/health" || true)"
if [ -z "${HEALTH:-}" ] || ! printf '%s' "$HEALTH" | grep -q '"status":"healthy"'; then
  echo "[onprem-smoke] FAILED: /health never went healthy"
  echo "[onprem-smoke] app logs:"
  docker compose -f "$COMPOSE_FILE" logs --no-color app || true
  exit 1
fi

APP_CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q app)"
if [ -z "$APP_CONTAINER" ]; then
  echo "[onprem-smoke] FAILED: no app container"
  exit 1
fi

echo "[onprem-smoke] creating an agent with the operator CLI..."
AGENT_OUT="$(docker exec "$APP_CONTAINER" bun run scripts/admin.ts create-agent --slug smoke-agent --name "Smoke Agent")"
API_KEY="$(printf '%s\n' "$AGENT_OUT" | grep -o 'mge_ag_[^[:space:]]*' | head -1)"
if [ -z "$API_KEY" ]; then
  echo "[onprem-smoke] FAILED: no API key from create-agent"
  printf '%s\n' "$AGENT_OUT"
  exit 1
fi
echo "[onprem-smoke] agent created"

echo "[onprem-smoke] driving a real query through the API..."
QUERY_RESPONSE="$(curl -fsS -X POST "http://localhost:$PORT/api/v1/agent/queries" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query_type": "validation",
    "risk": "medium",
    "subject": { "id": "p1", "label": "Payment 1", "uri": "https://payments.corp.example/p1" },
    "question": "Approve paying invoice #1042?",
    "answer_space": { "kind": "boolean", "labels": { "t": "Yes, pay", "f": "No, hold" }, "consequences": { "t": "The payment is released.", "f": "The invoice stays on hold." } },
    "target_human_email": "human@corp.example",
    "confidence": 0.8,
    "timeout_minutes": 60
  }')"
if ! printf '%s' "$QUERY_RESPONSE" | grep -q '"query_id"'; then
  echo "[onprem-smoke] FAILED: createQuery did not return a query_id"
  printf '%s\n' "$QUERY_RESPONSE"
  exit 1
fi

echo "[onprem-smoke] PASS — query created: $(printf '%s' "$QUERY_RESPONSE" | grep -o '"query_id":"[^"]*"')"
echo "[onprem-smoke] done"