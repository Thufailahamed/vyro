#!/usr/bin/env bash
# One-shot trust signals backfill via wrangler. Idempotent (UPSERT).
# Usage: ./apps/api/scripts/trust-backfill.sh [local|remote]
set -euo pipefail

TARGET="${1:-local}"
case "$TARGET" in
  local)  D1_TARGET="--local"  ;;
  remote) D1_TARGET="--remote" ;;
  *)      echo "usage: $0 [local|remote]" >&2; exit 1 ;;
esac

# Pull all supplier IDs, iterate one-by-one via SQL (recompute is pure SQL).
SUPPLIERS=$(npx wrangler d1 execute DB "$D1_TARGET" --command \
  "SELECT id FROM suppliers WHERE deleted_at IS NULL" --json 2>/dev/null \
  | python3 -c 'import sys, json; rows = json.load(sys.stdin)[0]["results"]; print("\n".join(r["id"] for r in rows))')

if [ -z "$SUPPLIERS" ]; then
  echo "No suppliers in DB."; exit 0
fi

now=$(date +%s)
COUNT=0
for id in $SUPPLIERS; do
  # Mirror `computeTrustSignal` SQL inline:
  #   kyc_verified     = (verification_status = 'verified') ? 1 : 0
  #   member_since_year = strftime('%Y', created_at_ms / 1000, 'unixepoch')
  #   on-time + sample = aggregate over last 30 delivered POs
  #   disputes         = trailing 90d refund_business count
  CMD=$(cat <<EOF
INSERT OR REPLACE INTO supplier_trust_signals
  (supplier_id, kyc_verified, member_since_year, total_completed_pos, on_time_count,
   on_time_pct_cached, disputed_supplier_fault_count, computed_at)
SELECT
  s.id,
  CASE WHEN s.verification_status = 'verified' THEN 1 ELSE 0 END,
  CAST(strftime('%Y', s.created_at / 1000, 'unixepoch') AS INTEGER),
  COALESCE(del.total, 0),
  COALESCE(del.on_time, 0),
  CASE WHEN COALESCE(del.total, 0) > 0 THEN CAST(del.on_time AS REAL) / del.total ELSE NULL END,
  COALESCE(disp.n, 0),
  ${now}
FROM suppliers s
LEFT JOIN (
  SELECT supplier_id,
         count(*) AS total,
         sum(CASE WHEN delivered_at <= delivery_promised_at THEN 1 ELSE 0 END) AS on_time
  FROM purchase_orders
  WHERE status = 'delivered' AND delivery_promised_at IS NOT NULL
  GROUP BY supplier_id
  ORDER BY delivered_at DESC
  LIMIT 30
) del ON del.supplier_id = s.id
LEFT JOIN (
  SELECT supplier_id, count(*) AS n
  FROM purchase_orders
  WHERE dispute_outcome = 'refund_business'
    AND disputed_at >= ${now} - 90 * 86400
  GROUP BY supplier_id
) disp ON disp.supplier_id = s.id
WHERE s.id = '${id}';
EOF
)
  npx wrangler d1 execute DB "$D1_TARGET" --command "$CMD" >/dev/null
  COUNT=$((COUNT+1))
done

echo "✓ Trust signals rebuilt for ${COUNT} supplier(s)."
