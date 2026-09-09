---
title: Admin Queue & Jobs Operations
status: approved
date: 2026-09-09
---

# Admin Queue & Jobs Operations

## Problem

Vyro's admin portal today has no visibility into the three Cloudflare Queues
(`audit`, `notifications`, `invoices`) that carry every write-side event in
the platform. Producers and consumers write nothing structured; failures
disappear into `console.error`. When a notification fails to send or an OCR
job loops forever, ops have no way to:

- see backlog or throughput per queue,
- inspect failed message payloads,
- retry a single failure or bulk-replay after an incident,
- manually enqueue a test message.

The platform runs blind on its own async infrastructure.

## Goal

Give admins real-time visibility and operational control over the three
queues without changing producer semantics or consumer contracts. Four
capabilities: overview dashboard, failed-message list, manual enqueue,
bulk DLQ-style replay.

Out of scope for this spec: automated DLQ consumer wiring (Cloudflare-side),
per-supplier rate-limit overrides, webhook retry UI.

## Non-goals

- Replacing Cloudflare's built-in retry/DLQ behavior.
- Cross-queue analytics beyond what one page needs.
- A general "jobs" framework (cron jobs already exist under
  `/admin/observability` and are not touched here).

## Architecture

```
producer (existing send site)
   ├─ env.<QUEUE>.send(payload)
   └─ recordQueueEvent(env, queue, 'enqueue', msgId, payload)   ← new

queue consumer (existing handler)
   ├─ recordQueueMetric(env, 'queue.consume.start', queue, 0)
   ├─ process
   ├─ on ack → recordQueueMetric(env, 'queue.ack', queue, ms)
   ├─ on retry → D1 INSERT queue_events + recordQueueMetric('queue.retry')
   └─ on dlq → D1 INSERT queue_events + recordQueueMetric('queue.dlq')

D1 queue_events  ←  retry / dlq rows only (durable payload retention)
Analytics Engine  ←  every event (counters + latency)

Admin SPA → /admin/observability/queues
Cron prune (nightly) → DELETE queue_events older than 7 days
```

Two storage paths chosen for clean separation:

- **Analytics Engine** for time-series (already provisioned via `METRICS`
  binding; budgeted for AI). Cheap rollups, SQL queryable.
- **D1 `queue_events`** only for actionable rows (`retry`/`dlq`/`manual`)
  that carry payload + error. This is the retry surface.

AE never used as retry source — payloads are not durable there.

## Data model

### D1 — `queue_events` (new table, migration 0021)

```ts
queue_events {
  id            text pk,           // ulid
  queue         text not null,     // 'audit' | 'notifications' | 'invoices'
  msg_id        text not null,     // Cloudflare msg.id
  event         text not null,     // 'retry' | 'dlq' | 'manual'
  actor_user_id text null,         // set for 'manual' admin sends
  payload_json  text null,         // original send body
  error         text null,         // error message on retry/dlq
  created_at    int not null,      // unix ms
}
indexes:
  idx_queue_created   (queue, created_at desc)
  idx_event_created   (event, created_at desc)
  idx_created         (created_at)         // for cron prune
```

Only `retry`, `dlq`, `manual` events write rows. `enqueue` and `ack`
write only to AE (no D1 churn). Storage bounded by 7-day prune + the
fact that retries are rare relative to acks.

### Analytics Engine — `METRICS` (existing)

Reuses the existing `env.METRICS` binding. Writers must use the existing
`metric()` helper in `apps/api/src/lib/metrics.ts` for consistency.

Per queue event:

```
blobs:   ['queue.<eventName>', queue, '<eventType>']   e.g. ['queue.ack', 'audit', 'ack']
doubles: [latencyMs] for consume events, 1 for counters
indexes: [queue]    // grouping key for SQL
```

Dashboard queries go through the Cloudflare Analytics Engine SQL API
(`/accounts/{id}/analytics_engine/sql`) using a new `CF_ACCOUNT_ID`
+ `CF_API_TOKEN` (Analytics Engine read scope) secrets.

## API contracts

All routes live under `/api/admin/queues/*`. Every route requires an
authenticated admin. Reads require `queues:read`; writes require
`queues:write`. Both permissions are added to the role schema and
default-granted on the existing `admin` role.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET    | `/api/admin/queues/health` | — | `{ queues: QueueHealth[] }` |
| GET    | `/api/admin/queues/events` | `?queue=&event=&limit=&before=` | `{ events: QueueEvent[] }` |
| POST   | `/api/admin/queues/retry/:eventId` | `{ editedPayload?: object }` | `{ ok, newMsgId }` |
| POST   | `/api/admin/queues/retry-bulk` | `{ eventIds: string[], editedPayload?: object }` | `{ ok, replayed, failed }` |
| POST   | `/api/admin/queues/enqueue` | `{ queue, payload }` | `{ ok, msgId, eventId }` |

```ts
type QueueHealth = {
  queue: 'audit' | 'notifications' | 'invoices';
  backlog: number;         // approximate, from Cloudflare queue API
  ackLast1h: number;       // AE count, last 60 min
  errLast1h: number;       // AE count of retry+dlq, last 60 min
  p50Ms: number;           // AE quantile, last 60 min
  p95Ms: number;           // AE quantile, last 60 min
};

type QueueEvent = {
  id: string;
  queue: string;
  msgId: string;
  event: 'retry' | 'dlq' | 'manual';
  actorUserId: string | null;
  error: string | null;
  createdAt: number;
  // payload returned only when fetched explicitly via /events/:id/payload
};
```

Every successful write endpoint emits an `admin_audit_logs` row via the
existing `AUDIT_QUEUE.send` with action `queue.retry.single`,
`queue.retry.bulk`, or `queue.enqueue.manual`, plus the admin's user id
and target ids.

`POST /retry/:eventId` reads the payload from `queue_events`, optionally
applies the admin's edit, then calls the source `QUEUE.send(payload)`. The
new message id is returned and a new `queue_events` row (`event='manual'`)
records the replay.

Bulk retry runs in series (max 100 ids per call) to avoid stampeding
the consumer. Per-message failures are collected in the response and
do not abort the batch.

## Permissions

Two new permissions, both seeded into the existing `admin` role:

- `queues:read` — view health, list events, view payloads.
- `queues:write` — retry, bulk replay, manual enqueue.

Schema change is additive; existing roles unchanged. Documented in the
role schema in `apps/api/src/modules/admin/roles/schema.ts` and surfaced
in the `RolesPage` permission matrix.

## UI

New page mounted at `/admin/observability/queues`, rendered inside the
existing `AdminShell` observability section. Reuses
`apps/web/src/admin/lib/useAdminTable.ts` and `useSavedViews.ts`.

Sections, top-to-bottom:

1. **Queue tiles** — three cards (audit, notifications, invoices).
   Each shows backlog, ack count last 1h, error count last 1h,
   p50 / p95 latency. Clicking a card filters the rest of the page.
2. **Throughput sparkline** — last 24h, all three queues overlaid.
   5-minute buckets via AE SQL.
3. **Failed messages table** — paginated, filter by queue / event type.
   Columns: queue, msg id (truncated), event, error, timestamp.
   Row actions: Retry (single), View payload (modal JSON viewer).
4. **Bulk select + replay** — checkbox per row, "Replay N selected"
   button. Confirm dialog shows count + target queue.
5. **Manual enqueue** (collapsible card, gated by `queues:write`) —
   queue dropdown, JSON editor with monospace styling, payload-shape
   hints per queue (object schema pulled from the queue's known send
   sites), Send button with double-confirm.

Hooks:

- `apps/web/src/admin/useAdminQueues.ts` — single hook returning
  `{ health, events, retry, retryBulk, enqueue }` with react-query
  style cache. Mutations invalidate the events list.

Component layout lives in `apps/web/src/admin/QueuesPage.tsx`. Tests in
`QueuesPage.test.tsx`.

## Instrumentation touchpoints

New module `apps/api/src/lib/queueInstrument.ts`:

```ts
export function recordQueueMetric(
  env: Env,
  eventName: 'queue.consume.start' | 'queue.ack' | 'queue.retry' | 'queue.dlq' | 'queue.enqueue',
  queue: 'audit' | 'notifications' | 'invoices',
  latencyMs: number,
): void;

export async function recordQueueEvent(
  env: Env,
  queue: 'audit' | 'notifications' | 'invoices',
  event: 'retry' | 'dlq' | 'manual',
  msgId: string,
  payload: unknown,
  error?: string,
  actorUserId?: string,
): Promise<void>;  // D1 INSERT, swallows errors
```

Producer wrapping — single helper `apps/api/src/lib/queue.ts`:

```ts
export async function queueSend(
  env: Env,
  queue: 'audit' | 'notifications' | 'invoices',
  payload: unknown,
): Promise<void> {
  await env[`${queue.toUpperCase()}_QUEUE`].send(payload as any);
  recordQueueMetric(env, 'queue.enqueue', queue, 0);
}
```

All existing producer call sites migrate to `queueSend()`:

- `apps/api/src/modules/cspReport/repository.ts`
- `apps/api/src/modules/documents/routes.ts`
- `apps/api/src/modules/notifications/dispatcher.ts`
- `apps/api/src/modules/notifications/routes.ts`

Consumer wrapping — instrument each handler in
`apps/api/src/queue/{audit,notifications,invoiceOcr}.ts` to:

- call `recordQueueMetric(env, 'queue.consume.start', queue, 0)` at top,
- record `Date.now()` as `t0`,
- on `msg.ack()`: `recordQueueMetric(env, 'queue.ack', queue, Date.now()-t0)`,
- on `msg.retry()`: `await recordQueueEvent(env, queue, 'retry', msg.id, body, errMsg)` then metric,
- DLQ hook left as a `// TODO: cloudflare DLQ consumer` comment.

All metric writes are best-effort (swallowed errors inside the helper).
No instrumentation path can break the existing send / consume behavior.

## Cron prune

Extend the existing cron registry with one new nightly job in
`apps/api/src/cron/pruneQueueEvents.ts`:

```ts
export async function pruneQueueEvents(env: Env): Promise<{ deleted: number }> {
  const retentionDays = Number(env.QUEUE_EVENTS_RETENTION_DAYS ?? '7');
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const result = await getDb(env.DB)
    .delete(queueEvents)
    .where(lt(queueEvents.createdAt, cutoff));
  return { deleted: result.changes ?? 0 };
}
```

Registered in `apps/api/src/cron/index.ts` and exposed via the existing
`/api/admin/cron` list endpoint for manual triggering.

## Configuration

One new env var (optional, defaults to `7`):

- `QUEUE_EVENTS_RETENTION_DAYS` — days to keep `queue_events` rows.

Two new secrets (required for the dashboard AE SQL queries):

- `CF_ACCOUNT_ID` — Cloudflare account id.
- `CF_API_TOKEN` — API token with `Account.Analytics Engine: Read` scope.

Both set per environment via `wrangler secret put`. Documented in
`docs/runbook.md` under a new "Queue ops dashboard" subsection.

## Testing

Unit:

- `queueInstrument.test.ts` — `recordQueueMetric` calls `writeDataPoint`
  with the documented shape; missing `METRICS` binding no-ops;
  `recordQueueEvent` writes the documented row, swallows DB errors.
- `queueSend.test.ts` — calls `QUEUE.send` exactly once with the
  provided payload; still records metric on send failure.

Integration:

- New `apps/api/src/modules/admin/queues/queues.integration.test.ts`:
  end-to-end happy path. Send a poison message into the `invoices`
  queue (bad `uploadId`). Wait for retry row. Hit
  `POST /retry/:eventId` with corrected payload. Verify a second
  consumer run succeeds and a `manual` event row exists with the
  retryer's user id.
- Permission tests: non-admin → 403 on every write endpoint; admin
  without `queues:write` → 403 on writes, 200 on reads.

UI:

- `apps/web/src/admin/QueuesPage.test.tsx` — render tiles with mocked
  health payload; click retry, assert `POST /retry/:id` called and
  events list re-queried.
- Manual enqueue: invalid JSON shows inline validation error; valid
  JSON fires the mutation.

## Migration plan

1. Apply D1 migration `0021_queue_events.sql` — additive table.
2. Deploy with feature flag `ADMIN_QUEUES_ENABLED=false`. All
   instrumentation runs but no admin route is mounted.
3. Flip flag, deploy admin UI page.
4. After one week of stable data, lower AE sample rate (drop every
   `queue.ack` datapoint to a 10% sample) if cost emerges.
5. Remove flag once stable.

Rollback: revert the migration via `pnpm db:migrate` (table only, no
data loss elsewhere). Remove `CF_*` secrets. Remove flag wiring.

## Open risks

- **AE SQL latency**: Cloudflare Analytics Engine SQL API is eventually
  consistent; dashboard tiles may show 30-60 s lag. Acceptable for ops,
  but the UI copy must say "approximate, last few minutes".
- **Payload PII**: failed notifications may contain user emails or PO
  bodies. `queue_events.payload_json` stores them. Mitigations:
  payload truncated to 8 KB in the helper; UI shows truncated preview
  with explicit "show full" button that audits the view; retention 7d.
  Documented in the runbook.
- **Manual enqueue misuse**: a misclick can flood a queue. Mitigations:
  double-confirm dialog; `queues:write` permission is restricted to a
  new `superadmin` role rather than granted to all `admin` users.

## Out of scope (deferred)

- Cloudflare DLQ consumer wiring (requires binding + new handler).
- Per-supplier rate-limit overrides on queues.
- Cross-region queue replication.
- Webhook delivery retry UI (lives in Platform section, unchanged).
- Queue replay against a different queue (cross-queue republish).