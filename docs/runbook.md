# Vyro Ops Runbook

Day-2 operations for the Vyro Worker + SPA + D1 stack.

The API and the SPA share **one origin** (`https://vyro-api.thufailahamed627.workers.dev`
by default). The Worker serves `/api/*` and ships the built SPA via
`[assets]`. There is no separate Pages project.

## Health checks

```bash
# Liveness + DB ping
curl https://vyro-api.thufailahamed627.workers.dev/api/health

# Version + deploy timestamp
curl https://vyro-api.thufailahamed627.workers.dev/api/health/version
```

`/api/health` returns `200` with `{ ok: true, ready: true, db: 'ok' }` when
healthy, or `503` when D1 is unreachable.

## Build + deploy

```bash
# One-shot: builds SPA then deploys Worker (uploads assets in the same deploy).
node scripts/deploy-backend.mjs --env production

# Build only (no deploy) — useful for CI matrix builds.
node scripts/deploy-backend.mjs --build-only
```

If `BETTER_AUTH_SECRET` hasn't been set yet, the first deploy will succeed but
auth will be broken. See "Secret rotation" below.

## Rollback

### Worker (API + SPA together)

```bash
# List recent deployments
wrangler deployments list --config apps/api/wrangler.toml

# Roll back to the previous version
wrangler rollback --config apps/api/wrangler.toml
```

A Worker rollback restores **both** the API code and the SPA bundle that was
uploaded with that deployment — there's nothing separate to roll back.

### D1 (database)

D1 migrations are append-only. To roll back a bad migration:

```bash
# Restore from a backup
wrangler d1 restore vyro --remote --name "pre-deploy-YYYY-MM-DD"

# Or apply a forward-fix migration
pnpm db:migrate
```

## Secret rotation

```bash
# Rotate the Better Auth secret (invalidates all sessions — users must sign in again).
npx wrangler secret put BETTER_AUTH_SECRET --env production \
  --config apps/api/wrangler.toml
```

The secret is read at runtime from `env.BETTER_AUTH_SECRET`. Never commit it
to `wrangler.toml`.

## Backups

### D1

```bash
# Manual snapshot
wrangler d1 export vyro --remote --output backup-$(date +%Y%m%d).sql
```

D1 daily automatic backups are enabled in the Cloudflare dashboard.

### R2 (avatars + product images)

R2 versioning + lifecycle rules should be configured in the Cloudflare
dashboard. Manual export:

```bash
wrangler r2 object get vyro-products/path/to/file --file ./local-backup.bin
```

## KV cache clear

```bash
# Delete a single key (e.g. a stuck rate-limit entry)
wrangler kv:key delete --binding CACHE "ratelimit:global:1.2.3.4" --remote

# Bulk delete by prefix requires a custom script (prefix scan + delete loop).
```

## Incident response

1. Check `/api/health` — DB down?
2. `wrangler tail --config apps/api/wrangler.toml` for live request logs.
3. Cloudflare status: https://www.cloudflarestatus.com/
4. Bad deploy → `wrangler rollback --config apps/api/wrangler.toml`.
5. Suspected auth compromise → rotate `BETTER_AUTH_SECRET` and clear rate-limit
   keys for the affected IP range from KV.

## Cron / scheduled work

The Worker is configured with `crons = ["0 3 * * *"]` (3 AM UTC nightly).
The `scheduled` export in `apps/api/src/worker.ts` dispatches to registered
jobs in `apps/api/src/cron/`. Jobs can also be triggered manually through:

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/cron/<job>/run \
  -H "Cookie: <admin session>"
```

List registered jobs and last-run status:

```bash
curl https://vyro-api.thufailahamed627.workers.dev/api/admin/cron \
  -H "Cookie: <admin session>"
```

## Order lifecycle automation

Every order status change goes through one pipeline,
`apps/api/src/modules/orders/lifecycle.ts` (`applyTransition`). Refunds,
credit release, stock, settlement eligibility and notifications all hang off
it. The test `apps/api/test/orders/statusWriteGuard.test.ts` fails CI if any
other module writes `purchase_orders.status`.

The hourly `order-lifecycle` cron (`apps/api/src/cron/orderLifecycle.ts`) does four things:

| Job | Default | Effect |
|---|---|---|
| Auto-cancel | 48h pending | Cancels orders the supplier never answered. Refunds online payments, queues offline refunds, releases stock and credit. |
| Auto-complete | 3 days after delivery | Completes delivered orders that have no open return, so supplier earnings become payable. |
| Return escalation | 3 days | Alerts `ops` about return requests the supplier hasn't answered. Returns are never auto-approved. |
| SLA breach | past `delivery_promised_at` | Notifies both parties and `ops` once per order. The command centre shows a live count. |

Settings are in the `order_lifecycle` config section at `GET/PUT /api/admin/order-lifecycle`:

- the windows above
- `disputeWindowDays` (default 7) and `returnWindowDays` (default 7)
- toggles `paymentGateEnabled`, `returnsEnabled` and `automationEnabled`

To stop all automation immediately, set `automationEnabled: false`.

Auto-cancel only touches orders created after `automationSince`. That value is
stamped on the first run, so turning the job on never cancels an existing backlog.

Refunds: every refund goes through `modules/refunds/executor.ts`.

- **Online (payments.lk) payments** are refunded through the gateway straight away. If the gateway fails, the refund is marked `failed` and the payment stays `confirmed`, so no money moved and nothing is lost. Refunds for legacy `provider='payhere'` rows stay on the manual admin queue.
- **Cash and bank-transfer payments** create a `requested` refund in the admin refund queue. Approving it settles the ledger, payment and earning.
- **Credit repayments** already made on a cancelled order raise a `finance` alert for a manual refund.

## Custom domains

If you migrate to a custom domain, edit `apps/api/wrangler.toml`
`[env.production.vars]` and set **all three** of these to the same URL:

- `WEB_ORIGIN`
- `ADMIN_ORIGIN`
- `BETTER_AUTH_URL`

Then redeploy (`node scripts/deploy-backend.mjs --env production`). CORS,
cookies, and CSRF all derive their allow-list from those vars.

## Queue ops dashboard

Two secrets are required for the admin `/admin/observability/queues`
page (Analytics Engine SQL API access):

```bash
npx wrangler secret put CF_ACCOUNT_ID --config apps/api/wrangler.toml
npx wrangler secret put CF_API_TOKEN --config apps/api/wrangler.toml
```

## Admin payment search + detail

Admin can search every payment across the platform from
`/admin/payments`. Filters compose: free-text (id / transaction ref /
gateway ref), method, provider (payhere/mock), business, supplier,
amount range, date range, status chips
(pending/confirmed/failed/cancelled/chargeback/refunded),
sort, cursor pagination. Detail at `/admin/payments/:id` shows the
payment row, linked PO, parties (business/supplier with email), all
refunds, all chargebacks, notification history (`payment_events`),
and every ledger entry linked by
`refType='payment'`. Every detail load emits an audit log entry
(`action=payment.view`, `target.type=payment`). Permission:
`payment:read`. No new secrets required.

## payments.lk sandbox + webhook URL + reconciliation

Env: `PAYMENTS_LK_SECRET_KEY` (`sk_test_…` sandbox / `sk_live_…` live),
`PAYMENTS_LK_WEBHOOK_SECRET` (both Worker secrets, never in git/React),
optional `PAYMENTS_LK_API_URL` (default `https://api.payments.lk`),
`PAYMENTS_LK_RETURN_URL`, `PAYMENTS_LK_CANCEL_URL`, and
`PAYMENTS_LK_WEBHOOK_URL`. Production:

```bash
npx wrangler secret put PAYMENTS_LK_SECRET_KEY --config apps/api/wrangler.toml --env production
npx wrangler secret put PAYMENTS_LK_WEBHOOK_SECRET --config apps/api/wrangler.toml --env production
```

Webhook endpoint: `POST /api/webhooks/payments-lk` (alias
`POST /api/webhooks/plk-notify`; public, CSRF-exempt, rate-limited
30/min, JSON body, `Payments-Signature: t=<unix>,v1=<hex>`
HMAC-SHA256 verified with a 300s tolerance). Register the endpoint in
the payments.lk dashboard under Developers. payments.lk cannot reach
`localhost`, so local webhook testing needs a public URL:

```bash
ngrok http 8787
# .dev.vars:
PAYMENTS_LK_WEBHOOK_URL=https://<ngrok-id>.ngrok-free.app/api/webhooks/payments-lk
```

Missing secrets under `ENVIRONMENT=production` makes checkout fail
with `GatewayConfigError` — the mock gateway is refused to prevent
silent money loss. Local/staging can force the simulator with
`PAYMENTS_LK_MOCK=1` (and `PAYMENTS_LK_MOCK_FORCE_FAILURE=1` to
exercise failure paths).

Reconciliation: `GET /api/admin/payments/reconcile`
(`payment:read`) returns `{ confirmedOnline, pendingOnline, failed,
cancelled, chargebacks, paymentsWithMultipleEvents }` for ops triage
of missing order updates, unpaid orders, duplicate notifications,
failures and chargebacks.

The token needs `Account > Analytics Engine > Read` permission. Local
dev: set the same keys in `.dev.vars` (gitignored). Retention of
`queue_events` rows defaults to 7 days; override with
`QUEUE_EVENTS_RETENTION_DAYS` in `apps/api/wrangler.toml`.

### Deploying

After deploying, in production:

```bash
npx wrangler secret put CF_ACCOUNT_ID --config apps/api/wrangler.toml --env production
npx wrangler secret put CF_API_TOKEN --config apps/api/wrangler.toml --env production
```

Then visit `/admin/observability/queues` to confirm tiles render.

## Admin Notifications

In-app admin alerts live in the existing `notifications` table. Each row
carries a `recipient_role` + `userId`, plus `severity` (`info`/`warning`/
`critical`), `source_ref`, and `source='admin'`. Severity=critical fans out
a `notifications` queue message (`kind: admin_alert_email`) that sends one
email per recipient, honoring `user_settings.notify_admin_alerts` opt-out.

### How to send

From API code:

```ts
import { notifyAdmins } from './modules/notifications/dispatcher';
await notifyAdmins(env, {
  role: 'finance',           // super_admin | ops | finance | support
  severity: 'critical',      // info | warning | critical
  category: 'admin_alert',
  title: 'Payout 123 failed',
  body: 'Reason: insufficient funds',
  link: '/admin/money',
  sourceRef: 'payout:123',
  actorUserId: ctx.userId,   // omit for system-triggered alerts
});
```

The helper always emits `auditAdminFromDb(action: 'notification.broadcast')`,
returns `{ recipients: number }`, and is best-effort — failures never bubble
up.

### Trigger sources

| Trigger                      | Role    | Severity | Source              |
|------------------------------|---------|----------|---------------------|
| Payout marked failed         | finance | critical | payouts/admin.ts    |
| KYC review created           | support | info     | kycService.create   |
| Refund stuck >24h (hourly)   | finance | warning  | cron:handleRefundStuckChecker |
| Queue DLQ events (hourly)    | ops     | warning  | cron:handleQueueDlqScan |

### Where it shows up

- `/admin/notifications` — full inbox with severity/category filters,
  Mark-all-read, and Broadcast modal (requires `notification:write`).
- Header bell — unread badge with 30s refetch + visibility refetch.
  Hidden when the actor lacks `notification:read`.

### RBAC matrix

| Role        | notification:read | notification:dismiss | notification:write |
|-------------|-------------------|----------------------|--------------------|
| super_admin | yes               | yes                  | yes                |
| ops         | yes               | yes                  | no                 |
| finance     | yes               | yes                  | no                 |
| support     | yes               | yes                  | no                 |

### Deploying

Run the migration first:

```bash
pnpm --filter @vyro/db migrate -- 0022_admin_notifications
```

No new secrets. After deploy, mark a payout failed from `/admin/money` and
confirm a critical-severity row lands in `/admin/notifications` for an
ops/finance admin.

## Admin Bulk Actions

Multi-row actions live under `/api/admin/bulk/*`. Each request accepts up
to 100 IDs (zod-enforced). Response shape:

```ts
{
  batchId: string;
  total: number;          // after dedupe
  succeeded: string[];    // actually transitioned
  failed: Array<{ id, code, message }>;
}
```

Status code is `200` even with partial failures. Inspect `failed[]` for
per-item outcomes. Every request writes one summary audit row
(`action='bulk.batch'`) plus one row per item attempt under the same
`batch_id` on `admin_audit_logs`. Query with
`SELECT * FROM admin_audit_logs WHERE batch_id = ?`.

### Endpoints

| Endpoint                                    | Permission         |
|---------------------------------------------|--------------------|
| POST /api/admin/bulk/users/suspend          | user:suspend       |
| POST /api/admin/bulk/users/unsuspend        | user:suspend       |
| POST /api/admin/bulk/users/role             | admin:role_change  |
| POST /api/admin/bulk/businesses/suspend     | user:suspend       |
| POST /api/admin/bulk/businesses/unsuspend   | user:suspend       |

### Cap rationale

100 IDs ≈ 5s sequential on Workers; larger batches risk the CPU-time
limit. Override with `BULK_MAX_IDS` env if needed.

### UI

UsersPage + BusinessesPage show a sticky bottom action bar when rows are
selected. Cap warning: if the filtered list exceeds 100, the select-all
checkbox is disabled with a tooltip "Bulk actions cap at 100 — refine
filter".

### Migration

```bash
pnpm --filter @vyro/db migrate -- 0023_admin_audit_batch
```

Adds `admin_audit_logs.batch_id` (text, nullable) + index for batch
grouping. No data backfill required.

## Observability, alerting & public status

The SLO sweep runs every 5 minutes (cron `*/5 * * * *`). It evaluates 11
rules against CF Analytics Engine + D1 health, fires Slack/email alerts
when thresholds trip (respecting cooldown + silence), and rewrites the
public status KV.

### Components tracked

`api`, `payments`, `queues`, `cron`, `web`. Each gets a
`operational | degraded | down | unknown` badge on `/status`.

### Required env + secrets

| Setting          | Where                | Purpose                                |
|------------------|----------------------|----------------------------------------|
| `CF_ACCOUNT_ID`  | already in vars      | Analytics Engine SQL API auth          |
| `CF_API_TOKEN`   | already in secrets   | Analytics Engine SQL API auth          |
| `ALERT_SLACK_WEBHOOK_URL` | secret     | Slack incoming webhook (Block Kit)     |
| `RESEND_API_KEY` | secret               | Outbound email via Resend              |
| `OPS_EMAIL`      | var                  | Default recipient for critical emails  |
| `STATUS_PAGE_ORIGIN` | var              | CORS allow-list for `/status.json`     |
| `ALERTS_KV`      | binding              | Silence + cooldown + status storage    |
| `UPTIMEROBOT_WEBHOOK_SECRET` | secret    | HMAC for UptimeRobot incident webhook  |

### Public status page

- SPA: `https://<WEB_ORIGIN>/status` (polls `/status.json` every 30s)
- JSON: `GET /status.json` (no auth, CORS-allowed for status-page origin)
- 5 components + open incidents + freshness banner (stale after 15 min)

```bash
curl -s https://vyro-api.thufailahamed627.workers.dev/status.json | jq .
```

### Admin alerts UI

`/admin/observability/alerts` — list rules + recent history. Silence
anything by name + duration + reason. Permission: `observability:read` /
`observability:write`.

### Silencing a rule

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/observability/alerts/silence \
  -H 'content-type: application/json' \
  -H 'Cookie: <admin session>' \
  -d '{"ruleName":"api.error_rate_5xx","durationMinutes":30,"reason":"deploy"}'

# Unsilence
curl -X DELETE https://vyro-api.thufailahamed627.workers.dev/api/admin/observability/alerts/silence/api.error_rate_5xx \
  -H 'Cookie: <admin session>'
```

Silences live in the `ALERTS_KV` binding under `silenced:<rule>`. Expires
automatically after the requested duration; manually unsilencing removes
the key.

### Declaring a manual incident

```bash
curl -X POST https://vyro-api.thufillahamed627.workers.dev/api/admin/observability/incidents \
  -H 'content-type: application/json' \
  -H 'Cookie: <admin session>' \
  -d '{"title":"payments.lk webhook endpoint degraded","severity":"major","affected":["payments"],"body":"Investigating elevated 5xx rates."}'
```

To resolve:

```bash
curl -X POST .../api/admin/observability/incidents/<id>/resolve \
  -H 'Cookie: <admin session>' \
  -H 'content-type: application/json' \
  -d '{"note":"payments.lk acknowledged."}'
```

### UptimeRobot integration

Point an UptimeRobot alert contact (Webhook) at:

```
https://vyro-api.thufillahamed627.workers.dev/api/admin/observability/uptime-webhook
```

with custom header `X-Uptime-Signature: <HMAC-SHA256(UPTIMEROBOT_WEBHOOK_SECRET, body)>`.
Down/up events auto-create and resolve `uptime` incidents on the status
page.

### Synthetic load test

```bash
# 200 sequential RUM beacon writes; expects p95 < 50ms and 100% 204s
node scripts/load/sweep.js http://localhost:8787 200
```

Use this against staging before changing the metrics web handler.

### Smoke

`scripts/smoke-test.sh` now also asserts `/status.json → 200` and
`/api/metrics/web → 204`. Run after every deploy.

## Cross-border trade

Cross-border orders add three things to the stack: a `CROSS_BORDER_KV`
namespace (sanctions list + FX rate cache), an `INVOICES` / `CROSS_BORDER_DOCS`
R2 bucket for customs documents, and a `CROSS_BORDER_ENABLED` flag.

### Provisioning (first-time setup)

```bash
./scripts/provision-cross-border.sh
```

Idempotent. Creates `vyro-cross-border` KV namespace and `vyro-cross-border-docs`
R2 bucket, patches `wrangler.toml`, and seeds `sanctions:list` with the UN
consolidated reference countries (RU, IR, KP, SY, CU).

### Enabling / disabling

The feature flag is read at request time:

```toml
# apps/api/wrangler.toml → [env.production.vars]
CROSS_BORDER_ENABLED = "true"
```

Set `"false"` to fall back to the existing domestic-only flow without
deploying code. The flag is checked by `cross-border/service.ts` →
`isEnabled()`.

### Sanctions list

Stored in `CROSS_BORDER_KV` under `sanctions:list` as a JSON array of ISO-3166
alpha-2 codes. Refreshed monthly by the cron handler
(`src/modules/cross-border/sanctions.ts` → `refreshSanctionsList`).

Manual refresh (emergency, e.g. new sanctions imposed):

```bash
echo '["RU","IR","KP","SY","CU","AF"]' | \
  npx wrangler kv key put --binding CROSS_BORDER_KV \
    --env production --config apps/api/wrangler.toml \
    --remote "sanctions:list"
```

A list with > 1000 countries triggers the `cross_border.sanctions.list_anomaly`
warning; alert is silent because this should never happen — investigate.

### FX rates

`/api/fx/rates?base=XXX&quote=YYY` returns the current cached rate. On miss,
the worker fetches CBSL first, then exchangerate.host, caches in
`CROSS_BORDER_KV` for 1 hour. Failures emit the
`cross_border.fx_unavailable_burst` SLO rule (critical > 3 fails / 5 min).

Seed a manual rate (e.g. provider outage):

```bash
echo '33000000000000' | npx wrangler kv key put \
  --binding CROSS_BORDER_KV --env production \
  --config apps/api/wrangler.toml --remote "fx:LKR:USD:rateScaled"
```

### KYC review

Foreign buyers (`countryCode != 'LK'`) cannot checkout with `kycLevel = 'none'`.
They submit documents at `/businesses/:id/kyc`; admin reviews at
`/admin/cross-border-kyc`.

SLA: manual review within 1 business day. Decisions append to
`audit_logs` (`action = 'cross_border.kyc_review'`).

### Wire reconciliation

Cross-border orders payable by SWIFT/wire start in `pending` with
`paymentMethod = 'wire'` (stamped automatically by the checkout service when
`direction != 'domestic'`).

**Buyer-initiated flow:** the buyer hits `POST /api/purchase-orders/:id/wire-instructions`
from the buyer order detail page (`/orders/:id`). The route:
- Verifies the buyer owns the business (`hasBusinessAccess`) and `direction != 'domestic'`.
- Loads Vyro's bank beneficiary from `VYRO_BANK_*` env vars (see Secrets below).
- Computes live FX equivalents (USD/EUR/GBP) from the PO's `fxSnapshotId`.
- Stamps `paymentMethod='wire'`, `paymentInitiatedAt`, `paymentInitiatedByUserId`.
- Writes `audit_logs.action = 'cross_border.wire_initiated'`.
- Emits Analytics Engine metric `cross_border.wire_initiated`.

Returns the supplier-facing instruction block (beneficiary, IBAN, SWIFT/BIC,
intermediary bank, reference = `VYRO-<poNumber>`, memo).

**Supplier/finance confirmation:** admin records the received wire at
`/admin/orders/:id`. > 1% delta requires an explicit `acknowledgeMismatch`
checkbox; the system records the ack in
`audit_logs.action = 'cross_border.wire_received'`. Metric
`cross_border.wire_mismatch_rate` warns at > 5% acks per hour.

If the wire never arrives within 14 days, finance should mark the order
`cancelled` with reason `wire_timeout`.

**Secrets (production):** the beneficiary block is sourced from worker secrets
(via `[env.production.vars]` only as documentation). Required:

```
VYRO_BANK_BENEFICIARY_NAME
VYRO_BANK_BENEFICIARY_ADDRESS
VYRO_BANK_NAME
VYRO_BANK_ADDRESS
VYRO_BANK_ACCOUNT_NUMBER
VYRO_BANK_SWIFT_BIC
VYRO_BANK_IBAN              (optional)
VYRO_BANK_INTERMEDIARY_NAME (optional)
VYRO_BANK_INTERMEDIARY_SWIFT (optional)
VYRO_BANK_REFERENCE_PREFIX  (defaults to "VYRO")
```

Without `VYRO_BANK_BENEFICIARY_NAME` / `VYRO_BANK_SWIFT_BIC` /
`VYRO_BANK_ACCOUNT_NUMBER` set, the wire endpoint returns 503
`WIRE_INSTRUCTIONS_UNCONFIGURED` — suppliers can still record received wires
manually.

### Customs documents

`INVOICES` R2 bucket holds commercial invoices + packing lists. The
`/api/admin/orders/:id/customs-docs` route accepts multipart PDF upload,
stores under `cross-border/<poId>/<docId>.pdf`, and emits a `cleared`
`customsStatus` once finance marks it so.

Ship transition is blocked if `direction != 'domestic'` and no commercial
invoice is on file.

### Metrics to watch

| Metric                                       | When                            |
|----------------------------------------------|---------------------------------|
| `cross_border.order_created`                 | Volume gauge                    |
| `cross_border.sanctions_blocked`             | Spike = blocklist change needed |
| `cross_border.restricted_blocked`            | Product catalog review          |
| `cross_border.wire_mismatch_rate` (SLO warn) | > 5% acks / 1h                  |
| `cross_border.fx_unavailable_burst` (SLO crit)| > 3 fails / 5min               |

