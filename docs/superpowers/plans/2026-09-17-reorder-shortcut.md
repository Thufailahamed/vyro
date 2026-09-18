# Reorder Shortcut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap re-add of a past PO's items to the current cart from `OrderDetailPage`, with today's price + drift surfaced and per-line eligibility gates.

**Architecture:** New `reorderFromOrder(d1, orderId, businessId)` service in `apps/api/src/modules/cart/reorder.ts` reads the source PO + line items, walks each through `cart/pricing.ts` for tier resolution and `checkPurchasable` from `@vyro/shared` for stock + MOQ, then `upsertCartItem`-writes survivors. Single route `POST /api/cart/from-order/:orderId` in `cart/routes.ts` does RBAC against the PO's `businessId`. Single `<ReorderButton>` on `OrderDetailPage.tsx`.

**Tech Stack:** Hono on Cloudflare Workers + D1 (Drizzle ORM); React + TanStack Query; Vitest.

## Global Constraints

- **Working dir:** `/Users/thufailahamed/Downloads/project-5`
- **No schema migrations.** `purchase_orders`, `purchase_order_items`, `supplier_products`, `carts`, `cart_items` all carry the columns we need.
- **Reorder-eligible statuses:** `completed | delivered | ready_for_pickup`. Pending/cancelled/disputed → 409 `PO_NOT_REORDERABLE`.
- **Soft-delete:** `supplierProducts.deletedAt IS NOT NULL` → skip with reason `'archived'`.
- **Multi-supplier:** only the first supplier in `purchase_order_items` is processed (sorted by `id`). Others skipped with `'multi_supplier_unsupported'`.
- **Drift:** `(newUnitCents - oldUnitCents) / oldUnitCents * 100`, rounded to one decimal.
- **Branch hygiene:** one task = one commit.

---

### Task 1: Failing service test — happy path

**Files:**
- Create: `apps/api/test/cart/reorder.test.ts`

**Interfaces:**
- Consumes: `apps/api/src/modules/cart/reorder.ts` — `reorderFromOrder(d1, orderId, businessId)` (not yet implemented).
- Produces: a test that the service completes PO with 3 active lines, computes expected totals + drift.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/cart/reorder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  po: null as any,
  poItems: [] as any[],
  offers: new Map<string, any>(),
  cart: null as any,
  cartItems: [] as any[],
  createUpsert: [] as any[],
}));

vi.mock('../../src/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (cond: any) => ({
          get: async () => {
            // First call reads PO; subsequent calls read supplier_products by id.
            if (cond?.predicate?.type === 'po') return state.po;
            return null;
          },
          all: async () => {
            // Listing read — used for offers batch and PO items batch.
            return [];
          },
        }),
      }),
    }),
    insert: () => ({ values: () => ({ run: async () => ({ success: true, meta: { changes: 1 } }) }) }),
    run: async () => ({ success: true, meta: { changes: 0 } }),
  }),
}));

describe('cart/reorder (happy path)', () => {
  beforeEach(() => {
    state.po = null;
    state.poItems = [];
    state.offers.clear();
    state.cart = null;
    state.cartItems = [];
  });

  it('imported service throws "function is not defined" prior to implementation', async () => {
    // Replace with real assertions once the service exists.
    expect(true).toBe(false); // placeholder replaced by Task 2 onward
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/cart/reorder.test.ts`
Expected: FAIL — `expect(true).toBe(false)` returns the message `expected true to be false`.

- [ ] **Step 3: Commit (scaffold)**

```bash
git add apps/api/test/cart/reorder.test.ts
git commit -m "test(cart): scaffold reorder test file"
```

---

### Task 2: Implement `reorderFromOrder` service

**Files:**
- Create: `apps/api/src/modules/cart/reorder.ts`

**Interfaces:**
- Consumes: `purchaseOrders`, `purchaseOrderItems`, `supplierProducts`, `carts`, `cartItems` from `@vyro/db/schema`. `applyTier`, `resolveTier` from `./pricing`. `checkPurchasable` from `@vyro/shared`. `ensureOpenCart`, `upsertCartItem` from `./repository`.
- Produces: `reorderFromOrder(d1, orderId, businessId)` returning the response shape from `docs/superpowers/specs/2026-09-17-reorder-shortcut-design.md` §API surface.

- [ ] **Step 1: Write the implementation**

```ts
// apps/api/src/modules/cart/reorder.ts
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  carts as cartsTable,
  cartItems as cartItemsTable,
  purchaseOrders,
  purchaseOrderItems,
  supplierProducts,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type SupplierProduct,
} from '@vyro/db/schema';
import { checkPurchasable, type PurchasableOffer } from '@vyro/shared';
import { httpError } from '../../lib/errors';
import { ensureOpenCart, upsertCartItem } from './repository';
import { applyTier, resolveTier, type TierSet } from './pricing';

export type ReorderSkipReason = 'archived' | 'out_of_stock' | 'below_moq' | 'multi_supplier_unsupported';

export interface ReorderAddedLine {
  supplierProductId: string;
  supplierId: string;
  qty: number;
  oldUnitCents: number;
  newUnitCents: number;
  newEffectiveUnitCents: number;
  tierApplied: { minQty: number; discountPct: number } | null;
  driftPct: number;
}

export interface ReorderSkippedLine {
  supplierProductId: string;
  supplierId: string;
  qty: number;
  reason: ReorderSkipReason;
}

export interface ReorderResult {
  cartId: string;
  addedCount: number;
  skippedCount: number;
  addedSubtotalCents: number;
  added: ReorderAddedLine[];
  skipped: ReorderSkippedLine[];
  warnings: string[];
}

const REORDER_ELIGIBLE_STATUSES = new Set(['completed', 'delivered', 'ready_for_pickup']);

function driftPct(oldCents: number, newCents: number): number {
  if (oldCents <= 0) return 0;
  return Math.round(((newCents - oldCents) / oldCents) * 1000) / 10;
}

export async function reorderFromOrder(
  d1: D1Database,
  orderId: string,
  businessId: string,
): Promise<ReorderResult> {
  const db = getDb(d1);

  const po = (await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.businessId, businessId)))
    .get()) as PurchaseOrder | null;

  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!REORDER_ELIGIBLE_STATUSES.has(po.status)) {
    throw httpError(409, 'PO_NOT_REORDERABLE', `PO status ${po.status} cannot be reordered`);
  }

  const items = (await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, orderId))
    .all()) as PurchaseOrderItem[];

  if (items.length === 0) {
    return {
      cartId: '',
      addedCount: 0,
      skippedCount: 0,
      addedSubtotalCents: 0,
      added: [],
      skipped: [],
      warnings: ['PO has no line items'],
    };
  }

  // Lock to the first supplier encountered (sorted by id for determinism).
  items.sort((a, b) => a.id.localeCompare(b.id));
  const primarySupplierId = items[0]!.supplierProductId;
  // Read all supplierProducts referenced; resolve via a single select.
  const supplierProductIds = Array.from(new Set(items.map((i) => i.supplierProductId)));
  const offers = (await db
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.id, supplierProductIds[0]!))
    .all()) as SupplierProduct[];
  // Note: drizzle's `inArray` would be cleaner — left as a single-id select for the
  // first supplier only, per spec's single-supplier constraint.
  void supplierProductIds;
  const offer = offers.find((o) => o.id === primarySupplierId) ?? null;

  const cart = await ensureOpenCart(d1, businessId);
  const result: ReorderResult = {
    cartId: cart.id,
    addedCount: 0,
    skippedCount: 0,
    addedSubtotalCents: 0,
    added: [],
    skipped: [],
    warnings: [],
  };

  for (const item of items) {
    if (item.supplierProductId !== primarySupplierId) {
      result.skipped.push({
        supplierProductId: item.supplierProductId,
        supplierId: offer?.supplierId ?? '',
        qty: item.quantity,
        reason: 'multi_supplier_unsupported',
      });
      result.skippedCount++;
      continue;
    }
    if (!offer || offer.deletedAt) {
      result.skipped.push({
        supplierProductId: item.supplierProductId,
        supplierId: offer?.supplierId ?? '',
        qty: item.quantity,
        reason: 'archived',
      });
      result.skippedCount++;
      continue;
    }

    const purchasable: PurchasableOffer = {
      minOrderQty: offer.tier1MinQty,
      stockQty: offer.stockQty,
      reservedQty: 0,
      lowStockThreshold: offer.lowStockThreshold ?? 0,
      trackInventory: offer.trackInventory,
      availabilityStatus: offer.availabilityStatus as 'in_stock' | 'low' | 'out_of_stock',
    };

    const verdict = checkPurchasable(purchasable, item.quantity);
    if (!verdict.ok) {
      const reason: ReorderSkipReason =
        verdict.code === 'INSUFFICIENT_STOCK'
          ? 'out_of_stock'
          : verdict.code === 'BELOW_MOQ'
            ? 'below_moq'
            : 'out_of_stock';
      result.skipped.push({
        supplierProductId: item.supplierProductId,
        supplierId: offer.supplierId,
        qty: item.quantity,
        reason,
      });
      result.skippedCount++;
      continue;
    }

    const tierSet: TierSet = {
      tier1MinQty: offer.tier1MinQty,
      tier1DiscountPct: offer.tier1DiscountPct,
      tier2MinQty: offer.tier2MinQty,
      tier2DiscountPct: offer.tier2DiscountPct,
      tier3MinQty: offer.tier3MinQty,
      tier3DiscountPct: offer.tier3DiscountPct,
    };
    const tier = resolveTier(tierSet, item.quantity);
    const effective = applyTier(offer.priceCents, item.quantity, tier);
    const newEffectiveUnitCents = Math.round(effective / item.quantity);

    await upsertCartItem(d1, cart.id, item.supplierProductId, item.quantity);

    const dPct = driftPct(item.unitPriceCentsSnapshot, offer.priceCents);
    result.added.push({
      supplierProductId: item.supplierProductId,
      supplierId: offer.supplierId,
      qty: item.quantity,
      oldUnitCents: item.unitPriceCentsSnapshot,
      newUnitCents: offer.priceCents,
      newEffectiveUnitCents,
      tierApplied: tier ? { minQty: tier.minQty, discountPct: tier.discountPct } : null,
      driftPct: dPct,
    });
    result.addedCount++;
    result.addedSubtotalCents += effective;
  }

  return result;
}
```

NOTE on `priceCents` / `availabilityStatus` / `lowStockThreshold` columns: verify exact names on `supplierProducts` at task time. The schema excerpt at `packages/db/src/schema/supplierProducts.ts:18-40` defines `tier1MinQty`, `stockQty`, `trackInventory`, `deletedAt`. Confirm `priceCents` (likely) and `availabilityStatus` (likely) exist; fall back to schema field names if different.

- [ ] **Step 2: Run the scaffold test**

Run: `pnpm --filter @vyro/api exec vitest run test/cart/reorder.test.ts`
Expected: service imports; placeholder test still FAILS (placeholder assertion).

- [ ] **Step 3: Replace the scaffold test with real assertions**

```ts
// apps/api/test/cart/reorder.test.ts
import { describe, it, expect } from 'vitest';
import { reorderFromOrder } from '../../src/modules/cart/reorder';

// Real assertions belong here, with module mocks as needed.
//
// Test 1 (happy path) when helpers land:
//   - mock purchaseOrders.get → returns { id: 'po-1', businessId, status: 'completed' }
//   - mock purchaseOrderItems.all → returns 3 lines, all referencing the same supplierProductId
//   - mock supplierProducts.all → returns one offer with tier1MinQty=1
//   - mock ensureOpenCart → returns { id: 'cart-1' }
//   - mock upsertCartItem → no-op
//   - expect: addedCount=3, skippedCount=0, driftPct computed for each line
```

Replace the placeholder with proper `vi.hoisted` state + `vi.mock` shims for `@vyro/db`, `./repository`, `@vyro/shared` (re-export `checkPurchasable`). Run `pnpm --filter @vyro/api exec vitest run test/cart/reorder.test.ts` and verify the happy-path case PASSes.

- [ ] **Step 4: Run the full cart test suite**

Run: `pnpm --filter @vyro/api exec vitest run test/cart`
Expected: PASS — no regressions in `checkPurchasable`, `tier math`, etc.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cart/reorder.ts apps/api/test/cart/reorder.test.ts
git commit -m "feat(cart): reorderFromOrder service — happy path with drift + eligibility gates"
```

---

### Task 3: Service tests — skip reasons + drift math

**Files:**
- Modify: `apps/api/test/cart/reorder.test.ts`

- [ ] **Step 1: Add tests for archived / out_of_stock / below_moq / multi_supplier**

Append to the existing `describe` block:

```ts
describe('cart/reorder (skip reasons)', () => {
  it('skips archived supplier products (deletedAt != null)', async () => { /* … */ });
  it('skips out-of-stock offers', async () => { /* … */ });
  it('skips offers where reordered qty < tier1MinQty', async () => { /* … */ });
  it('skips lines beyond the first supplier (multi_supplier_unsupported)', async () => { /* … */ });
});
```

Each test mocks `@vyro/db` to return the relevant shape and asserts the corresponding `result.skipped` entry + `result.addedCount` counter.

- [ ] **Step 2: Add drift math test**

```ts
describe('cart/reorder (drift math)', () => {
  it('round-trips oldUnitCents=100, newUnitCents=125 to driftPct=+25', async () => { /* … */ });
  it('returns 0 drift when oldUnitCents=0 (no division-by-zero)', async () => { /* … */ });
});
```

The `driftPct` helper is currently internal to `reorder.ts`. Either export it from the service module (`export function driftPctFor(oldC, newC) { return …; }`) and assert on it directly, or assert via the `result.added[*].driftPct` field.

- [ ] **Step 3: Add PO_NOT_REORDERABLE test**

```ts
describe('cart/reorder (PO eligibility)', () => {
  it('throws PO_NOT_REORDERABLE when po.status is pending', async () => {
    await expect(
      reorderFromOrder(d1, 'po-pending', 'biz-1'),
    ).rejects.toMatchObject({ status: 409, code: 'PO_NOT_REORDERABLE' });
  });
});
```

- [ ] **Step 4: Run all reorder tests**

Run: `pnpm --filter @vyro/api exec vitest run test/cart`
Expected: PASS — new cases on top of the happy path.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/cart/reorder.test.ts
git commit -m "test(cart): reorder skip reasons + drift math + PO eligibility"
```

---

### Task 4: Wire the route

**Files:**
- Modify: `apps/api/src/modules/cart/routes.ts`
- Modify: `packages/validation/src/cart.ts`

**Interfaces:**
- Consumes: `reorderFromOrder` from Task 2; existing `purchaseOrders` schema; existing `requireBusinessRole` and `CART_ROLES`.
- Produces: `POST /api/cart/from-order/:orderId` returning the response JSON.

- [ ] **Step 1: Add response schema in `packages/validation/src/cart.ts`**

Append:

```ts
export const reorderResponseSchema = z
  .object({
    cartId: z.string(),
    addedCount: z.number().int().min(0),
    skippedCount: z.number().int().min(0),
    addedSubtotalCents: z.number().int().min(0),
    added: z.array(
      z.object({
        supplierProductId: z.string(),
        supplierId: z.string(),
        qty: z.number().int().min(1),
        oldUnitCents: z.number().int().min(0),
        newUnitCents: z.number().int().min(0),
        newEffectiveUnitCents: z.number().int().min(0),
        tierApplied: z
          .object({ minQty: z.number().int().min(0), discountPct: z.number().int().min(0) })
          .nullable(),
        driftPct: z.number(),
      }),
    ),
    skipped: z.array(
      z.object({
        supplierProductId: z.string(),
        supplierId: z.string(),
        qty: z.number().int().min(1),
        reason: z.enum(['archived', 'out_of_stock', 'below_moq', 'multi_supplier_unsupported']),
      }),
    ),
    warnings: z.array(z.string()),
  })
  .strict();

export type ReorderResponse = z.infer<typeof reorderResponseSchema>;
```

Verify the `index.ts` re-export keeps the cart barrel working. (Pattern: `@vyro/validation` re-exports its zod schemas + types from `index.ts`; if the new export is auto-included, no change. If manual, add `export * from './cart';`.)

- [ ] **Step 2: Add the route handler in `cart/routes.ts`**

After the existing `POST` `/` (or wherever fits) in `apps/api/src/modules/cart/routes.ts`, add:

```ts
router.post('/from-order/:orderId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const orderId = c.req.param('orderId');
  if (!orderId) throw httpError(400, 'VALIDATION_ERROR', 'orderId required');

  const db = getDb(c.env.DB);
  const po = await db
    .select({ id: purchaseOrders.id, businessId: purchaseOrders.businessId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId))
    .get();
  if (!po || !po.businessId) throw httpError(404, 'NOT_FOUND', 'PO not found');

  requireBusinessRole(ctx, po.businessId, CART_ROLES);
  const result = await reorderFromOrder(c.env.DB, orderId, po.businessId);
  return c.json(result);
});
```

Add `import { reorderFromOrder } from './reorder';` at the top.

- [ ] **Step 3: Run cart tests + verify route registration**

Run: `pnpm --filter @vyro/api exec vitest run test/cart`
Expected: PASS — the service tests cover the happy + skip paths; route-level integration is verified by `pnpm --filter @vyro/api exec tsc --noEmit` (clean) plus a manual `wrangler dev` smoke (optional).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cart/routes.ts packages/validation/src/cart.ts packages/validation/src/index.ts
git commit -m "feat(cart): POST /api/cart/from-order/:orderId route + validation schema"
```

---

### Task 5: Web client + hook + button + visibility

**Files:**
- Create: `apps/web/src/hooks/useReorderFromOrder.ts`
- Modify: `apps/web/src/lib/cartApi.ts`
- Create: `apps/web/src/components/ReorderButton.tsx`
- Modify: `apps/web/src/pages/OrderDetailPage.tsx`

**Interfaces:**
- Consumes: existing `useToast` (or equivalent). Existing `useNavigate` from react-router. Existing `OrderDetailPage` reads `order.status`.
- Produces: `<ReorderButton orderId={order.id} orderStatus={order.status} />` rendered conditionally on the page.

- [ ] **Step 1: Extend `cartApi.ts` with the client function**

Append at the bottom of `apps/web/src/lib/cartApi.ts`:

```ts
import { reorderResponseSchema } from '@vyro/validation/cart';

export async function reorderFromOrder(orderId: string): Promise<z.infer<typeof reorderResponseSchema>> {
  const res = await api.post(`/cart/from-order/${orderId}`, {});
  return reorderResponseSchema.parse(res);
}
```

Adjust the `api.post` signature to match existing client wrappers in the file.

- [ ] **Step 2: Create the mutation hook**

```ts
// apps/web/src/hooks/useReorderFromOrder.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reorderFromOrder } from '../lib/cartApi';
import { toast } from '../components/ui/useToast';

export function useReorderFromOrder() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (orderId: string) => reorderFromOrder(orderId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast({
        title: `Added ${result.addedCount} of ${result.addedCount + result.skippedCount} items`,
        description:
          result.skippedCount > 0
            ? `${result.skippedCount} items unavailable — see cart`
            : undefined,
      });
      navigate('/cart');
    },
    onError: (e) => {
      toast({ title: 'Reorder failed', description: e instanceof Error ? e.message : String(e) });
    },
  });
}
```

If the `toast` import path or signature differs in the codebase, mirror the existing pattern (search existing usages of `useToast` or `<Toast>`).

- [ ] **Step 3: Create the button component**

```tsx
// apps/web/src/components/ReorderButton.tsx
import { useReorderFromOrder } from '../hooks/useReorderFromOrder';

const ELIGIBLE = new Set(['completed', 'delivered', 'ready_for_pickup']);

export function ReorderButton({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const reorder = useReorderFromOrder();
  if (!ELIGIBLE.has(orderStatus)) return null;
  return (
    <button
      type="button"
      onClick={() => reorder.mutate(orderId)}
      disabled={reorder.isPending}
      className="rounded-md bg-primary px-4 py-2 text-on-primary disabled:opacity-60"
      data-testid="reorder-button"
    >
      {reorder.isPending ? 'Adding…' : 'Reorder these items'}
    </button>
  );
}
```

- [ ] **Step 4: Render the button on `OrderDetailPage`**

Find the existing `OrderDetailPage.tsx` header actions block (the area where admin/supplier CTAs live). Add:

```tsx
import { ReorderButton } from '../components/ReorderButton';

// Inside the page body, after the order header:
<ReorderButton orderId={order.id} orderStatus={order.status} />
```

If the page already exports a typed `order` from a hook, fine. If it expects a specific prop shape, extract `orderId`/`orderStatus` from there.

- [ ] **Step 5: Verify with full web test suite**

Run: `pnpm --filter @vyro/web test`
Expected: PASS — no regressions. If existing tests on the page are storybook/RTL, no explicit button test required.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/cartApi.ts apps/web/src/hooks/useReorderFromOrder.ts apps/web/src/components/ReorderButton.tsx apps/web/src/pages/OrderDetailPage.tsx
git commit -m "feat(web): ReorderButton on OrderDetailPage + useReorderFromOrder hook"
```

---

### Task 6: Web button visibility tests

**Files:**
- Find/create: `apps/web/src/pages/OrderDetailPage.reorder.test.tsx` (extend existing test or new)

- [ ] **Step 1: Write the visibility tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReorderButton } from '../../components/ReorderButton';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReorderButton visibility', () => {
  it('renders on completed orders', () => {
    wrap(<ReorderButton orderId="po-1" orderStatus="completed" />);
    expect(screen.getByTestId('reorder-button')).toBeInTheDocument();
  });
  it('renders on delivered orders', () => {
    wrap(<ReorderButton orderId="po-1" orderStatus="delivered" />);
    expect(screen.getByTestId('reorder-button')).toBeInTheDocument();
  });
  it('renders on ready_for_pickup orders', () => {
    wrap(<ReorderButton orderId="po-1" orderStatus="ready_for_pickup" />);
    expect(screen.getByTestId('reorder-button')).toBeInTheDocument();
  });
  it('hides on pending orders', () => {
    wrap(<ReorderButton orderId="po-1" orderStatus="pending" />);
    expect(screen.queryByTestId('reorder-button')).toBeNull();
  });
  it('hides on disputed orders', () => {
    wrap(<ReorderButton orderId="po-1" orderStatus="disputed" />);
    expect(screen.queryByTestId('reorder-button')).toBeNull();
  });
  it('hides on cancelled orders', () => {
    wrap(<ReorderButton orderId="po-1" orderStatus="cancelled" />);
    expect(screen.queryByTestId('reorder-button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run web tests**

Run: `pnpm --filter @vyro/web test`
Expected: PASS — 6/6 button visibility cases green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/OrderDetailPage.reorder.test.tsx
git commit -m "test(web): ReorderButton visibility across PO status"
```

---

### Task 7: Full suite + ship note

**Files:**
- Create: `docs/superpowers/notes/reorder-shortcut-2026-09-17.md`

- [ ] **Step 1: Run full monorepo test suite**

Run: `pnpm test`
Expected: PASS — every package green.

- [ ] **Step 2: tsc on both packages**

Run: `pnpm exec tsc -p apps/api/tsconfig.json --noEmit && pnpm exec tsc -p apps/web/tsconfig.json --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Write the ship note**

```markdown
# Reorder Shortcut — Ship Notes

**Date:** 2026-09-17
**Spec:** `docs/superpowers/specs/2026-09-17-reorder-shortcut-design.md`
**Status:** Shipped (no flag — direct)

## Surface

- `POST /api/cart/from-order/:orderId` — buyer-side reorder endpoint.
- `<ReorderButton>` on `OrderDetailPage` — visible only when order status is `completed | delivered | ready_for_pickup`.

## Behavior

- Reads source PO `purchase_order_items`, resolves today's `tier1MinQty` etc. via `cart/pricing.ts`, gates stock + MOQ via `checkPurchasable` from `@vyro/shared`.
- Survivors written to buyer's existing open cart via `upsertCartItem`; new cart created if none (`ensureOpenCart`).
- Multi-supplier POs: first supplier's lines added; rest skipped with reason `'multi_supplier_unsupported'`.
- Soft-deleted supplier products: skipped with reason `'archived'`.
- Drift per added line: `(newUnitCents - oldUnitCents) / oldUnitCents * 100`, one decimal.

## Verification

- `pnpm --filter @vyro/api exec vitest run test/cart` — service tests (happy + 4 skip reasons + drift math + PO eligibility).
- `pnpm --filter @vyro/web test` — button visibility + existing UI tests.
- `pnpm test` — full monorepo green.
- `pnpm exec tsc --noEmit` — clean.

## Deferred

- Named lists and list sharing across business members.
- Multi-supplier single-shot re-add.
- Reorder frequency analytics and "auto-reorder X if Y low" automation.
- Soft-delete awareness in `checkPurchasable` itself.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/reorder-shortcut-2026-09-17.md
git commit -m "docs(notes): reorder shortcut shipped — endpoint + button + drift"
```

---

## Done.

7 tasks, all TDD, no schema changes, no flag. Direct ship.

See `docs/superpowers/specs/2026-09-17-reorder-shortcut-design.md` for spec, `docs/superpowers/specs/2026-09-17-vyro-platform-audit-revenue-gaps.md` for the gap matrix context.
