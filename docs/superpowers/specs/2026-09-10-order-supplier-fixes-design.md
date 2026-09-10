# Order + Supplier Fixes Design

Date: 2026-09-10. Track: Order + supplier fixes (full pricing engine option).

## Context

Buyer order UI drifted from the API truth in
`packages/shared/src/constants/orderStatus.ts` (`pending → accepted →
preparing → ready_for_pickup → out_for_delivery → delivered → completed`,
plus terminal `cancelled/rejected/disputed`). Home trust stats are hardcoded,
supplier customers has no pagination, and the tier discount engine is stored
and applied server-side but has validation, display, and invoice gaps.

## Section A — Order status alignment

- Source of truth: `ORDER_TRANSITIONS` + `canTransition(from, to, actor)`
  in `packages/shared/src/constants/orderStatus.ts`.
- `apps/web/src/pages/OrderDetailPage.tsx`: replace `NEXT_OPTIONS_BY_ROLE`
  (currently keyed by status) with role-aware options derived from
  `canTransition` for the current order status and viewer role; replace
  `JOURNEY` (`in_transit` is not a real status) with
  `pending/accepted/preparing/ready_for_pickup/out_for_delivery/delivered/completed`;
  derive the default `to` state from the first allowed transition instead of
  hardcoded `'completed'`.
- `apps/web/src/pages/OrdersPage.tsx`: replace synthetic filters
  (`in_flight`, `in_transit`) with 1:1 real statuses, including
  `preparing`, `ready_for_pickup`, `out_for_delivery`, `cancelled`, `rejected`.
- Frontend-only change. Tests: transition-matrix unit tests plus filter mapping tests.

## Section B — Real home trust stats

- `apps/api/src/modules/home/routes.ts` `trustStats`: replace hardcoded
  `districtsCovered: 25`, `lifetimeGmvCents`, `activeBusinesses: 0` with live
  SQL: `COUNT(DISTINCT district)` over active suppliers/businesses,
  `SUM(totalCents)` over non-cancelled purchase orders, `COUNT` of active
  businesses and suppliers.
- Keep `journeySteps`/`faq` as static marketing copy; update the FAQ payment
  line to include PayHere alongside COD/bank transfer.
- Add a short server-side cache (~5 min) for the aggregate query.
- Tests: feed route test asserting stats reflect seeded rows, not constants.

## Section C — Supplier customers pagination

- `GET /suppliers/:id/customers`: add `?cursor=&limit=` with a
  `(lastOrderAt, businessId)` composite cursor, returning `nextCursor`.
  Default page size is 20 and preserves current behavior for small accounts.
- `apps/web/src/supplier/CustomersPage.tsx`: switch to `useInfiniteQuery`
  with a Load more control; keep client-side search/sort unchanged.
- Tests: repository pagination test (stable ordering, no duplicates across pages).

## Section D — Tier completion

Backend math already exists (`apps/api/src/modules/cart/pricing.ts`
`resolveTier`/`applyTier`, applied in `cart/routes.ts` and
`purchaseOrders/service.ts` with `discountPctSnapshot`). Close five gaps:

1. Validation (`packages/validation/src/supplierProduct.ts`): add cross-field
   `.refine` so tier mins are strictly increasing when their discount > 0 and
   discounts are non-decreasing with quantity.
2. `nextTier` bug (`cart/routes.ts:115`, `best ? null : nextTier(...)`):
   always return the next tier above current qty so buyers see progress.
3. Buyer display: tier table (qty → % off) on product detail; per-line
   "You save Rs. X (Y%)" and "add N more to unlock Z%" in cart/checkout using
   existing `bestTier`/`nextTier`/`discountCents` fields. No new API fields.
4. Order detail: render stored `discountPctSnapshot` per line.
5. Invoice consistency (`invoices/repository.ts`): use the PO line's stored
   `lineTotalCents` instead of recomputing `qty × unitPrice`, so invoices
   match what the buyer paid.
- Tests: validation refine tests, `nextTier` progression test, cart tier
  display tests, invoice-total equality test.

## Non-goals

- No new pricing table or pricing model change; tiers stay as three
  min-qty/discount pairs on `supplier_products`.
- No PayHere, 2FA, or runbook work in this batch.
- No unrelated refactoring.
