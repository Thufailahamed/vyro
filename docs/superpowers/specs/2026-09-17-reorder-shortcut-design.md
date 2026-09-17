# Reorder Shortcut — Design Spec (Roadmap #4 lean floor)

**Date:** 2026-09-17
**Roadmap item:** #4 (Saved carts, lists & reorder shortcuts) — **reorder shortcut only**
**Status:** Approved, ready for plan
**Owner:** Platform

## Goal

One-tap re-add of a past PO's items to the current cart from `OrderDetailPage`. Resolves each line item at today's price + supplier tier, surfaces drift between yesterday's and today's per-unit cost, and reports any line items that became unavailable since the original order.

Maps directly to the dominant SL B2B buyer behavior: a small retailer (kirana/bakery/restaurant) completes the same 20–40 staple-SKU reorder weekly. Today every order is a fresh rebuild of the cart. The reorder shortcut collapses that rebuild to one click.

## Non-goals

- No named lists, no list UI, no list sharing across business members.
- No auto-reorder / scheduled reorder / standing orders (covered separately by rescoped #5 standing POs).
- No multi-supplier POs in one batch — single-supplier POs only; multi-supplier reorders skip the second-and-onwards supplier lines with reason `'multi_supplier_unsupported'`. Multi-supplier single-shot re-add is a future-work item.
- No reorder analytics (frequency, suggestions, "you reorder this every Tuesday").
- No price-lock across reorders. Drift surfaced in the response, not auto-canceled.
- No reorder from RFQs, draft POs, or pre-checkout intent states.
- No AI/cart-hints-banner integration (the existing `apps/web/src/ai/CartHintsBanner.tsx` is left untouched; this feature is a peer UI, not a replacement).
- No new feature flag. Direct ship (additive convenience with no buyer-facing policy change).

## Architecture

Endpoint-driven, server-authoritative. A new service reads the source PO and line items, walks each line through `cart/pricing.ts` for today's tier resolution and `checkPurchasable` from `@vyro/shared` for stock + MOQ gates, and writes surviving lines into the buyer's open cart via the existing `cartItems` upsert path.

The buyer's existing `OrderDetailPage` gets a single `<ReorderButton>` rendered only on terminal-status POs (`completed | delivered | ready_for_pickup`). Click posts to the endpoint, navigates to `/cart`, and surfaces a toast with the add/skip counts.

**No schema changes, no new tables, no new flag.**

## Data model

No new tables. Reads from existing `purchase_orders` + `purchase_order_items`; writes to existing `carts` + `cart_items`. All required columns already exist.

The reorder service reads:

- `purchaseOrders` — source PO; validates `status ∈ {completed, delivered, ready_for_pickup}` and that the caller has access to `po.businessId`.
- `purchaseOrderItems` — source line items; `supplierProductId` is a direct FK on the row, no join needed. `unitPriceCentsSnapshot` is the historical list price used for drift.
- `supplierProducts` — current state (`stockQty`, `reservedQty`, `trackInventory`, `tier1MinQty`/`tier1DiscountPct` etc., `availabilityStatus`, `deletedAt`).
- `carts` + `cartItems` — destination cart.

## API surface

### Public, flag-less

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/cart/from-order/:orderId` | session + business role on `po.businessId` | Buyer-side reorder. |

**Request body:** empty (`{}`). `orderId` is in the URL.

**Response (200):**

```ts
{
  cartId: string,
  addedCount: number,
  skippedCount: number,
  addedSubtotalCents: number,
  added: Array<{
    supplierProductId: string,    // direct from purchase_order_items row
    supplierId: string,
    qty: number,
    oldUnitCents: number,          // snapshot from purchase_order_items.unit_price_cents_snapshot
    newUnitCents: number,          // today's list price before tier
    newEffectiveUnitCents: number, // after tier discount, rounded
    tierApplied: { minQty: number; discountPct: number } | null,
    driftPct: number,              // ((newUnitCents - oldUnitCents) / oldUnitCents) * 100
  }>,
  skipped: Array<{
    supplierProductId: string,
    supplierId: string,
    qty: number,
    reason: 'archived' | 'out_of_stock' | 'below_moq' | 'multi_supplier_unsupported',
  }>,
  warnings: string[],
}
```

**Errors:**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | no session |
| 403 | `FORBIDDEN` | caller not on `po.businessId` in `CART_ROLES` |
| 404 | `NOT_FOUND` | PO not found |
| 409 | `PO_NOT_REORDERABLE` | `po.status ∉ {completed, delivered, ready_for_pickup}` |
| 422 | `VALIDATION_ERROR` | malformed `orderId` |

Per-line validation uses `checkPurchasable` from `@vyro/shared` (already imported in `cart/routes.ts:32`), so stock + MOQ + soft-delete (`supplierProducts.deletedAt`) gates are identical to the manual add-cart path.

### Drift computation

`driftPct = round(((newUnitCents - oldUnitCents) / oldUnitCents) * 100, 1)`, rounded to one decimal. Sign-less magnitude when positive or negative. Returned as a number (not formatted) so the client may localize.

## Modules & file layout

- `apps/api/src/modules/cart/reorder.ts` (new) — service module.
  - `reorderFromOrder(d1, orderId, businessId)` — single export. Caller is responsible for RBAC; `businessId` argument is used to scope the cart write and skip-audit log. Returns the response shape above.
  - Uses `purchaseOrders`, `purchaseOrderItems`, `supplierProducts`, `carts`, `cartItems` from `@vyro/db/schema`.
  - Uses `applyTier` + `resolveTier` from `./pricing`.
  - Uses `checkPurchasable` + `deriveAvailability` from `@vyro/shared`.
- `apps/api/src/modules/cart/routes.ts` — add one route handler:

```ts
router.post('/from-order/:orderId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const orderId = c.req.param('orderId');
  if (!orderId) throw httpError(400, 'VALIDATION_ERROR', 'orderId required');
  // Load the PO first so we can run RBAC against its businessId.
  const db = getDb(c.env.DB);
  const po = await db
    .select({ id: purchaseOrders.id, businessId: purchaseOrders.businessId, status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId))
    .get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!po.businessId) throw httpError(404, 'NOT_FOUND', 'PO not found');
  requireBusinessRole(ctx, po.businessId, CART_ROLES);
  return c.json(await reorderFromOrder(c.env.DB, orderId, po.businessId));
});
```

Web app:

- `apps/web/src/pages/OrderDetailPage.tsx` — adds a "Reorder these items" button rendered when `order.status ∈ {completed, delivered, ready_for_pickup}`. Hidden otherwise. Button is a small client component with its own mutation hook + toast + navigation.
- `apps/web/src/lib/cartApi.ts` — adds `reorderFromOrder(orderId)` typed client.
- `apps/web/src/hooks/useReorderFromOrder.ts` (new) — TanStack Query mutation.
- `apps/web/src/components/ReorderButton.tsx` (new) — small button + disabled state + loading spinner.

Shared:

- `packages/validation/src/cart.ts` — add `cartFromOrderResponseSchema` for the response shape.

## State machines

- Cart lifecycle unchanged (`open` → `converted`). Reorder writes to the buyer's existing `open` cart. If none exists, `ensureOpenCart` (existing in `cart/repository.ts`) creates one.
- PO eligibility: only terminal-of-reorder-flow statuses. Disputed POs return 409 — buyer cannot reorder what's open for resolution; wait for dispute resolve first.

## Risks & mitigations

- **Multi-supplier PO complexity** — first supplier's lines added; rest get `'multi_supplier_unsupported'`. Surfaces in the response so the buyer knows. Future PR adds a batched path.
- **Stock race** — between the read and the upsert, stock could shift. Each `upsertCartItem` call re-validates via `assertPurchasable` in the cart routes; the reorder service inherits the same protection by passing through `checkPurchasable` before upsert. Any race that degrades stock during the upsert surface as one cart item failing with a `409 INSUFFICIENT_STOCK`-equivalent skipped entry. Acceptable.
- **Drift alarm fatigue** — drift could be large for commodities with seasonal swings. UI surfaces drift in the response payload but the toast text stays simple (`"Added N of M items (K unavailable)"`). Detailed drift is on the cart page after navigation.
- **POs without `tier*` columns** — none expected; `supplierProducts.tier1MinQty/tier1DiscountPct` etc. exist (verified 2026-09-17). Plan will cross-check at task time.
- **Soft-deleted supplier products** — `checkPurchasable` does not consult `deletedAt` directly. The reorder service must filter `deletedAt IS NULL` before passing offers to the eligibility check. Future PR: thread `deletedAt` into `checkPurchasable` itself.

## Testing

Target: full monorepo `pnpm test` green before ship.

### Backend

- `apps/api/test/cart/reorder.test.ts` (new) — covers:
  1. Happy path: completed PO, all 3 lines active + in-stock + above MOQ → `addedCount=3, skippedCount=0`, exact new price = `applyTier(unitCents, qty, resolveTier(tiers, qty))`.
  2. Archived (`deletedAt != null`): line excluded with reason `'archived'`.
  3. Out-of-stock (`stockQty - reservedQty < qty`): skipped with `'out_of_stock'`.
  4. Below MOQ: skipped with `'below_moq'`.
  5. Pending PO returns 409 `PO_NOT_REORDERABLE`.
  6. Multi-supplier PO: first supplier's lines added; second supplier's lines skipped with `'multi_supplier_unsupported'`. Drift still populated for added lines.
  7. Drift: `oldUnitCents=100, newUnitCents=125` → `driftPct=+25` (one decimal).
  8. RBAC: non-member caller → 403.

### Web

- `apps/web/src/pages/OrderDetailPage.reorder.test.tsx` (extend existing test):
  - Button renders when order status is `completed`.
  - Button hidden when order status is `pending` (or `disputed` / `cancelled`).
  - Click → mutation fires → routes to `/cart` with toast text `"Added N of M items (K unavailable)"`.

## Out of scope (deferred)

- Named lists and list sharing across business members.
- AI/cart-hints reorder suggestions (the `Suggested reorder` heading at `apps/web/src/ask/components/index.tsx:366` is unrelated and pre-existing).
- Multi-supplier single-shot re-add.
- Reorder frequency analytics and "auto-reorder X if Y low" automation.
- Reorder from RFQs or cart-stage intents.
- Soft-delete awareness in `checkPurchasable` itself (defer to a shared package fix once we have a second consumer).
- Coupling to #3 promotions/coupons; reordered items enter the cart clean. Coupons still apply at checkout via the existing redemption path.

See `docs/superpowers/specs/2026-09-17-vyro-platform-audit-revenue-gaps.md` for the broader context this feature fits into.
