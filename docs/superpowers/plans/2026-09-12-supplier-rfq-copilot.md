# Supplier AI RFQ Quoting Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an AI-powered RFQ quoting assistant for wholesale suppliers that deterministically calculates competitive, margin-guarded pricing, suggests in-stock product substitutes, generates bulk volume tiers, and synthesizes professional quotation cover notes.

**Architecture:** A pure mathematical pricing and substitution solver in `packages/ai` computes margin-protected quote line items (`win_deal`, `balanced`, `premium_margin`) and alternative product candidates. An orchestration service in `apps/api` loads the RFQ and supplier catalog, executes the solver, delegates narrative drafting to `AIProvider` (Workers AI / Gemini) with an immediate deterministic fallback, and exposes `POST /api/rfqs/:rfqId/ai-quote-draft`. An interactive `AiQuoteCopilotCard` in `apps/web` lets suppliers generate and 1-click apply quotes into the RFQ response form.

**Tech Stack:** TypeScript, Node 20+, pnpm, Vitest, Zod, Hono, D1 / Drizzle ORM, React 18, Tailwind CSS, Lucide icons.

## Global Constraints
- Node 20+ and pnpm 9+.
- Currency is in integer cents (e.g. LKR cents).
- Margin Floor Guardrail: Quoted price must never drop below `basePriceCents * 0.88` (12% maximum permissible discount from supplier catalog rate).
- AI Never Auto-Submits: AI only drafts and populates form state; human supplier must click "Submit Quote".
- Resilience: If LLM is slow (>8s) or throws, server must return deterministic quotation text without 500 error.
- Monorepo package boundaries: Pure solver in `@vyro/ai` (zero D1/Hono dependencies), API routes in `@vyro/api`, UI in `@vyro/web`.

---

### Task 1: Quoting Schemas & Types in `packages/ai`

**Files:**
- Create: `packages/ai/src/supplier/types.ts`
- Create: `packages/ai/src/supplier/index.ts`
- Modify: `packages/ai/src/schemas.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/supplier/types.test.ts`

**Interfaces:**
- Consumes: `zod`
- Produces:
  - `AiQuoteStrategySchema`, `AiQuoteStrategy` (`'win_deal' | 'balanced' | 'premium_margin'`)
  - `AiQuoteDraftRequestSchema`, `AiQuoteDraftRequest`
  - `AiQuoteDraftResponseSchema`, `AiQuoteDraftResponse`
  - `SolverCatalogOffer`, `SolverRfqItem`, `SolverInput`, `SolverOutput` interfaces

- [ ] **Step 1: Write the failing test**

```ts
// packages/ai/src/supplier/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  AiQuoteStrategySchema,
  AiQuoteDraftRequestSchema,
  AiQuoteDraftResponseSchema,
} from './types';

describe('Supplier AI Quote Schemas', () => {
  it('validates strategy enum', () => {
    expect(AiQuoteStrategySchema.safeParse('win_deal').success).toBe(true);
    expect(AiQuoteStrategySchema.safeParse('balanced').success).toBe(true);
    expect(AiQuoteStrategySchema.safeParse('premium_margin').success).toBe(true);
    expect(AiQuoteStrategySchema.safeParse('invalid_strategy').success).toBe(false);
  });

  it('validates quote draft request defaults', () => {
    const parsed = AiQuoteDraftRequestSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.strategy).toBe('balanced');
      expect(parsed.data.includeAlternatives).toBe(true);
    }
  });

  it('validates a complete quote draft response', () => {
    const validPayload = {
      draft: {
        deliveryFeeCents: 150000,
        validDays: 14,
        paymentTerms: 'Net 7 days from invoice',
        notes: 'We can deliver fresh stock within 48 hours.',
        summaryExplanation: 'Priced against catalog with 3% bulk volume discount.',
        strategyUsed: 'balanced' as const,
        items: [
          {
            rfqItemId: 'item-1',
            productId: 'prod-1',
            supplierProductId: 'sp-1',
            description: 'Samba Rice 50kg',
            quantity: 100,
            unit: 'kg',
            unitPriceCents: 38000,
            discountCents: 1140,
            subtotalCents: 3686000,
            isAlternative: false,
            rationale: 'Catalog price with volume discount applied.',
            stockStatus: 'in_stock' as const,
            tier: {
              minQty: 200,
              unitPriceCents: 36000,
            },
          },
        ],
      },
    };
    const parsed = AiQuoteDraftResponseSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test src/supplier/types.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

Create `packages/ai/src/supplier/types.ts`:
```ts
import { z } from 'zod';

export const AiQuoteStrategySchema = z.enum(['win_deal', 'balanced', 'premium_margin']);
export type AiQuoteStrategy = z.infer<typeof AiQuoteStrategySchema>;

export const AiQuoteDraftRequestSchema = z
  .object({
    strategy: AiQuoteStrategySchema.default('balanced'),
    includeAlternatives: z.boolean().default(true),
    targetMarginDeltaPct: z.number().min(-15).max(30).optional(),
  })
  .strict();
export type AiQuoteDraftRequest = z.infer<typeof AiQuoteDraftRequestSchema>;

export const QuoteItemDraftSchema = z.object({
  rfqItemId: z.string(),
  productId: z.string().optional(),
  supplierProductId: z.string().optional(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unit: z.string(),
  unitPriceCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
  subtotalCents: z.number().int().min(0),
  isAlternative: z.boolean().default(false),
  alternativeForRfqItemId: z.string().optional(),
  notes: z.string().optional(),
  rationale: z.string(),
  stockStatus: z.enum(['in_stock', 'low', 'substitute', 'unmatched']),
  tier: z
    .object({
      minQty: z.number().int().positive(),
      unitPriceCents: z.number().int().positive(),
    })
    .optional(),
});
export type QuoteItemDraft = z.infer<typeof QuoteItemDraftSchema>;

export const AiQuoteDraftSchema = z.object({
  deliveryFeeCents: z.number().int().min(0),
  validDays: z.number().int().min(1).max(90),
  paymentTerms: z.string().min(1).max(100),
  notes: z.string().max(2000),
  summaryExplanation: z.string().max(1000),
  strategyUsed: AiQuoteStrategySchema,
  items: z.array(QuoteItemDraftSchema),
});
export type AiQuoteDraft = z.infer<typeof AiQuoteDraftSchema>;

export const AiQuoteDraftResponseSchema = z.object({
  draft: AiQuoteDraftSchema,
});
export type AiQuoteDraftResponse = z.infer<typeof AiQuoteDraftResponseSchema>;

export interface SolverCatalogOffer {
  supplierProductId: string;
  productId: string;
  name: string;
  category?: string | null;
  basePriceCents: number;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  deliveryAvailable: boolean;
  minOrderQuantity?: number | null;
}

export interface SolverRfqItem {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  targetPriceCents?: number | null;
  specifications?: string | null;
}

export interface SolverInput {
  strategy: AiQuoteStrategy;
  includeAlternatives: boolean;
  rfq: {
    id: string;
    rfqNumber: string;
    title: string;
    deliveryDistrict?: string | null;
    deliveryCity?: string | null;
    paymentTermsRequested?: string | null;
  };
  rfqItems: SolverRfqItem[];
  catalogOffers: SolverCatalogOffer[];
  supplierDeliveryFeeCents?: number;
}

export interface SolverOutput {
  items: QuoteItemDraft[];
  deliveryFeeCents: number;
  validDays: number;
  paymentTerms: string;
  strategy: AiQuoteStrategy;
  substitutesCount: number;
  matchedCount: number;
  unmatchedCount: number;
}
```

Create `packages/ai/src/supplier/index.ts`:
```ts
export * from './types';
```

Modify `packages/ai/src/index.ts`:
Add:
```ts
export * from './supplier/index';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/ai test src/supplier/types.test.ts`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/supplier/ packages/ai/src/index.ts
git commit -m "feat(ai): add supplier RFQ quoting schemas and types"
```

---

### Task 2: Substitution & Fuzzy Matcher in `packages/ai`

**Files:**
- Create: `packages/ai/src/supplier/substitution.ts`
- Modify: `packages/ai/src/supplier/index.ts`
- Test: `packages/ai/src/supplier/substitution.test.ts`

**Interfaces:**
- Consumes: `SolverRfqItem`, `SolverCatalogOffer`
- Produces: `findCatalogMatch(item: SolverRfqItem, catalog: SolverCatalogOffer[], includeAlternatives: boolean)`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ai/src/supplier/substitution.test.ts
import { describe, it, expect } from 'vitest';
import { findCatalogMatch } from './substitution';
import type { SolverCatalogOffer, SolverRfqItem } from './types';

const catalog: SolverCatalogOffer[] = [
  {
    supplierProductId: 'sp-1',
    productId: 'p-1',
    name: 'Samba Rice 50kg bag',
    category: 'Grains & Rice',
    basePriceCents: 12000,
    availabilityStatus: 'in_stock',
    deliveryAvailable: true,
  },
  {
    supplierProductId: 'sp-2',
    productId: 'p-2',
    name: 'Nadu Rice 50kg bag',
    category: 'Grains & Rice',
    basePriceCents: 10500,
    availabilityStatus: 'out_of_stock',
    deliveryAvailable: true,
  },
  {
    supplierProductId: 'sp-3',
    productId: 'p-3',
    name: 'White Sugar 50kg',
    category: 'Sugar & Sweeteners',
    basePriceCents: 14000,
    availabilityStatus: 'in_stock',
    deliveryAvailable: true,
  },
];

describe('findCatalogMatch', () => {
  it('returns exact match by productId when in stock', () => {
    const item: SolverRfqItem = {
      id: 'item-1',
      productId: 'p-1',
      description: 'Samba Rice 50kg',
      quantity: 10,
      unit: 'bag',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('exact');
    expect(res.offer?.productId).toBe('p-1');
    expect(res.isAlternative).toBe(false);
  });

  it('suggests in-stock alternative in same category when exact item is out of stock', () => {
    const item: SolverRfqItem = {
      id: 'item-2',
      productId: 'p-2',
      description: 'Nadu Rice 50kg',
      quantity: 20,
      unit: 'bag',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('substitute');
    expect(res.offer?.productId).toBe('p-1'); // Samba Rice in same category
    expect(res.isAlternative).toBe(true);
  });

  it('matches fuzzy description when productId is not provided', () => {
    const item: SolverRfqItem = {
      id: 'item-3',
      description: 'Sugar white 50kg bags',
      quantity: 5,
      unit: 'bag',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('fuzzy');
    expect(res.offer?.productId).toBe('p-3');
    expect(res.isAlternative).toBe(false);
  });

  it('returns unmatched when no category or keyword matches exist', () => {
    const item: SolverRfqItem = {
      id: 'item-4',
      description: 'Motor Oil 5W30 4L',
      quantity: 1,
      unit: 'tin',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('unmatched');
    expect(res.offer).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test src/supplier/substitution.test.ts`
Expected: FAIL (cannot find `./substitution`)

- [ ] **Step 3: Write implementation**

Create `packages/ai/src/supplier/substitution.ts`:
```ts
import type { SolverCatalogOffer, SolverRfqItem } from './types';

export interface CatalogMatchResult {
  matchType: 'exact' | 'fuzzy' | 'substitute' | 'unmatched';
  offer?: SolverCatalogOffer;
  isAlternative: boolean;
  alternativeReason?: string;
}

function tokenize(str: string): Set<string> {
  const words = str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findCatalogMatch(
  item: SolverRfqItem,
  catalog: SolverCatalogOffer[],
  includeAlternatives: boolean = true,
): CatalogMatchResult {
  // 1. Check exact productId match
  if (item.productId) {
    const exact = catalog.find((c) => c.productId === item.productId);
    if (exact) {
      if (exact.availabilityStatus !== 'out_of_stock') {
        return { matchType: 'exact', offer: exact, isAlternative: false };
      }
      // Exact item is out of stock - find substitute if allowed
      if (includeAlternatives) {
        const sub = findSubstitute(exact, item, catalog);
        if (sub) {
          return {
            matchType: 'substitute',
            offer: sub,
            isAlternative: true,
            alternativeReason: `Original product '${exact.name}' is currently out of stock. Proposing in-stock substitute '${sub.name}'.`,
          };
        }
      }
      // Return exact anyway with out_of_stock indicator if no substitute
      return { matchType: 'exact', offer: exact, isAlternative: false };
    }
  }

  // 2. Token Jaccard matching on description
  const itemTokens = tokenize(item.description);
  let bestScore = 0;
  let bestOffer: SolverCatalogOffer | undefined;

  for (const offer of catalog) {
    const offerTokens = tokenize(offer.name);
    const score = jaccardSimilarity(itemTokens, offerTokens);
    if (score > bestScore) {
      bestScore = score;
      bestOffer = offer;
    }
  }

  if (bestOffer && bestScore >= 0.3) {
    if (bestOffer.availabilityStatus !== 'out_of_stock') {
      return { matchType: 'fuzzy', offer: bestOffer, isAlternative: false };
    }
    if (includeAlternatives) {
      const sub = findSubstitute(bestOffer, item, catalog);
      if (sub) {
        return {
          matchType: 'substitute',
          offer: sub,
          isAlternative: true,
          alternativeReason: `Matched item '${bestOffer.name}' is out of stock. Proposing substitute '${sub.name}'.`,
        };
      }
    }
    return { matchType: 'fuzzy', offer: bestOffer, isAlternative: false };
  }

  return { matchType: 'unmatched', isAlternative: false };
}

function findSubstitute(
  baseOffer: SolverCatalogOffer,
  item: SolverRfqItem,
  catalog: SolverCatalogOffer[],
): SolverCatalogOffer | undefined {
  const inStockOffers = catalog.filter(
    (c) =>
      c.supplierProductId !== baseOffer.supplierProductId &&
      c.availabilityStatus !== 'out_of_stock',
  );

  // Match in same category first
  if (baseOffer.category) {
    const categoryMatches = inStockOffers.filter(
      (c) => c.category && c.category.toLowerCase() === baseOffer.category!.toLowerCase(),
    );
    if (categoryMatches.length > 0) {
      const itemTokens = tokenize(item.description);
      categoryMatches.sort((a, b) => {
        const scoreA = jaccardSimilarity(itemTokens, tokenize(a.name));
        const scoreB = jaccardSimilarity(itemTokens, tokenize(b.name));
        return scoreB - scoreA;
      });
      return categoryMatches[0];
    }
  }

  // Fallback to highest token similarity among all in-stock items
  const itemTokens = tokenize(item.description);
  let bestScore = 0;
  let bestSub: SolverCatalogOffer | undefined;
  for (const offer of inStockOffers) {
    const score = jaccardSimilarity(itemTokens, tokenize(offer.name));
    if (score > bestScore) {
      bestScore = score;
      bestSub = offer;
    }
  }
  return bestScore >= 0.25 ? bestSub : undefined;
}
```

Modify `packages/ai/src/supplier/index.ts`:
Add:
```ts
export * from './substitution';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/ai test src/supplier/substitution.test.ts`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/supplier/substitution.ts packages/ai/src/supplier/substitution.test.ts packages/ai/src/supplier/index.ts
git commit -m "feat(ai): add supplier product matcher and auto-substitution"
```

---

### Task 3: Deterministic Pricing Solver Engine in `packages/ai`

**Files:**
- Create: `packages/ai/src/supplier/rfqSolver.ts`
- Modify: `packages/ai/src/supplier/index.ts`
- Test: `packages/ai/src/supplier/rfqSolver.test.ts`

**Interfaces:**
- Consumes: `SolverInput`, `findCatalogMatch`
- Produces: `solveQuoteDraft(input: SolverInput): SolverOutput`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ai/src/supplier/rfqSolver.test.ts
import { describe, it, expect } from 'vitest';
import { solveQuoteDraft, MARGIN_FLOOR_FACTOR } from './rfqSolver';
import type { SolverInput } from './types';

const mockInput: SolverInput = {
  strategy: 'balanced',
  includeAlternatives: true,
  rfq: {
    id: 'rfq-1',
    rfqNumber: 'RFQ-2026-001',
    title: 'Monthly Restaurant Groceries',
    deliveryDistrict: 'Colombo',
    paymentTermsRequested: 'Net 15 days',
  },
  rfqItems: [
    {
      id: 'line-1',
      productId: 'p-rice',
      description: 'Samba Rice 50kg',
      quantity: 10,
      unit: 'bag',
      targetPriceCents: 12000,
    },
    {
      id: 'line-2',
      description: 'Bulk Sugar 50kg',
      quantity: 20,
      unit: 'bag',
      targetPriceCents: 15000,
    },
  ],
  catalogOffers: [
    {
      supplierProductId: 'sp-rice',
      productId: 'p-rice',
      name: 'Samba Rice 50kg',
      basePriceCents: 12500,
      availabilityStatus: 'in_stock',
      deliveryAvailable: true,
    },
    {
      supplierProductId: 'sp-sugar',
      productId: 'p-sugar',
      name: 'Bulk Sugar 50kg',
      basePriceCents: 16000,
      availabilityStatus: 'in_stock',
      deliveryAvailable: true,
    },
  ],
};

describe('solveQuoteDraft', () => {
  it('balanced strategy uses base catalog price and offers volume tier', () => {
    const res = solveQuoteDraft({ ...mockInput, strategy: 'balanced' });
    expect(res.items).toHaveLength(2);
    expect(res.items[0].unitPriceCents).toBe(12500);
    expect(res.items[0].stockStatus).toBe('in_stock');
    expect(res.items[0].tier).toBeDefined();
    expect(res.items[0].tier?.minQty).toBe(20);
    expect(res.items[0].tier?.unitPriceCents).toBeLessThan(12500);
  });

  it('win_deal undercuts buyer target price by 2%', () => {
    const res = solveQuoteDraft({ ...mockInput, strategy: 'win_deal' });
    // targetPriceCents is 12000. 12000 * 0.98 = 11760. Floor is 12500 * 0.88 = 11000.
    expect(res.items[0].unitPriceCents).toBe(12500);
    expect(res.items[0].discountCents).toBe(12500 - 11760);
    expect(res.items[0].subtotalCents).toBe(11760 * 10);
  });

  it('win_deal respects hard margin floor when target is unrealistically low', () => {
    const lowTargetInput: SolverInput = {
      ...mockInput,
      strategy: 'win_deal',
      rfqItems: [
        {
          id: 'line-1',
          productId: 'p-rice',
          description: 'Samba Rice 50kg',
          quantity: 10,
          unit: 'bag',
          targetPriceCents: 5000, // unrealistically low
        },
      ],
    };
    const res = solveQuoteDraft(lowTargetInput);
    const floorPrice = Math.round(12500 * MARGIN_FLOOR_FACTOR);
    const netUnitPrice = res.items[0].unitPriceCents - res.items[0].discountCents;
    expect(netUnitPrice).toBe(floorPrice);
    expect(res.items[0].rationale).toContain('Floor protection applied');
  });

  it('premium_margin adds 4% markup for priority fulfillment', () => {
    const res = solveQuoteDraft({ ...mockInput, strategy: 'premium_margin' });
    expect(res.items[0].unitPriceCents).toBe(Math.round(12500 * 1.04));
    expect(res.items[0].discountCents).toBe(0);
  });

  it('handles unmatched items safely without crashing', () => {
    const unmatchedInput: SolverInput = {
      ...mockInput,
      rfqItems: [
        {
          id: 'line-unmatched',
          description: 'Imported Truffle Oil 250ml',
          quantity: 1,
          unit: 'bottle',
        },
      ],
    };
    const res = solveQuoteDraft(unmatchedInput);
    expect(res.items[0].stockStatus).toBe('unmatched');
    expect(res.items[0].unitPriceCents).toBe(0);
    expect(res.unmatchedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test src/supplier/rfqSolver.test.ts`
Expected: FAIL (cannot find `./rfqSolver`)

- [ ] **Step 3: Write implementation**

Create `packages/ai/src/supplier/rfqSolver.ts`:
```ts
import { findCatalogMatch } from './substitution';
import type { QuoteItemDraft, SolverInput, SolverOutput } from './types';

export const MARGIN_FLOOR_FACTOR = 0.88; // Maximum 12% discount off catalog base price
export const DEFAULT_DELIVERY_FEE_CENTS = 250000; // Rs. 2,500 base delivery
export const LOCAL_DISTRICT_DELIVERY_FEE_CENTS = 150000; // Rs. 1,500 local district delivery

export function solveQuoteDraft(input: SolverInput): SolverOutput {
  const { strategy, rfqItems, catalogOffers, includeAlternatives, rfq } = input;

  const quoteItems: QuoteItemDraft[] = [];
  let substitutesCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const item of rfqItems) {
    const match = findCatalogMatch(item, catalogOffers, includeAlternatives);

    if (match.matchType === 'unmatched' || !match.offer) {
      unmatchedCount++;
      quoteItems.push({
        rfqItemId: item.id,
        productId: item.productId ?? undefined,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: 0,
        discountCents: 0,
        subtotalCents: 0,
        isAlternative: false,
        rationale: 'Item not found in current catalog. Please enter price manually.',
        stockStatus: 'unmatched',
      });
      continue;
    }

    const offer = match.offer;
    const basePrice = offer.basePriceCents;
    const floorPrice = Math.round(basePrice * MARGIN_FLOOR_FACTOR);
    const targetPrice = item.targetPriceCents;

    let unitPrice = basePrice;
    let discountCents = 0;
    let rationale = '';

    if (match.isAlternative) {
      substitutesCount++;
    } else {
      matchedCount++;
    }

    if (strategy === 'win_deal') {
      let desiredNetPrice = Math.round(basePrice * 0.94); // default 6% discount
      if (targetPrice && targetPrice > 0) {
        desiredNetPrice = Math.round(targetPrice * 0.98); // undercut buyer target by 2%
      }

      if (desiredNetPrice < floorPrice) {
        desiredNetPrice = floorPrice;
        rationale = `Floor protection applied: price set to minimum margin threshold (Rs. ${(floorPrice / 100).toLocaleString()}).`;
      } else {
        rationale = targetPrice
          ? `Competitive 2% undercut on buyer target price (Rs. ${(desiredNetPrice / 100).toLocaleString()}).`
          : `Aggressive 6% volume discount to capture bid.`;
      }

      discountCents = Math.max(0, basePrice - desiredNetPrice);
      unitPrice = basePrice;
    } else if (strategy === 'premium_margin') {
      unitPrice = Math.round(basePrice * 1.04); // 4% markup
      discountCents = 0;
      rationale = 'Standard catalog rate + premium margin for expedited fulfillment and quality assurance.';
    } else {
      // Balanced: standard catalog rate with volume discount if applicable
      unitPrice = basePrice;
      const isBulk = item.quantity >= 500 || item.quantity * basePrice >= 10000000; // >= Rs. 100,000
      if (isBulk) {
        discountCents = Math.round(basePrice * 0.03); // 3% bulk volume discount
        rationale = 'Standard wholesale catalog rate with 3% bulk volume discount applied.';
      } else {
        discountCents = 0;
        rationale = 'Standard wholesale catalog rate.';
      }
    }

    const netPrice = Math.max(0, unitPrice - discountCents);
    const subtotalCents = netPrice * item.quantity;

    // Bulk tier: propose extra 4% discount at 2x quantity
    const tierMinQty = item.quantity * 2;
    const tierNetPrice = Math.max(floorPrice, Math.round(netPrice * 0.96));
    const tier = {
      minQty: tierMinQty,
      unitPriceCents: tierNetPrice,
    };

    const stockStatus = match.isAlternative
      ? 'substitute'
      : offer.availabilityStatus === 'low'
        ? 'low'
        : 'in_stock';

    quoteItems.push({
      rfqItemId: item.id,
      productId: offer.productId,
      supplierProductId: offer.supplierProductId,
      description: match.isAlternative ? offer.name : item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: unitPrice,
      discountCents,
      subtotalCents,
      isAlternative: match.isAlternative,
      alternativeForRfqItemId: match.isAlternative ? item.id : undefined,
      notes: match.alternativeReason,
      rationale,
      stockStatus,
      tier,
    });
  }

  // Delivery fee estimation
  let deliveryFeeCents = input.supplierDeliveryFeeCents ?? DEFAULT_DELIVERY_FEE_CENTS;
  if (rfq.deliveryDistrict && rfq.deliveryDistrict.toLowerCase() === 'colombo') {
    deliveryFeeCents = LOCAL_DISTRICT_DELIVERY_FEE_CENTS;
  }

  // Terms & Validity
  const validDays = 14;
  let paymentTerms = 'Net 7 days from invoice';
  if (strategy === 'win_deal' && rfq.paymentTermsRequested) {
    paymentTerms = rfq.paymentTermsRequested;
  } else if (strategy === 'premium_margin') {
    paymentTerms = 'Bank transfer before dispatch / Cash on Delivery (COD)';
  }

  return {
    items: quoteItems,
    deliveryFeeCents,
    validDays,
    paymentTerms,
    strategy,
    substitutesCount,
    matchedCount,
    unmatchedCount,
  };
}
```

Modify `packages/ai/src/supplier/index.ts`:
Add:
```ts
export * from './rfqSolver';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/ai test src/supplier/rfqSolver.test.ts`
Expected: PASS (5 tests passed)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/supplier/rfqSolver.ts packages/ai/src/supplier/rfqSolver.test.ts packages/ai/src/supplier/index.ts
git commit -m "feat(ai): add deterministic pricing solver for supplier quotes"
```

---

### Task 4: AI Quoting Orchestration Service & Fallback in `apps/api`

**Files:**
- Create: `apps/api/src/modules/rfqs/aiQuotingService.ts`
- Test: `apps/api/test/ai/aiQuotingService.test.ts`

**Interfaces:**
- Consumes: `@vyro/ai` (`solveQuoteDraft`, `SolverInput`, `AiQuoteDraftRequest`), `AIProvider` (`providerForTask`), D1 DB
- Produces: `generateAiQuoteDraft(env: Env, rfqId: string, supplierId: string, options: AiQuoteDraftRequest): Promise<AiQuoteDraft>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/ai/aiQuotingService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateAiQuoteDraft, buildFallbackProposalNotes } from '../../src/modules/rfqs/aiQuotingService';

describe('aiQuotingService', () => {
  it('buildFallbackProposalNotes generates polite B2B quotation cover text', () => {
    const text = buildFallbackProposalNotes({
      rfqTitle: 'Weekly Produce',
      deliveryDistrict: 'Colombo',
      itemCount: 3,
      substitutesCount: 1,
      strategy: 'win_deal',
    });
    expect(text).toContain('Weekly Produce');
    expect(text).toContain('Colombo');
    expect(text).toContain('alternative item');
  });

  it('buildFallbackProposalNotes explains standard quote when no substitutes', () => {
    const text = buildFallbackProposalNotes({
      rfqTitle: 'Monthly Rice',
      deliveryDistrict: 'Kandy',
      itemCount: 2,
      substitutesCount: 0,
      strategy: 'balanced',
    });
    expect(text).toContain('Monthly Rice');
    expect(text).not.toContain('alternative item');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test test/ai/aiQuotingService.test.ts`
Expected: FAIL (cannot find `aiQuotingService`)

- [ ] **Step 3: Write implementation**

Create `apps/api/src/modules/rfqs/aiQuotingService.ts`:
```ts
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { rfqs, rfqItems, supplierProducts, products, categories, auditLogs } from '@vyro/db/schema';
import {
  solveQuoteDraft,
  type AiQuoteDraft,
  type AiQuoteDraftRequest,
  type SolverCatalogOffer,
  type SolverInput,
  type SolverOutput,
} from '@vyro/ai';
import { providerForTask } from '../ai/provider';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';

export function buildFallbackProposalNotes(params: {
  rfqTitle: string;
  deliveryDistrict?: string | null;
  itemCount: number;
  substitutesCount: number;
  strategy: string;
}): string {
  const districtStr = params.deliveryDistrict ? ` to ${params.deliveryDistrict}` : '';
  const subStr =
    params.substitutesCount > 0
      ? ` Note: We have included ${params.substitutesCount} high-quality alternative item(s) from our stock for your convenience.`
      : '';
  return `Thank you for the opportunity to quote on "${params.rfqTitle}". We are pleased to provide our wholesale pricing with prompt delivery${districtStr}.${subStr} All goods are sourced in compliance with Sri Lankan quality standards.`;
}

export function buildSummaryExplanation(solver: SolverOutput): string {
  const parts: string[] = [];
  parts.push(
    `Priced ${solver.items.length} line item(s) using '${solver.strategy}' strategy.`,
  );
  if (solver.matchedCount > 0) parts.push(`${solver.matchedCount} catalog match(es).`);
  if (solver.substitutesCount > 0)
    parts.push(`${solver.substitutesCount} substitute item(s) offered for low/depleted stock.`);
  if (solver.unmatchedCount > 0)
    parts.push(`${solver.unmatchedCount} item(s) require manual catalog pricing.`);
  return parts.join(' ');
}

export async function generateAiQuoteDraft(
  env: Env,
  rfqId: string,
  supplierId: string,
  options: AiQuoteDraftRequest,
): Promise<AiQuoteDraft> {
  const db = getDb(env.DB);

  // 1. Fetch RFQ
  const rfq = await db.select().from(rfqs).where(eq(rfqs.id, rfqId)).get();
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  if (rfq.status !== 'open' && rfq.status !== 'quoting' && rfq.status !== 'published') {
    throw httpError(400, 'INVALID_STATE', `Cannot draft quote for RFQ in status '${rfq.status}'`);
  }

  // 2. Fetch RFQ items
  const items = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId)).all();
  if (items.length === 0) {
    throw httpError(400, 'BAD_REQUEST', 'RFQ contains no line items');
  }

  // 3. Fetch Supplier active catalog
  const catalogRows = await db
    .select({
      supplierProductId: supplierProducts.id,
      productId: supplierProducts.productId,
      name: products.name,
      category: categories.name,
      basePriceCents: supplierProducts.basePriceCents,
      availabilityStatus: supplierProducts.availabilityStatus,
      deliveryAvailable: supplierProducts.deliveryAvailable,
      minOrderQuantity: supplierProducts.minOrderQuantity,
    })
    .from(supplierProducts)
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(supplierProducts.supplierId, supplierId))
    .all();

  const catalogOffers: SolverCatalogOffer[] = catalogRows.map((r) => ({
    supplierProductId: r.supplierProductId,
    productId: r.productId,
    name: r.name,
    category: r.category,
    basePriceCents: r.basePriceCents,
    availabilityStatus: (r.availabilityStatus ?? 'in_stock') as 'in_stock' | 'low' | 'out_of_stock',
    deliveryAvailable: r.deliveryAvailable === 1,
    minOrderQuantity: r.minOrderQuantity,
  }));

  // 4. Run Deterministic Solver
  const solverInput: SolverInput = {
    strategy: options.strategy,
    includeAlternatives: options.includeAlternatives,
    rfq: {
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      title: rfq.title,
      deliveryDistrict: rfq.deliveryDistrict,
      deliveryCity: rfq.deliveryCity,
      paymentTermsRequested: rfq.paymentTerms,
    },
    rfqItems: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      targetPriceCents: i.targetPriceCents,
      specifications: i.specifications,
    })),
    catalogOffers,
  };

  const solverOutput = solveQuoteDraft(solverInput);
  const summaryExplanation = buildSummaryExplanation(solverOutput);

  // 5. LLM Synthesis with circuit breaker fallback
  let notes = buildFallbackProposalNotes({
    rfqTitle: rfq.title,
    deliveryDistrict: rfq.deliveryDistrict,
    itemCount: solverOutput.items.length,
    substitutesCount: solverOutput.substitutesCount,
    strategy: options.strategy,
  });

  const startTime = Date.now();
  let llmProviderName = 'fallback';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const aiProvider = providerForTask(env, 'narrate_complex');
    llmProviderName = aiProvider.name;

    const systemPrompt = `You are an expert wholesale trade account executive in Sri Lanka representing a wholesale supplier responding to a buyer RFQ. Draft a courteous, professional B2B quotation cover note (maximum 3-4 sentences). Mention delivery timelines and confirm wholesale stock readiness. If any substitute items were suggested, mention them politely. Return ONLY the drafted message text.`;

    const userContent = JSON.stringify({
      rfqTitle: rfq.title,
      buyerDistrict: rfq.deliveryDistrict,
      strategy: options.strategy,
      quotedItems: solverOutput.items.map((it) => ({
        description: it.description,
        isAlternative: it.isAlternative,
        notes: it.notes,
      })),
    });

    const abortCtrl = new AbortController();
    const timeout = setTimeout(() => abortCtrl.abort(), 8000);

    const chatRes = await aiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.3, maxTokens: 250, signal: abortCtrl.signal },
    );
    clearTimeout(timeout);

    if (chatRes.content && chatRes.content.trim().length > 10) {
      notes = chatRes.content.trim();
      tokensIn = chatRes.tokensIn ?? 0;
      tokensOut = chatRes.tokensOut ?? 0;
    }
  } catch (_e) {
    // Fallback notes preserved gracefully
  }

  // 6. Audit log
  try {
    await db.insert(auditLogs).values({
      id: newId('audit'),
      action: 'ai.supplier.quote_draft',
      actorType: 'supplier',
      actorId: supplierId,
      metadata: JSON.stringify({
        rfqId,
        supplierId,
        strategy: options.strategy,
        itemCount: solverOutput.items.length,
        substitutesCount: solverOutput.substitutesCount,
        provider: llmProviderName,
        latencyMs: Date.now() - startTime,
        tokensIn,
        tokensOut,
      }),
      createdAt: Date.now(),
    });
  } catch (_e) {
    // non-fatal
  }

  return {
    deliveryFeeCents: solverOutput.deliveryFeeCents,
    validDays: solverOutput.validDays,
    paymentTerms: solverOutput.paymentTerms,
    notes,
    summaryExplanation,
    strategyUsed: options.strategy,
    items: solverOutput.items,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test test/ai/aiQuotingService.test.ts`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/rfqs/aiQuotingService.ts apps/api/test/ai/aiQuotingService.test.ts
git commit -m "feat(api): add AI quoting orchestration service with LLM notes & fallback"
```

---

### Task 5: API Route `POST /api/rfqs/:id/ai-quote-draft`

**Files:**
- Modify: `apps/api/src/modules/rfqs/routes.ts`
- Test: `apps/api/test/ai/aiQuoteDraftRoute.test.ts`

**Interfaces:**
- Consumes: `generateAiQuoteDraft`, `AiQuoteDraftRequestSchema`, session, `requireSupplierRole`
- Produces: HTTP response `{ draft: AiQuoteDraft }`

- [ ] **Step 1: Write the route test**

```ts
// apps/api/test/ai/aiQuoteDraftRoute.test.ts
import { describe, it, expect } from 'vitest';
import { AiQuoteDraftRequestSchema } from '@vyro/ai';

describe('ai quote draft route schema validation', () => {
  it('accepts valid strategy and options', () => {
    const res = AiQuoteDraftRequestSchema.safeParse({
      strategy: 'win_deal',
      includeAlternatives: false,
    });
    expect(res.success).toBe(true);
  });

  it('rejects invalid strategy', () => {
    const res = AiQuoteDraftRequestSchema.safeParse({
      strategy: 'unknown_strategy',
    });
    expect(res.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test test/ai/aiQuoteDraftRoute.test.ts`
Expected: PASS

- [ ] **Step 3: Wire route into `apps/api/src/modules/rfqs/routes.ts`**

In `apps/api/src/modules/rfqs/routes.ts`:
Import:
```ts
import { AiQuoteDraftRequestSchema } from '@vyro/ai';
import { generateAiQuoteDraft } from './aiQuotingService';
```

Add endpoint under supplier portal section:
```ts
router.post('/:id/ai-quote-draft', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const url = new URL(c.req.url);
  const supplierId = url.searchParams.get('supplierId') ?? ctx.suppliers?.[0]?.supplierId;
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, supplierId, S_ROLES);

  const rawBody = await c.req.json().catch(() => ({}));
  const parsed = AiQuoteDraftRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten());
  }

  const draft = await generateAiQuoteDraft(c.env, c.req.param('id'), supplierId, parsed.data);
  return c.json({ draft });
});
```

- [ ] **Step 4: Verify typecheck on api package**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/rfqs/routes.ts apps/api/test/ai/aiQuoteDraftRoute.test.ts
git commit -m "feat(api): expose POST /api/rfqs/:id/ai-quote-draft endpoint"
```

---

### Task 6: Supplier Portal UI Component `AiQuoteCopilotCard`

**Files:**
- Create: `apps/web/src/supplier/components/AiQuoteCopilotCard.tsx`
- Test: Build / typecheck via `pnpm --filter @vyro/web typecheck`

**Interfaces:**
- Consumes: `api.post`, `useToast`, `AiQuoteDraft`
- Produces: React component `AiQuoteCopilotCard` with props:
  - `rfqId: string`
  - `supplierId: string`
  - `onApplyDraft: (draft: AiQuoteDraft) => void`

- [ ] **Step 1: Write component implementation**

Create `apps/web/src/supplier/components/AiQuoteCopilotCard.tsx`:
```tsx
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import type { AiQuoteDraft, AiQuoteStrategy } from '@vyro/ai';

interface AiQuoteCopilotCardProps {
  rfqId: string;
  supplierId: string;
  onApplyDraft: (draft: AiQuoteDraft) => void;
}

export function AiQuoteCopilotCard({ rfqId, supplierId, onApplyDraft }: AiQuoteCopilotCardProps) {
  const toast = useToast();
  const [strategy, setStrategy] = useState<AiQuoteStrategy>('balanced');
  const [includeAlternatives, setIncludeAlternatives] = useState(true);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AiQuoteDraft | null>(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await api.post<{ draft: AiQuoteDraft }>(
        `/rfqs/${rfqId}/ai-quote-draft?supplierId=${supplierId}`,
        {
          strategy,
          includeAlternatives,
        },
      );
      setDraft(res.draft);
      toast.success('AI quote draft generated!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to draft AI quote');
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!draft) return;
    onApplyDraft(draft);
    toast.success('AI quote applied to form! Review and adjust before submitting.');
  }

  return (
    <Surface kind="card" className="mb-6 rounded-xl border border-mint/30 bg-mint/5 p-4 shadow-soft-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-sm text-paper font-bold">
            ✨
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">AI Quoting Copilot</h3>
            <p className="text-xs text-ink-3">
              Auto-price catalog items, apply volume discounts, and suggest in-stock substitutes.
            </p>
          </div>
        </div>

        {/* Strategy Selector Pills */}
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-paper p-1 text-xs">
          <button
            type="button"
            onClick={() => setStrategy('win_deal')}
            className={`rounded px-2.5 py-1 font-medium transition ${
              strategy === 'win_deal' ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
            }`}
            title="Aggressive discount to undercut target and capture new accounts"
          >
            🎯 Win Deal
          </button>
          <button
            type="button"
            onClick={() => setStrategy('balanced')}
            className={`rounded px-2.5 py-1 font-medium transition ${
              strategy === 'balanced' ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
            }`}
            title="Standard catalog wholesale rate with volume tiers"
          >
            ⚖️ Balanced
          </button>
          <button
            type="button"
            onClick={() => setStrategy('premium_margin')}
            className={`rounded px-2.5 py-1 font-medium transition ${
              strategy === 'premium_margin' ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
            }`}
            title="Premium quality and expedited dispatch"
          >
            💎 Margin
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/40 pt-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer text-ink-2">
          <input
            type="checkbox"
            checked={includeAlternatives}
            onChange={(e) => setIncludeAlternatives(e.target.checked)}
            className="rounded border-line text-mint focus:ring-mint"
          />
          <span>Suggest in-stock substitutes for depleted/unstocked items</span>
        </label>

        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-mint text-paper hover:bg-mint-deep px-4 py-1.5 text-xs font-semibold"
        >
          {loading ? 'Analyzing Catalog…' : '✨ Draft AI Quote'}
        </Button>
      </div>

      {/* Result Preview & 1-Click Fill Banner */}
      {draft && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-ink">Quotation Summary</div>
              <p className="mt-0.5 text-ink-3">{draft.summaryExplanation}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded border border-line px-2.5 py-1 text-ink-3 hover:text-ink"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded bg-mint px-3 py-1 font-semibold text-paper hover:bg-mint-deep shadow-sm"
              >
                Apply to Quote Form
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {draft.items.map((it) => (
              <span
                key={it.rfqItemId}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] ${
                  it.stockStatus === 'substitute'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : it.stockStatus === 'unmatched'
                      ? 'bg-ink-1/10 text-ink-3'
                      : it.discountCents > 0
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
                title={it.rationale}
              >
                {it.stockStatus === 'substitute' && '🟡 Alternative: '}
                {it.description} —{' '}
                {it.unitPriceCents > 0
                  ? `Rs. ${((it.unitPriceCents - it.discountCents) / 100).toLocaleString()}`
                  : 'Manual price'}
              </span>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @vyro/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/supplier/components/AiQuoteCopilotCard.tsx
git commit -m "feat(web): add AiQuoteCopilotCard component for supplier RFQ quoting"
```

---

### Task 7: Integrate Copilot into `SupplierQuoteDetailPage.tsx`

**Files:**
- Modify: `apps/web/src/supplier/SupplierQuoteDetailPage.tsx`
- Test: Monorepo test & typecheck

**Interfaces:**
- Consumes: `AiQuoteCopilotCard`, `AiQuoteDraft`
- Produces: Integrated quote form with AI auto-fill capability

- [ ] **Step 1: Integrate into `SupplierQuoteDetailPage.tsx`**

Import `AiQuoteCopilotCard`:
```tsx
import { AiQuoteCopilotCard } from './components/AiQuoteCopilotCard';
import type { AiQuoteDraft } from '@vyro/ai';
```

Add `applyAiDraft` callback inside `SupplierQuoteDetailPage`:
```tsx
function applyAiDraft(draft: AiQuoteDraft) {
  setDeliveryFee(String(draft.deliveryFeeCents / 100));
  setValidDays(String(draft.validDays));
  setPaymentTerms(draft.paymentTerms);
  setNotes(draft.notes);

  setLines((prev) =>
    prev.map((l) => {
      const draftItem = draft.items.find((it) => it.rfqItemId === l.rfqItemId);
      if (!draftItem || draftItem.unitPriceCents === 0) return l;

      return {
        ...l,
        productId: draftItem.productId ?? l.productId,
        description: draftItem.description,
        unitPrice: String(draftItem.unitPriceCents / 100),
        discount: String(draftItem.discountCents / 100),
        isAlternative: draftItem.isAlternative,
        alternativeFor: draftItem.alternativeForRfqItemId,
        notes: draftItem.notes ?? l.notes,
        tierQty: draftItem.tier ? String(draftItem.tier.minQty) : l.tierQty,
        tierPrice: draftItem.tier ? String(draftItem.tier.unitPriceCents / 100) : l.tierPrice,
      };
    }),
  );
}
```

Mount component above the quote lines form in JSX:
```tsx
{rfqId && supplierId && (
  <AiQuoteCopilotCard
    rfqId={rfqId}
    supplierId={supplierId}
    onApplyDraft={applyAiDraft}
  />
)}
```

- [ ] **Step 2: Run verification scripts**

Run:
```bash
pnpm --filter @vyro/ai test
pnpm --filter @vyro/api test
pnpm typecheck
```
Expected: All tests pass, typecheck passes with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/supplier/SupplierQuoteDetailPage.tsx
git commit -m "feat(supplier): integrate AI quoting copilot card into SupplierQuoteDetailPage"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-12-supplier-rfq-copilot.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
