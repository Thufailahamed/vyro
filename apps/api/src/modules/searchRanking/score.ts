// Composite offer ranking for PDP comparison.
// Weights hardcoded per spec; tune in code.
//
// price       0.35 — lower price = higher score (normalized to offer set max)
// lead time   0.25 — faster = higher (cap at 14 days)
// rating      0.20 — review avg / 500 (avg stored ×100, so /500 → 0..1)
//             neutral 0.5 when reviewCount = 0
// verified    0.10 — binary 1 if verificationStatus === 'verified'
// freshness   0.10 — recency of last review (cap 90d). Neutral 0.5 when null.
//
// Tie-break: lower priceCents wins.

export interface RankingInputSupplier {
  verificationStatus: string;
  reviewCount: number;
  reviewAvgX100: number; // 0..500
  lastReviewAt: number | null;
}

export interface RankingInput {
  priceCents: number;
  leadTimeDays: number;
  supplier: RankingInputSupplier;
}

export interface RankingResult {
  index: number;
  score: number;
  rank: number;
  reasons: string[];
}

const PRICE_WEIGHT = 0.35;
const LEAD_WEIGHT = 0.25;
const RATING_WEIGHT = 0.2;
const VERIFIED_WEIGHT = 0.1;
const FRESHNESS_WEIGHT = 0.1;

interface Scored {
  index: number;
  score: number;
  priceCents: number;
  contributions: {
    price: number;
    lead: number;
    rating: number;
    verified: number;
    freshness: number;
  };
  supplier: RankingInputSupplier;
}

function buildReasons(s: Scored): string[] {
  const reasons: string[] = [];
  if (s.contributions.price > 0.2) reasons.push('Best price');
  if (s.contributions.lead > 0.15) reasons.push('Fast delivery');
  if (s.contributions.verified > 0) reasons.push('Verified');
  if (
    s.supplier.reviewCount > 0 &&
    s.contributions.rating > 0.1 &&
    !reasons.includes('Verified')
  ) {
    reasons.push('Top rated');
  }
  if (s.contributions.freshness > 0.05 && s.supplier.reviewCount > 0) {
    reasons.push('Recent activity');
  }
  return reasons.slice(0, 2);
}

export function computeRanking(offers: RankingInput[]): RankingResult[] {
  if (offers.length === 0) return [];
  const maxPrice = Math.max(...offers.map((o) => o.priceCents), 1);
  const now = Date.now();

  const scored: Scored[] = offers.map((o, i) => {
    const priceScore = 1 - o.priceCents / maxPrice;
    const leadScore = Math.max(0, 1 - o.leadTimeDays / 14);
    const ratingScore =
      o.supplier.reviewCount > 0
        ? Math.max(0, Math.min(1, o.supplier.reviewAvgX100 / 500))
        : 0.5;
    const verifiedBonus = o.supplier.verificationStatus === 'verified' ? 1 : 0;
    const freshnessScore =
      o.supplier.lastReviewAt === null
        ? 0.5
        : Math.max(0, 1 - (now - o.supplier.lastReviewAt) / (90 * 24 * 3600 * 1000));

    const composite =
      PRICE_WEIGHT * priceScore +
      LEAD_WEIGHT * leadScore +
      RATING_WEIGHT * ratingScore +
      VERIFIED_WEIGHT * verifiedBonus +
      FRESHNESS_WEIGHT * freshnessScore;

    return {
      index: i,
      score: Math.round(composite * 100 * 100) / 100,
      priceCents: o.priceCents,
      contributions: {
        price: PRICE_WEIGHT * priceScore,
        lead: LEAD_WEIGHT * leadScore,
        rating: RATING_WEIGHT * ratingScore,
        verified: VERIFIED_WEIGHT * verifiedBonus,
        freshness: FRESHNESS_WEIGHT * freshnessScore,
      },
      supplier: o.supplier,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.priceCents - b.priceCents;
  });

  return scored.map((s, idx) => ({
    index: s.index,
    score: s.score,
    rank: idx + 1,
    reasons: buildReasons(s),
  }));
}
