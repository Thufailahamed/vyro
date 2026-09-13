# Alerting + Public Status — End-to-End Verification

Final acceptance checklist for `feat/alerting-public-status`. Run **after**
merging, against the production deployment.

## Pre-conditions

- [ ] Merged to `main`
- [ ] `apps/api/wrangler.toml` `[env.production]` `ALERTS_KV.id` is a real id
      (run `./scripts/provision-alerts-kv.sh` if still `REPLACE_WITH_PROD_KV_ID`)
- [ ] All production secrets set
      (`BETTER_AUTH_SECRET`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`,
      `ALERT_SLACK_WEBHOOK_URL`, `RESEND_API_KEY`,
      `UPTIMEROBOT_WEBHOOK_SECRET`)
- [ ] Custom domain `status.vyro.lk` (or chosen origin) resolves to the
      Worker and matches `STATUS_PAGE_ORIGIN`
- [ ] UptimeRobot has a webhook alert contact pointing at
      `https://<origin>/api/admin/observability/uptime-webhook` with the
      custom HMAC header

## Smoke (automated)

```bash
./scripts/smoke-test.sh https://vyro-api.thufillahamed627.workers.dev
```

Expect: all checks pass — `/status.json → 200`, `/api/metrics/web → 204`.

## Functional (manual, ~15 min)

### 1. Sweep runs on schedule

- Wait up to 5 min after deploy for the first `*/5 * * * *` tick.
- Or trigger manually:
  ```bash
  curl -X POST https://vyro-api.thufillahamed627.workers.dev/api/admin/cron/observabilitySweep/run \
    -H 'Cookie: <admin session>'
  ```
- Confirm: `wrangler tail` shows the sweep ran and `/status.json` was
  updated (non-null `updatedAt`).

### 2. Status page renders

- Visit `https://<origin>/status` — should show 5 component badges
  (api/payments/queues/cron/web) all `operational` initially.
- `https://<origin>/status.json` returns 200 with the same payload.

### 3. Synthetic 5xx burst fires alert

```bash
curl -X POST https://vyro-api.thufillahamed627.workers.dev/api/admin/_test/5xx-burst?count=20 \
  -H 'Cookie: <admin session>'   # 404 in production — that's correct
```

In staging:

```bash
curl -X POST https://staging-api.vyro.lk/api/admin/_test/5xx-burst?count=20 \
  -H 'Cookie: <admin session>'
```

Expect within 5 min:
- `api.error_rate_5xx_critical` rule fires
- Slack channel receives a Block Kit alert
- `OPS_EMAIL` receives an email via Resend
- `/admin/observability/alerts` shows the new entry under history
- `/status.json` reports `api: degraded` or `down`

### 4. Cooldown respected

- Fire twice within 5 min — second fire should be suppressed
  (cooldown = 30 min default).
- Inspect `ALERTS_KV` keys: `cooldown:api.error_rate_5xx_critical:*`.

### 5. Silence via admin

```bash
curl -X POST https://vyro-api.thufillahamed627.workers.dev/api/admin/observability/alerts/silence \
  -H 'Cookie: <admin session>' \
  -H 'content-type: application/json' \
  -d '{"ruleName":"api.error_rate_5xx_critical","durationMinutes":30,"reason":"drill"}'
```

- Trigger a fresh burst — no Slack/email this time.
- `silenced:api.error_rate_5xx_critical` exists in KV with TTL ~30 min.
- Unsilence: `DELETE .../silence/api.error_rate_5xx_critical`.

### 6. Manual incident on status page

```bash
curl -X POST .../api/admin/observability/incidents \
  -H 'Cookie: <admin session>' \
  -H 'content-type: application/json' \
  -d '{"title":"PayHere degraded","severity":"major","affected":["payments"],"body":"Investigating"}'
```

- Visit `/status` — banner appears, payments badge flips to `degraded`,
  incident listed.
- Resolve:
  ```bash
  curl -X POST .../api/admin/observability/incidents/<id>/resolve \
    -H 'Cookie: <admin session>' \
    -H 'content-type: application/json' \
    -d '{"note":"PayHere normal"}'
  ```
- Banner gone, badge back to `operational`.

### 7. UptimeRobot webhook

- Stop the probe in UptimeRobot dashboard.
- Within 2 min: incident appears on `/status` with title from UptimeRobot,
  source = `uptime`.
- Restart probe — auto-resolve within 2 min.

### 8. RUM beacon

- Open `https://<origin>/` in a real browser, devtools open.
- Expect POSTs to `/api/metrics/web` with `route`, `lcp_ms`, `inp_ms`,
  `cls` over 5–30 seconds.
- In CF Analytics Engine: query
  `SELECT * FROM vyro_metrics WHERE index1 = 'web.cwv' LIMIT 10` — should
  see the beacon writes.

### 9. CF Web Analytics

- Visit the origin; confirm
  `https://static.cloudflareinsights.com/beacon.min.js` loads
  (`VITE_CF_ANALYTICS_BEACON` must be set at build time).
- Check CF dashboard → Analytics → Web Analytics → pageviews flow.

### 10. Permissions

- Sign in as `support` role. `/admin/observability/alerts` should render
  but the Silence button should 403 (`observability:write` missing).
- Sign in as `ops` or `super_admin` — silence + unsilence both work.

## Rollback plan

If a critical regression ships:

```bash
# Roll back Worker (restores API + SPA together)
wrangler rollback --config apps/api/wrangler.toml --env production
```

KV data (silences, cooldowns, status) survives rollback. If you need a
clean slate:

```bash
# Delete all alert keys (destructive)
npx wrangler kv bulk delete --binding ALERTS_KV --env production --config apps/api/wrangler.toml \
  --prefix cooldown: --prefix silenced: --prefix status: --prefix incidents:
```
