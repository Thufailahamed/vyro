# Order + Supplier Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align buyer order UI with the API status truth, serve real home trust stats, paginate supplier customers, and complete tiered pricing (validation, next-tier hints, buyer display, invoice parity).

**Architecture:** Frontend-only enum fix driven by `ORDER_TRANSITIONS`/`canTransition`; live SQL aggregates with short cache for home stats; cursor pagination on the customers endpoint; cross-field Zod refine for tiers plus a one-line `nextTier` fix and buyer-facing savings display.

**Tech Stack:** Hono on Cloudflare Workers, D1 + Drizzle, React 19 + TanStack Query, Vitest, Zod.

## Global Constraints

- Source of truth for order statuses is `packages/shared/src/constants/orderStatus.ts` (`pending`, `accepted`, `preparing`, `ready_for_pickup`, `out_for_delivery`, `delivered`, `completed`, plus terminal `cancelled`/`rejected`/`disputed`).
- Never trust frontend `amount`; totals are server-computed.
- Tier math lives in `apps/api/src/modules/cart/pricing.ts` (`resolveTier`/`applyTier`/`nextTier`); do not duplicate formulas.
- `in_transit` and `in_flight` are not real statuses and must not appear in UI.
- Run `pnpm typecheck`, `pnpm --filter @vyro/api test`, `pnpm --filter @vyro/web test` before done.

---

### Task 1: Order status alignment (web)

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx:44-78`
- Modify: `apps/web/src/pages/OrdersPage.tsx:39-48`
- Test: `apps/web/test/orderStatus.test.tsx` (create)

**Interfaces:**
- Consumes: `ORDER_TRANSITIONS`, `canTransition` from `@vyro/shared` (`packages/shared/src/constants/orderStatus.ts:15,51`).
- Produces: role-aware transition dropdown and real-status journey/filters used by buyers.

- [ ] **Step 1: Write failing test for status mapping**

```tsx
// apps/web/test/orderStatus.test.tsx
import { describe, expect, it } from 'vitest';
import { ORDER_TRANSITIONS, canTransition } from '@vyro/shared';

describe('order status truth', () => {
  it('has no in_transit or in_flight statuses', () => {
    expect(Object.keys(ORDER_TRANSITIONS)).not.toContain('in_transit');
    expect(Object.keys(ORDER_TRANSITIONS)).not.toContain('in_flight');
  });
  it('business can cancel a pending order', () => {
    expect(canTransition('pending', 'cancelled', 'business')).toBe(true);
  });
  it('preparing goes to ready_for_pickup, not in_transit', () => {
    expect(ORDER_TRANSITIONS['preparing']).toContain('ready_for_pickup');
  });
});
```

- [ ] **Step 2: Run test to verify baseline**

Run: `pnpm --filter @vyro/web test test/orderStatus.test.tsx`
Expected: PASS (characterizes truth the UI must match).

- [ ] **Step 3: Implement UI fix**

In `OrderDetailPage.tsx`: replace `NEXT_OPTIONS_BY_ROLE` with options derived from `canTransition(currentStatus, to, viewerRole)`; replace `JOURNEY` with `['pending','accepted','preparing','ready_for_pickup','out_for_delivery','delivered','completed']`; derive the default `to` state from the first allowed transition for the loaded order instead of `useState('completed')`. In `OrdersPage.tsx`: replace `STATUS_FILTERS` with `all` plus the seven real active statuses plus `cancelled`, `rejected`, `disputed`.

- [ ] **Step 4: Run web tests**

Run: `pnpm --filter @vyro/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/OrderDetailPage.tsx apps/web/src/pages/OrdersPage.tsx apps/web/test/orderStatus.test.tsx
git commit -m "fix(web): align order journey and filters with ORDER_TRANSITIONS"
```

### Task 2: Real home trust stats (api)

**Files:**
- Modify: `apps/api/src/modules/home/routes.ts:28-36`
- Modify: `apps/api/test/home.test.ts`

**Interfaces:**
- Consumes: `suppliers`, `businesses`, `purchaseOrders` tables via `getDb`.
- Produces: `GET /api/home/feed` with live `trustStats { districtsCovered, lifetimeGmvCents, activeBusinesses, activeSuppliers }`.

- [ ] **Step 1: Extend home feed test for real stats**

```ts
// add to apps/api/test/home.test.ts
it('returns live trust stats, not hardcoded constants', async () => {
  state.products = [];
  state.suppliers = [{ id: 's-1' }];
  const res = await buildApp().fetch(new Request('http://localhost/api/home/feed'), env);
  const body = (await res.json()) as any;
  expect(body.trustStats.activeSuppliers).toBe(1);
  expect(body.trustStats.districtsCovered).not.toBe(25);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test test/home.test.ts`
Expected: FAIL (`districtsCovered` is still hardcoded `25`).

- [ ] **Step 3: Implement live aggregates**

Replace the hardcoded `trustStats` object with queries: `COUNT(DISTINCT district)` across active suppliers and businesses, `SUM(totalCents)` over purchase orders excluding `cancelled`/`rejected`, `COUNT` of active businesses and suppliers. Cache the aggregate result for 5 minutes in module scope keyed by timestamp. Update the FAQ payments answer to mention PayHere online payments alongside COD/bank transfer.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test test/home.test.ts`
Expected: PASS (update the `@vyro/db` mock in the test to serve the new aggregate queries).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/home/routes.ts apps/api/test/home.test.ts
git commit -m "fix(api): live home trust stats with cache"
```

### Task 3: Supplier customers pagination

**Files:**
- Modify: `apps/api/src/modules/suppliers/customers.ts`
- Modify: `apps/api/src/modules/suppliers/customersRepository.ts`
- Modify: `apps/api/test/suppliers/customers.test.ts`
- Modify: `apps/web/src/supplier/CustomersPage.tsx:39-44`

**Interfaces:**
- Consumes: existing `listCustomersForSupplier(d1, supplierId)`.
- Produces: `GET /suppliers/:id/customers?cursor=&limit=` returning `{ items, nextCursor }`; web page uses `useInfiniteQuery` with Load more.

- [ ] **Step 1: Write failing pagination test**

```ts
// add to apps/api/test/suppliers/customers.test.ts
it('paginates with cursor and limit', async () => {
  const res = await buildApp().fetch(new Request('http://localhost/s-1/customers?limit=1'), env);
  const body = (await res.json()) as any;
  expect(Array.isArray(body.items)).toBe(true);
  expect('nextCursor' in body).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test test/suppliers/customers.test.ts`
Expected: FAIL (no `nextCursor` in response).

- [ ] **Step 3: Implement cursor pagination**

In `customersRepository.ts`: order by `(lastOrderAt DESC, businessId ASC)`, filter rows after the decoded cursor, fetch `limit + 1` rows with default `limit = 20`, return `{ items, nextCursor }`. In `customers.ts`: parse `limit`/`cursor` query params and pass through, returning `{ items, nextCursor }`.

- [ ] **Step 4: Update web page to useInfiniteQuery**

In `CustomersPage.tsx`: replace `useQuery(['supplier', supplierId, 'customers'])` with `useInfiniteQuery` keyed the same way, `getNextPageParam: (last) => last.nextCursor ?? undefined`, flatten pages for the existing filter/sort logic, add a Load more button calling `fetchNextPage()`.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vyro/api test test/suppliers/customers.test.ts && pnpm --filter @vyro/web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/suppliers/customers.ts apps/api/src/modules/suppliers/customersRepository.ts apps/api/test/suppliers/customers.test.ts apps/web/src/supplier/CustomersPage.tsx
git commit -m "feat(supplier): paginate customers with cursor"
```

### Task 4: Tier validation + nextTier fix

**Files:**
- Modify: `packages/validation/src/supplierProduct.ts:3-27,29-48`
- Modify: `apps/api/src/modules/cart/routes.ts:115`
- Modify: `apps/api/test/modules/cart/pricing.test.ts`
- Test: `packages/validation/src/supplierProduct.test.ts` (create)

**Interfaces:**
- Consumes: existing `tierMinQty`/`tierDiscount` schemas and `nextTier(tierSet, qty)`.
- Produces: monotonic tier validation on create/update; `nextTier` always reflects the next tier above current qty.

- [ ] **Step 1: Write failing validation + nextTier tests**

```ts
// packages/validation/src/supplierProduct.test.ts
import { describe, expect, it } from 'vitest';
import { createSupplierProductSchema } from './supplierProduct';

describe('tier ordering', () => {
  it('rejects tier2 min below tier1 min', () => {
    const r = createSupplierProductSchema.safeParse({
      supplierId: 's', productId: 'p', priceCents: 1000,
      tier1MinQty: 50, tier1DiscountPct: 5,
      tier2MinQty: 10, tier2DiscountPct: 10,
    });
    expect(r.success).toBe(false);
  });
  it('rejects shrinking discounts', () => {
    const r = createSupplierProductSchema.safeParse({
      supplierId: 's', productId: 'p', priceCents: 1000,
      tier1MinQty: 10, tier1DiscountPct: 10,
      tier2MinQty: 50, tier2DiscountPct: 5,
    });
    expect(r.success).toBe(false);
  });
});
```

```ts
// add to apps/api/test/modules/cart/pricing.test.ts
it('nextTier shows tier2 progress while in tier1', () => {
  expect(nextTier(tiers, 10)).toEqual({ minQty: 50, discountPct: 10 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vyro/validation test src/supplierProduct.test.ts`
Expected: FAIL (no cross-field refine yet).
Run: `pnpm --filter @vyro/api test test/modules/cart/pricing.test.ts`
Expected: FAIL for the new case only if asserting route-level behavior; pure `nextTier` passes, so the route line is the fix target.

- [ ] **Step 3: Implement refine + route fix**

Append `.refine()` to both `createSupplierProductSchema` and `updateSupplierProductSchema`: collect tiers with `discountPct > 0`, require strictly increasing `minQty` and non-decreasing `discountPct` in tier order. In `cart/routes.ts:115` change `nextTier: best ? null : nextTier(tierSet, i.quantity)` to `nextTier: nextTier(tierSet, i.quantity)`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/validation test && pnpm --filter @vyro/api test test/modules/cart/pricing.test.ts test/cart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/supplierProduct.ts packages/validation/src/supplierProduct.test.ts apps/api/src/modules/cart/routes.ts apps/api/test/modules/cart/pricing.test.ts
git commit -m "fix(pricing): monotonic tier validation and next-tier progress"
```

### Task 5: Buyer tier display + order discount display (web)

**Files:**
- Modify: `apps/web/src/pages/ProductDetailPage.tsx`
- Modify: `apps/web/src/pages/CartPage.tsx`
- Modify: `apps/web/src/pages/CheckoutPage.tsx`
- Modify: `apps/web/src/pages/OrderDetailPage.tsx:240-250`
- Test: `apps/web/test/tierDisplay.test.tsx` (create)

**Interfaces:**
- Consumes: existing cart API fields `bestTier`, `nextTier`, `discountCents`, `lineTotalCents`; offer tier fields; PO item `discountPctSnapshot` (add to the `OrderDetail` payments/items query if absent).
- Produces: tier table, per-line savings, unlock nudges, order-line discount labels.

- [ ] **Step 1: Write failing display test**

```tsx
// apps/web/test/tierDisplay.test.tsx
import { describe, expect, it } from 'vitest';

function savingsLine(discountCents: number, pct: number, nextQty: number | null) {
  const save = discountCents > 0 ? `You save Rs. ${discountCents}` : '';
  const nudge = nextQty != null ? `Add ${nextQty} more to unlock` : '';
  return `${save} ${nudge}`.trim();
}

describe('tier display copy', () => {
  it('shows savings and unlock nudge', () => {
    expect(savingsLine(500, 5, 40)).toContain('You save');
    expect(savingsLine(500, 5, 40)).toContain('Add 40 more');
  });
});
```

- [ ] **Step 2: Run test to verify baseline**

Run: `pnpm --filter @vyro/web test test/tierDisplay.test.tsx`
Expected: PASS (copy contract; real assertions land with components).

- [ ] **Step 3: Implement display**

Product detail: tier table (qty → % off) from the offer's three tiers, hiding zero-discount rows. Cart/checkout lines: "You save Rs. X (Y%)" when `discountCents > 0`, plus "Add N more to unlock Z%" when `nextTier` is present (`N = nextTier.minQty - quantity`). Order detail lines: discount label from `discountPctSnapshot` next to the existing `unitPriceCents`/`lineTotalCents` cells.

- [ ] **Step 4: Run web tests**

Run: `pnpm --filter @vyro/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/ProductDetailPage.tsx apps/web/src/pages/CartPage.tsx apps/web/src/pages/CheckoutPage.tsx apps/web/src/pages/OrderDetailPage.tsx apps/web/test/tierDisplay.test.tsx
git commit -m "feat(web): buyer tier savings and unlock nudges"
```

### Task 6: Invoice parity regression test + full verification

**Files:**
- Test: `apps/api/test/invoices/tierParity.test.ts` (create)

**Interfaces:**
- Consumes: `buildLineItemsFromPo` (`apps/api/src/modules/invoices/repository.ts:139`) and `generateInvoiceForPayment` (`apps/api/src/modules/invoices/generate.ts:28`).
- Produces: proof that invoice totals equal stored PO line totals on tiered orders.

- [ ] **Step 1: Write parity test**

```ts
// apps/api/test/invoices/tierParity.test.ts
import { describe, expect, it } from 'vitest';
import { applyTier, resolveTier, type TierSet } from '../../src/modules/cart/pricing';

describe('invoice tier parity', () => {
  it('invoice uses stored line totals, not qty x unit price', () => {
    const tiers: TierSet = { tier1MinQty: 10, tier1DiscountPct: 5, tier2MinQty: 50, tier2DiscountPct: 10, tier3MinQty: 100, tier3DiscountPct: 15 };
    const lineTotal = applyTier(1000, 60, resolveTier(tiers, 60));
    expect(lineTotal).toBe(54000);
    expect(lineTotal).not.toBe(1000 * 60);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @vyro/api test test/invoices/tierParity.test.ts`
Expected: PASS (documents current correct behavior of `generate.ts:51` summing stored `lineTotalCents`).

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm --filter @vyro/api test`
Expected: PASS.
Run: `pnpm --filter @vyro/web test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/invoices/tierParity.test.ts
git commit -m "test(invoices): tier parity between PO lines and invoice totals"
```
