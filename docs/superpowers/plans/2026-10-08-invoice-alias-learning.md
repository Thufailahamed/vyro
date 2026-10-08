# Invoice Product Alias Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn buyer-confirmed invoice description → catalog product aliases, scoped by buyer business and supplier, so repeat OCR lines match before Jaccard or AI.

**Architecture:** Add an indexed `invoice_product_aliases` table and exact normalization. The invoice review screen exposes only product candidates from the linked PO; saving a selected product persists `invoiceLineItems.productId` and upserts the alias with an audit record. Reconciliation resolves exact aliases to a unique PO item before the deterministic matcher and Phase B AI resolver; stale/out-of-PO and ambiguous aliases are ignored.

**Tech Stack:** Drizzle + D1 migration, TypeScript pure helpers in `@vyro/ai`, Hono documents API, React invoice review page, Vitest (`makeD1`/`applyMigrations`, static markup tests).

## Global Constraints

- No new dependencies.
- Design spec: `docs/superpowers/specs/2026-10-08-invoice-alias-learning-design.md`.
- Aliases are private to `(businessId, supplierId)`.
- Only a buyer’s explicit product selection from a linked PO may create or replace an alias.
- Matching order is exact confirmed alias → deterministic token-Jaccard → Phase B AI resolver.
- An alias only matches a PO item for the mapped catalog `productId`; never match a product absent from the current PO.
- If multiple unmatched PO lines have the same `productId`, do not alias-match; leave them to deterministic/AI matching.
- Alias lookup and learning never call an AI model; matching remains exact after normalization.
- Alias-upsert failure must not roll back successfully reviewed invoice lines.
- Audit metadata records old/new product IDs and source upload ID, not raw invoice descriptions.
- Tests use D1/Workers AI stubs; no live model calls.
- Implementation commits require explicit user authorization; if authorized, stage explicit paths only and never stage unrelated changes.

---

### Task 1: Alias table migration + Drizzle schema

**Files:**
- Create: `packages/db/migrations/0056_invoice_product_aliases.sql`
- Create: `packages/db/src/schema/invoiceProductAliases.ts`
- Modify: `packages/db/src/schema/index.ts`
- Test: `apps/api/test/documents/invoiceProductAliasMigration.test.ts`

**Interfaces:**
- Produces: `invoiceProductAliases` table and `InvoiceProductAlias` / `NewInvoiceProductAlias` types for Tasks 3 and 6.
- Alias identity is the unique tuple `(businessId, supplierId, normalizedAlias)`; the row stores `productId`, `sourceUploadId`, creator, and timestamps.

- [ ] **Step 1: Write the failing migration test**

Create `apps/api/test/documents/invoiceProductAliasMigration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeD1, applyMigrations } from '../helpers/d1';

describe('invoice_product_aliases migration', () => {
  it('creates the scoped alias table and required columns', async () => {
    const db = makeD1();
    await applyMigrations(db);
    const result = await db
      .prepare('PRAGMA table_info(invoice_product_aliases)')
      .all<{ name: string }>();
    const columns = (result.results ?? []).map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining([
      'business_id',
      'supplier_id',
      'normalized_alias',
      'product_id',
      'source_upload_id',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ]));
  });
});
```

Run: `cd apps/api && pnpm exec vitest run test/documents/invoiceProductAliasMigration.test.ts`
Expected before migration creation: FAIL because `invoice_product_aliases` has no columns.

- [ ] **Step 2: Write migration 0056**

```sql
-- 0056_invoice_product_aliases.sql
-- Buyer-confirmed invoice OCR description → catalog product memory.
CREATE TABLE invoice_product_aliases (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  normalized_alias TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_upload_id TEXT NOT NULL REFERENCES invoice_uploads(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX invoice_product_aliases_scope_alias_idx
  ON invoice_product_aliases(business_id, supplier_id, normalized_alias);
```

- [ ] **Step 3: Add the Drizzle table**

Create `packages/db/src/schema/invoiceProductAliases.ts`:

```ts
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { suppliers } from './suppliers';
import { products } from './products';
import { invoiceUploads } from './invoiceUploads';
import { users } from './users';

export const invoiceProductAliases = sqliteTable(
  'invoice_product_aliases',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    supplierId: text('supplier_id').notNull().references(() => suppliers.id),
    normalizedAlias: text('normalized_alias').notNull(),
    productId: text('product_id').notNull().references(() => products.id),
    sourceUploadId: text('source_upload_id').notNull().references(() => invoiceUploads.id),
    createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    scopeAliasIdx: uniqueIndex('invoice_product_aliases_scope_alias_idx').on(
      t.businessId,
      t.supplierId,
      t.normalizedAlias,
    ),
  }),
);

export type InvoiceProductAlias = typeof invoiceProductAliases.$inferSelect;
export type NewInvoiceProductAlias = typeof invoiceProductAliases.$inferInsert;
```

- [ ] **Step 4: Export the schema**

Add to `packages/db/src/schema/index.ts`:

```ts
export * from './invoiceProductAliases';
```

- [ ] **Step 5: Verify migration + types**

Run: `cd apps/api && pnpm exec vitest run test/documents/invoiceProductAliasMigration.test.ts && cd ../.. && pnpm --filter @vyro/db typecheck`
Expected: clean. API `applyMigrations` tests automatically apply `0056` in filename order.

- [ ] **Step 6: Commit when authorized**

```bash
git add packages/db/migrations/0056_invoice_product_aliases.sql packages/db/src/schema/invoiceProductAliases.ts packages/db/src/schema/index.ts apps/api/test/documents/invoiceProductAliasMigration.test.ts
git commit -m "feat(db): add scoped invoice product aliases"
```

---

### Task 2: Exact normalization + alias-first pure matching

**Files:**
- Create: `packages/ai/src/reconciliation/aliases.ts`
- Modify: `packages/ai/src/reconciliation/types.ts`
- Modify: `packages/ai/src/reconciliation/matcher.ts`
- Modify: `packages/ai/src/reconciliation/index.ts`
- Test: `packages/ai/src/reconciliation/aliases.test.ts`
- Test: `packages/ai/src/reconciliation/matcher.test.ts`

**Interfaces:**
- Produces:
  - `normalizeInvoiceAlias(description: string): string` — empty string for empty or >200-character normalized result.
  - `InvoiceProductAliasInput = { normalizedAlias: string; productId: string }`.
  - `planInvoiceAliasMatches(poItems, invoiceItems, aliases): AliasMatchOverride[]` — only when one unused PO item with `productId` exactly matches the alias mapping.
  - `MatcherInput.aliasMatchOverrides?: AliasMatchOverride[]`; result match source supports `'alias'`.

- [ ] **Step 1: Write normalization tests**

Create `packages/ai/src/reconciliation/aliases.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeInvoiceAlias, planInvoiceAliasMatches } from './aliases';

describe('normalizeInvoiceAlias', () => {
  it('normalizes case, punctuation, and spacing but preserves pack-size digits', () => {
    expect(normalizeInvoiceAlias('  WHT.   SGR—1KG! ')).toBe('wht sgr 1kg');
    expect(normalizeInvoiceAlias('Milk Powder 400g')).toBe('milk powder 400g');
  });

  it('applies Unicode compatibility normalization and skips empty/overlength aliases', () => {
    expect(normalizeInvoiceAlias('Ｃａｆé 1kg')).toBe('café 1kg');
    expect(normalizeInvoiceAlias('!!!')).toBe('');
    expect(normalizeInvoiceAlias('x'.repeat(201))).toBe('');
  });
});

describe('planInvoiceAliasMatches', () => {
  const invoice = [
    { description: 'WHT. SGR 1KG', quantity: 1, unitPriceCents: 100, totalCents: 100 },
  ];

  it('matches an exact normalized alias only to its product on the current PO', () => {
    const po = [
      { id: 'poi-1', productId: 'product-sugar', productNameSnapshot: 'White Sugar 1kg', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
      { id: 'poi-2', productId: 'product-rice', productNameSnapshot: 'Rice 5kg', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ];
    expect(planInvoiceAliasMatches(po, invoice, [{ normalizedAlias: 'wht sgr 1kg', productId: 'product-sugar' }])).toEqual([
      { invoiceItemIndex: 0, poItemId: 'poi-1', reason: 'Previously confirmed supplier alias.' },
    ]);
  });

  it('ignores an alias whose product is absent from the PO', () => {
    const po = [
      { id: 'poi-rice', productId: 'product-rice', productNameSnapshot: 'Rice 5kg', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ];
    expect(planInvoiceAliasMatches(po, invoice, [{ normalizedAlias: 'wht sgr 1kg', productId: 'product-sugar' }])).toEqual([]);
  });

  it('does not choose when duplicate PO rows share the aliased product', () => {
    const po = [
      { id: 'poi-sugar-a', productId: 'product-sugar', productNameSnapshot: 'White Sugar 1kg A', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
      { id: 'poi-sugar-b', productId: 'product-sugar', productNameSnapshot: 'White Sugar 1kg B', quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ];
    expect(planInvoiceAliasMatches(po, invoice, [{ normalizedAlias: 'wht sgr 1kg', productId: 'product-sugar' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement exact normalization**

In `aliases.ts`:

```ts
export function normalizeInvoiceAlias(description: string): string {
  const normalized = description
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 200 ? '' : normalized;
}
```

Do not stem words, remove stop words, strip digits, or use fuzzy comparison for aliases.

- [ ] **Step 3: Implement alias planning**

```ts
import type { InvoiceItemData, PoItemInput } from './types';

export interface InvoiceProductAliasInput {
  normalizedAlias: string;
  productId: string;
}

export interface AliasMatchOverride {
  invoiceItemIndex: number;
  poItemId: string;
  reason: string;
}

export function planInvoiceAliasMatches(
  poItems: PoItemInput[],
  invoiceItems: InvoiceItemData[],
  aliases: InvoiceProductAliasInput[],
): AliasMatchOverride[] {
  const productByAlias = new Map(
    aliases.filter((alias) => alias.normalizedAlias.length > 0)
      .map((alias) => [alias.normalizedAlias, alias.productId]),
  );
  const reservedInvoiceIndexes = new Set<number>();
  const reservedPoItemIds = new Set<string>();
  const overrides: AliasMatchOverride[] = [];

  for (let invoiceItemIndex = 0; invoiceItemIndex < invoiceItems.length; invoiceItemIndex++) {
    const normalizedAlias = normalizeInvoiceAlias(invoiceItems[invoiceItemIndex]!.description);
    const productId = productByAlias.get(normalizedAlias);
    if (!normalizedAlias || !productId) continue;
    const candidates = poItems.filter(
      (item) => item.productId === productId && !reservedPoItemIds.has(item.id),
    );
    if (candidates.length !== 1 || reservedInvoiceIndexes.has(invoiceItemIndex)) continue;

    const candidate = candidates[0]!;
    reservedInvoiceIndexes.add(invoiceItemIndex);
    reservedPoItemIds.add(candidate.id);
    overrides.push({
      invoiceItemIndex,
      poItemId: candidate.id,
      reason: 'Previously confirmed supplier alias.',
    });
  }
  return overrides;
}
```

Implementation rule: create a lookup map from `normalizedAlias` to `productId`, loop invoice items in input order, find not-yet-reserved `PoItemInput` rows whose `productId` equals the alias product, and emit an override only if that candidate count is exactly one. Reserve emitted `poItemId`s so two invoice lines cannot use the same PO row. Emit reason exactly `Previously confirmed supplier alias.`.

`PoItemInput` gains `productId?: string | undefined`. Add `AliasMatchOverride` to `MatcherInput` as `aliasMatchOverrides?: AliasMatchOverride[]`; extend match source to `'alias' | 'deterministic' | 'ai'`.

Modify `planDeterministicMatches(poItems, invoiceItems, aliasMatchOverrides = [])` to validate and reserve alias indexes/PO IDs first, then run the existing greedy Jaccard pass over remaining invoice/PO items. Return matches in original invoice-item order with `{ invoiceItemIndex, poItemId, confidence, source, reason? }`; alias confidence is `1`, deterministic confidence is the current Jaccard score. `matchThreeWayReconciliation` passes its alias overrides to the planner and renders alias lines with `matchSource:'alias'`, `matchConfidence:1`, `matchExplanation:'Previously confirmed supplier alias.'`. AI candidates come only from the resulting remaining invoice indexes and remaining PO IDs.

Export the new pure functions/types from `packages/ai/src/reconciliation/index.ts` (already re-exported from `packages/ai/src/index.ts`).

- [ ] **Step 4: Run shared package tests and typecheck**

Run: `pnpm --filter @vyro/ai test && pnpm --filter @vyro/ai typecheck`
Expected: PASS; baseline deterministic matcher cases retain their previous statuses and totals.

- [ ] **Step 5: Commit when authorized**

```bash
git add packages/ai/src/reconciliation/aliases.ts packages/ai/src/reconciliation/aliases.test.ts packages/ai/src/reconciliation/types.ts packages/ai/src/reconciliation/matcher.ts packages/ai/src/reconciliation/matcher.test.ts packages/ai/src/reconciliation/index.ts
git commit -m "feat(ai): add exact invoice alias matching"
```

---

### Task 3: Alias persistence repository

**Files:**
- Modify: `apps/api/src/modules/documents/repository.ts`
- Test: `apps/api/test/documents/invoiceProductAliasesRepository.test.ts`

**Interfaces:**
- Consumes: `invoiceProductAliases` from Task 1; `normalizeInvoiceAlias` from Task 2.
- Produces:
  - `listInvoiceProductAliases(env, businessId, supplierId, normalizedAliases): Promise<Array<{normalizedAlias:string; productId:string}>>`.
  - `upsertInvoiceProductAlias(env, input): Promise<{id:string; previousProductId:string|null; changed:boolean}>`, where input is `{businessId,supplierId,normalizedAlias,productId,sourceUploadId,createdByUserId}`.

- [ ] **Step 1: Write D1 repository tests**

Use `makeD1`/`applyMigrations` and seed valid user/business/supplier/products/invoice uploads. Test:

1. Insert a new alias → lookup returns it for the same business + supplier.
2. Same normalized alias + same product on repeat save → remains one row, `changed:false`.
3. Same alias changed to a different product → row now points to latest product, returned `previousProductId` is the prior product, `changed:true`.
4. Another business or another supplier does not see or overwrite this alias.
5. Audit events on insert/replacement record old/new product IDs and source upload ID, but metadata does not contain normalized/raw alias text.

- [ ] **Step 2: Implement list lookup**

In `documents/repository.ts`, add `listInvoiceProductAliases`:

```ts
export async function listInvoiceProductAliases(
  env: Env,
  businessId: string,
  supplierId: string,
  normalizedAliases: string[],
): Promise<Array<{ normalizedAlias: string; productId: string }>> {
  const values = [...new Set(normalizedAliases.filter(Boolean))];
  if (!values.length) return [];
  const db = getDb(env.DB);
  const matches: Array<{ normalizedAlias: string; productId: string }> = [];
  for (let i = 0; i < values.length; i += 80) {
    const batch = values.slice(i, i + 80);
    matches.push(...await db
      .select({ normalizedAlias: invoiceProductAliases.normalizedAlias, productId: invoiceProductAliases.productId })
      .from(invoiceProductAliases)
      .where(and(
        eq(invoiceProductAliases.businessId, businessId),
        eq(invoiceProductAliases.supplierId, supplierId),
        inArray(invoiceProductAliases.normalizedAlias, batch),
      ))
      .all());
  }
  return matches;
}
```

Add `and` and `inArray` imports from Drizzle if absent, and `invoiceProductAliases` / `auditLogs` schema imports.

- [ ] **Step 3: Implement latest-confirmation upsert + audit**

```ts
export async function upsertInvoiceProductAlias(
  env: Env,
  input: {
    businessId: string;
    supplierId: string;
    normalizedAlias: string;
    productId: string;
    sourceUploadId: string;
    createdByUserId: string;
  },
): Promise<{ id: string; previousProductId: string | null; changed: boolean }> {
  const db = getDb(env.DB);
  const before = await db.select().from(invoiceProductAliases).where(and(
    eq(invoiceProductAliases.businessId, input.businessId),
    eq(invoiceProductAliases.supplierId, input.supplierId),
    eq(invoiceProductAliases.normalizedAlias, input.normalizedAlias),
  )).get();
  if (before?.productId === input.productId) {
    return { id: before.id, previousProductId: before.productId, changed: false };
  }
  const now = Date.now();
  const id = before?.id ?? newId();
  await db.insert(invoiceProductAliases).values({
    id,
    businessId: input.businessId,
    supplierId: input.supplierId,
    normalizedAlias: input.normalizedAlias,
    productId: input.productId,
    sourceUploadId: input.sourceUploadId,
    createdByUserId: input.createdByUserId,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [invoiceProductAliases.businessId, invoiceProductAliases.supplierId, invoiceProductAliases.normalizedAlias],
    set: { productId: input.productId, sourceUploadId: input.sourceUploadId, createdByUserId: input.createdByUserId, updatedAt: now },
  });
  await db.insert(auditLogs).values({
    id: newId(),
    actorUserId: input.createdByUserId,
    action: 'invoice_product_alias.upsert',
    resourceType: 'invoice_product_alias',
    resourceId: id,
    metadata: JSON.stringify({
      businessId: input.businessId,
      supplierId: input.supplierId,
      sourceUploadId: input.sourceUploadId,
      previousProductId: before?.productId ?? null,
      productId: input.productId,
    }),
    createdAt: now,
  });
  return { id, previousProductId: before?.productId ?? null, changed: true };
}
```

Keep the audit entry free of `normalizedAlias` and raw invoice description. Wrap this call at the route boundary so alias-persistence failure cannot undo the already-saved invoice review.

- [ ] **Step 4: Run repository tests + API typecheck**

Run: `cd apps/api && pnpm exec vitest run test/documents/invoiceProductAliasesRepository.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit when authorized**

```bash
git add apps/api/src/modules/documents/repository.ts apps/api/test/documents/invoiceProductAliasesRepository.test.ts
git commit -m "feat(documents): persist scoped invoice product aliases"
```

---

### Task 4: PO candidate endpoint + review validation + alias learning

**Files:**
- Modify: `apps/api/src/modules/documents/repository.ts` (PO candidates)
- Modify: `apps/api/src/modules/documents/routes.ts` (`GET /:id`, `POST /:id/review`)
- Test: `apps/api/test/documents/productAliasLearning.test.ts`

**Interfaces:**
- Consumes: repository functions from Task 3; `normalizeInvoiceAlias`; the existing `purchaseOrderItems → supplierProducts → products` relation.
- Produces:
  - `listInvoiceMatchCandidates(env, purchaseOrderId): Promise<Array<{productId:string; productName:string; unit:string|null}>>`, deduped by catalog `productId`.
  - `GET /api/documents/:id` adds `upload.matchCandidates` for PO-linked uploads; unlinked uploads get `[]`.
  - `POST /api/documents/:id/review` rejects any selected non-null `productId` that is not in the linked PO candidate list; after `saveReviewedLines`, aliases are upserted for confirmed line product IDs only.

- [ ] **Step 1: Write route tests first**

Create `productAliasLearning.test.ts` with `makeD1`/`applyMigrations`, the Hono + `errorEnvelope` mount pattern from `apps/api/test/documents/uploadDirectPo.test.ts`, and a session mock for a business owner.

Seed one business, one supplier, one catalog category, two products/offers, one delivered PO with both product items, and one linked invoice upload with a single line. Assert:

1. `GET /api/documents/:id` returns only the PO’s distinct catalog products in `upload.matchCandidates`; a linked PO whose `businessId` differs from the upload's business is rejected, not exposed.
2. `POST /:id/review` with line `productId` equal to a PO candidate saves `invoiceLineItems.productId` and creates an alias under `(businessId, supplierId)` for normalized line description.
3. Re-submit the same normalized description with the other PO product selected → alias `productId` updates to the latest selection and an audit event records old/new product IDs (not the raw description).
4. Submit a catalog `productId` that is not on the PO → 400; no alias is created.
5. A non-PO-linked upload returns no candidates and a non-null selected `productId` is rejected; no alias is learned.
6. Two lines in one review with the same normalized description but different selected products both save, but neither selection overwrites/creates an alias for that conflicting description.
7. The UI-generated `Untitled line` placeholder is not learned as an alias.

- [ ] **Step 2: Add candidate query helper**

```ts
export async function listInvoiceMatchCandidates(env: Env, purchaseOrderId: string) {
  const rows = await getDb(env.DB)
    .select({
      productId: products.id,
      productName: purchaseOrderItems.productNameSnapshot,
      unit: products.unit,
    })
    .from(purchaseOrderItems)
    .innerJoin(supplierProducts, eq(purchaseOrderItems.supplierProductId, supplierProducts.id))
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
    .all();
  const unique = new Map<string, { productId: string; productName: string; unit: string | null }>();
  for (const row of rows) {
    if (!unique.has(row.productId)) unique.set(row.productId, row);
  }
  return [...unique.values()];
}
```

- [ ] **Step 3: Add candidates to document GET**

In `routes.ts` `GET /:id`, after `getUpload` and the not-found guard:

```ts
  let matchCandidates: Array<{ productId: string; productName: string; unit: string | null }> = [];
  if (row.purchaseOrderId) {
    const linkedPo = await getDb(c.env.DB)
      .select({ businessId: purchaseOrders.businessId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, row.purchaseOrderId))
      .get();
    if (!linkedPo || linkedPo.businessId !== businessId) {
      throw httpError(403, 'FORBIDDEN', 'Invoice is not linked to your purchase order');
    }
    matchCandidates = await listInvoiceMatchCandidates(c.env, row.purchaseOrderId);
  }
  return c.json({ upload: { ...row, matchCandidates } });
```

- [ ] **Step 4: Validate PO product and upsert buyer-confirmed aliases**

In `POST /:id/review`, after `existing` is loaded:

```ts
  let linkedSupplierId: string | null = null;
  if (existing.purchaseOrderId) {
    const linkedPo = await getDb(c.env.DB)
      .select({ businessId: purchaseOrders.businessId, supplierId: purchaseOrders.supplierId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, existing.purchaseOrderId))
      .get();
    if (!linkedPo || linkedPo.businessId !== businessId) {
      throw httpError(403, 'FORBIDDEN', 'Invoice is not linked to your purchase order');
    }
    linkedSupplierId = linkedPo.supplierId;
  }
  const matchCandidates = existing.purchaseOrderId
    ? await listInvoiceMatchCandidates(c.env, existing.purchaseOrderId)
    : [];
  const allowedProductIds = new Set(matchCandidates.map((candidate) => candidate.productId));
  if (parsed.data.lines.some((line) => line.productId != null && !allowedProductIds.has(line.productId))) {
    throw httpError(400, 'VALIDATION_ERROR', 'Selected product must be on this purchase order');
  }
```

After `saveReviewedLines(...)`, and before the category-correction loop completes:

1. For each submitted line with non-null `productId`, `linkedSupplierId`, and a non-empty normalized description, collect `normalizedAlias → productId` in a map. Skip the exact `Untitled line` fallback (case-insensitive) and aliases whose normalizer returns `''`.
2. If the same normalized alias occurs with two different selected product IDs in this review submission, mark it conflicting and do not learn that alias from this submission.
3. For every non-conflicting alias once, call `upsertInvoiceProductAlias` with `businessId`, `linkedSupplierId`, `sourceUploadId:id`, and `createdByUserId:ctx.userId`.
4. If an upsert fails, catch it per alias and `console.warn` with only `uploadId` plus an error label; do not log invoice text and do not roll back the review save. The helper returns `changed:false` for an unchanged selection and creates no audit row in that case.

- [ ] **Step 5: Run document tests + typecheck**

Run: `cd apps/api && pnpm exec vitest run test/documents/productAliasLearning.test.ts test/documents/reconcileLinked.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit when authorized**

```bash
git add apps/api/src/modules/documents/repository.ts apps/api/src/modules/documents/routes.ts apps/api/test/documents/productAliasLearning.test.ts
git commit -m "feat(documents): learn aliases from confirmed invoice products"
```

---

### Task 5: Invoice review product selector

**Files:**
- Create: `apps/web/src/components/invoices/InvoicePoProductSelect.tsx`
- Modify: `apps/web/src/pages/InvoiceReviewPage.tsx`
- Test: `apps/web/test/InvoicePoProductSelect.test.tsx`

**Interfaces:**
- Consumes: `upload.matchCandidates` from Task 4 and `invoiceLineItems.productId`.
- Produces: a visible select for PO-linked invoices, with `Unmapped` + one option per PO catalog product; `InvoiceReviewPage.save()` sends each line’s selected `productId` to the existing review endpoint.

- [ ] **Step 1: Test the selector as static markup**

```tsx
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoicePoProductSelect } from '../src/components/invoices/InvoicePoProductSelect';

describe('InvoicePoProductSelect', () => {
  it('renders unmapped and only the supplied PO product candidates', () => {
    const html = renderToStaticMarkup(createElement(InvoicePoProductSelect, {
      value: 'product-sugar',
      candidates: [
        { productId: 'product-rice', productName: 'Basmati Rice 5kg', unit: 'bag' },
        { productId: 'product-sugar', productName: 'White Sugar 1kg', unit: 'pack' },
      ],
      onChange: () => {},
    }));
    expect(html).toContain('Unmapped');
    expect(html).toContain('Basmati Rice 5kg');
    expect(html).toContain('White Sugar 1kg');
    expect(html).toContain('value="product-sugar" selected');
  });

  it('renders nothing when the upload has no PO product candidates', () => {
    const html = renderToStaticMarkup(createElement(InvoicePoProductSelect, {
      value: null,
      candidates: [],
      onChange: () => {},
    }));
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: Implement `InvoicePoProductSelect`**

```tsx
export type InvoiceProductCandidate = {
  productId: string;
  productName: string;
  unit: string | null;
};

export function InvoicePoProductSelect({
  value,
  candidates,
  onChange,
}: {
  value: string | null;
  candidates: InvoiceProductCandidate[];
  onChange: (productId: string | null) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <select
      aria-label="PO product match"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
      className="w-full bg-paper border border-ink/20 text-ink px-1 py-1 outline-none"
    >
      <option value="">Unmapped</option>
      {candidates.map((candidate) => (
        <option key={candidate.productId} value={candidate.productId}>
          {candidate.productName}{candidate.unit ? ` · ${candidate.unit}` : ''}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Wire into InvoiceReviewPage**

Extend `LineItem` with `productId: string | null`; extend `Upload` with `purchaseOrderId: string | null`, `matchCandidates: InvoiceProductCandidate[]`, and each line's `productId`. Import `InvoicePoProductSelect` and `type InvoiceProductCandidate` from `@/components/invoices/InvoicePoProductSelect`. In `emptyLine`, set `productId: null`. Include `productId` in the save payload. Add one `PO product` column only when `upload.purchaseOrderId` is present and `upload.matchCandidates.length > 0`; render `InvoicePoProductSelect` for those linked invoice lines. Update the empty table `colSpan` from 7 to 8 when that column is present. Add `productId` to the `dirty` comparisons so changing only the selected product enables Save.

- [ ] **Step 4: Run web tests + typecheck**

Run: `cd apps/web && pnpm exec vitest run test/InvoicePoProductSelect.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit when authorized**

```bash
git add apps/web/src/components/invoices/InvoicePoProductSelect.tsx apps/web/src/pages/InvoiceReviewPage.tsx apps/web/test/InvoicePoProductSelect.test.tsx
git commit -m "feat(web): select PO products during invoice review"
```

---

### Task 6: Resolve confirmed aliases before Jaccard and AI

**Files:**
- Modify: `packages/ai/src/reconciliation/types.ts`, `aliases.ts`, `matcher.ts`, and their tests
- Modify: `apps/api/src/modules/reconciliation/reconciliationService.ts`
- Modify: `apps/api/src/modules/documents/repository.ts`
- Test: extend `apps/api/test/ai/reconciliationHybrid.test.ts`

**Interfaces:**
- Consumes: alias repository lookup from Task 3; `planInvoiceAliasMatches(poItems, invoiceItems, aliases)` from Task 2.
- Produces: persisted upload flow loads aliases filtered by `po.businessId` + `po.supplierId`; pure matcher reserves exact alias pairs first, then Jaccard; Task 2 AI resolver sees only the remaining indexes/items. Alias matches carry `matchSource:'alias'`, confidence `1`, and explanation `Previously confirmed supplier alias.`.

- [ ] **Step 1: Add failing reconciliation tests**

Extend `reconciliationHybrid.test.ts` with these cases:

1. Seed an alias for buyer business + supplier: normalized `wht sgr 1kg` → sugar product. Reconcile an invoice line with description `WHT. SGR 1KG!` against a PO containing exactly one line with that product. Expect `status:'matched'`, `matchSource:'alias'`, `matchConfidence:1`, `matchExplanation:'Previously confirmed supplier alias.'`, and zero JSON-mode AI calls even with `VYRO_AI_RECONCILE_MATCHING:'true'`.
2. Same normalized alias for a different business/supplier is not loaded; the line remains deterministic/AI unresolved according to the existing path.
3. Alias product absent from the current PO is ignored.
4. Two PO lines with the same productId cause no alias match; existing deterministic/AI path handles them.

- [ ] **Step 2: Add catalog product IDs to PO matcher input**

The reconciliation service’s PO query already joins `purchaseOrderItems` → `supplierProducts` → `products` for unit. Extend the select shape with `productId: products.id` and map that to optional `PoItemInput.productId`.

- [ ] **Step 3: Load aliases only for the confirmed upload scope**

In `runThreeWayReconciliation`, after loading the invoice upload and verifying that `upload.businessId === po.businessId` and its `purchaseOrderId === po.id` (already added by Phase B security validation), use `listInvoiceProductAliases(env, po.businessId, po.supplierId, normalizedDescriptions)` to load candidate aliases. Normalize each invoice description with `normalizeInvoiceAlias`; empty aliases are omitted. If no linked upload ID was resolved, use an empty alias list.

Create alias overrides with:

```ts
const aliasOverrides = planInvoiceAliasMatches(
  matcherInput.poItems,
  matcherInput.invoice.items,
  aliases,
);
matcherInput.aliasMatchOverrides = aliasOverrides;
```

Then call `planDeterministicMatches(matcherInput.poItems, matcherInput.invoice.items, aliasOverrides)` before the AI resolver. Add `aliasMatchesApplied` to the existing reconciliation audit metadata. The alias lookup failure is caught and treated as `[]`, leaving deterministic Jaccard + AI rescue intact.

- [ ] **Step 4: Run reconciliation tests + typechecks**

Run:

```bash
cd apps/api && pnpm exec vitest run test/ai/reconciliationHybrid.test.ts test/ai/reconciliationLineMatcher.test.ts test/documents/productAliasLearning.test.ts
pnpm --filter @vyro/ai typecheck
cd apps/api && pnpm exec tsc --noEmit
```

Expected: PASS; exact buyer/supplier alias matches avoid a JSON-mode Workers AI call.

- [ ] **Step 5: Commit when authorized**

```bash
git add packages/ai/src/reconciliation/aliases.ts packages/ai/src/reconciliation/matcher.ts packages/ai/src/reconciliation/types.ts apps/api/src/modules/reconciliation/reconciliationService.ts apps/api/src/modules/documents/repository.ts apps/api/test/ai/reconciliationHybrid.test.ts
git commit -m "feat(reconciliation): use confirmed invoice aliases first"
```

---

### Task 7: Final sweep

- [ ] Full API suite: `pnpm --filter @vyro/api test`.
- [ ] Shared AI tests: `pnpm --filter @vyro/ai test`.
- [ ] Web suite: `pnpm --filter @vyro/web test`; note only existing `memberSinceHero.test.tsx` failures if unchanged from baseline.
- [ ] Typechecks: `pnpm --filter @vyro/db typecheck && pnpm --filter @vyro/validation typecheck && pnpm --filter @vyro/ai typecheck && pnpm --filter @vyro/api typecheck && pnpm --filter @vyro/web typecheck`.
- [ ] `git diff --check`; review explicit status/diff paths before any authorized commits.

---

## Spec coverage map

| Spec requirement | Tasks |
|---|---|
| `invoice_product_aliases` table, unique per buyer+supplier+normalized text | 1 |
| NFKC/lowercase/punctuation cleanup; preserve numbers; exact lookup | 2 |
| Buyer explicitly maps a PO invoice line to a catalog product | 4, 5 |
| Update alias on latest explicit correction and audit old/new IDs | 3, 4 |
| PO-only candidate choices; reject outside-PO product IDs | 4, 5 |
| Exact alias → Jaccard → Phase B AI | 2, 6 |
| Alias matches only products present on current PO; duplicate candidate safety | 2, 6 |
| Same-business/supplier isolation; unlinked invoices do not learn | 3, 4, 6 |
| Alias hits reduce Workers AI calls; non-sensitive counts only | 6 |
| Errors do not roll back a successful invoice review | 4 |
| Tests | 1-7 |
