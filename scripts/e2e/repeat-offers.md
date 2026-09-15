# Repeat Offers E2E Smoke

## Pre-reqs

- `pnpm dev` from `apps/api/` (port 8787 by default)
- `pnpm dev` from `apps/web/`
- D1 `feature_flags` config section: `REPEAT_OFFERS_ENABLED = true`

## Walk

1. **Seed** (admin or fixtures): create business `biz1`, supplier `supA`. Seed 2 completed POs from `biz1` to `supA` totaling LKR 160,000+ (e.g., via admin panel or D1 console).
2. **Sign in** as `biz1` retailer. Add a supplier-product from `supA` to cart.
3. **Visit `/cart`** (buyer cart page). Verify green badge above `supA`'s draft PO: *"Repeat Offer: You've spent LKR 160,000 with Supplier A in the last 90 days — 10% off your next order!"*.
4. **Proceed to `/checkout`**. Verify totals block shows `Repeat Offer discount: −LKR X.XX` line.
5. **Submit order**. Verify `POST /api/purchase-orders/checkout` response includes:
   ```json
   { "poIds": ["..."], "repeatOfferDiscounts": [{ "supplierId": "supA", "discountCents": ..., "percent": 10 }] }
   ```
   Verify the inserted PO row has `subtotalCents` and `totalCents` reduced by the discount.
6. **Sign in** as `supA` owner. Visit `/supplier/analytics`. Verify "Repeat Offers (30d)" tile shows +1 triggered order + computed savings.

## Negative cases

- **Flag off.** Set `REPEAT_OFFERS_ENABLED = false` in `feature_flags`.
  - `GET /api/checkout/repeat-offers?businessId=biz1` → 404.
  - `GET /api/supplier/repeat-offers/analytics?supplierId=supA` → 404.
  - Checkout still succeeds, but `repeatOfferDiscounts = []`.
- **Below threshold.** Fresh `biz2` with no POs to `supA`: `GET /api/checkout/repeat-offers?businessId=biz2` → `{ offers: [] }`. Checkout unaffected.
- **Stacking.** Existing volume tier discount on PO: should not stack. `applyForCart` skips POs with `existingDiscountCents > 0`. (MVP: tier discounts bake into line prices, so `existingDiscountCents = 0` at PO level; manual supplier discounts would trigger skip.)

## Data model assumptions

- Eligibility: trailing 90d `SUM(purchase_orders.subtotalCents)` where `status='completed'`, grouped by `supplier_id`.
- Discount unit: PO subtotal (not line subtotal). Each checkout creates one PO per supplier.
- Currency: LKR only.

## Known limits (per spec)

- No per-supplier threshold configuration (single global rule).
- No per-supplier SKU scope (entire catalog).
- No buyer email notification when threshold first crossed.
- No stacking with other promos (best-discount-wins).
- Analytics counts every qualifying supplier's completed POs in trailing 30d; doesn't distinguish POs that actually had a Repeat Offer applied (no flag column on PO).
