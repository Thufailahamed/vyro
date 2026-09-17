# P0 Revenue Bug Sweep — Design Spec

**Date:** 2026-09-17
**Roadmap item:** Pre-roadmap urgency sweep — fixes two concrete revenue/operational blockers discovered in 2026-09-17 platform audit
**Status:** Approved, ready for plan
**Owner:** Platform

## Goal

Stop the live PayHere commission leak and turn manual supplier payouts into a recurring weekly job. Two surgical fixes, one migration, one new admin surface.

1. **Fix A — PayHere commission bypass.** Orders paid via PayHere currently skip the platform commission path entirely. Every paid order leaks the default 2.5% (250 bps) take-rate. Restore the precedence-based commission resolution on all `online` channel orders.
2. **Fix C — Weekly supplier payout cron.** Replace manual `/admin/payouts` invocation with a recurring weekly job that computes and stages payable balances per supplier, with admin approval before settlement.

Both are revenue or operational blockers. Both are small enough to ship together.

## Non-goals

- No new commission rules, no per-product/per-supplier/per-category overrides (the existing precedence chain in `finance/commission.ts` is unchanged).
- No payout auto-settlement (final transfer remains a manual admin click after cron staging).
- No sponsored-invoice → payout reconciliation (`payouts/admin.ts` doesn't currently include sponsored revenue — explicitly deferred; needs a follow-up spec).
- No buyer payouts, no refund-side payouts, no FX-aware payout.
- No tax / VAT / SSCL / NBT line items (deferred to a separate spec; supplier revenue-band data source is the open question).
- No net-30 dunning emails, no supplier-statement PDF, no credit-note PDF (each is its own follow-up).
- No multi-currency payout aggregation.

## Architecture

**Fix A** is a localized code change in `apps/api/src/modules/payments/routes.ts`. Remove the `online: 0` literal, call the existing `commission.resolveForOrder` path, surface the resolved commission cents alongside the payment record. The analytics endpoints already exist (`/api/admin/analytics/takeRate` 7/30/90d) — they will start showing non-zero numbers immediately.

**Fix C** is one new table + one cron handler + one new admin route group. Weekly Monday 03:00 LKR sweep computes prior-week completed-PO payable per supplier, writes a `payout_runs` row, and writes a corresponding ledger entry. Runs start in `pending`; admin transitions to `admin_approved` then `settled`. Idempotent across re-runs (one run per `(supplier_id, period_start, period_end)`).

**Period boundary (locked):** prior Sunday 18:00 SL local → current Sunday 18:00 SL local, inclusive start / exclusive end. Cron at Monday 03:00 SL local captures the prior week in full. Suppliers with zero completed POs in the window are **skipped** (no row created); avoids empty-row accumulation.

## Data model

### New table `payout_runs` (Fix C)

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | text | no | PK |
| `supplier_id` | text | no | FK `suppliers.id`, part of unique key |
| `period_start` | integer | no | unix (inclusive), part of unique key |
| `period_end` | integer | no | unix (exclusive), part of unique key |
| `total_cents` | integer | no | sum of payable line items |
| `currency` | text | no | default `'LKR'` |
| `status` | text | no | `pending` \| `admin_approved` \| `settled` |
| `line_items_json` | text | yes | JSON array of `{ poId, amountCents, completedAt }` for audit |
| `created_by` | text | yes | null when cron, admin user id when manual |
| `approved_by` | text | yes | admin user id |
| `settled_at` | integer | yes | unix, set on `settled` transition |
| `created_at` | integer | no | unix |

**Unique constraint:** `(supplier_id, period_start, period_end)`. Cron upserts; second invocation in the same period is a no-op.

No schema changes for Fix A — it uses the existing `payments` table columns. The current row shape already stores commission in some form via the analytics projection; if not, add one column in the same migration (`commission_cents integer not null default 0`).

### Migration `0047_payout_runs_and_commission_cents.sql`

```sql
-- Fix C
CREATE TABLE IF NOT EXISTS payout_runs (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  period_start integer NOT NULL,
  period_end integer NOT NULL,
  total_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'LKR',
  status text NOT NULL DEFAULT 'pending',
  line_items_json text,
  created_by text,
  approved_by text,
  settled_at integer,
  created_at integer NOT NULL,
  UNIQUE (supplier_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS payout_runs_status_idx ON payout_runs (status);
CREATE INDEX IF NOT EXISTS payout_runs_supplier_idx ON payout_runs (supplier_id);

-- Fix A (only if commission_cents does not already exist on payments)
-- Verify during plan; if present, skip this ALTER.
-- ALTER TABLE payments ADD COLUMN commission_cents integer NOT NULL DEFAULT 0;
```

## Modules & file layout

### Fix A

- `apps/api/src/modules/payments/routes.ts` — drop the `online: 0` literal; insert a call to `commission.resolveForOrder(ctx.env.DB, orderId, { channel: 'online' })`. Persist resolved `commissionCents` to `payments` row when the column exists.
- `apps/api/src/modules/finance/commission.ts` — no change (already exposes precedence chain).
- `packages/validation/src/payments.ts` — extend `paymentCreateResponseSchema` to include `commissionCents`.

### Fix C

- `apps/api/src/modules/payouts/repository.ts` (new) — Drizzle queries: upsert run by `(supplier_id, period_start, period_end)`, list pending runs, get run by id, transition status.
- `apps/api/src/modules/payouts/service.ts` (new) — `computeWeeklyPayable(d1, periodStart, periodEnd)` aggregates prior-week completed POs per supplier; `runWeeklyPayouts(d1)` (cron entry) wraps it; `approveRun(d1, runId, adminUserId)`; `settleRun(d1, runId, adminUserId)`.
- `apps/api/src/modules/payouts/routes.ts` (new) — public/admin endpoints below.
- `apps/api/src/modules/payouts/cron.ts` (new) — registers `runWeeklyPayouts` handler.
- `apps/api/src/modules/payouts/index.ts` + `adminIndex.ts` — exports.
- `apps/api/src/cron/handlers.ts` — add `handleWeeklyPayouts`.
- `apps/api/src/worker.ts` — register cron `0 3 * * 1` (Monday 03:00 SL local).
- `apps/api/src/modules/payouts/admin.ts` — keep the existing manual aggregation as the read source for the admin UI; refactor minimally to call `computeWeeklyPayable` for consistency.

Web app:

- `apps/web/src/lib/payoutsApi.ts` — typed client.
- `apps/web/src/hooks/usePayouts.ts` — TanStack hooks.
- `apps/web/src/admin/payouts/PayoutsListPage.tsx` — pending runs table with totals; each row → approval modal.
- `apps/web/src/admin/payouts/PayoutRunDetailPage.tsx` — line-item view, approve / settle actions.
- `apps/web/src/admin/payouts/PayoutRunApprovals.tsx` — small client component for two-step approval button.

Shared:

- `packages/db/src/schema/payouts.ts` — Drizzle table def mirroring the SQL above.
- `packages/validation/src/payouts.ts` — `payoutRunViewSchema`, `payoutRunApprovalSchema`.

## Cron + triggers

| Trigger | Mechanism | Notes |
| --- | --- | --- |
| Fix A | inline at order check payment | synchronous; payment flow already inline |
| Fix C weekly | `0 3 * * 1` in worker.ts | Monday 03:00 SL local; off-peak |

The Fix C cron is safe to run cold-start: no payout run exists for a period until first invocation writes it. Idempotent.

## Flag & rollout

| Feature | Flag | Reason |
| --- | --- | --- |
| Fix A | none | Bug fix; behavior change is correctness only. Direct merge + admin verification. |
| Fix C writes | `PAYOUTS_CRON_ENABLED` | Admins opt in to having the cron stage runs; the admin UI is always visible. |
| Fix C approval/settle | none | Admin-only; not a public feature. |

Phase 1 (default): A live (bug fix), C writes off (cron registered but no-ops on the dry-run path), admin UI visible and usable. Phase 2: flip `PAYOUTS_CRON_ENABLED` once admin team has validated staged totals.

## API surface

### Fix A

No new endpoints. Payment response now includes `commissionCents`. Analytics endpoints automatically light up.

### Fix C

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/admin/payouts/runs` | admin | List runs, filter by status / period |
| `GET` | `/api/admin/payouts/runs/:id` | admin | Run detail + line items |
| `POST` | `/api/admin/payouts/runs/:id/approve` | admin | `pending → admin_approved` |
| `POST` | `/api/admin/payouts/runs/:id/settle` | admin | `admin_approved → settled`; sets `settled_at` |
| `POST` | `/api/admin/payouts/runs/preview` | admin | Dry-run: pass `periodStart` / `periodEnd`, returns aggregated per-supplier totals without writing |

Two-step approval (`approve` then `settle`) is intentional: prevent a single click from moving money.

## Testing

Target: full monorepo `pnpm test` green before ship.

### Fix A

- `apps/api/test/payments/commission-route.test.ts` — order paid via PayHere resolves commission via precedence chain; non-zero response when defaults are in force; zero only when an explicit override exists.
- `apps/api/test/payments/routes.test.ts` — `commissionCents` present in payment create response.

### Fix C

- `apps/api/test/payouts/service.test.ts` — `computeWeeklyPayable` aggregates correctly per supplier; excludes current-week POs; excludes non-`completed` POs; suppliers with zero POs in window are omitted from the result (no zero-row returned).
- `apps/api/test/payouts/cron.test.ts` — weekly cron writes one row per supplier; re-invocation in same period is idempotent.
- `apps/api/test/payouts/routes.test.ts` — approval transitions `pending → admin_approved`; settle transitions `admin_approved → settled`; double-settle rejected.
- `apps/web/src/admin/payouts/PayoutRunApprovals.test.tsx` — disabled state, two-click confirm pattern.

## Risks & mitigations

- **PayHere edge cases** — the commission path already handles `online` channel for non-PayHere online flows; the change makes PayHere match. Verify the existing test suite covers cross-channel paths before merging.
- **Cron back-pressure** — if run scope grows (multi-period reconciliation, supplier aggregates with >10k POs each), add batching. Out of scope; document.
- **Manual payouts still work** — keep `/admin/payouts` legacy view alive alongside the new runs list; mark legacy "deprecated" but do not remove in this spec.
- **Idempotency on cron retry** — the unique constraint on `(supplier_id, period_start, period_end)` plus UPSERT handles this; per-spec, suppliers with zero completed POs in the window are skipped, so cron re-runs produce identical results.

## Out of scope (deferred)

- Sponsored-invoice → payout reconciliation (sponsored revenue currently bypasses payout accounting).
- Tax / VAT / SSCL / NBT line items on invoices and payouts (separate spec; supplier revenue-band data source open).
- Auto-settlement (transfers out require admin click).
- Multi-currency aggregation (single LKR per run for now).
- Buyer payouts, refund-side payouts, FX hedging on payout runs.
- Net-30 dunning emails to buyers.
- Supplier-statement PDF, credit-note PDF.
- CSV bulk-import for catalog (separate spec).
- Real OFAC list fetcher (sandbox SEED-only today).
- AML/STR report generation (FIU compliance gap).
- PostHog event tracking, funnel endpoints, cohort dashboard.
- Rescoped #5 standing POs (not part of P0).
- P1 sequence (PayHere recurring, sponsored auto-renew, buyer plans).
- P2/P3 sequence (#3 promotions, #4 reorder, #8 referrals, WhatsApp deep-link).

See `docs/superpowers/specs/2026-09-17-vyro-platform-audit-revenue-gaps.md` (companion research doc) for the gap matrix that produced this sweep.
