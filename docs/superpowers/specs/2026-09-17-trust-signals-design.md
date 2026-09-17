# Supplier Trust Signals — Design Spec

**Date:** 2026-09-17
**Roadmap item:** #2 — Supplier verification & trust badges
**Status:** Approved, ready for plan
**Owner:** Platform

## Goal

Surface four auto-evaluated trust signals as per-signal badges on supplier surfaces:

1. **KYC Verified** — `suppliers.verificationStatus = 'verified'`
2. **Member Since** — year derived from `suppliers.created_at`
3. **On-Time Delivery** — ≥90% of trailing 30 delivered POs delivered on/before promised date; badge only when sample size ≥5
4. **Dispute-Free** — zero supplier-fault disputes in trailing 90 days

Existing paid `TrustSealBadge` continues to render alongside (premium tier signal, separate from organic signals).

## Non-goals

- No aggregate score, no tiering, no numeric 0–100.
- No manual admin override of signal truth (admin can force a recompute, that's it).
- No new dispute or PO intake flows.
- No response-rate or reorder-rate signals in this iteration.
- No buyer-facing "trust score" UI outside the four per-signal badges.

## Architecture

**Read path:** Pre-computed `supplier_trust_signals` row joined into existing responses. Webhook hooks on PO `delivered` and dispute `resolve` keep rows fresh on the active path. Hourly cron rebuilds for everyone. Edge reads stay fast (one PK lookup, no aggregation).

**Write path:** `recomputeForSupplier(d1, supplierId)` is the single mutation surface. Idempotent UPSERT. Called by cron and webhooks. Pure-ish (queries D1 only — no side effects).

## Data model

New table `supplier_trust_signals`:

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `supplier_id` | text | no | PK, FK `suppliers.id` |
| `kyc_verified` | integer | no | 0/1 |
| `member_since_year` | integer | yes | derived from `suppliers.created_at` UTC year |
| `total_completed_pos` | integer | no | sample size for on-time |
| `on_time_count` | integer | no | trailing window |
| `on_time_pct_cached` | real | yes | null when `total_completed_pos = 0` |
| `disputed_supplier_fault_count` | integer | no | trailing 90d |
| `computed_at` | integer | no | unix epoch seconds |

### Schema amendment (required — confirmed before plan)

Two columns added to `purchase_orders` in migration `0045_po_trust_columns.sql`:

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `delivery_promised_at` | integer | yes | set when PO transitions to `prepared` (= `accepted_at + supplier_product.lead_time_days * 86400`) |
| `disputed_at` | integer | yes | set when status flips to `disputed` |
| `dispute_outcome` | text | yes | one of `null`, `refund_business`, `release_supplier`; set on dispute resolve |

**Window rule (delivery):** last 30 POs ordered by `delivered_at` desc where `status='delivered'`. `on_time = (delivered_at <= delivery_promised_at)`. POs with `delivery_promised_at IS NULL` are excluded from the numerator and denominator (set before the column existed → unknown).

**Window rule (disputes):** count `purchase_orders` where `disputed_at IS NOT NULL` AND `disputed_at >= now - 90d` AND `dispute_outcome = 'refund_business'`. Buyer wins → supplier fault.

**Sample gate:** `total_completed_pos < 5` → on-time badge suppressed (not failed). All signals default to null/false when `computed_at` missing.

## API surface

### Public, flag-gated

| Method | Path | Response | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/suppliers/by-slug/:slug` | extended with `trustSignals: TrustSignalView` | Existing endpoint; new field only when flag on |

`TrustSignalView`:
```ts
{
  kyc: boolean,
  memberSinceYear: number | null,
  onTimePct: number | null,         // 0..100, null when sample<5
  onTimeSampleSize: number,         // 0..30
  disputeFree: boolean,             // disputedSupplierFaultCount === 0 in last 90d
  lastComputedAt: number | null
}
```

Missing row or flag off → field omitted entirely. Consumers treat as "no signal data".

### Admin

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/admin/trust/signals/:supplierId` | Full `TrustSignalsRow` + supplier identity |
| `POST` | `/api/admin/trust/signals/:supplierId/recompute` | `{ ok: true, signal: TrustSignalView }` |

Both gated on `requireAdmin` (existing pattern in `adminRoutes.ts`).

### Internal (not HTTP)

| Function | Location |
| --- | --- |
| `recomputeForSupplier(d1, supplierId)` | `apps/api/src/modules/trust/service.ts` |
| `recomputeAllSuppliers(d1)` | same file |
| `getTrustSignalView(d1, supplierId)` | same file — exposes read for non-storefront callers |

## Modules & file layout

- `apps/api/src/modules/trust/repository.ts` — Drizzle queries (UPSERT, select by id, select all for backfill)
- `apps/api/src/modules/trust/service.ts` — `recomputeForSupplier`, `recomputeAllSuppliers`, `getTrustSignalView`
- `apps/api/src/modules/trust/routes.ts` — public (extends storefront), admin CRUD
- `apps/api/src/modules/trust/adminIndex.ts` — admin router export
- `apps/api/src/modules/trust/cron.ts` — cron registration glue
- `apps/api/src/cron/handlers.ts` — add `handleTrustSignalsRebuild`
- `apps/api/src/worker.ts` — register cron at `13 * * * *`
- `apps/api/src/modules/purchaseOrders/service.ts` — call `recomputeForSupplier` on delivered transition (best-effort)
- `apps/api/src/modules/admin/disputes.ts` — call `recomputeForSupplier` on resolve (best-effort)

Web app:
- `apps/web/src/lib/trustApi.ts` — typed client
- `apps/web/src/hooks/useTrustSignals.ts` — TanStack hooks
- `apps/web/src/components/TrustSignalBadges.tsx` — single component, three size modes
- `apps/web/src/components/TrustBadgeKyc.tsx`, `TrustBadgeMemberSince.tsx`, `TrustBadgeOnTime.tsx`, `TrustBadgeDisputeFree.tsx` — leaf chips (one file each, narrow contracts)
- `apps/web/src/supplier/storefront/StorefrontPage.tsx` — full-size badges in hero
- `apps/web/src/storefront/SupplierProductGrid.tsx` — compact badges per offer card
- `apps/web/src/admin/suppliers/SupplierDetailPage.tsx` — verbose admin view (extend existing page if present, else create)

Shared:
- `packages/db/src/schema/trust.ts` — drizzle table def for `supplier_trust_signals`
- `packages/db/migrations/0044_supplier_trust_signals.sql` — `CREATE TABLE IF NOT EXISTS` + indexes
- `packages/db/migrations/0045_po_trust_columns.sql` — ALTER TABLE `purchase_orders` ADD columns `delivery_promised_at`, `disputed_at`, `dispute_outcome` (`ALTER TABLE ... ADD COLUMN` is idempotent on D1? — verify; use try/catch in raw migration or use Drizzle's `addColumn`)
- `packages/validation/src/trust.ts` — zod schemas for admin DTOs (mostly no inputs but keep parity)

## Cron + triggers

| Trigger | Mechanism | Notes |
| --- | --- | --- |
| Hourly sweep | `0 13 * * *` | Offset from sponsored's `0 * * * *` to spread load |
| PO delivered | inline call in `purchaseOrders.service.ts` | best-effort, error logged, never blocks PO commit |
| Dispute resolve (supplier-fault) | inline call in `admin/disputes.ts` | best-effort, error logged |

Each call is `<100ms` for typical suppliers. Cron iterates all suppliers with `try/catch` per row — one bad supplier cannot abort the sweep.

## Flag & rollout

Flag key: `TRUST_SIGNALS_ENABLED`. Lives in `feature_flags` config section (same mechanism as `SPONSORED_LISTINGS_ENABLED`).

| Phase | Flag | What ships |
| --- | --- | --- |
| 1 (admin only) | off on storefront, on for admin | Verbose admin supplier detail view only |
| 2 (storefront full) | on for public | Storefront hero gets full-size badges |
| 3 (PDP compact) | on for public | PDP offer card gets compact badges |

Each phase has its own verification note under `docs/superpowers/notes/trust-phase-{n}.md`.

## Testing

- `apps/api/test/trust/repository.test.ts` — UPSERT idempotency
- `apps/api/test/trust/service.test.ts` — `recomputeForSupplier` against fixture D1; cover KYC off, on-time ≥/\< 90%, dispute supplier-fault yes/no, sample-size gate
- `apps/api/test/trust/cron.test.ts` — sweep handles per-supplier error
- `apps/api/test/trust/routes.test.ts` — admin endpoints gated on role
- `apps/web/src/components/TrustSignalBadges.test.tsx` — each size mode renders correct subset

Target: full monorepo `pnpm test` green before T15 ship.

## Risks & mitigations

- **Stale signals** — hourly cron caps staleness; webhook hooks trim active suppliers to ≤few-second lag. Document last-updated in verbose admin view.
- **Sample-size abuse** — small suppliers see no on-time badge until 5 POs done. Documented in tooltip.
- **Disputes table ambiguity** — lock exact data source (supplier-fault column or fallback to `purchase_orders.dispute_outcome`) during planning. If neither exists, proposal is blocked — escalate.
- **Hot loop on cron** — sweep iterates all suppliers. For 10k+ suppliers, add batched retry later. Out of scope here.

## Out of scope (deferred)

- Per-signal admin overrides
- Numeric composite score
- Reorder rate, response rate signals
- Real-time updates via websockets / SSE
- Edge KV cache (premature)
