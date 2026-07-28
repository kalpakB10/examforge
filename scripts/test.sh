#!/usr/bin/env bash
# Run the full ExamForge test suite against a live stack.
#
# What it does:
#   1. Unit tests (fast, no infra): question-bank/src/**/*.test.ts
#   2. Wait for docker compose stack to be /ready
#   3. Integration tests: tests/integration/**/*.test.ts (hits the gateway)
#   4. E2E tests: tests/e2e/**/*.spec.ts (Playwright against the frontend)
#
# Exit code: non-zero on ANY failure.
#
# Assumes:
#   - Docker compose stack is already up (`docker compose up -d`)
#   - Test deps are installed (`cd tests && npm install`)
#   - Seed teacher account exists (teacher@test.com / password123) OR
#     E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD are set
#
# For a clean-slate test run in CI, see .github/workflows/ci.yml.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY="${GATEWAY_URL:-http://localhost:3000}"

echo "════════════════════════════════════════════════════════"
echo "  ExamForge test suite"
echo "  Repo:    $REPO"
echo "  Gateway: $GATEWAY"
echo "════════════════════════════════════════════════════════"

# ─── Step 1: Unit tests (per-service) ────────────────────────────────────────
echo
echo "▶ Step 1/3: unit tests"

# Run in the question-bank container where vitest is installed as devDep.
# (No need to spin up a fresh node just for this; the container has everything.)
if docker ps --format '{{.Names}}' | grep -q '^mcq_question_bank$'; then
  # Vitest is pulled in by the tests/ workspace; use the container's tsx if present,
  # otherwise npx-run against the tests package.
  docker exec mcq_question_bank sh -c "
    cd /app && \
    if [ ! -x node_modules/.bin/vitest ]; then \
      npm install --no-save --no-audit --no-fund vitest >/dev/null 2>&1; \
    fi && \
    node node_modules/vitest/dist/cli.js run
  "
else
  echo "  ⚠ mcq_question_bank container not running — skipping unit tests"
fi

# ─── Step 2: Reset the api-gateway so rate-limit counters are fresh ─────────
# The ownership integration tests register 2 teachers per run; if the test
# suite has run recently, the 5-per-10-min register limit will kick in.
# Restarting the gateway (in-memory rate-limit store) resets the counters.
echo
echo "▶ resetting api-gateway (clears rate-limit counters)"
if docker ps --format '{{.Names}}' | grep -q '^mcq_api_gateway$'; then
  docker restart mcq_api_gateway >/dev/null
fi

# ─── Step 3: Wait for gateway readiness ──────────────────────────────────────
echo
echo "▶ Step 2/3: waiting for gateway readiness at $GATEWAY/ready"

for i in $(seq 1 30); do
  if curl -sf "$GATEWAY/ready" >/dev/null; then
    echo "  ✓ gateway ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ✗ gateway did not become ready after 60s" >&2
    exit 1
  fi
  sleep 2
done

# ─── Step 3: Integration tests ───────────────────────────────────────────────
echo
echo "▶ Step 3a/3: integration tests"
cd "$REPO/tests"
GATEWAY_URL="$GATEWAY" npx vitest run integration/

# ─── Step 4: E2E tests ───────────────────────────────────────────────────────
echo
echo "▶ Step 3b/3: E2E tests"
GATEWAY_URL="$GATEWAY" FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}" \
  npx playwright test e2e/ --reporter=list

echo
echo "════════════════════════════════════════════════════════"
echo "  ✓ all tests passed"
echo "════════════════════════════════════════════════════════"
