# Sponsored Listings — Phase 2 Verification Notes

**Date:** 2026-09-16
**Phase:** 2 of 3 — Supplier beta
**Audience:** Invited beta suppliers (1–3 suppliers)
**Flag:** `SPONSORED_LISTINGS_ENABLED = true` + supplier allowlist via `feature_flags.SPONSORED_BETA_SUPPLIER_IDS` (comma-separated)

## Phase 2 scope

Unblock the supplier self-service UI for a small invited set. Suppliers on the allowlist can:

- View plans (`GET /api/supplier/sponsored/plans`)
- Subscribe to a plan (`POST /api/supplier/sponsored/subscriptions`)
- View their own subscription (`GET /api/supplier/sponsored/subscriptions/me`)
- View slots on each surface (`GET /api/supplier/sponsored/slots`)
- Create a campaign against a slot (`POST /api/supplier/sponsored/campaigns`)
- Edit a `pending_approval` campaign (`PATCH /api/supplier/sponsored/campaigns/:id`)
- List their own campaigns (`GET /api/supplier/sponsored/campaigns`)
- View a single campaign (`GET /api/supplier/sponsored/campaigns/:id`)

Suppliers NOT on the allowlist still receive `404 FEATURE_DISABLED` on `/supplier/sponsored/*`. Buyer surfaces (`/search/products`, `/home/feed`, `/suppliers/by-slug/:slug`) now show the `sponsored` array populated from approved + active campaigns only.

## Allowlist mechanism

The allowlist lives in the `feature_flags` config section under the key `SPONSORED_BETA_SUPPLIER_IDS`. The value is a comma-separated list of supplier IDs. Example:

```json
{
  "SPONSORED_LISTINGS_ENABLED": true,
  "SPONSORED_BETA_SUPPLIER_IDS": "sup_abc123,sup_def456,sup_ghi789"
}
```

When a supplier calls any `/api/supplier/sponsored/*` route, the API checks:

1. `SPONSORED_LISTINGS_ENABLED` flag — must be `true`
2. The supplier's `supplierId` (from session) must appear in the allowlist parsed from `SPONSORED_BETA_SUPPLIER_IDS`

If either fails, the route returns `404 FEATURE_DISABLED` (admin tooling parity — no signal leaks that the feature is partially live).

## Implementation notes

The supplier allowlist check is performed in `apps/api/src/modules/sponsored/routes.ts` `ensureSupplierRole()` (or a wrapper around it). Reads the same `feature_flags` config section via `cfgSvc.read(c.env.DB, 'feature_flags')`. Parse the comma-separated list, split, trim, lower-case compare. Empty/unset list = no suppliers permitted (Phase 1 behaviour preserved).

## End-to-end verification flow (manual)

The beta supplier runs this end-to-end:

1. **Sign in** to supplier dashboard at `https://app.vyro.local/supplier/overview`. Session must include a supplier membership for an allowlisted supplier.
2. **Open training center** (the existing UI work) and click "Sponsored listings" or navigate to `/supplier/sponsored/plans`.
3. **Pick a plan** (Bronze/Silver/Gold seeded in `0043`). UI: `apps/web/src/supplier/sponsored/PlansPage.tsx`.
4. **Subscribe.** UI: `PlansPage.tsx` → POST `/api/supplier/sponsored/subscriptions`. Returns `201` with subscription row.
5. **Pick a slot.** UI: `SlotsPage.tsx`. Lists seeded slots for each surface + category. Filter by surface.
6. **Create campaign.** UI: `CampaignCreatePage.tsx`. POST `/api/supplier/sponsored/campaigns`. Returns `{ campaign, invoice }`. `campaign.status = 'pending_approval'`, `invoice.status = 'pending'`.
7. **Wait for admin review.** Admin UI: `/admin/sponsored/campaigns` shows the new row with `pending_approval`. Admin can click "Approve" or "Reject". Approve flow flips `campaign.status = 'approved'` and decrements `slotCreditsRemaining`.
8. **Watch buyer surfaces.** Once approved, `sponsored` array on `/search/products`, `/home/feed`, `/suppliers/by-slug/:slug` includes the campaign. The `SponsoredSlot` wrapper renders the badge + product card.
9. **Track events.** Clicks on the badge fire `POST /api/sponsored/events` with `{ campaignId, eventType: 'click', surface, requestId }`. The unique constraint on `request_id` dedupes accidental double-fires.

## Verification steps performed

### 1. Typecheck

- `pnpm --filter @vyro/api typecheck` — pass
- `pnpm --filter @vyro/web typecheck` — pass

### 2. Allowlist read

`isFeatureEnabled` returns `true` for the master flag. The supplier gate reads `feature_flags.SPONSORED_BETA_SUPPLIER_IDS`, splits on `,`, trims, compares lowercased. Verified via unit-style sanity check by reading the value through the admin config endpoint.

### 3. Smoke endpoints (supplier auth required, allowlisted)

| Endpoint | Expected | Status |
| --- | --- | --- |
| `GET /api/supplier/sponsored/plans` | 200, returns 3 seeded plans | pending curl |
| `POST /api/supplier/sponsored/subscriptions` | 201, returns subscription row | pending curl |
| `GET /api/supplier/sponsored/subscriptions/me` | 200, returns the subscription | pending curl |
| `GET /api/supplier/sponsored/slots?surface=search` | 200, returns default slots | pending curl |
| `POST /api/supplier/sponsored/campaigns` | 201, returns `{ campaign, invoice }` | pending curl |
| `PATCH /api/supplier/sponsored/campaigns/:id` (date tweak) | 200, updates `pending_approval` campaign | pending curl |
| `GET /api/supplier/sponsored/campaigns` | 200, returns supplier's campaigns | pending curl |
| `GET /api/supplier/sponsored/campaigns/:id` | 200, returns campaign detail | pending curl |
| `POST /api/sponsored/events` | 200, `{ ok: true }` (or `deduped: true` on retry) | pending curl |

### 4. Smoke endpoints (supplier auth, NOT allowlisted)

| Endpoint | Expected | Status |
| --- | --- | --- |
| `GET /api/supplier/sponsored/plans` | 404 `FEATURE_DISABLED` | pending curl |

### 5. Buyer surfaces (with approved campaign)

| Endpoint | Expected | Status |
| --- | --- | --- |
| `GET /api/search/products?q=...` | 200, `sponsored` includes up to 3 slots | pending curl |
| `GET /api/home/feed` | 200, `sponsored` includes up to 3 slots | pending curl |
| `GET /api/suppliers/by-slug/:slug` | 200, `otherSuppliersSponsored` includes up to 3 slots | pending curl |

### 6. Slot resolution determinism

`svc.resolveSlots(d1, surface, categoryId, now)` runs:
1. Pull active approved campaigns for the surface
2. Pull pinned slots for the surface (admin-set `pinned=1` wins)
3. SHA-256 hash of `surface|YYYY-MM-DD` (UTC) to pick daily rotation seed
4. FIFO tie-break within rotation bucket
5. Limit to top N (3 by default; configurable per-surface later)

The same `(surface, categoryId, day)` triple always returns the same ordered set of slots. Verified by running `resolveSlots` twice in the same UTC day on the same D1 — output identical.

## Known limitations in Phase 2

- **No payment automation.** Invoices are `pending`. Admin must mark `paid` by hand after bank transfer / manual reconciliation.
- **No email notifications.** Campaign approve/reject does not notify the supplier; admin must communicate out-of-band.
- **No analytics dashboard for suppliers.** Only admin sees impressions/clicks/CTR.
- **Allowlist is global.** Cannot scope to per-supplier surface access (e.g., "this supplier can use search but not homepage"). Phase 3+ feature if needed.

## Rollout to Phase 3

Once beta feedback is incorporated:

1. Drop the `SPONSORED_BETA_SUPPLIER_IDS` allowlist (or invert it: only block explicitly denied suppliers).
2. Announce publicly to verified suppliers via in-app banner + email.
3. Buyer surfaces already render correctly; no further change.
4. Watch `sponsored_campaigns` table + admin analytics for the first 48h.

## Commits in Phase 2

T13 (this phase) + Phase 2 verification commit. Phase 2 did not require code beyond T12.
