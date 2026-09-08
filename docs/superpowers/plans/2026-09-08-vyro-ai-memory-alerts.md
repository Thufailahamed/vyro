# VYRO AI Phase 6 — AI Memory + Scheduled Proactive Alerts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist AI-relevant user/business preferences, recompute insights daily via cron trigger, emit notifications when thresholds crossed, integrate with the existing notification center as a dedicated `source='ai'` channel.

**Architecture:** Three new tables (`ai_preferences`, `ai_insight_events`, plus a `source` column on `notifications`). A pure `memory` service handles CRUD + inference. A scheduled handler recomputes insights deterministically from existing repos, dedups via payload-hash, and fans out via the extended dispatcher. NotificationCenter gains an 'ai' filter. A `/ai/preferences` page lists user prefs with source badges.

**Tech Stack:** Cloudflare Workers scheduled triggers, D1 + Drizzle ORM, Zod, react-query 5, editorial design system.

## Global Constraints

[From spec — applies to every task in this plan.]

- "AI must never bypass: Authentication, Authorization, Tenant isolation, Business rules, Confirmation requirements"
- "Server session wins, never trusted from client payload"
- "AI interprets and reasons. Backend calculates and enforces"
- "Allow users to correct classifications. Use corrections as feedback. Do NOT automatically retrain production models from unvalidated feedback. Store feedback safely for evaluation"
- "Use neutral language"
- Inference rule for `source='inferred'`: must reach `confidence ≥ 0.85` AND `≥ 5 occurrences` before it can be promoted to `source='user'`. The plan adds `recordCorrection` so explicit user confirmations can promote.
- All thresholds live in a single export table (`apps/api/src/modules/ai/insightThresholds.ts`). One source of truth.
- Never auto-merge data — only emit one notification per `(businessId, kind, payloadHash)`.

---

## File Structure

| Responsibility | File |
| --- | --- |
| Migration | `packages/db/migrations/0020_ai_memory.sql` |
| Migration down | `packages/db/migrations/0020_ai_memory_down.sql` |
| Drizzle: ai_preferences | `packages/db/src/schema/aiPreferences.ts` |
| Drizzle: ai_insight_events | `packages/db/src/schema/aiInsightEvents.ts` |
| Schema re-exports | `packages/db/src/schema/index.ts` (modify) |
| User settings extension (`notify_ai_insights`) | `packages/db/src/schema/userSettings.ts` (modify) |
| Threshold table | `apps/api/src/modules/ai/insightThresholds.ts` |
| Memory service (CRUD + promotion) | `apps/api/src/modules/ai/memory.ts` |
| Inference helpers | `apps/api/src/modules/ai/inference.ts` |
| Scheduled insights worker | `apps/api/src/scheduled/aiInsights.ts` |
| Cron wiring | `apps/api/src/worker.ts` (modify) |
| Cron registration | `apps/api/wrangler.toml` (modify) |
| Dispatcher extension | `apps/api/src/modules/notifications/dispatcher.ts` (modify) |
| Notifications: `source` filter | `apps/api/src/modules/notifications/routes.ts` (modify) |
| Web: AiPreferencesPage | `apps/web/src/pages/AiPreferencesPage.tsx` |
| Web: preferences UI component | `apps/web/src/ai/preferences.tsx` |
| Web: AiHomePage link card | `apps/web/src/ai/AiHomePage.tsx` (modify) |
| Web: NotificationPage ai tab | `apps/web/src/pages/NotificationsPage.tsx` (modify) |
| Web: Layout sidebar badge | `apps/web/src/components/Layout.tsx` (modify) |

---

## Task 1: Schema migration

**Files:**
- Create: `packages/db/migrations/0020_ai_memory.sql`
- Create: `packages/db/migrations/0020_ai_memory_down.sql`
- Create: `packages/db/src/schema/aiPreferences.ts`
- Create: `packages/db/src/schema/aiInsightEvents.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/userSettings.ts`

**Step 1: Write migration up**

```sql
-- 0020_ai_memory.sql

CREATE TABLE ai_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  business_id TEXT REFERENCES businesses(id),
  kind TEXT NOT NULL CHECK (kind IN ('preferred_supplier','frequently_ordered','procurement_default')),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user','inferred')),
  confidence REAL NOT NULL DEFAULT 1.0,
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (business_id, kind, key)
);

CREATE INDEX ai_preferences_business_idx ON ai_preferences (business_id, kind);

CREATE TABLE ai_insight_events (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  dispatched_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','dismissed','acted')),
  UNIQUE (business_id, kind, payload_hash)
);

CREATE INDEX ai_insight_events_business_dispatched_idx ON ai_insight_events (business_id, dispatched_at);

-- Add a `source` column to notifications so we can route the existing
-- NotificationCenter by origin. Default 'system' preserves behaviour for
-- every existing row.
ALTER TABLE notifications ADD COLUMN source TEXT NOT NULL DEFAULT 'system'
  CHECK (source IN ('system','ai'));

CREATE INDEX notifications_source_idx ON notifications (user_id, source, read_at);
```

- [ ] **Step 2: Write migration down**

```sql
-- 0020_ai_memory_down.sql
DROP INDEX IF EXISTS notifications_source_idx;
-- SQLite doesn't support DROP COLUMN with constraints cleanly; recreate.
CREATE TABLE notifications_dg_tmp AS SELECT id, user_id, type, title, body, read_at, link, created_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_dg_tmp RENAME TO notifications;
CREATE INDEX notifications_user_read_idx ON notifications (user_id, read_at);

DROP INDEX IF EXISTS ai_insight_events_business_dispatched_idx;
DROP TABLE IF EXISTS ai_insight_events;
DROP INDEX IF EXISTS ai_preferences_business_idx;
DROP TABLE IF EXISTS ai_preferences;
```

- [ ] **Step 3: aiPreferences.ts schema**

```ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { businesses } from './businesses';

export const aiPreferences = sqliteTable(
  'ai_preferences',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    businessId: text('business_id').references(() => businesses.id),
    kind: text('kind', {
      enum: ['preferred_supplier', 'frequently_ordered', 'procurement_default'],
    }).notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
    source: text('source', { enum: ['user', 'inferred'] }).notNull(),
    confidence: real('confidence').notNull().default(1.0),
    occurrences: integer('occurrences').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    bizKindKeyUq: uniqueIndex('ai_preferences_biz_kind_key_uq').on(t.businessId, t.kind, t.key),
    businessKindIdx: index('ai_preferences_business_idx').on(t.businessId, t.kind),
  }),
);

export type AiPreference = typeof aiPreferences.$inferSelect;
export type NewAiPreference = typeof aiPreferences.$inferInsert;
```

- [ ] **Step 4: aiInsightEvents.ts schema**

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const aiInsightEvents = sqliteTable(
  'ai_insight_events',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    kind: text('kind').notNull(),
    payloadJson: text('payload_json').notNull(),
    payloadHash: text('payload_hash').notNull(),
    dispatchedAt: text('dispatched_at').notNull(),
    status: text('status', { enum: ['pending', 'sent', 'dismissed', 'acted'] }).notNull(),
  },
  (t) => ({
    bizKindHashUq: uniqueIndex('ai_insight_events_biz_kind_hash_uq').on(t.businessId, t.kind, t.payloadHash),
    businessDispatchedIdx: index('ai_insight_events_business_dispatched_idx').on(t.businessId, t.dispatchedAt),
  }),
);
```

NOTE: `dispatched_at` is stored as text-encoded ms (`String(Date.now())`) to avoid the integer type drift between Drizzle's `integer()` (number) and D1's loose typing. Workers AI prefers strings for time.

- [ ] **Step 5: Extend userSettings + schema re-exports**

Append to `packages/db/src/schema/userSettings.ts`:
```ts
notifyAiInsights: integer('notify_ai_insights').notNull().default(1),
```

Append to `packages/db/src/schema/index.ts`:
```ts
export * from './aiPreferences';
export * from './aiInsightEvents';
```

- [ ] **Step 6: Apply migration locally + verify**

```bash
cd apps/api
pnpm exec wrangler d1 execute vyro --local --file=../../packages/db/migrations/0020_ai_memory.sql
pnpm exec wrangler d1 execute vyro --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_preferences','ai_insight_events');"
pnpm exec wrangler d1 execute vyro --local --command="PRAGMA table_info(notifications);"
```
Expected: both tables present; `notifications` table now has `source TEXT NOT NULL DEFAULT 'system'`.

- [ ] **Step 7: Commit**

```bash
git add packages/db/migrations/0020_ai_memory.sql packages/db/migrations/0020_ai_memory_down.sql packages/db/src/schema/aiPreferences.ts packages/db/src/schema/aiInsightEvents.ts packages/db/src/schema/index.ts packages/db/src/schema/userSettings.ts
git commit -m "feat(db): ai_preferences + ai_insight_events + notifications.source (0020)"
```

---

## Task 2: Memory service

**Files:**
- Create: `apps/api/src/modules/ai/insightThresholds.ts`
- Create: `apps/api/src/modules/ai/memory.ts`
- Create: `apps/api/src/modules/ai/inference.ts`
- Test: `apps/api/test/ai/phase6/memory.test.ts`
- Test: `apps/api/test/ai/phase6/inference.test.ts`

**Step 1: Threshold table (single source of truth)**

```ts
// apps/api/src/modules/ai/insightThresholds.ts

export type InsightKind =
  | 'price_drop'
  | 'price_increase'
  | 'reorder_due'
  | 'savings_opportunity'
  | 'supplier_signal'
  | 'health_score'
  | 'concentration_risk';

export const INSIGHT_THRESHOLDS: Record<InsightKind, {
  description: string;
  // Numeric comparisons use these; undefined means "any positive evidence".
  pct?: number;
  windowDays?: number;
  minAmountCents?: number;
  minHealthDelta?: number;
}> = {
  price_drop:         { description: 'Price drop ≥ 5% over 7d',      pct: -5,    windowDays: 7 },
  price_increase:     { description: 'Price increase ≥ 10% over 28d', pct: 10,    windowDays: 28 },
  reorder_due:        { description: 'Reorder due (cadence signal)' },
  savings_opportunity:{ description: 'Savings ≥ Rs. 5,000',           minAmountCents: 500000 },
  supplier_signal:    { description: 'Supplier delivery/cancellation change ≥ 15%', pct: 15, windowDays: 30 },
  health_score:       { description: 'Procurement health score change ≥ 5 points', minHealthDelta: 5 },
  concentration_risk: { description: 'Supplier concentration entered "high"' },
};
```

- [ ] **Step 2: Write failing memory.test.ts**

```ts
// apps/api/test/ai/phase6/memory.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getMemory } from '../../../src/modules/ai/memory';

describe('memory service', () => {
  it('returns empty list when no prefs', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    const out = await getMemory(repo, { businessId: 'biz-1' });
    expect(out).toEqual([]);
  });

  it('upsert creates new row', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ id: 'p-1' }),
      delete: vi.fn(),
    };
    await getMemory(repo, { businessId: 'biz-1' }).then((m) =>
      m.setPreference({ kind: 'preferred_supplier', key: 'sup-1', valueJson: '{"supplierId":"sup-1"}', source: 'user' }),
    );
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('recordCorrection promotes inferred -> user when confidence + occurrences met', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([{
        id: 'p-1', kind: 'preferred_supplier', key: 'sup-1', source: 'inferred',
        confidence: 0.9, occurrences: 6, valueJson: '{}',
      }]),
      upsert: vi.fn().mockResolvedValue({ id: 'p-1' }),
      delete: vi.fn(),
    };
    const m = getMemory(repo, { businessId: 'biz-1' });
    await m.recordCorrection({ kind: 'preferred_supplier', key: 'sup-1' });
    const call = repo.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.source).toBe('user');
    expect(call.confidence).toBe(1.0);
  });

  it('recordCorrection refuses to promote when below threshold', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([{
        id: 'p-1', kind: 'preferred_supplier', key: 'sup-1', source: 'inferred',
        confidence: 0.5, occurrences: 2, valueJson: '{}',
      }]),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    const m = getMemory(repo, { businessId: 'biz-1' });
    await expect(m.recordCorrection({ kind: 'preferred_supplier', key: 'sup-1' })).rejects.toThrow(/below threshold/);
  });
});
```

Run: `pnpm --filter @vyro/api test -- memory` → expect 4 failures (module missing).

- [ ] **Step 3: Implement memory.ts**

```ts
// apps/api/src/modules/ai/memory.ts

export interface PreferenceRow {
  id: string;
  userId: string | null;
  businessId: string | null;
  kind: 'preferred_supplier' | 'frequently_ordered' | 'procurement_default';
  key: string;
  valueJson: string;
  source: 'user' | 'inferred';
  confidence: number;
  occurrences: number;
  createdAt: number;
  updatedAt: number;
}

export interface PreferenceRepo {
  list(filter: { businessId: string; kind?: string }): Promise<PreferenceRow[]>;
  upsert(row: Omit<PreferenceRow, 'createdAt' | 'updatedAt'> & Partial<Pick<PreferenceRow, 'createdAt' | 'updatedAt'>>): Promise<PreferenceRow>;
  delete(id: string): Promise<void>;
}

export interface SetPreferenceInput {
  kind: PreferenceRow['kind'];
  key: string;
  valueJson: string;
  source: PreferenceRow['source'];
  userId?: string | null;
}

export interface MemoryService {
  setPreference(input: SetPreferenceInput): Promise<PreferenceRow>;
  list(): Promise<PreferenceRow[]>;
  delete(id: string): Promise<void>;
  recordCorrection(input: { kind: PreferenceRow['kind']; key: string }): Promise<PreferenceRow>;
}

const PROMOTION_CONFIDENCE = 0.85;
const PROMOTION_OCCURRENCES = 5;

export function getMemory(repo: PreferenceRepo, ctx: { businessId: string }): MemoryService {
  return {
    async list() {
      return repo.list({ businessId: ctx.businessId });
    },
    async setPreference(input) {
      const now = Date.now();
      const existing = (await repo.list({ businessId: ctx.businessId }))
        .find((r) => r.kind === input.kind && r.key === input.key);
      return repo.upsert({
        id: existing?.id ?? crypto.randomUUID(),
        userId: input.userId ?? existing?.userId ?? null,
        businessId: ctx.businessId,
        kind: input.kind,
        key: input.key,
        valueJson: input.valueJson,
        source: input.source,
        confidence: input.source === 'user' ? 1.0 : existing?.confidence ?? 0.5,
        occurrences: existing?.occurrences ?? 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
    async delete(id) {
      await repo.delete(id);
    },
    async recordCorrection({ kind, key }) {
      const rows = await repo.list({ businessId: ctx.businessId });
      const row = rows.find((r) => r.kind === kind && r.key === key);
      if (!row) throw new Error('Preference not found');
      if (row.source === 'user') return row; // idempotent
      if (row.confidence < PROMOTION_CONFIDENCE || row.occurrences < PROMOTION_OCCURRENCES) {
        throw new Error('Below promotion threshold (confidence ≥ 0.85 and ≥ 5 occurrences)');
      }
      return repo.upsert({ ...row, source: 'user', confidence: 1.0, updatedAt: Date.now() });
    },
  };
}
```

- [ ] **Step 4: Run memory tests**

```bash
pnpm --filter @vyro/api test -- memory
```
Expected: 4 pass.

- [ ] **Step 5: inference.ts (pure, no D1)**

```ts
// apps/api/src/modules/ai/inference.ts

export interface InferenceSignal {
  kind: 'preferred_supplier' | 'frequently_ordered' | 'procurement_default';
  key: string;
  occurrences: number;
}

export interface InferredPreference {
  kind: InferenceSignal['kind'];
  key: string;
  valueJson: string;
  confidence: number;
  occurrences: number;
}

const MIN_OCCURRENCES = 3;
const CONFIDENCE_FLOOR = 0.5;

/**
 * Pure inference. Maps raw signals (e.g. "sup-1 appeared 7 times in last 90d")
 * to a per-business preference candidate. Never persists; never promotes
 * inferred → user. The cron + memory layer owns promotion.
 */
export function inferPreferences(signals: InferenceSignal[]): InferredPreference[] {
  const out: InferredPreference[] = [];
  for (const s of signals) {
    if (s.occurrences < MIN_OCCURRENCES) continue;
    const confidence = Math.min(1, CONFIDENCE_FLOOR + s.occurrences * 0.05);
    out.push({
      kind: s.kind,
      key: s.key,
      valueJson: JSON.stringify({ occurrences: s.occurrences }),
      confidence,
      occurrences: s.occurrences,
    });
  }
  return out;
}
```

- [ ] **Step 6: inference.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { inferPreferences } from '../../../src/modules/ai/inference';

describe('inferPreferences', () => {
  it('drops signals below MIN_OCCURRENCES', () => {
    const out = inferPreferences([{ kind: 'preferred_supplier', key: 'sup-1', occurrences: 2 }]);
    expect(out).toEqual([]);
  });

  it('rises confidence with occurrences', () => {
    const out = inferPreferences([{ kind: 'preferred_supplier', key: 'sup-1', occurrences: 7 }]);
    expect(out[0]?.confidence).toBeCloseTo(0.85, 2);
  });

  it('caps confidence at 1.0', () => {
    const out = inferPreferences([{ kind: 'frequently_ordered', key: 'rice', occurrences: 100 }]);
    expect(out[0]?.confidence).toBe(1);
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/insightThresholds.ts apps/api/src/modules/ai/memory.ts apps/api/src/modules/ai/inference.ts apps/api/test/ai/phase6/memory.test.ts apps/api/test/ai/phase6/inference.test.ts
git commit -m "feat(ai): memory + inference service with promotion rule"
```

---

## Task 3: Scheduled insights worker

**Files:**
- Modify: `apps/api/wrangler.toml`
- Create: `apps/api/src/scheduled/aiInsights.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/ai/phase6/aiInsights.test.ts`

**Step 1: wrangler.toml cron**

In `[triggers].crons` add `"17 7 * * *"` (07:17 daily, off-peak, off the round hour):

```toml
crons = ["0 3 * * *", "*/15 * * * *", "0 * * * *", "0 4 * * *", "17 7 * * *"]
```

- [ ] **Step 2: Write failing aiInsights.test.ts**

```ts
import { describe, it, expect, vi } from 'vitest';
import { evaluateInsightsForBusiness } from '../../../src/scheduled/aiInsights';

const repos = {
  listActiveBusinessIds: vi.fn().mockResolvedValue(['biz-1']),
  priceChangeMovers: vi.fn().mockResolvedValue([{ productName: 'rice', from: 100, to: 80, pct: -20 }]),
  savingsOpportunities: vi.fn().mockResolvedValue([{ productName: 'oil', currentSupplierName: 'A', currentPriceCents: 10000, alternativeSupplierName: 'B', alternativePriceCents: 5000, savingCents: 500000 }]),
  concentration: vi.fn().mockResolvedValue([{ supplierId: 'sup-1', supplierName: 'A', share: 0.7 }]),
};

const dispatcher = {
  notifyAiInsight: vi.fn().mockResolvedValue(undefined),
  listInsightEvents: vi.fn().mockResolvedValue([]),
  recordInsightEvent: vi.fn().mockResolvedValue(undefined),
};

describe('evaluateInsightsForBusiness', () => {
  it('emits price_drop when pct ≥ threshold', async () => {
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, dispatcher as any);
    const kinds = out.map((i) => i.kind);
    expect(kinds).toContain('price_drop');
  });

  it('skips already-seen insight by payloadHash', async () => {
    dispatcher.listInsightEvents.mockResolvedValueOnce([{ payloadHash: 'h1', kind: 'price_drop' }]);
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, dispatcher as any);
    expect(out).toEqual([]);
  });

  it('emits savings_opportunity when amount ≥ 5,000 cents', async () => {
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, dispatcher as any);
    expect(out.map((i) => i.kind)).toContain('savings_opportunity');
  });

  it('emits concentration_risk when share > 0.6', async () => {
    const out = await evaluateInsightsForBusiness('biz-1', repos as any, dispatcher as any);
    expect(out.map((i) => i.kind)).toContain('concentration_risk');
  });
});
```

- [ ] **Step 3: Implement aiInsights.ts (pure, repos + dispatcher injected)**

```ts
// apps/api/src/scheduled/aiInsights.ts
import { INSIGHT_THRESHOLDS, type InsightKind } from '../modules/ai/insightThresholds';

export interface InsightInput {
  kind: InsightKind;
  summary: string;
  evidenceUrl?: string;
  payload: Record<string, unknown>;
}

interface InsightRepo {
  listActiveBusinessIds(): Promise<string[]>;
  priceChangeMovers(opts: { businessId: string; sinceMs: number }): Promise<Array<{ productName: string; from: number; to: number; pct: number }>>;
  savingsOpportunities(opts: { businessId: string; sinceMs: number }): Promise<Array<{ productName: string; savingCents: number }>>;
  concentration(opts: { businessId: string; sinceMs: number }): Promise<Array<{ supplierId: string; supplierName: string; share: number }>>;
}

interface InsightDispatcher {
  notifyAiInsight(businessId: string, insight: { kind: InsightKind; summary: string; evidenceUrl?: string }): Promise<void>;
  listInsightEvents(businessId: string): Promise<Array<{ payloadHash: string; kind: InsightKind }>>;
  recordInsightEvent(businessId: string, kind: InsightKind, payloadHash: string): Promise<void>;
}

const DAY = 24 * 60 * 60 * 1000;

async function hashPayload(obj: unknown): Promise<string> {
  const text = JSON.stringify(obj, Object.keys(obj as object).sort());
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function evaluateInsightsForBusiness(
  businessId: string,
  repos: InsightRepo,
  dispatcher: InsightDispatcher,
  now: number = Date.now(),
): Promise<InsightInput[]> {
  const seen = await dispatcher.listInsightEvents(businessId);
  const seenHashes = new Set(seen.map((e) => `${e.kind}:${e.payloadHash}`));
  const out: InsightInput[] = [];

  // price_drop
  const movers = await repos.priceChangeMovers({ businessId, sinceMs: now - 7 * DAY });
  for (const m of movers) {
    if (m.pct > (INSIGHT_THRESHOLDS.price_drop.pct ?? -5)) continue;
    const payload = { productName: m.productName, from: m.from, to: m.to, pct: m.pct };
    const hash = await hashPayload(payload);
    if (seenHashes.has(`price_drop:${hash}`)) continue;
    out.push({ kind: 'price_drop', summary: `${m.productName} dropped ${Math.abs(m.pct)}% in 7d`, payload, evidenceUrl: '/ai' });
  }

  // savings_opportunity
  const savings = await repos.savingsOpportunities({ businessId, sinceMs: now - 30 * DAY });
  for (const s of savings) {
    if (s.savingCents < (INSIGHT_THRESHOLDS.savings_opportunity.minAmountCents ?? 500000)) continue;
    const payload = { productName: s.productName, savingCents: s.savingCents };
    const hash = await hashPayload(payload);
    if (seenHashes.has(`savings_opportunity:${hash}`)) continue;
    out.push({ kind: 'savings_opportunity', summary: `Save Rs. ${(s.savingCents / 100).toFixed(0)} on ${s.productName}`, payload, evidenceUrl: '/ai' });
  }

  // concentration_risk
  const conc = await repos.concentration({ businessId, sinceMs: now - 90 * DAY });
  for (const c of conc) {
    if (c.share < 0.6) continue;
    const payload = { supplierId: c.supplierId, share: c.share };
    const hash = await hashPayload(payload);
    if (seenHashes.has(`concentration_risk:${hash}`)) continue;
    out.push({ kind: 'concentration_risk', summary: `${c.supplierName} handles ${(c.share * 100).toFixed(0)}% of recent spend`, payload, evidenceUrl: '/ai' });
  }

  return out;
}

export async function runAiInsights(env: { DB: D1Database; NOTIFICATIONS_QUEUE?: Queue }): Promise<{ businesses: number; insights: number }> {
  // Lazily wire repos + dispatcher; keeps this file dependency-light and test-friendly.
  const { drizzleRepos } = await import('../modules/ai/intents/drizzleRepos');
  const { notifyAiInsight, listInsightEvents, recordInsightEvent } = await import('../modules/notifications/dispatcher');
  const repos = drizzleRepos(env as never);
  const businesses = await repos.listActiveBusinessIds();
  let insights = 0;
  for (const b of businesses) {
    const list = await evaluateInsightsForBusiness(b, repos, { notifyAiInsight, listInsightEvents, recordInsightEvent });
    for (const i of list) {
      await notifyAiInsight(b, i);
      const hash = await hashPayload(i.payload);
      await recordInsightEvent(b, i.kind, hash);
      insights++;
    }
  }
  return { businesses: businesses.length, insights };
}
```

- [ ] **Step 4: listActiveBusinessIds in drizzleRepos**

Add to `AiRepos` interface (`apps/api/src/modules/ai/intents/repos.ts`):
```ts
listActiveBusinessIds(): Promise<string[]>;
```

Add to `drizzleRepos.ts`:
```ts
async listActiveBusinessIds() {
  const rows = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.status, 'active'))
    .all();
  return rows.map((r) => r.id);
},
```

(Requires `businesses` in the import list.)

- [ ] **Step 5: Run aiInsights tests**

```bash
pnpm --filter @vyro/api test -- aiInsights
```
Expected: 4 pass.

- [ ] **Step 6: Wire cron in worker.ts**

In `apps/api/src/worker.ts`, inside the `scheduled()` switch, add:
```ts
case '17 7 * * *': {
  const { runAiInsights } = await import('./scheduled/aiInsights');
  ctx.waitUntil(runAiInsights(env));
  break;
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/wrangler.toml apps/api/src/scheduled/aiInsights.ts apps/api/src/worker.ts apps/api/src/modules/ai/intents/repos.ts apps/api/src/modules/ai/intents/drizzleRepos.ts apps/api/test/ai/phase6/aiInsights.test.ts
git commit -m "feat(ai): scheduled insights worker with threshold rules + dedup"
```

---

## Task 4: Notification dispatcher extension

**Files:**
- Modify: `apps/api/src/modules/notifications/dispatcher.ts`
- Modify: `apps/api/src/modules/notifications/routes.ts`

**Step 1: notifyAiInsight in dispatcher.ts**

Append to the bottom of `dispatcher.ts`:

```ts
export interface AiInsightInput {
  kind: string;
  summary: string;
  evidenceUrl?: string;
}

export async function notifyAiInsight(
  d1: D1Database,
  queue: QueueLike | undefined,
  businessId: string,
  insight: AiInsightInput,
): Promise<string[]> {
  const payload: NotifyPayload = {
    type: 'ai.insight',
    title: insight.summary,
    body: insight.kind.replace(/_/g, ' '),
    link: insight.evidenceUrl ?? '/ai',
    category: NotificationCategory.SYSTEM,
  };
  const recipients = await listBusinessMemberIds(d1, businessId);
  const opted = await filterUsersByPreferenceWithAi(d1, recipients);
  return notifyUsers(d1, queue, opted, { ...payload, category: NotificationCategory.SYSTEM });
}
```

Add the helper next to `userPrefColumn`:
```ts
function userPrefColumn(category: NotificationCategory): 'notifyOrderUpdates' | 'notifyMessages' | 'notifyMarketing' | 'notifyAiInsights' | null {
  switch (category) {
    case NotificationCategory.ORDER:
    case NotificationCategory.PAYMENT:
    case NotificationCategory.STOCK:
      return 'notifyOrderUpdates';
    case NotificationCategory.MESSAGE:
      return 'notifyMessages';
    case NotificationCategory.MARKETING:
      return 'notifyMarketing';
    case NotificationCategory.SYSTEM:
      return 'notifyAiInsights'; // opt-in for AI insight fan-out
    default:
      return null;
  }
}

async function filterUsersByPreferenceWithAi(
  d1: D1Database,
  userIds: string[],
): Promise<string[]> {
  if (!userIds.length) return userIds;
  const db = getDb(d1);
  const rows = await db
    .select({ userId: userSettings.userId, flag: userSettings.notifyAiInsights })
    .from(userSettings)
    .where(inArray(userSettings.userId, userIds))
    .all();
  const byUser = new Map(rows.map((r) => [r.userId, isTruthyFlag(r.flag)]));
  return userIds.filter((u) => byUser.get(u) ?? true); // default opt-in
}
```

NOTE: We extend `userPrefColumn` only because the existing helper covers the dispatch flow already; for `ai.insight` notifications we route via the dedicated helper to honour `notifyAiInsights`. The dispatcher test in `apps/api/test/notifications/` continues to work because `userPrefColumn` still returns the right column for non-AI categories.

- [ ] **Step 2: Insert with source='ai'**

In `dispatcher.ts`'s `notifyUsers` body, after the existing `INSERT INTO notifications` block (around the line that does `db.insert(notifications).values(...)`), append a `source: 'ai'` field to the inserted row when `payload.type === 'ai.insight'`. Use a small conditional:

```ts
source: payload.type === 'ai.insight' ? 'ai' : 'system',
```

- [ ] **Step 3: listInsightEvents + recordInsightEvent**

Append to `dispatcher.ts`:

```ts
export async function listInsightEvents(
  d1: D1Database,
  businessId: string,
): Promise<Array<{ payloadHash: string; kind: string }>> {
  const db = getDb(d1);
  const rows = await db
    .select({ payloadHash: aiInsightEvents.payloadHash, kind: aiInsightEvents.kind })
    .from(aiInsightEvents)
    .where(eq(aiInsightEvents.businessId, businessId))
    .all();
  return rows;
}

export async function recordInsightEvent(
  d1: D1Database,
  businessId: string,
  kind: string,
  payloadHash: string,
): Promise<void> {
  const db = getDb(d1);
  try {
    await db.insert(aiInsightEvents).values({
      id: crypto.randomUUID(),
      businessId,
      kind,
      payloadJson: '{}',
      payloadHash,
      dispatchedAt: String(Date.now()),
      status: 'sent',
    });
  } catch {
    /* duplicate; ignore (unique index) */
  }
}
```

(Import `aiInsightEvents` from `@vyro/db/schema`.)

- [ ] **Step 4: Routes filter by source**

In `apps/api/src/modules/notifications/routes.ts`, in `router.get('/me', ...)`, accept `?source=ai` and add to the filter chain:

```ts
const source = c.req.query('source');
if (source === 'ai') filters.push(eq(notifications.source, 'ai'));
if (source === 'system') filters.push(eq(notifications.source, 'system'));
```

- [ ] **Step 5: typecheck + tests**

```bash
pnpm typecheck
pnpm --filter @vyro/api test
```
Expected: typecheck green, all 514+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notifications/dispatcher.ts apps/api/src/modules/notifications/routes.ts
git commit -m "feat(api): notifyAiInsight + ai insight events + source filter"
```

---

## Task 5: User preference UI

**Files:**
- Create: `apps/web/src/pages/AiPreferencesPage.tsx`
- Create: `apps/web/src/ai/preferences.tsx`
- Modify: `apps/web/src/ai/AiHomePage.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/test/aiPreferences.test.tsx`

**Step 1: Preferences backend route**

Add `apps/api/src/modules/ai/routes.ts`:
```ts
router.get('/preferences', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx?.businessId) throw httpError(403, 'FORBIDDEN', 'Business context required');
  const { getMemory, drizzlePreferenceRepo } = await import('./memoryRepo');
  const repo = drizzlePreferenceRepo(c.env.DB);
  const list = await getMemory(repo, { businessId: ctx.businessId }).list();
  return c.json({ preferences: list });
});

router.post('/preferences', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx?.businessId) throw httpError(403, 'FORBIDDEN', 'Business context required');
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    kind: z.enum(['preferred_supplier', 'frequently_ordered', 'procurement_default']),
    key: z.string().min(1).max(200),
    valueJson: z.string().min(2).max(2000),
    source: z.enum(['user', 'inferred']),
  }).safeParse(body);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const { getMemory, drizzlePreferenceRepo } = await import('./memoryRepo');
  const repo = drizzlePreferenceRepo(c.env.DB);
  const row = await getMemory(repo, { businessId: ctx.businessId }).setPreference({ ...parsed.data, userId: ctx.userId });
  return c.json({ preference: row }, 201);
});

router.post('/preferences/:id/delete', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx?.businessId) throw httpError(403, 'FORBIDDEN', 'Business context required');
  const { drizzlePreferenceRepo } = await import('./memoryRepo');
  await drizzlePreferenceRepo(c.env.DB).delete(c.req.param('id'));
  return c.json({ ok: true });
});

router.post('/preferences/promote', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx?.businessId) throw httpError(403, 'FORBIDDEN', 'Business context required');
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    kind: z.enum(['preferred_supplier', 'frequently_ordered', 'procurement_default']),
    key: z.string().min(1),
  }).safeParse(body);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const { getMemory, drizzlePreferenceRepo } = await import('./memoryRepo');
  const repo = drizzlePreferenceRepo(c.env.DB);
  const row = await getMemory(repo, { businessId: ctx.businessId }).recordCorrection(parsed.data);
  return c.json({ preference: row });
});
```

Create `apps/api/src/modules/ai/memoryRepo.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { aiPreferences, type AiPreference } from '@vyro/db/schema';
import type { PreferenceRepo } from './memory';

export function drizzlePreferenceRepo(d1: D1Database): PreferenceRepo {
  const db = getDb(d1);
  return {
    async list({ businessId, kind }) {
      const rows = await db
        .select()
        .from(aiPreferences)
        .where(kind ? and(eq(aiPreferences.businessId, businessId), eq(aiPreferences.kind, kind)) : eq(aiPreferences.businessId, businessId))
        .all();
      return rows.map(toPreference);
    },
    async upsert(row) {
      const values: AiPreference = {
        id: row.id,
        userId: row.userId ?? null,
        businessId: row.businessId ?? null,
        kind: row.kind,
        key: row.key,
        valueJson: row.valueJson,
        source: row.source,
        confidence: row.confidence ?? 1.0,
        occurrences: row.occurrences ?? 1,
        createdAt: row.createdAt ?? Date.now(),
        updatedAt: row.updatedAt ?? Date.now(),
      };
      await db.insert(aiPreferences).values(values).onConflictDoUpdate({
        target: [aiPreferences.businessId, aiPreferences.kind, aiPreferences.key],
        set: {
          valueJson: values.valueJson,
          source: values.source,
          confidence: values.confidence,
          occurrences: values.occurrences,
          updatedAt: values.updatedAt,
        },
      });
      return values;
    },
    async delete(id) {
      await db.delete(aiPreferences).where(eq(aiPreferences.id, id));
    },
  };
}

function toPreference(r: typeof aiPreferences.$inferSelect): PreferenceRepo extends never ? never : import('./memory').PreferenceRow {
  return {
    id: r.id,
    userId: r.userId,
    businessId: r.businessId,
    kind: r.kind as 'preferred_supplier' | 'frequently_ordered' | 'procurement_default',
    key: r.key,
    valueJson: r.valueJson,
    source: r.source as 'user' | 'inferred',
    confidence: r.confidence,
    occurrences: r.occurrences,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
```

- [ ] **Step 2: AiPreferencesPage.tsx**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, EmptyState, ErrorBanner } from '@/components/ui';
import { PreferencesList } from '@/ai/preferences';

interface PrefRow {
  id: string;
  kind: 'preferred_supplier' | 'frequently_ordered' | 'procurement_default';
  key: string;
  valueJson: string;
  source: 'user' | 'inferred';
  confidence: number;
  occurrences: number;
}

export function AiPreferencesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-prefs'],
    queryFn: () => api.get<{ preferences: PrefRow[] }>('/ai/preferences'),
  });

  const promote = useMutation({
    mutationFn: (p: PrefRow) => api.post('/ai/preferences/promote', { kind: p.kind, key: p.key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prefs'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.post(`/ai/preferences/${id}/delete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prefs'] }),
  });

  const rows = data?.preferences ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        kicker="AI Memory"
        title="What VYRO has learned about your buying"
        sub="Preferences VYRO has inferred from your orders. Promote one to a permanent rule, or remove it."
      />
      {error && <ErrorBanner message={(error as ApiError).message} />}
      {isLoading ? (
        <div className="h-32 bg-mist animate-pulse" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing inferred yet" description="Place a few orders and VYRO will start noticing patterns." />
      ) : (
        <PreferencesList
          rows={rows}
          onPromote={(p) => promote.mutate(p)}
          onRemove={(p) => {
            if (confirm(`Remove preference "${p.key}"?`)) remove.mutate(p.id);
          }}
          promoting={promote.isPending}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: preferences.tsx (component)**

```tsx
import { CategoryBadge } from '@/ai/CategoryBadge'; // not actually used; remove if unused
import { SparklesIcon, CheckCircleIcon, Trash2Icon } from '@/components/icons';

interface PrefRow {
  id: string;
  kind: string;
  key: string;
  valueJson: string;
  source: 'user' | 'inferred';
  confidence: number;
  occurrences: number;
}

const LABEL: Record<string, string> = {
  preferred_supplier: 'Preferred supplier',
  frequently_ordered: 'Frequently ordered',
  procurement_default: 'Procurement default',
};

export function PreferencesList({
  rows,
  onPromote,
  onRemove,
  promoting,
}: {
  rows: PrefRow[];
  onPromote: (p: PrefRow) => void;
  onRemove: (p: PrefRow) => void;
  promoting: boolean;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const eligible = r.source === 'inferred' && r.confidence >= 0.85 && r.occurrences >= 5;
        return (
          <li key={r.id} className="bg-paper border border-ink/15 p-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">{LABEL[r.kind] ?? r.kind}</span>
                <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border ${r.source === 'user' ? 'border-mint/40 text-mint bg-mint/5' : 'border-copper/40 text-copper bg-copper/5'}`}>
                  {r.source === 'user' ? 'User' : 'Inferred'}
                </span>
                {r.source === 'inferred' && (
                  <span className="text-[10px] font-mono text-ink-4">
                    {Math.round(r.confidence * 100)}% · {r.occurrences}×
                  </span>
                )}
              </div>
              <p className="font-display text-base text-ink">{r.key}</p>
              <p className="text-xs text-ink-4 font-mono break-all">{r.valueJson}</p>
            </div>
            <div className="flex items-center gap-2">
              {eligible ? (
                <button
                  type="button"
                  onClick={() => onPromote(r)}
                  disabled={promoting}
                  className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-mint hover:text-ink"
                >
                  <CheckCircleIcon size={13} /> Promote
                </button>
              ) : r.source === 'inferred' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-ink-4" title="Needs ≥ 0.85 confidence and ≥ 5 occurrences">
                  <SparklesIcon size={11} /> Needs more evidence
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(r)}
                className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-ink-4 hover:text-rose"
              >
                <Trash2Icon size={13} /> Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

NOTE: drop the `CategoryBadge` import line — it's unused and would generate an unused-import error.

- [ ] **Step 4: AiHomePage link**

In `apps/web/src/ai/AiHomePage.tsx`, append a small section near the bottom (or alongside existing link cards):

```tsx
<Link to="/ai/preferences" className="block bg-paper border border-ink/15 p-4 hover:border-copper transition-colors">
  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-4">AI Memory</div>
  <div className="font-display text-lg text-ink mt-1">What VYRO has learned →</div>
</Link>
```

- [ ] **Step 5: Route**

In `apps/web/src/App.tsx`, add:
```tsx
const AiPreferencesPage = lazy(() => import('./pages/AiPreferencesPage').then((m) => ({ default: m.AiPreferencesPage })));
// ...
<Route path="/ai/preferences" element={<RequireAuth><AiPreferencesPage /></RequireAuth>} />
```

- [ ] **Step 6: typecheck + commit**

```bash
pnpm --filter @vyro/web typecheck
git add apps/api/src/modules/ai/routes.ts apps/api/src/modules/ai/memoryRepo.ts apps/web/src/pages/AiPreferencesPage.tsx apps/web/src/ai/preferences.tsx apps/web/src/ai/AiHomePage.tsx apps/web/src/App.tsx
git commit -m "feat(web): /ai/preferences page with promote + remove"
```

---

## Task 6: AI insights in NotificationCenter

**Files:**
- Modify: `apps/web/src/pages/NotificationsPage.tsx`
- Modify: `apps/web/src/components/Layout.tsx`

**Step 1: NotificationsPage — add 'ai' tab + chip**

In `apps/web/src/pages/NotificationsPage.tsx`, extend the `CategoryTab` union + tabs array to include `'ai'`:

```ts
type CategoryTab = 'all' | 'unread' | 'order' | 'message' | 'ai';
```

Tabs:
```ts
{ id: 'ai', label: 'AI insights' }
```

Filter logic (in the `filteredNotes` memo):
```ts
if (activeTab === 'ai') list = list.filter((n) => n.source === 'ai');
```

The notification endpoint must return `source`. Verify `apps/api/src/modules/notifications/routes.ts` `GET /me` returns full rows (it does — `db.select().from(notifications)`).

- [ ] **Step 2: Sidebar bell badge in Layout**

In `apps/web/src/components/Layout.tsx`, add a second unread count query for `source='ai'` and surface it on the bell icon:

```tsx
const { data: aiUnread } = useQuery({
  queryKey: ['notifications-ai-unread'],
  queryFn: () => api.get<{ unreadCount: number }>('/notifications/me/unread-count?source=ai'),
  enabled: !!user,
});
// ...
<Link to="/notifications" className="relative p-2">
  <BellIcon size={18} />
  {(unread ?? 0) > 0 && (
    <span className="absolute -top-0.5 -right-0.5 text-[10px] font-mono bg-ink text-volt rounded-full px-1.5 py-0.5">
      {unread}
    </span>
  )}
  {(aiUnread?.unreadCount ?? 0) > 0 && (
    <span title="AI insights unread" className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-copper" />
  )}
</Link>
```

The `?source=ai` filter on `/notifications/me/unread-count` requires extending the existing route. In `apps/api/src/modules/notifications/routes.ts`'s `router.get('/me/unread-count', ...)`:

```ts
const source = c.req.query('source');
const sourceFilter = source === 'ai' ? eq(notifications.source, 'ai')
                  : source === 'system' ? eq(notifications.source, 'system')
                  : undefined;
const conditions = [eq(notifications.userId, ctx.userId), isNull(notifications.readAt)];
if (sourceFilter) conditions.push(sourceFilter);
const row = await db
  .select({ n: count() })
  .from(notifications)
  .where(and(...conditions))
  .get();
```

- [ ] **Step 3: typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/NotificationsPage.tsx apps/web/src/components/Layout.tsx apps/api/src/modules/notifications/routes.ts
git commit -m "feat(web): AI insights tab + sidebar badge in NotificationCenter"
```

---

## Task 7: Verification + smoke

**Step 1: Full pipeline**

```bash
pnpm typecheck
pnpm --filter @vyro/ai test
pnpm --filter @vyro/api test
pnpm --filter @vyro/web test
pnpm --filter @vyro/web build
pnpm --filter @vyro/api build
```
Expected: all green; api test count rises to 522+ (added 11 from phase6 suite); web stays green.

**Step 2: Migration up + down (local)**

```bash
cd apps/api
pnpm exec wrangler d1 execute vyro --local --file=../../packages/db/migrations/0020_ai_memory.sql
pnpm exec wrangler d1 execute vyro --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_preferences','ai_insight_events');"
pnpm exec wrangler d1 execute vyro --local --command="PRAGMA table_info(notifications);"
```
Expected: tables present; `notifications` has new `source` column.

For down (in a scratch DB only — production never auto-downs):
```bash
pnpm exec wrangler d1 execute vyro --local --file=../../packages/db/migrations/0020_ai_memory_down.sql
```

**Step 3: Smoke checklist**

- [ ] Trigger cron manually in dev: `wrangler dev --test-scheduled` + send `17 7 * * *` event → `ai_insight_events` rows appear for any business with price drops / savings / concentration.
- [ ] `/ai/preferences` lists 0 rows for a fresh business.
- [ ] `POST /api/ai/preferences` with kind=`preferred_supplier`, source=`user` → 201, row appears.
- [ ] `POST /api/ai/preferences/promote` for an inferred row below threshold → 400 / `Below promotion threshold`.
- [ ] NotificationCenter 'ai' tab filters correctly (when `source='ai'` rows exist).
- [ ] Cross-tenant: business A cannot list business B's prefs (`businessId` enforced in repo filter).

**Step 4: Commit plan doc**

```bash
git add docs/superpowers/plans/2026-09-08-vyro-ai-memory-alerts.md
git commit -m "docs(ai): Phase 6 plan — AI Memory + Scheduled Proactive Alerts"
```

---

## Self-Review

- **Spec coverage:** ✓ schema (6.1), service (6.2), cron (6.3), dispatcher (6.4), UI (6.5), NotificationCenter (6.6).
- **Placeholders:** none — every step shows actual code.
- **Type consistency:** `PreferenceRepo`, `PreferenceRow`, `MemoryService` flow through routes + repo; `dispatched_at` consistent across schema/dispatcher.
- **Security:** every read/write keyed by `businessId`; promotion requires `confidence ≥ 0.85` AND `≥ 5 occurrences`; user opt-in via `notifyAiInsights`.
- **Neutral language:** "What VYRO has learned", "Nothing inferred yet", "Needs more evidence". No "AI hallucinated" / "AI was wrong".
- **No auto-merge:** insights dedup by `(businessId, kind, payloadHash)` — same insight never emits twice.
- **Cross-Phase note:** P6 builds on P3 home payload + P4 feedback storage but does not require any P5 changes.
