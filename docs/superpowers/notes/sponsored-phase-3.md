# Sponsored Listings — Phase 3 Ship Notes

**Date:** 2026-09-16
**Phase:** 3 of 3 — Public ship
**Audience:** All verified suppliers + all buyers
**Flag:** `SPONSORED_LISTINGS_ENABLED = true`, allowlist dropped

## Ship summary

Sponsored listings feature is live in production. Suppliers can subscribe to a plan, claim slots, and submit campaigns for admin review. Approved campaigns appear above organic results on `/search/products`, `/home/feed`, and `/suppliers/by-slug/:slug`. Each placement carries a "Sponsored" badge linking to `/sponsored` for disclosure.

## What's live

### Buyer surfaces (public, no auth)

- `/search/products?q=...&categoryId=...` — returns `sponsored` array injected above `hits`. Each slot wrapped in `<SponsoredSlot>` with badge + product card.
- `/home/feed` — returns `sponsored` array in feed payload. UI renders up to 3 slots in the featured grid.
- `/suppliers/by-slug/:slug` — returns `otherSuppliersSponsored` array. UI renders upsell strip at page bottom (max 3 slots).
- `/sponsored` — static disclosure page (no PII, explains paid placement policy).

### Supplier surfaces (auth + role)

- `/supplier/sponsored/plans` — browse Bronze/Silver/Gold plans
- `/supplier/sponsored/subscriptions` — subscribe, view, cancel
- `/supplier/sponsored/slots` — browse available slots per surface
- `/supplier/sponsored/campaigns` — create, edit, list, view campaigns

### Admin surfaces (auth + admin role)

- `/admin/sponsored/plans` — create/edit/disable plans
- `/admin/sponsored/slots` — create/edit/pin slots
- `/admin/sponsored/campaigns` — review queue, approve/reject/revoke, analytics

### Background jobs

- `sponsoredExpireSweep` runs hourly (`0 * * * *`). Flips expired campaigns, records prorated refund invoice, returns slot credits.

## Final test run

```
@vyro/api  → 218 files, 971 tests passed, 1 skipped
@vyro/web  →  46 files, 142 tests passed
@vyro/auth / db / validation / payments / shared / ai / ui  → typecheck + build pass
pnpm -r typecheck  → all 9 workspaces pass
```

Sponsored cron test: `test/sponsored/cron.test.ts` — 1 test passing. Verifies that `handleSponsoredExpireSweep` flips expired campaigns and records the refund invoice.

## Schema migration

Production D1 migration applied:

- `0042_sponsored_listings.sql` — 6 tables, indexes, CHECK constraints
- `0043_sponsored_seed.sql` — 3 plans, 10 default slots

All migrations are idempotent (`IF NOT EXISTS` everywhere). Verified locally.

## Feature flag configuration

`feature_flags` config section in production:

```json
{
  "SPONSORED_LISTINGS_ENABLED": true
}
```

The supplier beta allowlist (`SPONSORED_BETA_SUPPLIER_IDS`) is dropped — all verified suppliers can use the supplier UI immediately.

## Operational checklist

- [x] Migrations applied to production D1
- [x] Cron handler registered in `worker.ts` `scheduled()` switch
- [x] Rate limiter shares global bucket (60 req/min); no per-route limits added (admin routes are gated by role, not rate)
- [x] Disclosure page live
- [x] Support playbook: admin approves campaign → supplier receives email via existing `notification_emails` queue (manual for now)
- [x] Analytics table reads: `sponsored_events` GROUP BY `campaignId, eventType`

## Known limitations / follow-ups

- **Payment reconciliation.** Admin marks invoice `paid` by hand after bank transfer. Stripe/PayHere auto-pay is a future enhancement.
- **Email notifications.** Admin approve/reject does not auto-email the supplier. Use existing `notification_emails` flow for now.
- **Per-surface rotation tuning.** Default 3 slots per surface. Configurable per-surface in admin UI (Phase 4+ if needed).
- **No supplier analytics.** Suppliers cannot see CTR for their own campaigns. Admin-only for now.
- **Search injection position.** Sponsored slots render above organic results. Consider interleaving at position 1, 4, 7 etc. in a future iteration based on click data.

## Rollout retrospective

- **Phase 1 (admin):** 1 day build, validation pass. Admin tooling landed cleanly. No buyer impact.
- **Phase 2 (beta):** 1 invited supplier, ran end-to-end, surfaced invoice status field ambiguity (fixed in commit `46498e1` — campaign POST returns both `campaign` and `invoice`).
- **Phase 3 (public):** Ship. Monitor `sponsored_campaigns` for first 48h. Watch for abuse patterns (duplicate campaigns, slot hoarding, click spam).

## Commits

- T1 → T12 (feature implementation): `commit 46498e1` is the latest
- Phase 1 verification note: `commit 71f0c9f`
- Phase 2 verification note: `commit 1079d5b`
- Phase 3 ship note: this commit
