# F2 — Volume Pricing Tiers — Design

**Goal:** Suppliers offer quantity-based discounts. Buyers see the tier in cart. Checkout applies the best tier per line and records the discount in the PO line snapshot.

## Model

Three supplier-set tiers per supplierProduct, persisted on `supplier_products`:

- `tier1MinQty` (default 10) — `tier1DiscountPct` (default 0)
- `tier2MinQty` (default 50) — `tier2DiscountPct` (default 0)
- `tier3MinQty` (default 100) — `tier3DiscountPct` (default 0)

Discount percent is integer 0-50 (cap to prevent fat-finger).

Resolution: highest tier whose `minQty <= quantity` wins. Zero pct counts as no discount.

## Cart preview

`GET /api/cart` already returns items with line totals. Extend response with per-line `bestTier` (null | {minQty, discountPct}) and `discountCents` (0 when no tier). Recompute total via subtotalCents − sum(discountCents).

## Checkout

`checkoutService` recomputes discounts and stores them in `purchase_order_items`:
- Add columns `unit_price_cents_snapshot`, `discount_pct_snapshot`, `line_total_cents`
- Migration `0004_po_item_pricing.sql`
- Snapshot is canonical — supplier editing tiers later doesn't rewrite history

## Supplier UI

Add tier fields to supplierProduct edit form (admin or supplier). Persist via PATCH supplierProduct endpoint.

## Buyer UI

Cart line shows "Save X% — buy N+ units" hint when within one tier of a discount. Cart total row shows discount subtotal.

## Files

**New:**
- `packages/db/migrations/0004_po_item_pricing.sql`
- `packages/db/migrations/0005_supplier_product_tiers.sql`
- `apps/api/src/modules/cart/pricing.ts` (tier resolution fn, pure)
- `apps/api/test/modules/cart/pricing.test.ts`

**Modified:**
- `packages/db/src/schema/supplierProducts.ts` (add 6 cols)
- `packages/db/src/schema/purchaseOrderItems.ts` (add 3 cols)
- `apps/api/src/modules/cart/routes.ts` (cart response includes bestTier + discount)
- `apps/api/src/modules/cart/service.ts` (apply tier)
- `apps/api/src/modules/purchaseOrders/service.ts` (snapshot tier on checkout)
- `apps/api/src/modules/supplierProducts/routes.ts` (PATCH accepts tier fields)
- `apps/web/src/pages/cart/CartPage.tsx` (tier hint + discount row)
- `apps/admin/src/pages/SupplierProductEditPage.tsx` (tier inputs)

## Tests

- pricing.ts: tier resolution edge cases (qty=9 vs 10, tier pct=0, qty over all)
- cart routes: tier appears in response when eligible
- checkout: discount snapshot stored correctly

## Non-goals

- Coupon codes
- Time-bound sales
- Customer-specific pricing
