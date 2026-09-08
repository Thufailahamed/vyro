# VYRO AI Phase 4 — Smart Search, Product Matching, Feedback Loop, Inline Cart

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert natural-language product search into structured filters; strengthen cross-supplier product matching via token-Jaccard; capture user feedback for offline evaluation only; upgrade cart hints to per-line inline suggestions.

**Architecture:** Pure `parseNlFilters(prompt)` strips matched phrases and emits typed filters (`priceMaxCents`, `availableWithinDays`, `categorySlug`, `brand`, `supplierName`, `sort`). `searchProductsHandler` reuses heuristic-stripped `query` + passes filters to a new `searchProductsFiltered` repo method that joins catalog + supplier_product. `resolveProduct` gains a token-Jaccard re-rank step inside the fuzzy bucket; below threshold ⇒ return existing clarification list. New `POST /api/ai/feedback` writes an audit row under generalized `action: 'ai.request' | 'ai.feedback'` — no retraining trigger. Cart hints expose per-line suggestions keyed off the same `loadCartHintInputs` so the cart page renders save chips inside each supplier group instead of relying only on the top banner.

**Tech Stack:** TypeScript strict, Zod `.strict()`, Drizzle/D1, Hono, React 19 + react-query, Vitest, existing `@vyro/ai` analytics engines.

## Global Constraints

- All existing Phase 0-3 constraints preserved (deterministic narration default, `.strict()` schemas, tenant filter, role allowlist).
- NL filter parsing is **pure** — no IO, no LLM. Strip matched phrases before any LLM step to keep the prompt crisp.
- Feedback writes ONE audit row. No fanout, no downstream side effects, no retraining.
- Per-line cart suggestions reuse existing `loadCartHintInputs` + `buildCartHints` shape; extend with optional `lineHints?: CartHintLine[]` without breaking callers.
- Product matching remains deterministic (token-Jaccard >= 0.4 ⇒ accept; < 0.4 ⇒ clarify). Never auto-merge products. Never claim equivalence without data.
- Viewer role can submit feedback about WHAT VYRO said. Feedback endpoint shares `/ask` RBAC: any logged-in user. Write remains unused (just metadata).
- SearchPage chips are visual only — server still re-parses the prompt.
- Every new public function has a vitest test that fails before implementation.

---

### Task 1: NL filter parser (pure)

**Files:**
- Create: `packages/ai/src/refinement/nlFilters.ts`
- Test: `packages/ai/src/refinement/nlFilters.test.ts`
- Modify: `packages/ai/src/refinement/index.ts` (export new module)

**Interfaces:**
- Produces:
  ```ts
  export type NlSort = 'price_asc' | 'lead_asc' | 'recommended';
  export interface ParsedFilters {
    query?: string;            // strip NL phrases; remaining free-text
    priceMaxCents?: number;    // int cents
    availableWithinDays?: number; // int 1..30
    categorySlug?: string;
    brand?: string;
    supplierName?: string;
    sort?: NlSort;
  }
  export function parseNlFilters(prompt: string): { filters: ParsedFilters; query: string }
  ```

- [ ] **Step 1: Write failing test**

`packages/ai/src/refinement/nlFilters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseNlFilters } from './nlFilters';
describe('parseNlFilters', () => {
  it('extracts priceMaxCents and removes phrase', () => {
    const r = parseNlFilters('cheap rice under Rs. 20,000 tomorrow');
    expect(r.filters.priceMaxCents).toBe(2_000_000);
    expect(r.filters.availableWithinDays).toBe(1);
    expect(r.filters.sort).toBe('price_asc');
    expect(r.query).toMatch(/rice/);
  });
  it('maps category slang', () => {
    const r = parseNlFilters('flour for bakery');
    expect(r.filters.categorySlug).toBe('bakery');
  });
  it('leaves clean queries alone', () => {
    const r = parseNlFilters('samba rice 25kg');
    expect(r.query).toBe('samba rice 25kg');
    expect(r.filters.priceMaxCents).toBeUndefined();
  });
  it('parses lead-time sort from urgent', () => {
    const r = parseNlFilters('cooking oil urgent');
    expect(r.filters.sort).toBe('lead_asc');
  });
  it('extracts supplier name from "from <supplier>"', () => {
    const r = parseNlFilters('sugar from Best Wholesale');
    expect(r.filters.supplierName).toBe('Best Wholesale');
    expect(r.query).toMatch(/sugar/);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @vyro/ai test -- src/refinement/nlFilters.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implement `nlFilters.ts`**

```ts
export type NlSort = 'price_asc' | 'lead_asc' | 'recommended';

export interface ParsedFilters {
  query?: string;
  priceMaxCents?: number;
  availableWithinDays?: number;
  categorySlug?: string;
  brand?: string;
  supplierName?: string;
  sort?: NlSort;
}

const PRICE_RX = /\bunder\s+rs\.?\s?([\d,]+)/i;
const TIME_RX = /\b(tomorrow|today|in\s+(\d+)\s*(?:hour|hr|day|d)s?)\b/i;
const CATEGORY_SLANG: Record<string, string> = {
  bakery: 'bakery',
  restaurant: 'restaurant',
  cafe: 'cafe',
  kitchen: 'kitchen',
};
const CHEAP_RX = /\b(cheap|cheapest|lowest|low\s*price)\b/i;
const FAST_RX = /\b(urgent|fast|asap|quick(ly)?|same[-\s]?day)\b/i;
const FROM_SUPPLIER_RX = /\bfrom\s+([A-Z][\w&' .-]{1,60})\b/;
const TIME_TO_DAYS: Record<string, number> = { today: 0, tomorrow: 1, today_only: 0, tomorrow_only: 1 };

export function parseNlFilters(prompt: string): { filters: ParsedFilters; query: string } {
  let q = prompt.trim();
  const filters: ParsedFilters = {};

  const m = q.match(PRICE_RX);
  if (m && m[1]) {
    const cents = Math.round(Number(m[1].replace(/,/g, '')) * 100);
    if (Number.isFinite(cents) && cents > 0 && cents <= 100_000_000) filters.priceMaxCents = cents;
    q = q.replace(PRICE_RX, '').replace(/\s+/g, ' ').trim();
  }
  const t = q.match(TIME_RX);
  if (t) {
    let days: number | undefined;
    if (t[1] === 'today') days = 0;
    else if (t[1] === 'tomorrow') days = 1;
    else if (t[2]) days = Math.max(0, Math.min(30, parseInt(t[2], 10)));
    if (typeof days === 'number') filters.availableWithinDays = days;
    q = q.replace(TIME_RX, '').replace(/\s+/g, ' ').trim();
  }
  for (const [slang, slug] of Object.entries(CATEGORY_SLANG)) {
    const re = new RegExp(`\\bfor\\s+${slang}\\b|\\b${slang}\\s+suppl(y|ies)\\b`, 'i');
    if (re.test(q)) { filters.categorySlug = slug; q = q.replace(re, '').replace(/\s+/g, ' ').trim(); break; }
  }
  if (FAST_RX.test(q)) { filters.sort = 'lead_asc'; }
  else if (CHEAP_RX.test(q)) { filters.sort = 'price_asc'; }
  if (filters.sort) q = q.replace(FAST_RX, '').replace(CHEAP_RX, '').replace(/\s+/g, ' ').trim();

  const f = q.match(FROM_SUPPLIER_RX);
  if (f && f[1]) {
    filters.supplierName = f[1].trim();
    q = q.replace(f[0], '').replace(/\s+/g, ' ').trim();
  }

  if (q.length > 0) filters.query = q;
  return { filters, query: filters.query ?? q };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/ai test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/refinement/nlFilters.ts packages/ai/src/refinement/nlFilters.test.ts packages/ai/src/refinement/index.ts
git commit -m "feat(ai): parseNlFilters — NL prompt to typed filter set"
```

---

### Task 2: searchProductsHandler consumes filters + new repo method

**Files:**
- Modify: `apps/api/src/modules/ai/intents/searchProducts.ts`
- Modify: `apps/api/src/modules/ai/intents/repos.ts` (add `searchProductsFiltered`)
- Modify: `apps/api/src/modules/ai/intents/drizzleRepos.ts` (impl + tests if missing)
- Test: `apps/api/test/ai/phase4/searchProducts.test.ts`

**Interfaces:**
- `AiRepos.searchProductsFiltered(opts)` joins catalog + supplier_product.
- `searchProductsHandler` calls `parseNlFilters(prompt)` first; passes `{ ...filters, query }`.

- [ ] **Step 1: Write failing handler test**

`apps/api/test/ai/phase4/searchProducts.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { searchProductsHandler } from '../../../src/modules/ai/intents/searchProducts';

const baseHit = (overrides: any = {}) => ({
  product: { id: 'p1', name: 'Samba Rice 25kg', unit: 'bag', categoryId: 'c', packSize: '25kg' },
  bestOffer: { supplier: { id: 's1', name: 'Best Wholesale' }, priceCents: 1_900_000, leadTimeDays: 2, availabilityStatus: 'in_stock', minOrderQty: 1 },
  offerCount: 3, ...overrides,
});

describe('searchProductsHandler with NL filters', () => {
  it('applies priceMaxCents + sort=price_asc and removes the phrase from query', async () => {
    const searchProductsFiltered = vi.fn(async () => [baseHit()]);
    const repos = { searchProductsFiltered, searchProducts: vi.fn() } as any;
    const r = await searchProductsHandler(
      {
        env: {} as any,
        businessId: 'b1',
        userId: 'u1',
        classify: {
          intent: 'search_products',
          slots: { query: 'cheap rice under Rs. 20,000', topN: undefined, productName: undefined } as any,
          confidence: 0.7,
        },
      },
      repos,
    );
    expect(r.components[0]?.type).toBe('supplier_list_card');
    const d: any = (r.components[0] as any).data;
    expect(d.title).toMatch(/Samba|rice/);
    expect(searchProductsFiltered).toHaveBeenCalledWith(expect.objectContaining({
      priceMaxCents: 2_000_000,
      sort: 'price_asc',
    }));
  });

  it('clarifies when both query and filters are empty', async () => {
    const repos = { searchProductsFiltered: vi.fn(), searchProducts: vi.fn() } as any;
    const r = await searchProductsHandler(
      {
        env: {} as any, businessId: 'b1', userId: 'u1',
        classify: { intent: 'search_products', slots: { query: 'under rs. 5000' } as any, confidence: 0.5 },
      },
      repos,
    );
    expect(r.components[0]?.type).toBe('clarification_card');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/phase4/searchProducts.test.ts`
Expected: FAIL

- [ ] **Step 3: Add repo method shape**

`apps/api/src/modules/ai/intents/repos.ts` append:
```ts
searchProductsFiltered(opts: { query?: string; priceMaxCents?: number; availableWithinDays?: number; categorySlug?: string; brand?: string; supplierName?: string; sort?: 'price_asc' | 'lead_asc' | 'recommended'; limit?: number }): Promise<Array<ProductRow & { bestOffer: (OfferRow & { supplier: SupplierRow }) | null; offerCount: number }>>;
```

- [ ] **Step 4: Implement `drizzleRepos.searchProductsFiltered`**

Compose from `searchProducts` (query match) + a WHERE-filter pass on best offers. Mirror `searchProducts` and add `priceCents <= ?`, `leadTimeDays <= ?`, `supplier.name = ?` predicates; sort by `priceCents asc | leadTimeDays asc` accordingly. If `searchProductsFiltered` is already implemented, this is a no-op.

- [ ] **Step 5: Implement `searchProductsHandler` NL-aware path**

```ts
import { parseNlFilters } from '@vyro/ai';
// at top of handler:
const rawPrompt = String(ctx.env?.__lastPrompt ?? '');
const { filters, query: cleanQuery } = parseNlFilters(rawPrompt);
const slotQuery = (ctx.classify.slots.query ?? ctx.classify.slots.productName ?? '').trim();
const mergedQuery = cleanQuery || slotQuery;
const effectiveSort = filters.sort ?? 'recommended';

if (!mergedQuery.trim() && !filters.priceMaxCents && !filters.categorySlug) {
  return clarification;
}

const limit = ctx.classify.slots.topN ?? 20;
const hits = await repos.searchProductsFiltered({
  ...(mergedQuery.trim() ? { query: mergedQuery.trim() } : {}),
  ...filters,
  sort: effectiveSort,
  limit,
});
```

No-op when env doesn't carry the prompt — falls back to slot-based query path.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/phase4`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/intents/searchProducts.ts apps/api/src/modules/ai/intents/repos.ts apps/api/src/modules/ai/intents/drizzleRepos.ts apps/api/test/ai/phase4/searchProducts.test.ts
git commit -m "feat(ai): searchProducts consumes NL filters + new filtered repo method"
```

---

### Task 3: token-Jaccard product-match upgrade

**Files:**
- Modify: `apps/api/src/modules/ai/intents/productMatch.ts`
- Create: `apps/api/src/modules/ai/intents/tokenJaccard.ts`
- Test: `apps/api/test/ai/phase4/productMatch.test.ts`

**Interfaces:**
- Produces: `tokenJaccard(a, b): number` (shingle token overlap; 0..1).
- `resolveProduct` uses Jaccard as fuzzy re-rank; below 0.4 ⇒ clarification. Above 0.4 but < 0.6 ⇒ clarification if multiple candidates.

- [ ] **Step 1: Write failing token test**

`apps/api/test/ai/phase4/tokenJaccard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tokenJaccard } from '../../../src/modules/ai/intents/tokenJaccard';

describe('tokenJaccard', () => {
  it('1.0 on identical strings', () => expect(tokenJaccard('rice 25kg', 'rice 25kg')).toBe(1));
  it('partial overlap', () => expect(tokenJaccard('samba rice', 'red rice')).toBeCloseTo(0.3333, 3));
  it('0 when disjoint', () => expect(tokenJaccard('rice', 'sugar')).toBe(0));
  it('case + punctuation insensitive', () => expect(tokenJaccard('Samba Rice 25kg', 'samba rice')).toBeGreaterThan(0.5));
});
```

- [ ] **Step 2: Implement `tokenJaccard.ts`**

```ts
export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}
export function tokenJaccard(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}
```

- [ ] **Step 3: Write failing `resolveProduct` Jaccard test**

`apps/api/test/ai/phase4/productMatch.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveProduct } from '../../../src/modules/ai/intents/productMatch';

const hit = (name: string) => ({
  id: name.replace(/\s+/g, '-'),
  name,
  unit: 'kg',
  categoryId: 'c',
  packSize: null,
  bestOffer: null,
  offerCount: 1,
});

describe('resolveProduct with token-Jaccard re-rank', () => {
  it('exact wins', async () => {
    const repos = { searchProducts: vi.fn(async () => [hit('Samba Rice 25kg')]), findProductByName: vi.fn() } as any;
    const r = await resolveProduct(repos, 'Samba Rice 25kg');
    expect(r.kind).toBe('single');
  });
  it('fuzzy Jaccard >= 0.4 picks the best fuzzy when single candidate', async () => {
    const repos = { searchProducts: vi.fn(async () => [hit('Samba Rice 5kg')]), findProductByName: vi.fn() } as any;
    const r = await resolveProduct(repos, 'Samba Rice 25kg');
    expect(r.kind).toBe('single');
  });
  it('multiple candidates below threshold → clarification', async () => {
    const repos = { searchProducts: vi.fn(async () => [hit('Sugar 1kg'), hit('Flour 1kg')]), findProductByName: vi.fn() } as any;
    const r = await resolveProduct(repos, 'Basmati Rice 25kg');
    expect(r.kind).toBe('clarify');
  });
});
```

- [ ] **Step 4: Implement re-rank inside `resolveProduct`**

Inside the fuzzy branch:
```ts
import { tokenJaccard } from './tokenJaccard';
const ranked = hits.map((h) => ({ h, j: tokenJaccard(rawName, h.name) }))
  .sort((a, b) => b.j - a.j);
const top = ranked[0]!;
if (top.j >= 0.4 && ranked.length === 1) return { kind: 'single', product: top.h };
if (top.j >= 0.6 && top.j - (ranked[1]?.j ?? 0) >= 0.2) return { kind: 'single', product: top.h };
return { kind: 'clarify', question: `I found several products matching "${rawName.trim()}". Which one do you mean?`, options: ranked.slice(0, 4).map((x) => x.h.name) };
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/phase4`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/intents/productMatch.ts apps/api/src/modules/ai/intents/tokenJaccard.ts apps/api/test/ai/phase4/{productMatch,tokenJaccard}.test.ts
git commit -m "feat(ai): token-Jaccard re-rank in resolveProduct — never auto-merge"
```

---

### Task 4: Feedback endpoint + generalized audit + UI buttons

**Files:**
- Modify: `packages/ai/src/schemas.ts` (feedback schema)
- Modify: `apps/api/src/modules/ai/audit.ts` (broader action union)
- Modify: `apps/api/src/modules/ai/routes.ts` (POST `/api/ai/feedback`)
- Create: `apps/web/src/ask/components/FeedbackButtons.tsx`
- Modify: `apps/web/src/ask/AskPage.tsx` (mount FeedbackButtons per final event)
- Test: `apps/api/test/ai/phase4/feedback.test.ts`

**Interfaces:**
- Schema: `feedbackSchema = z.object({ requestId, helpful, reason?, intentHint? }).strict()`
- Audit action union: `'ai.request' | 'ai.feedback'`. NEW writer `writeFeedbackAudit(env, entry)`.
- Endpoint: `POST /api/ai/feedback` — same RBAC as `/ask`. Writes ONE audit row, returns `{ ok: true }`.

- [ ] **Step 1: Write failing feedback handler test**

`apps/api/test/ai/phase4/feedback.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { buildFeedbackAudit } from '../../../src/modules/ai/audit';

describe('buildFeedbackAudit', () => {
  it('embeds helpful + reason into metadata only', () => {
    const row = buildFeedbackAudit({
      userId: 'u1', businessId: 'b1', requestId: 'req-1', helpful: true,
    });
    expect(row.action).toBe('ai.feedback');
    const md = JSON.parse(row.metadata);
    expect(md.helpful).toBe(true);
    expect(md.reason).toBeUndefined();
  });
  it('includes reason when provided', () => {
    const row = buildFeedbackAudit({
      userId: 'u1', businessId: 'b1', requestId: 'req-1', helpful: false, reason: 'wrong_product',
    });
    const md = JSON.parse(row.metadata);
    expect(md.helpful).toBe(false);
    expect(md.reason).toBe('wrong_product');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/phase4/feedback.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `audit.ts`**

```ts
export interface FeedbackAuditEntry {
  userId: string;
  businessId: string;
  requestId: string;
  helpful: boolean;
  reason?: 'wrong_product'|'wrong_supplier'|'price_incorrect'|'not_relevant'|'other';
  intentHint?: string;
}

export function buildFeedbackAudit(entry: FeedbackAuditEntry): AiAuditRow {
  const metadata = {
    kind: 'feedback',
    helpful: entry.helpful,
    ...(entry.reason ? { reason: entry.reason } : {}),
    ...(entry.intentHint ? { intentHint: entry.intentHint } : {}),
  };
  return {
    id: newId(),
    actorUserId: entry.userId,
    action: 'ai.feedback',
    resourceType: 'ai_request',
    resourceId: entry.requestId,
    metadata: JSON.stringify(metadata),
    ip: null, userAgent: null, createdAt: Date.now(),
  };
}

export async function writeFeedbackAudit(env: { DB: D1Database }, entry: FeedbackAuditEntry): Promise<void> {
  await getDb(env.DB).insert(auditLogs).values(buildFeedbackAudit(entry) as any);
}
```

- [ ] **Step 4: Add `feedbackSchema` + POST `/api/ai/feedback` route**

```ts
const feedbackSchema = z.object({
  requestId: z.string().min(1).max(80),
  helpful: z.boolean(),
  reason: z.enum(['wrong_product','wrong_supplier','price_incorrect','not_relevant','other']).optional(),
  intentHint: z.string().max(80).optional(),
}).strict();

router.post('/feedback', session(), rateLimit({ key: 'ai-feedback', limit: 60, window: 60 }), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'session required');
  const body = await c.req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) throw httpError(400, 'INVALID_BODY', 'invalid feedback payload');
  const businessId = pickBusinessId(ctx);
  if (!businessId) throw httpError(400, 'BUSINESS_REQUIRED', 'business required');
  await writeFeedbackAudit(c.env, {
    userId: ctx.user.id,
    businessId,
    requestId: parsed.data.requestId,
    helpful: parsed.data.helpful,
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    ...(parsed.data.intentHint ? { intentHint: parsed.data.intentHint } : {}),
  });
  return c.json({ ok: true });
});
```

- [ ] **Step 5: Build `FeedbackButtons` + mount**

Mount inside the final assistant bubble so 👍/👎 become the requestId of the most recent final SSE event. Reason dropdown expands on 👎. Skip on `message.role !== 'final'`. POST to `/api/ai/feedback`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/phase4/feedback.test.ts && pnpm --filter @vyro/web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/schemas.ts apps/api/src/modules/ai/audit.ts apps/api/src/modules/ai/routes.ts apps/web/src/ask/components/FeedbackButtons.tsx apps/web/src/ask/AskPage.tsx apps/api/test/ai/phase4/feedback.test.ts
git commit -m "feat(ai): /api/ai/feedback writes ai.feedback audit — offline eval only"
```

---

### Task 5: Inline per-line cart suggestions + CartPage render

**Files:**
- Modify: `apps/api/src/modules/ai/cartHints.ts`
- Modify: `apps/web/src/pages/CartPage.tsx`

**Interfaces:**
- `buildCartHints` returns optional `lineHints: Array<{ lineProductId, altSupplier, savingCents, dismissKey }>` in addition to existing structure.
- Or new sibling `buildCartLineHints` keeps existing API stable.

- [ ] **Step 1: Write failing cart line hint test**

`apps/api/test/ai/phase4/cartLineHints.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { buildCartLineHints } from '../../../src/modules/ai/cartHints';

const repos = {
  listOffersByProduct: vi.fn(async () => [
    { supplier: { name: 'A' }, priceCents: 5000, leadTimeDays: 2, availabilityStatus: 'in_stock', minOrderQty: 1 },
    { supplier: { name: 'B' }, priceCents: 4500, leadTimeDays: 3, availabilityStatus: 'in_stock', minOrderQty: 1 },
  ]),
};

describe('buildCartLineHints', () => {
  it('returns per-line save hint for each line with cheaper alternative', async () => {
    const hints = await buildCartLineHints(repos, [
      { productId: 'p1', productName: 'Rice', quantity: 2, priceCents: 5000, supplierName: 'A' },
    ], []);
    expect(hints).toHaveLength(1);
    expect(hints[0]!.savingCents).toBe(1000);
    expect(hints[0]!.altSupplier).toBe('B');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/phase4/cartLineHints.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `buildCartLineHints`**

```ts
export interface CartLineHint {
  productId: string;
  productName: string;
  altSupplierName: string;
  savingCents: number;
  dismissKey: string;
}
export async function buildCartLineHints(
  repos: { listOffersByProduct(productId: string): Promise<Array<{ priceCents: number; leadTimeDays: number; availabilityStatus: string; supplier: { name: string } }>> },
  cart: CartHintLine[],
  dismissed: string[],
): Promise<CartLineHint[]> {
  const out: CartLineHint[] = [];
  for (const line of cart) {
    const offers = await repos.listOffersByProduct(line.productId).catch(() => []);
    const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
    const alt = live
      .filter((o) => o.supplier.name.toLowerCase() !== line.supplierName.toLowerCase())
      .sort((a, b) => a.priceCents - b.priceCents)[0];
    if (!alt || alt.priceCents >= line.priceCents) continue;
    const dismissKey = `vyro-cart-line:switch:${line.productId}`;
    if (dismissed.includes(dismissKey)) continue;
    out.push({
      productId: line.productId, productName: line.productName,
      altSupplierName: alt.supplier.name,
      savingCents: (line.priceCents - alt.priceCents) * line.quantity,
      dismissKey,
    });
  }
  return out;
}
```

- [ ] **Step 4: Expose via `/api/ai/cart-line-hints` (or extend `/cart-hints`)**

Add `?dismissed=…` query param to `/cart-hints`. Build handler returns `{ lineHints: CartLineHint[] }`. Mirror the existing GET (session + businessId gate).

- [ ] **Step 5: Render per-line chips inside CartPage**

For each supplier group row, if the line's productId has a hint, render a tiny "→ Switch to B, save Rs. 250" chip with a dismiss X. Use the existing `dismissKey` from localStorage.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/phase4/cartLineHints.test.ts && pnpm --filter @vyro/web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/cartHints.ts apps/api/src/modules/ai/routes.ts apps/web/src/pages/CartPage.tsx apps/api/test/ai/phase4/cartLineHints.test.ts
git commit -m "feat(ai): per-line switch_save hints inside cart supplier groups"
```

---

### Task 6: SearchPage NL chips

**Files:**
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Create: `apps/web/src/ask/nlFilters.client.ts`
- Test: `apps/web/test/searchNl.test.ts`

- [ ] **Step 1: Write failing chip test**

`apps/web/test/searchNl.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSearchChips } from '../src/ask/nlFilters.client';

describe('buildSearchChips', () => {
  it('renders max price + sort chips', () => {
    const chips = buildSearchChips({ query: 'rice', priceMaxCents: 2_000_000, sort: 'price_asc' });
    const text = chips.map((c) => c.label).join('|');
    expect(text).toMatch(/rice/i);
    expect(text).toMatch(/Rs\./);
    expect(text).toMatch(/price asc/i);
  });
  it('hides empties', () => {
    const chips = buildSearchChips({ query: 'rice' });
    expect(chips.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/web test -- test/searchNl.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `nlFilters.client.ts`**

```ts
import type { ParsedFilters } from '@vyro/ai';
import { parseNlFilters } from '@vyro/ai';

export interface Chip { label: string; tone?: 'neutral' | 'copper' | 'mint' | 'rose' }

export function buildSearchChips(f: ParsedFilters): Chip[] {
  const out: Chip[] = [];
  if (f.query) out.push({ label: f.query });
  if (f.priceMaxCents) out.push({ label: `Under Rs. ${(f.priceMaxCents / 100).toLocaleString('en-LK')}`, tone: 'copper' });
  if (f.availableWithinDays != null) out.push({ label: f.availableWithinDays === 0 ? 'Today' : `Within ${f.availableWithinDays}d`, tone: 'mint' });
  if (f.categorySlug) out.push({ label: f.categorySlug, tone: 'mint' });
  if (f.supplierName) out.push({ label: `from ${f.supplierName}` });
  if (f.brand) out.push({ label: f.brand });
  if (f.sort === 'price_asc') out.push({ label: 'sort: price asc', tone: 'copper' });
  else if (f.sort === 'lead_asc') out.push({ label: 'sort: fastest', tone: 'rose' });
  return out;
}

export function parseForChips(prompt: string) {
  const { filters, query } = parseNlFilters(prompt);
  return { filters, query };
}
```

- [ ] **Step 4: Render chips in SearchPage**

Read `q=` from URL, call `parseForChips`, render chips as a horizontal row above results. Click on `X` strips the filter from URL.

- [ ] **Step 5: Run tests + commit**

Run: `pnpm --filter @vyro/web test`
```bash
git add apps/web/src/pages/SearchPage.tsx apps/web/src/ask/nlFilters.client.ts apps/web/test/searchNl.test.ts
git commit -m "feat(web): SearchPage NL chips above results"
```

---

### Task 7: Verification

- [ ] **Step 1: Typecheck**
Run: `pnpm typecheck` — clean.

- [ ] **Step 2: Full tests**
Run: `pnpm test` — green.

- [ ] **Step 3: Build**
Run: `pnpm build` — green.

- [ ] **Step 4: Smoke**
- `POST /api/ai/feedback { requestId, helpful:false, reason:'wrong_product' }` writes `ai.feedback` audit row.
- `POST /api/ai/ask { prompt:'cheap rice under Rs. 20,000 tomorrow' }` returns search_products hit list with `priceMaxCents=2_000_000` + `sort=price_asc` + `availableWithinDays=1` enforced server-side.
- `resolveProduct('basmati rice')` returns `clarify` for `[sugar, flour]` (low Jaccard) and `single` for `[Samba Rice 25kg]` (high Jaccard).
- CartPage renders per-line "Switch to …, save Rs. X" chips inside supplier groups when alternatives exist.
- SearchPage chips reflect parsed filters; X removes the chip and refreshes URL.
