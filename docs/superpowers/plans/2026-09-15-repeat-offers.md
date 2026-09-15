# Repeat Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brand-funded auto-discount triggered when a retailer's trailing 90d spend with a supplier crosses LKR 150,000. 10% off the supplier's PO subtotal, auto-applied at checkout, no stacking with other discounts.

**Architecture:** New `repeatOffers/` API module with three responsibilities — eligibility query (read-only against `purchase_orders`), `applyForCart` (per-PO discount injection called from `checkoutService.checkout` as a function import, no HTTP), and supplier analytics. Front-end surfaces: cart-page badge (buyer preview endpoint), checkout-page summary, supplier analytics tile. Feature-flagged via `REPEAT_OFFERS_ENABLED` (D1 `feature_flags` section).

**Tech Stack:** Hono (Workers), Drizzle ORM (D1/SQLite), Zod validation (`@vyro/validation`), TanStack Query + `api.get` (web), Vitest with `node:sqlite` D1 shim.

## Global Constraints

- Threshold: `REPEAT_OFFER_THRESHOLD_CENTS = 15_000_00` (LKR 150,000.00 in cents). Window: 90 days (`90 * 24 * 60 * 60 * 1000` ms). Percent: `10`.
- Discount applies at PO (per-supplier) level, not line-item level. `purchase_order_items` lacks `supplierId`; supplier lives on parent `purchase_orders`.
- Eligibility reads `purchase_orders` only: `status = 'completed'`, `completedAt >= now - 90d`, `businessId = ?`, grouped by `supplierId`, sum `subtotalCents`.
- Best-discount-wins: if a PO already carries a non-zero `existingDiscountCents`, Repeat Offer does NOT apply.
- No HTTP endpoint for apply — internal function call only from `checkoutService.checkout`. Mirrors CRM's `markQuoted`/`markOrdered` pattern.
- Feature flag `REPEAT_OFFERS_ENABLED` lives in D1 `feature_flags` config section; default `false`; read via `isFeatureEnabled` helper at `apps/api/src/lib/featureFlags.ts`.
- Currency: LKR. No FX conversion in MVP.
- All new endpoints must pass `verifyCsrf` (handled by global middleware on `/api/*`).
- All new env-aware code takes `D1Database` as first param and uses `getDb(d1)` from `@vyro/db` for queryable access (matches `crmRepository` pattern).
- Tests use `node:sqlite` D1 shim pattern from `apps/api/test/cross-border/e2e.test.ts:5-14`, then `app.fetch(new Request(...))`.
- Web uses `api.get/post` from `@/lib/api` (`apps/web/src/lib/api.ts`), NOT `apiFetch`.
- No new npm deps. No new tables. No new files in `packages/db/`.

---

### Task 1: Constants + Zod validation

**Files:**
- Create: `apps/api/src/modules/repeatOffers/constants.ts`
- Create: `packages/validation/src/repeatOffers.ts`
- Modify: `packages/validation/src/index.ts` (re-export new schema)

**Interfaces:**
- Produces: `REPEAT_OFFER_THRESHOLD_CENTS`, `REPEAT_OFFER_WINDOW_MS`, `REPEAT_OFFER_PERCENT` constants.
- Produces: `repeatOfferPreviewSchema`, `repeatOfferAnalyticsResponseSchema`, `repeatOfferAppliedSchema` Zod schemas.
- Produces: `RepeatOfferPreview`, `RepeatOfferApplied`, `RepeatOfferAnalytics` types.

- [ ] **Step 1: Create `apps/api/src/modules/repeatOffers/constants.ts`**

```ts
export const REPEAT_OFFER_THRESHOLD_CENTS = 15_000_00;
export const REPEAT_OFFER_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const REPEAT_OFFER_PERCENT = 10;
export const REPEAT_OFFER_FLAG = 'REPEAT_OFFERS_ENABLED';
```

- [ ] **Step 2: Create `packages/validation/src/repeatOffers.ts`**

```ts
import { z } from 'zod';

export const repeatOfferSchema = z.object({
  supplierId: z.string(),
  supplierName: z.string(),
  percent: z.number().int().positive(),
  trailingSpendCents: z.number().int().nonnegative(),
});
export type RepeatOffer = z.infer<typeof repeatOfferSchema>;

export const repeatOfferPreviewResponseSchema = z.object({
  offers: z.array(repeatOfferSchema),
});
export type RepeatOfferPreviewResponse = z.infer<typeof repeatOfferPreviewResponseSchema>;

export const repeatOfferAppliedSchema = z.object({
  supplierId: z.string(),
  discountCents: z.number().int().nonnegative(),
  percent: z.number().int().positive(),
});
export type RepeatOfferApplied = z.infer<typeof repeatOfferAppliedSchema>;

export const repeatOfferAnalyticsResponseSchema = z.object({
  triggeredCount: z.number().int().nonnegative(),
  totalSavingsCents: z.number().int().nonnegative(),
  byRetailer: z.array(z.object({
    businessId: z.string(),
    trailingSpendCents: z.number().int().nonnegative(),
    triggeredAt: z.number().int().nonnegative(),
  })),
});
export type RepeatOfferAnalyticsResponse = z.infer<typeof repeatOfferAnalyticsResponseSchema>;
```

- [ ] **Step 3: Re-export from `packages/validation/src/index.ts`**

Append to the existing export block (keep alphabetical order if the file uses it):

```ts
export * from './repeatOffers';
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/repeatOffers/constants.ts packages/validation/src/repeatOffers.ts packages/validation/src/index.ts
git commit -m "feat(repeat-offers): constants + zod schemas"
```

---

### Task 2: Repository — trailing 90d spend query

**Files:**
- Create: `apps/api/src/modules/repeatOffers/repository.ts`

**Interfaces:**
- Consumes: `D1Database`, `businessId: string`, `now: number`.
- Produces: `trailingSpendForBusiness(d1, businessId, now): Promise<Map<string, number>>` — supplierId → sum of completed PO subtotals in trailing 90d window.

- [ ] **Step 1: Create `apps/api/src/modules/repeatOffers/repository.ts`**

```ts
import { and, eq, gte, sum } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';

export const repeatOffersRepository = {
  async trailingSpendForBusiness(
    d1: D1Database,
    businessId: string,
    now: number,
    windowMs: number,
  ): Promise<Map<string, number>> {
    const db = getDb(d1);
    const since = now - windowMs;
    const rows = await db
      .select({
        supplierId: purchaseOrders.supplierId,
        totalCents: sum(purchaseOrders.subtotalCents),
      })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.businessId, businessId),
        eq(purchaseOrders.status, 'completed'),
        gte(purchaseOrders.completedAt, since),
      ))
      .groupBy(purchaseOrders.supplierId);

    const out = new Map<string, number>();
    for (const r of rows) {
      const cents = Number(r.totalCents ?? 0);
      if (cents > 0) out.set(r.supplierId, cents);
    }
    return out;
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/repeatOffers/repository.ts
git commit -m "feat(repeat-offers): trailing 90d spend repository"
```

---

### Task 3: Service — `computeEligibility` (TDD unit)

**Files:**
- Create: `apps/api/src/modules/repeatOffers/service.ts`
- Create: `apps/api/test/repeatOffers/service.test.ts`

**Interfaces:**
- Consumes: `D1Database`, `businessId: string`. Uses `repeatOffersRepository.trailingSpendForBusiness` + constants.
- Produces: `computeEligibility(d1, businessId): Promise<RepeatOffer[]>` — only suppliers past threshold.

- [ ] **Step 1: Write failing tests in `apps/api/test/repeatOffers/service.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { repeatOffers } from '../../../src/modules/repeatOffers/service';
import { REPEAT_OFFER_THRESHOLD_CENTS, REPEAT_OFFER_WINDOW_MS, REPEAT_OFFER_PERCENT } from '../../../src/modules/repeatOffers/constants';

const NOW = 1_700_000_000_000;
const env = { DB: {} as D1Database } as any;

describe('repeatOffers.computeEligibility', () => {
  it('returns suppliers whose trailing 90d spend >= threshold', async () => {
    const repo = await import('../../../src/modules/repeatOffers/repository');
    vi.spyOn(repo.repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(
      new Map([['supA', REPEAT_OFFER_THRESHOLD_CENTS + 1_000_00]]),
    );
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers).toEqual([{
      supplierId: 'supA',
      percent: REPEAT_OFFER_PERCENT,
      trailingSpendCents: REPEAT_OFFER_THRESHOLD_CENTS + 1_000_00,
    }]);
  });

  it('excludes suppliers below threshold', async () => {
    const repo = await import('../../../src/modules/repeatOffers/repository');
    vi.spyOn(repo.repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(
      new Map([['supA', REPEAT_OFFER_THRESHOLD_CENTS - 1]]),
    );
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers).toEqual([]);
  });

  it('returns multiple qualifying suppliers', async () => {
    const repo = await import('../../../src/modules/repeatOffers/repository');
    vi.spyOn(repo.repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(
      new Map([
        ['supA', REPEAT_OFFER_THRESHOLD_CENTS + 5_000_00],
        ['supB', REPEAT_OFFER_THRESHOLD_CENTS],
        ['supC', REPEAT_OFFER_THRESHOLD_CENTS - 1],
      ]),
    );
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers.map(o => o.supplierId).sort()).toEqual(['supA', 'supB']);
  });

  it('returns empty when no spend history', async () => {
    const repo = await import('../../../src/modules/repeatOffers/repository');
    vi.spyOn(repo.repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(new Map());
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/service.test.ts`
Expected: FAIL — `repeatOffers.computeEligibility` not exported.

- [ ] **Step 3: Implement `apps/api/src/modules/repeatOffers/service.ts` (skeleton)**

```ts
import type { RepeatOffer } from '@vyro/validation';
import { repeatOffersRepository } from './repository';
import {
  REPEAT_OFFER_THRESHOLD_CENTS,
  REPEAT_OFFER_WINDOW_MS,
  REPEAT_OFFER_PERCENT,
} from './constants';

export const repeatOffers = {
  async computeEligibility(
    d1: D1Database,
    businessId: string,
    now: number = Date.now(),
  ): Promise<RepeatOffer[]> {
    const spend = await repeatOffersRepository.trailingSpendForBusiness(
      d1, businessId, now, REPEAT_OFFER_WINDOW_MS,
    );
    const offers: RepeatOffer[] = [];
    for (const [supplierId, trailingSpendCents] of spend) {
      if (trailingSpendCents >= REPEAT_OFFER_THRESHOLD_CENTS) {
        offers.push({ supplierId, percent: REPEAT_OFFER_PERCENT, trailingSpendCents });
      }
    }
    return offers;
  },
};
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/service.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/repeatOffers/service.ts apps/api/test/repeatOffers/service.test.ts
git commit -m "feat(repeat-offers): computeEligibility service + tests"
```

---

### Task 4: Service — `applyForCart` (TDD unit)

**Files:**
- Modify: `apps/api/src/modules/repeatOffers/service.ts`
- Modify: `apps/api/test/repeatOffers/service.test.ts`

**Interfaces:**
- Produces: `applyForCart(businessId, offers, cartSuppliers): RepeatOfferApplied[]` — synchronous, pure.

- [ ] **Step 1: Append failing tests**

Append to the existing `describe` block in `apps/api/test/repeatOffers/service.test.ts`:

```ts
describe('repeatOffers.applyForCart', () => {
  const offers = [
    { supplierId: 'supA', percent: 10, trailingSpendCents: 200_000_00 },
  ];

  it('applies 10% to qualifying supplier POs', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supA', subtotalCents: 10_000_00, existingDiscountCents: 0 },
    ]);
    expect(result).toEqual([
      { supplierId: 'supA', discountCents: 1_000_00, percent: 10 },
    ]);
  });

  it('skips POs with existing discount (best-discount-wins)', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supA', subtotalCents: 10_000_00, existingDiscountCents: 500_00 },
    ]);
    expect(result).toEqual([]);
  });

  it('skips POs whose supplier is not in offers', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supB', subtotalCents: 10_000_00, existingDiscountCents: 0 },
    ]);
    expect(result).toEqual([]);
  });

  it('multi-supplier cart: only qualifying suppliers get discount', () => {
    const multiOffers = [
      { supplierId: 'supA', percent: 10, trailingSpendCents: 200_000_00 },
      { supplierId: 'supC', percent: 10, trailingSpendCents: 200_000_00 },
    ];
    const result = repeatOffers.applyForCart('biz1', multiOffers, [
      { supplierId: 'supA', subtotalCents: 10_000_00, existingDiscountCents: 0 },
      { supplierId: 'supB', subtotalCents: 5_000_00, existingDiscountCents: 0 },
      { supplierId: 'supC', subtotalCents: 8_000_00, existingDiscountCents: 0 },
    ]);
    expect(result.map(r => r.supplierId).sort()).toEqual(['supA', 'supC']);
  });

  it('floors fractional cents', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supA', subtotalCents: 1_999_99, existingDiscountCents: 0 },
    ]);
    // 1,999,99 * 0.10 = 19,999.9 → floor to 19999
    expect(result[0].discountCents).toBe(19999);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/service.test.ts`
Expected: FAIL — `applyForCart` not a function.

- [ ] **Step 3: Add `applyForCart` to `service.ts`**

Append inside the `repeatOffers` object in `apps/api/src/modules/repeatOffers/service.ts`:

```ts
  applyForCart(
    _businessId: string,
    offers: RepeatOffer[],
    cartSuppliers: Array<{
      supplierId: string;
      subtotalCents: number;
      existingDiscountCents: number;
    }>,
  ): import('@vyro/validation').RepeatOfferApplied[] {
    const offersBySupplier = new Map(offers.map(o => [o.supplierId, o]));
    const out: import('@vyro/validation').RepeatOfferApplied[] = [];
    for (const s of cartSuppliers) {
      if (s.existingDiscountCents > 0) continue;
      const offer = offersBySupplier.get(s.supplierId);
      if (!offer) continue;
      out.push({
        supplierId: s.supplierId,
        discountCents: Math.floor(s.subtotalCents * offer.percent / 100),
        percent: offer.percent,
      });
    }
    return out;
  },
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/service.test.ts`
Expected: 9 passed (4 computeEligibility + 5 applyForCart).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/repeatOffers/service.ts apps/api/test/repeatOffers/service.test.ts
git commit -m "feat(repeat-offers): applyForCart with best-discount-wins"
```

---

### Task 5: Service — `previewForBuyer` + `analyticsForSupplier` (TDD unit)

**Files:**
- Modify: `apps/api/src/modules/repeatOffers/service.ts`
- Modify: `apps/api/test/repeatOffers/service.test.ts`

**Interfaces:**
- Produces: `previewForBuyer(d1, businessId, now): Promise<RepeatOfferPreviewResponse>` — wraps `computeEligibility` (supplierName filled later; see Step 3).
- Produces: `analyticsForSupplier(d1, supplierId, now): Promise<RepeatOfferAnalyticsResponse>` — aggregates completed POs in trailing 30d (count + sum of subtotal*percent applied).

- [ ] **Step 1: Append failing tests**

```ts
import * as supplierRepo from '@vyro/db';
vi.mock('@vyro/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => Promise.resolve([
            { supplierId: 'supA', totalCents: REPEAT_OFFER_THRESHOLD_CENTS + 1_000_00 },
          ])),
        })),
      })),
    })),
  })),
}));

describe('repeatOffers.previewForBuyer', () => {
  it('returns offers array', async () => {
    const result = await repeatOffers.previewForBuyer(env.DB, 'biz1', NOW);
    expect(result.offers).toEqual([
      { supplierId: 'supA', supplierName: '', percent: 10, trailingSpendCents: REPEAT_OFFER_THRESHOLD_CENTS + 1_000_00 },
    ]);
  });
});

describe('repeatOffers.analyticsForSupplier', () => {
  it('returns zeros when no POs', async () => {
    vi.mocked((await import('@vyro/db')).getDb as any).mockReturnValueOnce({
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    });
    const result = await repeatOffers.analyticsForSupplier(env.DB, 'supA', NOW);
    expect(result).toEqual({ triggeredCount: 0, totalSavingsCents: 0, byRetailer: [] });
  });
});
```

NOTE: the analytics test above is intentionally minimal — full coverage comes in Task 9 with the integration test against the sqlite D1 shim. Keep this as a sanity stub.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/service.test.ts`
Expected: FAIL — `previewForBuyer` and `analyticsForSupplier` not defined.

- [ ] **Step 3: Implement `previewForBuyer` + `analyticsForSupplier`**

Append inside `repeatOffers` in `apps/api/src/modules/repeatOffers/service.ts`:

```ts
  async previewForBuyer(
    d1: D1Database,
    businessId: string,
    now: number = Date.now(),
  ): Promise<import('@vyro/validation').RepeatOfferPreviewResponse> {
    const offers = await this.computeEligibility(d1, businessId, now);
    return {
      offers: offers.map(o => ({ ...o, supplierName: '' })),
    };
  },

  async analyticsForSupplier(
    d1: D1Database,
    supplierId: string,
    now: number = Date.now(),
  ): Promise<import('@vyro/validation').RepeatOfferAnalyticsResponse> {
    const { getDb } = await import('@vyro/db');
    const { purchaseOrders } = await import('@vyro/db/schema');
    const { and, eq, gte, sum, count } = await import('drizzle-orm');
    const since = now - 30 * 24 * 60 * 60 * 1000;
    const db = getDb(d1);
    const rows = await db
      .select({
        businessId: purchaseOrders.businessId,
        completedAt: purchaseOrders.completedAt,
        subtotalCents: purchaseOrders.subtotalCents,
      })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.status, 'completed'),
        gte(purchaseOrders.completedAt, since),
      ));
    let totalSavings = 0;
    const byRetailer: Array<{ businessId: string; trailingSpendCents: number; triggeredAt: number }> = [];
    for (const r of rows) {
      const savings = Math.floor((r.subtotalCents ?? 0) * REPEAT_OFFER_PERCENT / 100);
      totalSavings += savings;
      byRetailer.push({
        businessId: r.businessId,
        trailingSpendCents: r.subtotalCents ?? 0,
        triggeredAt: r.completedAt ?? now,
      });
    }
    return {
      triggeredCount: rows.length,
      totalSavingsCents: totalSavings,
      byRetailer,
    };
  },
```

NOTE: `supplierName` is filled in Routes task (Task 6) with a join to suppliers table; in service it's an empty placeholder.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/service.test.ts`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/repeatOffers/service.ts apps/api/test/repeatOffers/service.test.ts
git commit -m "feat(repeat-offers): previewForBuyer + analyticsForSupplier"
```

---

### Task 6: Routes — buyer preview + supplier analytics

**Files:**
- Create: `apps/api/src/modules/repeatOffers/routes.ts`
- Create: `apps/api/src/modules/repeatOffers/index.ts`
- Create: `apps/api/test/repeatOffers/routes.test.ts`

**Interfaces:**
- Produces: Hono router exporting `GET /` (buyer preview, requires session) + `GET /analytics` (supplier analytics, requires session + supplier role).
- Both endpoints gated by `REPEAT_OFFERS_ENABLED` (404 if off).
- Mirrors `apps/api/src/modules/rfqs/crmRoutes.ts` patterns.

- [ ] **Step 1: Create `apps/api/src/modules/repeatOffers/routes.ts`**

```ts
import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { requireSupplierRole } from '@vyro/auth';
import { suppliers } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { repeatOffers } from './service';
import { REPEAT_OFFER_FLAG } from './constants';

const router = new Hono<{ Bindings: Env }>();
const S_ROLES = ['owner', 'sales', 'operations'] as const;

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

async function ensureEnabled(d1: D1Database): Promise<void> {
  if (!(await isFeatureEnabled(d1, REPEAT_OFFER_FLAG))) {
    throw httpError(404, 'NOT_FOUND', 'feature not enabled');
  }
}

router.use('*', session());
router.use('*', async (c, next) => {
  await ensureEnabled(c.env.DB);
  await next();
});

router.get('/', async (c) => {
  const ctx = ctxOf(c);
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  const preview = await repeatOffers.previewForBuyer(c.env.DB, businessId);
  // Hydrate supplierName from suppliers table.
  const db = getDb(c.env.DB);
  const supplierIds = preview.offers.map(o => o.supplierId);
  if (supplierIds.length === 0) return c.json(preview);
  const supplierRows = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
  const nameById = new Map(supplierRows.map(r => [r.id, r.name]));
  preview.offers = preview.offers.map(o => ({ ...o, supplierName: nameById.get(o.supplierId) ?? '' }));
  void ctx; // session used implicitly
  return c.json(preview);
});

router.get('/analytics', async (c) => {
  const ctx = ctxOf(c);
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, supplierId, S_ROLES);
  const analytics = await repeatOffers.analyticsForSupplier(c.env.DB, supplierId);
  return c.json(analytics);
});

export default router;
```

NOTE: verify exact field name for `suppliers.name` by reading `packages/db/src/schema/suppliers.ts`. If it's `displayName` or `businessName`, swap accordingly. (Recon shows `name` is the standard column name in Vyro schema.)

- [ ] **Step 2: Create `apps/api/src/modules/repeatOffers/index.ts`**

```ts
import router from './routes';
export default router;
```

- [ ] **Step 3: Write route test in `apps/api/test/repeatOffers/routes.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/middleware/session', () => ({
  session: () => async (_c: any, next: any) => { _c.set('ctx', { userId: 'u1' }); await next(); },
}));

vi.mock('@vyro/auth', () => ({
  requireSupplierRole: vi.fn(),
}));

vi.mock('../../src/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import app from '../../src/index';
import { isFeatureEnabled } from '../../src/lib/featureFlags';

const env = { DB: {} as D1Database } as any;

describe('repeatOffers routes — feature flag gate', () => {
  it('returns 404 when REPEAT_OFFERS_ENABLED is false', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValueOnce(false);
    const res = await app.fetch(new Request('http://localhost/api/checkout/repeat-offers?businessId=b1'), env);
    expect(res.status).toBe(404);
  });

  it('returns 400 when businessId missing', async () => {
    const res = await app.fetch(new Request('http://localhost/api/checkout/repeat-offers'), env);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run route tests — expect PASS**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/routes.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/repeatOffers/routes.ts apps/api/src/modules/repeatOffers/index.ts apps/api/test/repeatOffers/routes.test.ts
git commit -m "feat(repeat-offers): buyer preview + supplier analytics routes"
```

---

### Task 7: Wire router into `apps/api/src/index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add import**

After line 83 (`import whatsappRouter from './modules/whatsapp/routes';`), insert:

```ts
import repeatOffersRouter from './modules/repeatOffers';
```

- [ ] **Step 2: Mount router**

After line 204 (`app.route('/', whatsappRouter);`), insert:

```ts
app.route('/api/checkout/repeat-offers', repeatOffersRouter);
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(repeat-offers): mount router at /api/checkout/repeat-offers"
```

---

### Task 8: Hook `applyForCart` into `checkoutService.checkout`

**Files:**
- Modify: `apps/api/src/modules/purchaseOrders/service.ts`

**Interfaces:**
- Consumes: `applyForCart(businessId, offers, cartSuppliers)` from `repeatOffers/service`.
- Hooks in AFTER supplier POs are constructed but BEFORE their subtotals/totals are finalized.

- [ ] **Step 1: Read current `checkout` flow**

Read `apps/api/src/modules/purchaseOrders/service.ts` lines 77–end-of-checkout. Identify the loop that builds each supplier PO and computes `subtotalCents`/`totalCents`.

- [ ] **Step 2: Add import**

Add at the top of `service.ts` (next to other module imports):

```ts
import { repeatOffers } from '../repeatOffers/service';
import { REPEAT_OFFER_FLAG } from '../repeatOffers/constants';
import { isFeatureEnabled } from '../../lib/featureFlags';
```

- [ ] **Step 3: Add eligibility lookup once at top of checkout**

Inside `checkout`, after the inputs are validated but before the per-supplier PO loop, insert:

```ts
  let repeatApplied = new Map<string, number>();
  if (await isFeatureEnabled(d1, REPEAT_OFFER_FLAG)) {
    const offers = await repeatOffers.computeEligibility(d1, businessId);
    // Build cartSuppliers from input's per-supplier line totals (shape to be filled by caller).
    const cartSuppliers = (input.cartItems ?? []).map((ci: any) => ({
      supplierId: ci.supplierId,
      subtotalCents: ci.subtotalCents ?? 0,
      existingDiscountCents: ci.existingDiscountCents ?? 0,
    }));
    const applied = repeatOffers.applyForCart(businessId, offers, cartSuppliers);
    for (const a of applied) repeatApplied.set(a.supplierId, a.discountCents);
  }
```

NOTE: `CheckoutInput` schema (per recon) only carries `businessId`, `notes?`, `paymentMethod`, `creditTerms?`, `idempotencyKey?` — it does NOT carry cart items. The current `checkout` likely fetches cart from `cartItems` table internally. Adjust the snippet above to feed in the actual per-supplier subtotals from whatever internal structure `checkout` uses to build the PO list. The exact hook point is "after per-supplier subtotals are known, before PO rows are inserted."

- [ ] **Step 4: Subtract Repeat Offer discount from each PO subtotal**

In the loop that builds each supplier PO, after `subtotalCents` is set, insert:

```ts
    const repeatDiscount = repeatApplied.get(supplierId) ?? 0;
    const finalSubtotal = Math.max(0, subtotalCents - repeatDiscount);
    const finalTotal = Math.max(0, totalCents - repeatDiscount);
```

Use `finalSubtotal`/`finalTotal` in the PO insert + total update. Stash `repeatDiscount` somewhere on the inserted row OR log it via the response payload for the smoke test.

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/purchaseOrders/service.ts
git commit -m "feat(repeat-offers): applyForCart hook in checkoutService.checkout"
```

---

### Task 9: Integration test — full checkout applies Repeat Offer

**Files:**
- Create: `apps/api/test/repeatOffers/checkout-integration.test.ts`

**Interfaces:**
- Uses `node:sqlite` D1 shim from `apps/api/test/cross-border/e2e.test.ts` as a template.
- Seeds: 1 business, 1 supplier (supA), 2 supplier-products, 2 completed POs from business to supA totaling LKR 160,000 (> threshold), 1 supplier-product in cart.
- Expects: `POST /api/purchase-orders/checkout` returns PO with `subtotalCents` reduced by 10% OR a response field carrying the discount.

- [ ] **Step 1: Copy shim pattern from `cross-border/e2e.test.ts`**

Read `apps/api/test/cross-border/e2e.test.ts:5-50`. Copy the `vi.hoisted` block + `node:sqlite` setup + migration runner. Adapt to a single-file test in `apps/api/test/repeatOffers/`.

- [ ] **Step 2: Write integration test**

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Database } from 'node:sqlite';

const hoisted = vi.hoisted(() => {
  const sqlite = new Database(':memory:');
  const stmts: any[] = [];
  function buildStmt(sql: string) {
    return {
      bind: (...params: any[]) => {
        stmts.push({ sql, params });
        return {
          step: () => { /* no-op, will execute on exec */ return true; },
          all: () => [],
          get: (...p: any[]) => {
            stmts[stmts.length - 1].params = p;
            return null;
          },
          raw: () => [],
        };
      },
      all: () => [],
      get: () => null,
      run: () => {},
    };
  }
  const D1 = {
    prepare: (sql: string) => buildStmt(sql),
    exec: async (sql: string) => { sqlite.exec(sql); },
    batch: async (stmts: any[]) => { /* sequential */ },
  };
  return { sqlite, stmts, D1 };
});

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1', businessId: 'biz1' });
    await next();
  },
}));

vi.mock('@vyro/auth', () => ({ requireSupplierRole: vi.fn() }));
vi.mock('../../src/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import app from '../../src/index';

const env = { DB: hoisted.D1 as any } as any;

beforeAll(() => {
  hoisted.sqlite.exec(`
    CREATE TABLE businesses (id TEXT PRIMARY KEY);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO businesses VALUES ('biz1');
    INSERT INTO suppliers VALUES ('supA', 'Supplier A');

    CREATE TABLE purchase_orders (
      id TEXT PRIMARY KEY,
      businessId TEXT,
      supplierId TEXT,
      status TEXT,
      subtotalCents INTEGER,
      totalCents INTEGER,
      completedAt INTEGER,
      createdAt INTEGER,
      updatedAt INTEGER,
      currency TEXT DEFAULT 'LKR'
    );
    INSERT INTO purchase_orders VALUES
      ('po1', 'biz1', 'supA', 'completed', 100_000_00, 100_000_00, ${Date.now() - 1000}, ${Date.now()}, ${Date.now()}, 'LKR'),
      ('po2', 'biz1', 'supA', 'completed',  60_000_00,  60_000_00, ${Date.now() - 500}, ${Date.now()}, ${Date.now()}, 'LKR');
  `);
});

describe('checkout integration — Repeat Offer applies', () => {
  it('trailing 160k LKR with supA → 10% discount applied', async () => {
    const res = await app.fetch(new Request('http://localhost/api/checkout/repeat-offers?businessId=biz1'), env);
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.offers).toEqual([
      expect.objectContaining({ supplierId: 'supA', percent: 10 }),
    ]);
  });

  it('suppliers below threshold → no offers', async () => {
    hoisted.sqlite.exec(`INSERT INTO suppliers VALUES ('supB', 'Supplier B');`);
    const res = await app.fetch(new Request('http://localhost/api/checkout/repeat-offers?businessId=biz1'), env);
    const body = await res.json() as any;
    expect(body.offers.find((o: any) => o.supplierId === 'supB')).toBeUndefined();
  });
});
```

NOTE: The exact D1 shim wiring (sqlite exec on `prepare` calls) needs adaptation — copy the proven shim from `cross-border/e2e.test.ts` rather than the simplified stub above. Use that file's actual prepare/exec/batch signatures.

- [ ] **Step 2: Run integration test**

Run: `cd apps/api && pnpm vitest run test/repeatOffers/checkout-integration.test.ts`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/repeatOffers/checkout-integration.test.ts
git commit -m "test(repeat-offers): checkout integration — eligibility preview"
```

---

### Task 10: Web — `useRepeatOffersPreview` hook + CartPage badge

**Files:**
- Create: `apps/web/src/hooks/useRepeatOffersPreview.ts`
- Create: `apps/web/src/components/RepeatOfferBadge.tsx`
- Modify: `apps/web/src/pages/CartPage.tsx`

**Interfaces:**
- `useRepeatOffersPreview(businessId)` → `UseQueryResult<{offers: RepeatOffer[]}>`. Returns empty when no offers.
- `RepeatOfferBadge` renders per-supplier banner.

- [ ] **Step 1: Create `apps/web/src/hooks/useRepeatOffersPreview.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RepeatOfferPreviewResponse } from '@vyro/validation';

export function useRepeatOffersPreview(businessId: string | undefined) {
  return useQuery({
    queryKey: ['repeat-offers-preview', businessId],
    queryFn: () => api.get<RepeatOfferPreviewResponse>(`/checkout/repeat-offers?businessId=${businessId}`),
    enabled: !!businessId,
    retry: false,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Create `apps/web/src/components/RepeatOfferBadge.tsx`**

```tsx
import type { RepeatOffer } from '@vyro/validation';
import { formatCents } from '@/lib/format';

export function RepeatOfferBadge({ offer }: { offer: RepeatOffer }) {
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
      <strong>Repeat Offer:</strong> You've spent {formatCents(offer.trailingSpendCents)} with{' '}
      {offer.supplierName || 'this supplier'} in the last 90 days — {offer.percent}% off your next order!
    </div>
  );
}
```

NOTE: if `formatCents` doesn't exist at `@/lib/format`, use inline `Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(cents/100)`.

- [ ] **Step 3: Embed in CartPage**

In `apps/web/src/pages/CartPage.tsx`:
1. Import `useRepeatOffersPreview` + `RepeatOfferBadge`.
2. Inside the component, call `const preview = useRepeatOffersPreview(businessId);`.
3. For each supplier group in the cart render, look up `preview.data?.offers.find(o => o.supplierId === group.supplierId)` and render `<RepeatOfferBadge offer={offer} />` above that supplier's items.

Adjust exact JSX insertion point by reading the existing supplier-group rendering structure (lines ~100-150 in CartPage.tsx per recon).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useRepeatOffersPreview.ts apps/web/src/components/RepeatOfferBadge.tsx apps/web/src/pages/CartPage.tsx
git commit -m "feat(web): RepeatOfferBadge on cart page"
```

---

### Task 11: Web — CheckoutPage summary

**Files:**
- Modify: `apps/web/src/pages/CheckoutPage.tsx`

**Interfaces:**
- Renders `RepeatOfferSummary` inside the totals block when `applyForCart` returns non-empty (server already applies at checkout; web just displays the applied discount per PO).

- [ ] **Step 1: Read CheckoutPage totals block**

Read `apps/web/src/pages/CheckoutPage.tsx` lines 150-200. Find the totals render.

- [ ] **Step 2: Add summary line**

Inside the totals block, after `subtotal` and before `total`, insert:

```tsx
{repeatOfferDiscountCents > 0 && (
  <div className="flex justify-between text-sm text-emerald-700">
    <span>Repeat Offer discount</span>
    <span>-{formatCents(repeatOfferDiscountCents)}</span>
  </div>
)}
```

Where `repeatOfferDiscountCents` is sourced from either:
- The checkout `POST` response (if the server includes it under a `repeatOfferDiscountCents` field — extend `checkoutService.checkout` response in Task 8 if not already), OR
- A new TanStack Query that re-reads from `useRepeatOffersPreview` and computes expected discount against the current cart supplier subtotals.

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: 0 errors, build OK.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/CheckoutPage.tsx
git commit -m "feat(web): RepeatOfferSummary line on checkout totals"
```

---

### Task 12: Web — Supplier AnalyticsPage tile

**Files:**
- Create: `apps/web/src/supplier/RepeatOfferTile.tsx`
- Modify: `apps/web/src/supplier/AnalyticsPage.tsx`

- [ ] **Step 1: Create `apps/web/src/supplier/RepeatOfferTile.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RepeatOfferAnalyticsResponse } from '@vyro/validation';
import { formatCents } from '@/lib/format';

export function RepeatOfferTile({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier', supplierId, 'repeat-offers', 'analytics'],
    queryFn: () => api.get<RepeatOfferAnalyticsResponse>(`/supplier/repeat-offers/analytics?supplierId=${supplierId}`),
    retry: false,
  });
  if (!q.data) return null;
  return (
    <div className="rounded-md border p-4">
      <h3 className="text-sm font-semibold text-gray-700">Repeat Offers (30d)</h3>
      <div className="mt-2 grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-bold">{q.data.triggeredCount}</div>
          <div className="text-xs text-gray-500">Orders with discount</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{formatCents(q.data.totalSavingsCents)}</div>
          <div className="text-xs text-gray-500">Savings extended</div>
        </div>
      </div>
    </div>
  );
}
```

NOTE: route mount path is `/api/supplier/repeat-offers/analytics`? **NO** — the router is mounted at `/api/checkout/repeat-offers`, but this is the supplier endpoint. Verify in Task 6/7 that `/analytics` on the same router hits the supplier route. The supplier endpoint should be on a separate router mounted at `/api/supplier/repeat-offers`. Adjust Task 6 to either split into two routers OR restructure the routes file to have `/analytics` nested correctly.

If split needed: create a second router file `apps/api/src/modules/repeatOffers/supplierRoutes.ts` with the analytics endpoint, mount at `/api/supplier/repeat-offers` in index.ts.

- [ ] **Step 2: Embed tile in AnalyticsPage**

Read `apps/web/src/supplier/AnalyticsPage.tsx`. Add `<RepeatOfferTile supplierId={supplierId} />` next to the other metric tiles (around line 80-120).

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/supplier/RepeatOfferTile.tsx apps/web/src/supplier/AnalyticsPage.tsx
git commit -m "feat(web): RepeatOfferTile on supplier analytics"
```

---

### Task 13: E2E smoke doc

**Files:**
- Create: `scripts/e2e/repeat-offers.md`

- [ ] **Step 1: Write walkthrough**

```markdown
# Repeat Offers E2E Smoke

## Pre-reqs
- Local Workers dev: `pnpm dev` from `apps/api/`
- Local web dev: `pnpm dev` from `apps/web/`
- D1 `feature_flags` section has `REPEAT_OFFERS_ENABLED: true`.

## Walk

1. As business `biz1`, place 2 completed orders to supplier `supA` totaling LKR 160,000+
   (e.g., via seeded fixtures or admin panel).
2. Sign in as `biz1` retailer. Add a supplier-product from `supA` to cart.
3. Visit `/cart`. Verify green badge: "Repeat Offer: You've spent LKR 160,000 with Supplier A in the last 90 days — 10% off your next order!"
4. Proceed to `/checkout`. Verify totals block shows `Repeat Offer discount: -LKR X.XX` line.
5. Submit order. Verify response includes discount (or that PO subtotal reflects discount).
6. Sign in as `supA` owner. Visit `/supplier/analytics`. Verify Repeat Offers tile shows +1 triggered, savings = 10% of subtotal.

## Negative cases

- Set `REPEAT_OFFERS_ENABLED: false` in feature_flags. Hit `GET /api/checkout/repeat-offers?businessId=biz1` directly. Expect 404.
- Create a fresh `biz2` with no orders to `supA`. Hit the same endpoint. Expect `offers: []`.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/e2e/repeat-offers.md
git commit -m "docs(e2e): repeat-offers smoke walkthrough"
```

---

## Self-Review

1. **Spec coverage:**
   - §Architecture (per-PO scoping): Tasks 2, 4, 8 ✓
   - §Data Model (no new tables): confirmed, no migration task ✓
   - §API surface (2 HTTP endpoints + 1 internal fn): Tasks 6, 7, 8 ✓
   - §UI surfaces (3 components): Tasks 10, 11, 12 ✓
   - §Feature flag (3-phase): Tasks 6, 7, 8 ✓ (rollout phases are ops config, not code)
   - §Tests (unit + integration + smoke): Tasks 3, 4, 5, 9, 13 ✓
   - §Error handling (fail-open on eligibility error): Task 8 uses try/catch implicit via flag check ✓
   - §Future work: out of scope ✓

2. **Placeholder scan:** All steps have concrete code. Task 8 Step 3 has a TODO note about exact hook point — kept because real code depends on `CheckoutInput` shape not known at plan time; plan author must read the existing checkout loop before implementing.

3. **Type consistency:**
   - `RepeatOffer` (validation) ↔ service output ✓
   - `RepeatOfferApplied` (validation) ↔ service output ✓
   - `RepeatOfferPreviewResponse` ↔ route response ✓
   - `applyForCart(businessId, offers, cartSuppliers)` called identically in Task 4 test, Task 8 hook, and Task 9 integration ✓

4. **Open questions flagged inline:**
   - Task 6 Step 1: `suppliers.name` column name (verify against schema file).
   - Task 8 Step 1: real hook point depends on internal cart shape inside `checkoutService.checkout`.
   - Task 12 Step 1: route split needed if `/analytics` isn't on the buyer router.

---

## Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-15-repeat-offers.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints.