# Sponsored Listings — Phase 1 Verification Notes

**Date:** 2026-09-16
**Phase:** 1 of 3 — Admin only
**Audience:** Internal admin team
**Flag:** `SPONSORED_LISTINGS_ENABLED = true` (admin-only scope)
**Plan:** `docs/superpowers/plans/2026-09-16-sponsored-listings.md`

## Scope of Phase 1

Admin-only rollout. Backoffice CRUD, plan/slot/campaign governance, approve/reject/revoke/pin flows all live. Supplier self-service UI returns 404 (`FEATURE_DISABLED`) until Phase 2. Buyer surfaces (`/search/products`, `/home/feed`, `/suppliers/by-slug/:slug`) return their existing payloads; the `sponsored` array is empty because admin has not yet created any `approved` campaigns. This is the intended state for Phase 1.

## What ships now

### Backend (Hono + D1)

- **Migrations applied:** `0042_sponsored_listings.sql` (6 tables, indexes, CHECK constraints), `0043_sponsored_seed.sql` (Bronze/Silver/Gold plans + 10 default slots)
- **Schema:** `packages/db/src/schema/sponsored.ts`
- **Validation:** `packages/validation/src/sponsored.ts` — zod schemas for every DTO
- **Error codes** added to `apps/api/src/lib/errors.ts`: `FEATURE_DISABLED`, `INVALID_DATE_RANGE`, `SLOT_NOT_AVAILABLE`, `SLOT_NOT_PURCHASED`, `INSUFFICIENT_CREDITS`, `INELIGIBLE_SUPPLIER`, `CAMPAIGN_NOT_EDITABLE`, `CONFLICT`
- **Repository** `apps/api/src/modules/sponsored/repository.ts` — 6-entity CRUD
- **Service** `apps/api/src/modules/sponsored/service.ts` — `resolveSlots`, `checkEligibility`, `computeInvoiceCents`, `proratedRefundCents`, `getDisclosure`
- **Public routes** `apps/api/src/modules/sponsored/routes.ts` — disclosure, event tracking, resolve (all flag-gated)
- **Admin routes** `apps/api/src/modules/sponsored/adminRoutes.ts` — full governance (flag-gated + admin role gate)
- **Cron** `sponsoredExpireSweep` registered in `apps/api/src/cron/handlers.ts` and wired into `worker.ts` `scheduled()` at `"0 * * * *"`

### Frontend (React SPA)

- **API client** `apps/web/src/lib/sponsoredApi.ts`
- **Hooks** `apps/web/src/hooks/useSponsored.ts` — TanStack Query
- **Slot component** `apps/web/src/components/SponsoredSlot.tsx`
- **Disclosure page** `apps/web/src/pages/SponsoredDisclosure.tsx` (public)
- **Admin pages** `apps/web/src/admin/sponsored/`:
  - `PlansPage.tsx`, `PlanEditPage.tsx` — plan CRUD
  - `SlotsPage.tsx`, `SlotEditPage.tsx` — slot CRUD + pin
  - `CampaignsPage.tsx`, `CampaignReviewPage.tsx` — review queue, approve/reject/revoke

### Supplier UI

404s in Phase 1 (intentional, returns `FEATURE_DISABLED` via flag). Routes are wired and pages are written; they appear once the flag's audience policy permits.

## Verification steps performed

### 1. Type & build

- `pnpm --filter @vyro/api typecheck` — pass
- `pnpm --filter @vyro/web typecheck` — pass
- `pnpm --filter @vyro/db typecheck` — pass
- `pnpm --filter @vyro/validation typecheck` — pass

### 2. Migrations applied to local D1

```sh
pnpm --filter @vyro/api db:migrate:local
```

Migration `0042` creates: `sponsored_plans`, `sponsored_slots`, `sponsored_subscriptions`, `sponsored_campaigns`, `sponsored_events`, `sponsored_invoices`. Migration `0043` seeds 3 plans and 10 default slots covering all 4 surfaces.

### 3. Flag enabled locally

```sh
./apps/api/scripts/enable-flag.sh SPONSORED_LISTINGS_ENABLED true
```

### 4. Smoke endpoints (admin auth required)

| Endpoint | Expected | Status |
| --- | --- | --- |
| `GET /api/admin/sponsored/plans` | 200, returns 3 seeded plans | pending curl |
| `POST /api/admin/sponsored/plans` | 201, inserts new plan | pending curl |
| `PATCH /api/admin/sponsored/plans/:id` | 200 | pending curl |
| `GET /api/admin/sponsored/slots` | 200, returns 10 seeded slots | pending curl |
| `POST /api/admin/sponsored/slots` | 201, inserts new slot | pending curl |
| `PATCH /api/admin/sponsored/slots/:id` | 200, supports `pinned=1` | pending curl |
| `GET /api/admin/sponsored/campaigns` | 200, returns campaigns by status filter | pending curl |
| `POST /api/admin/sponsored/campaigns/:id/approve` | 200, status → `approved` | pending curl |
| `POST /api/admin/sponsored/campaigns/:id/reject` | 200, status → `rejected` | pending curl |
| `POST /api/admin/sponsored/campaigns/:id/revoke` | 200, status → `revoked` + prorated refund recorded | pending curl |
| `GET /api/admin/sponsored/campaigns/:id/analytics` | 200, returns impressions/clicks/CTR | pending curl |

### 5. Public buyer surfaces (flag on, no approved campaigns)

| Endpoint | Expected | Status |
| --- | --- | --- |
| `GET /api/search/products?q=...` | 200, includes `sponsored: []` field | pending curl |
| `GET /api/home/feed` | 200, includes `sponsored: []` field | pending curl |
| `GET /api/suppliers/by-slug/:slug` | 200, includes `otherSuppliersSponsored: []` field | pending curl |
| `GET /api/sponsored/disclosure` | 200, returns static disclosure copy | pending curl |
| `GET /api/supplier/sponsored/plans` | 404 `FEATURE_DISABLED` (Phase 1 scope) | pending curl |

### 6. Cron handler registered

`apps/api/src/cron/handlers.ts` includes `handleSponsoredExpireSweep`; `apps/api/src/worker.ts` `scheduled()` switch routes the `"0 * * * *"` pattern to it. Handler iterates `sponsored_campaigns` where `status='approved' AND endsAt <= now`, flips status to `expired`, computes `proratedRefundCents`, records a `sponsored_invoices` row for the refund, and bumps `slotCreditsRemaining` on the matching `sponsored_subscriptions`.

## Known limitations in Phase 1

- **No live traffic.** Until an admin approves a campaign, the `sponsored` array on buyer endpoints is empty by design.
- **No payment reconciliation.** Phase 1 invoices stay `pending`; admin marks `paid` by hand in the backoffice. Stripe/PayHere integration is out of scope.
- **No auto-renewal.** Campaigns are fixed-duration only (per design fork).
- **No automated tests for resolve rotation.** Determinism by design (FIFO + pinned + SHA-256 daily rotation); manual verification via admin tooling.

## Rollout to Phase 2

Once 1–2 admin-approved campaigns exist, flip the flag to expose the supplier UI: change the gate logic in `apps/api/src/modules/sponsored/routes.ts` so `/supplier/sponsored/*` returns 200 for invited beta suppliers only (gating by `suppliers.tags` or a separate beta allowlist table). Buyer surfaces do not need any further change — they already inject the `sponsored` field whenever the flag is on.

## Commits in Phase 1

T1 → T12 inclusive (15 commits, latest: `46498e1 feat(sponsored): buyer surface injection (search/home/storefront)`).
