# Supplier Reviews — Rollout

**Feature:** 1–5 star supplier reviews, public on PDP, with supplier reply + flag + admin moderation.
**Date:** 2026-09-13
**Owner:** Growth

## What ships

- Schema: `supplier_reviews`, `supplier_review_replies`, `supplier_review_flags` + columns on `suppliers` (count/avg/last).
- Migration: `0033_supplier_reviews.sql` (hand-written, statement-breakpointed).
- API: `apps/api/src/modules/reviews/{repository,service,routes,hooks,analytics}.ts`. Mounted at `/api/*`.
- Web: `apps/web/src/reviews/{RatingStars,RatingDistribution,ReviewList,ReviewForm,SupplierReplyForm,FlagReviewButton,SupplierReviewsPanel,AdminReviewQueue,SupplierStarsLine,useReviewEligibility,useSupplierReviewSummary}.tsx` + `apps/web/src/admin/ReviewsPage.tsx`.
- Hooks: orders/disputes recompute aggregates; status transitions auto-hide reviews on dispute open, auto-publish on resolve.
- Analytics: structured console JSON for `review_submitted`, `review_replied`, `review_flagged`, `review_flag_resolved`, `review_deleted`.
- Feature flag: `feature_flags.REVIEWS_ENABLED` (default ON when absent). Gates buyer POST + supplier reply/flag.

## Pre-flight

1. Apply migration `0033_supplier_reviews.sql` to D1 (prod + preview).
2. Run `pnpm --filter @vyro/api typecheck && pnpm --filter @vyro/web typecheck`.
3. Run full review test suites:
   - `pnpm --filter @vyro/api test -- reviews` — 13 tests.
   - `pnpm --filter @vyro/web test -- reviews` — 13 tests.

## Manual smoke checklist

Sign in as each role and verify:

**Buyer**
- [ ] Order detail (delivered PO) shows "Rate supplier" block with star select + textarea.
- [ ] Submitting a review POSTs and the new review appears in the supplier's PDP list.
- [ ] Eligibility endpoint returns `canReview: false, reason: "already_reviewed"` after submit.
- [ ] Eligibility returns `canReview: false, reason: "dispute_open"` after opening a dispute; the existing review is hidden.

**Supplier**
- [ ] Dashboard "Buyer Reviews" section shows aggregate stars + distribution + list.
- [ ] Replying POSTs and the reply renders under the review.
- [ ] Flagging a review PATCHes and the row moves to admin queue.
- [ ] Flag a second time on same review returns `409 CONFLICT` (one open flag per review).

**Admin**
- [ ] `/admin/reviews/flags` lists pending flags.
- [ ] Resolve keep/remove + delete review all work and update supplier aggregates.
- [ ] `/admin/reviews/flag-burst?windowHours=24&minCount=3` returns suppliers with burst.

**Public**
- [ ] PDP offer comparison table shows compact `★ avg (count)` line.
- [ ] Search result row shows star line under supplier name when count > 0.
- [ ] `/api/suppliers/:id/reviews` and `/review-summary` are publicly readable.

## Feature flag — disable

Set `feature_flags.REVIEWS_ENABLED = false` in `/admin` → Platform → Feature flags. Buyer POST + supplier reply/flag return 404; reads still work so existing displays don't break.

## Rollback

1. Set flag off → buyer/supplier write paths 404 immediately.
2. Revert commits (per task) — all 16 are independent, reverse in reverse order.
3. Drop migration only if no reviews exist (irreversible in prod once data lands).

## Outstanding / deferred

- **Playwright browser e2e** — not added; this repo has no Playwright infra. Service-level smoke in `apps/api/test/reviews/e2e.test.ts` covers API surface. Add Playwright in a follow-up if/when the platform invests in browser-driven flows.
- **Aggregated analytics** — events are emitted to structured stdout only. Wire to AE pipeline in a follow-up.
- **Email notifications** to supplier on new review — out of scope for v1.
