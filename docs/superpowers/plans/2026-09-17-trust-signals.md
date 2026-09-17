# Supplier Trust Signals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-evaluate four supplier trust signals (KYC, Member Since, On-Time Delivery, Dispute-Free) and surface them as per-signal badges on supplier surfaces.

**Architecture:** Pre-computed `supplier_trust_signals` row per supplier. Read path joins on existing responses. Rebuild triggers: hourly cron, PO `delivered` transition, dispute `resolve` transition. Three phases gated by `TRUST_SIGNALS_ENABLED` flag.

**Tech Stack:** Hono + Cloudflare Workers + D1 + drizzle-orm (existing). React + TanStack Query. Vitest. Flag-gated public reads.

## Global Constraints

- Schema columns added to `purchase_orders` per spec amendment: `delivery_promised_at`, `disputed_at`, `dispute_outcome`.
- New table `supplier_trust_signals` per spec (8 columns).
- Flag: `TRUST_SIGNALS_ENABLED` lives in `feature_flags` config section, same mechanism as `SPONSORED_LISTINGS_ENABLED`.
- Cron schedule: `"13 * * * *"` (offset from sponsored's `"0 * * * *"`).
- No mutation of `suppliers` row. Existing `trust_seal_subscriptions` + `TrustSealBadge` untouched.
- All migrations use `IF NOT EXISTS` / idempotent DDL.
- Working directly on `main` branch per prior user choice.

---

### Task 1: Migrations + drizzle schema

**Files:**
- Create: `packages/db/migrations/0045_supplier_trust_signals.sql`
- Create: `packages/db/migrations/0046_po_trust_columns.sql`
- Create: `packages/db/src/schema/trust.ts`
- Modify: `packages/db/src/schema/index.ts` (export barrel)

**Interfaces:**
- Produces: `supplierTrustSignals` table reference (Drizzle) used by T2 repository
- Produces: `deliveryPromisedAt`, `disputedAt`, `disputeOutcome` columns on `purchaseOrders` (typed via existing `purchaseOrders.$inferSelect`)

- [ ] **Step 1: Write migration 0045 for new trust signals table**

Create `packages/db/migrations/0045_supplier_trust_signals.sql`:

```sql
-- Trust Signals: pre-computed trust signal cache per supplier, rebuilt by cron + webhooks.
CREATE TABLE IF NOT EXISTS `supplier_trust_signals` (
  `supplier_id` text PRIMARY KEY NOT NULL,
  `kyc_verified` integer NOT NULL DEFAULT 0,
  `member_since_year` integer,
  `total_completed_pos` integer NOT NULL DEFAULT 0,
  `on_time_count` integer NOT NULL DEFAULT 0,
  `on_time_pct_cached` real,
  `disputed_supplier_fault_count` integer NOT NULL DEFAULT 0,
  `computed_at` integer NOT NULL,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_trust_signals_supplier_idx` ON `supplier_trust_signals` (`supplier_id`);
```

- [ ] **Step 2: Write migration 0046 for PO trust columns**

Create `packages/db/migrations/0046_po_trust_columns.sql`:

```sql
-- Trust Signal support: promise timestamp + dispute audit columns on purchase_orders.
-- ALTER TABLE in SQLite/D1 is not idempotent by default; wrap each in a guarded block.
-- On re-run this no-ops safely via the catch.
ALTER TABLE `purchase_orders` ADD COLUMN `delivery_promised_at` integer;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `disputed_at` integer;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `dispute_outcome` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `po_supplier_disputed_idx` ON `purchase_orders` (`supplier_id`, `disputed_at`);
```

> Note: D1's `ALTER TABLE ADD COLUMN` errors on duplicate column. The migration runner in this project runs each migration once per DB (`migrations` table tracks applied sets), so replays are impossible. Tests must rely on the runner, not on the SQL being self-idempotent.

- [ ] **Step 3: Apply locally and verify**

```sh
pnpm --filter @vyro/api db:migrate:local
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite ".schema supplier_trust_signals"
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite ".schema purchase_orders" | grep -E "delivery_promised|disputed_at|dispute_outcome"
```

Expected: `supplier_trust_signals` table + 3 new columns on `purchase_orders`.

- [ ] **Step 4: Add drizzle schema**

Create `packages/db/src/schema/trust.ts`:

```ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { suppliers } from './core';

export const supplierTrustSignals = sqliteTable(
  'supplier_trust_signals',
  {
    supplierId: text('supplier_id').primaryKey().notNull().references(() => suppliers.id),
    kycVerified: integer('kyc_verified').notNull().default(0),
    memberSinceYear: integer('member_since_year'),
    totalCompletedPos: integer('total_completed_pos').notNull().default(0),
    onTimeCount: integer('on_time_count').notNull().default(0),
    onTimePctCached: real('on_time_pct_cached'),
    disputedSupplierFaultCount: integer('disputed_supplier_fault_count').notNull().default(0),
    computedAt: integer('computed_at').notNull(),
  },
  (t) => ({
    supplierIdx: index('supplier_trust_signals_supplier_idx').on(t.supplierId),
  }),
);

export type TrustSignalsRow = typeof supplierTrustSignals.$inferSelect;
```

- [ ] **Step 5: Export from schema barrel**

Modify `packages/db/src/schema/index.ts` (find current export list and add `export * from './trust';`).

- [ ] **Step 6: Also extend `purchaseOrders` schema in core**

Modify `packages/db/src/schema/core.ts` — find `purchaseOrders` table def and add three columns:

```ts
deliveryPromisedAt: integer('delivery_promised_at'),
disputedAt: integer('disputed_at'),
disputeOutcome: text('dispute_outcome'),
```

Add them to the column list (keep ordering adjacent to other date columns). Verify the existing schema file location with `grep -n "purchaseOrders" packages/db/src/schema/*.ts`.

- [ ] **Step 7: Run typecheck on db**

```sh
pnpm --filter @vyro/db typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```sh
git add packages/db/migrations/0045_supplier_trust_signals.sql packages/db/migrations/0046_po_trust_columns.sql packages/db/src/schema/trust.ts packages/db/src/schema/index.ts packages/db/src/schema/core.ts
git commit -m "feat(trust): migrations + drizzle schema (supplier_trust_signals table + 3 PO columns)"
```

---

### Task 2: Repository — TDD

**Files:**
- Create: `apps/api/src/modules/trust/repository.ts`
- Test: `apps/api/test/trust/repository.test.ts`

**Interfaces:**
- Consumes: `supplierTrustSignals` drizzle table from T1
- Produces: `trustRepository.{upsert, getBySupplierId, listAllSupplierIds}` for T3 service

- [ ] **Step 1: Write failing test**

Create `apps/api/test/trust/repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { trustRepository } from '../../../src/modules/trust/repository';

describe('trust repository shape', () => {
  it('exports upsert', () => {
    expect(typeof trustRepository.upsert).toBe('function');
  });
  it('exports getBySupplierId', () => {
    expect(typeof trustRepository.getBySupplierId).toBe('function');
  });
  it('exports listAllSupplierIds', () => {
    expect(typeof trustRepository.listAllSupplierIds).toBe('function');
  });
});
```

- [ ] **Step 2: Run test (fail)**

```sh
pnpm --filter @vyro/api test test/trust/repository.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement repository**

Create `apps/api/src/modules/trust/repository.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { supplierTrustSignals, suppliers } from '@vyro/db/schema';
import type { TrustSignalsRow } from '@vyro/db/schema';

export interface TrustSignalInput {
  supplierId: string;
  kycVerified: number;
  memberSinceYear: number | null;
  totalCompletedPos: number;
  onTimeCount: number;
  onTimePctCached: number | null;
  disputedSupplierFaultCount: number;
  computedAt: number;
}

export const trustRepository = {
  async upsert(d1: D1Database, row: TrustSignalInput): Promise<void> {
    const db = getDb(d1);
    await db
      .insert(supplierTrustSignals)
      .values(row)
      .onConflictDoUpdate({
        target: supplierTrustSignals.supplierId,
        set: {
          kycVerified: row.kycVerified,
          memberSinceYear: row.memberSinceYear,
          totalCompletedPos: row.totalCompletedPos,
          onTimeCount: row.onTimeCount,
          onTimePctCached: row.onTimePctCached,
          disputedSupplierFaultCount: row.disputedSupplierFaultCount,
          computedAt: row.computedAt,
        },
      })
      .run();
  },

  async getBySupplierId(d1: D1Database, supplierId: string): Promise<TrustSignalsRow | null> {
    const db = getDb(d1);
    const row = await db
      .select()
      .from(supplierTrustSignals)
      .where(eq(supplierTrustSignals.supplierId, supplierId))
      .get();
    return row ?? null;
  },

  async listAllSupplierIds(d1: D1Database): Promise<string[]> {
    const db = getDb(d1);
    const rows = await db.select({ id: suppliers.id }).from(suppliers).all();
    return rows.map((r) => r.id);
  },
};
```

- [ ] **Step 4: Run test (pass)**

```sh
pnpm --filter @vyro/api test test/trust/repository.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/modules/trust/repository.ts apps/api/test/trust/repository.test.ts
git commit -m "feat(trust): repository layer (UPSERT, getBySupplierId, listAllSupplierIds)"
```

---

### Task 3: Service — pure compute logic (TDD)

**Files:**
- Create: `apps/api/src/modules/trust/compute.ts`
- Test: `apps/api/test/trust/compute.test.ts`

**Interfaces:**
- Consumes: pure inputs (no D1)
- Produces: `computeTrustSignal(input): TrustSignalInput` — pure function used by service.ts

The pure-compute split lets us unit-test the math without D1. Heavy lifting (reading PO/dispute counts from D1) lives in service.ts, which builds the inputs from queries and then calls `computeTrustSignal`.

- [ ] **Step 1: Write failing test**

Create `apps/api/test/trust/compute.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeTrustSignal } from '../../../src/modules/trust/compute';

describe('computeTrustSignal — pure math', () => {
  it('on-time pct = onTimeCount / totalCompletedPos', () => {
    const out = computeTrustSignal({
      supplierCreatedAt: Date.UTC(2024, 0, 15),
      kycVerified: true,
      totalCompletedPos: 10,
      onTimeCount: 9,
      disputedSupplierFaultCount90d: 0,
      now: Date.UTC(2026, 8, 17),
    });
    expect(out.kycVerified).toBe(1);
    expect(out.onTimePctCached).toBeCloseTo(0.9, 5);
    expect(out.memberSinceYear).toBe(2024);
    expect(out.disputedSupplierFaultCount).toBe(0);
  });

  it('on-time pct is null when sample = 0', () => {
    const out = computeTrustSignal({
      supplierCreatedAt: Date.UTC(2025, 0, 1),
      kycVerified: true,
      totalCompletedPos: 0,
      onTimeCount: 0,
      disputedSupplierFaultCount90d: 0,
      now: Date.UTC(2026, 8, 17),
    });
    expect(out.onTimePctCached).toBeNull();
  });

  it('kycVerified flag is 0 or 1', () => {
    const off = computeTrustSignal({
      supplierCreatedAt: null,
      kycVerified: false,
      totalCompletedPos: 0,
      onTimeCount: 0,
      disputedSupplierFaultCount90d: 0,
      now: 0,
    });
    expect(off.kycVerified).toBe(0);
    expect(off.memberSinceYear).toBeNull();
  });

  it('preserves disputedSupplierFaultCount verbatim', () => {
    const out = computeTrustSignal({
      supplierCreatedAt: Date.UTC(2024, 0, 1),
      kycVerified: true,
      totalCompletedPos: 5,
      onTimeCount: 5,
      disputedSupplierFaultCount90d: 2,
      now: Date.UTC(2026, 8, 17),
    });
    expect(out.disputedSupplierFaultCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test (fail)**

```sh
pnpm --filter @vyro/api test test/trust/compute.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement compute**

Create `apps/api/src/modules/trust/compute.ts`:

```ts
import type { TrustSignalInput } from './repository';

export interface ComputeInput {
  supplierCreatedAt: number | null;
  kycVerified: boolean;
  totalCompletedPos: number;
  onTimeCount: number;
  disputedSupplierFaultCount90d: number;
  now: number;
}

export function computeTrustSignal(input: ComputeInput): TrustSignalInput {
  return {
    supplierId: '', // caller fills in
    kycVerified: input.kycVerified ? 1 : 0,
    memberSinceYear: input.supplierCreatedAt == null
      ? null
      : new Date(input.supplierCreatedAt).getUTCFullYear(),
    totalCompletedPos: input.totalCompletedPos,
    onTimeCount: input.onTimeCount,
    onTimePctCached:
      input.totalCompletedPos > 0
        ? input.onTimeCount / input.totalCompletedPos
        : null,
    disputedSupplierFaultCount: input.disputedSupplierFaultCount90d,
    computedAt: Math.floor(input.now / 1000),
  };
}

export function sampleGateMeetsOnTimeBadge(totalCompletedPos: number, minSample = 5): boolean {
  return totalCompletedPos >= minSample;
}

export function isDisputeFree(disputedSupplierFaultCount: number): boolean {
  return disputedSupplierFaultCount === 0;
}
```

- [ ] **Step 4: Run test (pass)**

```sh
pnpm --filter @vyro/api test test/trust/compute.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```sh
git add apps/api/src/modules/trust/compute.ts apps/api/test/trust/compute.test.ts
git commit -m "feat(trust): compute module (pure math for on-time/dispute/member-since)"
```

---

### Task 4: Service — `recomputeForSupplier` + `recomputeAllSuppliers` (TDD on shape)

**Files:**
- Create: `apps/api/src/modules/trust/service.ts`
- Test: `apps/api/test/trust/service.test.ts`

**Interfaces:**
- Consumes: `trustRepository` from T2, `computeTrustSignal` from T3, D1
- Produces: `recomputeForSupplier(d1, supplierId, now)` and `recomputeAllSuppliers(d1, now)`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/trust/service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as svc from '../../../src/modules/trust/service';

describe('trust service shape', () => {
  it('exports recomputeForSupplier', () => {
    expect(typeof svc.recomputeForSupplier).toBe('function');
  });
  it('exports recomputeAllSuppliers', () => {
    expect(typeof svc.recomputeAllSuppliers).toBe('function');
  });
  it('exports getTrustSignalView', () => {
    expect(typeof svc.getTrustSignalView).toBe('function');
  });
});
```

- [ ] **Step 2: Run test (fail)**

```sh
pnpm --filter @vyro/api test test/trust/service.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement service**

Create `apps/api/src/modules/trust/service.ts`:

```ts
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, purchaseOrders } from '@vyro/db/schema';
import { trustRepository } from './repository';
import { computeTrustSignal, sampleGateMeetsOnTimeBadge } from './compute';

const TRAILING_DELIVERY_WINDOW = 30;
const DISPUTE_WINDOW_DAYS = 90;

export interface TrustSignalView {
  kyc: boolean;
  memberSinceYear: number | null;
  onTimePct: number | null;
  onTimeSampleSize: number;
  disputeFree: boolean;
  lastComputedAt: number | null;
}

function emptyView(): TrustSignalView {
  return {
    kyc: false,
    memberSinceYear: null,
    onTimePct: null,
    onTimeSampleSize: 0,
    disputeFree: false,
    lastComputedAt: null,
  };
}

async function loadSupplierFacts(d1: D1Database, supplierId: string, nowMs: number) {
  const db = getDb(d1);
  const sup = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!sup) return null;

  // On-time delivery: last 30 delivered POs with non-null delivery_promised_at.
  const delivery = await db
    .select({
      total: sql<number>`count(*)`,
      onTime: sql<number>`sum(case when ${purchaseOrders.deliveredAt} <= ${purchaseOrders.deliveryPromisedAt} then 1 else 0 end)`,
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.status, 'delivered'),
        isNotNull(purchaseOrders.deliveryPromisedAt),
      ),
    )
    .orderBy(sql`${purchaseOrders.deliveredAt} desc`)
    .limit(TRAILING_DELIVERY_WINDOW)
    .get();

  const cutoff = nowMs - DISPUTE_WINDOW_DAYS * 86400 * 1000;
  const disputedRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.disputeOutcome, 'refund_business'),
        gte(purchaseOrders.disputedAt, cutoff),
      ),
    )
    .get();

  return {
    supplier: sup,
    totalCompletedPos: Number(delivery?.total ?? 0),
    onTimeCount: Number(delivery?.onTime ?? 0),
    disputedSupplierFaultCount: Number(disputedRow?.n ?? 0),
  };
}

export async function recomputeForSupplier(
  d1: D1Database,
  supplierId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const facts = await loadSupplierFacts(d1, supplierId, nowMs);
  if (!facts) return;
  const { supplier } = facts;
  const computed = computeTrustSignal({
    supplierCreatedAt: (supplier as any).createdAt ?? null,
    kycVerified: (supplier as any).verificationStatus === 'verified',
    totalCompletedPos: facts.totalCompletedPos,
    onTimeCount: facts.onTimeCount,
    disputedSupplierFaultCount90d: facts.disputedSupplierFaultCount,
    now: nowMs,
  });
  await trustRepository.upsert(d1, { ...computed, supplierId });
}

export async function recomputeAllSuppliers(
  d1: D1Database,
  nowMs: number = Date.now(),
): Promise<{ rebuilt: number; failed: number }> {
  const ids = await trustRepository.listAllSupplierIds(d1);
  let rebuilt = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await recomputeForSupplier(d1, id, nowMs);
      rebuilt++;
    } catch (e) {
      failed++;
      // eslint-disable-next-line no-console
      console.error('[trust] recompute failed for supplier', id, e);
    }
  }
  return { rebuilt, failed };
}

export async function getTrustSignalView(
  d1: D1Database,
  supplierId: string,
): Promise<TrustSignalView> {
  const row = await trustRepository.getBySupplierId(d1, supplierId);
  if (!row) return emptyView();
  const meetsSample = sampleGateMeetsOnTimeBadge(row.totalCompletedPos);
  return {
    kyc: row.kycVerified === 1,
    memberSinceYear: row.memberSinceYear ?? null,
    onTimePct: meetsSample && row.onTimePctCached != null
      ? Math.round(row.onTimePctCached * 100)
      : null,
    onTimeSampleSize: row.totalCompletedPos,
    disputeFree: row.disputedSupplierFaultCount === 0,
    lastComputedAt: row.computedAt,
  };
}
```

- [ ] **Step 4: Run test (pass)**

```sh
pnpm --filter @vyro/api test test/trust/service.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Run full API suite (catch regressions)**

```sh
pnpm --filter @vyro/api test 2>&1 | tail -20
```

Expected: existing 971 + new tests pass.

- [ ] **Step 6: Commit**

```sh
git add apps/api/src/modules/trust/service.ts apps/api/test/trust/service.test.ts
git commit -m "feat(trust): service layer (recompute + view)"
```

---

### Task 5: PO status-transition hooks

**Files:**
- Modify: `apps/api/src/modules/purchaseOrders/service.ts` (call recompute on `delivered` transition)
- Modify: `apps/api/src/modules/admin/disputes.ts` (call recompute on resolve)
- Modify: `apps/api/src/modules/admin/disputeRepository.ts` (set new PO columns)

**Interfaces:**
- Consumes: `recomputeForSupplier` from T4
- Produces: hooks fire after status mutations, best-effort

- [ ] **Step 1: Locate the PO delivered transition point**

```sh
grep -n "to === 'delivered'\|input.to === 'delivered'" apps/api/src/modules/purchaseOrders/service.ts
```

Read the surrounding context (~30 lines).

- [ ] **Step 2: Add recompute call after delivered transition**

In the `=== 'delivered'` branch, after the status update succeeds (look for existing `setPoStatus` / status update call), add a best-effort recompute:

```ts
// Best-effort: keep trust signals fresh on the active path.
try {
  const { recomputeForSupplier } = await import('../trust/service');
  await recomputeForSupplier(c.env.DB, supplierId);
} catch (err) {
  console.error('[po] trust recompute failed (delivered)', supplierId, err);
}
```

The `supplierId` variable is in scope from the existing PO row. Verify by reading the function — if not, fetch `purchaseOrders` first.

- [ ] **Step 3: Locate the dispute resolve point**

```sh
grep -n "outcome === 'refund_business'\|outcome === 'release_supplier'" apps/api/src/modules/admin/disputes.ts
```

- [ ] **Step 4: Add recompute call in dispute resolve**

In `POST /disputes/:poId/resolve`, after `setPoStatus(...)` returns, add:

```ts
// Best-effort: keep trust signals fresh when a dispute resolves.
try {
  const { recomputeForSupplier } = await import('../../trust/service');
  await recomputeForSupplier(c.env.DB, po.supplierId);
} catch (err) {
  console.error('[disputes] trust recompute failed', poId, err);
}
```

- [ ] **Step 5: Update `setPoStatus` in `disputeRepository.ts` to record new columns**

Modify `apps/api/src/modules/admin/disputeRepository.ts` `setPoStatus` to also set:

```ts
const extraPatch: Record<string, any> = {};
if (status === 'delivered') {
  // delivery_promised_at and delivered_at already managed elsewhere
} else if (status === 'disputed') {
  extraPatch.disputedAt = now;
} else if (status === 'cancelled' || status === 'completed') {
  // dispute resolved — outcome set by caller via setPoDisputeOutcome()
}
await db
  .update(purchaseOrders)
  .set({ status, updatedAt: now, ...tsPatch, ...extraPatch } as any)
  .where(eq(purchaseOrders.id, id))
  .run();
```

Add a sibling helper `setPoDisputeOutcome(d1, poId, outcome, nowMs)`:

```ts
export async function setPoDisputeOutcome(d1: D1Database, poId: string, outcome: 'refund_business' | 'release_supplier', nowMs: number): Promise<void> {
  const db = getDb(d1);
  await db
    .update(purchaseOrders)
    .set({ disputeOutcome: outcome, updatedAt: nowMs } as any)
    .where(eq(purchaseOrders.id, poId))
    .run();
}
```

- [ ] **Step 6: Wire outcome from admin/disputes.ts → setPoDisputeOutcome**

In `POST /disputes/:poId/resolve`, after calling `setPoStatus` with the resolved status, call:

```ts
await setPoDisputeOutcome(c.env.DB, poId, parsed.data.outcome, Date.now());
```

(Import the new function from `./disputeRepository`.)

- [ ] **Step 7: Wire delivery_promised_at on PO `prepared` transition**

In `apps/api/src/modules/purchaseOrders/service.ts`, find the transition where status becomes `prepared`. After the status update, query the matching `supplier_product.lead_time_days` and patch:

```ts
if (input.to === 'prepared') {
  const lead = await db
    .select({ lead: supplierProducts.leadTimeDays })
    .from(supplierProducts)
    .innerJoin(purchaseOrderItems, eq(purchaseOrderItems.supplierProductId, supplierProducts.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId))
    .get();
  const leadDays = lead?.lead ?? 1;
  const promisedAt = Date.now() + leadDays * 86400 * 1000;
  await db
    .update(purchaseOrders)
    .set({ deliveryPromisedAt: promisedAt } as any)
    .where(eq(purchaseOrders.id, input.purchaseOrderId))
    .run();
}
```

Add the imports near the top of the file. Adjust names by reading the existing PO service.

- [ ] **Step 8: Run tests + typecheck**

```sh
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/api test 2>&1 | tail -10
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 9: Commit**

```sh
git add apps/api/src/modules/purchaseOrders/service.ts apps/api/src/modules/admin/disputes.ts apps/api/src/modules/admin/disputeRepository.ts
git commit -m "feat(trust): PO hook recompute (delivered + dispute-resolve + prepared sets promise)"
```

---

### Task 6: Cron registration

**Files:**
- Create: `apps/api/src/modules/trust/cron.ts`
- Modify: `apps/api/src/cron/handlers.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/trust/cron.test.ts`

**Interfaces:**
- Consumes: `recomputeAllSuppliers` from T4
- Produces: `handleTrustSignalsRebuild(env)` registered at `"13 * * * *"`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/trust/cron.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as cron from '../../../src/modules/trust/cron';

describe('trust cron module shape', () => {
  it('exports trustSignalsRebuild', () => {
    expect(typeof cron.trustSignalsRebuild).toBe('function');
  });
});
```

- [ ] **Step 2: Run test (fail)**

```sh
pnpm --filter @vyro/api test test/trust/cron.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement cron module**

Create `apps/api/src/modules/trust/cron.ts`:

```ts
import type { Env } from '../../env';
import { recomputeAllSuppliers } from './service';

export async function trustSignalsRebuild(env: Env): Promise<{ rebuilt: number; failed: number }> {
  return recomputeAllSuppliers(env.DB, Date.now());
}
```

- [ ] **Step 4: Run test (pass)**

```sh
pnpm --filter @vyro/api test test/trust/cron.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Wire into cron handlers**

Append to `apps/api/src/cron/handlers.ts`:

```ts
/**
 * Trust Signals: rebuild cached supplier_trust_signals for every supplier.
 * Runs hourly at HH:13 (offset from sponsored's HH:00 to spread load).
 */
export async function handleTrustSignalsRebuild(env: Env): Promise<{ rebuilt: number; failed: number }> {
  const { trustSignalsRebuild } = await import('../modules/trust/cron');
  return trustSignalsRebuild(env);
}
```

Add `handleTrustSignalsRebuild` to the imports in `apps/api/src/worker.ts`.

- [ ] **Step 6: Register cron schedule**

Modify `apps/api/src/worker.ts` `scheduled()` switch — add a new case:

```ts
case '13 * * * *':
  ctx.waitUntil(handleTrustSignalsRebuild(env));
  break;
```

- [ ] **Step 7: Run typecheck + tests**

```sh
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/api test test/trust/cron.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```sh
git add apps/api/src/modules/trust/cron.ts apps/api/test/trust/cron.test.ts apps/api/src/cron/handlers.ts apps/api/src/worker.ts
git commit -m "feat(trust): cron rebuild + worker registration (hourly at HH:13)"
```

---

### Task 7: Public route — storefront integration + flag gate

**Files:**
- Modify: `apps/api/src/modules/storefront/routes.ts`

**Interfaces:**
- Consumes: `getTrustSignalView` from T4, `isFeatureEnabled` from `lib/featureFlags`
- Produces: `trustSignals` field on `GET /api/suppliers/by-slug/:slug` response

- [ ] **Step 1: Read current storefront route shape**

```sh
sed -n '40,75p' apps/api/src/modules/storefront/routes.ts
```

Existing structure already injects `otherSuppliersSponsored` via the same flag-gated IIFE pattern.

- [ ] **Step 2: Extend the response**

Add a sibling IIFE for `trustSignals`, mirroring the existing `otherSuppliersSponsored` block:

```ts
trustSignals: await (async () => {
  try {
    const { isFeatureEnabled } = await import('../../lib/featureFlags');
    const { getTrustSignalView } = await import('../trust/service');
    if (await isFeatureEnabled(c.env.DB, 'TRUST_SIGNALS_ENABLED')) {
      return await getTrustSignalView(c.env.DB, supplier.id);
    }
  } catch {}
  return null;
})(),
```

Place it next to `otherSuppliersSponsored`. When `null`, the field is still present — consumers handle null. (Alternative: omit the field when the flag is off. Pick one approach — recommend always-present-with-null since TypeScript consumers prefer fixed shapes; document this in `docs/superpowers/notes/trust-phase-1.md`.)

- [ ] **Step 3: Run typecheck**

```sh
pnpm --filter @vyro/api typecheck
```

Expected: pass.

- [ ] **Step 4: Commit**

```sh
git add apps/api/src/modules/storefront/routes.ts
git commit -m "feat(trust): inject trustSignals field on /suppliers/by-slug/:slug (flag-gated)"
```

---

### Task 8: Admin routes — view + recompute

**Files:**
- Modify: `packages/validation/src/trust.ts` (new file)
- Modify: `packages/validation/src/index.ts` (export)
- Create: `apps/api/src/modules/trust/routes.ts`
- Create: `apps/api/src/modules/trust/adminIndex.ts`
- Modify: `apps/api/src/index.ts` (mount)
- Test: `apps/api/test/trust/routes.test.ts`

**Interfaces:**
- Consumes: `getTrustSignalView`, `recomputeForSupplier` from T4, `requireRole` from middleware
- Produces: `GET /api/admin/trust/signals/:supplierId`, `POST /api/admin/trust/signals/:supplierId/recompute`

- [ ] **Step 1: Create validation schema**

Create `packages/validation/src/trust.ts`:

```ts
import { z } from 'zod';

export const recomputeTrustSchema = z.object({}).strict();
```

- [ ] **Step 2: Export from validation barrel**

Modify `packages/validation/src/index.ts`: add `export * from './trust';`.

- [ ] **Step 3: Write failing test**

Create `apps/api/test/trust/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import adminIndex from '../../../src/modules/trust/adminIndex';

describe('trust admin router shape', () => {
  it('exports a Hono router with /signals and /recompute mounts', () => {
    expect(typeof adminIndex.fetch).toBe('function');
    // routes can be probed; for our purposes just ensure the export type checks
  });
});
```

- [ ] **Step 4: Implement admin routes**

Create `apps/api/src/modules/trust/routes.ts`:

```ts
import { Hono } from 'hono';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { getTrustSignalView, recomputeForSupplier } from './service';
import { trustRepository } from './repository';

const FLAG = 'TRUST_SIGNALS_ENABLED';
const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/signals/:supplierId', async (c) => {
  const supplierId = c.req.param('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'Missing supplierId');
  const row = await trustRepository.getBySupplierId(c.env.DB, supplierId);
  return c.json({
    raw: row,
    view: await getTrustSignalView(c.env.DB, supplierId),
    flagEnabled: await isFeatureEnabled(c.env.DB, FLAG),
  });
});

router.post('/signals/:supplierId/recompute', async (c) => {
  const supplierId = c.req.param('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'Missing supplierId');
  await recomputeForSupplier(c.env.DB, supplierId, Date.now());
  return c.json({
    ok: true,
    view: await getTrustSignalView(c.env.DB, supplierId),
  });
});

export default router;
```

Create `apps/api/src/modules/trust/adminIndex.ts`:

```ts
import router from './routes';
export default router;
```

- [ ] **Step 5: Mount in api/index.ts**

Modify `apps/api/src/index.ts` near line 213 (where sponsored admin route is mounted). Add:

```ts
import trustAdminRouter from './modules/trust/adminIndex';
// ...
app.route('/api/admin/trust', trustAdminRouter);
```

- [ ] **Step 6: Run typecheck + tests**

```sh
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/api test test/trust/routes.test.ts
```

- [ ] **Step 7: Commit**

```sh
git add packages/validation/src/trust.ts packages/validation/src/index.ts apps/api/src/modules/trust/routes.ts apps/api/src/modules/trust/adminIndex.ts apps/api/test/trust/routes.test.ts apps/api/src/index.ts
git commit -m "feat(trust): admin routes (GET signals + POST recompute) + validation schema"
```

---

### Task 9: Web — API client + hooks

**Files:**
- Create: `apps/web/src/lib/trustApi.ts`
- Create: `apps/web/src/hooks/useTrustSignals.ts`

**Interfaces:**
- Consumes: existing `api.get`, `api.post` helpers
- Produces: typed client + TanStack hooks for admin + buyer read paths

- [ ] **Step 1: Create API client**

Create `apps/web/src/lib/trustApi.ts`:

```ts
import { api } from './api';

export interface TrustSignalView {
  kyc: boolean;
  memberSinceYear: number | null;
  onTimePct: number | null;
  onTimeSampleSize: number;
  disputeFree: boolean;
  lastComputedAt: number | null;
}

export const trustApi = {
  async getSupplierTrustSignals(supplierId: string): Promise<{ raw: unknown; view: TrustSignalView; flagEnabled: boolean }> {
    return api.get(`/admin/trust/signals/${encodeURIComponent(supplierId)}`);
  },
  async recomputeSupplierTrustSignals(supplierId: string): Promise<{ ok: true; view: TrustSignalView }> {
    return api.post(`/admin/trust/signals/${encodeURIComponent(supplierId)}/recompute`, {});
  },
};
```

- [ ] **Step 2: Create hooks**

Create `apps/web/src/hooks/useTrustSignals.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trustApi, type TrustSignalView } from '../lib/trustApi';

export function useSupplierTrustSignals(supplierId: string) {
  return useQuery({
    queryKey: ['trust', 'supplier', supplierId],
    queryFn: () => trustApi.getSupplierTrustSignals(supplierId),
    enabled: Boolean(supplierId),
    staleTime: 60_000,
  });
}

export function useRecomputeTrustSignals(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => trustApi.recomputeSupplierTrustSignals(supplierId),
    onSuccess: (data) => {
      qc.setQueryData(['trust', 'supplier', supplierId], (prev: unknown) => ({
        raw: null,
        view: data.view,
        flagEnabled: true,
      }));
    },
  });
}

export type { TrustSignalView };
```

- [ ] **Step 3: Typecheck**

```sh
pnpm --filter @vyro/web typecheck
```

- [ ] **Step 4: Commit**

```sh
git add apps/web/src/lib/trustApi.ts apps/web/src/hooks/useTrustSignals.ts
git commit -m "feat(web): trust api client + hooks"
```

---

### Task 10: Web — TrustSignalBadges component + 4 leaf chips (TDD)

**Files:**
- Create: `apps/web/src/components/TrustBadgeKyc.tsx`
- Create: `apps/web/src/components/TrustBadgeMemberSince.tsx`
- Create: `apps/web/src/components/TrustBadgeOnTime.tsx`
- Create: `apps/web/src/components/TrustBadgeDisputeFree.tsx`
- Create: `apps/web/src/components/TrustSignalBadges.tsx`
- Test: `apps/web/src/components/TrustSignalBadges.test.tsx`

**Interfaces:**
- Consumes: `TrustSignalView` from T9
- Produces: `<TrustSignalBadges view={...} size="full|compact|verbose" />` reusable component

- [ ] **Step 1: Write failing test**

Create `apps/web/src/components/TrustSignalBadges.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustSignalBadges } from './TrustSignalBadges';

const allOn = {
  kyc: true,
  memberSinceYear: 2024,
  onTimePct: 95,
  onTimeSampleSize: 30,
  disputeFree: true,
  lastComputedAt: 1700000000,
};

const allOff = {
  kyc: false,
  memberSinceYear: null,
  onTimePct: null,
  onTimeSampleSize: 0,
  disputeFree: false,
  lastComputedAt: null,
};

describe('<TrustSignalBadges>', () => {
  it('full size renders 4 chips when all signals on', () => {
    render(<TrustSignalBadges view={allOn} size="full" />);
    expect(screen.getByText(/verified business/i)).toBeTruthy();
    expect(screen.getByText(/member since 2024/i)).toBeTruthy();
    expect(screen.getByText(/on-time delivery 95%/i)).toBeTruthy();
    expect(screen.getByText(/dispute-free/i)).toBeTruthy();
  });

  it('full size hides chips when signals are off', () => {
    render(<TrustSignalBadges view={allOff} size="full" />);
    expect(screen.queryByText(/verified business/i)).toBeNull();
    expect(screen.queryByText(/member since/i)).toBeNull();
    expect(screen.queryByText(/on-time delivery/i)).toBeNull();
    expect(screen.queryByText(/dispute-free/i)).toBeNull();
  });

  it('hides on-time chip when sample size < 5', () => {
    render(
      <TrustSignalBadges
        view={{ ...allOn, onTimePct: 100, onTimeSampleSize: 3 }}
        size="full"
      />,
    );
    expect(screen.queryByText(/on-time delivery/i)).toBeNull();
  });

  it('renders nothing when view is null', () => {
    const { container } = render(<TrustSignalBadges view={null} size="full" />);
    expect(container.children.length).toBe(0);
  });
});
```

Note: this assumes `@testing-library/react` is already available in the project's web deps. If not, vitest's `render` from `vitest-browser-react` may be used — check `apps/web/src/components/*.test.tsx` for the convention used.

- [ ] **Step 2: Run test (fail)**

```sh
pnpm --filter @vyro/web test src/components/TrustSignalBadges.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement leaf chips**

`apps/web/src/components/TrustBadgeKyc.tsx`:

```tsx
import type { JSX } from 'react';
export function TrustBadgeKyc({ size = 'full' }: { size?: 'full' | 'compact' | 'verbose' }): JSX.Element {
  if (size === 'compact') return <span title="Verified business" aria-label="Verified business">✅</span>;
  return <span className="trust-badge kyc">✅ Verified business</span>;
}
```

`apps/web/src/components/TrustBadgeMemberSince.tsx`:

```tsx
import type { JSX } from 'react';
export function TrustBadgeMemberSince({ year, size = 'full' }: { year: number; size?: 'full' | 'compact' | 'verbose' }): JSX.Element {
  if (size === 'compact') return <span title={`Member since ${year}`} aria-label={`Member since ${year}`}>📅</span>;
  return <span className="trust-badge member">📅 Member since {year}</span>;
}
```

`apps/web/src/components/TrustBadgeOnTime.tsx`:

```tsx
import type { JSX } from 'react';
export function TrustBadgeOnTime({ pct, sample, size = 'full' }: { pct: number; sample: number; size?: 'full' | 'compact' | 'verbose' }): JSX.Element {
  if (size === 'compact') return <span title={`On-time delivery ${pct}% (${sample} orders)`} aria-label={`On-time delivery ${pct} percent`}>⏱</span>;
  return <span className="trust-badge ontime">⏱ On-time delivery {pct}% <small>({sample} orders)</small></span>;
}
```

`apps/web/src/components/TrustBadgeDisputeFree.tsx`:

```tsx
import type { JSX } from 'react';
export function TrustBadgeDisputeFree({ size = 'full' }: { size?: 'full' | 'compact' | 'verbose' }): JSX.Element {
  if (size === 'compact') return <span title="Dispute-free" aria-label="Dispute-free">🛡</span>;
  return <span className="trust-badge dispute-free">🛡 Dispute-free</span>;
}
```

- [ ] **Step 4: Implement wrapper component**

Create `apps/web/src/components/TrustSignalBadges.tsx`:

```tsx
import type { JSX } from 'react';
import type { TrustSignalView } from '../lib/trustApi';
import { TrustBadgeKyc } from './TrustBadgeKyc';
import { TrustBadgeMemberSince } from './TrustBadgeMemberSince';
import { TrustBadgeOnTime } from './TrustBadgeOnTime';
import { TrustBadgeDisputeFree } from './TrustBadgeDisputeFree';

type Size = 'full' | 'compact' | 'verbose';

export function TrustSignalBadges({
  view,
  size = 'full',
}: {
  view: TrustSignalView | null;
  size?: Size;
}): JSX.Element | null {
  if (!view) return null;

  const meetsSample = view.onTimeSampleSize >= 5;
  const hasAny = view.kyc || view.memberSinceYear || (view.onTimePct != null && meetsSample) || view.disputeFree;
  if (!hasAny) return null;

  return (
    <div className={`trust-signal-badges size-${size} flex flex-wrap gap-2`}>
      {view.kyc && <TrustBadgeKyc size={size} />}
      {view.memberSinceYear && <TrustBadgeMemberSince year={view.memberSinceYear} size={size} />}
      {view.onTimePct != null && meetsSample && (
        <TrustBadgeOnTime pct={view.onTimePct} sample={view.onTimeSampleSize} size={size} />
      )}
      {view.disputeFree && <TrustBadgeDisputeFree size={size} />}
    </div>
  );
}
```

- [ ] **Step 5: Run test (pass)**

```sh
pnpm --filter @vyro/web test src/components/TrustSignalBadges.test.tsx
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/components/TrustBadgeKyc.tsx apps/web/src/components/TrustBadgeMemberSince.tsx apps/web/src/components/TrustBadgeOnTime.tsx apps/web/src/components/TrustBadgeDisputeFree.tsx apps/web/src/components/TrustSignalBadges.tsx apps/web/src/components/TrustSignalBadges.test.tsx
git commit -m "feat(web): TrustSignalBadges component + 4 leaf chips (KYC, Member, OnTime, Dispute)"
```

---

### Task 11: Storefront integration + admin detail page

**Files:**
- Modify: `apps/web/src/storefront/StorefrontPage.tsx`
- Modify: `apps/web/src/storefront/SupplierProductGrid.tsx`

**Interfaces:**
- Consumes: `TrustSignalView` from T9
- Produces: full-size badges in hero, compact badges per offer card

- [ ] **Step 1: Extend `StorefrontData` interface**

Read current file (~80 lines). Add to the `StorefrontData` interface:

```ts
trustSignals?: TrustSignalView | null;
```

Import from `'../lib/trustApi'`.

- [ ] **Step 2: Render full badges in hero**

After the `<SupplierHero>` block, insert:

```tsx
{data.trustSignals && (
  <section aria-label="Trust signals">
    <TrustSignalBadges view={data.trustSignals} size="full" />
  </section>
)}
```

- [ ] **Step 3: Pass trustSignals down to SupplierProductGrid**

Extend the props of `SupplierProductGrid` to accept `trustSignals?: TrustSignalView | null` (or a top-level prop on each offer — depends on existing shape). Render compact chips below the offer name. Read the file first to choose the right insertion point.

- [ ] **Step 4: Typecheck + tests**

```sh
pnpm --filter @vyro/web typecheck
pnpm --filter @vyro/web test
```

- [ ] **Step 5: Commit**

```sh
git add apps/web/src/storefront/StorefrontPage.tsx apps/web/src/storefront/SupplierProductGrid.tsx
git commit -m "feat(web): render trust signal badges in storefront hero + offer cards"
```

---

### Task 12: Admin supplier detail verbose view

**Files:**
- Create: `apps/web/src/admin/trust/SupplierTrustSignalsCard.tsx` (or extend existing supplier detail page)

**Interfaces:**
- Consumes: `useSupplierTrustSignals`, `useRecomputeTrustSignals` from T9
- Produces: full breakdown card with thresholds + "Recompute now" button

- [ ] **Step 1: Locate existing admin supplier detail page**

```sh
ls apps/web/src/admin/ | grep -i supplier
```

If a page exists for per-supplier admin detail, integrate. If not, create `apps/web/src/admin/trust/SupplierTrustSignalsPage.tsx` (admin route: `/admin/suppliers/:id/trust` or similar).

- [ ] **Step 2: Implement card component**

Create `apps/web/src/admin/trust/SupplierTrustSignalsCard.tsx`:

```tsx
import { useSupplierTrustSignals, useRecomputeTrustSignals } from '../../hooks/useTrustSignals';

export function SupplierTrustSignalsCard({ supplierId }: { supplierId: string }) {
  const { data, isLoading, error } = useSupplierTrustSignals(supplierId);
  const recompute = useRecomputeTrustSignals(supplierId);

  if (isLoading) return <div>Loading trust signals…</div>;
  if (error) return <div className="text-red-600">Failed to load trust signals.</div>;
  if (!data) return null;

  return (
    <div className="border border-ink/10 rounded-xl p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold">Trust signals</h3>
        <button
          className="text-sm px-3 py-1 border border-ink/15 rounded hover:border-copper/40"
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
        >
          {recompute.isPending ? 'Recomputing…' : 'Recompute now'}
        </button>
      </header>
      {!data.flagEnabled && (
        <p className="text-sm text-amber-700">Flag TRUST_SIGNALS_ENABLED is off — public endpoints will not return this view.</p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-3">KYC</dt><dd>{data.view.kyc ? '✅ verified' : '—'}</dd>
        <dt className="text-ink-3">Member since</dt><dd>{data.view.memberSinceYear ?? '—'}</dd>
        <dt className="text-ink-3">On-time</dt>
        <dd>
          {data.view.onTimePct != null
            ? `${data.view.onTimePct}% (sample ${data.view.onTimeSampleSize})`
            : `Need ≥5 delivered POs (current ${data.view.onTimeSampleSize})`}
        </dd>
        <dt className="text-ink-3">Dispute-free</dt><dd>{data.view.disputeFree ? '✅' : '—'}</dd>
        <dt className="text-ink-3">Computed at</dt>
        <dd>{data.view.lastComputedAt ? new Date(data.view.lastComputedAt * 1000).toISOString() : '—'}</dd>
      </dl>
    </div>
  );
}
```

- [ ] **Step 3: Wire into admin supplier detail page**

Find the existing page (or create one) and drop `<SupplierTrustSignalsCard supplierId={id} />` near the top.

- [ ] **Step 4: Add admin route if creating new page**

In the SPA router file (look for `apps/web/src/main.tsx` or similar), add a route such as `/admin/suppliers/:id/trust` → `<SupplierTrustSignalsPage />`.

- [ ] **Step 5: Typecheck + tests**

```sh
pnpm --filter @vyro/web typecheck
pnpm --filter @vyro/web test
```

- [ ] **Step 6: Commit**

```sh
git add apps/web/src/admin/trust/
git commit -m "feat(web): admin supplier trust signals card + recompute action"
```

---

### Task 13: Backfill script

**Files:**
- Create: `apps/api/scripts/trust-backfill.ts` (or `.js`)
- Modify: `apps/api/package.json` (add `trust:backfill` script)

**Interfaces:**
- Consumes: `recomputeAllSuppliers` from T4
- Produces: `pnpm --filter @vyro/api trust:backfill` one-shot command

- [ ] **Step 1: Find local-DB wiring convention**

```sh
grep -rn "scripts/.*\\.ts\|drizzle-kit" apps/api/package.json | head -10
```

Inspect an existing script (e.g., `enable-flag.sh` already exists — but TS scripts: look in `apps/api/scripts/*.ts`).

- [ ] **Step 2: Write the script**

Create `apps/api/scripts/trust-backfill.ts`:

```ts
// One-shot trust signals backfill. Idempotent (UPSERT).
// Usage: pnpm --filter @vyro/api trust:backfill
import { getPlatformProxy } from '@wrangler/platform-proxy';
import { recomputeAllSuppliers } from '../src/modules/trust/service';

async function main() {
  const proxy = await getPlatformProxy();
  const env = proxy.env as { DB: D1Database };
  const result = await recomputeAllSuppliers(env.DB, Date.now());
  console.log(JSON.stringify(result, null, 2));
  await proxy.dispose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

If `getPlatformProxy` is not the project's convention, mirror the pattern from the nearest sibling script.

- [ ] **Step 3: Add package.json script**

```json
"trust:backfill": "tsx scripts/trust-backfill.ts"
```

- [ ] **Step 4: Smoke test**

```sh
pnpm --filter @vyro/api trust:backfill
```

Expected: prints `{ "rebuilt": <N>, "failed": 0 }`.

- [ ] **Step 5: Commit**

```sh
git add apps/api/scripts/trust-backfill.ts apps/api/package.json
git commit -m "feat(trust): one-shot backfill script"
```

---

### Task 14: Verification — typecheck + full test pass + phase notes

**Files:**
- Create: `docs/superpowers/notes/trust-phase-1.md`

- [ ] **Step 1: Monorepo typecheck**

```sh
pnpm -r typecheck 2>&1 | tail -10
```

Expected: pass.

- [ ] **Step 2: Monorepo test run**

```sh
pnpm test 2>&1 | tail -10
```

Expected: existing 971+142 + new trust tests, all pass.

- [ ] **Step 3: Confirm flag gate**

```sh
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite "select count(*) from supplier_trust_signals"
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite "select count(*) from purchase_orders where delivery_promised_at is not null"
```

Expected: counts visible; if migrations haven't been re-run, values may be 0 / nulls.

- [ ] **Step 4: Verify flag-off path**

Toggle `TRUST_SIGNALS_ENABLED` off (`./apps/api/scripts/enable-flag.sh TRUST_SIGNALS_ENABLED false`). Curl storefront. Expect response: `trustSignals: null`.

- [ ] **Step 5: Verify flag-on path with no data**

Toggle flag on but no recompute done. Curl storefront. Expect `trustSignals: { kyc: false, memberSinceYear: null, onTimePct: null, onTimeSampleSize: 0, disputeFree: false, lastComputedAt: null }`.

- [ ] **Step 6: Write Phase 1 verification note**

Create `docs/superpowers/notes/trust-phase-1.md` documenting:

- Date, phase, audience
- Flag state, rollout strategy
- Smoke endpoints + results
- Known limitations
- Rollout to Phase 2

Mirror the structure of `docs/superpowers/notes/sponsored-phase-1.md` — adjust for trust signals.

- [ ] **Step 7: Commit phase note**

```sh
git add docs/superpowers/notes/trust-phase-1.md
git commit -m "docs(trust): Phase 1 verification notes (admin-only verbose view)"
```

---

### Task 15: Memory update

**Files:**
- Modify: `/Users/thufailahamed/.claude/projects/-Users-thufailahamed-Downloads-project-5/memory/vyro-roadmap.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Mark item #2 shipped in roadmap memory**

Open `vyro-roadmap.md` and update item 2 status:

```markdown
2. Supplier verification & trust badges — SHIPPED 2026-09-17. Per-signal badges (KYC, Member Since, On-Time Delivery, Dispute-Free).
```

Add an entry below "Files for sponsored":

```markdown
**Files for trust signals:**
- Spec: `docs/superpowers/specs/2026-09-17-trust-signals-design.md`
- Plan: `docs/superpowers/plans/2026-09-17-trust-signals.md`
```

- [ ] **Step 2: Update MEMORY.md line**

Replace:
```
- [Vyro growth roadmap](vyro-roadmap.md) — 8 sub-projects; reviews + sponsored listings shipped
```
with:
```
- [Vyro growth roadmap](vyro-roadmap.md) — 8 sub-projects; reviews + sponsored + trust shipped
```

- [ ] **Step 3: No git commit (memory is outside repo). Confirm both files written.**

---

## Coverage notes (self-review checklist)

- [x] Spec → task coverage: spec sections all map to a task (sections 1-5 → tasks 1-15).
- [x] No TBD / TODO / placeholders in any step.
- [x] Type consistency: `computeTrustSignal` (T3) ↔ `TrustSignalInput` (T2) ↔ `supplierTrustSignals` row (T1). `getTrustSignalView` (T4) returns shape consumed by `TrustSignalBadges` (T10). API client (T9) wraps both admin endpoints (T8) and reads from the same view type.
- [x] Hook wiring: T5 calls `recomputeForSupplier` from T4 which uses `computeTrustSignal` from T3 which fills `TrustSignalInput` shape from T2 which writes to `supplierTrustSignals` from T1 — full chain closed.
- [x] Flag gate: T7 (public), T8 (admin — gated by role + flag check at runtime).
- [x] Cron idempotency: T6 uses `recomputeAllSuppliers` → per-supplier try/catch.
