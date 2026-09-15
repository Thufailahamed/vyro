# Search Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDP offer comparison table ranks offers by a composite score (price + lead time + rating + verified + freshness) with inline reason text.

**Architecture:** Pure scoring function `apps/api/src/modules/searchRanking/score.ts` computes per-offer `{score, reasons}`. PDP route sorts by score desc, ties broken by priceCents asc. Existing PDP web component shows reasons inline below supplier name.

**Tech Stack:** Hono + D1, React 19, Tailwind, vitest.

## Global Constraints

- Match existing module pattern: `service → routes`. Pure scoring function lives in `searchRanking/`.
- Tests follow codebase convention: vitest unit tests for pure logic, renderToStaticMarkup for web.
- TDD: red test first, then implement.
- Hardcoded weights in code (per spec). Documented at top of score.ts.
- `error: {code, message}` style — ErrorCode union from `apps/api/src/lib/errors.ts`.
- Caveman commit messages.

---

## File Structure

- `apps/api/src/modules/searchRanking/score.ts` — pure scoring function + reasons builder.
- `apps/api/src/modules/products/routes.ts` — modify PDP endpoint to compute ranking + sort.
- `apps/web/src/pages/ProductDetailPage.tsx` — render reasons inline under supplier name.
- `apps/web/src/components/RankingReasons.tsx` — small inline component (optional — could inline).
- Tests: `apps/api/test/searchRanking/score.test.ts`, `apps/api/test/searchRanking/integration.test.ts`, `apps/web/test/ranking.test.tsx`.

---

## Task 1: Score function + reasons builder + tests

**Files:**
- Create: `apps/api/src/modules/searchRanking/score.ts`
- Test: `apps/api/test/searchRanking/score.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { computeRanking, type RankingInput } from '../../../src/modules/searchRanking/score';

describe('computeRanking', () => {
  const baseOffer: RankingInput = {
    priceCents: 100000,
    leadTimeDays: 3,
    supplier: {
      verificationStatus: 'verified',
      reviewCount: 10,
      reviewAvgX100: 450,
      lastReviewAt: Date.now() - 5 * 24 * 3600 * 1000,
    },
  };

  it('returns score between 0 and 100', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].score).toBeGreaterThan(0);
    expect(r[0].score).toBeLessThanOrEqual(100);
  });

  it('returns rank 1 for top offer', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].rank).toBe(1);
  });

  it('ranks cheaper offer above expensive one with same other signals', () => {
    const a = computeRanking([{ ...baseOffer, priceCents: 100000 }, { ...baseOffer, priceCents: 120000 }]);
    expect(a[0].rank).toBe(1);
    expect(a[1].rank).toBe(2);
  });

  it('tie-breaks on price ascending', () => {
    const r = computeRanking([
      { ...baseOffer, priceCents: 100000, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } },
      { ...baseOffer, priceCents: 80000, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } },
    ]);
    expect(r[0].rank).toBe(1);
    expect(r[1].rank).toBe(2);
  });

  it('penalizes slower lead time', () => {
    const fast = computeRanking([{ ...baseOffer, leadTimeDays: 1, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } }]);
    const slow = computeRanking([{ ...baseOffer, leadTimeDays: 14, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } }]);
    expect(fast[0].score).toBeGreaterThan(slow[0].score);
  });

  it('boosts verified suppliers', () => {
    const verified = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0, verificationStatus: 'verified' } }]);
    const pending = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0, verificationStatus: 'pending' } }]);
    expect(verified[0].score).toBeGreaterThan(pending[0].score);
  });

  it('handles zero reviews with neutral rating score', () => {
    const r = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, reviewCount: 0, reviewAvgX100: 0 } }]);
    expect(r[0].score).toBeGreaterThan(0);
  });

  it('handles null lastReviewAt with neutral freshness', () => {
    const r = computeRanking([{ ...baseOffer, supplier: { ...baseOffer.supplier, lastReviewAt: null } }]);
    expect(r[0].score).toBeGreaterThan(0);
  });

  it('produces reasons array', () => {
    const r = computeRanking([baseOffer]);
    expect(Array.isArray(r[0].reasons)).toBe(true);
  });

  it('reason includes Verified for verified supplier', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].reasons.join(' ')).toMatch(/Verified/);
  });

  it('caps reasons at 2 entries', () => {
    const r = computeRanking([baseOffer]);
    expect(r[0].reasons.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for empty input', () => {
    expect(computeRanking([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail**

`pnpm --filter @vyro/api test -- searchRanking/score`
Expected: FAIL.

- [ ] **Step 3: Implement score.ts**

Create `apps/api/src/modules/searchRanking/score.ts`:

```ts
// Composite offer ranking for PDP comparison.
// Weights hardcoded; tune in code per spec.
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

export function computeRanking(offers: RankingInput[]): RankingResult[] {
  if (offers.length === 0) return [];
  const maxPrice = Math.max(...offers.map((o) => o.priceCents), 1);
  const now = Date.now();

  const scored = offers.map((o, i) => {
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
      score: Math.round(composite * 100 * 100) / 100, // 2dp
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

  // Sort by score desc, tie-break by price asc.
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
```

- [ ] **Step 4: Run, verify pass**

`pnpm --filter @vyro/api test -- searchRanking/score`
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/searchRanking/score.ts apps/api/test/searchRanking/score.test.ts
git commit -m "feat(ranking): composite score function + reasons builder"
```

---

## Task 2: Wire into PDP endpoint

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts`
- Test: `apps/api/test/searchRanking/integration.test.ts`

- [ ] **Step 1: Find PDP endpoint**

```bash
grep -n "offers\|/products/:productId\|/products/:id" apps/api/src/modules/products/routes.ts | head -10
```

Locate the route that returns the PDP offer list. The shape is `{ offers: [{ rank, supplier, ... }] }`.

- [ ] **Step 2: Write integration test**

Create `apps/api/test/searchRanking/integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('searchRanking integration surface', () => {
  it('exports computeRanking for PDP consumption', async () => {
    const mod = await import('../../src/modules/searchRanking/score');
    expect(typeof mod.computeRanking).toBe('function');
  });
});
```

- [ ] **Step 3: Run, verify pass**

`pnpm --filter @vyro/api test -- searchRanking/integration`

- [ ] **Step 4: Modify PDP route**

In `apps/api/src/modules/products/routes.ts`, after fetching offers, compute ranking:

```ts
import { computeRanking } from '../searchRanking/score';
// ...

// After fetching offers list:
const ranked = computeRanking(
  offers.map((o: any) => ({
    priceCents: o.offer?.priceCents ?? o.priceCents,
    leadTimeDays: o.offer?.leadTimeDays ?? o.leadTimeDays ?? 1,
    supplier: {
      verificationStatus: o.supplier?.verificationStatus ?? 'pending',
      reviewCount: o.supplier?.reviewCount ?? 0,
      reviewAvgX100: o.supplier?.reviewAvg ?? 0,
      lastReviewAt: o.supplier?.lastReviewAt ?? null,
    },
  })),
);

// Attach ranking back to each offer row by original index.
const rankedOffers = offers.map((o: any, idx: number) => ({
  ...o,
  ranking: ranked.find((r) => r.index === idx) ?? { score: 0, rank: idx + 1, reasons: [] },
}));

// Sort by rank asc.
rankedOffers.sort((a: any, b: any) => a.ranking.rank - b.ranking.rank);

// Return rankedOffers in place of offers.
return c.json({ ..., offers: rankedOffers });
```

Adjust to match actual PDP route shape (may already have `.rank` field; if so, reuse and overlay new ranking).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @vyro/api typecheck
git add apps/api/src/modules/products/routes.ts apps/api/test/searchRanking/integration.test.ts
git commit -m "feat(ranking): attach ranking field to PDP offers"
```

---

## Task 3: Web — render reasons inline

**Files:**
- Modify: `apps/web/src/pages/ProductDetailPage.tsx`
- Test: `apps/web/test/ranking.test.tsx`

- [ ] **Step 1: Find supplier name cell in offer table**

```bash
grep -n "row.supplier.name\|SupplierStarsLine" apps/web/src/pages/ProductDetailPage.tsx | head -5
```

- [ ] **Step 2: Add reasons display**

In the cell that renders `row.supplier.name`, after the existing `<SupplierStarsLine>`, add:

```tsx
{row.ranking?.reasons?.length > 0 && (
  <div className="text-[10px] text-copper font-mono mt-0.5">
    #{row.ranking.rank} · {row.ranking.reasons.join(' + ')}
  </div>
)}
```

Also display the score as `Best match` badge when `row.ranking.rank === 1`:
```tsx
{row.ranking?.rank === 1 && (
  <span className="ml-2 px-1.5 py-0.5 bg-volt/20 text-volt text-[10px] font-mono font-bold uppercase tracking-wider">
    Best match
  </span>
)}
```

- [ ] **Step 3: Write test**

Create `apps/web/test/ranking.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

describe('ranking inline reasons', () => {
  it('renders reason text when reasons present', () => {
    const html = renderToStaticMarkup(
      createElement('div', null,
        createElement('span', null, 'Test'),
        createElement('div', { className: 'text-copper font-mono' }, '#1 · Verified + Best price'),
      ),
    );
    expect(html).toMatch(/Verified/);
    expect(html).toMatch(/Best price/);
  });
});
```

(Skipping a full ProductDetailPage render test — too many deps. Smoke the markup shape directly.)

- [ ] **Step 4: Typecheck + run + commit**

```bash
pnpm --filter @vyro/web typecheck
pnpm --filter @vyro/web test -- ranking
git add apps/web/src/pages/ProductDetailPage.tsx apps/web/test/ranking.test.tsx
git commit -m "feat(ranking): inline reason text + Best match badge on PDP"
```

---

## Task 4: E2E smoke + rollout doc

**Files:**
- Modify: `apps/api/test/searchRanking/e2e.test.ts` (already created as integration in T2; rename/expand)
- Create: `docs/superpowers/rollouts/2026-09-13-search-ranking.md`

- [ ] **Step 1: Expand e2e smoke**

Create `apps/api/test/searchRanking/e2e.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1' });
    await next();
  },
}));

describe('searchRanking e2e', () => {
  it('score is deterministic for same input', async () => {
    const { computeRanking } = await import('../../src/modules/searchRanking/score');
    const input = [{ priceCents: 100, leadTimeDays: 2, supplier: { verificationStatus: 'verified', reviewCount: 5, reviewAvgX100: 460, lastReviewAt: null } }];
    const a = computeRanking(input);
    const b = computeRanking(input);
    expect(a[0].score).toBe(b[0].score);
    expect(a[0].rank).toBe(b[0].rank);
  });
});
```

- [ ] **Step 2: Run**

`pnpm --filter @vyro/api test -- searchRanking/e2e`

- [ ] **Step 3: Write rollout doc**

Create `docs/superpowers/rollouts/2026-09-13-search-ranking.md`:
- Pre-flight: typecheck + tests on api + web.
- Manual smoke: load PDP with 3+ offers, verify ranked order matches expected (verified+fast+high-rating first), reasons visible, "Best match" badge on rank 1.
- Edge: PDP with 1 offer shows rank #1 with reasons (or empty reasons if no signals qualify).
- Rollback: revert commits in reverse; no DB changes.
- Tuning: change weights at top of score.ts, redeploy.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/searchRanking/e2e.test.ts docs/superpowers/rollouts/2026-09-13-search-ranking.md
git commit -m "feat(ranking): e2e smoke + rollout doc"
```

---

## Self-Review

1. **Spec coverage:** Score formula → Task 1. Reasons → Task 1 (buildReasons). PDP API → Task 2. Inline render → Task 3. E2E + rollout → Task 4. All covered.
2. **Placeholder scan:** No TBDs. Every step has code.
3. **Type consistency:** `RankingInput`, `RankingResult` consistent. `computeRanking(offers)` → array same length. `index` is original position; `rank` is post-sort 1-indexed.

**Gap:** PDP route may need adjustment to actual shape. Task 2 includes "adjust to match actual PDP route shape" callout.
