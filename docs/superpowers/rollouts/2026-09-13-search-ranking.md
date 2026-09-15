# Search Ranking — Rollout

**Feature:** Composite offer ranking on PDP offer comparison table — price + lead time + rating + verified + freshness, with inline reason text + "Best match" badge on rank #1.
**Date:** 2026-09-15
**Owner:** Growth

## What ships

- `apps/api/src/modules/searchRanking/score.ts` — pure `computeRanking()` function with hardcoded weights.
- `apps/api/src/modules/search/compare.ts` — PDP `/api/products/:id/offers` endpoint now sorts by composite score (tie-break price asc) and attaches `ranking: {score, rank, reasons[]}` per offer row.
- `apps/web/src/pages/ProductDetailPage.tsx` — PDP offer table renders inline reason text below supplier name; rank #1 shows "Best match" badge.
- 12 score unit tests + 1 integration + 2 e2e + 1 web render test.

## Pre-flight

1. Run typecheck + tests:
   - `pnpm --filter @vyro/api typecheck && pnpm --filter @vyro/api test -- searchRanking` (15 tests).
   - `pnpm --filter @vyro/web typecheck && pnpm --filter @vyro/web test -- ranking` (1 test).
2. No DB migration required — pure function + API shape addition.

## Manual smoke checklist

- [ ] Load PDP for a product with 3+ verified supplier offers.
- [ ] Offers are no longer strictly price-sorted: faster+verified+high-rating offer can rank above a cheaper but slower one.
- [ ] Rank #1 has "Best match" badge next to supplier name.
- [ ] Each ranked offer shows reason text below stars (e.g. `#1 · Verified + Best price`).
- [ ] Load PDP with 1 offer: shows rank #1, badge present, reason text either populated or empty if no qualifying signals.
- [ ] Load PDP with offers from unverified suppliers only: no "Verified" reason, but other signals still rank correctly.

## Tuning

Weights live at the top of `score.ts`. To tune:
1. Edit the constants (PRICE_WEIGHT, LEAD_WEIGHT, RATING_WEIGHT, VERIFIED_WEIGHT, FRESHNESS_WEIGHT).
2. Run score unit tests to confirm formulas still match expected ranges.
3. Deploy.

To promote weights to admin-tunable later: lift constants into `feature_flags` config section, read at startup, fall back to current defaults if absent.

## Rollback

1. Revert commits in reverse (4 commits total).
2. No DB changes. Frontend gracefully handles missing `ranking` field via `?.` chains.

## Outstanding / deferred

- **Search results reordering** — results stay price-sorted (spec). Add ranking later.
- **Storefront product grid** — chronological sort. Add ranking later.
- **Admin-tunable weights** — hardcoded for v1. Move to `feature_flags` when needed.
- **User-selectable sort modes** (Best Match / Lowest Price / Fastest / Highest Rated) — composite only for v1.
- **Anti-gaming decay** — simple freshness decay only. No cooldown or outlier penalty.
- **ML personalization** — out of scope.

## Why this matters

The PDP offer comparison table previously showed suppliers sorted by price alone. In markets where delivery speed and supplier trust matter as much as price, this leaves the "best overall" offer buried. The composite score surfaces the offer most likely to convert while keeping the underlying price comparison visible to skeptical buyers.
