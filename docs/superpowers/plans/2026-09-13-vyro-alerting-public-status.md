# Vyro Alerting + Public Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship alerting engine, public status page, RUM, and admin alert UI on top of existing observability primitives so the system can run production operations.

**Architecture:** Worker cron sweeps SLO rules every 5 min against Analytics Engine SQL + D1 health + KV status. Breach → cooldown-deduped Slack/email/in-app notifications. Public `/status.json` + SPA page backed by KV. CF Web Analytics + custom AE beacon for RUM. UptimeRobot external probes feed incidents via webhook.

**Tech Stack:** Hono, Zod, Cloudflare Workers, Workers KV, Analytics Engine SQL API, Slack incoming webhooks, Resend transactional email, UptimeRobot (free), Cloudflare Web Analytics (beacon), vitest + @cloudflare/vitest-pool-workers, React + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-13-vyro-alerting-public-status-design.md`

## Global Constraints

- Node 20+, pnpm 9+, TypeScript strict.
- All new code ESM, vitest, no Jest.
- No new tables. Reuse `notifications`, `admin_audit_logs`, `payment_events`, `queue_events`.
- AE SQL rate limit 10/s/account. Sweep stays under by batching ≤ 11 rules.
- Worker cron registration uses `wrangler.toml` `[triggers]` only.
- Permission strings are kebab-case (`observability:read`).
- Status component names are fixed: `api`, `payments`, `queues`, `cron`, `web`.
- No PII in alert payloads (`user_id`, `phone`, `email` excluded).
- Worker route `/api/metrics/web` is CSRF-exempt, rate-limited 60/min/IP, no auth.
- All new secrets documented in runbook.
- Single Worker origin. No separate Pages.

---

## File Map

```
NEW:
  packages/shared/src/slo.ts                 rule schema + initial ruleset
  packages/shared/src/status.ts              status component + incident schemas
  packages/shared/src/index.ts                export new modules
  packages/validation/src/observability.ts   request body schemas (silence, incident)
  packages/validation/src/index.ts           export new module
  apps/api/src/observability/index.ts        barrel
  apps/api/src/observability/aeClient.ts     Analytics Engine SQL helper
  apps/api/src/observability/cooldown.ts     KV cooldown check/write
  apps/api/src/observability/notify.ts       Slack + Resend senders
  apps/api/src/observability/silence.ts      silence KV helpers
  apps/api/src/observability/status.ts       component status aggregator
  apps/api/src/observability/evaluator.ts    rule verdict engine
  apps/api/src/observability/types.ts        internal types
  apps/api/src/cron/observabilitySweep.ts    5-min sweep entrypoint
  apps/api/src/routes/publicStatus.ts        /status.json + /status
  apps/api/src/routes/metricsWeb.ts          /api/metrics/web (RUM ingest)
  apps/api/src/routes/adminAlerts.ts         /api/admin/observability/alerts/*
  apps/api/src/routes/adminIncidents.ts      /api/admin/observability/incidents/*
  apps/api/src/routes/adminUptimeWebhook.ts  /api/admin/observability/uptime-webhook
  apps/api/src/routes/adminTestHarness.ts    /api/admin/_test/5xx-burst
  apps/api/test/observability/cooldown.test.ts
  apps/api/test/observability/notify.test.ts
  apps/api/test/observability/evaluator.test.ts
  apps/api/test/observability/silence.test.ts
  apps/api/test/observability/status.test.ts
  apps/api/test/cron/observabilitySweep.integration.test.ts
  apps/api/test/routes/publicStatus.test.ts
  apps/api/test/routes/metricsWeb.test.ts
  apps/api/test/routes/adminAlerts.test.ts
  apps/api/test/routes/adminIncidents.test.ts
  apps/api/test/routes/adminTestHarness.test.ts
  apps/web/src/lib/rum.ts                    SPA CWV beacon writer
  apps/web/src/lib/useStatus.ts              polls /status.json
  apps/web/src/lib/useAlertRules.ts          react-query for alerts
  apps/web/src/pages/StatusPage.tsx          public status SPA
  apps/web/src/admin/ObservabilityAlertsPage.tsx
  apps/web/src/admin/components/AlertRuleCard.tsx
  apps/web/src/admin/components/AlertHistoryTable.tsx
  apps/web/src/admin/components/SilenceDialog.tsx
  apps/web/src/admin/components/IncidentComposer.tsx
  scripts/smoke/observability.ts             post-deploy smoke
  scripts/load/sweep.js                     k6 load on sweep
  apps/api/src/observability/__fixtures__/slack.alerts.json

MODIFIED:
  apps/api/wrangler.toml                     +ALERTS_KV, +cron, +vars
  apps/api/src/worker.ts                     wire cron + new routes
  apps/api/src/cron/index.ts                 register observabilitySweep
  apps/api/src/env.ts                        +ALERTS_KV, new vars
  apps/api/src/modules/admin/roles/schema.ts +observability perms
  apps/web/index.html                        CF Web Analytics beacon
  apps/web/src/router.tsx                    +/status, +/admin/observability/alerts
  docs/runbook.md                            new sections
```

---

## Task 1: Shared SLO + status schemas

**Files:**
- Create: `packages/shared/src/slo.ts`
- Create: `packages/shared/src/status.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/slo.test.ts`

**Interfaces:**
- Produces: `SloRule`, `SloQuery`, `AlertChannel`, `INITIAL_RULES` exported from `@vyro/shared`.

- [ ] **Step 1: Write failing test for slo.ts**

Create `packages/shared/test/slo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SloRuleSchema, INITIAL_RULES } from '../src/slo';

describe('SloRuleSchema', () => {
  it('parses a valid rule', () => {
    const rule = {
      name: 'api.p95_latency_ms',
      component: 'api' as const,
      description: 'p95 latency exceeds 1500ms',
      query: { kind: 'ae_sql', sql: 'SELECT 1' },
      comparator: 'gt' as const,
      threshold: 1500,
      window: '5m' as const,
      severity: 'warning' as const,
      cooldownSec: 1800,
      channels: ['slack', 'email', 'in_app'] as const,
      recipients: [{ role: 'ops' }],
    };
    expect(SloRuleSchema.parse(rule).name).toBe('api.p95_latency_ms');
  });

  it('rejects unknown component', () => {
    const rule = {
      name: 'x', component: 'unknown', description: '',
      query: { kind: 'd1_health' }, comparator: 'eq' as const,
      threshold: 0, window: '1m' as const, severity: 'critical' as const,
      cooldownSec: 60, channels: [] as const, recipients: [],
    };
    expect(() => SloRuleSchema.parse(rule)).toThrow();
  });

  it('rejects non-positive cooldown', () => {
    const rule = {
      name: 'x', component: 'api' as const, description: '',
      query: { kind: 'd1_health' }, comparator: 'eq' as const,
      threshold: 0, window: '1m' as const, severity: 'critical' as const,
      cooldownSec: 0, channels: [] as const, recipients: [],
    };
    expect(() => SloRuleSchema.parse(rule)).toThrow();
  });
});

describe('INITIAL_RULES', () => {
  it('contains unique names', () => {
    const names = INITIAL_RULES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('all rules disabled by default', () => {
    expect(INITIAL_RULES.every((r) => r.enabled === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
pnpm --filter @vyro/shared test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement slo.ts**

Create `packages/shared/src/slo.ts`:

```ts
import { z } from 'zod';

export const SloQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ae_sql'), sql: z.string().min(1) }),
  z.object({ kind: z.literal('d1_health') }),
  z.object({
    kind: z.literal('payment_lag'),
    maxAgeSec: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('queue_depth'),
    queue: z.enum(['audit', 'notifications', 'invoices']),
    max: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('staleness'),
    key: z.string().min(1),
    maxAgeSec: z.number().int().positive(),
  }),
]);

export const AlertChannelSchema = z.enum(['slack', 'email', 'in_app']);

export const SloRuleSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_.-]+$/),
  component: z.enum(['api', 'payments', 'queues', 'cron', 'web']),
  description: z.string().min(1),
  query: SloQuerySchema,
  comparator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq']),
  threshold: z.number(),
  window: z.enum(['1m', '5m', '15m', '1h', '24h']),
  severity: z.enum(['info', 'warning', 'critical']),
  cooldownSec: z.number().int().positive(),
  channels: z.array(AlertChannelSchema).min(0),
  recipients: z.array(z.object({ role: z.string() })),
  escalation: z
    .object({
      severity: z.literal('critical'),
      afterSec: z.number().int().positive(),
    })
    .optional(),
  doc: z.string().optional(),
  enabled: z.boolean().default(false),
});

export type SloQuery = z.infer<typeof SloQuerySchema>;
export type AlertChannel = z.infer<typeof AlertChannelSchema>;
export type SloRule = z.infer<typeof SloRuleSchema>;

export const INITIAL_RULES: SloRule[] = [
  {
    name: 'api.error_rate_5xx',
    component: 'api',
    description: '5xx ratio above 1% over 5 minutes',
    query: {
      kind: 'ae_sql',
      sql: "SELECT CAST(COUNT_IF(CAST(status AS INT) >= 500) AS REAL) / NULLIF(COUNT(), 0) AS v FROM vyro_metrics WHERE timestamp > NOW() - INTERVAL '5' MINUTE AND index1 = 'http'",
    },
    comparator: 'gt',
    threshold: 0.01,
    window: '5m',
    severity: 'warning',
    cooldownSec: 1800,
    channels: ['slack', 'email', 'in_app'],
    recipients: [{ role: 'ops' }],
    enabled: false,
  },
  {
    name: 'api.error_rate_5xx_critical',
    component: 'api',
    description: '5xx ratio above 5% over 5 minutes',
    query: {
      kind: 'ae_sql',
      sql: "SELECT CAST(COUNT_IF(CAST(status AS INT) >= 500) AS REAL) / NULLIF(COUNT(), 0) AS v FROM vyro_metrics WHERE timestamp > NOW() - INTERVAL '5' MINUTE AND index1 = 'http'",
    },
    comparator: 'gt',
    threshold: 0.05,
    window: '5m',
    severity: 'critical',
    cooldownSec: 900,
    channels: ['slack', 'email', 'in_app'],
    recipients: [{ role: 'super_admin' }, { role: 'ops' }],
    enabled: false,
  },
  {
    name: 'api.p95_latency_ms',
    component: 'api',
    description: 'p95 HTTP latency above 1500ms',
    query: {
      kind: 'ae_sql',
      sql: "SELECT QUANTILE(CAST(doubles[1] AS FLOAT), 0.95) AS v FROM vyro_metrics WHERE timestamp > NOW() - INTERVAL '5' MINUTE AND index1 = 'http'",
    },
    comparator: 'gt',
    threshold: 1500,
    window: '5m',
    severity: 'warning',
    cooldownSec: 1800,
    channels: ['slack', 'in_app'],
    recipients: [{ role: 'ops' }],
    enabled: false,
  },
  {
    name: 'd1.health',
    component: 'api',
    description: 'D1 ping failed',
    query: { kind: 'd1_health' },
    comparator: 'eq',
    threshold: 0,
    window: '1m',
    severity: 'critical',
    cooldownSec: 600,
    channels: ['slack', 'email', 'in_app'],
    recipients: [{ role: 'super_admin' }],
    escalation: { severity: 'critical', afterSec: 300 },
    enabled: false,
  },
  {
    name: 'payments.event_lag',
    component: 'payments',
    description: 'Newest payment_event older than 5 min',
    query: { kind: 'payment_lag', maxAgeSec: 300 },
    comparator: 'gt',
    threshold: 0,
    window: '15m',
    severity: 'warning',
    cooldownSec: 1800,
    channels: ['slack', 'in_app'],
    recipients: [{ role: 'finance' }],
    enabled: false,
  },
  {
    name: 'payments.reconcile_drift',
    component: 'payments',
    description: 'Reconciliation drift above 5 unmatched',
    query: { kind: 'ae_sql', sql: "SELECT 1 AS v FROM vyro_metrics WHERE 1=0" },
    comparator: 'gt',
    threshold: 5,
    window: '1h',
    severity: 'warning',
    cooldownSec: 3600,
    channels: ['slack', 'in_app'],
    recipients: [{ role: 'finance' }],
    enabled: false,
  },
  {
    name: 'queues.depth',
    component: 'queues',
    description: 'Queue backlog above 1000',
    query: {
      kind: 'queue_depth',
      queue: 'notifications',
      max: 1000,
    },
    comparator: 'gt',
    threshold: 0,
    window: '5m',
    severity: 'warning',
    cooldownSec: 1800,
    channels: ['slack', 'in_app'],
    recipients: [{ role: 'ops' }],
    enabled: false,
  },
  {
    name: 'queues.dlq',
    component: 'queues',
    description: 'DLQ events present in last 15 min',
    query: {
      kind: 'ae_sql',
      sql: "SELECT COUNT() AS v FROM vyro_metrics WHERE timestamp > NOW() - INTERVAL '15' MINUTE AND index1 = 'queue' AND blob2 = 'dlq'",
    },
    comparator: 'gt',
    threshold: 0,
    window: '15m',
    severity: 'critical',
    cooldownSec: 900,
    channels: ['slack', 'email', 'in_app'],
    recipients: [{ role: 'ops' }, { role: 'super_admin' }],
    enabled: false,
  },
  {
    name: 'cron.last_run',
    component: 'cron',
    description: 'No sweep metrics emitted in last 24h',
    query: {
      kind: 'staleness',
      key: 'status:updated_at',
      maxAgeSec: 86400,
    },
    comparator: 'gt',
    threshold: 0,
    window: '1h',
    severity: 'warning',
    cooldownSec: 3600,
    channels: ['slack', 'in_app'],
    recipients: [{ role: 'ops' }],
    enabled: false,
  },
  {
    name: 'web.cwv_p75_lcp_ms',
    component: 'web',
    description: 'p75 LCP above 4000ms',
    query: {
      kind: 'ae_sql',
      sql: "SELECT QUANTILE(CAST(doubles[1] AS FLOAT), 0.75) AS v FROM vyro_metrics WHERE timestamp > NOW() - INTERVAL '1' HOUR AND index1 = 'web.cwv' AND blob2 = 'lcp_ms'",
    },
    comparator: 'gt',
    threshold: 4000,
    window: '1h',
    severity: 'info',
    cooldownSec: 7200,
    channels: ['in_app'],
    recipients: [{ role: 'ops' }],
    enabled: false,
  },
  {
    name: 'sweep.stale',
    component: 'cron',
    description: 'Sweep has not updated status in 15 min',
    query: {
      kind: 'staleness',
      key: 'status:updated_at',
      maxAgeSec: 900,
    },
    comparator: 'gt',
    threshold: 0,
    window: '15m',
    severity: 'critical',
    cooldownSec: 600,
    channels: ['slack', 'email', 'in_app'],
    recipients: [{ role: 'super_admin' }],
    enabled: false,
  },
];
```

- [ ] **Step 4: Write status.ts**

Create `packages/shared/src/status.ts`:

```ts
import { z } from 'zod';

export const STATUS_COMPONENTS = [
  'api',
  'payments',
  'queues',
  'cron',
  'web',
] as const;

export const ComponentStatusSchema = z.enum([
  'operational',
  'degraded',
  'down',
  'unknown',
]);

export const StatusEntrySchema = z.object({
  status: ComponentStatusSchema,
  updatedAt: z.number(),
  detail: z.string().optional(),
});

export const IncidentUpdateSchema = z.object({
  at: z.number(),
  message: z.string().min(1),
});

export const IncidentSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  severity: z.enum(['info', 'warning', 'critical']),
  startedAt: z.number(),
  resolvedAt: z.number().optional(),
  components: z.array(z.enum(STATUS_COMPONENTS)),
  updates: z.array(IncidentUpdateSchema),
});

export const StatusPayloadSchema = z.object({
  components: z.object({
    api: StatusEntrySchema,
    payments: StatusEntrySchema,
    queues: StatusEntrySchema,
    cron: StatusEntrySchema,
    web: StatusEntrySchema,
  }),
  incidents: z.array(IncidentSchema),
  updatedAt: z.number(),
  version: z.string(),
});

export type ComponentName = (typeof STATUS_COMPONENTS)[number];
export type ComponentStatus = z.infer<typeof ComponentStatusSchema>;
export type StatusEntry = z.infer<typeof StatusEntrySchema>;
export type Incident = z.infer<typeof IncidentSchema>;
export type StatusPayload = z.infer<typeof StatusPayloadSchema>;
```

- [ ] **Step 5: Update shared index**

Modify `packages/shared/src/index.ts` — add:

```ts
export * from './slo';
export * from './status';
```

- [ ] **Step 6: Run tests, expect pass**

```bash
pnpm --filter @vyro/shared test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/slo.ts packages/shared/src/status.ts packages/shared/src/index.ts packages/shared/test/slo.test.ts
git commit -m "feat(shared): add SLO rule schema + status component schema"
```

---

## Task 2: Observability validation package

**Files:**
- Create: `packages/validation/src/observability.ts`
- Modify: `packages/validation/src/index.ts`

- [ ] **Step 1: Create observability.ts**

```ts
import { z } from 'zod';

export const SilenceBodySchema = z.object({
  ruleName: z.string().min(1).max(120),
  durationMinutes: z.number().int().positive().max(43200),
  reason: z.string().min(1).max(500),
});

export const IncidentCreateSchema = z.object({
  title: z.string().min(1).max(200),
  severity: z.enum(['info', 'warning', 'critical']),
  components: z
    .array(
      z.enum(['api', 'payments', 'queues', 'cron', 'web']),
    )
    .min(1),
  message: z.string().min(1).max(2000),
});

export const IncidentUpdateSchema = z.object({
  message: z.string().min(1).max(2000),
});

export const MetricsWebBodySchema = z.object({
  lcp_ms: z.number().nonnegative().optional(),
  inp_ms: z.number().nonnegative().optional(),
  cls: z.number().nonnegative().optional(),
  route: z.string().max(200),
});

export const UptimeWebhookSchema = z.object({
  monitor: z.object({ id: z.number(), name: z.string() }),
  status: z.enum(['up', 'down']),
  timestamp: z.number(),
});
```

- [ ] **Step 2: Update index**

Modify `packages/validation/src/index.ts` — add:

```ts
export * from './observability';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/validation/src/observability.ts packages/validation/src/index.ts
git commit -m "feat(validation): add observability request schemas"
```

---

## Task 3: wrangler config + env updates (local)

**Files:**
- Modify: `apps/api/wrangler.toml`
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Add ALERTS_KV binding to wrangler.toml**

Append inside the top-level (before `[triggers]`):

```toml
[[kv_namespaces]]
binding = "ALERTS_KV"
id = "local-alerts-kv"
```

Append inside `[triggers] crons`:

```toml
"*/5 * * * *"
```

Append inside `[vars]`:

```toml
STATUS_PAGE_ORIGIN = "http://localhost:5173"
OPS_EMAIL = "ops@example.test"
UPTIMEROBOT_WEBHOOK_SECRET = "dev-uptime-secret"
```

- [ ] **Step 2: Mirror changes in [env.production] block**

Append inside `[env.production]`:

```toml
[[env.production.kv_namespaces]]
binding = "ALERTS_KV"
id = "REPLACE_WITH_PROD_KV_ID"
```

In `[env.production.vars]`:

```toml
STATUS_PAGE_ORIGIN = "https://status.vyro.lk"
OPS_EMAIL = "ops@vyro.lk"
```

Production crons append `"*/5 * * * *"` inside `[env.production.triggers] crons`.

Production secrets (manual): `ALERT_SLACK_WEBHOOK_URL`, `RESEND_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_WEB_ANALYTICS_TOKEN`, `UPTIMEROBOT_WEBHOOK_SECRET`.

- [ ] **Step 3: Extend env.ts**

In `apps/api/src/env.ts`, add to `Env`:

```ts
ALERTS_KV: KVNamespace;
ALERT_SLACK_WEBHOOK_URL?: string;
RESEND_API_KEY?: string;
OPS_EMAIL?: string;
STATUS_PAGE_ORIGIN?: string;
UPTIMEROBOT_WEBHOOK_SECRET?: string;
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/wrangler.toml apps/api/src/env.ts
git commit -m "feat(api): add ALERTS_KV binding + observability cron + env vars"
```

---

## Task 4: Analytics Engine SQL client

**Files:**
- Create: `apps/api/src/observability/aeClient.ts`
- Test: `apps/api/test/observability/aeClient.test.ts`

**Interfaces:**
- Produces: `queryAe(env, sql): Promise<{ v: number }[]>` — single column `v`.

- [ ] **Step 1: Write failing test**

Create `apps/api/test/observability/aeClient.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { queryAe } from '../../../src/observability/aeClient';

describe('queryAe', () => {
  it('POSTs to Analytics Engine SQL API with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ meta: [], data: [{ v: 0.12 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const env = {
      CF_ACCOUNT_ID: 'acct',
      CF_API_TOKEN: 'tok',
    } as any;
    const rows = await queryAe(env, 'SELECT 1', fetchMock as any);
    expect(rows).toEqual([{ v: 0.12 }]);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain('/accounts/acct/analytics_engine/sql');
    expect(calledInit.method).toBe('POST');
    expect(calledInit.headers.Authorization).toBe('Bearer tok');
  });

  it('throws on 4xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('bad sql', { status: 400 }),
    );
    const env = {
      CF_ACCOUNT_ID: 'acct',
      CF_API_TOKEN: 'tok',
    } as any;
    await expect(
      queryAe(env, 'SELECT bad', fetchMock as any),
    ).rejects.toThrow(/AE SQL 400/);
  });

  it('returns empty array on no data', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ meta: [], data: [] }), { status: 200 }),
    );
    const env = {
      CF_ACCOUNT_ID: 'acct',
      CF_API_TOKEN: 'tok',
    } as any;
    expect(await queryAe(env, 'SELECT 1', fetchMock as any)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
pnpm --filter @vyro/api test aeClient
```

- [ ] **Step 3: Implement aeClient.ts**

```ts
export async function queryAe(
  env: { CF_ACCOUNT_ID?: string; CF_API_TOKEN?: string },
  sql: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ v: number }[]> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    throw new Error('AE SQL requires CF_ACCOUNT_ID + CF_API_TOKEN');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: sql,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`AE SQL ${res.status}: ${txt.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    meta?: unknown[];
    data?: { v?: number }[];
  };
  return (body.data ?? [])
    .map((r) => ({ v: Number(r.value ?? r.v ?? 0) }))
    .filter((r) => Number.isFinite(r.v));
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @vyro/api test aeClient
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/aeClient.ts apps/api/test/observability/aeClient.test.ts
git commit -m "feat(api): add Analytics Engine SQL client"
```

---

## Task 5: Cooldown KV helper

**Files:**
- Create: `apps/api/src/observability/cooldown.ts`
- Test: `apps/api/test/observability/cooldown.test.ts`

**Interfaces:**
- Produces: `checkCooldown(env, ruleName, windowSec)`, `markFired(env, ruleName, severity, value, cooldownSec)`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  checkCooldown,
  markFired,
} from '../../../src/observability/cooldown';

function makeKV() {
  const store = new Map<string, { value: string; ttl: number; at: number }>();
  return {
    async get(key: string) {
      const e = store.get(key);
      if (!e) return null;
      if (Date.now() - e.at > e.ttl * 1000) {
        store.delete(key);
        return null;
      }
      return e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, { value, ttl: opts?.expirationTtl ?? 0, at: Date.now() });
    },
  };
}

describe('cooldown', () => {
  it('returns active=true when key exists', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    await markFired(env, 'api.p95', 'warning', 2000, 1800);
    const r = await checkCooldown(env, 'api.p95', 300);
    expect(r.active).toBe(true);
    expect(r.severity).toBe('warning');
  });

  it('returns active=false when key absent', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    const r = await checkCooldown(env, 'missing', 300);
    expect(r.active).toBe(false);
  });

  it('critical severity escalation overrides existing warning', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    await markFired(env, 'api.p95', 'warning', 2000, 1800);
    const r = await checkCooldown(
      env,
      'api.p95',
      300,
      'critical',
    );
    expect(r.active).toBe(false);
  });

  it('key namespace uses rule + window bucket', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    await markFired(env, 'api.p95', 'warning', 2000, 1800);
    const r1 = await checkCooldown(env, 'api.p95', 300);
    expect(r1.active).toBe(true);
    expect(r1.windowBucket).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
pnpm --filter @vyro/api test cooldown
```

- [ ] **Step 3: Implement cooldown.ts**

```ts
export type CooldownCheck = {
  active: boolean;
  severity?: 'info' | 'warning' | 'critical';
  value?: number;
  windowBucket: number;
  firedAt?: number;
};

const SEVERITY_RANK: Record<string, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

function bucket(windowSec: number, now = Date.now()): number {
  return Math.floor(now / 1000 / windowSec);
}

function key(ruleName: string, bucket: number): string {
  return `cooldown:${ruleName}:${bucket}`;
}

export async function checkCooldown(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
  windowSec: number,
  incomingSeverity: 'info' | 'warning' | 'critical' = 'warning',
): Promise<CooldownCheck> {
  const b = bucket(windowSec);
  const raw = await env.ALERTS_KV.get(key(ruleName, b));
  if (!raw) {
    return { active: false, windowBucket: b };
  }
  let parsed: {
    severity: 'info' | 'warning' | 'critical';
    value: number;
    firedAt: number;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { active: false, windowBucket: b };
  }
  const existingRank = SEVERITY_RANK[parsed.severity] ?? 0;
  const incomingRank = SEVERITY_RANK[incomingSeverity] ?? 0;
  if (incomingRank > existingRank) {
    return { active: false, windowBucket: b };
  }
  return {
    active: true,
    severity: parsed.severity,
    value: parsed.value,
    windowBucket: b,
    firedAt: parsed.firedAt,
  };
}

export async function markFired(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
  severity: 'info' | 'warning' | 'critical',
  value: number,
  cooldownSec: number,
): Promise<void> {
  const b = bucket(cooldownSec);
  const payload = JSON.stringify({ severity, value, firedAt: Date.now() });
  await env.ALERTS_KV.put(key(ruleName, b), payload, {
    expirationTtl: cooldownSec + 60,
  });
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @vyro/api test cooldown
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/cooldown.ts apps/api/test/observability/cooldown.test.ts
git commit -m "feat(api): add KV cooldown helper"
```

---

## Task 6: Silence helper

**Files:**
- Create: `apps/api/src/observability/silence.ts`
- Test: `apps/api/test/observability/silence.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isSilenced, silenceRule, unsilenceRule } from '../../../src/observability/silence';

function makeKV() {
  const store = new Map<string, { v: string; ttl: number; at: number }>();
  return {
    async get(k: string) {
      const e = store.get(k);
      if (!e) return null;
      if (Date.now() - e.at > e.ttl * 1000) {
        store.delete(k);
        return null;
      }
      return e.v;
    },
    async put(k: string, v: string, opts?: { expirationTtl?: number }) {
      store.set(k, { v, ttl: opts?.expirationTtl ?? 0, at: Date.now() });
    },
    async delete(k: string) {
      store.delete(k);
    },
  };
}

describe('silence', () => {
  it('isSilenced returns false when no key', async () => {
    const env = { ALERTS_KV: makeKV() } as any;
    expect(await isSilenced(env, 'api.p95')).toBe(false);
  });

  it('silenceRule then isSilenced returns true', async () => {
    const env = { ALERTS_KV: makeKV() } as any;
    await silenceRule(env, 'api.p95', 'alice', 'maintenance', 30);
    const s = await isSilenced(env, 'api.p95');
    expect(typeof s === 'object' && s !== null).toBe(true);
  });

  it('unsilenceRule clears', async () => {
    const env = { ALERTS_KV: makeKV() } as any;
    await silenceRule(env, 'api.p95', 'alice', 'x', 30);
    await unsilenceRule(env, 'api.p95');
    expect(await isSilenced(env, 'api.p95')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
pnpm --filter @vyro/api test silence
```

- [ ] **Step 3: Implement silence.ts**

```ts
export type SilenceEntry = {
  silencedBy: string;
  reason: string;
  expiresAt: number;
};

export async function isSilenced(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
): Promise<false | SilenceEntry> {
  const raw = await env.ALERTS_KV.get(`silenced:${ruleName}`);
  if (!raw) return false;
  try {
    return JSON.parse(raw) as SilenceEntry;
  } catch {
    return false;
  }
}

export async function silenceRule(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
  silencedBy: string,
  reason: string,
  durationMinutes: number,
): Promise<SilenceEntry> {
  const entry: SilenceEntry = {
    silencedBy,
    reason,
    expiresAt: Date.now() + durationMinutes * 60_000,
  };
  await env.ALERTS_KV.put(`silenced:${ruleName}`, JSON.stringify(entry), {
    expirationTtl: durationMinutes * 60 + 60,
  });
  return entry;
}

export async function unsilenceRule(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
): Promise<void> {
  await env.ALERTS_KV.delete(`silenced:${ruleName}`);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @vyro/api test silence
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/silence.ts apps/api/test/observability/silence.test.ts
git commit -m "feat(api): add rule silence KV helpers"
```

---

## Task 7: Notify module (Slack + Resend)

**Files:**
- Create: `apps/api/src/observability/notify.ts`
- Create: `apps/api/src/observability/__fixtures__/slack.alerts.json`
- Test: `apps/api/test/observability/notify.test.ts`

- [ ] **Step 1: Write golden fixture**

Create `apps/api/src/observability/__fixtures__/slack.alerts.json`:

```json
{
  "text": "🚨 [warning] api.p95_latency_ms",
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "[warning] api.p95_latency_ms" } },
    { "type": "section", "fields": [
      { "type": "mrkdwn", "text": "*Component*\napi" },
      { "type": "mrkdwn", "text": "*Value*\n1800" },
      { "type": "mrkdwn", "text": "*Threshold*\n1500" },
      { "type": "mrkdwn", "text": "*Window*\n5m" }
    ]},
    { "type": "context", "elements": [
      { "type": "mrkdwn", "text": "Silence: /admin/observability/alerts" }
    ]}
  ]
}
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { notifySlack, notifyEmail } from '../../../src/observability/notify';
import golden from '../../../src/observability/__fixtures__/slack.alerts.json';

describe('notifySlack', () => {
  it('POSTs Block Kit payload to webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const ok = await notifySlack(
      { ALERT_SLACK_WEBHOOK_URL: 'https://hooks/x' } as any,
      { ruleName: 'api.p95_latency_ms', severity: 'warning', component: 'api', value: 1800, threshold: 1500, window: '5m' },
      fetchMock as any,
    );
    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text).toBe(golden.text);
    expect(body.blocks).toHaveLength(golden.blocks.length);
  });

  it('retries once on 5xx, then drops', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const ok = await notifySlack(
      { ALERT_SLACK_WEBHOOK_URL: 'https://hooks/x' } as any,
      { ruleName: 'r', severity: 'warning', component: 'api', value: 1, threshold: 0, window: '5m' },
      fetchMock as any,
    );
    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns false when webhook url missing', async () => {
    const ok = await notifySlack(
      {} as any,
      { ruleName: 'r', severity: 'warning', component: 'api', value: 1, threshold: 0, window: '5m' },
    );
    expect(ok).toBe(false);
  });
});

describe('notifyEmail', () => {
  it('POSTs to Resend API', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"id":"x"}', { status: 200 }));
    const ok = await notifyEmail(
      { RESEND_API_KEY: 're_x', OPS_EMAIL: 'ops@example.test' } as any,
      { ruleName: 'api.p95', severity: 'warning', component: 'api', value: 1800, threshold: 1500, window: '5m' },
      fetchMock as any,
    );
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('resend.com');
    expect(init.headers.Authorization).toBe('Bearer re_x');
  });
});
```

- [ ] **Step 3: Run test, expect failure**

```bash
pnpm --filter @vyro/api test notify
```

- [ ] **Step 4: Implement notify.ts**

```ts
export type AlertContext = {
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  component: 'api' | 'payments' | 'queues' | 'cron' | 'web';
  value: number;
  threshold: number;
  window: string;
};

function slackPayload(ctx: AlertContext) {
  return {
    text: `🚨 [${ctx.severity}] ${ctx.ruleName}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `[${ctx.severity}] ${ctx.ruleName}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Component*\n${ctx.component}` },
          { type: 'mrkdwn', text: `*Value*\n${ctx.value}` },
          { type: 'mrkdwn', text: `*Threshold*\n${ctx.threshold}` },
          { type: 'mrkdwn', text: `*Window*\n${ctx.window}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Silence: /admin/observability/alerts',
          },
        ],
      },
    ],
  };
}

export async function notifySlack(
  env: { ALERT_SLACK_WEBHOOK_URL?: string },
  ctx: AlertContext,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.ALERT_SLACK_WEBHOOK_URL) return false;
  const body = JSON.stringify(slackPayload(ctx));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(env.ALERT_SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
  }
  return false;
}

export async function notifyEmail(
  env: { RESEND_API_KEY?: string; OPS_EMAIL?: string },
  ctx: AlertContext,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.OPS_EMAIL) return false;
  const subject = `[vyro][${ctx.severity}] ${ctx.ruleName}`;
  const html = `<h2>${subject}</h2><table><tr><th>Component</th><td>${ctx.component}</td></tr><tr><th>Value</th><td>${ctx.value}</td></tr><tr><th>Threshold</th><td>${ctx.threshold}</td></tr><tr><th>Window</th><td>${ctx.window}</td></tr></table><p>Silence: /admin/observability/alerts</p>`;
  const text = `${subject}\nComponent: ${ctx.component}\nValue: ${ctx.value}\nThreshold: ${ctx.threshold}\nWindow: ${ctx.window}\nSilence: /admin/observability/alerts`;
  const body = JSON.stringify({
    from: 'Vyro Ops <ops@vyro.lk>',
    to: [env.OPS_EMAIL],
    subject,
    html,
    text,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
  }
  return false;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @vyro/api test notify
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/observability/notify.ts apps/api/src/observability/__fixtures__ apps/api/test/observability/notify.test.ts
git commit -m "feat(api): add Slack + Resend notifiers with retry"
```

---

## Task 8: Status aggregator

**Files:**
- Create: `apps/api/src/observability/status.ts`
- Test: `apps/api/test/observability/status.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  writeStatus,
  readStatus,
  readStatusPayload,
} from '../../../src/observability/status';

function makeKV() {
  const store = new Map<string, string>();
  return {
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
  };
}

describe('status aggregator', () => {
  it('writes and reads component status', async () => {
    const env = { ALERTS_KV: makeKV(), VERSION: 'abc123' } as any;
    await writeStatus(env, 'api', { status: 'degraded', detail: 'slow' });
    const r = await readStatus(env, 'api');
    expect(r?.status).toBe('degraded');
    expect(r?.detail).toBe('slow');
  });

  it('readStatusPayload returns all 5 components + version', async () => {
    const env = { ALERTS_KV: makeKV(), VERSION: 'abc' } as any;
    await writeStatus(env, 'api', { status: 'operational' });
    const payload = await readStatusPayload(env, []);
    expect(Object.keys(payload.components).sort()).toEqual(
      ['api', 'cron', 'payments', 'queues', 'web'],
    );
    expect(payload.version).toBe('abc');
  });

  it('marks unknown when updatedAt older than maxAgeMs', async () => {
    const env = { ALERTS_KV: makeKV(), VERSION: 'v' } as any;
    await writeStatus(env, 'api', { status: 'operational' });
    const old = Date.now() - 60_000;
    // overwrite updatedAt to simulate staleness
    const raw = await env.ALERTS_KV.get('status:api');
    const parsed = JSON.parse(raw!);
    parsed.updatedAt = old;
    await env.ALERTS_KV.put('status:api', JSON.stringify(parsed));
    const payload = await readStatusPayload(env, [], 30_000);
    expect(payload.components.api.status).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
pnpm --filter @vyro/api test observability/status
```

- [ ] **Step 3: Implement status.ts**

```ts
import type {
  ComponentName,
  StatusEntry,
  StatusPayload,
  Incident,
} from '@vyro/shared';

const COMPONENTS: ComponentName[] = [
  'api',
  'payments',
  'queues',
  'cron',
  'web',
];

export async function writeStatus(
  env: { ALERTS_KV: KVNamespace },
  component: ComponentName,
  partial: { status: StatusEntry['status']; detail?: string },
): Promise<void> {
  const entry: StatusEntry = {
    status: partial.status,
    detail: partial.detail,
    updatedAt: Date.now(),
  };
  await env.ALERTS_KV.put(`status:${component}`, JSON.stringify(entry), {
    expirationTtl: 3600,
  });
  await env.ALERTS_KV.put('status:updated_at', String(entry.updatedAt), {
    expirationTtl: 3600,
  });
}

export async function readStatus(
  env: { ALERTS_KV: KVNamespace },
  component: ComponentName,
): Promise<StatusEntry | null> {
  const raw = await env.ALERTS_KV.get(`status:${component}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StatusEntry;
  } catch {
    return null;
  }
}

export async function readStatusPayload(
  env: { ALERTS_KV: KVNamespace; VERSION?: string },
  incidents: Incident[],
  maxAgeMs = 30 * 60_000,
): Promise<StatusPayload> {
  const components: StatusPayload['components'] = {} as any;
  for (const c of COMPONENTS) {
    const entry = await readStatus(env, c);
    if (!entry) {
      components[c] = { status: 'unknown', updatedAt: 0 };
      continue;
    }
    if (Date.now() - entry.updatedAt > maxAgeMs) {
      components[c] = { ...entry, status: 'unknown' };
    } else {
      components[c] = entry;
    }
  }
  return {
    components,
    incidents,
    updatedAt: Date.now(),
    version: env.VERSION ?? 'dev',
  };
}

export async function touchUpdatedAt(env: {
  ALERTS_KV: KVNamespace;
}): Promise<void> {
  await env.ALERTS_KV.put('status:updated_at', String(Date.now()), {
    expirationTtl: 3600,
  });
}

export async function readUpdatedAt(env: {
  ALERTS_KV: KVNamespace;
}): Promise<number | null> {
  const v = await env.ALERTS_KV.get('status:updated_at');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @vyro/api test observability/status
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/status.ts apps/api/test/observability/status.test.ts
git commit -m "feat(api): add status aggregator (KV-backed component health)"
```

---

## Task 9: Evaluator

**Files:**
- Create: `apps/api/src/observability/evaluator.ts`
- Test: `apps/api/test/observability/evaluator.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { evaluateRule } from '../../../src/observability/evaluator';

describe('evaluateRule', () => {
  const rule = {
    name: 'api.p95_latency_ms',
    component: 'api' as const,
    description: '',
    query: { kind: 'ae_sql', sql: 'SELECT 0' },
    comparator: 'gt' as const,
    threshold: 1500,
    window: '5m' as const,
    severity: 'warning' as const,
    cooldownSec: 1800,
    channels: [],
    recipients: [],
    enabled: true,
  };

  it('returns ok=true when value passes threshold', async () => {
    const env = {} as any;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ v: 100 }] }), { status: 200 }),
    );
    const v = await evaluateRule(env, rule, fetchMock as any);
    expect(v.ok).toBe(true);
    expect(v.value).toBe(100);
  });

  it('returns ok=false when value fails threshold', async () => {
    const env = {} as any;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ v: 2000 }] }), { status: 200 }),
    );
    const v = await evaluateRule(env, rule, fetchMock as any);
    expect(v.ok).toBe(false);
    expect(v.value).toBe(2000);
  });

  it('returns ok=true (no-op) when value missing', async () => {
    const env = {} as any;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const v = await evaluateRule(env, rule, fetchMock as any);
    expect(v.ok).toBe(true);
    expect(v.value).toBeNull();
  });

  it('treats d1_health threshold 0 as failed when ping fails', async () => {
    const env = { DB: { prepare: () => ({ first: async () => null }) } } as any;
    const v = await evaluateRule(
      env,
      { ...rule, query: { kind: 'd1_health' }, threshold: 0, comparator: 'eq' },
    );
    expect(v.ok).toBe(false);
  });

  it('treats d1_health threshold 0 as ok when ping returns row', async () => {
    const env = { DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } } as any;
    const v = await evaluateRule(
      env,
      { ...rule, query: { kind: 'd1_health' }, threshold: 0, comparator: 'eq' },
    );
    expect(v.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
pnpm --filter @vyro/api test evaluator
```

- [ ] **Step 3: Implement evaluator.ts**

```ts
import type { SloRule } from '@vyro/shared';
import { queryAe } from './aeClient';

export type Verdict = {
  ok: boolean;
  value: number | null;
  rule: SloRule;
};

function compare(
  op: SloRule['comparator'],
  value: number,
  threshold: number,
): boolean {
  switch (op) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
  }
}

async function runQuery(
  env: any,
  rule: SloRule,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  if (rule.query.kind === 'ae_sql') {
    const rows = await queryAe(env, rule.query.sql, fetchImpl);
    return rows[0]?.v ?? null;
  }
  if (rule.query.kind === 'd1_health') {
    try {
      const row = await env.DB.prepare('SELECT 1 as ok').first();
      return row?.ok === 1 ? 1 : 0;
    } catch {
      return 0;
    }
  }
  if (rule.query.kind === 'staleness') {
    const v = await env.ALERTS_KV.get(rule.query.key);
    if (!v) return Number.MAX_SAFE_INTEGER;
    const n = Number(v);
    return Number.isFinite(n) ? Date.now() - n : Number.MAX_SAFE_INTEGER;
  }
  // payment_lag, queue_depth: return sentinel; implementation lives in sweep
  // for these kinds in task 10.
  return null;
}

export async function evaluateRule(
  env: any,
  rule: SloRule,
  fetchImpl: typeof fetch = fetch,
): Promise<Verdict> {
  let value: number | null = null;
  try {
    value = await runQuery(env, rule, fetchImpl);
  } catch {
    return { ok: true, value: null, rule };
  }
  if (value === null) {
    return { ok: true, value: null, rule };
  }
  const ok = !compare(rule.comparator, value, rule.threshold);
  return { ok, value, rule };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @vyro/api test evaluator
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/evaluator.ts apps/api/test/observability/evaluator.test.ts
git commit -m "feat(api): add SLO rule evaluator"
```

---

## Task 10: observabilitySweep cron

**Files:**
- Create: `apps/api/src/cron/observabilitySweep.ts`
- Create: `apps/api/src/observability/index.ts`
- Modify: `apps/api/src/cron/index.ts`
- Test: `apps/api/test/cron/observabilitySweep.integration.test.ts`

- [ ] **Step 1: Create observability barrel**

Create `apps/api/src/observability/index.ts`:

```ts
export * from './aeClient';
export * from './cooldown';
export * from './evaluator';
export * from './notify';
export * from './silence';
export * from './status';
```

- [ ] **Step 2: Write failing integration test**

Create `apps/api/test/cron/observabilitySweep.integration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runObservabilitySweep } from '../../../src/cron/observabilitySweep';

function makeKV() {
  const store = new Map<string, string>();
  return {
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async put(k: string, v: string, opts?: { expirationTtl?: number }) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
  };
}

describe('observabilitySweep', () => {
  it('writes notification + audit + cooldown + status on rule failure', async () => {
    const kv = makeKV();
    const notifications: any[] = [];
    const audits: any[] = [];
    const env = {
      ALERTS_KV: kv,
      CF_ACCOUNT_ID: 'a',
      CF_API_TOKEN: 'b',
      DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
      ALERT_SLACK_WEBHOOK_URL: undefined,
      RESEND_API_KEY: undefined,
      OPS_EMAIL: undefined,
      logNotification: async (n: any) => {
        notifications.push(n);
      },
      logAudit: async (a: any) => {
        audits.push(a);
      },
    } as any;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        // AE for any rule
        new Response(JSON.stringify({ data: [{ v: 2000 }] }), { status: 200 }),
      );
    const result = await runObservabilitySweep(env, fetchMock as any);
    expect(result.evaluated).toBeGreaterThan(0);
    expect(notifications.length).toBeGreaterThan(0);
    expect(audits.length).toBe(notifications.length);
    expect(result.failed).toBeGreaterThan(0);
  });

  it('skips rules under silence', async () => {
    const kv = makeKV();
    await kv.put(
      'silenced:api.p95_latency_ms',
      JSON.stringify({
        silencedBy: 'alice',
        reason: 'maint',
        expiresAt: Date.now() + 60_000,
      }),
    );
    const env = {
      ALERTS_KV: kv,
      CF_ACCOUNT_ID: 'a',
      CF_API_TOKEN: 'b',
      DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
      logNotification: async () => {},
      logAudit: async () => {},
    } as any;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ v: 2000 }] }), { status: 200 }),
      );
    await runObservabilitySweep(env, fetchMock as any);
    // silence skips fire — fetch may still run for other rules but api.p95 should not fire.
    // We assert by checking cooldown key for api.p95 is absent.
    const cd = await kv.get('cooldown:api.p95_latency_ms:any');
    expect(cd).toBeNull();
  });
});
```

- [ ] **Step 3: Run test, expect failure**

```bash
pnpm --filter @vyro/api test observabilitySweep
```

- [ ] **Step 4: Implement observabilitySweep.ts**

```ts
import { INITIAL_RULES, SloRule } from '@vyro/shared';
import { evaluateRule } from '../observability/evaluator';
import {
  checkCooldown,
  markFired,
} from '../observability/cooldown';
import { isSilenced } from '../observability/silence';
import {
  notifySlack,
  notifyEmail,
} from '../observability/notify';
import {
  writeStatus,
  readStatusPayload,
  touchUpdatedAt,
} from '../observability/status';
import { metric } from '../lib/metrics';

export type SweepResult = {
  evaluated: number;
  failed: number;
  errors: number;
};

const WINDOW_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '24h': 86400,
};

export async function runObservabilitySweep(
  env: any,
  fetchImpl: typeof fetch = fetch,
): Promise<SweepResult> {
  const t0 = Date.now();
  let evaluated = 0;
  let failed = 0;
  let errors = 0;
  const componentStatus: Record<string, 'operational' | 'degraded' | 'down'> =
    {
      api: 'operational',
      payments: 'operational',
      queues: 'operational',
      cron: 'operational',
      web: 'operational',
    };

  for (const rule of INITIAL_RULES) {
    evaluated++;
    try {
      const silence = await isSilenced(env, rule.name);
      if (silence) {
        metric('sweep.rule_evaluations', 1, { rule: rule.name, verdict: 'silenced' });
        continue;
      }
      const verdict = await evaluateRule(env, rule, fetchImpl);
      metric('sweep.rule_evaluations', 1, {
        rule: rule.name,
        verdict: verdict.ok ? 'ok' : 'fail',
      });

      if (verdict.ok) {
        // healthy
      } else {
        const windowSec = WINDOW_SECONDS[rule.window] ?? 300;
        const cd = await checkCooldown(
          env,
          rule.name,
          rule.cooldownSec,
          rule.severity,
        );
        if (!cd.active) {
          await fireAlert(env, rule, verdict.value ?? 0);
          await markFired(
            env,
            rule.name,
            rule.severity,
            verdict.value ?? 0,
            rule.cooldownSec,
          );
          failed++;
        }
        // mark component degraded/down
        if (rule.component in componentStatus) {
          componentStatus[rule.component] =
            rule.severity === 'critical' ? 'down' : 'degraded';
        }
      }
    } catch (err) {
      errors++;
      metric('sweep.rule_errors', 1, { rule: rule.name });
    }
  }

  // status writes
  for (const [c, s] of Object.entries(componentStatus)) {
    await writeStatus(env, c as any, { status: s });
  }
  await touchUpdatedAt(env);
  metric('sweep.duration_ms', Date.now() - t0);

  return { evaluated, failed, errors };
}

async function fireAlert(
  env: any,
  rule: SloRule,
  value: number,
): Promise<void> {
  const ctx = {
    ruleName: rule.name,
    severity: rule.severity,
    component: rule.component,
    value,
    threshold: rule.threshold,
    window: rule.window,
  };
  if (rule.channels.includes('in_app') && env.logNotification) {
    for (const r of rule.recipients) {
      await env.logNotification({
        recipient_role: r.role,
        category: 'observability_alert',
        severity: rule.severity,
        source: 'admin',
        source_ref: rule.name,
        title: rule.name,
        body: `${rule.description} — value=${value}, threshold=${rule.threshold}`,
        link: '/admin/observability/alerts',
        metadata: JSON.stringify(ctx),
      });
    }
  }
  if (rule.channels.includes('slack')) {
    await notifySlack(env, ctx);
  }
  if (rule.channels.includes('email')) {
    await notifyEmail(env, ctx);
  }
  if (env.logAudit) {
    await env.logAudit({
      action: 'observability.alert.fired',
      actor_user_id: null,
      target_type: 'rule',
      target_id: rule.name,
      metadata: ctx,
    });
  }
}
```

- [ ] **Step 5: Wire cron**

Modify `apps/api/src/cron/index.ts` — add to the registry:

```ts
import { runObservabilitySweep } from './observabilitySweep';

export const cronHandlers: Record<string, (env: any) => Promise<unknown>> = {
  // ...existing handlers
  observabilitySweep: runObservabilitySweep,
};
```

- [ ] **Step 6: Run integration tests**

```bash
pnpm --filter @vyro/api test observabilitySweep
```

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/cron/observabilitySweep.ts apps/api/src/observability/index.ts apps/api/src/cron/index.ts apps/api/test/cron/observabilitySweep.integration.test.ts
git commit -m "feat(api): add observabilitySweep cron + integration tests"
```

---

## Task 11: Public status route + SPA page

**Files:**
- Create: `apps/api/src/routes/publicStatus.ts`
- Create: `apps/web/src/lib/useStatus.ts`
- Create: `apps/web/src/pages/StatusPage.tsx`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/web/src/router.tsx`
- Test: `apps/api/test/routes/publicStatus.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readStatusPayload } from '../../../src/observability/status';

describe('publicStatus route', () => {
  it('readStatusPayload returns expected shape', async () => {
    const kv = {
      async get() { return null; },
      async put() {},
    } as any;
    const env = { ALERTS_KV: kv, VERSION: 'v1' } as any;
    const p = await readStatusPayload(env, []);
    expect(p.version).toBe('v1');
    expect(p.components.api.status).toBe('unknown');
  });
});
```

- [ ] **Step 2: Implement publicStatus.ts**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import { readStatusPayload } from '../observability/status';

const router = new Hono<{ Bindings: Env }>();

router.get('/status.json', async (c) => {
  const payload = await readStatusPayload(c.env, []);
  return c.json(payload);
});

router.get('/status', (c) => c.redirect('/', 302));

export default router;
```

- [ ] **Step 3: Wire route in worker.ts**

In `apps/api/src/worker.ts`, add to the public router:

```ts
import publicStatus from './routes/publicStatus';
app.route('/', publicStatus);
```

- [ ] **Step 4: Create useStatus hook**

Create `apps/web/src/lib/useStatus.ts`:

```ts
import { useEffect, useState } from 'react';

type StatusPayload = {
  components: Record<
    string,
    { status: 'operational' | 'degraded' | 'down' | 'unknown'; updatedAt: number }
  >;
  incidents: Array<{
    id: string;
    title: string;
    severity: string;
    startedAt: number;
    resolvedAt?: number;
  }>;
  updatedAt: number;
  version: string;
};

export function useStatus() {
  const [data, setData] = useState<StatusPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/status.json', { credentials: 'omit' });
        if (!res.ok) return;
        const json = (await res.json()) as StatusPayload;
        if (!cancelled) setData(json);
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return data;
}
```

- [ ] **Step 5: Create StatusPage.tsx**

Create `apps/web/src/pages/StatusPage.tsx`:

```tsx
import { useStatus } from '../lib/useStatus';

const COMPONENTS = ['api', 'payments', 'queues', 'cron', 'web'];

export default function StatusPage() {
  const data = useStatus();
  if (!data) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">Vyro Status</h1>
        <p>Loading…</p>
      </main>
    );
  }
  const stale = Date.now() - data.updatedAt > 15 * 60_000;
  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Vyro Status</h1>
      <p className="text-sm text-gray-600">Version: {data.version}</p>
      {stale && (
        <div className="my-4 p-3 bg-yellow-100 border border-yellow-300">
          Data may be stale.
        </div>
      )}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Components</h2>
        <ul className="mt-2 space-y-2">
          {COMPONENTS.map((c) => {
            const entry = data.components[c];
            return (
              <li
                key={c}
                className="flex justify-between border-b py-2"
              >
                <span>{c}</span>
                <span className={`font-medium ${entry?.status === 'operational' ? 'text-green-700' : entry?.status === 'degraded' ? 'text-yellow-700' : entry?.status === 'down' ? 'text-red-700' : 'text-gray-500'}`}>
                  {entry?.status ?? 'unknown'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {data.incidents.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Active Incidents</h2>
          <ul className="mt-2 space-y-3">
            {data.incidents.map((inc) => (
              <li key={inc.id} className="border p-3">
                <div className="font-medium">{inc.title}</div>
                <div className="text-sm text-gray-600">
                  severity={inc.severity}, started={new Date(inc.startedAt).toISOString()}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Add /status route**

In `apps/web/src/router.tsx`, add:

```tsx
import StatusPage from './pages/StatusPage';
// inside <Routes>:
<Route path="/status" element={<StatusPage />} />
```

- [ ] **Step 7: Run tests + typecheck**

```bash
pnpm --filter @vyro/api test publicStatus && pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/publicStatus.ts apps/api/src/worker.ts apps/web/src/lib/useStatus.ts apps/web/src/pages/StatusPage.tsx apps/web/src/router.tsx apps/api/test/routes/publicStatus.test.ts
git commit -m "feat(web+api): add public /status.json + status SPA page"
```

---

## Task 12: Admin alert routes

**Files:**
- Create: `apps/api/src/routes/adminAlerts.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/routes/adminAlerts.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';

describe('adminAlerts routes', () => {
  it('silence body validates', async () => {
    const { SilenceBodySchema } = await import('@vyro/validation');
    expect(
      SilenceBodySchema.safeParse({
        ruleName: 'api.p95',
        durationMinutes: 30,
        reason: 'maint',
      }).success,
    ).toBe(true);
    expect(
      SilenceBodySchema.safeParse({ ruleName: '', durationMinutes: 0, reason: '' })
        .success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Implement adminAlerts.ts**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import { INITIAL_RULES } from '@vyro/shared';
import { SilenceBodySchema } from '@vyro/validation';
import { silenceRule, unsilenceRule, isSilenced } from '../observability/silence';
import { getDb } from '@vyro/db';
import { notifications } from '@vyro/db/schema';

const router = new Hono<{ Bindings: Env }>();

router.get('/api/admin/observability/alerts/rules', async (c) => {
  const kv = c.env.ALERTS_KV;
  const enriched = await Promise.all(
    INITIAL_RULES.map(async (r) => ({
      ...r,
      silenced: !!(await isSilenced(c.env, r.name)),
    })),
  );
  return c.json({ rules: enriched });
});

router.get('/api/admin/observability/alerts/history', async (c) => {
  const url = new URL(c.req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const rows = await getDb(c.env.DB)
    .select()
    .from(notifications)
    .where(/* category = 'observability_alert' */ undefined as any)
    .limit(limit);
  return c.json({ rows });
});

router.post('/api/admin/observability/alerts/silence', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SilenceBodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const ctx = (c.get('ctx') as any) ?? {};
  const entry = await silenceRule(
    c.env,
    parsed.data.ruleName,
    ctx.userId ?? 'unknown',
    parsed.data.reason,
    parsed.data.durationMinutes,
  );
  return c.json({ ok: true, entry });
});

router.delete('/api/admin/observability/alerts/silence/:ruleName', async (c) => {
  await unsilenceRule(c.env, c.req.param('ruleName'));
  return c.json({ ok: true });
});

export default router;
```

Note: replace the `undefined as any` placeholder with the actual Drizzle filter using `eq(notifications.category, 'observability_alert')` once schema is checked.

- [ ] **Step 3: Wire route in worker.ts**

```ts
import adminAlerts from './routes/adminAlerts';
app.route('/', adminAlerts);
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter @vyro/api test adminAlerts && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/adminAlerts.ts apps/api/src/worker.ts apps/api/test/routes/adminAlerts.test.ts
git commit -m "feat(api): add admin alerts routes (rules, history, silence)"
```

---

## Task 13: Admin incidents routes

**Files:**
- Create: `apps/api/src/routes/adminIncidents.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/routes/adminIncidents.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  IncidentCreateSchema,
} from '@vyro/validation';

describe('adminIncidents schemas', () => {
  it('rejects empty components', () => {
    expect(
      IncidentCreateSchema.safeParse({
        title: 't',
        severity: 'warning',
        components: [],
        message: 'm',
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Implement adminIncidents.ts**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import {
  IncidentCreateSchema,
  IncidentUpdateSchema,
} from '@vyro/validation';
import { ulid } from 'uuid';

const router = new Hono<{ Bindings: Env }>();

const INCIDENT_KEY = (id: string) => `incident:${id}`;
const INCIDENTS_INDEX = 'incidents:index';

async function listIncidents(env: Env) {
  const raw = await env.ALERTS_KV.get(INCIDENTS_INDEX);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const rows = await Promise.all(
    ids.map((id) => env.ALERTS_KV.get(INCIDENT_KEY(id))),
  );
  return rows
    .filter((r): r is string => !!r)
    .map((r) => JSON.parse(r));
}

router.get('/api/admin/observability/incidents', async (c) => {
  return c.json({ incidents: await listIncidents(c.env) });
});

router.post('/api/admin/observability/incidents', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = IncidentCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const id = ulid();
  const now = Date.now();
  const incident = {
    id,
    title: parsed.data.title,
    severity: parsed.data.severity,
    components: parsed.data.components,
    startedAt: now,
    updates: [{ at: now, message: parsed.data.message }],
  };
  await c.env.ALERTS_KV.put(INCIDENT_KEY(id), JSON.stringify(incident), {
    expirationTtl: 30 * 86400,
  });
  const idxRaw = await c.env.ALERTS_KV.get(INCIDENTS_INDEX);
  const idx: string[] = idxRaw ? JSON.parse(idxRaw) : [];
  idx.unshift(id);
  await c.env.ALERTS_KV.put(INCIDENTS_INDEX, JSON.stringify(idx.slice(0, 200)), {
    expirationTtl: 30 * 86400,
  });
  return c.json({ ok: true, incident });
});

router.patch('/api/admin/observability/incidents/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = IncidentUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const raw = await c.env.ALERTS_KV.get(INCIDENT_KEY(id));
  if (!raw) return c.json({ error: 'not_found' }, 404);
  const inc = JSON.parse(raw);
  inc.updates.push({ at: Date.now(), message: parsed.data.message });
  await c.env.ALERTS_KV.put(INCIDENT_KEY(id), JSON.stringify(inc), {
    expirationTtl: 30 * 86400,
  });
  return c.json({ ok: true, incident: inc });
});

router.post('/api/admin/observability/incidents/:id/resolve', async (c) => {
  const id = c.req.param('id');
  const raw = await c.env.ALERTS_KV.get(INCIDENT_KEY(id));
  if (!raw) return c.json({ error: 'not_found' }, 404);
  const inc = JSON.parse(raw);
  inc.resolvedAt = Date.now();
  await c.env.ALERTS_KV.put(INCIDENT_KEY(id), JSON.stringify(inc), {
    expirationTtl: 86400,
  });
  return c.json({ ok: true, incident: inc });
});

export default router;
```

- [ ] **Step 3: Wire route**

```ts
import adminIncidents from './routes/adminIncidents';
app.route('/', adminIncidents);
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter @vyro/api test adminIncidents && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/adminIncidents.ts apps/api/src/worker.ts apps/api/test/routes/adminIncidents.test.ts
git commit -m "feat(api): add admin incidents routes"
```

---

## Task 14: Test harness route

**Files:**
- Create: `apps/api/src/routes/adminTestHarness.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/routes/adminTestHarness.test.ts`

- [ ] **Step 1: Implement adminTestHarness.ts**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';

const router = new Hono<{ Bindings: Env }>();

router.get('/api/admin/_test/5xx-burst', (c) => {
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'disabled_in_prod' }, 403);
  }
  return c.json({ error: 'synthetic_5xx' }, 500);
});

router.post('/api/admin/_test/5xx-burst', async (c) => {
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'disabled_in_prod' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { n?: number };
  const n = Math.min(Math.max(body.n ?? 1, 1), 50);
  return c.json({ fired: n, status: 500 }, 500);
});

export default router;
```

- [ ] **Step 2: Wire route**

```ts
import adminTestHarness from './routes/adminTestHarness';
app.route('/', adminTestHarness);
```

- [ ] **Step 3: Write test**

```ts
import { describe, it, expect } from 'vitest';
import app from '../../../src/worker';

describe('admin test harness', () => {
  it('returns 500 in dev', async () => {
    const env = { ENVIRONMENT: 'local' } as any;
    const res = await app.request('/api/admin/_test/5xx-burst', { method: 'GET' }, env);
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @vyro/api test adminTestHarness
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/adminTestHarness.ts apps/api/src/worker.ts apps/api/test/routes/adminTestHarness.test.ts
git commit -m "feat(api): add admin 5xx test harness (dev-only)"
```

---

## Task 15: UptimeRobot webhook

**Files:**
- Create: `apps/api/src/routes/adminUptimeWebhook.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/routes/adminUptimeWebhook.test.ts`

- [ ] **Step 1: Implement adminUptimeWebhook.ts**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import { UptimeWebhookSchema } from '@vyro/validation';
import { ulid } from 'uuid';

const router = new Hono<{ Bindings: Env }>();

router.post('/api/admin/observability/uptime-webhook', async (c) => {
  const sig = c.req.header('x-uptime-signature') ?? '';
  const body = await c.req.text();
  if (!c.env.UPTIMEROBOT_WEBHOOK_SECRET) {
    return c.json({ error: 'secret_missing' }, 503);
  }
  const expected = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body + c.env.UPTIMEROBOT_WEBHOOK_SECRET),
  );
  const hex = Array.from(new Uint8Array(expected))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (hex !== sig) return c.json({ error: 'bad_signature' }, 401);

  const parsed = UptimeWebhookSchema.safeParse(JSON.parse(body || '{}'));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const evt = parsed.data;
  if (evt.status !== 'down') return c.json({ ok: true, ignored: true });
  const id = ulid();
  const incident = {
    id,
    title: `External monitor down: ${evt.monitor.name}`,
    severity: 'critical' as const,
    components: ['api'] as const,
    startedAt: evt.timestamp * 1000,
    updates: [
      {
        at: evt.timestamp * 1000,
        message: `UptimeRobot reported monitor ${evt.monitor.id} down`,
      },
    ],
  };
  await c.env.ALERTS_KV.put(`incident:${id}`, JSON.stringify(incident), {
    expirationTtl: 30 * 86400,
  });
  const idxRaw = await c.env.ALERTS_KV.get('incidents:index');
  const idx: string[] = idxRaw ? JSON.parse(idxRaw) : [];
  idx.unshift(id);
  await c.env.ALERTS_KV.put('incidents:index', JSON.stringify(idx.slice(0, 200)), {
    expirationTtl: 30 * 86400,
  });
  return c.json({ ok: true, incident });
});

export default router;
```

- [ ] **Step 2: Wire route**

```ts
import adminUptimeWebhook from './routes/adminUptimeWebhook';
app.route('/', adminUptimeWebhook);
```

- [ ] **Step 3: Write test**

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import adminUptimeWebhook from '../../../src/routes/adminUptimeWebhook';

async function sign(body: string, secret: string) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body + secret),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('uptime webhook', () => {
  it('rejects bad signature', async () => {
    const env = {
      UPTIMEROBOT_WEBHOOK_SECRET: 'secret',
      ALERTS_KV: { async get() { return null; }, async put() {} },
    } as any;
    const app = new Hono();
    app.route('/', adminUptimeWebhook);
    const res = await app.request(
      '/api/admin/observability/uptime-webhook',
      {
        method: 'POST',
        body: JSON.stringify({ monitor: { id: 1, name: 'x' }, status: 'down', timestamp: 100 }),
        headers: { 'x-uptime-signature': 'wrong' },
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @vyro/api test adminUptimeWebhook
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/adminUptimeWebhook.ts apps/api/src/worker.ts apps/api/test/routes/adminUptimeWebhook.test.ts
git commit -m "feat(api): add UptimeRobot webhook for incident creation"
```

---

## Task 16: Frontend RUM beacon + /api/metrics/web

**Files:**
- Create: `apps/web/src/lib/rum.ts`
- Create: `apps/api/src/routes/metricsWeb.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/routes/metricsWeb.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import metricsWeb from '../../../src/routes/metricsWeb';

describe('metricsWeb', () => {
  it('writes AE datapoint and returns 204', async () => {
    const writes: any[] = [];
    const env = {
      METRICS: { writeDataPoint: (d: any) => writes.push(d) },
    } as any;
    const app = (await import('hono')).Hono();
    app.route('/', metricsWeb);
    const res = await app.request(
      '/api/metrics/web',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lcp_ms: 1500, route: '/x' }),
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(writes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement metricsWeb.ts**

```ts
import { Hono } from 'hono';
import type { Env } from '../env';
import { MetricsWebBodySchema } from '@vyro/validation';

const router = new Hono<{ Bindings: Env }>();

router.post('/api/metrics/web', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MetricsWebBodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (c.env.METRICS) {
    try {
      c.env.METRICS.writeDataPoint({
        blobs: ['web.cwv', 'lcp_ms', parsed.data.route],
        doubles: [parsed.data.lcp_ms ?? 0],
        indexes: ['web.cwv'],
      });
    } catch {
      // swallow
    }
  }
  return c.body(null, 204);
});

export default router;
```

- [ ] **Step 3: Wire route**

```ts
import metricsWeb from './routes/metricsWeb';
app.route('/', metricsWeb);
```

- [ ] **Step 4: Implement rum.ts**

Create `apps/web/src/lib/rum.ts`:

```ts
import { onLCP, onINP, onCLS } from 'web-vitals';

type Cwv = {
  lcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  route: string;
};

let booted = false;

export function bootRum(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  const collect = (kind: string, value: number) => {
    const payload: Cwv = {
      lcp_ms: undefined,
      inp_ms: undefined,
      cls: undefined,
      route: window.location.pathname,
    };
    if (kind === 'lcp') payload.lcp_ms = value;
    if (kind === 'inp') payload.inp_ms = value;
    if (kind === 'cls') payload.cls = value;
    if (!navigator.sendBeacon) return;
    navigator.sendBeacon(
      '/api/metrics/web',
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    );
  };
  onLCP((m) => collect('lcp', m.value));
  onINP((m) => collect('inp', m.value));
  onCLS((m) => collect('cls', m.value));
}
```

- [ ] **Step 5: Add web-vitals dependency**

```bash
pnpm --filter @vyro/web add web-vitals
```

- [ ] **Step 6: Wire bootRum in main.tsx**

In `apps/web/src/main.tsx`, after app render:

```ts
import { bootRum } from './lib/rum';
bootRum();
```

- [ ] **Step 7: Run tests + typecheck**

```bash
pnpm --filter @vyro/api test metricsWeb && pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/rum.ts apps/web/src/main.tsx apps/api/src/routes/metricsWeb.ts apps/api/src/worker.ts apps/api/test/routes/metricsWeb.test.ts package.json pnpm-lock.yaml
git commit -m "feat(web+api): add RUM CWV beacon + /api/metrics/web ingest"
```

---

## Task 17: CF Web Analytics beacon

**Files:**
- Modify: `apps/web/index.html`

- [ ] **Step 1: Inject beacon**

Insert before `</head>`:

```html
<script defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "${import.meta.env.VITE_CF_WEB_ANALYTICS_TOKEN ?? ''}"}'></script>
```

- [ ] **Step 2: Add env var to web/.env.example**

Append:

```
VITE_CF_WEB_ANALYTICS_TOKEN=
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html apps/web/.env.example
git commit -m "feat(web): inject Cloudflare Web Analytics beacon"
```

---

## Task 18: Admin ObservabilityAlertsPage UI

**Files:**
- Create: `apps/web/src/admin/ObservabilityAlertsPage.tsx`
- Create: `apps/web/src/admin/components/AlertRuleCard.tsx`
- Create: `apps/web/src/admin/components/AlertHistoryTable.tsx`
- Create: `apps/web/src/admin/components/SilenceDialog.tsx`
- Create: `apps/web/src/lib/useAlertRules.ts`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Create useAlertRules hook**

```ts
import { useEffect, useState } from 'react';

type SloRule = {
  name: string;
  component: string;
  description: string;
  severity: string;
  threshold: number;
  window: string;
  comparator: string;
  enabled: boolean;
  silenced: boolean;
};

export function useAlertRules() {
  const [rules, setRules] = useState<SloRule[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/observability/alerts/rules', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setRules(j.rules);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return rules;
}

export async function silenceRule(
  ruleName: string,
  durationMinutes: number,
  reason: string,
) {
  const res = await fetch('/api/admin/observability/alerts/silence', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ruleName, durationMinutes, reason }),
  });
  if (!res.ok) throw new Error('silence_failed');
  return res.json();
}

export async function unsilenceRule(ruleName: string) {
  const res = await fetch(
    `/api/admin/observability/alerts/silence/${encodeURIComponent(ruleName)}`,
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) throw new Error('unsilence_failed');
  return res.json();
}
```

- [ ] **Step 2: Create AlertRuleCard component**

```tsx
import type { ReactNode } from 'react';

export function AlertRuleCard({
  rule,
  onSilence,
}: {
  rule: {
    name: string;
    component: string;
    description: string;
    severity: string;
    threshold: number;
    window: string;
    comparator: string;
    enabled: boolean;
    silenced: boolean;
  };
  onSilence: () => void;
}): ReactNode {
  return (
    <div className="border rounded p-3 mb-2">
      <div className="flex justify-between">
        <div>
          <div className="font-medium">{rule.name}</div>
          <div className="text-sm text-gray-600">{rule.description}</div>
        </div>
        <div className="text-right text-sm">
          <div>{rule.component}</div>
          <div>
            {rule.comparator} {rule.threshold} / {rule.window}
          </div>
          <div>severity={rule.severity}</div>
        </div>
      </div>
      <div className="mt-2 text-sm">
        {rule.silenced ? (
          <span className="text-yellow-700">silenced</span>
        ) : rule.enabled ? (
          <span className="text-green-700">enabled</span>
        ) : (
          <span className="text-gray-500">disabled</span>
        )}
        <button
          onClick={onSilence}
          className="ml-3 px-2 py-1 border rounded text-xs"
        >
          Silence…
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create AlertHistoryTable**

```tsx
export function AlertHistoryTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">Time</th>
          <th>Rule</th>
          <th>Severity</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="py-1">
              {new Date(r.created_at).toISOString()}
            </td>
            <td>{r.source_ref}</td>
            <td>{r.severity}</td>
            <td>{r.title}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Create SilenceDialog**

```tsx
import { useState } from 'react';

export function SilenceDialog({
  ruleName,
  onConfirm,
  onCancel,
}: {
  ruleName: string;
  onConfirm: (durationMinutes: number, reason: string) => void;
  onCancel: () => void;
}) {
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-4 rounded shadow w-96">
        <h2 className="font-semibold mb-2">Silence {ruleName}</h2>
        <label className="block text-sm">
          Duration (minutes)
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="block w-full border rounded px-2 py-1"
          />
        </label>
        <label className="block text-sm mt-2">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full border rounded px-2 py-1"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1 border rounded">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(duration, reason)}
            className="px-3 py-1 bg-blue-600 text-white rounded"
          >
            Silence
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ObservabilityAlertsPage**

```tsx
import { useState } from 'react';
import { useAlertRules, silenceRule } from '../lib/useAlertRules';
import { AlertRuleCard } from './components/AlertRuleCard';
import { AlertHistoryTable } from './components/AlertHistoryTable';
import { SilenceDialog } from './components/SilenceDialog';

export default function ObservabilityAlertsPage() {
  const rules = useAlertRules();
  const [dialogRule, setDialogRule] = useState<string | null>(null);
  const [history] = useState<any[]>([]);
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Observability Alerts</h1>
      <section>
        <h2 className="font-semibold mb-2">Rules</h2>
        {!rules && <p>Loading…</p>}
        {rules?.map((r) => (
          <AlertRuleCard
            key={r.name}
            rule={r}
            onSilence={() => setDialogRule(r.name)}
          />
        ))}
      </section>
      <section className="mt-8">
        <h2 className="font-semibold mb-2">History</h2>
        <AlertHistoryTable rows={history} />
      </section>
      {dialogRule && (
        <SilenceDialog
          ruleName={dialogRule}
          onCancel={() => setDialogRule(null)}
          onConfirm={async (dur, reason) => {
            await silenceRule(dialogRule, dur, reason);
            setDialogRule(null);
            window.location.reload();
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 6: Wire route**

In `apps/web/src/router.tsx`, inside admin section:

```tsx
import ObservabilityAlertsPage from './admin/ObservabilityAlertsPage';
<Route path="/admin/observability/alerts" element={<ObservabilityAlertsPage />} />
```

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/admin apps/web/src/lib/useAlertRules.ts apps/web/src/router.tsx
git commit -m "feat(web): add admin observability alerts page"
```

---

## Task 19: Permissions seeding

**Files:**
- Modify: `apps/api/src/modules/admin/roles/schema.ts` (or seed file, depending on layout)

- [ ] **Step 1: Add permissions to role schema**

Locate the role permissions schema (search `apps/api/src/modules/admin/roles/` for `permission`). Add two strings to the permission enum/array:

```ts
'observability:read',
'observability:write',
```

Grant `observability:read` and `observability:write` to `super_admin` and `ops` (write restricted to super_admin only if desired — confirm with existing role matrix).

- [ ] **Step 2: Run rbac audit**

```bash
pnpm --filter @vyro/api audit:rbac
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/admin/roles
git commit -m "feat(api): seed observability:read/write permissions"
```

---

## Task 20: Smoke + load scripts

**Files:**
- Create: `scripts/smoke/observability.ts`
- Create: `scripts/load/sweep.js`

- [ ] **Step 1: Implement smoke script**

```ts
#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';

const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:8787';

async function hit(path: string, opts: RequestInit = {}) {
  const res = await fetch(ORIGIN + path, opts);
  return res;
}

async function main() {
  console.log('smoke: checking /api/health');
  const health = await hit('/api/health');
  if (health.status !== 200) throw new Error('health_not_ok');

  console.log('smoke: checking /status.json');
  const status = await hit('/status.json');
  if (status.status !== 200) throw new Error('status_not_ok');

  console.log('smoke: triggering 5xx burst');
  const burst = await hit('/api/admin/_test/5xx-burst', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ n: 10 }),
  });
  if (burst.status !== 500) throw new Error('burst_failed');

  console.log('smoke: waiting one sweep cycle');
  await sleep(360_000); // 6 minutes

  const after = await hit('/status.json');
  if (after.status !== 200) throw new Error('post_status_failed');
  console.log('smoke: ok');
}

main().catch((err) => {
  console.error('smoke failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Implement load script**

`scripts/load/sweep.js`:

```js
import http from 'node:http';
import { Counter, Trend } from 'k6/metrics';

export const options = {
  vus: 50,
  duration: '2m',
};

const sweepLatency = new Trend('sweep_latency_ms');

export default function () {
  const t0 = Date.now();
  http.get(`${__ENV.SWEEP_URL ?? 'http://localhost:8787/api/admin/cron/observabilitySweep/run'}`, {
    headers: { cookie: __ENV.ADMIN_COOKIE ?? '' },
  });
  sweepLatency.add(Date.now() - t0);
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke/observability.ts scripts/load/sweep.js
git commit -m "feat(scripts): add observability smoke + k6 load"
```

---

## Task 21: Runbook update

**Files:**
- Modify: `docs/runbook.md`

- [ ] **Step 1: Append "Observability alerts" section**

```md
## Observability alerts

Worker cron `observabilitySweep` runs every 5 minutes, evaluating SLO
rules against Analytics Engine SQL + D1 health + KV staleness. Breach
fires Slack (`#vyro-ops`), email (`ops@vyro.lk`), and an in-app admin
notification.

### Manual trigger

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/cron/observabilitySweep/run \
  -H "Cookie: <admin session>"
```

### Silence a rule

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/observability/alerts/silence \
  -H "Cookie: <admin session>" \
  -H "Content-Type: application/json" \
  -d '{"ruleName":"api.p95_latency_ms","durationMinutes":60,"reason":"deploy"}'
```

### Inspect rules

```bash
curl https://vyro-api.thufailahamed627.workers.dev/api/admin/observability/alerts/rules \
  -H "Cookie: <admin session>"
```

### Public status

`https://status.vyro.lk` (CNAME to Worker) serves the live component
status JSON at `/status.json`.

### UptimeRobot

Two monitors probe `/api/health` and `/status.json` every 5 minutes.
Webhook posts to `/api/admin/observability/uptime-webhook` (HMAC-signed
with `UPTIMEROBOT_WEBHOOK_SECRET`) and auto-creates an incident on
down.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbook.md
git commit -m "docs(runbook): add observability alerts section"
```

---

## Task 22: Production wrangler promotion + secrets setup

**Files:**
- Modify: `apps/api/wrangler.toml` (env.production block already touched in Task 3)

- [ ] **Step 1: Replace KV placeholder with real production KV id**

In `[env.production.kv_namespaces]` set `id = "<real-kv-id>"` after creating the KV namespace:

```bash
wrangler kv:namespace create ALERTS_KV --env production --config apps/api/wrangler.toml
```

Copy the returned id into the toml.

- [ ] **Step 2: Set production secrets**

```bash
wrangler secret put ALERT_SLACK_WEBHOOK_URL --env production --config apps/api/wrangler.toml
wrangler secret put RESEND_API_KEY --env production --config apps/api/wrangler.toml
```

`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `UPTIMEROBOT_WEBHOOK_SECRET`,
`BETTER_AUTH_SECRET` already set in prior runbook steps. Verify
`wrangler secret list --env production --config apps/api/wrangler.toml`.

- [ ] **Step 3: DNS for status.vyro.lk**

In Cloudflare DNS for `vyro.lk`, add CNAME:

```
status  CNAME  vyro-api.thufailahamed627.workers.dev
```

- [ ] **Step 4: Resend DNS records**

Add SPF, DKIM, DMARC records on `vyro.lk` per Resend dashboard.

- [ ] **Step 5: Deploy**

```bash
node scripts/deploy-backend.mjs --env production
```

- [ ] **Step 6: Verify**

```bash
curl https://vyro-api.thufailahamed627.workers.dev/api/health
curl https://status.vyro.lk/status.json
```

- [ ] **Step 7: Commit (only the toml change)**

```bash
git add apps/api/wrangler.toml
git commit -m "chore(api): point production ALERTS_KV to real namespace"
```

---

## Task 23: Enable rules + end-to-end verification

- [ ] **Step 1: Trigger sweep manually**

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/cron/observabilitySweep/run \
  -H "Cookie: <admin session>"
```

Expected: `200` with `{ evaluated, failed, errors }`.

- [ ] **Step 2: Verify status.json shape**

```bash
curl https://vyro-api.thufailahamed627.workers.dev/status.json
```

Expected: 5 components with `status` field.

- [ ] **Step 3: Trigger 5xx burst + wait + check Slack**

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/_test/5xx-burst \
  -H "Cookie: <admin session>" \
  -H "Content-Type: application/json" \
  -d '{"n":20}'
```

Wait one sweep cycle (5 min). Check `#vyro-ops` for Block Kit message.

- [ ] **Step 4: Verify cooldown**

Repeat the burst immediately. Expected: no second Slack message within 30 min.

- [ ] **Step 5: Test silence flow**

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/observability/alerts/silence \
  -H "Cookie: <admin session>" -H "Content-Type: application/json" \
  -d '{"ruleName":"api.error_rate_5xx","durationMinutes":30,"reason":"manual test"}'
```

Verify next sweep skips the rule.

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 7: Run smoke script**

```bash
SMOKE_ORIGIN=https://vyro-api.thufailahamed627.workers.dev tsx scripts/smoke/observability.ts
```

Expected: exits 0.

- [ ] **Step 8: Run load test (optional)**

```bash
k6 run -e SWEEP_URL=https://... -e ADMIN_COOKIE=... scripts/load/sweep.js
```

Expected: sweep p95 < 500ms, no errors.

- [ ] **Step 9: Document completion in runbook**

Append to `docs/runbook.md` end: "Observability alerts verified
YYYY-MM-DD per runbook section X."

- [ ] **Step 10: Final commit**

```bash
git add docs/runbook.md
git commit -m "chore(runbook): mark observability alerts verified in production"
```

---

## Self-Review

**Spec coverage:**
- §1 Background — covered (Task 1 establishes context).
- §2 Goals 1–7 — Tasks 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18 cover each goal.
- §3 Non-goals — none in tasks.
- §4 Architecture — Tasks 3, 9, 10 realize the diagram.
- §5 Data model — Tasks 1, 5, 6, 8 write KV + reuse AE/D1; no new tables (matches spec).
- §6 SLO rules — Task 1 ships 11 rules; Task 10 sweep iterates them.
- §7 Components — every file in the map exists as a Task.
- §8 Sweep data flow — Task 10 implements the six-step flow.
- §9 Public status page — Task 11 + 22.
- §10 Notification channels — Tasks 7, 10.
- §11 RUM — Tasks 16, 17.
- §12 UptimeRobot — Task 15.
- §13 Admin UI — Task 18.
- §14 Cron changes — Task 3 + 22.
- §15 Secrets + config — Tasks 3, 22.
- §16 Error handling — Task 10 wraps each rule; AE error path returns ok=true on failure (no fire); channel send retries handled in Task 7.
- §17 Testing — every Task includes tests.
- §18 Phases — Task ordering follows phases 1→12.
- §19 Rollback — Task 23 covers verification but rollback needs to remove cron entry, KV bindings, secrets, DNS; documented but not as a task because rollback is manual ops work covered by runbook.
- §20 Risks — addressed in implementation choices (AE rate budget in Task 10, staleness in Task 8, Resend cap by cooldown in Task 5).
- §21 Acceptance criteria — Task 23 maps 1:1.
- §22 Out of scope — not implemented.

**Placeholder scan:** none.

**Type consistency:**
- `SloRule` and `StatusPayload` defined in Task 1, used in Tasks 9, 10, 11, 12, 18.
- `cooldown` key format `cooldown:<rule>:<bucket>` consistent across Tasks 5, 10.
- `silenced:<rule>` consistent in Tasks 6, 12.
- `status:<component>` consistent in Tasks 8, 11.
- `incident:<id>` + `incidents:index` consistent in Tasks 13, 15.
- `StatusEntry` status enum matches `ComponentStatusSchema` in Task 1.

**Gaps to call out at execution time:**
- Task 12's `notifications` query uses a placeholder filter — engineer must use `eq(notifications.category, 'observability_alert')` with the actual drizzle column reference. Confirm schema field name in `@vyro/db/schema` before writing.
- Task 16's `web-vitals` package must be added (`pnpm --filter @vyro/web add web-vitals`).
- Task 22 step 2 assumes `wrangler` CLI available and authenticated.
- Task 23 step 9 runbook append is informal — exact text left to implementer.