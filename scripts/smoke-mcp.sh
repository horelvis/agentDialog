#!/usr/bin/env bash
#
# Exercise MCP against a deployed service, the way a client does.
#
# /health says the database and Redis answer. It does not say an agent can use
# the product. Between v0.7.0 and v0.8.3 every MCP tool replied
# "Authentication required" while /health reported healthy for four days, and
# nothing noticed until somebody called a tool by hand. This is that call, run
# on every deploy.
#
# Usage:  MCP_SMOKE_API_KEY=mge_ag_... bash scripts/smoke-mcp.sh [base-url]
set -euo pipefail

BASE="${1:-https://api.agentdialog.io}"
MCP="${BASE}/mcp"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

if [ -z "${MCP_SMOKE_API_KEY:-}" ]; then
  cat >&2 <<'MSG'
MCP_SMOKE_API_KEY is not set.

This check needs a real agent key, because without one the server answers 401
before any of the code paths worth testing run — which is what it did while MCP
was broken, so an unauthenticated check would have reported success throughout.

One-time setup: register a dedicated agent (slug `ci-smoke`) against the
deployed API and store its `mge_ag_...` key as the MCP_SMOKE_API_KEY secret.
There is no endpoint to delete an agent, so register one and reuse it rather
than creating one per deploy.
MSG
  exit 1
fi

# Prints the JSON-RPC payload of a response body, which arrives either as plain
# JSON or as an SSE frame.
rpc_body() {
  if grep -q '^data: ' "$1"; then
    sed -n 's/^data: //p' "$1" | head -1
  else
    cat "$1"
  fi
}

post() {
  local payload="$1" session="${2:-}" out="$3"
  local -a args=(
    -sS -X POST "${MCP}"
    -D "${WORK}/headers"
    -o "${out}"
    -w '%{http_code}'
    -H "Content-Type: application/json"
    -H "Accept: application/json, text/event-stream"
    -H "Authorization: Bearer ${MCP_SMOKE_API_KEY}"
    --max-time 30
  )
  [ -n "${session}" ] && args+=(-H "mcp-session-id: ${session}")
  curl "${args[@]}" --data "${payload}"
}

fail() {
  echo "SMOKE FAILED: $*" >&2
  exit 1
}

echo "== MCP smoke test against ${BASE}"

# 1. initialize --------------------------------------------------------------
code=$(post '{
  "jsonrpc":"2.0","id":1,"method":"initialize",
  "params":{"protocolVersion":"2025-06-18","capabilities":{},
            "clientInfo":{"name":"ci-smoke","version":"1.0.0"}}
}' "" "${WORK}/init")
[ "${code}" = "200" ] || fail "initialize returned ${code}, expected 200: $(rpc_body "${WORK}/init")"

SESSION=$(grep -i '^mcp-session-id:' "${WORK}/headers" | tr -d '\r' | awk '{print $2}')
[ -n "${SESSION}" ] || fail "initialize returned no mcp-session-id header"
echo "   initialize ok, session ${SESSION}"

# 2. initialized notification ------------------------------------------------
post '{"jsonrpc":"2.0","method":"notifications/initialized"}' "${SESSION}" "${WORK}/notif" >/dev/null

# 3. a real tool call --------------------------------------------------------
# This is the assertion that matters. It fails if the tool cannot see its
# caller, which is exactly how the v0.7.0 fault presented.
code=$(post '{
  "jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{"name":"list_queries","arguments":{"limit":1}}
}' "${SESSION}" "${WORK}/call")
[ "${code}" = "200" ] || fail "tools/call returned ${code}, expected 200: $(rpc_body "${WORK}/call")"

BODY=$(rpc_body "${WORK}/call")
# A tool's payload is JSON encoded inside the result's text field, so the keys
# arrive escaped as \"queries\". Unescape before matching, or the check reads
# a perfectly good answer as a failure.
BODY=$(printf '%s' "${BODY}" | sed 's/\\"/"/g')
case "${BODY}" in
  *"Authentication required"*)
    fail "the tool ran without its caller's identity: ${BODY}" ;;
  *'"queries"'*)
    echo "   tools/call ok, the tool saw its caller" ;;
  *)
    fail "tools/call returned no query list: ${BODY}" ;;
esac

# 4. a session the server does not know --------------------------------------
# Must be 404, which is what makes a client open a new session. A 400 leaves it
# stuck until somebody reconnects it by hand, and every deploy invalidates every
# session, so this is the difference between a deploy being invisible and a
# deploy taking every client down.
code=$(post '{
  "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"list_queries","arguments":{"limit":1}}
}' "00000000-0000-4000-8000-000000000000" "${WORK}/stale")
[ "${code}" = "404" ] || fail "an unknown session returned ${code}, expected 404: $(rpc_body "${WORK}/stale")"
echo "   unknown session answered 404, clients can recover"

echo "== MCP smoke test passed"
