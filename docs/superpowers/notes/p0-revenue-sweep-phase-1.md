# P0 Revenue Sweep — Phase 1 (ship notes)

**Date:** 2026-09-17
**Status:** Phase 1 — Fix A live, Fix C cron registered but no-op (flag off).

## What shipped

- **Fix A** — `apps/api/src/modules/payments/routes.ts` no longer hardcodes `feeCents=0` for `method=online`. Every online-paid order now resolves commission via the same `product > supplier > category > promotional > global rule > platform_settings.platformFeeBps > 250 bps default` precedence chain that `cash` and `bank_transfer` always used. Catch-block still falls back to global `platformFeeBps` if the precedence lookup throws.
- **Fix C** — Cron handler `handleWeeklyPayoutBatch` exported from `apps/api/src/cron/handlers.ts`. Registered at `30 21 * * 4` UTC = Friday 03:00 SL local (UTC+5:30). Aggregates suppliers with confirmed payments in `[periodEnd - 7d, periodEnd]` via the existing `aggregatePayableForSupplier` + `createPayout` repository path. Idempotent by `payouts_period_uq` on `(supplier_id, period_start, period_end)`. Gated on `PAYOUTS_CRON_ENABLED` (defaults off).

## Diff surface

- `apps/api/src/modules/payments/routes.ts` — removed the `if (parsed.data.method === 'online') { feeCents = 0 }` branch and the now-unused top-level `getPlatformFeeBps` import (still imported, kept for fallback inside the catch).
- `apps/api/src/modules/payouts/repository.ts` — added `listSuppliersWithConfirmedPaymentsSince(d1, sinceMs)` helper.
- `apps/api/src/cron/handlers.ts` — added `isFeatureEnabled` import + `handleWeeklyPayoutBatch` export + `WeeklyPayoutBatchResult` type.
- `apps/api/src/worker.ts` — added `handleWeeklyPayoutBatch` import + `case '30 21 * * 4':` block.
- Tests: 4 new tests across 2 files.

## Verification

- `pnpm --filter @vyro/api exec vitest run test/payments/commission-route.test.ts` — 3/3 PASS (math sanity + static regex on routes.ts source + import assertion).
- `pnpm --filter @vyro/api exec vitest run test/cron/handlers.weeklyPayouts.test.ts` — 5/5 PASS (exists, flag-off, flag-on/created, duplicate via UNIQUE, empty-period skip).
- `pnpm exec vitest run` (entire api package) — 993/993 PASS, 1 skipped (pre-existing D1 migrate stub-only).
- `pnpm exec tsc --noEmit` — clean.

## Phase 2 (next)

Flip `PAYOUTS_CRON_ENABLED=true` in the `feature_flags` config section after the admin team verifies a dry-run output. Suggested dry-run procedure:

1. In production-like env, drive the handler manually with `handleWeeklyPayoutBatch(env)` once before flipping. Read the result log; confirm suppliers + amounts look right.
2. Once satisfied, set the flag via the existing platform-admin `feature_flags` config UI.
3. Monitor `MoneyPage > Payout batches` queue Friday morning.

## Out of scope (deferred)

See `docs/superpowers/specs/2026-09-17-p0-revenue-bug-sweep-design.md` §Out of scope. Tax/VAT/SSCL line items (separate spec), Rescoped #5 standing POs, P1 sequence (PayHere recurring, sponsored auto-renew, buyer plans), P2/P3 sequence (#3 promotions, #4 reorder, #8 referrals, WhatsApp deep-link). The companion research doc `docs/superpowers/specs/2026-09-17-vyro-platform-audit-revenue-gaps.md` carries the full gap matrix.

## What this does NOT do

- Does not change `payments` schema (no new columns, no migration).
- Does not add a new `payouts` table row.
- Does not auto-settle payouts (`settled` transition still requires admin click).
- Does not reconcile sponsored-invoice → payout revenue.
- Does not introduce Sri Lanka tax (VAT/SSCL/NBT) logic.
- Does not fund Net14/Net30 buyer-side dunning.
