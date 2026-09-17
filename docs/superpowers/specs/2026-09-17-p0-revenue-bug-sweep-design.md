# P0 Revenue Bug Sweep — Design Spec

**Date:** 2026-09-17
**Roadmap item:** Pre-roadmap urgency sweep — fixes two concrete revenue/operational blockers discovered in 2026-09-17 platform audit
**Status:** Approved, ready for plan
**Owner:** Platform

## Goal

Stop the live online-channel commission leak and automate the existing payout batch flow. Two surgical fixes, no schema additions required.

1. **Fix A — Online-channel commission bypass.** Orders paid via the `online` payment method currently skip the commission path entirely. Every online-paid order leaks the default 2.5% (250 bps) take-rate. Restore the precedence-based commission resolution on all `online` method orders. (The route comment calls this the "0% policy for PayHere orders" but the code branch is keyed on the broader `method === 'online'` enum, not specifically PayHere.)
2. **Fix C — Weekly payout batch automation.** The payout batch admin UI, API endpoints (`/api/admin/payout-batches/batch`, `/queue`, `/approve/:id`), and supplier-side messaging ("Weekly bank payout batches are processed every Friday") all exist. The **cron that actually triggers the Friday run is missing**. Add it.

Both are revenue or operational blockers. Both are small enough to ship together — Fix C is purely an automation wrap around existing services.

## Non-goals

- No new commission rules, no per-product/per-supplier/per-category overrides (the existing precedence chain in `finance/commission.ts` is unchanged).
- No payout auto-settlement (final transfer remains a manual admin click after cron staging).
- No sponsored-invoice → payout reconciliation (`payouts/admin.ts` doesn't currently include sponsored revenue — explicitly deferred; needs a follow-up spec).
- No buyer payouts, no refund-side payouts, no FX-aware payout.
- No tax / VAT / SSCL / NBT line items (deferred to a separate spec; supplier revenue-band data source is the open question).
- No net-30 dunning emails, no supplier-statement PDF, no credit-note PDF (each is its own follow-up).
- No multi-currency payout aggregation.

## Architecture

**Fix A** is a localized code change in `apps/api/src/modules/payments/routes.ts`. Remove the `if (parsed.data.method === 'online') { feeCents = 0; } else { ... }` branch entirely — always call `resolveCommissionBps` and compute `feeCents` via `computePlatformFeeCents`. The analytics endpoints already exist (`/api/admin/analytics/takeRate` 7/30/90d) — they will start showing non-zero numbers immediately.

**Fix C** is purely an automation wrap. The `payouts` table, batch service (`apps/api/src/modules/admin/money/payoutBatchesService.ts`), endpoints (`/api/admin/payout-batches/batch`, `/queue`, `/approve/:id`), supplier-facing UI (`supplier/PaymentsPage.tsx:543` already says "Weekly bank payout batches are processed every Friday"), and admin UI (`admin/MoneyPage.tsx > PayoutBatchesTab`) all exist. Add the cron handler that calls the batch service and register its schedule.

**Period boundary (locked):** prior Sunday 18:00 SL local → current Friday 02:59 SL local, inclusive start / exclusive end. Cron at Friday 03:00 SL local (= Friday week-running aggregation) captures the prior week in full. The existing `aggregatePayableForSupplier` (`apps/api/src/modules/payouts/repository.ts:21`) filters confirmed payments by `[periodStart, periodEnd]` and excludes payments already attached to a `paid`/`processing` payout — this gives natural idempotency. Suppliers with zero eligible payments are skipped by `createPayout` (existing 409 on empty).

## Data model

**No schema changes.** The `payouts` table at `packages/db/src/schema/payouts.ts:5` already provides:
- `id`, `supplierId`, `amountCents`, `feeCents`, `netCents`, `currency`
- `status` enum: `['pending', 'processing', 'paid', 'failed']`
- `periodStart`, `periodEnd` with `payouts_period_uq` unique constraint on `(supplierId, periodStart, periodEnd)`
- `method`: `'bank' | 'cash'`, `initiatedByUserId`, `approvedByUserId`, `approvedAt`, `paidAt`, `paidByUserId`, `reference`, `externalReference`, `bankAccountId`, `batchId`, `idempotencyKey`, `failureReason`

The `payments` table at `packages/db/src/schema/payments.ts:21` already has `feeCents` and `netCents` columns. No migration required for either fix.

## Modules & file layout

### Fix A

- `apps/api/src/modules/payments/routes.ts` — drop the `online: 0` literal; insert a call to `commission.resolveForOrder(ctx.env.DB, orderId, { channel: 'online' })`. Persist resolved `commissionCents` to `payments` row when the column exists.
- `apps/api/src/modules/finance/commission.ts` — no change (already exposes precedence chain).
- `packages/validation/src/payments.ts` — extend `paymentCreateResponseSchema` to include `commissionCents`.

### Fix C

- `apps/api/src/cron/handlers.ts` — add `handleWeeklyPayoutBatch(env)`. Calls the existing `payoutBatchesService` (or the `aggregatePayableForSupplier` + `createPayout` path) for each eligible supplier in the computed period.
- `apps/api/src/worker.ts` — register cron `0 3 * * 5` (Friday 03:00 SL local). Mirror the existing `case '0 * * * *'` block.
- `apps/api/src/lib/featureFlags.ts` — no change; flag is read via `cfgSvc.read(d1, 'feature_flags')` directly inside the handler.

No new web files. `apps/web/src/admin/MoneyPage.tsx > PayoutBatchesTab` already lists batches and exposes approve. `supplier/PaymentsPage.tsx:543` already advertises "every Friday" — the cron makes that promise real.

Shared: no new files.

## Cron + triggers

| Trigger | Mechanism | Notes |
| --- | --- | --- |
| Fix A | inline at order check payment | synchronous; payment flow already inline |
| Fix C weekly | `0 3 * * 5` in worker.ts | Friday 03:00 SL local; off-peak. Matches UI promise in `supplier/PaymentsPage.tsx:543`. |

The Fix C cron is safe to run cold-start: no payout row exists for a period until first invocation writes it; second invocation in the same `(supplierId, periodStart, periodEnd)` slot is rejected by the `payouts_period_uq` unique index.

## Flag & rollout

| Feature | Flag | Reason |
| --- | --- | --- |
| Fix A | none | Bug fix; behavior change is correctness only. Direct merge + admin verification. |
| Fix C cron | `PAYOUTS_CRON_ENABLED` | Admins opt in to having the cron write batch payouts; the admin UI is always visible. |

Phase 1 (default): A live (bug fix), C registered but no-ops when flag is off. Phase 2: flip `PAYOUTS_CRON_ENABLED` once admin team has validated a dry-run output.

## API surface

### Fix A

No new endpoints. The `payments` row response already exposes `feeCents` and `netCents`. Analytics endpoints at `/api/admin/analytics/takeRate` 7/30/90d (`apps/api/src/modules/analytics/admin/routes.ts`) automatically start showing non-zero numbers.

### Fix C

No new endpoints. Reuses existing endpoints:
- `POST /api/admin/payout-batches/batch` — aggregates all eligible suppliers in current period.
- `GET  /api/admin/payout-batches/queue` — admin UI listing.
- `POST /api/admin/payout-batches/:id/approve` — admin approval.

## Testing

Target: full monorepo `pnpm test` green before ship.

### Fix A

- `apps/api/test/payments/routes.test.ts` — extend existing tests: (a) order paid via `method: 'online'` resolves commission via precedence chain; (b) `feeCents` in response is non-zero under defaults; (c) only zero when an explicit override exists.
- `apps/api/test/payments/commission-route.test.ts` (new) — focused regression on the branch we removed: there must be no code path that hard-codes 0 for `online` method.

### Fix C

- `apps/api/test/cron/handlers.weeklyPayouts.test.ts` (new) — `handleWeeklyPayoutBatch` short-circuits when `PAYOUTS_CRON_ENABLED` flag is off; iterates eligible suppliers; calls `aggregatePayableForSupplier` + `createPayout`; second invocation in the same period is rejected (uq); suppliers with no eligible payments are skipped (no error).
- `apps/api/test/cron/handlers.weeklyPayouts.flag.test.ts` (new) — verifies flag-on / flag-off gating.

## Risks & mitigations

- **PayHere edge cases** — the commission path already handles `online` for non-PayHere online flows; the change makes PayHere match. Verify the existing test suite covers cross-channel paths before merging. The fix is a single-branch deletion; risk is low.
- **Cron back-pressure** — if run scope grows (multi-period reconciliation, supplier aggregates with >10k POs each), add batching. Out of scope; document.
- **Manual payouts still work** — `/admin/payouts` legacy view is unchanged.
- **Idempotency on cron retry** — the unique constraint on `(supplier_id, period_start, period_end)` plus existing `createPayout` 409 handling prevents duplicate rows.
- **Friday schedule** — supplier `PaymentsPage.tsx:543` says "every Friday"; cron at `0 3 * * 5` makes that real. Verify the cron string lands at Friday 03:00 SL local under Cloudflare Workers' UTC interpretation (Workers uses UTC; Friday 03:00 SL = Thursday 21:30 UTC. Adjust cron to `30 21 * * 4` UTC = Friday 03:00 Colombo).

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
