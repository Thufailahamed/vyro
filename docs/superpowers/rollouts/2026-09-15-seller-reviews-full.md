# Seller Reviews Full — Rollout

**Feature:** Full seller ratings & reviews — bugfixes + edit, helpful, photos, notifications, page wiring.
**Date:** 2026-09-15

## What ships

- Migration `0037_seller_reviews_full.sql`: `edited_at`, `helpful_count`, `supplier_review_images`, `supplier_review_helpful_votes`.
- Fixes: sort highest/lowest, eligibility dispute_open reachable, duplicate open-flag 409, ReviewList append + Load more.
- New API: `PATCH/DELETE /api/reviews/:id`, `POST/DELETE /api/reviews/:id/helpful`, `POST /api/reviews/images/upload-direct` (image/*, 5MB, R2 `reviews/tmp/`), enriched list with reply/images/helpfulCount, rate-limit 60/min.
- Web: HelpfulButton, ReviewImageGrid, ReviewForm edit + photo picker, PDP reviews section, admin burst panel.
- Notifications: review.submitted -> supplier org, reply/flag-resolve best-effort via dispatcher. Analytics: review_edited, review_helpful, review_photo_added.

## Pre-flight

1. Apply migration `0037_seller_reviews_full.sql` to D1 (prod + preview).
2. `pnpm typecheck` green.
3. `pnpm --filter @vyro/api test -- reviews` (13 pass), `pnpm --filter @vyro/web test -- reviews` (13 pass), `pnpm --filter @vyro/validation test -- supplierReviews` (26 pass).

## Smoke

- Buyer: delivered order shows Rate block, submit with 0-3 photos, appears in PDP list with photos.
- Edit within 7d succeeds, after 7d returns 409. Delete removes from list + aggregates update.
- Helpful toggle increments/decrements.
- Photo >5MB or non-image rejected 400. 4th image key rejected 400.
- Supplier: reply renders, flag hides, second flag 409.
- Admin: flags queue, keep/remove updates aggregates, burst lists suppliers >=3 flags/24h.
- Flag off: writes 404, reads work.

## Rollback

1. Set `REVIEWS_ENABLED=false` -> writes 404 immediately.
2. Revert commits in reverse order.
3. Drop 0037 tables only if no images/votes exist.
