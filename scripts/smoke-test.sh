#!/usr/bin/env bash
# Smoke-test the deployed API. Exits non-zero on any failure.
# Usage: ./scripts/smoke-test.sh [API_BASE]
#   API_BASE defaults to https://vyro-api.thufailahamed627.workers.dev

set -euo pipefail

API="${1:-https://vyro-api.thufailahamed627.workers.dev}"
FAIL=0

check() {
  local path="$1" expected="$2" desc="$3"
  local code
  code=$(curl -s -o /tmp/smoke_body -w "%{http_code}" "${API}${path}" || echo "000")
  if [[ "$code" == "$expected" ]]; then
    echo "  ok  ${code}  ${path}  — ${desc}"
  else
    echo "  FAIL  ${code}  ${path}  expected ${expected} — ${desc}"
    head -c 200 /tmp/smoke_body
    echo
    FAIL=$((FAIL+1))
  fi
}

echo "smoke: ${API}"

check "/api/version"        "404" "version endpoint NOT mounted at top (expected path)"
check "/api/health/version" "200" "version endpoint"
check "/api/health"         "200" "health endpoint (DB ok or degraded ok)"
check "/api/categories"     "200" "public categories"
check "/api/search/products?q=rice"  "200" "search"

# Auth: protected endpoint without session should 401, not 500.
check "/api/cart?businessId=x"  "401" "cart requires auth"

echo
if [[ $FAIL -eq 0 ]]; then
  echo "smoke: all checks passed"
  exit 0
fi
echo "smoke: ${FAIL} check(s) failed"
exit 1
