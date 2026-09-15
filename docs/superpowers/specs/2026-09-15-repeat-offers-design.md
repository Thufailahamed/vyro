# Vyro Repeat Offers — Design

**Date:** 2026-09-15
**Status:** Draft (awaiting user review)
**Scope:** Quick-win #4 from competitor audit (`2026-09-15-competitor-audit.md`). Brand-funded auto-discount triggered when a retailer crosses a trailing spend threshold with a supplier. Ankorstore "Repeat Offer" model.

## Goals

- Reward repeat buyers automatically without supplier per-buyer negotiation.
- Lift supplier-side conversion on retailers who already purchase from that supplier.
- Hand suppliers a no-touch retention lever.

## Non-goals

- Per-supplier threshold or discount configuration (single global rule at MVP).
- Per-supplier SKU scope (entire catalog of the qualifying supplier).
- Multi-tier loyalty (Silver / Gold / Platinum).
- Buyer opt-in / loyalty status page.
- Buyer email notifications when threshold is first crossed.
- Stacking with other promos / coupons / volume pricing.
- Integration with roadmap #3 promotions/coupons engine (deferred; pick best-discount at checkout).

## Decisions (locked from brainstorm)

| Question | Decision |
| --- | --- |
| Threshold structure | Single global rule. LKR 150,000 trailing 90d per (supplier, retailer). 10% off entire catalog. |
| Visibility | Auto-apply at checkout. No buyer notification. |
| Stacking | No stacking with other promos. Best discount wins. |
| Compute timing | Per-checkout on-the-fly query of trailing 90d spend. |
| Module placement | New `repeatOffers/` module. |
| Data model | No new tables. Eligibility computed from `purchase_orders` + `purchase_order_items`. Constants in code. |
| Feature flag | `REPEAT_OFFERS_ENABLED` with 3-phase rollout. |
| Tests | Vitest service + integration + e2e smoke. |

## Architecture

```
                          ┌────────────────────────────────────┐
checkout.checkout ───────►│ repeatOffers.applyForCart           │
                          │   1. computeEligibility(businessId) │
                          │   2. applyEligible(cartItems)       │
                          │   3. return discounted cartItems   │
                          └────────────────────────────────────┘
                                        │
                                        ▼
                          ┌────────────────────────────────────┐
supplier analytics ─────►│ repeatOffers.analyticsForSupplier   │
                          │   (aggregated trailing-30d stats)  │
                          └────────────────────────────────────┘

Web buyer surfaces:
  cart page  ─► GET /api/checkout/repeat-offers (preview eligibility)
  checkout   ─► POST /api/purchase-orders/checkout applies via service
```

### Module boundary

- **NEW** `apps/api/src/modules/repeatOffers/`: eligibility + apply + analytics.
- `checkoutService.checkout` calls `repeatOffers.applyForCart(d1, businessId, cartItems)` once after cart items are resolved but before totals are computed. Function call, no HTTP round-trip.
- Eligibility is read-only against `purchase_orders` + `purchase_order_items` — no new tables, no writes.
- Analytics reads from same tables aggregated.

### Constants (in code)

```ts
const REPEAT_OFFER_THRESHOLD_CENTS = 1_500_00 * 100;   // LKR 150,000
const REPEAT_OFFER_WINDOW_MS      = 90 * 24 * 60 * 60 * 1000;
const REPEAT_OFFER_PERCENT        = 10;                  // integer percent
```

Currency is LKR (Vyro's primary currency); threshold chosen as ~€500-equivalent.

### Files touched

**API:**
- NEW `apps/api/src/modules/repeatOffers/repository.ts` — trailing-spend query.
- NEW `apps/api/src/modules/repeatOffers/service.ts` — `applyForCart` (eligibility + apply), `previewForBuyer` (read-only), `analyticsForSupplier`.
- NEW `apps/api/src/modules/repeatOffers/routes.ts` — 2 HTTP endpoints (buyer preview + supplier analytics).
- NEW `apps/api/src/modules/repeatOffers/index.ts` — Hono composition.
- MODIFY `apps/api/src/modules/purchaseOrders/service.ts` — call `applyForCart` from `checkoutService.checkout`.
- MODIFY `apps/api/src/index.ts` — register `repeatOffersRouter`.

**Tests:**
- NEW `apps/api/test/repeatOffers/service.test.ts` — eligibility edge cases.
- NEW `apps/api/test/repeatOffers/checkout-integration.test.ts` — apply during checkout, no-stacking.

**Web:**
- NEW `apps/web/src/components/RepeatOfferBadge.tsx` — cart-page badge.
- NEW `apps/web/src/components/RepeatOfferSummary.tsx` — checkout-page summary line.
- NEW `apps/web/src/supplier/RepeatOfferTile.tsx` — supplier analytics tile.
- MODIFY `apps/web/src/pages/CartPage.tsx` — embed badge.
- MODIFY `apps/web/src/pages/CheckoutPage.tsx` — embed summary.
- MODIFY `apps/web/src/supplier/AnalyticsPage.tsx` — embed tile.

## Data Model

No new tables. All eligibility computed from existing:

| Source | Use |
|---|---|
| `purchase_orders` (status = `completed`) | trailing 90d order timestamps |
| `purchase_order_items` (joined by `purchase_orders.id`) | per-supplier line totals |
| `cart_items` (in cart session) | current supplier grouping for eligibility check |

## API surface

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/checkout/repeat-offers` | session | `{ offers: Array<{ supplierId: string; supplierName: string; percent: number; trailingSpendCents: number }> }` — preview eligibility for current buyer's cart suppliers |
| GET | `/api/supplier/repeat-offers/analytics` | session + supplier role | `{ triggeredCount, totalSavingsCents, byRetailer: Array<{ businessId, trailingSpendCents, triggeredAt }> }` |

Internal: `repeatOffers.applyForCart(d1, businessId, cartItems)` — function call from `checkoutService.checkout`, no HTTP. Idempotent.

### Eligibility computation

```ts
async function computeEligibility(d1: D1Database, businessId: string):
  Promise<RepeatOffer[]> {
  const since = Date.now() - REPEAT_OFFER_WINDOW_MS;
  const rows = await db.select({
    supplierId: purchaseOrderItems.supplierId,
    totalCents: sum(purchaseOrderItems.totalCents),
  })
  .from(purchaseOrderItems)
  .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
  .where(and(
    eq(purchaseOrders.businessId, businessId),
    eq(purchaseOrders.status, 'completed'),
    gte(purchaseOrders.completedAt, since),
  ))
  .groupBy(purchaseOrderItems.supplierId);

  return rows
    .filter(r => r.totalCents >= REPEAT_OFFER_THRESHOLD_CENTS)
    .map(r => ({
      supplierId: r.supplierId,
      percent: REPEAT_OFFER_PERCENT,
      trailingSpendCents: r.totalCents,
    }));
}
```

### Apply during checkout

```ts
function applyEligible(cartItems: CartItem[], offers: RepeatOffer[]) {
  const offersBySupplier = new Map(offers.map(o => [o.supplierId, o]));
  return cartItems.map(item => {
    // Best-discount-wins: skip lines that already carry a discount from another source.
    if (item.discountCents && item.discountCents > 0) return item;
    const offer = offersBySupplier.get(item.supplierId);
    if (!offer) return item;
    const discount = Math.floor(item.subtotalCents * offer.percent / 100);
    return { ...item, discountCents: discount, appliedOffer: { percent: offer.percent } };
  });
}
```

Best-discount-wins is achieved by only applying Repeat Offer when no other discount is set on the line item (`item.discountCents === 0`).

## UI surfaces

### 1. `RepeatOfferBadge` on `CartPage`

Per-supplier banner above the supplier's cart items: *"You've spent LKR X with this supplier in the last 90 days — 10% off your next order!"*. Hides if eligibility false.

### 2. `RepeatOfferSummary` on `CheckoutPage`

Single line item showing total repeat-offer discount applied. Falls inside the existing totals block.

### 3. `RepeatOfferTile` on supplier `AnalyticsPage`

Two metrics: number of repeat offers triggered in trailing 30d + total savings extended to buyers. Link to per-retailer breakdown.

## Feature flag

`REPEAT_OFFERS_ENABLED` in `feature_flags` D1 config section (read via `isFeatureEnabled` helper). Default `false`.

| Phase | Audience | Trigger |
|---|---|---|
| 1 | Vyro internal team only | Manual flag flip |
| 2 | 10% of suppliers, opt-in via email | Random sample + explicit opt-in |
| 3 | All suppliers | One-shot flip |

Flag gates `/api/checkout/repeat-offers` (404 if off) + `/api/supplier/repeat-offers/analytics` (404 if off). Hook into checkout service reads flag at call-site too — if off, `applyForCart` returns cartItems unchanged.

## Tests

### Unit (`apps/api/test/repeatOffers/service.test.ts`)

- `computeEligibility` excludes orders in `draft`, `pending`, `cancelled` statuses — only `completed` counts.
- `computeEligibility` excludes orders outside 90d window.
- `computeEligibility` aggregates by supplier (multi-supplier cart, multiple suppliers qualify).
- `computeEligibility` returns empty when total per supplier < threshold.
- `applyEligible` applies discount only to qualifying supplier lines.
- `applyEligible` skips lines with existing discount (best-discount-wins).
- `applyEligible` does not stack multiple repeat offers on the same supplier (single 10%).

### Integration (`apps/api/test/repeatOffers/checkout-integration.test.ts`)

- Retailer with LKR 160,000 trailing spend with Supplier A: checkout applies 10% on Supplier A's cart items.
- Retailer with LKR 100,000 trailing spend: no discount applied.
- Multi-supplier cart where retailer qualifies with 1 of 3 suppliers: only that supplier's items discounted.

### Smoke e2e (`scripts/e2e/repeat-offers.md`)

Walk: seed retailer with prior orders totaling LKR 160,000 with Supplier A → buyer adds Supplier A items to cart → `CartPage` shows Repeat Offer badge → buyer checks out → `CheckoutPage` shows 10% discount line → order placed → supplier `AnalyticsPage` tile shows +1 triggered.

## Error handling

- Eligibility query errors (DB down): fail-open (apply no discount). Log + metric.
- Apply step errors: fail-closed (skip discount, log). Don't block checkout.
- 401 on auth-required endpoints.

## Future work

Deferred from MVP per brainstorm:

- Per-supplier threshold + discount + window configuration.
- Per-supplier SKU scoping (catalog subset).
- Buyer opt-in requirement.
- Loyalty status page ("Your status with Supplier X: Gold").
- Email buyer notification on first cross.
- Supplier analytics on repeat-offer conversion (currently: count + savings only).
- A/B testing of discount %.
- Multi-tier (Silver / Gold / Platinum with rising %).
- Per-category scoping.
- Integration with roadmap #3 promotions / coupons / volume pricing (best-discount arbitration).
- Retroactive discount adjustment on partial returns.

## Handoff

After spec approval, invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-09-15-repeat-offers.md`.

Related:
- Audit: `docs/superpowers/specs/2026-09-15-competitor-audit.md` (quick-win #4).
- Pattern reference: `apps/api/src/modules/credit/` (module shape).
- Pattern reference: `apps/api/src/modules/rfqs/crmRoutes.ts` (feature-flag gating pattern, just shipped).
- Roadmap memory: `vyro-roadmap.md` (roadmap #3 promos is separate work).