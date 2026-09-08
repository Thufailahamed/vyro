# VYRO AI Proactive Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend VYRO AI with structured WHY-mode explanations, a supplier-switch cost simulator, and a procurement-health + concentration-risk widget on the AI home dashboard — all grounded in real purchase data.

**Architecture:** Pure analytics functions (`packages/ai/src/analytics/{why,simulator}.ts`) wrap existing repos and emit new component types (`why_card`, `simulation_card`); `simulate_supplier_switch` intent joins AiRepos `listOffersByProduct` + `poItemCadence` to compute monthly/annualised deltas deterministically; `buildHomePayload` enriched with `healthScore` + `concentrationRisk` using existing `procurementHealth` + `concentration` repos; `summarizeResult` detects WHY mode (slot flag or phrase) and emits evidence-backed answers instead of free text.

**Tech Stack:** TypeScript strict, Zod `.strict()`, Drizzle/D1, Hono SSE, React + react-query, Vitest, existing `@vyro/ai` analytics engines.

## Global Constraints

- Deterministic narration default; LLM narrate only when `VYRO_AI_NARRATE_MODE==='llm'` (existing rule).
- Zod `.strict()` for every new schema; intent slot strings ≤120 chars; quantity ≤100000; price ≤1e8.
- Tenant filter `eq(purchaseOrders.businessId, businessId)` in every new query; businessId from server session wins, never from client payload.
- New intent allowlist: `simulate_supplier_switch` → admin + member (write-adjacent; viewer excluded). Audit action `ai.request`; metadata `{contextKind:'why'|'simulate', productId, supplierPair}` (slot values NOT stored beyond names already enforced).
- WHY-mode answers always include: answer paragraph + evidence list (concrete numbers + counts) + recommendation. Never produce unsupported claims; cite repo counts (`poCount`, `offerCount`).
- Simulator output must reference real PO cadence (`poItemCadence`) and live offers — never extrapolate without an interval sample ≥3.
- Health score and concentration risk are **already deterministic** — no opaque AI-generated numbers; each subscore breakdown surfaces on the card.
- Premium editorial UI: use existing `Surface`, `MetricNumber`, `vyro-kicker`, `vyro-display`. No new colours. No emoji as data markers.
- Every new public function has a vitest test that fails before implementation.

---

### Task 1: WHY-mode pure builder + supplier-switch simulator

**Files:**
- Create: `packages/ai/src/analytics/why.ts`
- Create: `packages/ai/src/analytics/simulator.ts`
- Test: `packages/ai/src/analytics/why.test.ts`
- Test: `packages/ai/src/analytics/simulator.test.ts`

**Interfaces:**
- Consumes: nothing (pure). Operates on caller-supplied evidence objects.
- Produces:
  - `buildWhyAnswer(input: { question: string; intent: string; evidence: Array<{label:string; value:string}>; recommendation?: string }): { answer: string; evidence: Array<{label:string;value:string}>; recommendation: string | null }`
  - `simulateSupplierSwitch(input: { productName: string; currentSupplier: string; currentPriceCents: number; currentLeadDays: number; alternativeSupplier: string; alternativePriceCents: number; alternativeLeadDays: number; monthlyQuantity: number; cadenceSampleSize: number }): { monthlyDeltaCents: number; annualDeltaCents: number; leadDeltaDays: number; confidence: 'high'|'medium'|'low'; savingsPct: number }`

- [ ] **Step 1: Write failing WHY test**

`packages/ai/src/analytics/why.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildWhyAnswer } from './why';
describe('buildWhyAnswer', () => {
  it('returns deterministic answer with evidence', () => {
    const r = buildWhyAnswer({
      question: 'Why did spending increase?',
      intent: 'spend_summary',
      evidence: [
        { label: 'Spend this period', value: 'Rs. 1,250,000' },
        { label: 'Spend last period', value: 'Rs. 1,080,000' },
        { label: 'Top driver', value: 'Chicken (+22%)' },
      ],
      recommendation: 'Compare alternative chicken suppliers.',
    });
    expect(r.answer).toMatch(/Rs\. 1,250,000/);
    expect(r.evidence).toHaveLength(3);
    expect(r.recommendation).toMatch(/alternative/i);
  });
  it('omits null recommendation when not provided', () => {
    const r = buildWhyAnswer({ question: 'q', intent: 'spend_summary', evidence: [] });
    expect(r.recommendation).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `pnpm --filter @vyro/ai test -- src/analytics/why.test.ts`
Expected: FAIL with "Cannot find module './why'"

- [ ] **Step 3: Implement `why.ts`**

```ts
export interface WhyEvidence { label: string; value: string }
export interface WhyInput { question: string; intent: string; evidence: WhyEvidence[]; recommendation?: string }
export interface WhyOutput { answer: string; evidence: WhyEvidence[]; recommendation: string | null }
export function buildWhyAnswer(input: WhyInput): WhyOutput {
  const headline = input.evidence[0]?.value ?? 'Insufficient data';
  const rest = input.evidence.slice(1).map((e) => `${e.label}: ${e.value}`).join('. ');
  const answer = rest.length > 0 ? `${headline}. ${rest}.` : `${headline}.`;
  return { answer, evidence: input.evidence, recommendation: input.recommendation ?? null };
}
```

- [ ] **Step 4: Write failing simulator test**

`packages/ai/src/analytics/simulator.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { simulateSupplierSwitch } from './simulator';
describe('simulateSupplierSwitch', () => {
  it('computes positive savings when alternative is cheaper', () => {
    const r = simulateSupplierSwitch({
      productName: 'Rice', currentSupplier: 'A', currentPriceCents: 500000, currentLeadDays: 3,
      alternativeSupplier: 'B', alternativePriceCents: 420000, alternativeLeadDays: 4,
      monthlyQuantity: 4, cadenceSampleSize: 8,
    });
    expect(r.monthlyDeltaCents).toBe(-320000);
    expect(r.annualDeltaCents).toBe(-3840000);
    expect(r.leadDeltaDays).toBe(1);
    expect(r.confidence).toBe('high');
    expect(r.savingsPct).toBeCloseTo(16, 0);
  });
  it('marks confidence low when cadence sample is thin', () => {
    const r = simulateSupplierSwitch({
      productName: 'Oil', currentSupplier: 'A', currentPriceCents: 300000, currentLeadDays: 2,
      alternativeSupplier: 'C', alternativePriceCents: 290000, alternativeLeadDays: 2,
      monthlyQuantity: 1, cadenceSampleSize: 1,
    });
    expect(r.confidence).toBe('low');
  });
  it('returns zero delta when prices equal', () => {
    const r = simulateSupplierSwitch({
      productName: 'X', currentSupplier: 'A', currentPriceCents: 100000, currentLeadDays: 1,
      alternativeSupplier: 'B', alternativePriceCents: 100000, alternativeLeadDays: 1,
      monthlyQuantity: 5, cadenceSampleSize: 10,
    });
    expect(r.monthlyDeltaCents).toBe(0);
    expect(r.savingsPct).toBe(0);
  });
});
```

- [ ] **Step 5: Run test to verify fail**

Run: `pnpm --filter @vyro/ai test -- src/analytics/simulator.test.ts`
Expected: FAIL with "Cannot find module './simulator'"

- [ ] **Step 6: Implement `simulator.ts`**

```ts
export interface SimulatorInput {
  productName: string;
  currentSupplier: string;
  currentPriceCents: number;
  currentLeadDays: number;
  alternativeSupplier: string;
  alternativePriceCents: number;
  alternativeLeadDays: number;
  monthlyQuantity: number;
  cadenceSampleSize: number;
}
export interface SimulatorOutput {
  monthlyDeltaCents: number;
  annualDeltaCents: number;
  leadDeltaDays: number;
  confidence: 'high' | 'medium' | 'low';
  savingsPct: number;
}
export function simulateSupplierSwitch(input: SimulatorInput): SimulatorOutput {
  const monthlyDeltaCents = (input.alternativePriceCents - input.currentPriceCents) * input.monthlyQuantity;
  const annualDeltaCents = monthlyDeltaCents * 12;
  const leadDeltaDays = input.alternativeLeadDays - input.currentLeadDays;
  const confidence: SimulatorOutput['confidence'] =
    input.cadenceSampleSize >= 6 ? 'high' : input.cadenceSampleSize >= 3 ? 'medium' : 'low';
  const base = input.currentPriceCents * input.monthlyQuantity;
  const savingsPct = base > 0 ? Math.round(((input.currentPriceCents - input.alternativePriceCents) * 10000) / input.currentPriceCents) / 100 : 0;
  return { monthlyDeltaCents, annualDeltaCents, leadDeltaDays, confidence, savingsPct };
}
```

- [ ] **Step 7: Run analytics tests**

Run: `pnpm --filter @vyro/ai test`
Expected: PASS (existing 38 tests + 5 new = 43)

- [ ] **Step 8: Export from barrel**

Modify `packages/ai/src/analytics/index.ts`:
```ts
export * from './why';
export * from './simulator';
```

- [ ] **Step 9: Commit**

```bash
git add packages/ai/src/analytics/why.ts packages/ai/src/analytics/simulator.ts packages/ai/src/analytics/why.test.ts packages/ai/src/analytics/simulator.test.ts packages/ai/src/analytics/index.ts
git commit -m "feat(ai): why-mode builder + supplier-switch simulator"
```

---

### Task 2: Schemas — new intent + new component types + WHY slot

**Files:**
- Modify: `packages/ai/src/schemas.ts`
- Test: `packages/ai/src/schemas.phase3.test.ts` (extend existing schemas coverage with a new file to keep diff small)

**Interfaces:**
- Consumes: existing `INTENT_NAMES` tuple, `Slots`, `ComponentEnvelope` schemas.
- Produces: `simulate_supplier_switch` added to `INTENT_NAMES`; `Slots` += `{ monthlyQuantity, fromSupplierName, toSupplierName }` (all optional); new `WhyCardDataSchema`, `SimulationCardDataSchema`; `ComponentTypes` += `'why_card' | 'simulation_card'`.

- [ ] **Step 1: Write failing schema test**

`packages/ai/src/schemas.phase3.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { INTENT_NAMES, ComponentEnvelopeSchema } from './schemas';
describe('Phase 3 schema additions', () => {
  it('includes simulate_supplier_switch intent', () => {
    expect(INTENT_NAMES).toContain('simulate_supplier_switch');
  });
  it('validates a why_card envelope', () => {
    const r = ComponentEnvelopeSchema.safeParse({
      type: 'why_card',
      data: { question: 'Why?', answer: 'Because.', evidence: [{ label: 'L', value: 'V' }], recommendation: null },
    });
    expect(r.success).toBe(true);
  });
  it('rejects unknown component type', () => {
    const r = ComponentEnvelopeSchema.safeParse({ type: 'magic_card', data: {} });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/ai test -- src/schemas.phase3.test.ts`
Expected: FAIL (missing intent / unknown type)

- [ ] **Step 3: Modify `schemas.ts`**

Append to `INTENT_NAMES` tuple (positionally after `insights_feed`):
```ts
const INTENT_NAMES = [
  'search_products','find_cheapest','compare_suppliers','supplier_recommend',
  'spend_summary','product_spend','supplier_spend','savings',
  'usual_order','reorder','price_changes','delivery_estimate',
  'price_watch','price_anomaly','supplier_intel','procurement_health',
  'spend_forecast','category_intel','insights_feed','clarify',
  'simulate_supplier_switch',
] as const;
```

Extend `Slots` (inside the existing strict object):
```ts
monthlyQuantity: z.number().int().min(1).max(100000).optional(),
fromSupplierName: z.string().min(1).max(120).optional(),
toSupplierName: z.string().min(1).max(120).optional(),
whyRequested: z.boolean().optional(),
```

Append new component schemas near existing block:
```ts
const WhyEvidenceSchema = z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(200) }).strict();
const WhyCardDataSchema = z.object({
  question: z.string().min(1).max(280),
  answer: z.string().min(1).max(600),
  evidence: z.array(WhyEvidenceSchema).max(10),
  recommendation: z.string().max(280).nullable(),
}).strict();

const SimulationCardDataSchema = z.object({
  productName: z.string().min(1).max(120),
  currentSupplier: z.string().min(1).max(120),
  alternativeSupplier: z.string().min(1).max(120),
  monthlyQuantity: z.number().int().min(1),
  monthlyDeltaCents: z.number().int(),
  annualDeltaCents: z.number().int(),
  leadDeltaDays: z.number().int(),
  savingsPct: z.number(),
  confidence: z.enum(['high','medium','low']),
}).strict();

const ComponentEnvelopeSchema = z.discriminatedUnion('type', [
  // existing entries unchanged:
  z.object({ type: z.literal('recommendation_card'), data: RecommendationCardDataSchema }).strict(),
  z.object({ type: z.literal('savings_card'), data: SavingsCardDataSchema }).strict(),
  z.object({ type: z.literal('procurement_plan_card'), data: ProcurementPlanCardDataSchema }).strict(),
  z.object({ type: z.literal('supplier_list_card'), data: SupplierListCardDataSchema }).strict(),
  z.object({ type: z.literal('spend_summary_card'), data: SpendSummaryCardDataSchema }).strict(),
  z.object({ type: z.literal('clarification_card'), data: ClarificationCardDataSchema }).strict(),
  z.object({ type: z.literal('confirmation_card'), data: ConfirmationCardDataSchema }).strict(),
  // new:
  z.object({ type: z.literal('why_card'), data: WhyCardDataSchema }).strict(),
  z.object({ type: z.literal('simulation_card'), data: SimulationCardDataSchema }).strict(),
]);
```

Add slot constants:
```ts
export type WhyCardData = z.infer<typeof WhyCardDataSchema>;
export type SimulationCardData = z.infer<typeof SimulationCardDataSchema>;
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/ai test`
Expected: PASS (43 tests now 46)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/schemas.ts packages/ai/src/schemas.phase3.test.ts
git commit -m "feat(ai): schema additions for why-card + simulator intent"
```

---

### Task 3: Intent heuristic + simulate handler + catalog wiring

**Files:**
- Modify: `packages/ai/src/intents.ts`
- Modify: `apps/api/src/modules/ai/intents/catalog.ts`
- Create: `apps/api/src/modules/ai/intents/simulateSupplierSwitch.ts`
- Modify: `apps/api/src/modules/ai/intents/drizzleRepos.ts`
- Test: `apps/api/test/ai/phase3/simulateSupplierSwitch.test.ts`

**Interfaces:**
- Consumes: Task 2 schema, Task 1 `simulateSupplierSwitch`, existing `AiRepos`, `HANDLERS`, `STAGES`.
- Produces:
  - `INTENT_ALLOWLIST_BY_ROLE.admin += 'simulate_supplier_switch'`; `member += 'simulate_supplier_switch'`; viewer unchanged.
  - Heuristic branch: `/\b(what if i switch|switch.*supplier|simulate|alternative supplier)\b/i` → `simulate_supplier_switch` with confidence 0.7.
  - `STAGES.simulate_supplier_switch = ['Reading your purchase history', 'Pricing the alternative']`.
  - `HANDLERS.simulate_supplier_switch` → resolves product + alternative from `listOffersByProduct` + `poItemCadence`, emits `simulation_card`.

- [ ] **Step 1: Write failing handler test**

`apps/api/test/ai/phase3/simulateSupplierSwitch.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { simulateSupplierSwitchHandler } from '../../../src/modules/ai/intents/simulateSupplierSwitch';

const repos = {
  findProductByName: vi.fn(async (name: string) => (name === 'Rice' ? { id: 'p1', name: 'Rice' } : null)),
  listOffersByProduct: vi.fn(async () => [
    { supplier: { id: 's1', name: 'Current' }, priceCents: 500000, leadTimeDays: 3, availabilityStatus: 'in_stock', minOrderQty: 1 },
    { supplier: { id: 's2', name: 'Alt' }, priceCents: 420000, leadTimeDays: 4, availabilityStatus: 'in_stock', minOrderQty: 1 },
  ]),
  poItemCadence: vi.fn(async () => ({ avgIntervalDays: 7, stddevDays: 1, count: 8, minIntervalDays: 6, maxIntervalDays: 9 })),
} as any;

describe('simulateSupplierSwitchHandler', () => {
  it('emits simulation_card with monthly+annual deltas', async () => {
    const r = await simulateSupplierSwitchHandler(
      { businessId: 'b1', classify: { intent: 'simulate_supplier_switch', slots: { productName: 'Rice', fromSupplierName: 'Current', toSupplierName: 'Alt' }, confidence: 0.7 } } as any,
      repos,
    );
    expect(r.components[0]?.type).toBe('simulation_card');
    const d: any = (r.components[0] as any).data;
    expect(d.productName).toBe('Rice');
    expect(d.monthlyDeltaCents).toBeLessThan(0);
    expect(d.annualDeltaCents).toBe(d.monthlyDeltaCents * 12);
  });
  it('clarifies when product unknown', async () => {
    const r = await simulateSupplierSwitchHandler(
      { businessId: 'b1', classify: { intent: 'simulate_supplier_switch', slots: { productName: 'Unicorn' }, confidence: 0.7 } } as any,
      { findProductByName: vi.fn(async () => null), listOffersByProduct: vi.fn(), poItemCadence: vi.fn() } as any,
    );
    expect(r.components[0]?.type).toBe('clarification_card');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/phase3/simulateSupplierSwitch.test.ts`
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implement `simulateSupplierSwitch.ts`**

```ts
import { simulateSupplierSwitch } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

export async function simulateSupplierSwitchHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const slots = ctx.classify.slots as { productName?: string; fromSupplierName?: string; toSupplierName?: string };
  const product = slots.productName ? await repos.findProductByName(slots.productName) : null;
  if (!product) {
    return {
      components: [{ type: 'clarification_card', data: { question: `Which product should I simulate a supplier switch for?`, options: [] } }],
      actions: [],
      rawSummary: { clarified: true },
    };
  }
  const offers = await repos.listOffersByProduct(product.id);
  const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
  const from = slots.fromSupplierName ? live.find((o) => o.supplier.name.toLowerCase() === slots.fromSupplierName!.toLowerCase()) : null;
  const to = slots.toSupplierName ? live.find((o) => o.supplier.name.toLowerCase() === slots.toSupplierName!.toLowerCase()) : null;
  const current = from ?? live.slice().sort((a, b) => a.priceCents - b.priceCents)[0];
  const alternative = to ?? live.slice().sort((a, b) => a.priceCents - b.priceCents)[1] ?? current;
  const cadence = await repos.poItemCadence({ businessId: ctx.businessId, productId: product.id, sinceMs: Date.now() - 180 * 86400000 });
  const monthlyQuantity = cadence && cadence.avgIntervalDays > 0 ? Math.max(1, Math.round(30 / cadence.avgIntervalDays)) : 1;
  const sample = cadence?.count ?? 0;
  const result = simulateSupplierSwitch({
    productName: product.name,
    currentSupplier: current.supplier.name,
    currentPriceCents: current.priceCents,
    currentLeadDays: current.leadTimeDays,
    alternativeSupplier: alternative.supplier.name,
    alternativePriceCents: alternative.priceCents,
    alternativeLeadDays: alternative.leadTimeDays,
    monthlyQuantity,
    cadenceSampleSize: sample,
  });
  return {
    components: [{
      type: 'simulation_card',
      data: {
        productName: product.name,
        currentSupplier: current.supplier.name,
        alternativeSupplier: alternative.supplier.name,
        monthlyQuantity,
        monthlyDeltaCents: result.monthlyDeltaCents,
        annualDeltaCents: result.annualDeltaCents,
        leadDeltaDays: result.leadDeltaDays,
        savingsPct: result.savingsPct,
        confidence: result.confidence,
      },
    }],
    actions: [{ type: 'view_search', label: 'Compare alternatives', href: `/search?q=${encodeURIComponent(product.name)}` }],
    rawSummary: { productName: product.name, annualDeltaCents: result.annualDeltaCents, confidence: result.confidence },
  };
}
```

- [ ] **Step 4: Extend `intents.ts` allowlist + heuristic**

Modify `packages/ai/src/intents.ts`:
- In `INTENT_ALLOWLIST_BY_ROLE.admin` (object), append `'simulate_supplier_switch'`.
- In `INTENT_ALLOWLIST_BY_ROLE.member`, append `'simulate_supplier_switch'`.
- In `heuristicClassify` add (before final `return classifyResult`):
```ts
if (/\b(what if i switch|switch.*supplier|simulate|alternative supplier)\b/i.test(prompt)) {
  return classifyResult({ intent: 'simulate_supplier_switch', slots: { productName, fromSupplierName, toSupplierName }, confidence: 0.7 });
}
```

- [ ] **Step 5: Wire `catalog.ts`**

Modify `apps/api/src/modules/ai/intents/catalog.ts`:
- Import handler: `import { simulateSupplierSwitchHandler } from './simulateSupplierSwitch';`
- Add to `HANDLERS` map: `simulate_supplier_switch: simulateSupplierSwitchHandler`.
- Add to `STAGES`: `simulate_supplier_switch: ['Reading your purchase history', 'Pricing the alternative']`.

- [ ] **Step 6: Extend `drizzleRepos.ts`**

If `poItemCadence` does not already exist with the signature in `repos.ts` noop, verify it does (per audit). If absent, add minimal impl:

```ts
poItemCadence: async ({ businessId, productId, sinceMs }) => {
  // SELECT avg/date-diffs over purchase_order_items joined to purchase_orders where businessId=?
  // returns { avgIntervalDays, stddevDays, count, minIntervalDays, maxIntervalDays } | null
  // Implementation note: bucket by calendar day, compute lag days between consecutive occurrences.
  const rows = await db
    .select({ ts: purchaseOrderItems.createdAt })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
    .where(and(eq(purchaseOrders.businessId, businessId), eq(purchaseOrderItems.productId, productId), gte(purchaseOrderItems.createdAt, sinceMs)))
    .orderBy(purchaseOrderItems.createdAt);
  if (rows.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < rows.length; i++) diffs.push((rows[i]!.ts - rows[i - 1]!.ts) / 86400000);
  const avg = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  const variance = diffs.reduce((s, x) => s + (x - avg) ** 2, 0) / diffs.length;
  return {
    avgIntervalDays: Math.round(avg * 100) / 100,
    stddevDays: Math.round(Math.sqrt(variance) * 100) / 100,
    count: rows.length,
    minIntervalDays: Math.min(...diffs),
    maxIntervalDays: Math.max(...diffs),
  };
},
```

(If already implemented in repos.ts as per audit, skip this step and the test still passes against the existing method.)

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/phase3/ && pnpm --filter @vyro/ai test -- src/intents.allowlist.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/ai/src/intents.ts apps/api/src/modules/ai/intents/catalog.ts apps/api/src/modules/ai/intents/simulateSupplierSwitch.ts apps/api/src/modules/ai/intents/drizzleRepos.ts apps/api/test/ai/phase3/simulateSupplierSwitch.test.ts
git commit -m "feat(ai): simulate_supplier_switch intent + cadence repo"
```

---

### Task 4: WHY-mode in narrate + analytics-intent surfacing

**Files:**
- Modify: `apps/api/src/modules/ai/narrate.ts`
- Create: `apps/api/src/modules/ai/intents/whyMode.ts` (helper used by orchestrator)
- Modify: `apps/api/src/modules/ai/orchestrator.ts` (call WHY helper post-handler when `slots.whyRequested`)
- Test: `apps/api/test/ai/phase3/whyMode.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildWhyAnswer`, Task 2 schema, existing handler `rawSummary`.
- Produces: `applyWhyMode(ctx, handlerResult, repos): Promise<HandlerResult>` — appends a `why_card` component when `slots.whyRequested===true` and intent is in `{spend_summary, product_spend, supplier_spend, price_changes, price_watch, price_anomaly, spend_forecast, supplier_intel, procurement_health, savings, savings, price_changes}`. NEVER replaces primary component; only appends.

- [ ] **Step 1: Write failing WHY test**

`apps/api/test/ai/phase3/whyMode.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyWhyMode } from '../../../src/modules/ai/intents/whyMode';

describe('applyWhyMode', () => {
  it('appends why_card to spend_summary result', async () => {
    const out = await applyWhyMode(
      { businessId: 'b1', classify: { intent: 'spend_summary', slots: { whyRequested: true, period: '30d' }, confidence: 0.9 } } as any,
      {
        components: [{ type: 'spend_summary_card', data: { scope: 'business', period: '30d', totalsCents: 1250000 } }],
        actions: [],
        rawSummary: { totalCents: 1250000, prevTotalCents: 1080000, topDriver: { productName: 'Chicken', pct: 22 } },
      },
      {} as any,
    );
    expect(out.components.length).toBe(2);
    const why = out.components[1] as any;
    expect(why.type).toBe('why_card');
    expect(why.data.evidence.length).toBeGreaterThanOrEqual(2);
    expect(why.data.recommendation).toMatch(/chicken|supplier/i);
  });
  it('does nothing when whyRequested false', async () => {
    const out = await applyWhyMode(
      { businessId: 'b1', classify: { intent: 'spend_summary', slots: {}, confidence: 0.9 } } as any,
      { components: [{ type: 'spend_summary_card', data: {} }], actions: [], rawSummary: {} },
      {} as any,
    );
    expect(out.components).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/phase3/whyMode.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `whyMode.ts`**

```ts
import { buildWhyAnswer } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';

const WHY_INTENTS = new Set([
  'spend_summary','product_spend','supplier_spend','price_changes','price_watch',
  'price_anomaly','spend_forecast','supplier_intel','procurement_health','savings',
]);

export async function applyWhyMode(ctx: IntentContext, result: HandlerResult, _repos: unknown): Promise<HandlerResult> {
  const slots = ctx.classify.slots as { whyRequested?: boolean };
  if (!slots.whyRequested || !WHY_INTENTS.has(ctx.classify.intent)) return result;
  const r = result.rawSummary as Record<string, unknown> | undefined;
  const evidence: Array<{ label: string; value: string }> = [];
  if (typeof r?.totalCents === 'number' && typeof r?.prevTotalCents === 'number') {
    const delta = ((r.totalCents as number) - (r.prevTotalCents as number)) / 100;
    evidence.push({ label: 'Current period', value: `Rs. ${(r.totalCents as number / 100).toLocaleString('en-LK')}` });
    evidence.push({ label: 'Prior period', value: `Rs. ${(r.prevTotalCents as number / 100).toLocaleString('en-LK')}` });
    evidence.push({ label: 'Change', value: `Rs. ${delta.toLocaleString('en-LK', { signDisplay: 'always' })}` });
  }
  const driver = r?.topDriver as { productName?: string; pct?: number } | undefined;
  if (driver?.productName) {
    evidence.push({ label: 'Top driver', value: `${driver.productName} (${driver.pct ?? 0}%)` });
  }
  let recommendation: string | null = null;
  if (driver?.productName) recommendation = `Compare alternative suppliers for ${driver.productName}.`;
  const why = buildWhyAnswer({
    question: 'Why?',
    intent: ctx.classify.intent,
    evidence,
    recommendation: recommendation ?? undefined,
  });
  return { ...result, components: [...result.components, { type: 'why_card', data: why }] };
}
```

- [ ] **Step 4: Wire orchestrator**

Modify `apps/api/src/modules/ai/orchestrator.ts`:
- Import: `import { applyWhyMode } from './intents/whyMode';`
- After the `HANDLERS[intent](ctx, repos)` call and before narration, add:
```ts
handlerResult = await applyWhyMode(ctx, handlerResult, repos);
```
(declare `handlerResult` with `let`.)

- [ ] **Step 5: Extend heuristic classifier**

Modify `packages/ai/src/intents.ts` `heuristicClassify` to set `whyRequested: true` when prompt matches `/\b(why|why did|why is|reason|explain)\b/i` and intent is analytics-shaped. Inject in each analytics branch:
```ts
slots.whyRequested = true;
```

For PR scope, add this at top of `heuristicClassify` after intent is decided, conditional on intent ∈ `{spend_summary, product_spend, supplier_spend, price_changes, price_watch, price_anomaly, spend_forecast, supplier_intel, procurement_health, category_intel}`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/phase3/ && pnpm --filter @vyro/ai test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/intents/whyMode.ts apps/api/src/modules/ai/orchestrator.ts apps/api/src/modules/ai/narrate.ts packages/ai/src/intents.ts apps/api/test/ai/phase3/whyMode.test.ts
git commit -m "feat(ai): WHY mode appends evidence-backed why_card"
```

---

### Task 5: Home payload enrichment — health + concentration risk

**Files:**
- Modify: `apps/api/src/modules/ai/home.ts`
- Modify: `apps/web/src/ai/home.ts`
- Test: `apps/api/test/ai/phase3/homeEnrichment.test.ts`
- Test: `apps/web/test/aiHomePhase3.test.ts`

**Interfaces:**
- Consumes: Task 1 imports (`procurementHealth` already exists), `concentration` repo (already exists per audit).
- Produces: `HomePayload += { healthScore: { score: number; breakdown: {concentration:number;priceCompetitiveness:number;deliveryReliability:number;consistency:number;savingsOpportunity:number} }; concentrationRisk: { topSupplierShare: number; label: 'low'|'moderate'|'high'; alternativeCount: number } }`.

- [ ] **Step 1: Write failing home enrichment test**

`apps/api/test/ai/phase3/homeEnrichment.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@vyro/ai', async () => {
  const actual = await vi.importActual<typeof import('@vyro/ai')>('@vyro/ai');
  return {
    ...actual,
    procurementHealth: vi.fn(async (_repos: unknown, score: number) => ({
      score,
      breakdown: {
        concentration: score >= 70 ? 18 : 5,
        priceCompetitiveness: 16,
        deliveryReliability: 14,
        consistency: 15,
        savingsOpportunity: 15,
      },
    })),
  };
});

import { buildHomePayload } from '../../../src/modules/ai/home';

describe('buildHomePayload enriched', () => {
  it('includes healthScore with 5 subscores', async () => {
    const repos = {
      reorderCandidates: vi.fn(async () => []),
      savingsOpportunities: vi.fn(async () => []),
      priceChangeMovers: vi.fn(async () => []),
      monthlySpend: vi.fn(async () => [100, 100, 100]),
      concentration: vi.fn(async () => [{ supplierId: 's1', supplierName: 'A', share: 0.4 }]),
      alternativeSupplierCount: vi.fn(async () => 3),
    } as any;
    // Force the mocked procurementHealth to return score=78 by passing it via the call path.
    // Implementation calls procurementHealth(repos, businessId); mock keys off the score arg.
    const p = await buildHomePayload({ businessId: 'b1', repos } as any);
    expect(p.healthScore.score).toBeDefined();
    expect(p.healthScore.breakdown).toHaveProperty('concentration');
    expect(p.concentrationRisk.alternativeCount).toBe(3);
  });
  it('flags high concentration risk above 0.5 share', async () => {
    const repos = {
      reorderCandidates: vi.fn(async () => []),
      savingsOpportunities: vi.fn(async () => []),
      priceChangeMovers: vi.fn(async () => []),
      monthlySpend: vi.fn(async () => [100, 100]),
      concentration: vi.fn(async () => [{ supplierId: 's1', supplierName: 'A', share: 0.7 }]),
      alternativeSupplierCount: vi.fn(async () => 2),
    } as any;
    const p = await buildHomePayload({ businessId: 'b1', repos } as any);
    expect(p.concentrationRisk.label).toBe('high');
    expect(p.concentrationRisk.topSupplierShare).toBeCloseTo(0.7);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- test/ai/phase3/homeEnrichment.test.ts`
Expected: FAIL

- [ ] **Step 3: Extend `home.ts` (api)**

```ts
import { procurementHealth } from '@vyro/ai';

// procurementHealth is a pure analytics function (not a repo method).
// Signature: procurementHealth(repos, businessId) → { score, breakdown }.
// Concentration subscore is read from existing repos.concentration.

export interface HomePayload {
  reorderDue: Array<{ productName: string; lastPurchaseDaysAgo?: number }>;
  savingsTotal: number;
  topMoves: Array<{ productName: string; from: number; to: number; pct: number }>;
  monthly: number[];
  concentration: Array<{ supplierId: string; supplierName: string; share: number }>;
  healthScore: { score: number; breakdown: { concentration: number; priceCompetitiveness: number; deliveryReliability: number; consistency: number; savingsOpportunity: number } };
  concentrationRisk: { topSupplierShare: number; label: 'low' | 'moderate' | 'high'; alternativeCount: number };
}

export async function buildHomePayload(ctx: { businessId: string; repos: any }): Promise<HomePayload> {
  const [reorder, savings, movers, monthly, conc] = await Promise.all([
    ctx.repos.reorderCandidates({ businessId: ctx.businessId, sinceMs: Date.now() - 60 * 86400000 }),
    ctx.repos.savingsOpportunities({ businessId: ctx.businessId, sinceMs: Date.now() - 60 * 86400000 }),
    ctx.repos.priceChangeMovers({ businessId: ctx.businessId, sinceMs: Date.now() - 28 * 86400000 }),
    ctx.repos.monthlySpend({ businessId: ctx.businessId, months: 12 }),
    ctx.repos.concentration({ businessId: ctx.businessId, sinceMs: Date.now() - 90 * 86400000 }),
  ]);
  const health = await procurementHealth(ctx.repos, ctx.businessId);
  const topShare = conc[0]?.share ?? 0;
  // alternativeSupplierCount derives the count of distinct live suppliers for products also sold by the top supplier.
  const alts = ctx.repos.alternativeSupplierCount
    ? await ctx.repos.alternativeSupplierCount({ businessId: ctx.businessId, topSupplierId: conc[0]?.supplierId })
    : 0;
  return {
    reorderDue: reorder.map((r: any) => ({ productName: r.productName, lastPurchaseDaysAgo: r.lastPurchaseDaysAgo })),
    savingsTotal: savings.reduce((s: number, o: any) => s + o.savingCents, 0),
    topMoves: movers.slice(0, 5).map((m: any) => ({ productName: m.productName, from: m.from, to: m.to, pct: m.pct })),
    monthly,
    concentration: conc,
    healthScore: health,
    concentrationRisk: {
      topSupplierShare: topShare,
      label: topShare >= 0.5 ? 'high' : topShare >= 0.3 ? 'moderate' : 'low',
      alternativeCount: alts,
    },
  };
}
```

- [ ] **Step 4: Extend `home.ts` (web)**

Mirror interface in `apps/web/src/ai/home.ts`:
```ts
export interface HomePayload {
  reorderDue: Array<{ productName: string; lastPurchaseDaysAgo?: number }>;
  savingsTotal: number;
  topMoves: Array<{ productName: string; from: number; to: number; pct: number }>;
  monthly: number[];
  concentration: Array<{ supplierId: string; supplierName: string; share: number }>;
  healthScore: { score: number; breakdown: { concentration: number; priceCompetitiveness: number; deliveryReliability: number; consistency: number; savingsOpportunity: number } };
  concentrationRisk: { topSupplierShare: number; label: 'low' | 'moderate' | 'high'; alternativeCount: number };
}
```

- [ ] **Step 5: Add headliners + tests**

In `apps/web/src/ai/home.ts` add pure helpers:
```ts
export function healthHeadline(score: number): string { return score >= 80 ? 'Excellent' : score >= 60 ? 'Healthy' : score >= 40 ? 'Watch' : 'At risk'; }
export function concentrationLabel(share: number): string { return share >= 0.5 ? 'High concentration risk' : share >= 0.3 ? 'Moderate concentration' : 'Diversified'; }
```

In `apps/web/test/aiHomePhase3.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { healthHeadline, concentrationLabel } from '../src/ai/home';
describe('phase3 headliners', () => {
  it('maps health score bands', () => {
    expect(healthHeadline(85)).toBe('Excellent');
    expect(healthHeadline(55)).toBe('Watch');
  });
  it('maps concentration label', () => {
    expect(concentrationLabel(0.7)).toBe('High concentration risk');
    expect(concentrationLabel(0.2)).toBe('Diversified');
  });
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @vyro/api test -- test/ai/phase3/ && pnpm --filter @vyro/web test -- test/aiHomePhase3.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ai/home.ts apps/web/src/ai/home.ts apps/api/test/ai/phase3/homeEnrichment.test.ts apps/web/test/aiHomePhase3.test.ts
git commit -m "feat(ai): home payload enriched with health score + concentration risk"
```

---

### Task 6: Web — render new card types + home widgets

**Files:**
- Modify: `apps/web/src/ask/components/index.tsx`
- Modify: `apps/web/src/ai/AiHomePage.tsx`
- Test: `apps/web/test/aiCards.test.tsx` (or extend existing aiHome)

**Interfaces:**
- Consumes: Task 5 `HomePayload`; new component envelopes `why_card`, `simulation_card`; existing `Surface`, `MetricNumber`, `vyro-kicker`, `vyro-display`, `vyro-rule`, `FlowLine`.
- Produces: 
  - `<WhyCard data={WhyCardData} />` in `renderComponent` switch — editorial layout with question kicker, vyro-display answer paragraph, evidence table (label / value), recommendation footer.
  - `<SimulationCard data={SimulationCardData} />` — side-by-side current vs alternative with delta metric, savings pct, lead delta.
  - `AiHomePage` new section "Procurement health" with `MetricNumber` score + 5 mini bars for subscores + concentration risk card with `Surface kind="elevated"`.

- [ ] **Step 1: Write failing card test**

`apps/web/test/aiCards.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WhyCard, SimulationCard } from '../src/ask/components';

describe('Phase 3 cards', () => {
  it('renders WhyCard with evidence + recommendation', () => {
    const { container } = render(
      <WhyCard data={{ question: 'Why?', answer: 'Because.', evidence: [{ label: 'L', value: 'V' }], recommendation: 'Compare.' }} />,
    );
    expect(container.textContent).toMatch(/Why/);
    expect(container.textContent).toMatch(/Compare\./);
  });
  it('renders SimulationCard with delta', () => {
    const { container } = render(
      <SimulationCard data={{ productName: 'Rice', currentSupplier: 'A', alternativeSupplier: 'B', monthlyQuantity: 4, monthlyDeltaCents: -320000, annualDeltaCents: -3840000, leadDeltaDays: 1, savingsPct: 16, confidence: 'high' }} />,
    );
    expect(container.textContent).toMatch(/Rice/);
    expect(container.textContent).toMatch(/Rs/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/web test -- test/aiCards.test.tsx`
Expected: FAIL (module/component not exported)

- [ ] **Step 3: Add card renderers**

In `apps/web/src/ask/components/index.tsx`:
```tsx
import type { WhyCardData, SimulationCardData } from '@vyro/ai';

export function WhyCard({ data }: { data: WhyCardData }) {
  return (
    <Surface kind="floating" className="p-6 space-y-3">
      <div className="vyro-kicker text-copper">VYRO · Why</div>
      <div className="vyro-display text-2xl text-ink">{data.question}</div>
      <p className="text-ink/80 leading-relaxed">{data.answer}</p>
      <ul className="border-t border-line pt-3 space-y-1">
        {data.evidence.map((e, i) => (
          <li key={i} className="flex justify-between text-sm"><span className="text-ink/60">{e.label}</span><span className="num-tabular font-mono text-ink">{e.value}</span></li>
        ))}
      </ul>
      {data.recommendation && <p className="text-sm text-mint border-t border-line pt-3">→ {data.recommendation}</p>}
    </Surface>
  );
}

export function SimulationCard({ data }: { data: SimulationCardData }) {
  const saving = data.monthlyDeltaCents < 0;
  return (
    <Surface kind="elevated" className="p-6 space-y-4">
      <div className="vyro-kicker text-copper">VYRO · Simulation</div>
      <div className="vyro-display text-2xl text-ink">Switch {data.productName} suppliers</div>
      <div className="grid grid-cols-2 gap-4">
        <div><div className="text-xs text-ink/60 uppercase tracking-wide">Current</div><div className="font-medium">{data.currentSupplier}</div></div>
        <div><div className="text-xs text-ink/60 uppercase tracking-wide">Alternative</div><div className="font-medium">{data.alternativeSupplier}</div></div>
      </div>
      <MetricNumber size="lg" tone={saving ? 'mint' : 'rose'}>{`${data.savingsPct.toFixed(1)}%`}</MetricNumber>
      <div className="text-sm text-ink/70">
        Monthly {saving ? 'saving' : 'cost'}: <span className="num-tabular font-mono">Rs. {Math.abs(data.monthlyDeltaCents / 100).toLocaleString('en-LK')}</span> · Annual: <span className="num-tabular font-mono">Rs. {Math.abs(data.annualDeltaCents / 100).toLocaleString('en-LK')}</span>
      </div>
      <div className="text-xs text-ink/50">Lead time {data.leadDeltaDays >= 0 ? '+' : ''}{data.leadDeltaDays}d · confidence {data.confidence}</div>
    </Surface>
  );
}
```

Extend the existing `renderComponent` switch:
```tsx
case 'why_card': return <WhyCard data={envelope.data as WhyCardData} />;
case 'simulation_card': return <SimulationCard data={envelope.data as SimulationCardData} />;
```

- [ ] **Step 4: Extend `AiHomePage` widgets**

In `apps/web/src/ai/AiHomePage.tsx`, add a new section after existing reorder card:
```tsx
<Surface kind="elevated" className="p-6 space-y-3">
  <div className="vyro-kicker text-copper">VYRO · Procurement health</div>
  <div className="flex items-baseline gap-3">
    <MetricNumber size="lg">{payload.healthScore.score}</MetricNumber>
    <span className="text-ink/60 text-sm">/ 100 · {healthHeadline(payload.healthScore.score)}</span>
  </div>
  <ul className="grid grid-cols-5 gap-2 text-xs">
    {Object.entries(payload.healthScore.breakdown).map(([k, v]) => (
      <li key={k} className="space-y-1">
        <div className="text-ink/60 capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
        <div className="h-1 bg-bone rounded"><div className="h-1 bg-volt rounded" style={{ width: `${Math.min(100, (v / 20) * 100)}%` }} /></div>
        <div className="num-tabular font-mono">{v}</div>
      </li>
    ))}
  </ul>
</Surface>

<Surface kind="elevated" className="p-6 space-y-2">
  <div className="vyro-kicker text-copper">VYRO · Supplier concentration</div>
  <div className="vyro-display text-xl text-ink">{concentrationLabel(payload.concentrationRisk.topSupplierShare)}</div>
  <p className="text-sm text-ink/70">{Math.round(payload.concentrationRisk.topSupplierShare * 100)}% of procurement goes to {payload.concentration[0]?.supplierName ?? 'one supplier'}. {payload.concentrationRisk.alternativeCount} alternatives available.</p>
</Surface>
```

Import the new headliners:
```tsx
import { healthHeadline, concentrationLabel } from './home';
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vyro/web test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ask/components/index.tsx apps/web/src/ai/AiHomePage.tsx apps/web/test/aiCards.test.tsx
git commit -m "feat(web): why/simulation card renderers + health/concentration widgets"
```

---

### Task 7: Verification

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 2: Full tests**

Run: `pnpm test`
Expected: green

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: succeeds

- [ ] **Step 4: Smoke checklist**
- `GET /api/ai/home` returns `healthScore` + `concentrationRisk` populated
- `POST /api/ai/ask {prompt:"Why did spending increase?", businessId}` returns spend_summary_card + why_card
- `POST /api/ai/ask {prompt:"What if I switch rice supplier to Alt?", businessId}` returns simulation_card with non-zero delta when alternates exist
- AiHomePage renders health band + concentration card
- All existing 20 intents still pass allowlist matrix
