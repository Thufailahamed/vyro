# Vyro Supplier Ratings & Reviews — Design

Date: 2026-09-13
Status: Draft (awaiting user review)
Scope: First growth-initiative spec. Ratings & reviews only. Other roadmap items (trust badges, promotions, saved carts, subscriptions, recommendations, featured listings, referral, WhatsApp commerce) are tracked separately and out of scope.

## Goals

- Give buyers a public, trustworthy signal of supplier reliability before they place an order.
- Give suppliers actionable feedback and a public response channel.
- Lift buyer conversion (search → PDP → checkout) and supplier retention on the platform.

## Non-goals

- Two-sided reviews (supplier → buyer) at launch.
- Sub-scores, photos, structured tags.
- Rate limiting, burst detection, ML-based moderation.
- Search-ranking weight on rating.

## Decisions (locked from brainstorm)

| Question | Decision |
| --- | --- |
| Unit of review | Supplier-level only |
| Eligibility | After order status = `delivered` |
| Score | Single 1–5 overall |
| Content | Free-text body only |
| Supplier response | Public reply + flag-for-review (auto-hide on flag) |
| Moderation | Auto-publish + buyer-report flag + admin queue (no NLP at launch) |
| Dispute link | Auto-hide review when dispute opens; restore on resolve |
| Display surfaces | Supplier card (search), supplier profile, PDP (via product's supplier) |
| Anti-abuse floor | 1 review per (supplier, order), admin delete only |
| Architecture | New `reviews/` module mirroring `credit/` |

## Architecture

```
orders ─► (delivery confirmed) ─► reviews.supplier_reviews ─► aggregates │
                                         ├── suppliers.review_count, review_avg, last_review_at (denormalized)
                                         └── admin/review queue (flagged only)

disputes ─► (opened)   ─► reviews.markOrderDisputed(orderId)  ─► review status = hidden_by_dispute
disputes ─► (resolved) ─► reviews.markOrderResolved(orderId)  ─► review status = published (if not flagged/removed)
```

### Module boundary

- **NEW** `apps/api/src/modules/reviews/` owns schema, repository, service, routes, and dispute-callable hooks.
- `orders/` and `disputes/` push state changes via service calls into `reviews`. They do not write directly to `supplier_reviews`.
- `suppliers/` reads its denormalized aggregate columns. No FK coupling.
- `admin/` adds moderation endpoints that delegate to `reviews` service.

### Files touched

- NEW `apps/api/src/modules/reviews/{schema.ts,repository.ts,service.ts,routes.ts,hooks.ts}`
- NEW `apps/api/src/modules/reviews/index.ts`
- NEW `apps/api/test/reviews/{service.test.ts,routes.test.ts}`
- `apps/api/src/modules/orders/routes.ts` (call `reviews.recomputeSupplierAggregate` after delivery)
- `apps/api/src/modules/disputes/{routes.ts,service.ts}` (call `reviews.markOrderDisputed/Resolved`)
- `apps/api/src/modules/suppliers/{schema.ts,repository.ts,routes.ts}` (add aggregate columns + getter)
- `apps/api/src/modules/admin/routes.ts` (add `/api/admin/reviews/flags/*`)
- `packages/db/src/schema/{suppliers,supplierReviews,supplierReviewReplies,supplierReviewFlags}.ts`
- NEW D1 migration `packages/db/migrations/<ts>_supplier_reviews.sql`
- `packages/validation/src/{reviews,supplierReviews}.ts` (Zod)
- NEW `apps/web/src/reviews/{RatingStars,RatingDistribution,ReviewList,ReviewForm,SupplierReplyForm,FlagReviewButton,AdminReviewQueue}.tsx`
- NEW `apps/web/src/reviews/hooks/{useReviewEligibility,useSupplierReviewSummary}.ts`
- `apps/web/src/pages/{SearchPage,ProductDetailPage,OrderDetailPage}.tsx` (touchpoints)
- `apps/web/src/pages/admin/*.tsx` (add ReviewQueue nav + page)

## Data model

### `supplier_reviews`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| supplier_id | uuid FK | references `suppliers.id` |
| order_id | uuid FK | references `orders.id` |
| buyer_business_id | uuid FK | references `businesses.id` |
| rating | smallint | CHECK 1..5 |
| body | text | ≤2000 chars |
| status | text | `published` \| `hidden_by_flag` \| `hidden_by_dispute` \| `removed_by_admin` |
| created_at | timestamp | |
| updated_at | timestamp | |

UNIQUE `(supplier_id, order_id)` — enforces 1 review per order.

INDEX `(supplier_id, status, created_at DESC)` — supports list queries.

### `supplier_review_replies`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| review_id | uuid FK UNIQUE | one reply per review |
| supplier_id | uuid FK | denormalized for ownership checks |
| body | text | ≤1000 chars |
| created_at | timestamp | |
| updated_at | timestamp | |

### `supplier_review_flags`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| review_id | uuid FK | |
| flagged_by | text | `buyer` \| `supplier` \| `admin` \| `system` |
| flagged_by_user_id | uuid nullable | auth user |
| reason | text | `abuse` \| `spam` \| `off_topic` \| `pii` \| `other` |
| note | text nullable | |
| status | text | `pending` \| `resolved_keep` \| `resolved_remove` |
| created_at | timestamp | |
| resolved_at | timestamp nullable | |
| resolved_by | uuid nullable | admin user |

INDEX `(status, created_at)` for queue queries.

### `suppliers` (add columns)

- `review_count` int default 0
- `review_avg` real nullable (1..5)
- `last_review_at` timestamp nullable

These are recomputed synchronously inside the `reviews.service` write path. No cron at launch.

## API surface

All under `/api/`. Session auth required for writes; reads public.

### Buyer

- `POST /api/reviews`
  - body: `{ orderId, rating, body }`
  - 201 → review
  - 403 not buyer of order
  - 409 already reviewed
  - 409 dispute open
  - 422 not delivered yet
  - 400 validation error

- `GET /api/suppliers/:id/reviews?sort=recent|highest|lowest&limit&cursor`
  - public; filter `status = 'published'` unless caller owns a non-published row (returns own row)

### Supplier owner

- `POST /api/suppliers/:id/reviews/:reviewId/reply`
  - body: `{ body }`
  - 201 → reply
  - 403 not supplier owner
  - 409 already replied

- `PATCH /api/suppliers/:id/reviews/:reviewId/flag`
  - body: `{ reason, note? }`
  - 200 → flips review status to `hidden_by_flag`, inserts pending flag row

### Admin

- `GET /api/admin/reviews/flags?status=pending`
- `POST /api/admin/reviews/flags/:id/resolve`
  - body: `{ decision: 'keep' | 'remove', note? }`
  - `keep` → review status = `published`
  - `remove` → review status = `removed_by_admin`
- `DELETE /api/admin/reviews/:id` — hard remove with audit log entry

### Read helpers

- `GET /api/suppliers/:id/review-summary`
  - `{ count, distribution: {1:n, 2:n, 3:n, 4:n, 5:n}, avg, lastReviewAt }`
- `GET /api/orders/:id/eligibility`
  - `{ canReview: boolean, reason: 'not_delivered' | 'already_reviewed' | 'dispute_open' | 'not_buyer' | null }`

### Internal (called by `disputes` service)

- `reviews.markOrderDisputed(orderId)` — UPDATE only `status='published'` rows for that order → `hidden_by_dispute`. Idempotent.
- `reviews.markOrderResolved(orderId)` — UPDATE only rows currently `hidden_by_dispute` for that order → `published`. Never un-hides `removed_by_admin` or `hidden_by_flag`. Idempotent.

## Web surface

### New components (`apps/web/src/reviews/`)

- `<RatingStars value avg size />` — read-only display.
- `<RatingDistribution counts total />` — bar chart of 1–5 distribution.
- `<ReviewList items paginated sort onChange />`.
- `<ReviewForm orderId onSubmitted />` — rating input + textarea + char counter.
- `<SupplierReplyForm reviewId onSubmitted />` — single textarea.
- `<FlagReviewButton reviewId />` — modal with reason select + optional note.
- `<AdminReviewQueue />` — pending flags list with decision buttons.

### Touchpoints

- `pages/SearchPage.tsx` — supplier card: `<RatingStars avg count />` next to name.
- `pages/ProductDetailPage.tsx` — supplier block: stars + link "see all reviews for {supplier}".
- `pages/SupplierOnboardingPage.tsx` (or new `SupplierProfilePage`) — header stars + `<ReviewList>`.
- `pages/OrderDetailPage.tsx` — if status `delivered` and `eligibility.canReview`: CTA "Rate this supplier" → opens `<ReviewForm>` modal.
- `pages/admin/*` — add `<AdminReviewQueue>` to admin nav.

### Hooks

- `useReviewEligibility(orderId)` — fetches `/api/orders/:id/eligibility`.
- `useSupplierReviewSummary(supplierId)` — fetches `/api/suppliers/:id/review-summary`.

## Anti-abuse, moderation, dispute linkage, error handling

### Anti-abuse (cheap)

- DB unique `(supplier_id, order_id)`. Race handled by DB.
- Service transaction re-reads dispute status to avoid TOCTOU.
- Body length cap 2000 (validator).
- No rate limit or burst detector at launch — flagged as future work.

### Moderation

- Auto-publish on insert. No NLP filter at launch.
- `<FlagReviewButton>` → status `hidden_by_flag`, queue entry `pending`.
- Admin queue: review snippet + flagger + reason.
- Resolve: `keep` (restore `published`) or `remove` (`removed_by_admin`).
- Audit log on every admin decision via existing `audit` queue.

### Dispute linkage

- `disputes` module invokes `reviews.markOrderDisputed(orderId)` on dispute open.
- Invokes `reviews.markOrderResolved(orderId)` on resolve.
- Service restricts state transitions to the specific status (see API section).
- Both calls idempotent — safe to retry.

### Error handling

| Code | Trigger |
| --- | --- |
| 400 | invalid rating, body too long, missing fields |
| 403 | not buyer of order, not supplier owner, not admin |
| 404 | review / reply / flag not found |
| 409 | already reviewed, dispute open, already replied |
| 422 | not delivered yet |

### Telemetry

AE counters:

- `review.submit`
- `review.flag.buyer`
- `review.flag.supplier`
- `review.admin.resolve.keep`
- `review.admin.resolve.remove`
- `review.dispute.hide`
- `review.dispute.restore`

## Testing

### Unit (`apps/api/test/reviews/`)

- service: insert + recompute aggregate, dispute hide/restore idempotency, flag flow, admin resolve both decisions, unique-violation handling
- validators: rating bounds, body length, enum correctness

### Integration (Hono test app)

- full HTTP: deliver → review → list → reply → flag → admin resolve → remove
- dispute open → review hidden → dispute resolve → review visible
- cross-module: disputes service correctly invokes reviews hooks

### E2E (Playwright)

- buyer rates delivered order; supplier replies; admin removes

### Manual QA

- aggregate updates on supplier card in search
- rating summary on PDP matches list
- dispute scenario end-to-end

## Rollout

Feature flag: `REVIEWS_ENABLED` (wrangler var).

- **Phase 1** — schema migration + service + admin queue. Admin can seed test reviews.
- **Phase 2** — buyer write enabled; supplier reply + flag enabled.
- **Phase 3** — display surfaces enabled (search card → PDP → profile).

## Observability + ops

- AE counters listed above.
- Alert: >50 review flags in 1h on one supplier → notify ops.
- Rollback: flip `REVIEWS_ENABLED=false`; existing rows remain, endpoints return 404.

## Future work (out of scope)

- Rate limit per buyer (e.g. 10/day).
- Burst detector on supplier.
- Sub-scores (quality, timeliness, communication).
- Photos.
- Supplier-initiated buyer reviews (two-sided).
- Search-ranking weight on rating.
- Featured / "most helpful" reviews.

## Open questions for reviewer

- Confirm `supplier_reviews.order_id` should reference `orders.id` even if `orders` is the buyer-side table; or should it reference a supplier-side `purchase_orders` id? (Need to verify module naming.)
- Confirm the existing `disputes` module exposes service methods we can call from `reviews.hooks`; otherwise add a small event bus.
- Confirm `AdminReviewQueue` lives under existing `pages/admin/*` rather than a new top-level route.