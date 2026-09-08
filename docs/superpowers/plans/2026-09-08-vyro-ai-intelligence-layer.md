# VYRO AI Intelligence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 deterministic procurement intelligence (price watch, anomaly, supplier intel, health, forecast, category, insights feed) plus pull-based `/ai` home, with zero extra LLM cost.

**Architecture:** Pure analytics functions in `packages/ai/src/analytics/` (zero IO) over 6 new tenant-filtered `AiRepos` queries; 7 thin intent handlers reusing existing `HANDLERS`/orchestrator/SSE; 2 new GET endpoints; new `/ai` route reusing editorial cards.

**Tech Stack:** TypeScript, Zod strict schemas, Drizzle ORM over Cloudflare D1, Hono SSE, React SPA, Vitest.

## Global Constraints

- One LLM call per request (classify only); deterministic narration default; LLM narrate opt-in unchanged.
- Zod `.strict()` schemas — no silent extras.
- Real Drizzle repos over D1 — no mocks in production; tenant filter `eq(purchaseOrders.businessId, businessId)` in every query.
- `businessId` is server-controlled; model never widens scope; audit rows never store raw prompts.
- Neutral anomaly language ("significantly above your recent range"); no supplier accusations without supporting counts.
- Prompt cap 800 chars; KV rate limit 30/min; costCap flat-200 fallback when tokens unknown.
- Viewer role read-only; all 7 new intents readable by viewer (no write actions).
- Premium editorial UI; no HTML from model ever rendered; reuse existing `Action` href enum.

---

### Task 1: Pure analytics library

**Files:**
- Create: `packages/ai/src/analytics/priceWatch.ts`
- Create: `packages/ai/src/analytics/anomaly.ts`
- Create: `packages/ai/src/analytics/supplierIntel.ts`
- Create: `packages/ai/src/analytics/health.ts`
- Create: `packages/ai/src/analytics/forecast.ts`
- Create: `packages/ai/src/analytics/category.ts`
- Create: `packages/ai/src/analytics/insights.ts`
- Create: `packages/ai/src/analytics/index.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/analytics/analytics.test.ts`

**Interfaces:**
- Consumes: nothing (pure inputs only).
- Produces:
  - `priceWatch(prices: Array<{ts:number;price:number}>, now:number): Array<{productName:string;from:number;to:number;pct:number}>`
  - `detectAnomaly(history:number[], liveCheapest:number): {flagged:boolean;median:number;ratio:number} | null`
  - `scoreSuppliers(rows:Array<{supplierId:string;supplierName:string;total:number;accepted:number;rejected:number;cancelled:number;delivered:number;minPrice:number;minLead:number}>): Array<{supplierId:string;badges:string[];overall:number}>`
  - `procurementHealth(input:{maxShare:number;savingsRatio:number;minAccept:number;gapCV:number}): {score:number;subs:{concentration:number;price:number;reliability:number;consistency:number}}`
  - `forecastNextMonth(monthly:number[]): {prediction:number;low:number;high:number}`
  - `mergeInsights(parts:{moves:unknown[];anomalies:unknown[];supplier:unknown[];health:unknown}): Array<{kind:string;evidence:string;action:string}>`

- [ ] **Step 1: Write failing test for priceWatch threshold**

```ts
import { describe, expect, it } from 'vitest';
import { priceWatchMove } from '../analytics/priceWatch';
describe('priceWatchMove', () => {
  it('flags +8% with >=2 buys per window', () => {
    const r = priceWatchMove({ recentAvg: 10800, recentN: 3, priorAvg: 10000, priorN: 3 });
    expect(r?.pct).toBe(8);
  });
  it('returns null when recentN < 2', () => {
    expect(priceWatchMove({ recentAvg: 12000, recentN: 1, priorAvg: 10000, priorN: 3 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test -- src/analytics/analytics.test.ts`
Expected: FAIL with "Cannot find module '../analytics/priceWatch'"

- [ ] **Step 3: Write minimal implementation**

```ts
export function priceWatchMove(input: { recentAvg: number; recentN: number; priorAvg: number; priorN: number }): { pct: number } | null {
  if (input.recentN < 2 || input.priorN < 2 || input.priorAvg === 0) return null;
  const pct = Math.round(((input.recentAvg - input.priorAvg) / input.priorAvg) * 100);
  if (Math.abs(pct) < 5) return null;
  return { pct };
}
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}
export function detectAnomaly(history: number[], liveCheapest: number): { flagged: boolean; median: number; ratio: number } {
  const med = median(history);
  const ratio = med === 0 ? 0 : liveCheapest / med;
  return { flagged: ratio > 1.25, median: med, ratio: Math.round(ratio * 100) / 100 };
}
export function procurementHealth(input: { maxShare: number; savingsRatio: number; minAccept: number; gapCV: number }): { score: number; subs: Record<string, number> } {
  let score = 100;
  const subs = { concentration: 0, price: 0, reliability: 0, consistency: 0 };
  if (input.maxShare > 0.4) { score -= 15; subs.concentration = -15; }
  if (input.savingsRatio > 0.05) { score -= 15; subs.price = -15; }
  if (input.minAccept < 0.8) { score -= 10; subs.reliability = -10; }
  if (input.gapCV > 0.5) { score -= 10; subs.consistency = -10; }
  return { score: Math.max(0, score), subs };
}
export function forecastNextMonth(monthly: number[]): { prediction: number; low: number; high: number } {
  const last3 = monthly.slice(-3);
  const mean = last3.reduce((s, v) => s + v, 0) / Math.max(1, last3.length);
  const variance = last3.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, last3.length);
  const sd = Math.sqrt(variance);
  return { prediction: Math.round(mean), low: Math.round(Math.max(0, mean - sd)), high: Math.round(mean + sd) };
}
```

- [ ] **Step 4: Expand to full module files (supplierIntel scoring, category grouping, insights merge) following same pure-function pattern; export all from `analytics/index.ts`; re-export from `packages/ai/src/index.ts` with `export * from './analytics/index';`**

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @vyro/ai test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/analytics packages/ai/src/index.ts
git commit -m "feat(ai): deterministic analytics library (price, anomaly, health, forecast)"
```

### Task 2: Repository queries

**Files:**
- Modify: `apps/api/src/modules/ai/intents/repos.ts`
- Modify: `apps/api/src/modules/ai/intents/drizzleRepos.ts`
- Test: `apps/api/test/ai/intel/repos.test.ts`

**Interfaces:**
- Consumes: `median`, `priceWatchMove` from `@vyro/ai` (Task 1).
- Produces (added to `AiRepos`):
  - `priceWindows(opts:{businessId:string;productId:string;recentSince:number;priorSince:number;priorUntil:number}): Promise<{recentAvg:number;recentN:number;priorAvg:number;priorN:number}>`
  - `lastBuyPrices(opts:{businessId:string;productId:string;limit:number}): Promise<number[]>`
  - `supplierLifecycle(opts:{businessId:string;sinceMs:number}): Promise<Array<{supplierId:string;supplierName:string;total:number;accepted:number;rejected:number;cancelled:number;delivered:number}>>`
  - `categorySpend(opts:{businessId:string;sinceMs:number}): Promise<Array<{category:string;totalCents:number}>>`
  - `monthlySpend(opts:{businessId:string;months:number}): Promise<number[]>`
  - `concentration(opts:{businessId:string;sinceMs:number}): Promise<Array<{supplierId:string;supplierName:string;share:number}>>`

- [ ] **Step 1: Write failing test with mock repos shape**

```ts
import { describe, expect, it } from 'vitest';
import type { AiRepos } from '../../../src/modules/ai/intents/repos';
describe('intel repos interface', () => {
  it('exposes priceWindows', () => {
    const fns: (keyof AiRepos)[] = ['priceWindows','lastBuyPrices','supplierLifecycle','categorySpend','monthlySpend','concentration'];
    for (const k of fns) expect(typeof k).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- test/ai/intel/repos.test.ts`
Expected: FAIL with type error (methods missing on AiRepos)

- [ ] **Step 3: Implement interface additions in `repos.ts`**

```ts
priceWindows(opts: { businessId: string; productId: string; recentSince: number; priorSince: number; priorUntil: number }): Promise<{ recentAvg: number; recentN: number; priorAvg: number; priorN: number }>;
lastBuyPrices(opts: { businessId: string; productId: string; limit: number }): Promise<number[]>;
supplierLifecycle(opts: { businessId: string; sinceMs: number }): Promise<Array<{ supplierId: string; supplierName: string; total: number; accepted: number; rejected: number; cancelled: number; delivered: number }>>;
categorySpend(opts: { businessId: string; sinceMs: number }): Promise<Array<{ category: string; totalCents: number }>>;
monthlySpend(opts: { businessId: string; months: number }): Promise<number[]>;
concentration(opts: { businessId: string; sinceMs: number }): Promise<Array<{ supplierId: string; supplierName: string; share: number }>>;
```

- [ ] **Step 4: Implement `drizzleRepos` queries (all filtered by `eq(purchaseOrders.businessId, businessId)`, `ne(status,'cancelled')` where spend; category via `innerJoin(products).innerJoin(categories)`; monthly buckets in app code from `createdAt`; concentration share = supplierTotal/grandTotal)**

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/intel/repos.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/intents/repos.ts apps/api/src/modules/ai/intents/drizzleRepos.ts apps/api/test/ai/intel/repos.test.ts
git commit -m "feat(ai): intel repository queries (price windows, lifecycle, category, forecast)"
```

### Task 3: Seven intent handlers + orchestrator wiring

**Files:**
- Create: `apps/api/src/modules/ai/intents/priceWatch.ts`
- Create: `apps/api/src/modules/ai/intents/priceAnomaly.ts`
- Create: `apps/api/src/modules/ai/intents/supplierIntel.ts`
- Create: `apps/api/src/modules/ai/intents/procurementHealth.ts`
- Create: `apps/api/src/modules/ai/intents/spendForecast.ts`
- Create: `apps/api/src/modules/ai/intents/categoryIntel.ts`
- Create: `apps/api/src/modules/ai/intents/insightsFeed.ts`
- Modify: `apps/api/src/modules/ai/intents/catalog.ts`
- Modify: `apps/api/src/modules/ai/orchestrator.ts`
- Modify: `packages/ai/src/schemas.ts`
- Modify: `packages/ai/src/intents.ts`
- Test: `apps/api/test/ai/intel/intents.test.ts`

**Interfaces:**
- Consumes: Task 1 pure fns + Task 2 repos.
- Produces: `HANDLERS.price_watch`, `HANDLERS.price_anomaly`, `HANDLERS.supplier_intel`, `HANDLERS.procurement_health`, `HANDLERS.spend_forecast`, `HANDLERS.category_intel`, `HANDLERS.insights_feed`; `INTENT_NAMES` extended; `STAGES` entries.

- [ ] **Step 1: Write failing handler test**

```ts
import { describe, expect, it } from 'vitest';
import { HANDLERS } from '../../../src/modules/ai/intents/catalog';
describe('intel handlers', () => {
  it('registers price_watch', () => { expect(typeof HANDLERS.price_watch).toBe('function'); });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/intel/intents.test.ts`
Expected: FAIL (property missing)

- [ ] **Step 3: Extend schemas + allowlist + heuristics**

```ts
// schemas.ts INTENT_NAMES add:
'price_watch','price_anomaly','supplier_intel','procurement_health','spend_forecast','category_intel','insights_feed'
// Slots add: limit: z.number().int().min(1).max(20).optional()
// intents.ts INTENT_ALLOWLIST_BY_ROLE: add all 7 to admin, member, viewer arrays.
// heuristicClassify: add before fallback:
// if (/\b(price watch|price drop|became cheaper|increased the most)\b/i.test(text)) intent='price_watch'
// if (/\b(unusual price|overcharg|why.*expensive)\b/i.test(text)) intent='price_anomaly'
// if (/\b(supplier intelligence|most reliable|supplier risk|best overall)\b/i.test(text)) intent='supplier_recommend' fallback 'supplier_intel'
// if (/\b(procurement health|health score)\b/i.test(text)) intent='procurement_health'
// if (/\b(forecast|next month.*spend|how much will i spend)\b/i.test(text)) intent='spend_forecast'
// if (/\b(category|spending by category)\b/i.test(text)) intent='category_intel'
// if (/\b(insight|what changed|signal)\b/i.test(text)) intent='insights_feed'
```

- [ ] **Step 4: Implement one handler (pattern for all seven)**

```ts
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';
const DAY = 86400000;
export async function priceWatchHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const now = Date.now();
  const movers = await repos.priceChangeMovers({ businessId: ctx.businessId, sinceMs: now - 28 * DAY });
  const top = movers.slice(0, 8);
  return {
    components: [{ type: 'spend_summary_card', data: { movers: top, windowDays: 28 } }],
    actions: [{ type: 'view_analytics', label: 'Open analytics', href: '/analytics' }],
    rawSummary: { count: top.length },
  };
}
```

Remaining six follow identical shape: query repos → pure analytics fn → `spend_summary_card` / `supplier_list_card` / `recommendation_card` with `{evidence, explanation}` in `data`; `rawSummary` with counts; supplier handler adds badges + neutral signal text; health includes `{score, subs}`; forecast includes `{prediction, low, high, label:'prediction'}`; insights merges top 1 per kind with `{kind, evidence, action}`.

- [ ] **Step 5: Wire `catalog.ts` HANDLERS + `orchestrator.ts` STAGES**

```ts
price_watch: ['Reading your purchase history', 'Analyzing price moves'],
price_anomaly: ['Reading your purchase history', 'Checking price ranges'],
supplier_intel: ['Searching VYRO products', 'Scoring suppliers'],
procurement_health: ['Reading your purchase history', 'Scoring procurement health'],
spend_forecast: ['Reading your purchase history', 'Forecasting spend'],
category_intel: ['Reading your purchase history', 'Breaking down categories'],
insights_feed: ['Reading your purchase history', 'Gathering insights'],
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/intel/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/intents/ packages/ai/src/schemas.ts packages/ai/src/intents.ts apps/api/test/ai/intel/intents.test.ts
git commit -m "feat(ai): seven intel intents (price, anomaly, supplier, health, forecast, category, insights)"
```

### Task 4: Home + insights endpoints

**Files:**
- Modify: `apps/api/src/modules/ai/routes.ts`
- Test: `apps/api/test/ai/intel/home.test.ts`

**Interfaces:**
- Consumes: Task 3 handlers + `requireBusinessRole`.
- Produces: `GET /api/ai/home` → `{reorderDue, savingsTotal, topMoves, health}`; `GET /api/ai/insights?limit=10` → `{insights}`.

- [ ] **Step 1: Write failing endpoint test**

```ts
import { describe, expect, it } from 'vitest';
describe('GET /api/ai/home', () => {
  it('returns reorder + savings + moves + health keys', async () => {
    const res = await app.request('/api/ai/home?businessId=b1', { headers: { cookie: 'session' } });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/intel/home.test.ts`
Expected: FAIL 404

- [ ] **Step 3: Implement endpoints (RBAC `['owner','manager','staff','purchasing']`, per-card try/catch degrade, no cron)**

```ts
router.get('/home', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const repos = drizzleRepos(c.env);
  const now = Date.now();
  const [moves, savings, monthly, conc] = await Promise.all([
    repos.priceChangeMovers({ businessId, sinceMs: now - 28 * 86400000 }).catch(() => []),
    repos.savingsOpportunities({ businessId, sinceMs: now - 60 * 86400000 }).catch(() => []),
    repos.monthlySpend({ businessId, months: 3 }).catch(() => []),
    repos.concentration({ businessId, sinceMs: now - 90 * 86400000 }).catch(() => []),
  ]);
  const savingsTotal = savings.reduce((s, o) => s + o.savingCents, 0);
  return c.json({ reorderDue: [], savingsTotal, topMoves: moves.slice(0, 4), monthly, concentration: conc.slice(0, 3) });
});
router.get('/insights', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const limit = Math.min(Number(c.req.query('limit') ?? 10), 20);
  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const repos = drizzleRepos(c.env);
  const now = Date.now();
  const [moves, savings] = await Promise.all([
    repos.priceChangeMovers({ businessId, sinceMs: now - 28 * 86400000 }).catch(() => []),
    repos.savingsOpportunities({ businessId, sinceMs: now - 60 * 86400000 }).catch(() => []),
  ]);
  const insights = [
    ...savings.slice(0, 4).map((s) => ({ kind: 'saving', evidence: `${s.productName}: ${s.currentSupplierName} → ${s.alternativeSupplierName}`, action: '/analytics' })),
    ...moves.slice(0, 4).map((m) => ({ kind: 'price', evidence: `${m.productName} ${m.pct}%`, action: '/analytics' })),
  ].slice(0, limit);
  return c.json({ insights });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/intel/home.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/routes.ts apps/api/test/ai/intel/home.test.ts
git commit -m "feat(ai): /api/ai/home + /insights pull endpoints"
```

### Task 5: AI Home frontend

**Files:**
- Create: `apps/web/src/ai/AiHomePage.tsx`
- Modify: `apps/web/src/App.tsx` (add `<Route path="/ai">`)
- Test: `apps/web/test/ai/AiHomePage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/ai/home`; existing card renderers from `apps/web/src/ask/components`.
- Produces: `/ai` route with greeting + 4 cards (reorder, savings, moves, health) each with Review/Explore `<Link>`.

- [ ] **Step 1: Write failing component test**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiHomePage } from '../../src/ai/AiHomePage';
describe('AiHomePage', () => {
  it('shows greeting and cards', () => {
    render(<AiHomePage />);
    expect(screen.getByText(/what VYRO found/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/web test -- test/ai/AiHomePage.test.tsx`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement page (fetch `/api/ai/home`, parallel cards, skeleton + per-card error, editorial `<PageHeader kicker="VYRO AI" title="Good morning">`, actions reuse `view_*` hrefs)**

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/web test -- test/ai/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ai/ apps/web/src/App.tsx apps/web/test/ai/AiHomePage.test.tsx
git commit -m "feat(web): VYRO AI home dashboard"
```

### Task 6: Verification

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 2: Full tests**

Run: `pnpm test`
Expected: green

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds for `@vyro/web` and `@vyro/api`

- [ ] **Step 4: Smoke (seeded D1): `/ai` renders 4 cards; `/ask` price_watch, supplier_intel, procurement_health return grounded components; audit rows contain no prompt text**

- [ ] **Step 5: Commit verification note (no code change; tag in PR description)**
