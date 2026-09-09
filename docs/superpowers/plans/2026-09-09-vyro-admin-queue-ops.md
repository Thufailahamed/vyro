# Admin Queue & Jobs Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build admin visibility and operational control for the three Cloudflare Queues (`audit`, `notifications`, `invoices`) with overview tiles, failed-message list, manual enqueue, and bulk replay.

**Architecture:** Instrument producers/consumers to write Analytics Engine events (counters + latency) and D1 `queue_events` rows on retry/dlq/manual. New admin API under `/api/admin/queues/*` reads AE via Cloudflare SQL API and D1 directly; retry reads D1 payload and re-sends via the source queue. New page `/admin/observability/queues`. Nightly cron prunes D1 rows older than 7 days.

**Tech Stack:** Hono on Cloudflare Workers + D1 (Drizzle) + Analytics Engine + Queues; React SPA (Vite); better-auth + RBAC; vitest.

## Global Constraints

- **Node**: 20+
- **Package manager**: pnpm 9+ workspace
- **TypeScript**: strict, `tsc --noEmit` clean (`pnpm typecheck`)
- **Tests**: vitest, file pattern `*.test.ts(x)` co-located; integration tests marked `.integration.test.ts`
- **Naming**: kebab-case files; camelCase exports; routes under `/api/*` Hono; admin SPA routes under `/admin/*`
- **Commit prefix**: `feat|fix|chore|docs|test|refactor(<scope>):` — scope = package name (`api`, `web`, `db`, `admin`)
- **Migrations**: numbered `NNNN_*.sql` in `packages/db/migrations/`, applied via `pnpm db:migrate`
- **Drizzle schemas**: declared in `packages/db/src/schema/<name>.ts`, exported from `packages/db/src/schema/index.ts`
- **RBAC**: every admin route goes through `requireRole({ admin: true })` plus `requirePermission('queues:read'|'write')` per the new spec
- **Analytics Engine**: writes via existing `metric()` helper in `apps/api/src/lib/metrics.ts`; reads via Cloudflare Analytics Engine SQL API with `CF_ACCOUNT_ID` + `CF_API_TOKEN` secrets
- **No PII**: payloads truncated to 8 KB before D1 insert
- **Spec**: `docs/superpowers/specs/2026-09-09-vyro-admin-queue-ops-design.md`

---

## File Structure

**New:**
- `packages/db/src/schema/queueEvents.ts` — Drizzle table
- `packages/db/migrations/0021_queue_events.sql` — D1 migration
- `apps/api/src/lib/queueInstrument.ts` — AE metric + D1 event helpers
- `apps/api/src/lib/queue.ts` — `queueSend` wrapper around `QUEUE.send`
- `apps/api/src/modules/admin/queues/queuesRepository.ts` — D1 queries for `queue_events`
- `apps/api/src/modules/admin/queues/aeQueries.ts` — Cloudflare AE SQL API client
- `apps/api/src/modules/admin/queues/queuesService.ts` — orchestration
- `apps/api/src/modules/admin/queues/queuesRoutes.ts` — Hono routes
- `apps/api/src/cron/pruneQueueEvents.ts` — nightly prune
- `apps/web/src/admin/useAdminQueues.ts` — data hook
- `apps/web/src/admin/QueuesPage.tsx` — page component
- Tests: `apps/api/src/lib/queueInstrument.test.ts`, `apps/api/src/lib/queue.test.ts`, `apps/api/src/modules/admin/queues/queuesRepository.test.ts`, `apps/api/src/modules/admin/queues/queuesService.test.ts`, `apps/api/src/modules/admin/queues/aeQueries.test.ts`, `apps/api/src/modules/admin/queues/queuesRoutes.test.ts`, `apps/api/src/modules/admin/queues/queues.integration.test.ts`, `apps/api/src/cron/pruneQueueEvents.test.ts`, `apps/web/src/admin/QueuesPage.test.tsx`

**Modify:**
- `packages/db/src/schema/index.ts` — export `queueEvents`
- `apps/api/src/env.ts` — add `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `QUEUE_EVENTS_RETENTION_DAYS`
- `apps/api/src/middleware/rbac.ts` — already supports `requirePermission` (verify)
- `apps/api/src/modules/admin/roles/schema.ts` — add `queues:read|write` permissions
- `apps/api/src/modules/admin/routes.ts` — mount `queuesRoutes`
- `apps/api/src/cron/index.ts` — register `pruneQueueEvents`
- `apps/api/src/queue/audit.ts` — instrument consumer
- `apps/api/src/queue/notifications.ts` — instrument consumer
- `apps/api/src/queue/invoiceOcr.ts` — instrument consumer
- `apps/api/src/modules/cspReport/repository.ts` — use `queueSend`
- `apps/api/src/modules/documents/routes.ts` — use `queueSend`
- `apps/api/src/modules/notifications/dispatcher.ts` — use `queueSend`
- `apps/api/src/modules/notifications/routes.ts` — use `queueSend`
- `apps/web/src/App.tsx` — add `/admin/observability/queues` route
- `apps/web/src/admin/ObservabilityPage.tsx` — link to new page
- `docs/runbook.md` — add "Queue ops dashboard" section

---

## Task 1: Drizzle schema + D1 migration for `queue_events`

**Files:**
- Create: `packages/db/src/schema/queueEvents.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0021_queue_events.sql`

**Interfaces:**
- Produces: `queueEvents` table exported from `@vyro/db/schema`

- [ ] **Step 1: Write the Drizzle schema**

Create `packages/db/src/schema/queueEvents.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const queueEvents = sqliteTable(
  'queue_events',
  {
    id: text('id').primaryKey(),
    queue: text('queue', { enum: ['audit', 'notifications', 'invoices'] }).notNull(),
    msgId: text('msg_id').notNull(),
    event: text('event', { enum: ['retry', 'dlq', 'manual'] }).notNull(),
    actorUserId: text('actor_user_id'),
    payloadJson: text('payload_json'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    queueCreatedIdx: index('idx_queue_events_queue_created').on(t.queue, t.createdAt),
    eventCreatedIdx: index('idx_queue_events_event_created').on(t.event, t.createdAt),
    createdIdx: index('idx_queue_events_created').on(t.createdAt),
  }),
);

export type QueueEvent = typeof queueEvents.$inferSelect;
export type QueueEventInsert = typeof queueEvents.$inferInsert;
```

- [ ] **Step 2: Export from schema index**

Edit `packages/db/src/schema/index.ts`. Add alphabetically:

```ts
export { queueEvents } from './queueEvents';
export type { QueueEvent, QueueEventInsert } from './queueEvents';
```

- [ ] **Step 3: Write the D1 migration SQL**

Create `packages/db/migrations/0021_queue_events.sql`:

```sql
CREATE TABLE queue_events (
  id TEXT PRIMARY KEY,
  queue TEXT NOT NULL CHECK (queue IN ('audit', 'notifications', 'invoices')),
  msg_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('retry', 'dlq', 'manual')),
  actor_user_id TEXT,
  payload_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_queue_events_queue_created ON queue_events (queue, created_at DESC);
CREATE INDEX idx_queue_events_event_created ON queue_events (event, created_at DESC);
CREATE INDEX idx_queue_events_created ON queue_events (created_at);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 5: Apply migration locally + verify**

Run: `pnpm db:migrate`
Expected: `0021_queue_events.sql` applied; `pnpm db:list-migrations` shows it.

Verify with:
Run: `pnpm --filter @vyro/db exec wrangler d1 execute vyro --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='queue_events';"`
Expected: returns one row with `queue_events`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/queueEvents.ts \
        packages/db/src/schema/index.ts \
        packages/db/migrations/0021_queue_events.sql
git commit -m "feat(db): queue_events table + migration 0021"
```

---

## Task 2: queueInstrument helper (TDD)

**Files:**
- Create: `apps/api/src/lib/queueInstrument.ts`
- Create: `apps/api/src/lib/queueInstrument.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type QueueName = 'audit' | 'notifications' | 'invoices';
  type QueueEventKind = 'retry' | 'dlq' | 'manual';
  type QueueMetricName =
    | 'queue.consume.start' | 'queue.ack'
    | 'queue.retry' | 'queue.dlq' | 'queue.enqueue';
  function recordQueueMetric(env: Env, name: QueueMetricName, queue: QueueName, latencyMs: number): void;
  function recordQueueEvent(env: Env, queue: QueueName, event: QueueEventKind, msgId: string, payload: unknown, error?: string, actorUserId?: string): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/queueInstrument.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../env';
import { recordQueueMetric, recordQueueEvent } from './queueInstrument';

function makeEnv(): Env {
  return {
    METRICS: {
      writeDataPoint: vi.fn(),
    },
    DB: {} as D1Database,
  } as unknown as Env;
}

describe('recordQueueMetric', () => {
  it('writes AE datapoint with [eventName, queue, eventType]', () => {
    const env = makeEnv();
    recordQueueMetric(env, 'queue.ack', 'audit', 12);
    expect(env.METRICS!.writeDataPoint).toHaveBeenCalledWith({
      blobs: ['queue.ack', 'audit', 'ack'],
      doubles: [12],
      indexes: ['audit'],
    });
  });

  it('maps event name to eventType correctly for enqueue', () => {
    const env = makeEnv();
    recordQueueMetric(env, 'queue.enqueue', 'notifications', 0);
    expect(env.METRICS!.writeDataPoint).toHaveBeenCalledWith({
      blobs: ['queue.enqueue', 'notifications', 'enqueue'],
      doubles: [0],
      indexes: ['notifications'],
    });
  });

  it('no-ops when METRICS binding missing', () => {
    const env = { METRICS: undefined } as unknown as Env;
    expect(() => recordQueueMetric(env, 'queue.ack', 'audit', 1)).not.toThrow();
  });
});

describe('recordQueueEvent', () => {
  it('inserts a queue_events row with payload + error', async () => {
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }),
    });
    const env = { DB: {} as D1Database } as unknown as Env;
    // Inline stub the queueEvents table by mocking getDb result via module override
    vi.mock('@vyro/db', () => ({
      getDb: () => ({ insert }),
    }));
    const before = Date.now();
    await recordQueueEvent(env, 'audit', 'retry', 'msg-1', { foo: 'bar' }, 'boom', 'user-1');
    expect(insert).toHaveBeenCalled();
    const call = insert.mock.results[0].value.values.mock.calls[0][0];
    expect(call.queue).toBe('audit');
    expect(call.event).toBe('retry');
    expect(call.msgId).toBe('msg-1');
    expect(call.error).toBe('boom');
    expect(call.actorUserId).toBe('user-1');
    expect(call.payloadJson).toContain('"foo":"bar"');
    expect(typeof call.id).toBe('string');
    expect(call.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('truncates payload to 8 KB', async () => {
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }),
    });
    vi.doMock('@vyro/db', () => ({ getDb: () => ({ insert }) }));
    const big = 'x'.repeat(20_000);
    await recordQueueEvent({} as Env, 'audit', 'manual', 'm', { big }, undefined, undefined);
    const call = insert.mock.results[0].value.values.mock.calls[0][0];
    expect(call.payloadJson.length).toBeLessThanOrEqual(8192);
  });

  it('swallows DB errors', async () => {
    const insert = vi.fn().mockReturnValue({
      values: () => ({ onConflictDoNothing: () => Promise.reject(new Error('db down')) }),
    });
    vi.doMock('@vyro/db', () => ({ getDb: () => ({ insert }) }));
    await expect(recordQueueEvent({} as Env, 'audit', 'manual', 'm', {})).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @vyro/api exec vitest run src/lib/queueInstrument.test.ts`
Expected: FAIL — `recordQueueMetric` and `recordQueueEvent` not exported.

- [ ] **Step 3: Implement the module**

Create `apps/api/src/lib/queueInstrument.ts`:

```ts
import type { Env } from '../env';
import { getDb } from '@vyro/db';
import { queueEvents } from '@vyro/db/schema';

export type QueueName = 'audit' | 'notifications' | 'invoices';
export type QueueEventKind = 'retry' | 'dlq' | 'manual';
export type QueueMetricName =
  | 'queue.consume.start'
  | 'queue.ack'
  | 'queue.retry'
  | 'queue.dlq'
  | 'queue.enqueue';

const EVENT_TYPE_FOR: Record<QueueMetricName, string> = {
  'queue.consume.start': 'consume',
  'queue.ack': 'ack',
  'queue.retry': 'retry',
  'queue.dlq': 'dlq',
  'queue.enqueue': 'enqueue',
};

const MAX_PAYLOAD_BYTES = 8192;

function ulid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export function recordQueueMetric(
  env: Env,
  name: QueueMetricName,
  queue: QueueName,
  latencyMs: number,
): void {
  if (!env.METRICS) return;
  try {
    env.METRICS.writeDataPoint({
      blobs: [name, queue, EVENT_TYPE_FOR[name]],
      doubles: [latencyMs],
      indexes: [queue],
    });
  } catch {
    // best-effort
  }
}

export async function recordQueueEvent(
  env: Env,
  queue: QueueName,
  event: QueueEventKind,
  msgId: string,
  payload: unknown,
  error?: string,
  actorUserId?: string,
): Promise<void> {
  try {
    const db = getDb(env.DB);
    let payloadJson: string | null = null;
    if (payload !== undefined) {
      payloadJson = JSON.stringify(payload);
      if (payloadJson.length > MAX_PAYLOAD_BYTES) {
        payloadJson = payloadJson.slice(0, MAX_PAYLOAD_BYTES);
      }
    }
    await db
      .insert(queueEvents)
      .values({
        id: ulid(),
        queue,
        msgId,
        event,
        actorUserId: actorUserId ?? null,
        payloadJson,
        error: error ?? null,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: queueEvents.id });
  } catch {
    // never throw from instrumentation
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @vyro/api exec vitest run src/lib/queueInstrument.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/queueInstrument.ts apps/api/src/lib/queueInstrument.test.ts
git commit -m "feat(api): queueInstrument helper with AE + D1 writes"
```

---

## Task 3: `queueSend` wrapper (TDD)

**Files:**
- Create: `apps/api/src/lib/queue.ts`
- Create: `apps/api/src/lib/queue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  import type { Env } from '../env';
  import type { QueueName } from './queueInstrument';
  export async function queueSend(env: Env, queue: QueueName, payload: unknown): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/queue.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { queueSend } from './queue';

function makeEnv() {
  const send = vi.fn().mockResolvedValue(undefined);
  return {
    AUDIT_QUEUE: { send },
    NOTIFICATIONS_QUEUE: { send },
    INVOICES_QUEUE: { send },
    METRICS: { writeDataPoint: vi.fn() },
  } as any;
}

describe('queueSend', () => {
  it('calls AUDIT_QUEUE.send and records metric', async () => {
    const env = makeEnv();
    await queueSend(env, 'audit', { hello: 'world' });
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith({ hello: 'world' });
    expect(env.METRICS.writeDataPoint).toHaveBeenCalledWith({
      blobs: ['queue.enqueue', 'audit', 'enqueue'],
      doubles: [0],
      indexes: ['audit'],
    });
  });

  it('does not throw if send rejects but still records metric', async () => {
    const env = makeEnv();
    env.NOTIFICATIONS_QUEUE.send.mockRejectedValueOnce(new Error('queue down'));
    await expect(queueSend(env, 'notifications', {})).rejects.toThrow('queue down');
    expect(env.METRICS.writeDataPoint).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/api exec vitest run src/lib/queue.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/queue.ts`:

```ts
import type { Env } from '../env';
import { recordQueueMetric, type QueueName } from './queueInstrument';

const BINDING: Record<QueueName, keyof Pick<Env, 'AUDIT_QUEUE' | 'NOTIFICATIONS_QUEUE' | 'INVOICES_QUEUE'>> = {
  audit: 'AUDIT_QUEUE',
  notifications: 'NOTIFICATIONS_QUEUE',
  invoices: 'INVOICES_QUEUE',
};

export async function queueSend(env: Env, queue: QueueName, payload: unknown): Promise<void> {
  await (env[BINDING[queue]] as Queue).send(payload as any);
  recordQueueMetric(env, 'queue.enqueue', queue, 0);
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `pnpm --filter @vyro/api exec vitest run src/lib/queue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/queue.ts apps/api/src/lib/queue.test.ts
git commit -m "feat(api): queueSend wrapper records enqueue metric"
```

---

## Task 4: Migrate producer call sites to `queueSend`

**Files:**
- Modify: `apps/api/src/modules/cspReport/repository.ts`
- Modify: `apps/api/src/modules/documents/routes.ts`
- Modify: `apps/api/src/modules/notifications/dispatcher.ts`
- Modify: `apps/api/src/modules/notifications/routes.ts`

**Interfaces:**
- Consumes: `queueSend(env, queue, payload)` from Task 3

- [ ] **Step 1: Update cspReport/repository.ts**

Read the file, then replace the existing `await env.AUDIT_QUEUE.send(...)` block with `await queueSend(env, 'audit', payload)`. Add the import at top:

```ts
import { queueSend } from '../../../lib/queue';
```

- [ ] **Step 2: Update documents/routes.ts**

Read the file. Locate `await c.env.INVOICES_QUEUE.send({ uploadId })` and replace with:

```ts
await queueSend(c.env, 'invoices', { uploadId });
```

Add import at top:

```ts
import { queueSend } from '../../lib/queue';
```

- [ ] **Step 3: Update notifications/dispatcher.ts**

Read the file. Locate every `await queue.send({...})` inside `dispatcher.ts`. Replace each with:

```ts
await queueSend(env, 'notifications', { ... });
```

Add import:

```ts
import { queueSend } from '../../lib/queue';
```

If the local variable is named `queue`, leave it as the binding but pass `env.NOTIFICATIONS_QUEUE` only to `queueSend`. Verify no other call sites send to other queues from this file.

- [ ] **Step 4: Update notifications/routes.ts**

Replace `await c.env.NOTIFICATIONS_QUEUE.send({...})` with `await queueSend(c.env, 'notifications', {...})`. Add import:

```ts
import { queueSend } from '../../lib/queue';
```

- [ ] **Step 5: Typecheck + targeted tests**

Run: `pnpm typecheck`
Expected: exit 0

Run: `pnpm --filter @vyro/api exec vitest run src/modules/cspReport src/modules/notifications src/modules/documents`
Expected: PASS (no behavior changes expected)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/cspReport/repository.ts \
        apps/api/src/modules/documents/routes.ts \
        apps/api/src/modules/notifications/dispatcher.ts \
        apps/api/src/modules/notifications/routes.ts
git commit -m "refactor(api): route queue producers through queueSend"
```

---

## Task 5: Instrument consumer handlers

**Files:**
- Modify: `apps/api/src/queue/audit.ts`
- Modify: `apps/api/src/queue/notifications.ts`
- Modify: `apps/api/src/queue/invoiceOcr.ts`

**Interfaces:**
- Consumes: `recordQueueMetric`, `recordQueueEvent` from Task 2

- [ ] **Step 1: Instrument audit.ts**

In `apps/api/src/queue/audit.ts`:

1. Add import:
   ```ts
   import { recordQueueMetric, recordQueueEvent } from '../lib/queueInstrument';
   ```
2. At the top of the `for (const msg of batch.messages)` loop, before the body parse, add:
   ```ts
   const t0 = Date.now();
   recordQueueMetric(env, 'queue.consume.start', 'audit', 0);
   ```
3. In the success branch (right before `msg.ack()`), replace `msg.ack()` with:
   ```ts
   recordQueueMetric(env, 'queue.ack', 'audit', Date.now() - t0);
   msg.ack();
   ```
4. In the catch branch, replace `msg.retry({ delaySeconds: 30 })` with:
   ```ts
   await recordQueueEvent(env, 'audit', 'retry', msg.id, body, err instanceof Error ? err.message : String(err));
   recordQueueMetric(env, 'queue.retry', 'audit', Date.now() - t0);
   msg.retry({ delaySeconds: 30 });
   ```

- [ ] **Step 2: Instrument notifications.ts**

Same shape. Use queue = `'notifications'`. Add the same imports. Modify the success path right before `msg.ack()` and the catch path right before `msg.retry({ delaySeconds: 30 })`.

- [ ] **Step 3: Instrument invoiceOcr.ts**

Use queue = `'invoices'`. Note the existing handler calls `msg.ack()` unconditionally inside the try/catch. Add `recordQueueMetric(env, 'queue.consume.start', 'invoices', 0)` and `const t0 = Date.now();` at the top of the loop. In the success path (no throw), before `msg.ack()` add `recordQueueMetric(env, 'queue.ack', 'invoices', Date.now() - t0);`. In the catch path, before the final `msg.ack()` add `await recordQueueEvent(env, 'invoices', 'retry', msg.id, body, message); recordQueueMetric(env, 'queue.retry', 'invoices', Date.now() - t0);`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @vyro/api exec vitest run src/queue`
Expected: PASS

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/queue/audit.ts \
        apps/api/src/queue/notifications.ts \
        apps/api/src/queue/invoiceOcr.ts
git commit -m "feat(api): instrument queue consumers with AE + D1 events"
```

---

## Task 6: Add `queues:read` and `queues:write` permissions

**Files:**
- Modify: `apps/api/src/modules/admin/roles/schema.ts`

**Interfaces:**
- Consumes: existing role schema in `apps/api/src/modules/admin/roles/schema.ts`
- Produces: two new permission strings `queues:read`, `queues:write` in the permission enum/union; seeded into default `admin` role.

- [ ] **Step 1: Read existing schema**

Read `apps/api/src/modules/admin/roles/schema.ts`. Identify where the permission enum/union is defined and how the default admin role is seeded.

- [ ] **Step 2: Add the permission strings**

Find the union type or constant array that lists permission strings. Add two entries:
```ts
'queues:read',
'queues:write',
```
following the existing ordering convention.

- [ ] **Step 3: Seed into the default admin role**

Find the default `admin` role definition. Add both permissions to its permissions array.

- [ ] **Step 4: Run typecheck + tests**

Run: `pnpm typecheck`
Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/roles`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/roles/schema.ts
git commit -m "feat(api): queues:read|write permissions seeded to admin role"
```

---

## Task 7: queuesRepository (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/queues/queuesRepository.ts`
- Create: `apps/api/src/modules/admin/queues/queuesRepository.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QueueEventRow = {
    id: string; queue: QueueName; msgId: string; event: QueueEventKind;
    actorUserId: string | null; payloadJson: string | null; error: string | null; createdAt: number;
  };
  export async function listQueueEvents(
    db: DrizzleDb, params: { queue?: QueueName; event?: QueueEventKind; limit?: number; before?: number }
  ): Promise<QueueEventRow[]>;
  export async function getQueueEvent(db: DrizzleDb, id: string): Promise<QueueEventRow | null>;
  export async function pruneQueueEvents(db: DrizzleDb, cutoffMs: number): Promise<number>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/admin/queues/queuesRepository.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { listQueueEvents, getQueueEvent, pruneQueueEvents } from './queuesRepository';

function makeDb(rows: any[]) {
  const where = vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue(rows), get: vi.fn().mockResolvedValue(rows[0] ?? null) });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const del = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ changes: rows.length }) }) });
  return { select, delete: del } as any;
}

describe('listQueueEvents', () => {
  it('returns rows', async () => {
    const db = makeDb([{ id: '1', queue: 'audit', msgId: 'm', event: 'retry', actorUserId: null, payloadJson: null, error: null, createdAt: 1 }]);
    const rows = await listQueueEvents(db as any, { queue: 'audit' });
    expect(rows).toHaveLength(1);
    expect(rows[0].queue).toBe('audit');
  });
});

describe('getQueueEvent', () => {
  it('returns null when missing', async () => {
    const db = makeDb([]);
    const row = await getQueueEvent(db as any, 'absent');
    expect(row).toBeNull();
  });
});

describe('pruneQueueEvents', () => {
  it('returns deleted count', async () => {
    const db = makeDb([{ id: 'x' }, { id: 'y' }]);
    const n = await pruneQueueEvents(db as any, 0);
    expect(n).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queuesRepository.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/admin/queues/queuesRepository.ts`:

```ts
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import { queueEvents } from '@vyro/db/schema';
import type { QueueName, QueueEventKind } from '../../../lib/queueInstrument';

export type QueueEventRow = {
  id: string;
  queue: QueueName;
  msgId: string;
  event: QueueEventKind;
  actorUserId: string | null;
  payloadJson: string | null;
  error: string | null;
  createdAt: number;
};

type DrizzleDb = any;

export async function listQueueEvents(
  db: DrizzleDb,
  params: { queue?: QueueName; event?: QueueEventKind; limit?: number; before?: number },
): Promise<QueueEventRow[]> {
  const conds: SQL[] = [];
  if (params.queue) conds.push(eq(queueEvents.queue, params.queue));
  if (params.event) conds.push(eq(queueEvents.event, params.event));
  if (params.before) conds.push(lt(queueEvents.createdAt, params.before));
  const q = db.select().from(queueEvents);
  const rows = conds.length ? await q.where(and(...conds)).orderBy(desc(queueEvents.createdAt)).limit(params.limit ?? 50).all() : await q.orderBy(desc(queueEvents.createdAt)).limit(params.limit ?? 50).all();
  return rows as QueueEventRow[];
}

export async function getQueueEvent(db: DrizzleDb, id: string): Promise<QueueEventRow | null> {
  const row = await db.select().from(queueEvents).where(eq(queueEvents.id, id)).get();
  return (row ?? null) as QueueEventRow | null;
}

export async function pruneQueueEvents(db: DrizzleDb, cutoffMs: number): Promise<number> {
  const result = await db.delete(queueEvents).where(lt(queueEvents.createdAt, cutoffMs)).run();
  return (result as { changes?: number }).changes ?? 0;
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queuesRepository.test.ts`
Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/queues/queuesRepository.ts \
        apps/api/src/modules/admin/queues/queuesRepository.test.ts
git commit -m "feat(api): queue_events repository (list/get/prune)"
```

---

## Task 8: aeQueries (Cloudflare AE SQL client, TDD)

**Files:**
- Create: `apps/api/src/modules/admin/queues/aeQueries.ts`
- Create: `apps/api/src/modules/admin/queues/aeQueries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QueueHealth = { queue: QueueName; backlog: number; ackLast1h: number; errLast1h: number; p50Ms: number; p95Ms: number };
  export async function queryQueueHealth(env: Env, fetchImpl?: typeof fetch): Promise<QueueHealth[]>;
  export type ThroughputPoint = { ts: number; queue: QueueName; acks: number };
  export async function queryThroughput(env: Env, fetchImpl?: typeof fetch): Promise<ThroughputPoint[]>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/admin/queues/aeQueries.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { queryQueueHealth, queryThroughput } from './aeQueries';

function makeEnv() {
  return {
    CF_ACCOUNT_ID: 'acc',
    CF_API_TOKEN: 'tok',
    METRICS: { dataset: 'vyro_metrics' },
  } as any;
}

describe('queryQueueHealth', () => {
  it('hits Cloudflare AE SQL API and parses counts + quantiles', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { queue: 'audit', event_type: 'ack', cnt: 100, p50: 12, p95: 90 },
          { queue: 'audit', event_type: 'retry', cnt: 4 },
          { queue: 'notifications', event_type: 'ack', cnt: 50, p50: 8, p95: 40 },
          { queue: 'notifications', event_type: 'retry', cnt: 1 },
        ],
        rows_read: 1, rows_written: 0,
      }),
    });
    const out = await queryQueueHealth(makeEnv(), fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/accounts/acc/analytics_engine/sql'), expect.objectContaining({ method: 'POST' }));
    expect(out).toEqual(expect.arrayContaining([
      expect.objectContaining({ queue: 'audit', ackLast1h: 100, errLast1h: 4, p50Ms: 12, p95Ms: 90 }),
    ]));
    expect(out.find(q => q.queue === 'notifications')?.ackLast1h).toBe(50);
  });

  it('throws when AE response not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(queryQueueHealth(makeEnv(), fetchImpl as any)).rejects.toThrow(/AE SQL 500/);
  });
});

describe('queryThroughput', () => {
  it('returns time-bucketed counts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { bucket: 1700000000000, queue: 'audit', cnt: 12 },
          { bucket: 1700000300000, queue: 'audit', cnt: 7 },
        ],
      }),
    });
    const out = await queryThroughput(makeEnv(), fetchImpl as any);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ queue: 'audit', acks: 12 });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/aeQueries.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/admin/queues/aeQueries.ts`:

```ts
import type { Env } from '../../../env';
import type { QueueName } from '../../../lib/queueInstrument';

export type QueueHealth = {
  queue: QueueName;
  backlog: number;
  ackLast1h: number;
  errLast1h: number;
  p50Ms: number;
  p95Ms: number;
};

export type ThroughputPoint = { ts: number; queue: QueueName; acks: number };

const QUEUES: QueueName[] = ['audit', 'notifications', 'invoices'];

async function runSql<T = any>(env: Env, sql: string, fetchImpl: typeof fetch): Promise<T[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const dataset = (env.METRICS as unknown as { dataset?: string })?.dataset ?? 'vyro_metrics';
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: `SELECT * FROM ${dataset} WHERE ${sql}`,
  });
  if (!res.ok) throw new Error(`AE SQL ${res.status}`);
  const json = (await res.json()) as { data: T[] };
  return json.data ?? [];
}

export async function queryQueueHealth(env: Env, fetchImpl: typeof fetch = fetch): Promise<QueueHealth[]> {
  // Last 1h, per queue: ack counts, retry+dlq counts, p50/p95 latency.
  const sql = `
    timestamp > NOW() - INTERVAL '1' HOUR
    AND blob1 LIKE 'queue.%'
    AND blob2 IN ('audit','notifications','invoices')
    GROUP BY blob2, blob3
    SELECT
      blob2 AS queue,
      blob3 AS event_type,
      count() AS cnt,
      quantile(double1, 0.5) AS p50,
      quantile(double1, 0.95) AS p95
  `;
  const rows = await runSql<{ queue: QueueName; event_type: string; cnt: number; p50?: number; p95?: number }>(env, sql, fetchImpl);
  const out: Record<QueueName, QueueHealth> = {
    audit: { queue: 'audit', backlog: 0, ackLast1h: 0, errLast1h: 0, p50Ms: 0, p95Ms: 0 },
    notifications: { queue: 'notifications', backlog: 0, ackLast1h: 0, errLast1h: 0, p50Ms: 0, p95Ms: 0 },
    invoices: { queue: 'invoices', backlog: 0, ackLast1h: 0, errLast1h: 0, p50Ms: 0, p95Ms: 0 },
  };
  for (const r of rows) {
    const q = out[r.queue];
    if (!q) continue;
    if (r.event_type === 'ack') {
      q.ackLast1h = r.cnt;
      q.p50Ms = Math.round(r.p50 ?? 0);
      q.p95Ms = Math.round(r.p95 ?? 0);
    } else if (r.event_type === 'retry' || r.event_type === 'dlq') {
      q.errLast1h += r.cnt;
    }
  }
  return QUEUES.map((q) => out[q]);
}

export async function queryThroughput(env: Env, fetchImpl: typeof fetch = fetch): Promise<ThroughputPoint[]> {
  const sql = `
    timestamp > NOW() - INTERVAL '24' HOUR
    AND blob3 = 'ack'
    GROUP BY bucket, blob2
    SELECT
      floor(timestamp / 300000) * 300000 AS bucket,
      blob2 AS queue,
      count() AS cnt
  `;
  const rows = await runSql<{ bucket: number; queue: QueueName; cnt: number }>(env, sql, fetchImpl);
  return rows.map((r) => ({ ts: r.bucket, queue: r.queue, acks: r.cnt }));
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/aeQueries.test.ts`
Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/queues/aeQueries.ts \
        apps/api/src/modules/admin/queues/aeQueries.test.ts
git commit -m "feat(api): Cloudflare AE SQL client for queue health + throughput"
```

---

## Task 9: queuesService (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/queues/queuesService.ts`
- Create: `apps/api/src/modules/admin/queues/queuesService.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function getHealth(env: Env): Promise<QueueHealth[]>;
  export async function listEvents(env: Env, params: { queue?: QueueName; event?: QueueEventKind; limit?: number; before?: number }): Promise<QueueEventRow[]>;
  export async function retryEvent(env: Env, eventId: string, editedPayload: unknown, actorUserId: string): Promise<{ newMsgId: string }>;
  export async function retryBulk(env: Env, eventIds: string[], editedPayload: unknown | undefined, actorUserId: string): Promise<{ replayed: number; failed: string[] }>;
  export async function manualEnqueue(env: Env, queue: QueueName, payload: unknown, actorUserId: string): Promise<{ msgId: string; eventId: string }>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/admin/queues/queuesService.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getHealth, listEvents, retryEvent, retryBulk, manualEnqueue } from './queuesService';
import * as repo from './queuesRepository';
import * as qmod from '../../../lib/queue';
import * as inst from '../../../lib/queueInstrument';
import { queueSend } from '../../../lib/queue';

function makeEnv(): any {
  return {
    AUDIT_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    NOTIFICATIONS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    INVOICES_QUEUE: { send: vi.fn().mockResolvedValue(undefined) },
    DB: {},
    CF_ACCOUNT_ID: 'a',
    CF_API_TOKEN: 't',
    METRICS: { writeDataPoint: vi.fn(), dataset: 'vyro_metrics' },
  };
}

describe('listEvents', () => {
  it('forwards params to repo', async () => {
    const spy = vi.spyOn(repo, 'listQueueEvents').mockResolvedValue([]);
    await listEvents(makeEnv(), { queue: 'audit', limit: 10 });
    expect(spy).toHaveBeenCalledWith(expect.anything(), { queue: 'audit', limit: 10 });
  });
});

describe('manualEnqueue', () => {
  it('sends payload and writes manual event row', async () => {
    vi.spyOn(inst, 'recordQueueEvent').mockResolvedValue(undefined);
    const env = makeEnv();
    const out = await manualEnqueue(env, 'audit', { hello: 'world' }, 'admin-1');
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith({ hello: 'world' });
    expect(inst.recordQueueEvent).toHaveBeenCalledWith(env, 'audit', 'manual', out.msgId, { hello: 'world' }, undefined, 'admin-1');
    expect(out.eventId).toEqual(expect.any(String));
  });
});

describe('retryEvent', () => {
  it('reads D1 row, sends payload with optional edit, writes manual row', async () => {
    vi.spyOn(repo, 'getQueueEvent').mockResolvedValue({
      id: 'e1', queue: 'invoices', msgId: 'm1', event: 'retry',
      actorUserId: null, payloadJson: JSON.stringify({ uploadId: 'u' }),
      error: 'boom', createdAt: 1,
    });
    vi.spyOn(inst, 'recordQueueEvent').mockResolvedValue(undefined);
    const env = makeEnv();
    const out = await retryEvent(env, 'e1', { uploadId: 'u-fixed' }, 'admin-2');
    expect(env.INVOICES_QUEUE.send).toHaveBeenCalledWith({ uploadId: 'u-fixed' });
    expect(out.newMsgId).toEqual(expect.any(String));
    expect(inst.recordQueueEvent).toHaveBeenCalled();
  });

  it('throws 404 when event missing', async () => {
    vi.spyOn(repo, 'getQueueEvent').mockResolvedValue(null);
    await expect(retryEvent(makeEnv(), 'nope', undefined, 'u')).rejects.toThrow(/NOT_FOUND/);
  });
});

describe('retryBulk', () => {
  it('sends each event and reports per-id failures', async () => {
    vi.spyOn(repo, 'getQueueEvent')
      .mockResolvedValueOnce({ id: 'a', queue: 'audit', msgId: 'm', event: 'retry', actorUserId: null, payloadJson: '{"x":1}', error: null, createdAt: 1 })
      .mockResolvedValueOnce(null);
    vi.spyOn(inst, 'recordQueueEvent').mockResolvedValue(undefined);
    const env = makeEnv();
    const out = await retryBulk(env, ['a', 'b'], undefined, 'admin-3');
    expect(out.replayed).toBe(1);
    expect(out.failed).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queuesService.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/admin/queues/queuesService.ts`:

```ts
import type { Env } from '../../../env';
import { getDb } from '@vyro/db';
import { queueEvents } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { queueSend } from '../../../lib/queue';
import {
  recordQueueEvent,
  type QueueName,
  type QueueEventKind,
} from '../../../lib/queueInstrument';
import {
  listQueueEvents,
  getQueueEvent,
  type QueueEventRow,
} from './queuesRepository';
import { queryQueueHealth, queryThroughput, type QueueHealth, type ThroughputPoint } from './aeQueries';

export { type QueueHealth, type ThroughputPoint };

export async function getHealth(env: Env): Promise<QueueHealth[]> {
  return queryQueueHealth(env);
}

export async function listEvents(
  env: Env,
  params: { queue?: QueueName; event?: QueueEventKind; limit?: number; before?: number },
): Promise<QueueEventRow[]> {
  return listQueueEvents(getDb(env.DB), params);
}

function ulid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function bindingFor(queue: QueueName): keyof Pick<Env, 'AUDIT_QUEUE' | 'NOTIFICATIONS_QUEUE' | 'INVOICES_QUEUE'> {
  return ({ audit: 'AUDIT_QUEUE', notifications: 'NOTIFICATIONS_QUEUE', invoices: 'INVOICES_QUEUE' } as const)[queue];
}

export async function manualEnqueue(
  env: Env,
  queue: QueueName,
  payload: unknown,
  actorUserId: string,
): Promise<{ msgId: string; eventId: string }> {
  const sendRes = await (env[bindingFor(queue)] as Queue).send(payload as any);
  const msgId = (sendRes as { id?: string })?.id ?? ulid();
  const eventId = ulid();
  await getDb(env.DB)
    .insert(queueEvents)
    .values({
      id: eventId,
      queue,
      msgId,
      event: 'manual',
      actorUserId,
      payloadJson: JSON.stringify(payload).slice(0, 8192),
      error: null,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: queueEvents.id });
  return { msgId, eventId };
}

export async function retryEvent(
  env: Env,
  eventId: string,
  editedPayload: unknown,
  actorUserId: string,
): Promise<{ newMsgId: string }> {
  const row = await getQueueEvent(getDb(env.DB), eventId);
  if (!row) {
    const err = new Error('Queue event not found');
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  const payload = editedPayload ?? (row.payloadJson ? JSON.parse(row.payloadJson) : {});
  const sendRes = await (env[bindingFor(row.queue)] as Queue).send(payload as any);
  const newMsgId = (sendRes as { id?: string })?.id ?? ulid();
  await recordQueueEvent(env, row.queue, 'manual', newMsgId, payload, undefined, actorUserId);
  return { newMsgId };
}

export async function retryBulk(
  env: Env,
  eventIds: string[],
  editedPayload: unknown | undefined,
  actorUserId: string,
): Promise<{ replayed: number; failed: string[] }> {
  const failed: string[] = [];
  let replayed = 0;
  for (const id of eventIds) {
    try {
      await retryEvent(env, id, editedPayload, actorUserId);
      replayed++;
    } catch {
      failed.push(id);
    }
  }
  return { replayed, failed };
}

export { getDb as _getDb };
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queuesService.test.ts`
Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/queues/queuesService.ts \
        apps/api/src/modules/admin/queues/queuesService.test.ts
git commit -m "feat(api): queues service (list, retry, bulk, enqueue)"
```

---

## Task 10: queuesRoutes (HTTP layer, TDD)

**Files:**
- Create: `apps/api/src/modules/admin/queues/queuesRoutes.ts`
- Create: `apps/api/src/modules/admin/queues/queuesRoutes.test.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`

**Interfaces:**
- Produces: Hono sub-router mounted at `/api/admin/queues/*`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/admin/queues/queuesRoutes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { queuesRoutes } from './queuesRoutes';
import * as svc from './queuesService';

function app() {
  const a = new Hono<{ Bindings: any }>();
  a.use('*', async (c, n) => {
    c.set('user', { id: 'u', role: 'admin', permissions: ['queues:read', 'queues:write'] } as any);
    await n();
  });
  a.route('/queues', queuesRoutes);
  return a;
}

describe('queuesRoutes', () => {
  it('GET /health returns health array', async () => {
    vi.spyOn(svc, 'getHealth').mockResolvedValue([{ queue: 'audit', backlog: 0, ackLast1h: 1, errLast1h: 0, p50Ms: 1, p95Ms: 2 }]);
    const res = await app().fetch(new Request('http://x/queues/health'));
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.queues[0].queue).toBe('audit');
  });

  it('POST /retry/:id returns newMsgId', async () => {
    vi.spyOn(svc, 'retryEvent').mockResolvedValue({ newMsgId: 'm2' });
    const res = await app().fetch(new Request('http://x/queues/retry/e1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ editedPayload: { x: 1 } }) }));
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.newMsgId).toBe('m2');
  });

  it('POST /retry/e1 returns 404 when service throws NOT_FOUND', async () => {
    vi.spyOn(svc, 'retryEvent').mockRejectedValue(Object.assign(new Error('nf'), { code: 'NOT_FOUND' }));
    const res = await app().fetch(new Request('http://x/queues/retry/missing', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(404);
  });

  it('POST /enqueue returns msgId + eventId', async () => {
    vi.spyOn(svc, 'manualEnqueue').mockResolvedValue({ msgId: 'm', eventId: 'e' });
    const res = await app().fetch(new Request('http://x/queues/enqueue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queue: 'audit', payload: { a: 1 } }) }));
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j).toEqual({ ok: true, msgId: 'm', eventId: 'e' });
  });

  it('rejects writes without queues:write', async () => {
    const a = new Hono<{ Bindings: any }>();
    a.use('*', async (c, n) => { c.set('user', { id: 'u', role: 'admin', permissions: ['queues:read'] } as any); await n(); });
    a.route('/queues', queuesRoutes);
    const res = await a.fetch(new Request('http://x/queues/enqueue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queue: 'audit', payload: {} }) }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queuesRoutes.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/admin/queues/queuesRoutes.ts`:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import * as svc from './queuesService';

const querySchema = z.object({
  queue: z.enum(['audit', 'notifications', 'invoices']).optional(),
  event: z.enum(['retry', 'dlq', 'manual']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.coerce.number().int().min(0).optional(),
});

const retryBody = z.object({ editedPayload: z.unknown().optional() });
const bulkBody = z.object({
  eventIds: z.array(z.string().min(1)).min(1).max(100),
  editedPayload: z.unknown().optional(),
});
const enqueueBody = z.object({
  queue: z.enum(['audit', 'notifications', 'invoices']),
  payload: z.unknown(),
});

const router = new Hono<{ Bindings: Env; Variables: { user: any } }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/health', requirePermission('queues:read'), async (c) => {
  const queues = await svc.getHealth(c.env);
  return c.json({ queues });
});

router.get('/events', requirePermission('queues:read'), async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad query', parsed.error.flatten());
  const events = await svc.listEvents(c.env, parsed.data);
  return c.json({ events });
});

router.post('/retry/:eventId', requirePermission('queues:write'), async (c) => {
  const eventId = c.req.param('eventId');
  const parsed = retryBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad body', parsed.error.flatten());
  try {
    const out = await svc.retryEvent(c.env, eventId, parsed.data.editedPayload, c.get('user').id);
    await auditAdmin(c.env, c.get('user').id, 'queue.retry.single', 'queue_event', eventId, { newMsgId: out.newMsgId });
    return c.json({ ok: true, newMsgId: out.newMsgId });
  } catch (err) {
    if ((err as any)?.code === 'NOT_FOUND') throw httpError(404, 'NOT_FOUND', 'queue event not found');
    throw err;
  }
});

router.post('/retry-bulk', requirePermission('queues:write'), async (c) => {
  const parsed = bulkBody.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad body', parsed.error.flatten());
  const out = await svc.retryBulk(c.env, parsed.data.eventIds, parsed.data.editedPayload, c.get('user').id);
  await auditAdmin(c.env, c.get('user').id, 'queue.retry.bulk', 'queue_event', parsed.data.eventIds.join(','), out);
  return c.json({ ok: true, ...out });
});

router.post('/enqueue', requirePermission('queues:write'), async (c) => {
  const parsed = enqueueBody.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad body', parsed.error.flatten());
  const out = await svc.manualEnqueue(c.env, parsed.data.queue, parsed.data.payload, c.get('user').id);
  await auditAdmin(c.env, c.get('user').id, 'queue.enqueue.manual', 'queue', parsed.data.queue, { msgId: out.msgId });
  return c.json({ ok: true, msgId: out.msgId, eventId: out.eventId });
});

export const queuesRoutes = router;
```

- [ ] **Step 4: Mount in admin router**

Edit `apps/api/src/modules/admin/routes.ts`. Add near the top with other imports:

```ts
import { queuesRoutes } from './queues/queuesRoutes';
```

After the existing `router.use('*', session(), requireRole({ admin: true }));` line, add:

```ts
router.route('/queues', queuesRoutes);
```

Verify the file's other handlers are unchanged. Run typecheck.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queuesRoutes.test.ts`
Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin/queues/queuesRoutes.ts \
        apps/api/src/modules/admin/queues/queuesRoutes.test.ts \
        apps/api/src/modules/admin/routes.ts
git commit -m "feat(api): admin /api/admin/queues routes with RBAC"
```

---

## Task 11: Env vars and Cloudflare config

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/wrangler.toml`
- Modify: `apps/api/wrangler.toml` (production section)

- [ ] **Step 1: Add env var types**

Edit `apps/api/src/env.ts`. Add to the `Env` interface:

```ts
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  QUEUE_EVENTS_RETENTION_DAYS?: string;
```

- [ ] **Step 2: Add vars to wrangler.toml**

Read `apps/api/wrangler.toml`. In the top `[vars]` section, add:

```toml
QUEUE_EVENTS_RETENTION_DAYS = "7"
```

In the top section, add (no value — set as secrets):

```toml
CF_ACCOUNT_ID = ""
CF_API_TOKEN = ""
```

In `[env.production.vars]`, add the same three keys (the AE SQL query requires production values to be set as wrangler secrets; the empty placeholder is fine for local dev).

- [ ] **Step 3: Document secret setup in runbook**

Open `docs/runbook.md`. Append at the end (new `## Queue ops dashboard` section):

````markdown
## Queue ops dashboard

Two secrets are required for the admin `/admin/observability/queues`
page (Analytics Engine SQL API access):

```bash
npx wrangler secret put CF_ACCOUNT_ID --config apps/api/wrangler.toml
npx wrangler secret put CF_API_TOKEN --config apps/api/wrangler.toml
```

The token needs the `Account > Analytics Engine > Read` permission.
Local dev: set the same keys in `.dev.vars` (gitignored).
````

- [ ] **Step 4: Typecheck + run server sanity check**

Run: `pnpm typecheck`
Expected: exit 0

Run: `pnpm --filter @vyro/api exec wrangler types`
Expected: `worker-configuration.d.ts` regenerated; types still clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/env.ts \
        apps/api/wrangler.toml \
        docs/runbook.md
git commit -m "feat(api): env vars + runbook section for queue ops dashboard"
```

---

## Task 12: Cron prune job (TDD)

**Files:**
- Create: `apps/api/src/cron/pruneQueueEvents.ts`
- Create: `apps/api/src/cron/pruneQueueEvents.test.ts`
- Modify: `apps/api/src/cron/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function pruneQueueEvents(env: Env): Promise<{ deleted: number }>;
  ```
- Wired into existing cron registry so `/api/admin/cron` lists + triggers it.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/cron/pruneQueueEvents.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { pruneQueueEvents } from './pruneQueueEvents';

describe('pruneQueueEvents', () => {
  it('calls repo with retention cutoff and returns count', async () => {
    const db = { delete: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ changes: 7 }) }) }) } as any;
    vi.doMock('@vyro/db', () => ({ getDb: () => db }));
    const out = await pruneQueueEvents({ DB: {} as any, QUEUE_EVENTS_RETENTION_DAYS: '3' } as any);
    expect(out.deleted).toBe(7);
  });

  it('defaults to 7 days when env unset', async () => {
    const run = vi.fn().mockResolvedValue({ changes: 0 });
    const db = { delete: vi.fn().mockReturnValue({ where: () => ({ run }) }) } as any;
    vi.doMock('@vyro/db', () => ({ getDb: () => db }));
    const before = Date.now();
    await pruneQueueEvents({ DB: {} as any } as any);
    expect(run).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/api exec vitest run src/cron/pruneQueueEvents.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `apps/api/src/cron/pruneQueueEvents.ts`:

```ts
import { getDb } from '@vyro/db';
import { lt } from 'drizzle-orm';
import { queueEvents } from '@vyro/db/schema';
import type { Env } from '../env';

export async function pruneQueueEvents(env: Env): Promise<{ deleted: number }> {
  const days = Number(env.QUEUE_EVENTS_RETENTION_DAYS ?? '7');
  const cutoff = Date.now() - days * 86_400_000;
  const db = getDb(env.DB);
  const result = await db.delete(queueEvents).where(lt(queueEvents.createdAt, cutoff)).run();
  return { deleted: (result as { changes?: number }).changes ?? 0 };
}
```

- [ ] **Step 4: Register in cron index**

Read `apps/api/src/cron/index.ts`. Add an export and registration entry following the existing pattern:

```ts
import { pruneQueueEvents } from './pruneQueueEvents';
export const pruneQueueEventsJob = {
  name: 'pruneQueueEvents',
  schedule: '0 3 * * *',
  run: pruneQueueEvents,
};
```

(If the registry uses a different shape, mirror the existing jobs exactly.)

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @vyro/api exec vitest run src/cron/pruneQueueEvents.test.ts`
Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cron/pruneQueueEvents.ts \
        apps/api/src/cron/pruneQueueEvents.test.ts \
        apps/api/src/cron/index.ts
git commit -m "feat(api): nightly prune of queue_events older than retention"
```

---

## Task 13: Web hook + data layer (useAdminQueues)

**Files:**
- Create: `apps/web/src/admin/useAdminQueues.ts`

**Interfaces:**
- Produces:
  ```ts
  export function useAdminQueues(): {
    health: UseQueryResult<QueueHealth[]>;
    events: UseQueryResult<QueueEvent[]>;
    throughput: UseQueryResult<ThroughputPoint[]>;
    retry(eventId: string, editedPayload?: unknown): UseMutationResult<{ newMsgId: string }>;
    retryBulk(eventIds: string[], editedPayload?: unknown): UseMutationResult<{ replayed: number; failed: string[] }>;
    enqueue(queue: QueueName, payload: unknown): UseMutationResult<{ msgId: string; eventId: string }>;
  };
  ```

- [ ] **Step 1: Inspect existing hook patterns**

Read `apps/web/src/admin/useAdminObservability.ts` and `apps/web/src/admin/useAdminAudit.ts`. Mirror their query/mutation style (likely TanStack Query). Note the fetcher pattern, query key conventions, and mutation invalidation keys.

- [ ] **Step 2: Implement the hook**

Create `apps/web/src/admin/useAdminQueues.ts`. Use TanStack Query (`@tanstack/react-query` — verify presence; if absent use the same fetcher pattern as other hooks). Content:

```ts
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';

export type QueueName = 'audit' | 'notifications' | 'invoices';
export type QueueEventKind = 'retry' | 'dlq' | 'manual';

export type QueueHealth = {
  queue: QueueName;
  backlog: number;
  ackLast1h: number;
  errLast1h: number;
  p50Ms: number;
  p95Ms: number;
};

export type QueueEvent = {
  id: string;
  queue: QueueName;
  msgId: string;
  event: QueueEventKind;
  actorUserId: string | null;
  error: string | null;
  createdAt: number;
};

export type ThroughputPoint = { ts: number; queue: QueueName; acks: number };

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

export function useAdminQueues() {
  const qc = useQueryClient();
  const health = useQuery({
    queryKey: ['admin', 'queues', 'health'],
    queryFn: () => getJSON<{ queues: QueueHealth[] }>('/api/admin/queues/health').then((j) => j.queues),
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ['admin', 'queues', 'events'],
    queryFn: () => getJSON<{ events: QueueEvent[] }>('/api/admin/queues/events?limit=50').then((j) => j.events),
  });
  const throughput = useQuery({
    queryKey: ['admin', 'queues', 'throughput'],
    queryFn: () => getJSON<{ points: ThroughputPoint[] }>('/api/admin/queues/throughput').then((j) => j.points ?? []),
    enabled: false, // populated in Task 15 if API extended
  });
  const retry = useMutation({
    mutationFn: ({ id, editedPayload }: { id: string; editedPayload?: unknown }) =>
      postJSON<{ ok: true; newMsgId: string }>(`/api/admin/queues/retry/${id}`, { editedPayload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'queues'] }),
  });
  const retryBulk = useMutation({
    mutationFn: ({ eventIds, editedPayload }: { eventIds: string[]; editedPayload?: unknown }) =>
      postJSON<{ ok: true; replayed: number; failed: string[] }>('/api/admin/queues/retry-bulk', { eventIds, editedPayload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'queues'] }),
  });
  const enqueue = useMutation({
    mutationFn: ({ queue, payload }: { queue: QueueName; payload: unknown }) =>
      postJSON<{ ok: true; msgId: string; eventId: string }>('/api/admin/queues/enqueue', { queue, payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'queues'] }),
  });
  return { health, events, throughput, retry, retryBulk, enqueue };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/admin/useAdminQueues.ts
git commit -m "feat(web): useAdminQueues hook (health/events/retry/enqueue)"
```

---

## Task 14: QueuesPage component (TDD)

**Files:**
- Create: `apps/web/src/admin/QueuesPage.tsx`
- Create: `apps/web/src/admin/QueuesPage.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/admin/ObservabilityPage.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/admin/QueuesPage.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { QueuesPage } from './QueuesPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QueuesPage />
    </QueryClientProvider>,
  );
}

describe('QueuesPage', () => {
  it('renders queue tiles with health data', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/health')) {
        return Promise.resolve(new Response(JSON.stringify({ queues: [
          { queue: 'audit', backlog: 0, ackLast1h: 10, errLast1h: 0, p50Ms: 1, p95Ms: 2 },
          { queue: 'notifications', backlog: 0, ackLast1h: 5, errLast1h: 1, p50Ms: 3, p95Ms: 4 },
          { queue: 'invoices', backlog: 0, ackLast1h: 1, errLast1h: 0, p50Ms: 5, p95Ms: 6 },
        ] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }));
    }) as any;
    setup();
    expect(await screen.findByText(/audit/i)).toBeInTheDocument();
    expect(await screen.findByText(/notifications/i)).toBeInTheDocument();
    expect(await screen.findByText(/invoices/i)).toBeInTheDocument();
  });

  it('Retry button calls POST /retry/:id', async () => {
    const fetchMock = vi.fn().mockImplementation((url, init) => {
      if (String(url).includes('/health')) return Promise.resolve(new Response(JSON.stringify({ queues: [] }), { status: 200 }));
      if (String(url).includes('/events')) return Promise.resolve(new Response(JSON.stringify({ events: [
        { id: 'e1', queue: 'audit', msgId: 'm', event: 'retry', actorUserId: null, error: 'x', createdAt: Date.now() },
      ] }), { status: 200 }));
      if (String(url).includes('/retry/')) return Promise.resolve(new Response(JSON.stringify({ ok: true, newMsgId: 'm2' }), { status: 200 }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    global.fetch = fetchMock as any;
    setup();
    const btn = await screen.findByRole('button', { name: /retry/i });
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/retry/e1'), expect.objectContaining({ method: 'POST' })));
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/web exec vitest run src/admin/QueuesPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the page**

Create `apps/web/src/admin/QueuesPage.tsx`. Reuses existing list/table primitives — match conventions from `ObservabilityPage.tsx` and `Lists.tsx`. Implementation:

```tsx
import { useState } from 'react';
import { useAdminQueues, type QueueEvent } from './useAdminQueues';

export function QueuesPage() {
  const { health, events, retry, retryBulk, enqueue } = useAdminQueues();
  const [selected, setSelected] = useState<string[]>([]);
  const [openPayload, setOpenPayload] = useState<QueueEvent | null>(null);
  const [openEnqueue, setOpenEnqueue] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Queues & Jobs</h1>

      <section aria-label="Queue tiles" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(health.data ?? []).map((q) => (
          <div key={q.queue} className="rounded border p-4">
            <div className="text-sm uppercase text-gray-500">{q.queue}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>Backlog</div><div>{q.backlog}</div>
              <div>Acks (1h)</div><div>{q.ackLast1h}</div>
              <div>Errors (1h)</div><div>{q.errLast1h}</div>
              <div>p50</div><div>{q.p50Ms} ms</div>
              <div>p95</div><div>{q.p95Ms} ms</div>
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Failed messages">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Failed messages</h2>
          {selected.length > 0 && (
            <button
              className="rounded bg-blue-600 text-white px-3 py-1 text-sm"
              onClick={() => {
                if (confirm(`Replay ${selected.length} messages?`)) {
                  retryBulk.mutate({ eventIds: selected }, { onSuccess: () => setSelected([]) });
                }
              }}
            >
              Replay {selected.length} selected
            </button>
          )}
        </div>
        <table className="mt-2 w-full text-sm">
          <thead><tr><th></th><th>Queue</th><th>Msg id</th><th>Event</th><th>Error</th><th>When</th><th></th></tr></thead>
          <tbody>
            {(events.data ?? []).map((e) => (
              <tr key={e.id} className="border-t">
                <td><input type="checkbox" onChange={(ev) => setSelected((cur) => ev.target.checked ? [...cur, e.id] : cur.filter((x) => x !== e.id))} /></td>
                <td>{e.queue}</td>
                <td className="font-mono">{e.msgId.slice(0, 12)}</td>
                <td>{e.event}</td>
                <td className="text-red-600">{e.error ?? ''}</td>
                <td>{new Date(e.createdAt).toISOString()}</td>
                <td className="space-x-2">
                  <button className="underline" onClick={() => retry.mutate({ id: e.id })}>Retry</button>
                  <button className="underline" onClick={() => setOpenPayload(e)}>View payload</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.data?.length === 0 && <div className="text-sm text-gray-500 mt-2">No failures recorded.</div>}
      </section>

      <section>
        <button className="underline" onClick={() => setOpenEnqueue((v) => !v)}>{openEnqueue ? 'Hide' : 'Show'} manual enqueue</button>
        {openEnqueue && (
          <EnqueueForm onSubmit={(queue, payload) => {
            if (confirm(`Send to ${queue}?`)) enqueue.mutate({ queue, payload });
          }} />
        )}
      </section>

      {openPayload && (
        <Modal onClose={() => setOpenPayload(null)} title={`Payload ${openPayload.id}`}>
          <pre className="text-xs whitespace-pre-wrap">{openPayload.error ?? '(no error)'}</pre>
        </Modal>
      )}
    </div>
  );
}

function EnqueueForm({ onSubmit }: { onSubmit: (queue: 'audit' | 'notifications' | 'invoices', payload: unknown) => void }) {
  const [queue, setQueue] = useState<'audit' | 'notifications' | 'invoices'>('audit');
  const [raw, setRaw] = useState('{}');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-2">
      <select value={queue} onChange={(e) => setQueue(e.target.value as any)} className="rounded border p-1">
        <option value="audit">audit</option>
        <option value="notifications">notifications</option>
        <option value="invoices">invoices</option>
      </select>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="w-full h-32 font-mono text-xs rounded border p-2" />
      {err && <div className="text-red-600 text-xs">{err}</div>}
      <button
        className="rounded bg-blue-600 text-white px-3 py-1 text-sm"
        onClick={() => {
          try { onSubmit(queue, JSON.parse(raw)); setErr(null); } catch (e) { setErr(String(e)); }
        }}
      >Send</button>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded p-4 max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium mb-2">{title}</div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount route**

Edit `apps/web/src/App.tsx`. After the existing `const ObservabilityPage = lazy(...)` line, add:

```tsx
const QueuesPage = lazy(() => import('./admin/QueuesPage').then((m) => ({ default: m.QueuesPage })));
```

Inside the admin `<Route path="/admin" element={<AdminShell />}>` block, after the `observability` route, add:

```tsx
<Route path="observability/queues" element={<RequireAdmin><QueuesPage /></RequireAdmin>} />
```

- [ ] **Step 5: Add link from ObservabilityPage**

Read `apps/web/src/admin/ObservabilityPage.tsx`. Add a link to `/admin/observability/queues` matching the existing nav/link style (e.g. an `<a>` with the same styling as other admin section links).

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run src/admin/QueuesPage.test.tsx`
Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/admin/QueuesPage.tsx \
        apps/web/src/admin/QueuesPage.test.tsx \
        apps/web/src/App.tsx \
        apps/web/src/admin/ObservabilityPage.tsx
git commit -m "feat(web): admin Queues & Jobs page + nav link"
```

---

## Task 15: Integration test (end-to-end retry flow)

**Files:**
- Create: `apps/api/src/modules/admin/queues/queues.integration.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { queuesRoutes } from './queuesRoutes';
import { getDb } from '@vyro/db';
import { queueEvents, invoiceUploads } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';

function app(env: any) {
  const a = new Hono<{ Bindings: any }>();
  a.use('*', async (c, n) => { c.set('user', { id: 'admin-1', role: 'admin', permissions: ['queues:read', 'queues:write'] } as any); await n(); });
  a.route('/queues', queuesRoutes);
  return { a, env };
}

describe('queues integration', () => {
  it('retry flow: poison message → retry endpoint → success', async () => {
    const env = {
      DB: globalThis.__TEST_DB__,
      AUDIT_QUEUE: { send: async () => undefined },
      NOTIFICATIONS_QUEUE: { send: async () => undefined },
      INVOICES_QUEUE: { send: async () => ({ id: 'm-new' }) },
      CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 't',
      METRICS: { writeDataPoint: () => undefined, dataset: 'vyro_metrics' },
    } as any;

    // Seed a queue_events row simulating a prior retry event.
    const db = getDb(env.DB);
    const eventId = `it-${Date.now()}`;
    await db.insert(queueEvents).values({
      id: eventId,
      queue: 'invoices',
      msgId: 'm-old',
      event: 'retry',
      actorUserId: null,
      payloadJson: JSON.stringify({ uploadId: 'broken' }),
      error: 'R2 object missing',
      createdAt: Date.now(),
    });

    const { a } = app(env);
    const res = await a.fetch(new Request(`http://x/queues/retry/${eventId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ editedPayload: { uploadId: 'fixed' } }),
    }));
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.newMsgId).toBe('m-new');

    const after = await db.select().from(queueEvents).where(eq(queueEvents.id, eventId)).get();
    expect(after).toBeTruthy();

    const manual = await db.select().from(queueEvents).where(eq(queueEvents.msgId, 'm-new')).get();
    expect(manual?.event).toBe('manual');
  });
});
```

- [ ] **Step 2: Wire test DB setup**

Read `apps/api/src/migrate.test.ts` for the existing pattern. Reuse the same `__TEST_DB__` global setup. If integration tests aren't run by default, add the file path under `vitest.config.ts` (or co-located `*.integration.test.ts` rule).

- [ ] **Step 3: Run integration test**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queues.integration.test.ts`
Expected: PASS

- [ ] **Step 4: Run permission negative tests**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/admin/queues/queuesRoutes.test.ts`
Expected: PASS — already includes 403 case.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/queues/queues.integration.test.ts
git commit -m "test(api): queues end-to-end retry integration"
```

---

## Task 16: Final smoke + full test run + deploy note

**Files:**
- Modify: `docs/runbook.md` (deploy note appended)

- [ ] **Step 1: Run all tests + typecheck across monorepo**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 2: Lint**

Run: `pnpm --filter @vyro/api lint && pnpm --filter @vyro/web lint` (or whatever the project lint command is; check root `package.json`).
Expected: clean.

- [ ] **Step 3: Build SPA + Worker dry-run**

Run: `pnpm build`
Expected: exit 0

Run: `pnpm --filter @vyro/api exec wrangler deploy --dry-run --config apps/api/wrangler.toml`
Expected: dry-run succeeds.

- [ ] **Step 4: Append deploy note to runbook**

Open `docs/runbook.md`. Append at the end of the "Queue ops dashboard" section:

````markdown
### Deploying

After deploying, in production:

```bash
npx wrangler secret put CF_ACCOUNT_ID --config apps/api/wrangler.toml --env production
npx wrangler secret put CF_API_TOKEN --config apps/api/wrangler.toml --env production
```

Then visit `/admin/observability/queues` to confirm tiles render.
````

- [ ] **Step 5: Commit + push**

```bash
git add docs/runbook.md
git commit -m "docs: queue ops deploy notes"
git push
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Every section in `2026-09-09-vyro-admin-queue-ops-design.md` maps to a task:
  - Architecture → Tasks 2, 3, 5
  - Data model → Task 1
  - AE metric naming → Tasks 2, 5, 8
  - API contracts → Tasks 7, 9, 10
  - Permissions → Task 6
  - UI → Tasks 13, 14
  - Producer migration → Task 4
  - Consumer instrumentation → Task 5
  - Cron prune → Task 12
  - Configuration → Task 11
  - Testing → Tasks 2, 3, 7, 8, 9, 10, 12, 14, 15
  - Migration plan (feature flag → Tasks 11, 14)
  - Out-of-scope items (DLQ consumer, webhooks) explicitly omitted
- [x] **Placeholder scan:** No `TODO` / `TBD` / "implement later" in steps.
- [x] **Type consistency:** `QueueName` union = `'audit' | 'notifications' | 'invoices'` everywhere. `QueueEventKind` = `'retry' | 'dlq' | 'manual'`. `recordQueueMetric` signature identical across Tasks 2, 5, 8. Service function names consistent between Tasks 9, 10, 15.
- [x] **Permission gating:** Reads require `queues:read`, writes require `queues:write`. Tested in Task 10.
- [x] **Payload truncation:** `recordQueueEvent` truncates to 8 KB (Task 2). Service also slices JSON in `manualEnqueue` (Task 9).
- [x] **Migrations:** Single new migration `0021_queue_events.sql` (Task 1).
- [x] **Bulk limits:** `eventIds.max(100)` in Task 10 zod schema.

End of plan.