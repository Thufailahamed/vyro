#!/usr/bin/env bash
# Provision the production ALERTS_KV namespace for the alerting engine,
# write its id into apps/api/wrangler.toml (env.production), and print the
# remaining secrets/commands the operator must run by hand.
#
# Usage:  ./scripts/provision-alerts-kv.sh
# Prereq: wrangler is authenticated (`wrangler whoami`).
#
# Idempotent: if the namespace already exists, reuses its id.

set -euo pipefail

NAMESPACE_NAME="vyro-alerts"
WRANGLER_TOML="apps/api/wrangler.toml"

echo "==> Checking for existing ${NAMESPACE_NAME} namespace…"
KV_ID=$(npx wrangler kv namespace list 2>/dev/null \
  | python3 -c "import json,sys; ns=[x['id'] for x in json.load(sys.stdin) if x['title']=='${NAMESPACE_NAME}']; print(ns[0] if ns else '')" \
  || true)

if [[ -z "${KV_ID}" ]]; then
  echo "==> Creating ${NAMESPACE_NAME}…"
  KV_ID=$(npx wrangler kv namespace create "${NAMESPACE_NAME}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  echo "    created id=${KV_ID}"
else
  echo "    reusing id=${KV_ID}"
fi

# Patch wrangler.toml — only replace the placeholder line under env.production.
PLACEHOLDER='id = "REPLACE_WITH_PROD_KV_ID"'
TARGET="id = \"${KV_ID}\""

if grep -q "${PLACEHOLDER}" "${WRANGLER_TOML}"; then
  # BSD/GNU compatible in-place replace
  sed -i.bak "s|${PLACEHOLDER}|${TARGET}|g" "${WRANGLER_TOML}"
  rm -f "${WRANGLER_TOML}.bak"
  echo "==> Patched ${WRANGLER_TOML} (env.production.ALERTS_KV.id)"
else
  echo "==> wrangler.toml already patched — skipping"
fi

cat <<EOF

==> Done.

Remaining operator steps (run by hand, never commit secrets):

  # Required secrets (Worker, env=production)
  npx wrangler secret put BETTER_AUTH_SECRET          --env production --config ${WRANGLER_TOML}
  npx wrangler secret put CF_ACCOUNT_ID               --env production --config ${WRANGLER_TOML}
  npx wrangler secret put CF_API_TOKEN                --env production --config ${WRANGLER_TOML}
  npx wrangler secret put ALERT_SLACK_WEBHOOK_URL     --env production --config ${WRANGLER_TOML}
  npx wrangler secret put RESEND_API_KEY              --env production --config ${WRANGLER_TOML}
  npx wrangler secret put UPTIMEROBOT_WEBHOOK_SECRET  --env production --config ${WRANGLER_TOML}

  # Deploy
  node scripts/deploy-backend.mjs --env production

  # Verify
  curl -s https://vyro-api.thufillahamed627.workers.dev/status.json | jq .
  ./scripts/smoke-test.sh https://vyro-api.thufillahamed627.workers.dev

  # DNS: point status.vyro.lk CNAME to vyro-api.thufillahamed627.workers.dev
  # (or use Cloudflare for SaaS custom hostname) and update STATUS_PAGE_ORIGIN.

EOF
