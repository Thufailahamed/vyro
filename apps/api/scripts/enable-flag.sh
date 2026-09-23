#!/usr/bin/env bash
# Enable a feature flag in D1.
# Usage: ./scripts/enable-flag.sh <FLAG_NAME> [--remote]
# Example: ./scripts/enable-flag.sh LEARNING_CENTER_ENABLED --remote
set -euo pipefail

FLAG="${1:-}"
REMOTE_FLAG="${2:-}"
if [[ -z "$FLAG" ]]; then
  echo "Usage: $0 <FLAG_NAME> [--remote]" >&2
  echo "Example: $0 LEARNING_CENTER_ENABLED --remote" >&2
  exit 2
fi

D1_TARGET="--local"
TARGET_DESC="local D1"
if [[ "$REMOTE_FLAG" == "--remote" ]]; then
  D1_TARGET="--remote"
  TARGET_DESC="remote D1"
fi

cd "$(dirname "$0")/.."

# Read existing value, set named flag to true, upsert with version+1.
EXISTING=$(npx wrangler d1 execute DB $D1_TARGET --command "SELECT value_json, version FROM config_sections WHERE section = 'feature_flags'" --json 2>/dev/null | grep -o '"value_json":"[^"]*"' | head -1 | sed 's/"value_json":"//; s/"$//' || echo "")

if [[ -n "$EXISTING" && "$EXISTING" != "null" ]]; then
  NEW_JSON=$(printf '%s' "$EXISTING" | python3 -c "import sys,json; d=json.load(sys.stdin); d['$FLAG']=True; print(json.dumps(d, separators=(',',':')))")
  CURR_VERSION=$(npx wrangler d1 execute DB $D1_TARGET --command "SELECT version FROM config_sections WHERE section = 'feature_flags'" --json 2>/dev/null | grep -o '"version":[0-9]*' | head -1 | sed 's/"version"://')
  NEW_VERSION=$((CURR_VERSION + 1))
  CMD="UPDATE config_sections SET value_json = '$(printf '%s' "$NEW_JSON" | sed "s/'/''/g")', version = ${NEW_VERSION}, updated_by = NULL, updated_at = unixepoch() WHERE section = 'feature_flags';"
else
  CMD="INSERT INTO config_sections (section, value_json, version, updated_by, updated_at) VALUES ('feature_flags', '{\"${FLAG}\":true}', 1, NULL, unixepoch());"
fi

echo "Enabling flag '${FLAG}' in ${TARGET_DESC}..."
npx wrangler d1 execute DB $D1_TARGET --command "$CMD" >/dev/null
echo "✓ Flag '${FLAG}' enabled. Restart wrangler to pick up."
