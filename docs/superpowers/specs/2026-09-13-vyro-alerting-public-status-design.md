# Vyro Alerting + Public Status

**Date:** 2026-09-13
**Status:** Approved design, pending implementation
**Parent:** `docs/runbook.md` (incident response section), existing observability
primitives shipped in `2026-09-05-vyro-observability-design.md`,
`2026-09-06-vyro-admin-observability-design.md`, and
`2026-09-09-vyro-admin-queue-ops-design.md`.

## 1. Background

Vyro already has the **collection** side of observability:

- Structured JSON logger + access log middleware
  (`apps/api/src/lib/logger.ts`, `apps/api/src/middleware/accessLog.ts`).
- Analytics Engine `METRICS` binding writing per-request counters and
  timings to dataset `vyro_metrics` (`apps/api/src/lib/metrics.ts`).
- `/api/health` endpoint with DB ping + version
  (`apps/api/src/modules/health/`).
- `/admin/observability` admin console with health tiles, cron list, and
  manual trigger (`apps/api/src/modules/admin/observability/`).
- `/admin/observability/queues` queue ops dashboard with backlog,
  throughput sparkline, retry UI, and manual enqueue.
- `wrangler tail --status error` for live request logs.

What is **missing** for "alerting + public status", the gap between
"collecting telemetry" and "running production operations":

- No alert rule engine. Telemetry exists but nobody is watching it.
- No external paging path. Slack and email are unconfigured for ops.
- No public status page. B2B buyers cannot self-check uptime.
- No real user monitoring (RUM). Backend p95 is healthy while the SPA is
  throwing in the browser.
- No SLO definitions. No threshold for "is this a problem".
- No dedupe / cooldown. Any future alert source would spam Slack.
- No meta-observability: if the sweep itself dies, nothing notices.

Solo founder, free-tier tools only, Slack + email channels, public status
page for buyers. Existing platform primitives stay untouched.

## 2. Goals

1. Add an alert rule engine running on the existing cron scheduler that
   evaluates Analytics Engine SQL + D1 health + payment-event lag + queue
   depth against declared SLO thresholds.
2. Breach → Slack incoming webhook + email via Resend free tier. Cooldown
   prevents spam. Severity escalation overrides cooldown.
3. Public status page at `status.vyro.lk` (CNAME to Worker route) backed
   by a JSON endpoint reflecting per-component health and active
   incidents.
4. Real User Monitoring via Cloudflare Web Analytics (free, drop-in
   beacon) capturing Core Web Vitals + JS errors in the SPA.
5. External uptime probes via UptimeRobot free tier (5-minute interval,
   two regions, public status page ping target).
6. Admin UI under `/admin/observability/alerts` listing alert history,
   current rule state, silence controls.
7. Meta-observability: stale-sweep detection, sweep error counter,
   "sweep down" alarm via CF Workers Tail alarm (independent of AE).

## 3. Non-goals

- PagerDuty / Opsgenie / on-call rotation. Solo founder. Slack + email
  suffice. Revisit when team > 3.
- Log search UI. `wrangler tail --search "..."` is the path. Logflare /
  Logpush not adopted.
- Per-tenant SLO customization. Single tenant platform; global thresholds.
- Distributed tracing. Workers has no APM SDK. Defer.
- Multi-region failover. Single Worker origin. Defer.
- Status page custom domain paid plan. Free-tier UptimeRobot + custom
  Worker route suffice.

## 4. Architecture

```
                                ┌─────────────────────────────┐
                                │ Cloudflare Web Analytics    │
                                │  (beacon.min.js, free RUM)  │
                                └──────────────┬───────────────┘
                                               │ page views + CWV
                                               ▼
┌──────────────────────┐  /api/*    ┌──────────────────────────────┐
│ SPA (apps/web)       │ ─────────► │ CF Worker (apps/api)         │
│  + /status page      │            │  ├─ requestId + accessLog    │
└──────────────────────┘            │  ├─ METRICS.writeDataPoint   │
                                    │  └─ routes                   │
                                    └────┬──────────────────┬──────┘
                                         │                  │
                            writes AE    │                  │  writes D1
                            (counters,   │                  │  (queue_events,
                             timings)    │                  │   payment_events,
                                         │                  │   admin_audit_logs)
                                         ▼                  ▼
                                   ┌──────────┐       ┌──────────────┐
                                   │ vyro_    │       │ D1 (vyro)    │
                                   │ metrics  │       │              │
                                   │ (AE SQL) │       └──────────────┘
                                   └────┬─────┘
                                        │ SQL every 5 min
                                        ▼
┌─────────────────────────────────────────────────────────────┐
│ cron: observabilitySweep                                    │
│   - reads rules.ts                                          │
│   - queries METRICS via Analytics Engine SQL API            │
│   - checks D1 health, payment-event lag, queue depth        │
│   - dedupe via KV ALERTS_KV cooldown keys                   │
│   - on breach: notification row + audit row + Slack + email │
│   - updates status:<component> keys in KV                   │
└────┬─────────────────────────┬─────────────────┬────────────┘
     │ writes                  │ writes          │ sends
     ▼                         ▼                 ▼
┌────────────┐         ┌──────────────┐    ┌──────────────┐
│ KV         │         │ notifications│    │ Slack webhook│
│ ALERTS_KV  │         │ table        │    │ + Resend API │
└────┬───────┘         └──────────────┘    └──────────────┘
     │ reads
     ▼
┌──────────────────────┐    polls every 30s    ┌─────────────────────┐
│ /status.json         │ ◄─────────────────────│ /status SPA page    │
│ /status              │                       │ (no auth)           │
└──────────────────────┘                       └─────────────────────┘

External: UptimeRobot → /api/health + /status.json (2 regions, 5-min)
External: CF Workers Tail alarm → sweep crash handler → Slack
```

## 5. Data model

### 5.1 Analytics Engine — `vyro_metrics` (existing, extended)

The existing `metric()` helper at `apps/api/src/lib/metrics.ts` is the
write surface. New metric names added by this spec:

| Metric name              | Blobs                                  | Double   | Index     |
|--------------------------|----------------------------------------|----------|-----------|
| `sweep.duration_ms`      | `['sweep', '<rule_set>']`              | ms       | `sweep`   |
| `sweep.rule_evaluations` | `['rule', '<rule_name>', '<verdict>']` | 1        | `rule`    |
| `sweep.rule_errors`      | `['rule', '<rule_name>']`              | 1        | `rule`    |
| `sweep.crash`            | `[]`                                   | 1        | `sweep`   |
| `alert.fired`            | `['<rule_name>', '<severity>']`        | 1        | `rule`    |
| `alert.send_failure`     | `['<channel>', '<rule_name>']`         | 1        | `channel` |

Existing metrics (`http.access`, `queue.*`, etc.) consumed by sweep
queries — no new writes from request handlers.

### 5.2 KV — `ALERTS_KV` binding (new)

Two key families:

**Cooldown keys** — `cooldown:<rule_name>:<window_bucket>`

- Value: `{ firedAt: number, severity: string, value: number }`.
- TTL: 30 min default, per-rule overridable.
- Purpose: prevent same (rule, window) from re-firing within cooldown.

**Status cache keys** — `status:<component>`

- Value: `{ status: 'operational'|'degraded'|'down', updatedAt: number, detail?: string }`.
- TTL: 1 hour (sweep refreshes).
- Purpose: power `/status.json` without DB hit.

**Silence keys** — `silenced:<rule_name>`

- Value: `{ silencedBy: string, reason: string, expiresAt: number }`.
- TTL: duration of silence.
- Purpose: skip a rule temporarily via admin action.

### 5.3 D1 — `notifications` table (existing, reused)

New `category = 'observability_alert'` rows. Same envelope as existing
admin alerts (`recipient_role`, `userId`, `severity`, `source_ref`,
`source='admin'`). Cron handler writes rows that map to the recipient
list from the rule definition.

### 5.4 D1 — `admin_audit_logs` (existing, reused)

Every alert fire writes one audit row:

```ts
{
  action: 'observability.alert.fired',
  actor_user_id: null,           // system
  target_type: 'rule',
  target_id: '<rule_name>',
  metadata: { severity, value, threshold, channels }
}
```

### 5.5 No new tables

All persistence is in AE, KV, or pre-existing D1 tables. No migrations.

## 6. SLO rules

Authored once in `packages/shared/src/slo.ts`, imported by both sweep
and admin UI for display.

```ts
export type SloRule = {
  name: string;                          // unique, kebab-case
  component: 'api' | 'payments' | 'queues' | 'cron' | 'web';
  description: string;                   // human-readable
  query: SloQuery;                       // AE SQL or D1/SQL helper
  comparator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold: number;
  window: '5m' | '15m' | '1h' | '24h';
  severity: 'info' | 'warning' | 'critical';
  cooldownSec: number;                   // default 1800
  channels: AlertChannel[];
  recipients: { role: string }[];        // who gets the in-app row
  escalation?: { severity: 'critical'; afterSec: number };  // override cooldown
  doc?: string;                          // SLO doc URL fragment
};

export type AlertChannel = 'slack' | 'email' | 'in_app';

export type SloQuery =
  | { kind: 'ae_sql'; sql: string }                       // parameterized
  | { kind: 'd1_health' }
  | { kind: 'payment_lag'; maxAgeSec: number }
  | { kind: 'queue_depth'; queue: string; max: number }
  | { kind: 'staleness'; key: string; maxAgeSec: number }; // KV key freshness
```

Initial rule set shipped with this spec:

| Rule name              | Component  | Query                                  | Comparator | Threshold | Window | Severity | Cooldown |
|------------------------|------------|----------------------------------------|------------|-----------|--------|----------|----------|
| `api.error_rate_5xx`   | api        | AE `5xx / total`                       | `gt`       | `0.01`    | `5m`   | warning  | 30m      |
| `api.error_rate_5xx_critical` | api | AE `5xx / total`                       | `gt`       | `0.05`    | `5m`   | critical | 15m      |
| `api.p95_latency_ms`   | api        | AE QUANTILE(latencyMs, 0.95)           | `gt`       | `1500`    | `5m`   | warning  | 30m      |
| `d1.health`            | api        | D1 health ping                         | `eq`       | `0`       | `1m`   | critical | 10m      |
| `payments.event_lag`   | payments   | MAX(age) on `payment_events` last 100  | `gt`       | `300`     | `15m`  | warning  | 30m      |
| `payments.reconcile_drift` | payments | admin reconciliation unmatched count   | `gt`       | `5`       | `1h`   | warning  | 60m      |
| `queues.depth`         | queues     | queue depth per queue                  | `gt`       | `1000`    | `5m`   | warning  | 30m      |
| `queues.dlq`           | queues     | DLQ count from `queue_events`           | `gt`       | `0`       | `15m`  | critical | 15m      |
| `cron.last_run`        | cron       | cron_registry stale rows               | `gt`       | `86400`   | `1h`   | warning  | 60m      |
| `web.cwv_p75_lcp_ms`   | web        | AE p75 LCP (RUM beacon)                | `gt`       | `4000`    | `1h`   | info     | 120m     |
| `sweep.stale`          | meta       | KV `status:updated_at` staleness       | `gt`       | `900`     | `15m`  | critical | 10m      |

Rules shipped disabled (`enabled: false`) until first smoke. Toggled on
rule-by-rule via the admin UI.

## 7. Components

### New files

```
apps/api/src/observability/
  index.ts                  barrel
  rules.ts                  rule type + initial ruleset loader
  evaluator.ts              rule → query → verdict
  aeClient.ts               Analytics Engine SQL helper (typed)
  cooldown.ts               KV dedupe
  notify.ts                 Slack + Resend senders + retry
  silence.ts                read/write silence keys
  status.ts                 component health aggregator
  types.ts                  shared types

apps/api/src/cron/
  observabilitySweep.ts     5-min cron entrypoint

apps/api/src/routes/
  publicStatus.ts           /status.json + /status
  adminAlerts.ts            /api/admin/observability/alerts/*

apps/web/src/pages/
  StatusPage.tsx            public status (no auth)
  admin/ObservabilityAlertsPage.tsx
  admin/components/AlertRuleCard.tsx
  admin/components/AlertHistoryTable.tsx
  admin/components/SilenceDialog.tsx

apps/web/src/lib/
  useStatus.ts              polls /status.json
  useAlertRules.ts          react-query hook

packages/shared/src/slo.ts   rule schema + initial ruleset
packages/shared/src/status.ts  status component schema

scripts/smoke/observability.ts   post-deploy smoke
scripts/load/sweep.js            k6 load on sweep
```

### Modified files

```
apps/api/wrangler.toml      add [[kv_namespaces]] binding ALERTS_KV,
                            add cron "*/5 * * * *",
                            add vars ALERT_SLACK_CHANNEL, STATUS_PAGE_ORIGIN
apps/api/src/worker.ts      wire cron + routes
apps/api/src/cron/index.ts  register observabilitySweep
apps/api/src/routes/admin/testHarness.ts  /api/admin/_test/5xx-burst
                                            CSRF-exempt, super_admin only,
                                            returns 500 for N requests to
                                            drive SLO verification
apps/web/index.html         inject CF Web Analytics beacon
apps/web/src/router.tsx     add /status route, add /admin/observability/alerts
apps/web/src/lib/rum.ts     CWV beacon writer (sendBeacon → /api/metrics/web)
```

## 8. Sweep data flow

```
every 5 min:
  1. cron observabilitySweep(env) invoked
  2. load rules from packages/shared/src/slo.ts
  3. for each rule:
       a. if silenced in KV → skip, continue
       b. run query:
            AE SQL → POST /accounts/{id}/analytics_engine/sql
            D1     → env.DB.prepare(...)
            KV     → env.ALERTS_KV.get(...)
       c. compare result against threshold
       d. compute verdict: { ok, value, severity }
       e. if !ok:
            i.   cooldown key check in KV
            ii.  if past cooldown OR escalation triggered → fire
            iii. fire: insert notifications row, write audit row,
                 send Slack (best effort + retry once),
                 send email via Resend (best effort + retry once),
                 write cooldown key with TTL,
                 increment alert.fired counter
       f. always update status:<component> in KV
  4. emit sweep.duration_ms counter
  5. update status:updated_at sentinel
  6. if any unhandled exception → emit sweep.crash counter,
     CF Workers Tail alarm routes to alarmHandler → Slack "sweep down"
```

AE SQL is rate-limited at 10 req/sec per account. With ≤ 11 rules the
sweep stays well under. Future scale: split rules across multiple
sweeps.

## 9. Public status page

`/status.json` shape (served from KV cache, refreshed by sweep):

```ts
{
  components: {
    api:      { status: 'operational'|'degraded'|'down', updatedAt, detail? },
    payments: { ... },
    queues:   { ... },
    cron:     { ... },
    web:      { ... }
  },
  incidents: Array<{
    id: string;
    title: string;
    severity: 'info'|'warning'|'critical';
    startedAt: number;
    resolvedAt?: number;
    components: string[];   // affected
    updates: Array<{ at: number; message: string }>;
  }>,
  updatedAt: number;
  version: string;          // build SHA
}
```

`/status` HTML page rendered by SPA. Polls `/status.json` every 30 s.
No authentication. CF Web Analytics tracks page views (free RUM). No
content negotiation — pure JSON + SPA.

Incident lifecycle managed via admin UI:

- `POST /api/admin/observability/incidents` create
- `PATCH /api/admin/observability/incidents/:id` add update
- `POST /api/admin/observability/incidents/:id/resolve` close

All write endpoints require `observability:write`, audited as
`observability.incident.*`.

External status subdomain: `status.vyro.lk` CNAME to the Worker origin
(`vyro-api.thufailahamed627.workers.dev`). Routed via CF Workers Routes
filter `status.vyro.lk/*`. Falls back to existing `/status` SPA.

## 10. Notification channels

### Slack

- Env: `ALERT_SLACK_WEBHOOK_URL` (secret). Single webhook per env.
- Block Kit payload:
  ```
  {
    text: '🚨 [<severity>] <rule_name>',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '[<severity>] <rule_name>' } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: '*Component*\n<component>' },
        { type: 'mrkdwn', text: '*Value*\n<value>' },
        { type: 'mrkdwn', text: '*Threshold*\n<threshold>' },
        { type: 'mrkdwn', text: '*Window*\n<window>' }
      ]},
      { type: 'context', elements: [
        { type: 'mrkdwn', text: 'Doc: <doc_url> | Silence: /admin/observability/alerts' }
      ]}
    ]
  }
  ```
- Retry policy: 1 retry on 5xx/timeout within same sweep cycle, then
  drop. Counter `alert.send_failure{channel=slack}`.

### Email (Resend)

- Env: `RESEND_API_KEY` (secret), `OPS_EMAIL` (var, e.g. `ops@vyro.lk`).
- Plain transactional HTML + text body mirroring Slack payload.
- From: `Vyro Ops <ops@vyro.lk>` (Resend free tier allows custom
  sending domain with DNS records — set up in CF DNS).
- Same retry policy as Slack.

### In-app

- Always-on via `notifications` table, mirrors admin notification
  pattern. Header bell surfaces for users with `notification:read`.

## 11. RUM (Cloudflare Web Analytics)

Single line in `apps/web/index.html`:

```html
<script defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "<CF_WEB_ANALYTICS_TOKEN>"}'></script>
```

- Token obtained from CF dashboard → Web Analytics → Add site →
  `status.vyro.lk` + `app.vyro.lk` (two sites).
- Captures Core Web Vitals (LCP, INP, CLS), page load time, JS errors.
- No PII token; the beacon is anonymous.

In addition to the CF-hosted beacon, the SPA writes a small custom
datapoint to our own `vyro_metrics` Analytics Engine dataset on every
page load. A single helper `apps/web/src/lib/rum.ts`:

```ts
import { metricClient } from '@vyro/shared/metrics-client';
metricClient('web.cwv', {
  lcp_ms: lcpValue,
  inp_ms: inpValue,
  cls: clsValue,
  route: location.pathname,
});
```

Posts via `navigator.sendBeacon` to `/api/metrics/web` (CSRF-exempt,
rate-limited at 60/min/IP, no auth, writes to AE). Sweep rule
`web.cwv_p75_lcp_ms` queries AE directly — full data ownership, no
dependency on CF dashboard API changes.

## 12. External uptime (UptimeRobot)

- Two monitors, 5-minute interval:
  - `https://vyro-api.thufailahamed627.workers.dev/api/health`
  - `https://vyro-api.thufailahamed627.workers.dev/status.json`
- Two regions per monitor (free tier allows 1 region; paid for multi).
  Solo founder: single region accepted, document as known gap.
- UptimeRobot Slack integration posts to `#vyro-uptime` on status
  change (down/up).
- Failures also open a status incident automatically via UptimeRobot
  webhook → `POST /api/admin/observability/incidents/external`
  (gated by shared HMAC signature, requires `observability:write`
  service token).

## 13. Admin UI

### `/admin/observability/alerts`

Three tabs, gated on `observability:read`:

1. **Rules** — list of SLO rules with current value (live from latest
   sweep), threshold, last-fire timestamp, enabled toggle. Per-row
   "Silence…" button → modal with reason + duration.
2. **History** — paginated table of past fires (last 100). Columns:
   time, rule, severity, value, channels, status (`sent`|`failed`).
   Filter by rule / severity / time range.
3. **Silences** — active silences with countdown + cancel button.

Permissions:

- `observability:read` — view rules, history, silences.
- `observability:write` — toggle rule, silence/unsilence, manage
  incidents.

Added to existing `super_admin` and `ops` roles. `finance` and `support`
unchanged.

### `/admin/observability/incidents`

Manual incident management (create, update, resolve) for cases the
auto-detector misses. Required when UptimeRobot reports false negative.

## 14. Cron changes

`wrangler.toml` `[triggers]` adds `"*/5 * * * *"`. Existing crons
(`0 3 * * *`, `*/15 * * * *`, `0 * * * *`, `0 4 * * *`, `0 5 * * *`,
`17 7 * * *`) untouched.

`apps/api/src/cron/index.ts` registers `observabilitySweep` in addition
to existing handlers. Manual trigger via
`POST /api/admin/cron/observabilitySweep/run` for ops testing.

## 15. Secrets and config

New in `wrangler.toml` `[vars]`:

- `STATUS_PAGE_ORIGIN` — `https://status.vyro.lk`.
- `CF_ACCOUNT_ID` — Cloudflare account id (may already exist per
  runbook queue ops section; reuse).
- `CF_WEB_ANALYTICS_TOKEN` — beacon token.
- `OPS_EMAIL` — recipient address.
- `UPTIMEROBOT_WEBHOOK_SECRET` — HMAC secret for UptimeRobot callbacks.

New secrets (set via `wrangler secret put`):

- `ALERT_SLACK_WEBHOOK_URL`
- `RESEND_API_KEY`

Existing `CF_API_TOKEN` reused for AE SQL queries.

DNS changes (manual, not in this repo):

- `status.vyro.lk` CNAME to `vyro-api.thufailahamed627.workers.dev`.
- CF Workers Route: `status.vyro.lk/*` → `vyro-api` worker.
- Resend DNS records (SPF, DKIM, DMARC) on `vyro.lk`.

## 16. Error handling

- Sweep: try/catch around each rule; rule error → counter, continue.
  Whole sweep error → counter + CF Workers Tail alarm → alarmHandler
  → Slack "sweep down" (independent path, never gated on AE).
- Channel send: best-effort with one retry; second failure increments
  `alert.send_failure`, drops cycle. Never bubbles.
- AE SQL: 4xx (bad query) → disable rule, post Slack "rule disabled:
  bad query", surface in admin UI. 5xx/timeout → retry once, then skip
  cycle. Counter `ae_query_failure`.
- Status page staleness: if `status:updated_at` > 15 min old, `/status`
  renders yellow "data may be stale" banner. If > 30 min, status
  defaults to "unknown".
- PII: rule payloads never include `user_id`, `phone`, `email`. Slack
  and email templates pull from rule metadata only.

## 17. Testing

### Unit (vitest)

- `packages/shared/src/slo.ts` — Zod parse, comparator math, window
  math, cooldown bucket key.
- `apps/api/src/observability/cooldown.ts` — KV mock; under cooldown
  → no fire; past cooldown → fire; severity escalation fires
  regardless.
- `apps/api/src/observability/notify.ts` — fetch mock; 200 ok, 5xx
  retry, second 5xx drops, channel flag set on 4xx.
- `apps/api/src/observability/evaluator.ts` — mock AE + D1; rule passes
  → no fire; rule fails → fire; rule disabled → skip.

### Integration (`@cloudflare/vitest-pool-workers`)

- `apps/api/src/cron/observabilitySweep.integration.test.ts` — real
  D1 + KV, mock AE SQL endpoint, mock Slack/Resend fetch. Asserts:
  - One fire inserts one notification + one audit row.
  - Cooldown suppresses second fire within window.
  - Severity escalation fires despite cooldown.
  - KV cooldown key written with correct TTL.
  - Status cache updated per component.
- `apps/api/src/routes/publicStatus.test.ts` — GET `/status.json`
  returns KV-derived shape; staleness flag flips when sentinel older
  than threshold.

### Contract

- Slack payload golden file in `apps/api/src/observability/__fixtures__/slack.alerts.json`.
- Email HTML snapshot.
- `/status.json` Zod schema in `packages/validation/src/status.ts`.

### Load

- k6 `scripts/load/sweep.js` — 50 concurrent sweep invocations for 2
  min. Asserts: sweep p95 < 500 ms, no AE rate-limit hits, no OOM.

### Smoke (post-deploy)

- `scripts/smoke/observability.ts` — hits `/api/health`, `/status.json`;
  injects a synthetic 5xx via admin test endpoint; waits one sweep
  cycle; asserts Slack webhook received payload via UptimeRobot-style
  listener.

### Manual

- Runbook step added to `docs/runbook.md` "Incident response" section:
  "Verify sweep health: check `/api/admin/observability/alerts` history
  shows recent runs. If stale, trigger manually via cron UI."

## 18. Phases

1. Add `ALERTS_KV` binding + cron `*/5 * * * *` to `wrangler.toml`.
2. Implement `packages/shared/src/slo.ts` rule schema + initial
   ruleset (all disabled).
3. Implement `apps/api/src/observability/evaluator.ts` + `cooldown.ts`
   + `notify.ts` with mocks.
4. Implement `observabilitySweep` cron + register.
5. Wire `/status.json` + `/status` route.
6. Add admin `/admin/observability/alerts` UI.
7. Inject CF Web Analytics beacon into `apps/web/index.html`.
8. Configure UptimeRobot monitors (manual, documented in runbook).
9. Configure Slack webhook + Resend DNS + secrets.
10. Enable rules one at a time (smoke each).
11. Promote `*/5 * * * *` cron to production `wrangler.toml`.
12. Update runbook with new incident response path.

## 19. Rollback

- Remove cron entry + `observabilitySweep` registration → sweep stops.
- Keep KV bindings; data ages out.
- Remove admin UI route → no user impact.
- Revert DNS for `status.vyro.lk` if it was the only reason for the
  CNAME.
- Re-enable Beacon removal from `index.html` reverts RUM.
- Slack webhook removal stops Slack; in-app `notifications` rows remain.

## 20. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AE SQL rate limit (10/s) breached | 11 rules, well under. Future batches split cron. |
| Sweep itself crashes → blind | Tail alarm routes to alarmHandler independent of AE. |
| Slack spam during incident | Cooldown 30 min default. Escalation only. Per-rule override. |
| Public status lies during sweep outage | Staleness banner + status flips to "unknown" past 30 min. |
| Resend free tier cap (100/day, 3k/mo) exceeded | Cooldown caps fires. If breached, drop email channel, keep Slack. |
| UptimeRobot false positives from region flakiness | Single region acceptable for solo founder; document as known gap. |
| RUM token leak | Public token only; safe by design. No PII in beacon. |
| DNS for `status.vyro.lk` misconfigured | Worker still serves `/status` at original origin as fallback. |

## 21. Acceptance criteria

1. `observabilitySweep` runs every 5 min in production without errors.
2. Triggering a synthetic 5xx burst via admin test endpoint fires the
   `api.error_rate_5xx` rule within one sweep cycle.
3. Slack channel `#vyro-ops` receives a Block Kit payload matching
   golden fixture.
4. Email `ops@vyro.lk` receives matching HTML + text body.
5. `notifications` table contains one row per fire with
   `category='observability_alert'`.
6. `admin_audit_logs` contains matching `observability.alert.fired` row.
7. Re-firing within cooldown produces no second Slack/email/notification.
8. Severity escalation fires immediately on critical threshold.
9. `/status.json` returns current component health, updated within one
   sweep cycle of last evaluation.
10. `/status` SPA page renders all components and active incidents,
    polls every 30 s.
11. CF Web Analytics dashboard shows SPA page views + CWV within 24h
    of beacon deployment.
12. UptimeRobot shows both monitors "up" in green for at least one
    5-min cycle.
13. Admin UI `/admin/observability/alerts` shows rule list, history,
    silences with correct RBAC gating.
14. Killing the sweep cron produces a "sweep stale" status page banner
    and a Tail-alarm Slack alert within 15 min.

## 22. Out of scope (deferred)

- PagerDuty / Opsgenie integration.
- Log search UI / Logflare.
- Per-tenant SLO customization.
- Distributed tracing.
- Multi-region failover.
- Synthetic browser checks (Checkly / Playwright) — would multiply
  free-tier cost.
- AI-based anomaly detection on metrics.
- Status page i18n (Sinhala, Tamil) — single locale for v1.