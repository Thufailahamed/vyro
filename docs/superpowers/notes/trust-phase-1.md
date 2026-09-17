# Supplier Trust Signals — Phase 1 Verification Notes

**Date:** 2026-09-17
**Phase:** 1 of 3 — Admin verbose view only
**Audience:** Internal admin team
**Flag:** `TRUST_SIGNALS_ENABLED` is off; admin endpoints are reachable regardless (gated only by role).
**Plan:** `docs/superpowers/plans/2026-09-17-trust-signals.md`

## Scope of Phase 1

Admin backoffice shows a verbose per-supplier breakdown card on the existing `/admin/suppliers/:id` page (SupplierDetailPage). Card surfaces raw values + thresholds + a Recompute now button. Public buyer surfaces (storefront) keep their existing payload shape — the new `trustSignals` field appears only when the flag is on in Phase 2.

## What ships now

### Backend (Hono + D1)

- **Migrations:** `0045_supplier_trust_signals.sql` (new cache table), `0046_po_trust_columns.sql` (3 columns on `purchase_orders`)
- **Schema:** `packages/db/src/schema/trust.ts`, extended `purchaseOrders`
- **Compute (pure):** `apps/api/src/modules/trust/compute.ts`
- **Repository:** `apps/api/src/modules/trust/repository.ts` (UPSERT, getBySupplierId, listAllSupplierIds)
- **Service:** `apps/api/src/modules/trust/service.ts` (`recomputeForSupplier`, `recomputeAllSuppliers`, `getTrustSignalView`)
- **Cron:** `apps/api/src/modules/trust/cron.ts` — `trustSignalsRebuild(env)`. Registered in `apps/api/src/cron/handlers.ts` and `apps/api/src/worker.ts` at `"13 * * * *"`
- **Hooks:** PO `delivered` transition + PO `preparing` (stamps `delivery_promised_at`) + dispute `resolve` (stamps `dispute_outcome`) — all best-effort
- **Public API:** `GET /api/suppliers/by-slug/:slug` extended with `trustSignals` field (flag-gated, returns `null` when flag off)
- **Admin API:** `GET /api/admin/trust/signals/:supplierId`, `POST /api/admin/trust/signals/:supplierId/recompute` — both gated on admin role
- **Backfill script:** `apps/api/scripts/trust-backfill.sh local|remote`

### Frontend (React SPA)

- **API client:** `apps/web/src/lib/trustApi.ts`
- **Hooks:** `apps/web/src/hooks/useTrustSignals.ts` — TanStack Query
- **Components:**
  - `apps/web/src/components/TrustSignalBadges.tsx` (3 size modes)
  - `TrustBadgeKyc.tsx`, `TrustBadgeMemberSince.tsx`, `TrustBadgeOnTime.tsx`, `TrustBadgeDisputeFree.tsx` (leaf chips)
- **Storefront:** `apps/web/src/storefront/StorefrontPage.tsx` renders full-size badges in hero (Phase 2 visibility)
- **Admin:** `apps/web/src/admin/trust/SupplierTrustSignalsCard.tsx` — verbose view with thresholds + "Recompute now" button, embedded into `SupplierDetailPage.tsx`

## Verification steps performed

### 1. Type & build

- `pnpm -r typecheck` → all 9 workspaces pass
- `pnpm --filter @vyro/api test` → 985 pass (+14 trust tests), 1 skipped
- `pnpm --filter @vyro/web test` → 142 pass

### 2. Migrations applied to local D1

```sh
pnpm --filter @vyro/api db:migrate:local
```

Migration 0045 creates `supplier_trust_signals`. Migration 0046 adds `delivery_promised_at`, `disputed_at`, `dispute_outcome` columns + index.

### 3. Admin smoke endpoints (admin auth required)

| Endpoint | Expected | Status |
| --- | --- | --- |
| `GET /api/admin/trust/signals/:supplierId` | 200, returns `{ raw, view, flagEnabled }` (empty view if no recompute yet) | passing |
| `POST /api/admin/trust/signals/:supplierId/recompute` | 200, `{ ok: true, view }` after rebuild | passing |

### 4. Public buyer surfaces (flag off)

| Endpoint | Expected | Status |
| --- | --- | --- |
| `GET /api/suppliers/by-slug/:slug` | 200, includes `trustSignals: null` | passing |

### 5. Cron handler registered

`apps/api/src/cron/handlers.ts` includes `handleTrustSignalsRebuild`; `apps/api/src/worker.ts` `scheduled()` switch routes the `"13 * * * *"` pattern to it. Cron iterates all suppliers with `try/catch` per row. Recompute builds the row from D1 aggregates (trailing 30 delivered POs with promise timestamp + trailing 90d dispute-outcome refund_business count).

### 6. Backfill script smoke

```sh
./apps/api/scripts/trust-backfill.sh local
```

Outputs `✓ Trust signals rebuilt for N supplier(s).` Pure shell + wrangler D1 SQL — no Node runtime needed. Idempotent.

## Known limitations in Phase 1

- **No live storefront visibility** — flag stays off. Buyers see no badges until Phase 2.
- **No automatic PO promise stamping for historical data** — only POs that transition through `preparing` after deploy get `delivery_promised_at`. Backfill script does not back-stamp promises for past POs (would require inferring from `accepted_at + lead_time_days`).
- **No dispute-outcome backfill** — only new dispute resolves carry the outcome. Historical supplier-fault disputes are uncounted.
- **Sample-size gate is strict** — suppliers with fewer than 5 delivered POs get no on-time badge. Documented in tooltip text.
- **Admin recompute button is unauthenticated against CSRF** — relies on existing admin role gate + same-origin policy. Standard pattern in this codebase.

## Rollout to Phase 2

1. Toggle `TRUST_SIGNALS_ENABLED = true` via `./apps/api/scripts/enable-flag.sh`.
2. Storefront hero now renders full-size badges (KYC / Member Since / On-Time Delivery / Dispute-Free).
3. Buyers see "Verified business" + "Member since YYYY" instantly for any verified supplier with a compute row.
4. On-time + Dispute-Free badges appear once suppliers accumulate ≥5 delivered POs and a trailing 90d window of dispute-free behavior.

## Rollout to Phase 3

Compact badges on PDP offer cards. Requires extending `SupplierProductGrid.tsx` to accept a top-level `trustSignals` prop and rendering `<TrustSignalBadges view={...} size="compact" />` below each offer name. Out of this iteration.

## Commits in Phase 1

T1 → T12 inclusive (12 commits), plus T13 backfill script + T14 verification note. Latest: `86ee8d6 feat(trust): one-shot backfill shell script (idempotent UPSERT)`.
