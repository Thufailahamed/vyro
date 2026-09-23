#!/usr/bin/env bash
# Provision the production CROSS_BORDER_KV namespace and the R2 bucket
# `vyro-cross-border-docs` for customs documents, write the binding ids into
# apps/api/wrangler.toml (env.production), seed the initial sanctions list,
# and print remaining operator steps.
#
# Usage:  ./scripts/provision-cross-border.sh
# Prereq: wrangler is authenticated (`wrangler whoami`).
#
# Idempotent: reuses existing namespaces / buckets.

set -euo pipefail

NAMESPACE_NAME="vyro-cross-border"
R2_BUCKET="vyro-cross-border-docs"
WRANGLER_TOML="apps/api/wrangler.toml"
KV_PLACEHOLDER='id = "REPLACE_WITH_PROD_CROSS_BORDER_KV_ID"'

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

# Patch wrangler.toml only if placeholder still present.
if grep -q "${KV_PLACEHOLDER}" "${WRANGLER_TOML}"; then
  sed -i.bak "s|${KV_PLACEHOLDER}|id = \"${KV_ID}\"|g" "${WRANGLER_TOML}"
  rm -f "${WRANGLER_TOML}.bak"
  echo "==> Patched ${WRANGLER_TOML} (env.production.CROSS_BORDER_KV.id)"
else
  echo "==> wrangler.toml already patched — skipping"
fi

echo "==> Checking for R2 bucket ${R2_BUCKET}…"
if ! npx wrangler r2 bucket list 2>/dev/null | grep -q "${R2_BUCKET}"; then
  echo "==> Creating ${R2_BUCKET}…"
  npx wrangler r2 bucket create "${R2_BUCKET}"
else
  echo "    ${R2_BUCKET} already exists"
fi

echo "==> Seeding sanctions:list (UN consolidated reference, RU/IR/KP/SY/CU)…"
# Seed directly via wrangler so the value lives in production KV immediately.
echo '["RU","IR","KP","SY","CU"]' | npx wrangler kv key put \
  --binding CROSS_BORDER_KV \
  --env production \
  --config "${WRANGLER_TOML}" \
  --remote "sanctions:list" >/dev/null
echo "    seeded sanctions:list"

cat <<EOF

==> Done.

Remaining operator steps (run by hand, never commit secrets):

  # Enable cross-border globally (one line in env.production.vars):
  CROSS_BORDER_ENABLED = "true"

  # Deploy + apply vars
  node scripts/deploy-backend.mjs --env production

  # Verify
  curl -s 'https://vyro-api.thufailahamed627.workers.dev/api/fx/rates?base=LKR&quote=USD' | jq .
  curl -s https://vyro-api.thufailahamed627.workers.dev/api/cross-border/sanctions | jq .

  # Force a sanctions refresh (optional):
  #   npx wrangler trigger cron --env production "0 3 * * *"  # monthly cron path

EOF
