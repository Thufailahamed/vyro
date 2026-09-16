# Sponsored Listings — Design Spec

**Date:** 2026-09-16
**Status:** Approved for planning
**Roadmap position:** Sub-project #7 of 8
**Pattern precedent:** `apps/api/src/modules/reviews/`, `apps/api/src/modules/learning/`

## Purpose

Enable suppliers to purchase paid placement positions on high-traffic buyer surfaces (search, category, homepage, storefront upsell). Tiered subscriptions + per-slot flat fee. Admin-approved. Self-serve with disclosure. Flag-gated with phased rollout.

## Decisions (locked during brainstorming)

| Fork | Decision |
|------|----------|
| Billing model | Tiered subscription (Bronze/Silver/Gold) + per-slot flat fee. No auction. No per-click billing. |
| Placement surfaces | Search results, category pages, homepage featured grid, storefront upsell strip. PDP deferred (conflict with sub-project #6 recommendations). |
| Campaign lifecycle | Fixed-duration (start/end date), no auto-renew. Admin extend or revoke. |
| Eligibility | KYC verified + at least 1 published product. |
| Payment | Admin-generated invoice + ledger entry. Manual reconciliation. No auto-charge. |
| Slot tie-break | Time-ordered FIFO with deterministic daily rotation (hash of campaign_id + day). Admin pin override. |
| Approval + disclosure | Admin approve/reject with reason. "Sponsored" badge required on all rendered placements + `/sponsored` disclosure page. |

## Architecture

New module `apps/api/src/modules/sponsored/` following repo pattern:

```
sponsored/
├── repository.ts       # D1 DB layer
├── service.ts          # Business rules + slot resolution algorithm
├── errors.ts           # SponsoredError class + codes
├── routes.ts           # Public + supplier endpoints
├── adminRoutes.ts      # Admin endpoints
├── index.ts            # Module exports + flag check
└── adminIndex.ts       # Admin router wiring
```

Migration `packages/db/migrations/0042_sponsored_listings.sql` defines 6 tables (see data model). Seed migration `0043_sponsored_seed.sql` populates default plans + slots.

Feature flag: `SPONSORED_LISTINGS_ENABLED` (single; gates API + UI). Mirrors `LEARNING_CENTER_ENABLED` pattern. Off = zero overhead (no ranking injection, no UI render, no cron job).

Cron: extend `apps/api/src/cron/dispatcher.ts` to register `sponsoredExpireSweep` hourly. Transitions expired campaigns + sends notification hooks.

Public disclosure: `/sponsored` static page, content served from API (`GET /api/sponsored/disclosure`) so policy can be updated without deploy.

## Data model

### `sponsored_slots` — slot definitions
- `id` uuid PK
- `surface` enum: `search` | `category` | `homepage` | `storefront`
- `position` int (0-indexed within surface)
- `category_id` text nullable (null = all-categories; scoped to one category otherwise)
- `label` text (admin-facing)
- `daily_rate_cents` int
- `active` int (0/1)
- `created_at`, `updated_at` int unix
- Unique: `(surface, position, category_id)`

### `sponsored_plans` — subscription tiers
- `id` uuid PK
- `tier` enum: `bronze` | `silver` | `gold`
- `name` text
- `monthly_rate_cents` int
- `included_slot_credits` int
- `active` int (0/1)

### `sponsored_subscriptions` — supplier plan subscription
- `id` uuid PK
- `supplier_id` uuid FK → suppliers
- `plan_id` uuid FK → sponsored_plans
- `starts_at`, `ends_at` int unix
- `status` enum: `active` | `expired` | `cancelled`
- `slot_credits_remaining` int
- `created_at` int unix
- Index: `(supplier_id, status)`

### `sponsored_campaigns` — per-slot campaign booking
- `id` uuid PK
- `supplier_id` uuid FK → suppliers
- `slot_id` uuid FK → sponsored_slots
- `product_id` uuid FK → products (the listing promoted)
- `starts_at`, `ends_at` int unix
- `status` enum: `pending_approval` | `pending_payment` | `approved` | `live` | `expired` | `rejected` | `revoked` | `cancelled`
- `payment_invoice_id` uuid nullable FK → sponsored_invoices
- `admin_notes` text
- `pinned` int (0/1) admin override
- `created_at`, `updated_at` int unix
- Index: `(slot_id, status, starts_at, ends_at)` for slot resolution

### `sponsored_events` — analytics (impressions + clicks)
- `id` uuid PK
- `campaign_id` uuid FK
- `event_type` enum: `impression` | `click`
- `surface` enum
- `occurred_at` int unix
- `request_id` text (dedupe key)
- `user_id_hash` text (no PII; anon-id for unauth, session-hash for auth)
- Index: `(campaign_id, event_type, occurred_at)`
- UNIQUE INDEX: `request_id` (TTL cleanup by cron after 7 days)

### `sponsored_invoices` — admin-generated invoice per campaign
- `id` uuid PK
- `campaign_id` uuid FK
- `supplier_id` uuid FK
- `amount_cents` int
- `status` enum: `pending` | `paid` | `waived`
- `created_at` int unix
- `paid_at` int nullable
- Index: `(supplier_id, status)`

Ledger entries reused from existing `packages/ledger/` (credit/debit on payment).

## API surface

### Public flag-gated
- `GET /api/sponsored/disclosure` → static policy JSON `{version, title, body, lastUpdated}`
- `POST /api/sponsored/events` → body `{campaignId, eventType, surface, requestId}`. Authenticated-or-anonymous. Dedupes by `requestId` (UNIQUE per 24h).
- `GET /api/buyer/search` → extended response: `{results: [...organic], sponsored: [{slotId, campaignId, productId, supplierId, surface, position}]}`
- `GET /api/buyer/category/:id` → same shape
- `GET /api/home/featured` → `{sponsored: [...], organic: [...]}`
- `GET /api/storefront/:supplierId` → extended with `otherSuppliersSponsored: [...]`

### Supplier (role-gated: owner/sales/ops/finance)
- `GET /api/supplier/sponsored/plans`
- `POST /api/supplier/sponsored/subscriptions` → subscribe
- `GET /api/supplier/sponsored/subscriptions/me`
- `DELETE /api/supplier/sponsored/subscriptions/:id` → cancel
- `GET /api/supplier/sponsored/slots?surface=&categoryId=`
- `POST /api/supplier/sponsored/campaigns` → create (validates eligibility + creates invoice)
- `GET /api/supplier/sponsored/campaigns?status=`
- `GET /api/supplier/sponsored/campaigns/:id`
- `PATCH /api/supplier/sponsored/campaigns/:id` → edit dates (only if status IN pending_payment/pending_approval/approved)
- `DELETE /api/supplier/sponsored/campaigns/:id` → cancel (only if status NOT IN live/expired) → status=`cancelled` + void invoice if unpaid / refund if paid
- `GET /api/supplier/sponsored/invoices`
- `POST /api/supplier/sponsored/invoices/:id/pay` → mark paid (manual; admin endpoint also exists)

### Admin (admin role)
- `GET/POST/PATCH/DELETE /api/admin/sponsored/plans`
- `GET/POST/PATCH/DELETE /api/admin/sponsored/slots`
- `GET /api/admin/sponsored/campaigns?status=&surface=&supplierId=`
- `GET /api/admin/sponsored/campaigns/:id`
- `POST /api/admin/sponsored/campaigns/:id/approve` → status=`pending_payment` + creates invoice (if not exists)
- `POST /api/admin/sponsored/campaigns/:id/reject` → status=`rejected` + reason (refund if paid)
- `POST /api/admin/sponsored/campaigns/:id/revoke` → status=`revoked` + admin_notes (prorated refund if mid-flight)
- `POST /api/admin/sponsored/campaigns/:id/pin` → toggle pinned
- `POST /api/admin/sponsored/invoices/:id/waive`
- `POST /api/admin/sponsored/invoices/:id/mark-paid` → for reconciliation
- `GET /api/admin/sponsored/analytics?from=&to=&campaignId=` → impressions/clicks/CTR

## Slot resolution algorithm

`service.resolveSlots(surface, categoryId, now)`:

```
slots = active slots for surface + (categoryId or null=global)
result = []
for each slot:
  candidates = campaigns where
    slot_id = slot.id
    AND status IN ('approved','live')
    AND starts_at <= now <= ends_at
  if candidates empty: continue
  pinned = candidates where pinned=1
  if pinned: winner = first(pinned ORDER BY created_at ASC)
  else:
    ordered = candidates ORDER BY created_at ASC
    dayBucket = floor(now / 86400)
    winner = ordered[ hash(campaign_id + dayBucket) % len(ordered) ]
  result.append({slotId, campaignId, productId, supplierId, badge: 'Sponsored'})
return result
```

Hash function: SHA-256 first 8 bytes → uint. Deterministic per day.

Eligibility gate (in service):
- Supplier has KYC status `verified`
- Supplier has ≥ 1 product with status `published`
- Slot scope (category_id) matches an active category

## UI surfaces

### Buyer
- `<SponsoredSlot>` component wraps a product card, renders identical card + "Sponsored" badge top-left
- Badge tooltip → "Paid placement. Learn more" → disclosure page
- Insertion points:
  - `apps/web/src/pages/search/` — top N=slot count of search results
  - `apps/web/src/pages/category/` — top N=slot count
  - `apps/web/src/pages/home/` — featured grid prepended
  - `apps/web/src/storefront/[id]/` — bottom strip "Other suppliers"
- PDP, cart, checkout — NOT touched (deferred)
- Disclosure route `/sponsored` — static page from API

### Supplier (`/supplier/sponsored/*`)
- `Index` — KPI strip: active campaigns, expiring soon, pending invoices
- `PlansPage` — Bronze/Silver/Gold cards + Subscribe
- `SubscriptionsPage` — current plan + cancel
- `BrowseSlotsPage` — filter by surface/category, slot cards with daily rate
- `CampaignFormPage` — pick slot/product/dates, inline eligibility check
- `CampaignsListPage` — own campaigns with status chips + admin_notes
- `InvoicesPage` — pay/waive buttons

### Admin (`/admin/sponsored/*`)
- `AdminIndex` — KPIs: live campaigns, pending approvals, MTD revenue, CTR
- `PlansAdmin` — CRUD
- `SlotsAdmin` — CRUD
- `ApprovalQueue` — pending campaigns with approve/reject
- `CampaignsAdmin` — full list with status filters + revoke/pin
- `AnalyticsAdmin` — per-campaign table

All gated by `useFeatureFlag('SPONSORED_LISTINGS_ENABLED')`. Mirrors learning use pattern.

## Testing

TDD. Target test counts (matches `learning/` ship profile):
- Backend: ~25-35 new tests across `repository.test.ts`, `service.test.ts`, `routes.test.ts`, `adminRoutes.test.ts`, `analytics.test.ts`
- Web: ~10-15 new tests for hooks + components

Critical cases:
- Slot resolution: FIFO ordering, pinned override, rotation hash determinism, expired/pending excluded
- Eligibility gate: KYC missing → 422, no products → 422, slot category mismatch → 422
- Invoice math: total = daily_rate × days, prorated refund on revoke
- Event dedupe: same requestId → 1 row, different requestId → new row
- Concurrency: simultaneous campaign creation for same slot → both succeed, resolution handles N>1
- Slot unique constraint: duplicate `(surface, position, category_id)` → 409
- Status transitions: only valid paths allowed; invalid → 409

## Error handling

New codes in `apps/api/src/lib/errors.ts` (extending existing SponsoredError class):

| Code | HTTP | When |
|------|------|------|
| `NOT_ELIGIBLE` | 422 | Supplier fails KYC/product/category gate |
| `SLOT_UNAVAILABLE` | 409 | Slot inactive |
| `SLOT_DUPLICATE` | 409 | `(surface, position, category_id)` collision |
| `CAMPAIGN_NOT_EDITABLE` | 409 | Edit attempted on live/expired/rejected/revoked/cancelled |
| `CAMPAIGN_NOT_CANCELABLE` | 409 | Cancel attempted on live/expired/rejected/revoked/cancelled |
| `INVOICE_ALREADY_PAID` | 409 | Mark-paid on already-paid invoice |
| `INVALID_DATE_RANGE` | 422 | ends_at <= starts_at or starts_at in past |

All routed through existing `httpError()` helper.

## Ops

- Flag `SPONSORED_LISTINGS_ENABLED` default **OFF**. Defined in `apps/api/src/lib/flags.ts` + `packages/validation/src/flags.ts` (mirrors learning pattern).
- Seed migration `0043_sponsored_seed.sql`:
  - 3 plans: Bronze (LKR 25,000/mo, 0 slot credits), Silver (LKR 60,000/mo, 3 slot credits), Gold (LKR 150,000/mo, 8 slot credits)
  - Default slots: search ×3 (all-categories), category ×3 per active category (top 5 categories seeded), homepage ×6 (all-categories), storefront upsell ×1
- Cron `sponsoredExpireSweep` hourly:
  - `live` AND `ends_at < now` → `expired`
  - `approved` AND `starts_at <= now` → `live`
  - `approved` AND `ends_at < now` → `expired` (paid but window fully passed without display)
  - Send "expiring soon" supplier notifications (3-day warning for `live` campaigns)
  - Cleanup `sponsored_events` rows older than 7 days
- Disclosure page: `apps/web/src/pages/SponsoredDisclosure.tsx`, content from `/api/sponsored/disclosure`
- Observability: log events via existing SLO rules pattern (`sponsored.campaign.created`, `sponsored.event.logged`, `sponsored.slot.resolved`)

## Rollout phases

| Phase | Flag | Scope |
|-------|------|-------|
| 1 | ON for admin only | Seed loads, admin can CRUD plans/slots, no supplier UI, no buyer rendering |
| 2 | ON for supplier | Supplier UI live, campaigns created but buyer surfaces still organic |
| 3 | ON public | All 4 surfaces inject sponsored section, analytics live |

Each phase requires admin verification + rollback procedure documented in ops runbook.

## Files (proposed)

**API:**
- `packages/db/migrations/0042_sponsored_listings.sql`
- `packages/db/migrations/0043_sponsored_seed.sql`
- `packages/db/src/schema/sponsored.ts`
- `packages/validation/src/sponsored.ts`
- `apps/api/src/modules/sponsored/{repository,service,errors,routes,adminRoutes,index,adminIndex}.ts`
- `apps/api/src/modules/sponsored/test/{repository,service,routes,adminRoutes,analytics}.test.ts`
- `apps/api/src/lib/flags.ts` (add `SPONSORED_LISTINGS_ENABLED`)
- `apps/api/src/cron/sponsored.ts`
- `apps/api/src/cron/dispatcher.ts` (register sweep)

**Web:**
- `apps/web/src/lib/sponsoredApi.ts`
- `apps/web/src/hooks/useSponsored.ts`
- `apps/web/src/components/SponsoredSlot.tsx`
- `apps/web/src/pages/SponsoredDisclosure.tsx`
- `apps/web/src/supplier/sponsored/{Index,PlansPage,SubscriptionsPage,BrowseSlotsPage,CampaignFormPage,CampaignsListPage,InvoicesPage}.tsx`
- `apps/web/src/admin/sponsored/{AdminIndex,PlansAdmin,SlotsAdmin,ApprovalQueue,CampaignsAdmin,AnalyticsAdmin}.tsx`
- Modify: `apps/web/src/pages/search/`, `pages/category/`, `pages/home/`, `storefront/[id]/` to render `<SponsoredSlot>` at top

## Future work (deferred)

- Auto-deduct from supplier credit balance when invoice created
- Auction mode per slot (second-price blind bid)
- PDP cross-sell slot (conflicts with sub-project #6 recommendations)
- Drag-drop slot ordering in admin
- Bulk campaign import via CSV
- Real-time impression streaming (vs batched event log)
- Per-question quiz on policy acceptance (compliance onboarding)
- A/B test framework for slot position impact on CTR