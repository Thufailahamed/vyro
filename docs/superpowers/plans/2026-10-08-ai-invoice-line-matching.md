# AI-Assisted Invoice Line Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve invoice-to-PO line matching for noisy OCR text using one cheap, gateway-routed Workers AI call only for lines the deterministic matcher leaves unresolved.

**Architecture:** Refactor the pure matcher to expose its deterministic one-to-one match plan and accept validated AI overrides/suggestions. An API-layer helper calls a small Workers AI text model for remaining invoice lines only, validates the response against PO candidate IDs, and applies only high-confidence unique matches. The reconciliation card labels AI matches and exposes lower-confidence suggestions for buyer review through the existing invoice review page.

**Tech Stack:** TypeScript, Zod, `@vyro/ai` pure matcher, Hono/Cloudflare Workers AI binding via `WorkersAIProvider`, Cloudflare AI Gateway, Vitest, React static-markup tests.

## Global Constraints

- No new dependencies.
- Design spec: `docs/superpowers/specs/2026-10-08-ai-invoice-line-matching-design.md`.
- The feature flag `VYRO_AI_RECONCILE_MATCHING` defaults to `false`.
- The model may select only a provided PO item ID or `null`; it must never create a PO item or change invoice/PO quantities, units, or prices.
- Automatically apply an AI match only when confidence is at least `0.95` and its margin over the second choice is at least `0.15`.
- Keep one-to-one PO-item assignment; preserve the current deterministic token-Jaccard behavior when AI is disabled or fails.
- AI matching applies only when reconciliation uses a persisted `invoiceUploadId`; manually supplied `invoiceData` remains deterministic-only.
- Tests stub Workers AI; never call a live model in CI.
- Commit per task with explicit paths only after the user authorizes implementation commits; never stage unrelated working-tree changes.

---

### Task 1: Shared match-plan and result contracts

**Files:**
- Modify: `packages/ai/src/reconciliation/types.ts`
- Modify: `packages/ai/src/reconciliation/matcher.ts`
- Test: `packages/ai/src/reconciliation/matcher.test.ts`

**Interfaces:**
- Consumes: `PoItemInput`, `InvoiceItemData`, current `matchThreeWayReconciliation(input)`.
- Produces:
  - `planDeterministicMatches(poItems, invoiceItems): DeterministicMatchPlan`, which returns greedy one-to-one deterministic matches plus unresolved invoice indexes and remaining PO item IDs using the exact existing Jaccard threshold `0.35`.
  - `MatcherInput.aiMatchOverrides?: AiMatchOverride[]` and `MatcherInput.aiSuggestions?: AiMatchSuggestion[]`.
  - `ReconciliationLine.matchSource?: 'deterministic' | 'ai'`, `matchConfidence?: number`, `matchExplanation?: string`, `aiSuggestion?: AiMatchSuggestion` (the line-level shape omits the internal invoice index).
  - `matchThreeWayReconciliation` consumes those overrides without changing quantity/price comparisons, result totals, or action/status rules.

- [ ] **Step 1: Add failing pure matcher tests**

Append cases to `packages/ai/src/reconciliation/matcher.test.ts` using `baseInput`:

```ts
  it('exposes deterministic pairs and unmatched invoice indexes', () => {
    const plan = planDeterministicMatches(baseInput.poItems, [
      baseInput.invoice.items[0]!,
      { ...baseInput.invoice.items[1]!, description: 'WHT SGR 50KG' },
    ]);
    expect(plan.matches).toEqual([
      { invoiceItemIndex: 0, poItemId: 'poi-1', confidence: 1 },
    ]);
    expect(plan.unmatchedInvoiceIndexes).toEqual([1]);
    expect(plan.remainingPoItemIds).toEqual(['poi-2']);
  });

  it('uses a validated AI override only for the indexed invoice line', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        items: [
          { ...baseInput.invoice.items[0]!, description: 'Samba Rice 50kg' },
          { ...baseInput.invoice.items[1]!, description: 'WHT SGR 50KG' },
        ],
      },
      aiMatchOverrides: [
        { invoiceItemIndex: 1, poItemId: 'poi-2', confidence: 0.97, reason: 'Abbreviation and size match.' },
      ],
    });
    const sugar = result.lines.find((line) => line.poItemId === 'poi-2');
    expect(sugar?.status).toBe('matched');
    expect(sugar?.matchSource).toBe('ai');
    expect(sugar?.matchConfidence).toBe(0.97);
    expect(sugar?.matchExplanation).toBe('Abbreviation and size match.');
  });

  it('keeps a below-threshold AI candidate unmatched and surfaces it as a suggestion', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        items: [{ ...baseInput.invoice.items[0]!, description: 'BASM RCE 5K' }],
      },
      aiSuggestions: [
        { invoiceItemIndex: 0, poItemId: 'poi-1', productName: 'Samba Rice 50kg', confidence: 0.72, reason: 'Possible rice pack match.' },
      ],
    });
    const unexpected = result.lines.find((line) => line.status === 'unexpected_item');
    expect(unexpected?.poItemId).toBeUndefined();
    expect(unexpected?.aiSuggestion?.poItemId).toBe('poi-1');
    expect(result.lines.find((line) => line.status === 'missing_item')?.poItemId).toBe('poi-1');
  });

  it('does not allow an AI override to assign one PO item twice', () => {
    const result = matchThreeWayReconciliation({
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        items: [
          { ...baseInput.invoice.items[0]!, description: 'RICE A' },
          { ...baseInput.invoice.items[1]!, description: 'RICE B' },
        ],
      },
      aiMatchOverrides: [
        { invoiceItemIndex: 0, poItemId: 'poi-1', confidence: 0.99, reason: 'Match A' },
        { invoiceItemIndex: 1, poItemId: 'poi-1', confidence: 0.98, reason: 'Match B' },
      ],
    });
    expect(result.lines.filter((line) => line.poItemId === 'poi-1')).toHaveLength(1);
    expect(result.lines.some((line) => line.status === 'unexpected_item')).toBe(true);
  });
```

Import `planDeterministicMatches` from `./matcher` in the test. Expected before implementation: TypeScript/Vitest fails because the function and AI metadata types do not exist.

- [ ] **Step 2: Define the contracts**

In `types.ts`, add:

```ts
export const AiMatchSuggestionSchema = z.object({
  invoiceItemIndex: z.number().int().min(0),
  poItemId: z.string().min(1),
  productName: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(160),
});
export type AiMatchSuggestion = z.infer<typeof AiMatchSuggestionSchema>;

export const AiMatchOverrideSchema = z.object({
  invoiceItemIndex: z.number().int().min(0),
  poItemId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(160),
});
export type AiMatchOverride = z.infer<typeof AiMatchOverrideSchema>;

export interface DeterministicMatch {
  invoiceItemIndex: number;
  poItemId: string;
  confidence: number;
}
export interface DeterministicMatchPlan {
  matches: DeterministicMatch[];
  unmatchedInvoiceIndexes: number[];
  remainingPoItemIds: string[];
}
```

Extend the existing `PoItemInput` with `unit?: string | undefined`; manual matcher callers can omit it. In Task 3, populate it from the linked catalog product when available.

Extend `ReconciliationLineSchema` with optional match metadata:

```ts
  matchSource: z.enum(['deterministic', 'ai']).optional(),
  matchConfidence: z.number().min(0).max(1).optional(),
  matchExplanation: z.string().max(160).optional(),
  aiSuggestion: AiMatchSuggestionSchema.omit({ invoiceItemIndex: true }).optional(),
```

Extend `MatcherInput` with:

```ts
  aiMatchOverrides?: AiMatchOverride[];
  aiSuggestions?: AiMatchSuggestion[];
```

The pure match planner signature is:

```ts
export function planDeterministicMatches(
  poItems: PoItemInput[],
  invoiceItems: InvoiceItemData[],
): DeterministicMatchPlan;
```

- [ ] **Step 3: Refactor the matcher without changing existing results**

In `matcher.ts`:

1. Export `planDeterministicMatches(poItems, invoiceItems)`.
2. Copy the exact current greedy Jaccard selection into that helper: tokenize descriptions with the existing tokenizer, select the highest remaining score, accept at `score >= 0.35`, reserve each selected PO item once, and return the per-invoice index + score.
3. Make `matchThreeWayReconciliation` use the plan for its default assignments. At each invoice index, prefer a supplied `aiMatchOverride` only when its index is unresolved, its `poItemId` is in `deterministicPlan.remainingPoItemIds`, exists in `poItems`, and has not already been consumed; otherwise use that index’s deterministic plan entry; otherwise emit the existing `unexpected_item` line. Apply the same unresolved-index/remaining-PO validation to suggestions.
4. Attach `matchSource: 'ai'`, `matchConfidence`, and `matchExplanation` to applied AI lines; attach `matchSource: 'deterministic'` and the Jaccard score to existing deterministic matches.
5. For an unmatched invoice line, attach a validated `aiSuggestion` for that exact `invoiceItemIndex` if present. Do not consume its suggested PO item; it must still produce the existing `missing_item` line.
6. Keep all price, quantity, variance, total, delivery, and recommendation calculations unchanged.

- [ ] **Step 4: Run package tests and typecheck**

Run: `pnpm --filter @vyro/ai test && pnpm --filter @vyro/ai typecheck`
Expected: all existing + new pure matcher tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/reconciliation/types.ts packages/ai/src/reconciliation/matcher.ts packages/ai/src/reconciliation/matcher.test.ts
git commit -m "feat(ai): expose deterministic reconciliation match plan"
```

---

### Task 2: Cheap gateway-routed AI candidate resolver

**Files:**
- Create: `apps/api/src/modules/reconciliation/aiLineMatcher.ts`
- Modify: `apps/api/src/modules/ai/provider/workersAI.ts` (attach configured gateway)
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/wrangler.toml` (local + production vars)
- Test: `apps/api/test/ai/reconciliationLineMatcher.test.ts`
- Test: `apps/api/test/ai/provider.workersAI.test.ts`

**Interfaces:**
- Consumes from Task 1: `planDeterministicMatches`, `AiMatchOverride`, `AiMatchSuggestion`, `PoItemInput`, `InvoiceData`.
- Produces:

```ts
export interface AiLineMatchStats {
  attempted: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  appliedCount: number;
  suggestionCount: number;
}

export interface AiLineMatchResult {
  overrides: AiMatchOverride[];
  suggestions: AiMatchSuggestion[];
  stats: AiLineMatchStats;
}

export async function resolveUnmatchedInvoiceLines(
  env: Env,
  poItems: PoItemInput[],
  invoice: InvoiceData,
  plan: DeterministicMatchPlan,
): Promise<AiLineMatchResult>;
```

The helper never throws provider/JSON failures; it returns empty overrides/suggestions and `stats.attempted` if it tried a call.

- [ ] **Step 1: Write failing resolver tests**

Create `apps/api/test/ai/reconciliationLineMatcher.test.ts` with `vi.fn()` Workers AI bindings and these cases:

```ts
const poItems = [
  { id: 'poi-rice', productNameSnapshot: 'Basmati Rice 5kg', quantity: 10, unitPriceCents: 1200, lineTotalCents: 12000, unit: 'bag' },
];
const invoice = {
  totalCents: 12000,
  items: [{ description: 'BSM RCE 5K', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000 }],
};
const deterministicPlan = {
  matches: [],
  unmatchedInvoiceIndexes: [0],
  remainingPoItemIds: ['poi-rice'],
};
```

1. `VYRO_AI_RECONCILE_MATCHING` unset/false → `attempted:false`, no `AI.run`.
2. Enabled with response `{"matches":[{"invoiceItemIndex":0,"poItemId":"poi-rice","confidence":0.98,"alternativeConfidence":0.10,"reason":"Abbreviation and size match."}]}` → one override; model receives the configured model, JSON mode, and gateway ID.
3. Confidence `0.80` or margin below `0.15` → no override, one suggestion with reason.
4. Unknown PO ID, duplicate PO ID/index, or an index not in `unmatchedInvoiceIndexes` anywhere in the response → fail closed for the entire response (no override or suggestion), including a mixed response with one valid and one invalid entry.
5. More than 50 unresolved lines or serialized prompt above 12,000 characters → skip call.
6. Deterministic plan with no unresolved indexes → skip call.
7. A Worker call that never resolves times out at 8 seconds; a rejected Worker call is attempted once, then returns empty overrides/suggestions (no provider retry).

Run: `cd apps/api && pnpm exec vitest run test/ai/reconciliationLineMatcher.test.ts`
Expected: FAIL because the module/function is not implemented.

- [ ] **Step 2: Add env config and gateway support**

In `apps/api/src/env.ts` add:

```ts
  /** Enables confidence-gated AI matching for persisted invoice uploads. Defaults off. */
  VYRO_AI_RECONCILE_MATCHING?: string;
  /** Cheap Workers AI text model used only for unresolved invoice lines. */
  VYRO_AI_RECONCILE_MODEL?: string;
```

In both `[vars]` and `[env.production.vars]` of `apps/api/wrangler.toml`, add:

```toml
VYRO_AI_RECONCILE_MATCHING = "false"
VYRO_AI_RECONCILE_MODEL = "@cf/zai-org/glm-5.3-flash"
```

In `WorkersAIProvider.chat`, keep the current payload construction, then add the gateway when configured:

```ts
    const gatewayId = this.env.VYRO_AI_GATEWAY;
    if (gatewayId) payload.gateway = { id: gatewayId };
```

Add a provider test that `env.AI.run` gets `gateway: { id: 'gateway-test' }` when set and no `gateway` property when absent. Existing provider calls remain otherwise unchanged.

- [ ] **Step 3: Implement the resolver**

`aiLineMatcher.ts` implementation requirements:

1. Return no-op stats when feature flag is not exactly `'true'`, `env.AI` is absent, no deterministic-unmatched invoice lines remain, more than 50 invoice lines remain unresolved, or prompt serialization exceeds 12,000 characters.
2. Build one JSON-only request containing only unresolved invoice indexes/descriptions/units and the remaining PO candidates’ IDs/product-name snapshots/current units (when the linked catalog product still exists). Include instructions: use product identity only; ignore price/quantity while matching; choose one provided ID or `null`; never invent a PO item; include `confidence`, `alternativeConfidence`, and `reason`.
3. Call `new WorkersAIProvider(env).chat([{ role:'system', content:… }, { role:'user', content: JSON.stringify(input) }], { model: env.VYRO_AI_RECONCILE_MODEL ?? '@cf/zai-org/glm-5.3-flash', responseFormatJson:true, temperature:0, maxTokens:1200, retry:false })`. `WorkersAIProvider` normally retries once; `retry:false` enforces one model request for this task.
4. Parse content with a local Zod schema:

```ts
const AiResponseSchema = z.object({
  matches: z.array(z.object({
    invoiceItemIndex: z.number().int().min(0),
    poItemId: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    alternativeConfidence: z.number().min(0).max(1),
    reason: z.string().min(1).max(160),
  }).strict()).max(50),
}).strict();
```

5. Validate every non-null ID is in `remainingPoItemIds` and every index is unresolved and appears only once. Any invalid index, unknown ID, duplicate index, or duplicate non-null PO ID invalidates the whole response and returns empty overrides/suggestions. For a valid response, sort candidates by confidence descending; apply at most one result per invoice index/PO item. If `confidence >= 0.95` and `confidence - alternativeConfidence >= 0.15`, return an `AiMatchOverride`; otherwise return an `AiMatchSuggestion` populated with the matching PO item's `productNameSnapshot`. Null/no-candidate responses remain unmatched with no suggestion.
6. Race the provider call against an 8-second timeout and clear the timeout handle in `finally`. On timeout, `AIUnavailableError`, JSON/Zod errors, or other provider failures, return empty overrides/suggestions. Return model, provider name, latency, attempted/applied/suggestion counts, but never persist the prompt or raw model response.

- [ ] **Step 4: Run resolver + provider tests and API typecheck**

Run: `cd apps/api && pnpm exec vitest run test/ai/reconciliationLineMatcher.test.ts test/ai/provider.workersAI.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reconciliation/aiLineMatcher.ts apps/api/src/modules/ai/provider/workersAI.ts apps/api/src/env.ts apps/api/wrangler.toml apps/api/test/ai/reconciliationLineMatcher.test.ts apps/api/test/ai/provider.workersAI.test.ts
git commit -m "feat(ai): add cheap gateway-routed invoice match resolver"
```

---

### Task 3: Integrate AI rescue in stored-invoice reconciliation

**Files:**
- Modify: `apps/api/src/modules/reconciliation/reconciliationService.ts`
- Test: `apps/api/test/ai/reconciliationHybrid.test.ts`

**Interfaces:**
- Consumes: Task 1 matcher contracts and Task 2 `resolveUnmatchedInvoiceLines`.
- Produces: `runThreeWayReconciliation(env, orderId, { invoiceUploadId })` computes the deterministic plan and, only when the selected invoice source is a persisted upload, passes validated `aiMatchOverrides` and `aiSuggestions` to the pure matcher. Manual `invoiceData` stays deterministic-only. Audit metadata records attempt/model/latency/applied/suggestion counts, never prompt/raw response.

- [ ] **Step 1: Write the failing integration tests**

Create `apps/api/test/ai/reconciliationHybrid.test.ts`, mounting a real `makeD1()` with `applyMigrations`, and seed a buyer/user/business, supplier, two active products + offers, a delivered PO with those two PO items, a delivered delivery row, an `invoiceUploads` row plus invoice-line rows.

Use an OCR line description intentionally below the deterministic Jaccard threshold, e.g. `WHT SGR 1KG`, while the only candidate PO line is `White Sugar 1kg`; stub `AI.run` to return that PO item's seeded ID at confidence `0.98`, alternative confidence `0.1`, and reason `Abbreviation and pack size match.` Seed the other line with an exact deterministic match. Set billed sugar price to 300 cents while the PO price is 250 cents, to prove the model changes item identity only and the matcher still detects a price variance.

The `AI.run` stub returns the match JSON when its second argument contains `response_format`; when the service makes its separate existing claim-note call (no `response_format`), return a 30-character claim-note string. This isolates both call paths without a live provider.

Assert:

1. With `VYRO_AI_RECONCILE_MATCHING:'true'`, reconciliation returns the correct `poItemId`, `matchSource:'ai'`, confidence/reason, and still detects `price_variance` using the original invoice values.
2. With the flag unset/false, the same line stays `unexpected_item`, and the JSON-mode `AI.run` call is not made.
3. With `invoiceData` supplied directly (no upload ID), `AI.run` is not called in JSON mode even when the feature flag is true.
4. When the JSON-mode call throws or returns malformed JSON, the service returns the deterministic-only discrepancy result (not an exception).
5. A same-business upload without `purchaseOrderId` remains deterministic-only; an upload owned by another business or linked to a different PO is rejected with 403 before AI dispatch.

Use the database seed pattern from `apps/api/test/documents/reconcileLinked.test.ts`: include real `supplierProducts` rows because `purchase_order_items.supplier_product_id` has a foreign key; store actual generated PO item IDs for the mocked candidate response.

Run: `cd apps/api && pnpm exec vitest run test/ai/reconciliationHybrid.test.ts`
Expected: FAIL before service integration.

- [ ] **Step 2: Integrate**

In `runThreeWayReconciliation`:

1. Track whether `invoiceData` actually came from `options.invoiceUploadId` (do not infer it merely from the option being present if `invoiceData` was directly supplied). Before reading invoice lines, require `upload.businessId === po.businessId`; if `upload.purchaseOrderId` is non-null and differs from `po.id`, throw `httpError(403, 'FORBIDDEN', ...)`. A same-business unlinked upload may still reconcile deterministically, but it is not AI-eligible.
2. When mapping PO items, left-join `purchaseOrderItems.supplierProductId` → `supplierProducts.id` → `products.id` to include `products.unit` as optional `PoItemInput.unit`; retain the stored `productNameSnapshot` as the primary identity text.
3. After constructing `matcherInput`, if source is stored upload and flag is `'true'`, call `planDeterministicMatches(matcherInput.poItems, matcherInput.invoice.items)`, then `resolveUnmatchedInvoiceLines(env, matcherInput.poItems, matcherInput.invoice, plan)`.
4. Set `matcherInput.aiMatchOverrides` and `matcherInput.aiSuggestions` from the resolver result. When the resolver skipped or failed, set neither (or empty arrays); the pure matcher reproduces today’s deterministic behavior.
5. Extend the existing `ai.reconciliation.match` audit metadata with `aiMatchingAttempted`, `aiMatchingModel`, `aiMatchingLatencyMs`, `aiMatchesApplied`, and `aiSuggestions`; keep this non-fatal and omit prompts/raw responses.

- [ ] **Step 3: Run integration tests + related tests**

Run: `cd apps/api && pnpm exec vitest run test/ai/reconciliationHybrid.test.ts test/ai/reconciliationService.test.ts test/documents/reconcileLinked.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; existing auto-reconcile phase A tests stay deterministic-only by default.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/reconciliation/reconciliationService.ts apps/api/test/ai/reconciliationHybrid.test.ts
git commit -m "feat(reconciliation): apply confidence-gated ai line matches"
```

---

### Task 4: Card metadata and buyer correction link

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx` (type auto-reconciliation payload, pass `uploadId`)
- Modify: `apps/web/src/components/reconciliation/ThreeWayReconciliationCard.tsx`
- Test: extend `apps/web/test/reconciliation/AutoReconcileCard.test.tsx`

**Interfaces:**
- Consumes: Task 1 `ReconciliationLine` metadata; phase A auto-reconciliation payload `{ status, payload, uploadId, createdAt }`.
- Produces: applied matches show `AI match · NN%` + `matchExplanation`; low-confidence lines show suggested PO item + confidence + reason and a link to `/invoices/:uploadId/review`.

- [ ] **Step 1: Extend the card test fixtures**

In `AutoReconcileCard.test.tsx` add cases to a test payload:

```ts
const AI_LINE = {
  description: 'White Sugar 1kg',
  poItemId: 'poi-sugar',
  poQuantity: 20,
  billedQuantity: 20,
  poUnitPriceCents: 250,
  billedUnitPriceCents: 250,
  varianceCents: 0,
  status: 'matched',
  matchSource: 'ai',
  matchConfidence: 0.98,
  matchExplanation: 'Abbreviation and pack size match.',
};
const SUGGESTION_LINE = {
  description: 'WHT SGR 1KG',
  billedQuantity: 20,
  billedUnitPriceCents: 250,
  billedTotalCents: 5000,
  varianceCents: 5000,
  status: 'unexpected_item',
  aiSuggestion: {
    poItemId: 'poi-sugar',
    productName: 'White Sugar 1kg',
    confidence: 0.78,
    reason: 'Possible abbreviation match; verify before accepting.',
  },
};
```

Assertions: AI match badge, `98%`, and explanation render on `AI_LINE`; suggestion name/reason and `href="/invoices/upload-id/review"` render on `SUGGESTION_LINE` when `autoReconciliation.uploadId='upload-id'`.

- [ ] **Step 2: Implement card rendering**

Extend `AutoReconciliation` in `ThreeWayReconciliationCard.tsx` with `uploadId?: string`. On matched lines with `matchSource === 'ai'`, render a compact AI badge + confidence and `matchExplanation`. On lines with `aiSuggestion`, render `Possible PO match: {productName} · {confidence}% — {reason}`. When at least one suggestion is present and `uploadId` exists, render a `Link` to `/invoices/${uploadId}/review` labelled `Review invoice lines`.

In `OrderDetailPage.tsx`, use this response type in the existing query:

```ts
api.get<{
  status: string;
  payload: ThreeWayReconciliationResult | null;
  uploadId?: string;
  createdAt?: number;
}>(`/documents/by-po/${id}/auto-reconciliation`)
```

Pass `autoReconciliation={autoRecon ?? null}` as today; no extra API call.

- [ ] **Step 3: Run web tests + typecheck**

Run: `cd apps/web && pnpm exec vitest run test/reconciliation/AutoReconcileCard.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/OrderDetailPage.tsx apps/web/src/components/reconciliation/ThreeWayReconciliationCard.tsx apps/web/test/reconciliation/AutoReconcileCard.test.tsx
git commit -m "feat(web): show ai match evidence and review suggestions"
```

---

### Task 5: Golden matching fixtures + full verification

**Files:**
- Create: `apps/api/test/ai/reconciliationLineMatcher.golden.test.ts`
- No changes to `packages/ai/eval/golden.ts`: that file evaluates copilot intent classification and is not the right schema for reconciliation line matches.

**Interfaces:**
- Consumes: Task 2 resolver, Task 3 service integration, Task 4 view contract.
- Produces: labeled fixtures covering alias/typo/pack-size and ambiguous candidates; confirms only correct, high-confidence cases auto-apply.

- [ ] **Step 1: Add golden cases**

Include fixtures with the exact source description, candidate PO items, expected candidate ID (or null), and expected handling:

```ts
const GOLDEN_MATCHES = [
  { source: 'BSM RCE 5K', candidates: [{ id: 'rice-5kg', name: 'Basmati Rice 5kg' }], acceptedId: 'rice-5kg' },
  { source: 'WHT SGR 1KG', candidates: [{ id: 'sugar-1kg', name: 'White Sugar 1kg' }], acceptedId: 'sugar-1kg' },
  { source: 'MLK PDR 400G', candidates: [{ id: 'milk-1kg', name: 'Milk Powder 1kg' }, { id: 'milk-400g', name: 'Milk Powder 400g' }], acceptedId: 'milk-400g', confidence: 0.98, alternativeConfidence: 0.12 },
  { source: 'MLK PDR', candidates: [{ id: 'milk-400g', name: 'Milk Powder 400g' }, { id: 'milk-1kg', name: 'Milk Powder 1kg' }], acceptedId: null, confidence: 0.78, alternativeConfidence: 0.74 },
  { source: 'Forklift service fee', candidates: [{ id: 'rice-5kg', name: 'Basmati Rice 5kg' }], acceptedId: null, confidence: 0, alternativeConfidence: 0 },
];
```

Stub model responses per fixture and assert that each auto-applied ID equals the labeled ID; for `acceptedId: null`, assert no override is produced and any valid candidate remains a suggestion. Never call a live model.

- [ ] **Step 2: Run all relevant tests**

Run:

```bash
pnpm --filter @vyro/ai test
pnpm --filter @vyro/api test
pnpm --filter @vyro/web test
pnpm --filter @vyro/ai typecheck
pnpm --filter @vyro/db typecheck
pnpm --filter @vyro/validation typecheck
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/web typecheck
```

Expected: all new tests and package typechecks pass. If the existing storefront `memberSinceHero` tests fail due to the other session's SupplierHero work, verify that failure is unchanged from the base and report it separately.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/ai/reconciliationLineMatcher.golden.test.ts
git commit -m "test(ai): add invoice line matching golden fixtures"
```

---

## Spec coverage map

| Spec requirement | Task |
|---|---|
| Shared deterministic match plan, exact Jaccard behavior preserved | 1 |
| AI selects provided PO IDs or null only; strict output validation | 2 |
| One-to-one assignment and confidence + alternative margin gates | 1, 2 |
| Feature off by default; Workers AI + AI Gateway; one batch call | 2 |
| Only stored upload flow gets AI rescue; manual `invoiceData` deterministic | 3 |
| Failure/disabled/invalid response falls back to deterministic matcher | 2, 3 |
| Match source/confidence/reason and suggestion in API result | 1, 3 |
| Buyer sees explanation/suggestion and can correct invoice | 4 |
| OCR noise/pack-size/ambiguous golden fixtures; stubs only | 2, 5 |
