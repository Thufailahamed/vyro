# BuyLeads E2E Smoke

## Pre-reqs

- `pnpm dev` from `apps/api/` (port 8787 by default)
- `pnpm dev` from `apps/web/`
- D1 `feature_flags` config section: `BUYLEADS_ENABLED = true`

## Walk

1. **Setup.** Sign in as supplier owner. Visit `/profile` (Settings page) → **BuyLeads** tab. Toggle on. Multi-select ≥1 category. Save.
2. **Seed RFQ.** As a buyer (separate account), create an RFQ with ≥1 line item whose product category matches a subscribed category. Status `open`, `publishedAt` set.
3. **Trigger digest.** Manual admin trigger via `POST /api/admin/cron/trigger { name: 'buyLeads.dailyDigest' }` (admin console Cron Triggers panel).
4. **Verify queue.** `NOTIFICATIONS_QUEUE.send` payload shape (kind `buyleads_digest`):
   ```json
   { "kind": "buyleads_digest",
     "recipientUserId": "...",
     "recipientEmail": "owner@a.lk",
     "subject": "N new RFQs matching your categories",
     "body": "<p>Hi,</p><p>N new RFQs matched your subscribed categories:</p><ul>...</ul><p>— Vyro BuyLeads</p>",
     "link": "/supplier/buyleads" }
   ```
5. **Verify email.** Supplier owner (the `role='owner'` member of the supplier) receives email with the RFQ links. Send is routed through `apps/api/src/queue/notifications.ts:handleBuyLeadsDigest` → `sendEmailOrThrow`.

## Negative cases

- **Flag off.** Set `BUYLEADS_ENABLED = false`.
  - `GET /api/supplier/buyleads/subs?supplierId=…` → 404.
  - `PUT /api/supplier/buyleads/subs?supplierId=…` → 404.
  - Cron run → `{ suppliersEmailed: 0, rfqsSent: 0 }`.
- **Disabled sub.** Supplier has sub but `enabled = false`. Cron run skips that supplier's row.
- **No categories.** Supplier has `categoryIds: []`. Matcher returns empty. Cron skips.
- **No subscription row.** Brand-new supplier. Matcher returns empty (default {enabled:false, categoryIds:[]}). Cron skips.
- **Stale RFQ.** RFQ created >24h ago. Window filter (`sinceMs = now − 24h`) excludes it.
- **Wrong category.** RFQ's line items all in categories the supplier is NOT subscribed to. Cron run excludes it.
- **Non-owner members.** `runDailyDigest` joins `supplier_members` where `role='owner'` AND `status='active'`. Sales/operations members are not selected as recipients in this MVP.

## Data model assumptions

- Subscription table: `supplier_buy_lead_subscriptions (id, supplier_id [uniq], enabled, category_ids_json, created_at, updated_at)`.
- Categories stored as JSON in `category_ids_json` (text). Max 200 entries (validation cap).
- Matching: RFQ is in window IF `rfqs.status='open'` AND `rfqs.is_open=1` AND `rfqs.published_at IS NOT NULL` AND `created_at >= sinceMs` AND any `rfq_items.productId → products.categoryId` ∈ sub.categoryIds.
- Top 10 ordered by `rfqs.created_at DESC`.
- No dedup across days.
- Single recipient per supplier (owner member); expand later if multiple seats wanted.

## Email payload construction

- Email body rendered in `apps/api/src/modules/buyLeads/service.ts:buildDigestPayload`.
- Links: `/supplier/rfqs/${rfqId}` per match.
- List of `rfqNumber — title` items, HTML-escaped.
- Subject: `${count} new RFQ${plural}` matching your categories.
- Rendered link in `link` field for any future deep-link helper.

## Known limits (per spec)

- Lanka-centric timestamps (`30 1 * * *` UTC = 07:00 SLST). For DST/per-region rollout, move to a config-driven cron + timezone per supplier.
- No per-supplier cadence override (daily only).
- No per-category win-rate scoring (recency only).
- No reply-to / personalized "Hi ${name}" substitution.
- Email-send retries piggyback on `NOTIFICATIONS_QUEUE` semantics (3 retries; bounce → no auto-suppression).
- Category list loaded from `/api/categories`; admin soft-deleted categories are filtered out client-side.
