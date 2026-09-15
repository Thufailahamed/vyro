# Seller Ratings & Reviews (Full) — Design

**Date:** 2026-09-15
**Status:** Approved (user said "ok" — approach A, 7-day edit, R2 max 3 photos, in-app + queue notifications)
**Choices:** Extend-in-place, editable 7 days, R2 max 3 photos, in-app + queue notifications.

## 1. Context / audit finding

v1 ships (rollout `2026-09-13-supplier-reviews.md`): `supplier_reviews`, `supplier_review_replies`, `supplier_review_flags` + `suppliers` aggregates, migration `0033`, API `apps/api/src/modules/reviews/{repository,service,routes,hooks,analytics}.ts`, web `apps/web/src/reviews/*`, admin `ReviewsPage.tsx`, dispute hooks, console analytics, flag `REVIEWS_ENABLED` default ON.

Bugs found:
- `repository.ts listReviews` sort inverted: `highest` uses asc, `lowest` uses desc.
- `service.ts checkEligibility`: `status !== 'delivered'` fires before `disputed` check, so `dispute_open` unreachable.
- No duplicate open-flag guard (rollout claims 409, not enforced).
- `ReviewList.tsx` pagination replaces instead of appends and depends on `nextCursor` causing refetch loop; no reply/photo/helpful rendering.
- List endpoint returns reviews only, no reply/images/helpful counts.

Missing for "fully": buyer edit/delete, buyer flagging, helpful votes, photos, notifications, full page wiring, rate-limit, burst panel polish.

## 2. Architecture (approach A — extend in place)

Keep v1 tables + module. Add migration `0035_seller_reviews_full.sql`:
- Alter `supplier_reviews`: add `edited_at INTEGER NULL`, `helpful_count INTEGER NOT NULL DEFAULT 0`.
- New `supplier_review_images (id TEXT PK, review_id TEXT NOT NULL FK, r2_key TEXT NOT NULL, mime TEXT, size_bytes INTEGER, created_at INTEGER)`, index on review_id. Max 3 enforced in service + Zod.
- New `supplier_review_helpful_votes (review_id TEXT, user_id TEXT, created_at INTEGER, PK(review_id,user_id))`.
- Keep `(supplier_id, order_id)` uniqueness (one review per order).

R2: reuse `PRODUCTS` bucket binding (`vyro-products`), keys `reviews/<reviewId>/<uuid>-<sanitized>`, served via existing `/cdn/:key` route. Upload via `POST /api/reviews/images/upload-direct` multipart (reuse `documents/repository.ts buildR2Key` + sanitize pattern).

Notifications: reuse `modules/notifications/dispatcher.ts` (`notifySupplierOrg`, `notifyBusinessOrg`, `notifyOrderParties`). Best-effort, never block transaction. Types: `review.submitted`, `review.replied`, `review.flag_resolved`.

## 3. Components

Backend `apps/api/src/modules/reviews/`:
- `repository.ts`: fix sort, add `findImagesByReviewIds`, `findRepliesByReviewIds`, `countHelpful`, `toggleHelpful` (insert-or-ignore), `updateReview` (rating/body/editedAt), `findOpenFlagByReview`, `setHelpfulCount`.
- `service.ts`: fix eligibility (explicit disputed -> dispute_open, allow delivered/completed), `editReview` (owner + <=7d + published only), `deleteReviewByBuyer` (owner soft -> removed_by_admin? new `removed_by_buyer` or reuse removed_by_admin — pick `removed_by_admin` to avoid enum churn, recompute agg), `toggleHelpful`, `addImages` (limit 3, mime image/*, <=5MB), `flagReview` add duplicate guard + allow buyer role.
- `routes.ts`: `PATCH /api/reviews/:id`, `DELETE /api/reviews/:id`, `POST /api/reviews/:id/helpful` + `DELETE`, extend `GET /suppliers/:id/reviews` to include `reply, images[], helpfulCount, canEdit`, `POST /api/reviews/images/upload-direct`. Rate-limit 60/min/user on POST/PATCH/helpful/flag (reuse CRM pattern).
- `validation supplierReviews.ts`: `editReviewSchema`, `helpfulSchema` (empty), `uploadDirect` handled as multipart not Zod, extend `submitReviewSchema` with optional `imageR2Keys: z.array(z.string().max(500)).max(3)`.

Frontend `apps/web/src/reviews/`:
- Fix `ReviewList` (append + Load more, deps `[supplierId, sort]`, render reply/photos/helpful/edit).
- `ReviewForm`: add photo picker (3 max, preview, 5MB), edit mode (prefill + PATCH).
- `HelpfulButton.tsx` (new), `ReviewImageGrid.tsx` (new).
- Wiring: `OrderDetailPage` -> ReviewForm + eligibility, `ProductDetailPage` offers + SupplierStarsLine, `supplier/DashboardPage` -> Buyer Reviews section, `admin/ReviewsPage` -> burst panel (already lists flags).

## 4. Data flow

Submit: buyer POST /reviews (+optional imageR2Keys) -> eligibility -> insert -> recompute agg -> notifySupplierOrg + analytics `review_submitted`.
Edit: buyer PATCH within 7d -> update + edited_at -> recompute agg -> analytics `review_edited`.
Helpful: any authed POST toggle -> helpful_count denorm -> analytics `review_helpful`.
Reply: supplier POST reply -> notifyBusinessOrg -> analytics `review_replied`.
Flag: supplier or buyer PATCH flag -> duplicate guard -> hide (`hidden_by_flag`) -> recompute -> admin queue. Admin resolve keep/remove -> status flip + recompute + notifyOrderParties + analytics.
Dispute open/resolve: hooks `markOrderDisputed/Resolved` unchanged (idempotent).

## 5. Error handling

401 no session, 403 not buyer owner / not supplier member / admin only, 404 review/order not found or reviews disabled, 409 already_reviewed / dispute_open / duplicate flag / edit window expired / resubmit while pending, 422 not_delivered, 400 Zod/multipart (wrong mime, >5MB, >3 images). Notifications/queue failures swallowed. Feature flag OFF -> writes 404, reads still work.

## 6. Testing

- Validation: `packages/validation/test/supplierReviews.test.ts` (edit window schema, image keys max 3, helpful).
- API: extend `apps/api/test/reviews/*` (sort order, eligibility dispute/delivered, duplicate flag 409, edit 7d boundary, helpful idempotency, photo limit, list includes reply/images).
- Web: `apps/web/test/reviews/*` (pagination append, edit mode, helpful toggle, photo picker limit).
- `pnpm typecheck`, `pnpm --filter @vyro/api test -- reviews`, `pnpm --filter @vyro/web test -- reviews` green.

## 7. Out of scope

Email sending (in-app + queue only), video attachments, AI summary of reviews, aggregated AE pipeline (console JSON only), Playwright e2e (no infra), full-text search on review bodies.
