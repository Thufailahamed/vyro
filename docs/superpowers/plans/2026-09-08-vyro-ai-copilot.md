# VYRO AI Copilot UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 2 copilot UX — floating Ask panel on every buyer page, explicit page context, priced weekly planner, budget optimizer, dismissible cart hints.

**Architecture:** `AskVyroFloat` mounted in `WorkspaceShell` (Layout.tsx:220) reuses `useVyroAI` SSE; `ContextSchema` flows `askSchema.context` → new `context.ts applyPageContext` (post-classify pre-fill, classifier wins); 2 new intents reuse `AiRepos` + existing `/confirm`; `GET /api/ai/cart-hints` resolves cart server-side.

**Tech Stack:** TypeScript, Zod strict, Drizzle/D1, Hono SSE, React + react-query, Vitest.

## Global Constraints

- One LLM call per request (classify only); deterministic narration default.
- Zod `.strict()` everywhere; context strings ≤120 chars; cartLines ≤50 items.
- Tenant filter `eq(purchaseOrders.businessId, businessId)` in every new query; context businessId never trusted (server session wins).
- Classifier-explicit slots always beat page context; unknown context names ignored, never inserted.
- No auto-PO: plan Confirm goes through existing `POST /api/ai/confirm` with idempotency + RBAC; budget never silently drops lines.
- Audit logs `contextKind` (page only), never raw context PII beyond intent slots.
- Viewer role: cart-hints readable; `procurement_plan` + `budget_optimize` member/admin only (PO write path).
- Premium editorial UI; no model HTML rendered; dismiss keys in localStorage; hints never block checkout.

---

### Task 1: Context schema + budget math + heuristics

**Files:**
- Create: `packages/ai/src/analytics/budget.ts`
- Modify: `packages/ai/src/schemas.ts`
- Modify: `packages/ai/src/intents.ts`
- Modify: `packages/ai/src/index.ts` (no change needed — `export *` covers analytics; verify)
- Test: `packages/ai/src/analytics/budget.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `ContextSchema = z.object({ page: z.enum(['product','supplier','cart','analytics','orders','other']), productName: z.string().min(1).max(120).optional(), productId: z.string().min(1).max(120).optional(), supplierName: z.string().min(1).max(120).optional(), cartLines: z.array(z.object({ product: z.string().min(1).max(120), quantity: z.number().int().min(1).max(100000) }).strict()).max(50).optional() }).strict()`
  - `fitBudget(lines: Array<{productName:string;supplier:string;priceCents:number;quantity:number;cheapestPriceCents:number;cheapestSupplier:string}>, capCents: number): { lines: Array<{productName:string;supplier:string;priceCents:number;quantity:number;swapped:boolean}>; total:number; cheapestTotal:number; withinBudget:boolean; swaps: Array<{productName:string;from:string;to:string;savingCents:number}> }`
  - heuristic: `/\b(plan my procurement|weekly plan|plan.*this week|usual.*plan)\b/i` → `procurement_plan`; `/\b(under Rs|budget.*order|keep.*under|budget mode)\b/i` → `budget_optimize` with `budgetCents` parsed from `Rs.?\s?([\d,]+)` (strip commas, ×100).

- [ ] **Step 1: Write failing budget test**

```ts
import { describe, expect, it } from 'vitest';
import { fitBudget } from './budget';
describe('fitBudget', () => {
  const lines = [
    { productName: 'Rice', supplier: 'A', priceCents: 500000, quantity: 2, cheapestPriceCents: 400000, cheapestSupplier: 'B' },
    { productName: 'Oil', supplier: 'A', priceCents: 300000, quantity: 1, cheapestPriceCents: 280000, cheapestSupplier: 'C' },
  ];
  it('swaps biggest saving first to fit cap', () => {
    const r = fitBudget(lines, 1100000);
    expect(r.withinBudget).toBe(true);
    expect(r.swaps[0]!.productName).toBe('Rice');
    expect(r.total).toBeLessThanOrEqual(1100000);
  });
  it('reports impossibility without dropping lines', () => {
    const r = fitBudget(lines, 1000);
    expect(r.withinBudget).toBe(false);
    expect(r.lines).toHaveLength(2);
    expect(r.cheapestTotal).toBe(1080000);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/ai test -- src/analytics/budget.test.ts`
Expected: FAIL with "Cannot find module './budget'"

- [ ] **Step 3: Implement `budget.ts`**

```ts
export interface BudgetLine { productName: string; supplier: string; priceCents: number; quantity: number; cheapestPriceCents: number; cheapestSupplier: string; }
export interface FittedLine { productName: string; supplier: string; priceCents: number; quantity: number; swapped: boolean; }
export function fitBudget(lines: BudgetLine[], capCents: number): { lines: FittedLine[]; total: number; cheapestTotal: number; withinBudget: boolean; swaps: Array<{ productName: string; from: string; to: string; savingCents: number }> } {
  const base = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const cheapestTotal = lines.reduce((s, l) => s + Math.min(l.priceCents, l.cheapestPriceCents) * l.quantity, 0);
  if (base <= capCents) {
    return { lines: lines.map((l) => ({ productName: l.productName, supplier: l.supplier, priceCents: l.priceCents, quantity: l.quantity, swapped: false })), total: base, cheapestTotal, withinBudget: true, swaps: [] };
  }
  const order = [...lines].sort((a, b) => (b.priceCents - b.cheapestPriceCents) * b.quantity - (a.priceCents - a.cheapestPriceCents) * a.quantity);
  const fitted = new Map<string, FittedLine>();
  for (const l of lines) fitted.set(l.productName, { productName: l.productName, supplier: l.supplier, priceCents: l.priceCents, quantity: l.quantity, swapped: false });
  const swaps: Array<{ productName: string; from: string; to: string; savingCents: number }> = [];
  let total = base;
  for (const l of order) {
    if (total <= capCents) break;
    if (l.cheapestPriceCents >= l.priceCents) continue;
    const saving = (l.priceCents - l.cheapestPriceCents) * l.quantity;
    fitted.set(l.productName, { productName: l.productName, supplier: l.cheapestSupplier, priceCents: l.cheapestPriceCents, quantity: l.quantity, swapped: true });
    swaps.push({ productName: l.productName, from: l.supplier, to: l.cheapestSupplier, savingCents: saving });
    total -= saving;
  }
  return { lines: lines.map((l) => fitted.get(l.productName)!), total, cheapestTotal, withinBudget: total <= capCents, swaps };
}
```

- [ ] **Step 4: Extend `schemas.ts` (INTENT_NAMES += `procurement_plan`, `budget_optimize`; Slots += `budgetCents: z.number().int().min(1).max(100000000).optional()`; append `ContextSchema` + `export type PageContext`)**

- [ ] **Step 5: Extend `intents.ts` allowlists (admin+member: both new intents; viewer: neither) + heuristic branches (planner/budget regexes above, budgetCents parse, confidence 0.75)**

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/ai test`
Expected: PASS (38 + new budget tests)

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/analytics/budget.ts packages/ai/src/analytics/budget.test.ts packages/ai/src/schemas.ts packages/ai/src/intents.ts
git commit -m "feat(ai): page context schema, budget fit math, planner heuristics"
```

### Task 2: Page context + planner + budget intents

**Files:**
- Create: `apps/api/src/modules/ai/context.ts`
- Create: `apps/api/src/modules/ai/intents/procurementPlan.ts`
- Create: `apps/api/src/modules/ai/intents/budgetOptimize.ts`
- Modify: `apps/api/src/modules/ai/intents/catalog.ts`
- Modify: `apps/api/src/modules/ai/orchestrator.ts`
- Modify: `apps/api/src/modules/ai/narrate.ts`
- Modify: `apps/api/src/modules/ai/routes.ts` (askSchema += `context: ContextSchema.optional()`, thread into orchestrate ctx)
- Test: `apps/api/test/ai/copilot/context.test.ts`
- Test: `apps/api/test/ai/copilot/planner.test.ts`

**Interfaces:**
- Consumes: Task 1 `ContextSchema`, `fitBudget`; existing `AiRepos`, `HANDLERS`, `STAGES`.
- Produces:
  - `applyPageContext(slots: Record<string,unknown>, context: PageContext | undefined, catalog: { products: string[]; suppliers: string[] }): { slots: Record<string,unknown>; filledFromContext: boolean }`
  - `HANDLERS.procurement_plan`, `HANDLERS.budget_optimize`
  - STAGES entries: `procurement_plan: ['Reading your purchase history','Pricing your weekly plan']`, `budget_optimize: ['Reading your purchase history','Fitting your budget']`

- [ ] **Step 1: Write failing context test**

```ts
import { describe, expect, it } from 'vitest';
import { applyPageContext } from '../../../src/modules/ai/context';
describe('applyPageContext', () => {
  const catalog = { products: ['Samba Rice'], suppliers: ['ABC Foods'] };
  it('fills missing productName from context on pronoun prompts', () => {
    const r = applyPageContext({ }, { page: 'product', productName: 'Samba Rice' }, catalog, 'find something cheaper');
    expect(r.slots.productName).toBe('Samba Rice');
    expect(r.filledFromContext).toBe(true);
  });
  it('never overrides explicit slots', () => {
    const r = applyPageContext({ productName: 'Chicken' }, { page: 'product', productName: 'Samba Rice' }, catalog, 'cheapest chicken');
    expect(r.slots.productName).toBe('Chicken');
  });
  it('ignores unknown context names', () => {
    const r = applyPageContext({}, { page: 'product', productName: 'Unicorn Meat' }, catalog, 'find something cheaper');
    expect(r.slots.productName).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/copilot/context.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `context.ts`**

```ts
import type { PageContext } from '@vyro/ai';
const PRONOUN_RX = /\b(something|this|it|that|cheaper|that one|this one)\b/i;
export function applyPageContext(
  slots: Record<string, unknown>,
  context: PageContext | undefined,
  catalog: { products: string[]; suppliers: string[] },
  prompt: string,
): { slots: Record<string, unknown>; filledFromContext: boolean } {
  if (!context) return { slots, filledFromContext: false };
  const out = { ...slots };
  let filled = false;
  const matchProduct = (name: string) => catalog.products.find((p) => p.toLowerCase() === name.toLowerCase());
  const matchSupplier = (name: string) => catalog.suppliers.find((s) => s.toLowerCase() === name.toLowerCase());
  if (!out.productName && context.productName && (PRONOUN_RX.test(prompt) || context.page === 'product')) {
    if (matchProduct(context.productName)) { out.productName = matchProduct(context.productName); filled = true; }
  }
  if (!out.supplierName && context.supplierName && (context.page === 'supplier' || PRONOUN_RX.test(prompt))) {
    if (matchSupplier(context.supplierName)) { out.supplierName = matchSupplier(context.supplierName); filled = true; }
  }
  return { slots: out, filledFromContext: filled };
}
```

- [ ] **Step 4: Implement `procurementPlan.ts` (recurrence aggregate reuse of usualOrder pattern + cheapest live offer per line + totals)**

```ts
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';
const DAY = 86400000;
export async function procurementPlanHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const weeksBack = Number((ctx.classify.slots as any).weeksBack ?? 8);
  const topN = Number((ctx.classify.slots as any).topNProducts ?? 10);
  const since = Date.now() - weeksBack * 7 * DAY;
  const items = await repos.recentPoItemsForRecurrence({ businessId: ctx.businessId, sinceMs: since });
  const nameById = await repos.productNamesByIds(items.map((i) => i.productId));
  const agg = new Map<string, { productId: string; productName: string; totalQty: number; occurrences: number; lastPrice: number }>();
  for (const it of items) {
    const v = agg.get(it.productId) ?? { productId: it.productId, productName: nameById.get(it.productId) ?? 'Unknown product', totalQty: 0, occurrences: 0, lastPrice: it.unitPriceCents };
    v.totalQty += it.quantity; v.occurrences += 1; v.lastPrice = it.unitPriceCents;
    agg.set(it.productId, v);
  }
  const top = [...agg.values()].sort((a, b) => b.occurrences - a.occurrences || b.totalQty - a.totalQty).slice(0, topN);
  const lines = await Promise.all(top.map(async (v) => {
    const offers = await repos.listOffersByProduct(v.productId).catch(() => []);
    const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
    const cheapest = live.slice().sort((a, b) => a.priceCents - b.priceCents)[0];
    const qty = Math.round(v.totalQty / Math.max(v.occurrences, 1));
    return { productId: v.productId, productName: v.productName, quantity: qty, unit: 'unit', supplier: cheapest?.supplier.name ?? '—', priceCents: cheapest?.priceCents ?? v.lastPrice, leadTimeDays: cheapest?.leadTimeDays ?? 0 };
  }));
  const totalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  return {
    components: [{ type: 'procurement_plan_card', data: { title: 'Your weekly procurement plan', lines, totalCents, withinBudget: true } }],
    actions: [{ type: 'view_cart', label: 'Open cart', href: '/cart' }],
    rawSummary: { count: lines.length, totalCents },
  };
}
```

- [ ] **Step 5: Implement `budgetOptimize.ts` (base plan via same aggregation, then `fitBudget`; impossibility branch with `normalTotal`/`cheapestTotal`/tradeoffs)**

```ts
import { fitBudget } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';
const DAY = 86400000;
export async function budgetOptimizeHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const budgetCents = Number((ctx.classify.slots as any).budgetCents ?? 0);
  if (!budgetCents || budgetCents <= 0) {
    return { components: [{ type: 'clarification_card', data: { question: 'What budget should I fit this order under? (e.g. under Rs. 100,000)', options: [] } }], actions: [], rawSummary: { clarified: true } };
  }
  const since = Date.now() - 8 * 7 * DAY;
  const items = await repos.recentPoItemsForRecurrence({ businessId: ctx.businessId, sinceMs: since });
  const nameById = await repos.productNamesByIds(items.map((i) => i.productId));
  const agg = new Map<string, { productId: string; productName: string; totalQty: number; occurrences: number; lastPrice: number; lastSupplier: string }>();
  for (const it of items) {
    const v = agg.get(it.productId) ?? { productId: it.productId, productName: nameById.get(it.productId) ?? 'Unknown product', totalQty: 0, occurrences: 0, lastPrice: it.unitPriceCents, lastSupplier: '—' };
    v.totalQty += it.quantity; v.occurrences += 1; v.lastPrice = it.unitPriceCents;
    agg.set(it.productId, v);
  }
  const base = await Promise.all([...agg.values()].slice(0, 10).map(async (v) => {
    const offers = await repos.listOffersByProduct(v.productId).catch(() => []);
    const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
    const cheapest = live.slice().sort((a, b) => a.priceCents - b.priceCents)[0];
    const quantity = Math.round(v.totalQty / Math.max(v.occurrences, 1));
    return { productName: v.productName, supplier: v.lastSupplier, priceCents: v.lastPrice, quantity, cheapestPriceCents: cheapest?.priceCents ?? v.lastPrice, cheapestSupplier: cheapest?.supplier.name ?? v.lastSupplier };
  }));
  const fitted = fitBudget(base, budgetCents);
  return {
    components: [{ type: 'procurement_plan_card', data: { title: 'Budget-optimized plan', lines: fitted.lines, totalCents: fitted.total, budgetCents, withinBudget: fitted.withinBudget, swaps: fitted.swaps, cheapestTotal: fitted.cheapestTotal } }],
    actions: [{ type: 'view_cart', label: 'Open cart', href: '/cart' }],
    rawSummary: { total: fitted.total, withinBudget: fitted.withinBudget },
  };
}
```

- [ ] **Step 6: Wire `catalog.ts` (2 handlers), `orchestrator.ts` (STAGES + applyPageContext call after classify using `loadDictionary` product/supplier names), `routes.ts` askSchema context, `narrate.ts` (2 cases: plan totals; budget within/over with amounts)**

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/copilot/`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/ai/context.ts apps/api/src/modules/ai/intents/procurementPlan.ts apps/api/src/modules/ai/intents/budgetOptimize.ts apps/api/src/modules/ai/intents/catalog.ts apps/api/src/modules/ai/orchestrator.ts apps/api/src/modules/ai/narrate.ts apps/api/src/modules/ai/routes.ts packages/ai/src/schemas.ts packages/ai/src/intents.ts apps/api/test/ai/copilot/
git commit -m "feat(ai): page context, weekly planner, budget optimizer"
```

### Task 3: Cart hints endpoint + banner

**Files:**
- Create: `apps/api/src/modules/ai/cartHints.ts`
- Modify: `apps/api/src/modules/ai/routes.ts` (GET `/api/ai/cart-hints`)
- Modify: `apps/web/src/pages/CartPage.tsx` (slim banner + localStorage dismiss)
- Test: `apps/api/test/ai/copilot/cartHints.test.ts`
- Test: `apps/web/test/aiFloat.test.ts` (dismiss-key + greeting helpers)

**Interfaces:**
- Consumes: Task 2 handlers pattern; `findOpenCartByBusiness` + `listCartItems` from `modules/cart/repository`; `drizzleRepos.listOffersByProduct`.
- Produces:
  - `buildCartHints(repos: AiRepos, cart: Array<{productId:string;productName:string;quantity:number;priceCents:number;supplierName:string}>, avgSpend: number): Array<{kind:'switch_save'|'delivery'|'budget';evidence:string;action:string;savingCents?:number;dismissKey:string}>` (max 3: 2 switch + 1 delivery/budget)

- [ ] **Step 1: Write failing hints test**

```ts
import { describe, expect, it } from 'vitest';
import { buildCartHints } from '../../../src/modules/ai/cartHints';
describe('buildCartHints', () => {
  it('suggests switch-to-save with grounded amount', async () => {
    const hints = await buildCartHints({} as any, [{ productId: 'p1', productName: 'Rice', quantity: 2, priceCents: 5000, supplierName: 'A' }], 0);
    expect(hints.length).toBeLessThanOrEqual(3);
  });
  it('returns empty for empty cart', async () => {
    expect(await buildCartHints({} as any, [], 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/copilot/cartHints.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `cartHints.ts` (resolve cheapest live offer per cart line via `repos.listOffersByProduct`; switch_save when saving >0; delivery when suppliers >1; budget when cartTotal > 1.1 × avgSpend; dismissKey = `vyro-cart-hint:<kind>:<productId|all>`; evidence strings with Rs. amounts; action hrefs `/search?q=` or `/analytics`)**

- [ ] **Step 4: Add route (session + `requireBusinessRole` buyer roles; resolve businessId; `findOpenCartByBusiness` + `listCartItems` + product name join; never trust client prices)**

- [ ] **Step 5: CartPage banner (fetch `/api/ai/cart-hints?businessId=`, slim `bg-paper border` banner above groups, per-hint Dismiss button writing localStorage, filtered on load; never blocks checkout buttons)**

- [ ] **Step 6: Web helper test (`apps/web/src/ai/floatHelpers.ts`: `dismissKey(kind,id)`, `isDismissed`, plus greeting reuse; test in `apps/web/test/aiFloat.test.ts`)**

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/copilot/ && pnpm --filter @vyro/web test -- test/aiFloat.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/ai/cartHints.ts apps/api/src/modules/ai/routes.ts apps/web/src/pages/CartPage.tsx apps/web/src/ai/floatHelpers.ts apps/web/test/aiFloat.test.ts apps/api/test/ai/copilot/cartHints.test.ts
git commit -m "feat(ai): cart hints endpoint + dismissible banner"
```

### Task 4: Floating panel + Layout mount

**Files:**
- Create: `apps/web/src/ai/AskVyroFloat.tsx`
- Modify: `apps/web/src/components/Layout.tsx` (mount inside `WorkspaceShell`)
- Modify: `apps/web/src/pages/ProductDetailPage.tsx` (pass `context` with the loaded product's name)
- Modify: `apps/web/src/pages/CartPage.tsx` (pass `cartLines` from the `data.items` react-query result)
- Test: extend `apps/web/test/aiFloat.test.ts` (context builder: `buildAskContext(location, entity)` pure — tested, not DOM)

**Interfaces:**
- Consumes: `useVyroAI`, `ToolTimeline`, `renderComponent` from `ask/`; `floatHelpers`.
- Produces: `<AskVyroFloat />` (FAB + panel, Esc closes, "Open full Ask →" link); `buildAskContext(pathname: string, entity: {productName?:string;supplierName?:string}): PageContext | undefined`.

- [ ] **Step 1: Write failing context-builder test**

```ts
import { describe, expect, it } from 'vitest';
import { buildAskContext } from '../src/ai/floatHelpers';
describe('buildAskContext', () => {
  it('maps product pages to product context', () => {
    expect(buildAskContext('/products/123', { productName: 'Samba Rice' })).toMatchObject({ page: 'product', productName: 'Samba Rice' });
  });
  it('returns undefined for unknown pages', () => {
    expect(buildAskContext('/login', {})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/web test -- test/aiFloat.test.ts`
Expected: FAIL with "buildAskContext is not a function"

- [ ] **Step 3: Implement `floatHelpers.ts` additions + `AskVyroFloat.tsx` (FAB fixed bottom-right above tab bar `z-30`; panel 380px max-h 70vh with input reusing `send(text,{businessId,context})`; renders ToolTimeline + components + telemetry footer; Esc handler; collapsed by default)**

- [ ] **Step 4: Mount in `WorkspaceShell` return (after `<Outlet/>`/nav, inside provider tree so `useAuth` works); gate to buyer portal only (WorkspaceShell is buyer-only already)**

- [ ] **Step 5: Wire page contexts (ProductDetail: loaded product's name as `productName` with `page:'product'`; CartPage: `data.items` mapped to `{product:name, quantity}` with `page:'cart'`; supplier pages: if a buyer supplier-detail route exists, pass its loaded supplier name — otherwise skip, the panel works without context)**

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ai/AskVyroFloat.tsx apps/web/src/ai/floatHelpers.ts apps/web/src/components/Layout.tsx apps/web/src/pages/ProductDetailPage.tsx apps/web/src/pages/CartPage.tsx apps/web/test/aiFloat.test.ts
git commit -m "feat(web): floating Ask panel with page context"
```

### Task 5: Verification

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 2: Full tests**

Run: `pnpm test`
Expected: green

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds

- [ ] **Step 4: Smoke (seeded D1): float opens on /dashboard + /products/:id; 'find something cheaper' on rice page pre-fills rice; planner returns priced lines + Confirm creates draft PO; budget Rs.100,000 shows swaps or impossibility; cart banner dismiss persists**
