# Search Ranking — Design

**Date:** 2026-09-13
**Owner:** Growth
**Status:** Draft

## Goal

PDP offer comparison table ranks competing suppliers by a composite score so the
"best overall" offer is obvious to the buyer. Inline reason text explains why
each offer is ranked where it is. Search results stay sorted by price.

## In scope (v1)

- New service `apps/api/src/modules/searchRanking/score.ts` (pure function, unit-tested).
- Composite score from 5 signals with hardcoded weights.
- New API field `ranking` on each PDP offer list row: `{ score, rank, reasons[] }`.
- PDP offer comparison table sorts by `score desc`, then `priceCents asc` for ties.
- Inline reason text under each ranked supplier name: top 2 contributing reasons.
- Reuses existing `supplierReviews` aggregate for rating signal.

## Out of scope (v1)

- Search results reordering (results stay price-sorted).
- Storefront product grid reordering (chronological).
- Admin-tunable weights (hardcoded; can move to feature_flags later).
- User-selectable sort modes (Best Match only).
- Anti-gaming decay logic beyond simple freshness.
- ML-based personalization.

## Score formula

For each offer in the PDP offer list:

```
price_score   = (1 - (offer.priceCents / maxPriceCents))       # 0..1, lower price higher
lead_score    = max(0, 1 - (offer.leadTimeDays / 14))          # 0..1, faster = higher
rating_score  = sup.reviewCount > 0
                  ? sup.reviewAvg / 500                        # stored as 0..500 (avg×100), /500 → 0..1
                  : 0.5                                        # neutral when no reviews
verified_bonus = sup.verificationStatus === 'verified' ? 1 : 0 # 0 or 1
freshness_score = max(0, 1 - ((now - sup.lastReviewAt) / 90d))  # 0..1, recent activity higher
                                                              # fallback 0.5 if lastReviewAt null

composite = (
  0.35 * price_score +
  0.25 * lead_score +
  0.20 * rating_score +
  0.10 * verified_bonus +
  0.10 * freshness_score
) * 100  # → 0..100
```

Tie-breaker: lower `priceCents` wins.

## Reasons text

For each offer, compute top 2 contributing signals (by contribution to composite, ignoring `verified_bonus` because it's binary):

- `price_score` if it contributes > 0.20 to composite (≈ 0.57 on price_score alone)
- `lead_score` if it contributes > 0.15 (≈ 0.60 on lead_score alone)
- `rating_score` if reviewCount > 0 AND contributes > 0.10 (≈ 0.50 on rating_score)
- `verified_bonus` if 1 → "Verified"
- `freshness_score` if contributes > 0.05 AND reviewCount > 0

Reasons rendered as:
- "Best price"
- "Fastest (Nd)"
- "Top rated (4.6★)"
- "Verified"
- "Recent activity"

Top 2 reasons joined by ` + `. Empty if no qualifying signals.

## API

Existing endpoint `GET /products/:productId` returns `{ offers: [{ rank, supplier, ... }] }`.
Add `ranking: { score: number; rank: number; reasons: string[] }` to each offer row.
Rank is 1-indexed within the offers list (precomputed by server after sort).

## Tests

- `apps/api/test/searchRanking/score.test.ts`: pure function coverage for each signal and edge cases (no reviews, no lastReviewAt, tie-breaking).
- `apps/api/test/searchRanking/integration.test.ts`: shape test that PDP route returns ranking field.

## Risks

- Score weights chosen without A/B data. Mitigation: hardcoded + easy to tune in code.
- `freshness_score` uses `lastReviewAt` which only exists after a review lands. New suppliers get 0.5 fallback. Acceptable for v1.
- Reasons text may feel canned for low-data offers. Acceptable.

## Rollout

`docs/superpowers/rollouts/2026-09-13-search-ranking.md`: pre-flight, manual smoke (load PDP with 3+ offers, verify rank #1 has clear reasons), config rollback (revert commit), and tuning notes.
