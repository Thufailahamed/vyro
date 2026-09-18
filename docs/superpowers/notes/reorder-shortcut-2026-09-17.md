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