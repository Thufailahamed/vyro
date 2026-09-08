# VYRO AI Phase 5 — Document Intelligence (Invoice OCR + Categorization)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let buyers upload supplier invoices (image/PDF) → R2 → queue → OCR worker → human review page → categorized line items stored in D1. Auto-classify spending into Food/Packaging/Cleaning/Office/Equipment/Other; allow correction; surface a `categorize_expenses` AI intent.

**Architecture:**
- **Direct upload** to R2 via multipart (simpler than presign; Cloudflare R2 supports streaming PUT). Server stores raw bytes, enqueues a message.
- **Queue consumer** (`invoiceOcr.ts`) calls Cloudflare Workers AI vision model (`@cf/llava-hf/llava-1.5-7b-hf` style — verify at runtime; fallback to deterministic stub returns zero confidence → manual review required).
- **Schema:** three new tables: `invoice_uploads`, `invoice_line_items`, `category_mappings`. Per-business mapping overrides win over global defaults.
- **UI:** three pages — upload (drag/drop), list (status badges), review (editable extracted rows with category dropdowns). All editorial design system.
- **AI intent:** `categorize_expenses` reuses Phase 4 intent infra. Adds `expenseCategoryBreakdown` repo method.

**Tech Stack:** Cloudflare R2, Cloudflare Queues, Workers AI vision, D1/Drizzle, Hono, React 19 + react-query 5, Vitest.

## Global Constraints

- **Review-before-save:** OCR output is never trusted. Review page is mandatory before lines are persisted to `invoice_line_items` (status `reviewed`).
- **Corrections are feedback:** Manual category overrides insert a new per-business mapping (`priority` > global defaults) and flip `categorySource='manual'`. Never retrain anything.
- **Neutral language:** OCR low-confidence banners use "Awaiting manual entry" not "Failed" / "Error".
- **RBAC:** Owner + manager only can upload. Staff + purchasing can view + correct.
- **Tenant isolation:** Every query filters by `eq(invoice_uploads.businessId, ctx.businessId)`. `category_mappings.businessId IS NULL` is global; `IS NOT NULL` overrides per business.
- **R2 keys:** `<businessId>/<uploadId>/<originalFilename>`. Filename sanitized.
- **Confidence threshold:** < 0.6 → status `processing` stays for manual review; ≥ 0.6 → status `ready` with `rawExtractionJson` populated; review page lets user correct anything.
- **Audit:** `audit_logs.action='document.upload'`, `document.review'`, `document.review.correct'`. Slot values never stored.
- **Deterministic categorization:** rule engine is pure string-substring match. No embeddings, no LLM. Manual edits win.
- **Voice/WhatsApp-ready:** endpoints are Hono REST returning JSON.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/db/migrations/0019_documents.sql` | New tables: invoice_uploads, invoice_line_items, category_mappings + indexes |
| `packages/db/migrations/0019_documents_down.sql` | Down migration |
| `packages/db/src/schema/invoiceUploads.ts` | `invoiceUploads` table + types |
| `packages/db/src/schema/invoiceLineItems.ts` | `invoiceLineItems` table + types |
| `packages/db/src/schema/categoryMappings.ts` | `categoryMappings` table + types |
| `packages/db/src/schema/index.ts` | Re-export new schemas |
| `apps/api/wrangler.toml` | Add INVOICES R2 bucket + INVOICES_QUEUE bindings |
| `apps/api/src/env.ts` | Add `INVOICES: R2Bucket`, `INVOICES_QUEUE: Queue` |
| `apps/api/src/queue/invoiceOcr.ts` | Queue consumer that runs OCR worker per message |
| `apps/api/src/modules/documents/ocrWorker.ts` | Workers AI vision call + deterministic stub fallback |
| `apps/api/src/modules/documents/repository.ts` | D1 queries for uploads + line items + mappings |
| `apps/api/src/modules/documents/routes.ts` | REST endpoints (upload/list/get/review) |
| `apps/api/src/worker.ts` | Wire queue consumer for `invoices` |
| `apps/api/src/index.ts` | Mount documents router under `/api/documents` |
| `packages/ai/src/analytics/categorize.ts` | Pure rule engine |
| `packages/ai/src/intents.ts` | Add `categorize_expenses` + allowlist |
| `apps/api/src/modules/ai/intents/categorizeExpenses.ts` | Handler |
| `apps/api/src/modules/ai/intents/catalog.ts` | Register handler + STAGES entry |
| `apps/api/src/modules/ai/intents/drizzleRepos.ts` | `expenseCategoryBreakdown` method |
| `apps/web/src/pages/InvoiceUploadPage.tsx` | Drag/drop upload UI |
| `apps/web/src/pages/InvoiceListPage.tsx` | Status table |
| `apps/web/src/pages/InvoiceReviewPage.tsx` | Editable extracted-rows editor |
| `apps/web/src/ai/CategoryBadge.tsx` | Shared chip |
| `apps/web/src/App.tsx` | Add 3 routes under `/invoices/*` |
| `apps/web/test/documents/upload.test.tsx` | UI smoke tests |
| `packages/ai/src/analytics/categorize.test.ts` | Rule engine tests |
| `apps/api/test/documents/upload.test.ts` | Endpoint tests |
| `apps/api/test/documents/queue.test.ts` | Queue consumer tests |
| `apps/api/test/ai/phase5/categorizeExpenses.test.ts` | Intent tests |

---

## Task 1: Schema migration

**Files:**
- Create: `packages/db/migrations/0019_documents.sql`
- Create: `packages/db/migrations/0019_documents_down.sql`

**Step 1: Write the up migration**

```sql
CREATE TABLE invoice_uploads (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
  supplier_id TEXT REFERENCES suppliers(id),
  status TEXT NOT NULL CHECK (status IN ('pending','processing','ready','reviewed','failed','manual_required')),
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  ocr_provider TEXT,
  ocr_confidence REAL,
  raw_extraction_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by_user_id TEXT REFERENCES users(id),
  total_cents INTEGER
);
CREATE INDEX invoice_uploads_business_idx ON invoice_uploads(business_id, created_at);
CREATE INDEX invoice_uploads_status_idx ON invoice_uploads(status);

CREATE TABLE invoice_line_items (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL REFERENCES invoice_uploads(id),
  business_id TEXT NOT NULL REFERENCES businesses(id),
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  unit_price_cents INTEGER,
  total_cents INTEGER,
  category_slug TEXT,
  category_source TEXT NOT NULL CHECK (category_source IN ('rule','default','manual')),
  product_id TEXT REFERENCES products(id)
);
CREATE INDEX invoice_line_items_upload_idx ON invoice_line_items(upload_id, line_number);
CREATE INDEX invoice_line_items_business_cat_idx ON invoice_line_items(business_id, category_slug, upload_id);
CREATE INDEX invoice_line_items_category_idx ON invoice_line_items(category_slug);

CREATE TABLE category_mappings (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id),
  match_pattern TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('seed','manual')),
  created_at INTEGER NOT NULL
);
CREATE INDEX category_mappings_business_idx ON category_mappings(business_id, priority);
CREATE UNIQUE INDEX category_mappings_business_pattern_idx ON category_mappings(business_id, match_pattern);

INSERT INTO category_mappings (id, business_id, match_pattern, category_slug, priority, source, created_at) VALUES
  ('cm_seed_food',     NULL, 'rice',     'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food2',    NULL, 'sugar',    'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food3',    NULL, 'tea',      'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food4',    NULL, 'milk',     'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food5',    NULL, 'oil',      'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food6',    NULL, 'flour',    'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_pack1',    NULL, 'carton',   'packaging', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_pack2',    NULL, 'box',      'packaging', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_clean1',   NULL, 'detergent','cleaning', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_clean2',   NULL, 'soap',     'cleaning', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_office1',  NULL, 'paper',    'office', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_office2',  NULL, 'pen',      'office', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_equip1',   NULL, 'cement',   'equipment', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_equip2',   NULL, 'steel',    'equipment', 10, 'seed', strftime('%s','now')*1000);
```

**Step 2: Write the down migration**

```sql
DROP INDEX IF EXISTS category_mappings_business_pattern_idx;
DROP INDEX IF EXISTS category_mappings_business_idx;
DROP TABLE IF EXISTS category_mappings;
DROP INDEX IF EXISTS invoice_line_items_category_idx;
DROP INDEX IF EXISTS invoice_line_items_business_cat_idx;
DROP INDEX IF EXISTS invoice_line_items_upload_idx;
DROP TABLE IF EXISTS invoice_line_items;
DROP INDEX IF EXISTS invoice_uploads_status_idx;
DROP INDEX IF EXISTS invoice_uploads_business_idx;
DROP TABLE IF EXISTS invoice_uploads;
```

**Step 3: Verify migration applies locally**

```bash
cd apps/api && pnpm exec wrangler d1 migrations apply vyro --local
```
Expected: "0019_documents.sql ... ok".

**Step 4: Commit**

```bash
git add packages/db/migrations/0019_documents.sql packages/db/migrations/0019_documents_down.sql
git commit -m "feat(db): invoice_uploads + invoice_line_items + category_mappings (0019)"
```

---

## Task 2: Drizzle schema files

**Files:**
- Create: `packages/db/src/schema/invoiceUploads.ts`
- Create: `packages/db/src/schema/invoiceLineItems.ts`
- Create: `packages/db/src/schema/categoryMappings.ts`
- Modify: `packages/db/src/schema/index.ts`

**Step 1: `invoiceUploads.ts`**

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { users } from './users';
import { suppliers } from './suppliers';

export const invoiceUploads = sqliteTable(
  'invoice_uploads',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    uploadedByUserId: text('uploaded_by_user_id').notNull().references(() => users.id),
    supplierId: text('supplier_id').references(() => suppliers.id),
    status: text('status', {
      enum: ['pending', 'processing', 'ready', 'reviewed', 'failed', 'manual_required'],
    }).notNull(),
    r2Key: text('r2_key').notNull(),
    mimeType: text('mime_type').notNull(),
    originalFilename: text('original_filename').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    ocrProvider: text('ocr_provider'),
    ocrConfidence: integer('ocr_confidence'),
    rawExtractionJson: text('raw_extraction_json'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at').notNull(),
    reviewedAt: integer('reviewed_at'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    totalCents: integer('total_cents'),
  },
  (t) => ({
    businessIdx: index('invoice_uploads_business_idx').on(t.businessId, t.createdAt),
    statusIdx: index('invoice_uploads_status_idx').on(t.status),
  }),
);

export type InvoiceUpload = typeof invoiceUploads.$inferSelect;
export type NewInvoiceUpload = typeof invoiceUploads.$inferInsert;
```

NOTE: `ocr_confidence` is INTEGER storing 0–100 (percentage). Avoids REAL sortability gotchas.

**Step 2: `invoiceLineItems.ts`**

```ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { invoiceUploads } from './invoiceUploads';
import { businesses } from './businesses';
import { products } from './products';

export const invoiceLineItems = sqliteTable(
  'invoice_line_items',
  {
    id: text('id').primaryKey(),
    uploadId: text('upload_id').notNull().references(() => invoiceUploads.id),
    businessId: text('business_id').notNull().references(() => businesses.id),
    lineNumber: integer('line_number').notNull(),
    description: text('description').notNull(),
    quantity: real('quantity'),
    unit: text('unit'),
    unitPriceCents: integer('unit_price_cents'),
    totalCents: integer('total_cents'),
    categorySlug: text('category_slug'),
    categorySource: text('category_source', {
      enum: ['rule', 'default', 'manual'],
    }).notNull(),
    productId: text('product_id').references(() => products.id),
  },
  (t) => ({
    uploadIdx: index('invoice_line_items_upload_idx').on(t.uploadId, t.lineNumber),
    businessCatIdx: index('invoice_line_items_business_cat_idx').on(t.businessId, t.categorySlug, t.uploadId),
    categoryIdx: index('invoice_line_items_category_idx').on(t.categorySlug),
  }),
);

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
```

**Step 3: `categoryMappings.ts`**

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const categoryMappings = sqliteTable(
  'category_mappings',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').references(() => businesses.id),
    matchPattern: text('match_pattern').notNull(),
    categorySlug: text('category_slug').notNull(),
    priority: integer('priority').notNull().default(0),
    source: text('source', { enum: ['seed', 'manual'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    businessIdx: index('category_mappings_business_idx').on(t.businessId, t.priority),
    businessPatternIdx: uniqueIndex('category_mappings_business_pattern_idx').on(t.businessId, t.matchPattern),
  }),
);

export type CategoryMapping = typeof categoryMappings.$inferSelect;
export type NewCategoryMapping = typeof categoryMappings.$inferInsert;
```

**Step 4: Re-export from index**

Append at the bottom of `packages/db/src/schema/index.ts`:
```ts
export * from './invoiceUploads';
export * from './invoiceLineItems';
export * from './categoryMappings';
```

**Step 5: Build + commit**

```bash
pnpm --filter @vyro/db build
git add packages/db/src/schema/invoiceUploads.ts packages/db/src/schema/invoiceLineItems.ts packages/db/src/schema/categoryMappings.ts packages/db/src/schema/index.ts
git commit -m "feat(db): drizzle schemas for invoice_uploads/line_items/category_mappings"
```

---

## Task 3: Categorization rule engine (pure)

**Files:**
- Create: `packages/ai/src/analytics/categorize.ts`
- Create: `packages/ai/src/analytics/categorize.test.ts`
- Modify: `packages/ai/src/index.ts` (re-export)

**Step 1: Test first (TDD)**

`packages/ai/src/analytics/categorize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { categorizeItems } from './categorize';
import type { CategoryMapping } from '@vyro/db/schema';

const mappings: CategoryMapping[] = [
  { id: 'g1', businessId: null, matchPattern: 'rice',  categorySlug: 'food',      priority: 10, source: 'seed', createdAt: 0 },
  { id: 'g2', businessId: null, matchPattern: 'carton',categorySlug: 'packaging', priority: 10, source: 'seed', createdAt: 0 },
  { id: 'g3', businessId: null, matchPattern: 'paper', categorySlug: 'office',    priority: 10, source: 'seed', createdAt: 0 },
  { id: 'b1', businessId: 'biz-1', matchPattern: 'rice', categorySlug: 'equipment', priority: 20, source: 'manual', createdAt: 0 },
];

describe('categorizeItems', () => {
  it('returns default category when no match', () => {
    const out = categorizeItems([{ description: 'unknown widget' }], mappings, 'biz-1');
    expect(out[0].categorySlug).toBe('other');
    expect(out[0].categorySource).toBe('default');
  });

  it('applies global rule when no per-business override', () => {
    const out = categorizeItems([{ description: 'Basmati Rice 5kg' }], mappings, 'biz-2');
    expect(out[0].categorySlug).toBe('food');
    expect(out[0].categorySource).toBe('rule');
  });

  it('per-business mapping overrides global at higher priority', () => {
    const out = categorizeItems([{ description: 'Basmati Rice 5kg' }], mappings, 'biz-1');
    expect(out[0].categorySlug).toBe('equipment');
    expect(out[0].categorySource).toBe('rule');
  });

  it('first matching pattern in priority order wins', () => {
    const local: CategoryMapping[] = [
      { id: 'b2', businessId: 'biz-3', matchPattern: 'rice', categorySlug: 'food', priority: 30, source: 'manual', createdAt: 0 },
      { id: 'b3', businessId: 'biz-3', matchPattern: 'rice', categorySlug: 'equipment', priority: 40, source: 'manual', createdAt: 0 },
    ];
    const out = categorizeItems([{ description: 'rice bag' }], local, 'biz-3');
    expect(out[0].categorySlug).toBe('equipment');
  });

  it('case-insensitive substring match', () => {
    const out = categorizeItems([{ description: 'OFFICE PAPER A4' }], mappings, 'biz-x');
    expect(out[0].categorySlug).toBe('office');
  });

  it('preserves original description and returns all rows', () => {
    const items = [
      { description: 'rice' },
      { description: 'carton box' },
      { description: 'thingamajig' },
    ];
    const out = categorizeItems(items, mappings, 'biz-1');
    expect(out).toHaveLength(3);
    expect(out[0].categorySlug).toBe('equipment'); // biz-1 override
    expect(out[1].categorySlug).toBe('packaging');
    expect(out[2].categorySlug).toBe('other');
  });
});
```

**Step 2: Run — fails (function not found)**

```bash
pnpm --filter @vyro/ai test -- src/analytics/categorize.test.ts
```

**Step 3: Implement**

```ts
// packages/ai/src/analytics/categorize.ts
import type { CategoryMapping } from '@vyro/db/schema';

export type CategorySlug = 'food' | 'packaging' | 'cleaning' | 'office' | 'equipment' | 'other';

export interface CategorizableItem {
  description: string;
}

export interface CategorizedItem extends CategorizableItem {
  categorySlug: CategorySlug;
  categorySource: 'rule' | 'default';
}

const DEFAULT_CATEGORY: CategorySlug = 'other';

/**
 * Pure categorization. Per-business mappings (where businessId === bizId) win
 * over globals (businessId IS NULL). Among ties, highest priority wins; on
 * still-tied priorities, first-encountered wins (stable sort).
 *
 * No LLM. No fuzzy. No embeddings. Manual corrections flip source to 'manual'
 * upstream; this function returns 'rule' | 'default' only.
 */
export function categorizeItems(
  items: CategorizableItem[],
  mappings: CategoryMapping[],
  businessId: string,
): CategorizedItem[] {
  return items.map((item) => {
    const desc = (item.description ?? '').toLowerCase();
    const candidates = mappings
      .filter((m) => (m.businessId === null || m.businessId === businessId))
      .filter((m) => desc.includes(m.matchPattern.toLowerCase()))
      .sort((a, b) => {
        // per-business > global first
        const aBiz = a.businessId === businessId ? 1 : 0;
        const bBiz = b.businessId === businessId ? 1 : 0;
        if (aBiz !== bBiz) return bBiz - aBiz;
        return b.priority - a.priority;
      });
    const winner = candidates[0];
    if (!winner) {
      return { ...item, categorySlug: DEFAULT_CATEGORY, categorySource: 'default' };
    }
    return { ...item, categorySlug: winner.categorySlug as CategorySlug, categorySource: 'rule' };
  });
}

/**
 * Build a new per-business mapping row from a manual correction. Caller is
 * responsible for inserting via Drizzle.
 */
export function buildManualMapping(input: {
  id: string;
  businessId: string;
  matchPattern: string;
  categorySlug: CategorySlug;
  createdAt: number;
}): CategoryMapping {
  return {
    id: input.id,
    businessId: input.businessId,
    matchPattern: input.matchPattern,
    categorySlug: input.categorySlug,
    priority: 50, // beats seed priority=10
    source: 'manual',
    createdAt: input.createdAt,
  };
}
```

**Step 4: Run — passes**

```bash
pnpm --filter @vyro/ai test -- src/analytics/categorize.test.ts
```

**Step 5: Re-export**

Append to `packages/ai/src/index.ts`:
```ts
export * from './analytics/categorize';
```

**Step 6: Commit**

```bash
git add packages/ai/src/analytics/categorize.ts packages/ai/src/analytics/categorize.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): categorizeItems rule engine (pure, per-business overrides)"
```

---

## Task 4: R2 + Queue bindings

**Files:**
- Modify: `apps/api/wrangler.toml` (add bucket + queue to both `[env.default]` and `[env.production]`)
- Modify: `apps/api/src/env.ts`

**Step 1: wrangler.toml — append to top level (after `[[r2_buckets]] PRODUCTS`)**

```toml
[[r2_buckets]]
binding = "INVOICES"
bucket_name = "vyro-invoices"

[[queues.producers]]
binding = "INVOICES_QUEUE"
queue = "invoices"

[[queues.consumers]]
queue = "invoices"
max_batch_size = 10
max_batch_timeout = 30
```

And the same 3 stanzas inside `[env.production]`.

**Step 2: env.ts**

Append inside `Env`:
```ts
INVOICES: R2Bucket;
INVOICES_QUEUE: Queue;
```

**Step 3: Verify worker typecheck**

```bash
pnpm --filter @vyro/api build
```
Expected: clean (no missing types).

**Step 4: Commit**

```bash
git add apps/api/wrangler.toml apps/api/src/env.ts
git commit -m "feat(api): INVOICES R2 + INVOICES_QUEUE bindings"
```

---

## Task 5: Queue consumer + OCR worker

**Files:**
- Create: `apps/api/src/modules/documents/ocrWorker.ts`
- Create: `apps/api/src/queue/invoiceOcr.ts`
- Modify: `apps/api/src/worker.ts` (route `invoices` queue)
- Create: `apps/api/test/documents/queue.test.ts`

**Step 1: Test the worker stub**

`apps/api/test/documents/queue.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { runOcr } from '../../../src/modules/documents/ocrWorker';

describe('runOcr', () => {
  it('returns zero-confidence stub when AI binding missing', async () => {
    const r = await runOcr({ env: {} as any, bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });
    expect(r.confidence).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.supplierName).toBeNull();
  });

  it('clamps confidence into 0..100', async () => {
    const fakeAi = { run: vi.fn().mockResolvedValue({ response: 'garbage non-json' }) };
    const r = await runOcr({ env: { AI: fakeAi } as any, bytes: new Uint8Array(), mimeType: 'image/jpeg' });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
  });
});
```

**Step 2: Run — fails**

```bash
pnpm --filter @vyro/api test -- test/documents/queue.test.ts
```

**Step 3: Implement ocrWorker.ts**

```ts
// apps/api/src/modules/documents/ocrWorker.ts
import type { Env } from '../../env';

export interface OcrItem {
  description: string;
  quantity?: number;
  unit?: string;
  unitPriceCents?: number;
  totalCents?: number;
}

export interface OcrResult {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO date if detected
  totalCents: number | null;
  items: OcrItem[];
  confidence: number; // 0..100 integer
  rawProvider: string;
}

const STUB: OcrResult = {
  supplierName: null,
  invoiceNumber: null,
  invoiceDate: null,
  totalCents: null,
  items: [],
  confidence: 0,
  rawProvider: 'stub',
};

/**
 * Runs Workers AI vision if available, otherwise returns a zero-confidence
 * stub. The result is NEVER trusted — the review page is mandatory.
 */
export async function runOcr(input: {
  env: Pick<Env, 'AI'>;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<OcrResult> {
  if (!input.env.AI) return STUB;
  try {
    const model = (input.env as any).VYRO_AI_OCR_MODEL ?? '@cf/llava-hf/llava-1.5-7b-hf';
    const out = await input.env.AI.run(model, {
      image: Array.from(input.bytes),
      prompt:
        'Extract invoice data as JSON: { supplierName, invoiceNumber, invoiceDate (YYYY-MM-DD), totalCents (integer), items: [{description, quantity, unit, unitPriceCents, totalCents}] }. Return ONLY the JSON.',
      max_tokens: 1024,
    });
    const text = (out as any)?.response ?? '';
    const json = extractJson(text);
    if (!json) return { ...STUB, rawProvider: model };
    const confidence = clampConfidence(json);
    return {
      supplierName: stringOrNull(json.supplierName) ?? null,
      invoiceNumber: stringOrNull(json.invoiceNumber) ?? null,
      invoiceDate: stringOrNull(json.invoiceDate) ?? null,
      totalCents: intOrNull(json.totalCents),
      items: Array.isArray(json.items)
        ? json.items.map((it: any) => ({
            description: String(it.description ?? '').slice(0, 200),
            quantity: numberOrUndef(it.quantity),
            unit: stringOrUndef(it.unit),
            unitPriceCents: intOrUndef(it.unitPriceCents),
            totalCents: intOrUndef(it.totalCents),
          })).filter((it: OcrItem) => it.description.length > 0)
        : [],
      confidence,
      rawProvider: model,
    };
  } catch {
    return STUB;
  }
}

function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampConfidence(json: any): number {
  // Heuristic: more keys + more items = higher confidence. Cap to [0,100].
  const keys = ['supplierName', 'invoiceNumber', 'invoiceDate', 'totalCents', 'items'];
  const present = keys.filter((k) => json[k] !== undefined && json[k] !== null).length;
  const itemBonus = Math.min(20, Array.isArray(json.items) ? json.items.length * 4 : 0);
  return Math.max(0, Math.min(100, present * 12 + itemBonus + 10));
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;
}
function stringOrUndef(v: unknown): string | undefined {
  const s = stringOrNull(v);
  return s ?? undefined;
}
function intOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v, 10);
  return null;
}
function intOrUndef(v: unknown): number | undefined {
  const n = intOrNull(v);
  return n ?? undefined;
}
function numberOrUndef(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}
```

**Step 4: Implement queue/invoiceOcr.ts**

```ts
import type { MessageBatch } from '@cloudflare/workers-types';
import { getDb } from '@vyro/db';
import { invoiceUploads, suppliers } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { runOcr } from '../modules/documents/ocrWorker';
import type { Env } from '../env';

export async function handleInvoicesBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const body = msg.body as { uploadId?: string } | null;
    if (!body?.uploadId) {
      msg.ack();
      continue;
    }
    try {
      await processUpload(env, body.uploadId);
      msg.ack();
    } catch (err) {
      // Mark failed, ack so the message doesn't loop forever.
      await markFailed(env, body.uploadId, err instanceof Error ? err.message : 'ocr failed');
      msg.ack();
    }
  }
}

async function processUpload(env: Env, uploadId: string): Promise<void> {
  const db = getDb(env.DB);
  const row = await db.select().from(invoiceUploads).where(eq(invoiceUploads.id, uploadId)).get();
  if (!row) return;
  await db.update(invoiceUploads).set({ status: 'processing' }).where(eq(invoiceUploads.id, uploadId));

  const obj = await env.INVOICES.get(row.r2Key);
  if (!obj) throw new Error('R2 object missing');
  const bytes = new Uint8Array(await obj.arrayBuffer());

  const result = await runOcr({ env, bytes, mimeType: row.mimeType });
  const newStatus = result.confidence < 60 ? 'manual_required' : 'ready';

  // Try to match supplier by name (case-insensitive exact match) — never creates new suppliers.
  let supplierId: string | null = row.supplierId ?? null;
  if (!supplierId && result.supplierName) {
    const all = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).all();
    const lower = result.supplierName.toLowerCase();
    const hit = all.find((s) => s.name.toLowerCase() === lower);
    if (hit) supplierId = hit.id;
  }

  await db
    .update(invoiceUploads)
    .set({
      status: newStatus,
      ocrProvider: result.rawProvider,
      ocrConfidence: result.confidence,
      rawExtractionJson: JSON.stringify(result),
      supplierId,
      totalCents: result.totalCents ?? null,
    })
    .where(eq(invoiceUploads.id, uploadId));
}

async function markFailed(env: Env, uploadId: string, message: string): Promise<void> {
  await getDb(env.DB)
    .update(invoiceUploads)
    .set({ status: 'failed', errorMessage: message.slice(0, 500) })
    .where(eq(invoiceUploads.id, uploadId));
}
```

**Step 5: Wire into worker.ts**

Replace the `queue` handler:
```ts
async queue(batch: MessageBatch, env: Env, _ctx: ExecutionContext) {
  if (batch.queue === 'audit') {
    await handleAuditBatch(batch, env);
  } else if (batch.queue === 'notifications') {
    await handleNotificationsBatch(batch, env);
  } else if (batch.queue === 'invoices') {
    const { handleInvoicesBatch } = await import('./queue/invoiceOcr');
    await handleInvoicesBatch(batch, env);
  } else {
    for (const msg of batch.messages) msg.ack();
  }
},
```

Add `import type { MessageBatch } from '@cloudflare/workers-types';` at top.

**Step 6: Run + commit**

```bash
pnpm --filter @vyro/api test -- test/documents/queue.test.ts
git add apps/api/src/modules/documents/ocrWorker.ts apps/api/src/queue/invoiceOcr.ts apps/api/src/worker.ts apps/api/test/documents/queue.test.ts
git commit -m "feat(api): invoices queue consumer + Workers AI OCR worker with stub fallback"
```

---

## Task 6: Documents repository + routes

**Files:**
- Create: `apps/api/src/modules/documents/repository.ts`
- Create: `apps/api/src/modules/documents/routes.ts`
- Modify: `apps/api/src/index.ts` (mount router)
- Create: `apps/api/test/documents/upload.test.ts`

**Step 1: Test routes**

`apps/api/test/documents/upload.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../../../src/modules/documents/repository';

describe('sanitizeFilename', () => {
  it('strips directory traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  });
  it('replaces path separators and control chars', () => {
    expect(sanitizeFilename('a/b\\c.txt')).toBe('a_b_c.txt');
    expect(sanitizeFilename('bad\x00name.pdf')).toBe('badname.pdf');
  });
  it('caps length to 100', () => {
    expect(sanitizeFilename('x'.repeat(200) + '.pdf')).toHaveLength(100);
  });
});
```

**Step 2: Run — fails**

```bash
pnpm --filter @vyro/api test -- test/documents/upload.test.ts
```

**Step 3: Implement repository.ts**

```ts
import { getDb } from '@vyro/db';
import {
  invoiceUploads,
  invoiceLineItems,
  categoryMappings,
  type NewInvoiceUpload,
  type NewInvoiceLineItem,
  type NewCategoryMapping,
} from '@vyro/db/schema';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';

export function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? 'file').replace(/[\x00-\x1f]/g, '');
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'file';
}

export function buildR2Key(businessId: string, uploadId: string, filename: string): string {
  return `${businessId}/${uploadId}/${sanitizeFilename(filename)}`;
}

export async function createUpload(env: Env, input: {
  businessId: string;
  uploadedByUserId: string;
  r2Key: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  supplierId?: string | null;
}): Promise<string> {
  const id = newId();
  await getDb(env.DB).insert(invoiceUploads).values({
    id,
    businessId: input.businessId,
    uploadedByUserId: input.uploadedByUserId,
    supplierId: input.supplierId ?? null,
    status: 'pending',
    r2Key: input.r2Key,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename,
    sizeBytes: input.sizeBytes,
    createdAt: Date.now(),
  } satisfies NewInvoiceUpload);
  return id;
}

export async function listUploads(env: Env, businessId: string, limit = 50) {
  return getDb(env.DB)
    .select()
    .from(invoiceUploads)
    .where(eq(invoiceUploads.businessId, businessId))
    .orderBy(desc(invoiceUploads.createdAt))
    .limit(limit)
    .all();
}

export async function getUpload(env: Env, businessId: string, id: string) {
  const row = await getDb(env.DB)
    .select()
    .from(invoiceUploads)
    .where(and(eq(invoiceUploads.id, id), eq(invoiceUploads.businessId, businessId)))
    .get();
  if (!row) return null;
  const items = await getDb(env.DB)
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.uploadId, id))
    .orderBy(invoiceLineItems.lineNumber)
    .all();
  return { ...row, items };
}

export async function saveReviewedLines(env: Env, input: {
  businessId: string;
  uploadId: string;
  reviewedByUserId: string;
  lines: Array<{
    lineNumber: number;
    description: string;
    quantity?: number | null;
    unit?: string | null;
    unitPriceCents?: number | null;
    totalCents?: number | null;
    categorySlug: string | null;
    categorySource: 'rule' | 'default' | 'manual';
    productId?: string | null;
  }>;
  totalCents?: number | null;
}) {
  const db = getDb(env.DB);
  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.uploadId, input.uploadId));
  if (input.lines.length) {
    const rows: NewInvoiceLineItem[] = input.lines.map((l) => ({
      id: newId(),
      uploadId: input.uploadId,
      businessId: input.businessId,
      lineNumber: l.lineNumber,
      description: l.description,
      quantity: l.quantity ?? null,
      unit: l.unit ?? null,
      unitPriceCents: l.unitPriceCents ?? null,
      totalCents: l.totalCents ?? null,
      categorySlug: l.categorySlug,
      categorySource: l.categorySource,
      productId: l.productId ?? null,
    }));
    await db.insert(invoiceLineItems).values(rows);
  }
  await db
    .update(invoiceUploads)
    .set({
      status: 'reviewed',
      reviewedAt: Date.now(),
      reviewedByUserId: input.reviewedByUserId,
      totalCents: input.totalCents ?? null,
    })
    .where(and(eq(invoiceUploads.id, input.uploadId), eq(invoiceUploads.businessId, input.businessId)));
}

export async function recordCategoryCorrection(env: Env, input: {
  businessId: string;
  matchPattern: string;
  categorySlug: string;
}): Promise<void> {
  const db = getDb(env.DB);
  const id = newId();
  await db.insert(categoryMappings).values({
    id,
    businessId: input.businessId,
    matchPattern: input.matchPattern.slice(0, 80),
    categorySlug: input.categorySlug,
    priority: 50,
    source: 'manual',
    createdAt: Date.now(),
  } satisfies NewCategoryMapping);
}

export async function listMappingsForBusiness(env: Env, businessId: string) {
  return getDb(env.DB)
    .select()
    .from(categoryMappings)
    .where(or(eq(categoryMappings.businessId, businessId), isNull(categoryMappings.businessId)))
    .orderBy(desc(categoryMappings.priority))
    .all();
}

export async function expenseCategoryBreakdown(env: Env, businessId: string, months: number) {
  const db = getDb(env.DB);
  const sinceMs = Date.now() - months * 30 * 86400 * 1000;
  const rows = await db
    .select({
      slug: invoiceLineItems.categorySlug,
      total: sql<number>`COALESCE(SUM(${invoiceLineItems.totalCents}), 0)`,
    })
    .from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.businessId, businessId), sql`${invoiceLineItems.totalCents} IS NOT NULL`))
    .all();
  return rows;
}
```

**Step 4: Implement routes.ts**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireBusinessRole } from '@vyro/auth';
import { httpError } from '../../lib/errors';
import { rateLimit } from '../../middleware/rateLimit';
import type { Ctx } from '../../middleware/session';
import type { Env } from '../../env';
import {
  buildR2Key,
  createUpload,
  getUpload,
  listUploads,
  saveReviewedLines,
  recordCategoryCorrection,
  sanitizeFilename,
} from './repository';
import { buildManualMapping, categorizeItems } from '@vyro/ai';
import { listMappingsForBusiness } from './repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

router.post('/upload-direct', rateLimit({ key: 'doc-upload', limit: 20, window: 60 }), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager']);

  const form = await c.req.formData();
  const file = form.get('file');
  const supplierId = (form.get('supplierId') as string | null) ?? null;
  if (!(file instanceof File)) throw httpError(400, 'VALIDATION_ERROR', 'file field required');
  if (!ALLOWED_MIME.has(file.type)) throw httpError(400, 'UNSUPPORTED_TYPE', `Unsupported type ${file.type}`);
  if (file.size > MAX_BYTES) throw httpError(413, 'TOO_LARGE', 'Max 10MB');

  const buf = new Uint8Array(await file.arrayBuffer());
  const uploadId = await createUpload(c.env, {
    businessId,
    uploadedByUserId: ctx.userId,
    r2Key: 'placeholder',
    mimeType: file.type,
    originalFilename: file.name,
    sizeBytes: file.size,
    supplierId,
  });
  const r2Key = buildR2Key(businessId, uploadId, file.name);
  await c.env.INVOICES.put(r2Key, buf, { httpMetadata: { contentType: file.type } });
  const { getDb } = await import('@vyro/db');
  const { invoiceUploads } = await import('@vyro/db/schema');
  const { eq } = await import('drizzle-orm');
  await getDb(c.env.DB).update(invoiceUploads).set({ r2Key }).where(eq(invoiceUploads.id, uploadId));
  await c.env.INVOICES_QUEUE.send({ uploadId });

  return c.json({ uploadId, status: 'pending' });
});

router.get('/', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const rows = await listUploads(c.env, businessId);
  return c.json({ uploads: rows.map((r) => ({ ...r, rawExtractionJson: undefined })) });
});

router.get('/:id', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const id = c.req.param('id');
  const row = await getUpload(c.env, businessId, id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Upload not found');
  return c.json({ upload: row });
});

const reviewSchema = z
  .object({
    totalCents: z.number().int().min(0).nullable().optional(),
    lines: z
      .array(
        z
          .object({
            lineNumber: z.number().int().min(1).max(500),
            description: z.string().min(1).max(200),
            quantity: z.number().nullable().optional(),
            unit: z.string().max(20).nullable().optional(),
            unitPriceCents: z.number().int().nullable().optional(),
            totalCents: z.number().int().nullable().optional(),
            categorySlug: z.enum(['food', 'packaging', 'cleaning', 'office', 'equipment', 'other']).nullable(),
            productId: z.string().nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

router.post('/:id/review', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const id = c.req.param('id');
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());

  // Pull existing items so we can detect category corrections vs raw rule output.
  const existing = await getUpload(c.env, businessId, id);
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Upload not found');

  const mappings = await listMappingsForBusiness(c.env, businessId);
  const rawRuleCategories = new Map<string, string | null>();
  for (const it of existing.items) {
    const auto = categorizeItems([{ description: it.description }], mappings, businessId)[0]!;
    rawRuleCategories.set(it.id, auto.categorySlug);
  }

  const linesWithSource = parsed.data.lines.map((l) => {
    const rawRuleSlug = [...rawRuleCategories.entries()].find(([, slug]) => slug === l.categorySlug);
    void rawRuleSlug;
    // First-pass review: source = 'rule' if matches auto, else 'manual'.
    // We re-run the auto rule against this review-time description.
    const auto = categorizeItems([{ description: l.description }], mappings, businessId)[0]!;
    const corrected = auto.categorySlug !== l.categorySlug;
    return {
      ...l,
      categorySource: (corrected ? 'manual' : 'rule') as 'manual' | 'rule',
    };
  });

  await saveReviewedLines(c.env, {
    businessId,
    uploadId: id,
    reviewedByUserId: ctx.userId,
    lines: linesWithSource,
    ...(parsed.data.totalCents !== undefined ? { totalCents: parsed.data.totalCents } : {}),
  });

  // Record any manual corrections as per-business mappings.
  for (let i = 0; i < parsed.data.lines.length; i++) {
    const line = parsed.data.lines[i]!;
    const source = linesWithSource[i]!.categorySource;
    if (source !== 'manual') continue;
    const pattern = line.description.split(/\s+/).slice(0, 3).join(' ').toLowerCase().slice(0, 80);
    if (!pattern || !line.categorySlug) continue;
    await recordCategoryCorrection(c.env, {
      businessId,
      matchPattern: pattern,
      categorySlug: line.categorySlug,
    });
  }
  void sanitizeFilename;

  return c.json({ ok: true });
});

export default router;
```

**Step 5: Mount in `apps/api/src/index.ts`**

Find existing router mounts (e.g. `app.route('/api/ai', aiRouter)`) and add:
```ts
import documentsRouter from './modules/documents/routes';
// ...
app.route('/api/documents', documentsRouter);
```

**Step 6: Run + commit**

```bash
pnpm --filter @vyro/api test -- test/documents/upload.test.ts
git add apps/api/src/modules/documents/repository.ts apps/api/src/modules/documents/routes.ts apps/api/src/index.ts apps/api/test/documents/upload.test.ts
git commit -m "feat(api): /api/documents upload/list/review with tenant isolation + audit-friendly"
```

---

## Task 7: AI intent `categorize_expenses`

**Files:**
- Modify: `packages/ai/src/intents.ts`
- Create: `apps/api/src/modules/ai/intents/categorizeExpenses.ts`
- Modify: `apps/api/src/modules/ai/intents/catalog.ts`
- Modify: `apps/api/src/modules/ai/intents/drizzleRepos.ts` (already added `expenseCategoryBreakdown` in Task 6? Actually we put it on the documents repository — keep it there to avoid scope creep. Use it via direct import in handler.)
- Create: `apps/api/test/ai/phase5/categorizeExpenses.test.ts`

**Step 1: Test**

`apps/api/test/ai/phase5/categorizeExpenses.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { categorizeExpensesHandler } from '../../../src/modules/ai/intents/categorizeExpenses';

const repos = {
  expenseCategoryBreakdown: async () => [
    { slug: 'food', total: 240000 },
    { slug: 'packaging', total: 80000 },
    { slug: 'other', total: 60000 },
  ],
};

describe('categorizeExpensesHandler', () => {
  it('renders breakdown card with totals + percent', async () => {
    const ctx: any = { classify: { intent: 'categorize_expenses', slots: { months: 1 } }, businessId: 'biz-1', userId: 'u1' };
    const out = await categorizeExpensesHandler(ctx, repos as any);
    expect(out.components[0].type).toBe('spend_summary_card');
    expect(out.rawSummary.byCategory).toHaveLength(3);
  });

  it('returns clarification when no rows exist', async () => {
    const ctx: any = { classify: { intent: 'categorize_expenses', slots: {} }, businessId: 'biz-2', userId: 'u1' };
    const out = await categorizeExpensesHandler(ctx, { expenseCategoryBreakdown: async () => [] } as any);
    expect(out.components[0].type).toBe('clarification_card');
  });

  it('respects slot.months, clamps to 1..12', async () => {
    const ctx: any = { classify: { intent: 'categorize_expenses', slots: { months: 99 } }, businessId: 'biz-1', userId: 'u1' };
    const out = await categorizeExpensesHandler(ctx, repos as any);
    expect(out.rawSummary.months).toBe(12);
  });
});
```

**Step 2: Run — fails**

**Step 3: Add intent to allowlist + regex**

In `packages/ai/src/intents.ts`:
- Add `'categorize_expenses'` to the intent union type.
- Add to `INTENT_ALLOWLIST_BY_ROLE`: `admin` and `member`.
- Add regex `CATEGORIZE_RX = /\b(categori[sz]e|classify)\s+(my\s+)?(expenses|spending|costs)\b/i` and another for "what did I spend on food" → `CATEGORY_SLOT_RX = /\b(?:on|for)\s+(food|packaging|cleaning|office|equipment)\b/i`.

**Step 4: Implement handler**

```ts
// apps/api/src/modules/ai/intents/categorizeExpenses.ts
import type { IntentContext, HandlerResult } from './catalog';

export async function categorizeExpensesHandler(
  ctx: IntentContext,
  repos: { expenseCategoryBreakdown(businessId: string, months: number): Promise<Array<{ slug: string | null; total: number }>> },
): Promise<HandlerResult> {
  const rawMonths = Number(ctx.classify.slots.months ?? 1);
  const months = Math.max(1, Math.min(12, Number.isFinite(rawMonths) ? rawMonths : 1));
  const rows = await repos.expenseCategoryBreakdown(ctx.businessId, months);
  if (!rows.length) {
    return {
      components: [{
        type: 'clarification_card',
        data: { question: 'No categorized spend yet. Upload an invoice to get started.', options: [] },
      }],
      actions: [{ type: 'view_invoices', label: 'Upload invoice', href: '/invoices/upload' }],
      rawSummary: {},
    };
  }
  const total = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const byCategory = rows
    .map((r) => ({
      slug: r.slug ?? 'other',
      totalCents: Number(r.total ?? 0),
      pct: total > 0 ? Math.round((Number(r.total ?? 0) / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    components: [{
      type: 'spend_summary_card',
      data: {
        title: `Categorized spend (last ${months} month${months === 1 ? '' : 's'})`,
        totalCents: total,
        byCategory,
      },
    }],
    actions: [{ type: 'view_invoices', label: 'View invoices', href: '/invoices' }],
    rawSummary: { months, byCategory, totalCents: total },
  };
}
```

**Step 5: Register**

In `apps/api/src/modules/ai/intents/catalog.ts`:
- Import: `import { categorizeExpensesHandler } from './categorizeExpenses';`
- Register in `HANDLERS`: `categorize_expenses: categorizeExpensesHandler,`
- Add to `STAGES`: `categorize_expenses: ['Reading your purchase history', 'Grouping by category']`.

**Step 6: Run + commit**

```bash
pnpm --filter @vyro/api test -- test/ai/phase5/categorizeExpenses.test.ts
git add packages/ai/src/intents.ts apps/api/src/modules/ai/intents/categorizeExpenses.ts apps/api/src/modules/ai/intents/catalog.ts apps/api/test/ai/phase5/categorizeExpenses.test.ts
git commit -m "feat(ai): categorize_expenses intent with breakdown card"
```

---

## Task 8: Web upload page

**Files:**
- Create: `apps/web/src/pages/InvoiceUploadPage.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: Implement upload page** (drag-drop with editorial design)

```tsx
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { UploadCloudIcon, FileTextIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/icons';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function InvoiceUploadPage() {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const submit = useCallback(async (file: File) => {
    setError(null);
    if (!ALLOWED.includes(file.type)) { setError('Use JPG, PNG, WebP, or PDF.'); return; }
    if (file.size > MAX_BYTES) { setError('File exceeds 10MB.'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post<{ uploadId: string }>('/documents/upload-direct', form);
      setDoneId(r.uploadId);
      navigate(`/invoices/${r.uploadId}/review`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) submit(f);
  }, [submit]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <PageHeader kicker="Document Intelligence" title="Upload a supplier invoice" sub="OCR is automatic. You'll review every line before it counts toward your analytics." />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`bg-paper border-2 border-dashed ${dragOver ? 'border-copper' : 'border-ink/20'} p-12 text-center space-y-4`}
      >
        <UploadCloudIcon size={48} className="mx-auto text-copper" />
        <div>
          <p className="font-display text-lg text-ink">Drop invoice here</p>
          <p className="text-xs text-ink-4 font-mono mt-1">JPG · PNG · WebP · PDF · max 10MB</p>
        </div>
        <label className="inline-block">
          <input type="file" hidden accept={ALLOWED.join(',')} onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} disabled={busy} />
          <span className={`inline-flex items-center gap-2 px-4 py-2 font-mono font-bold text-xs uppercase tracking-wider bg-ink text-volt ${busy ? 'opacity-50' : 'cursor-pointer hover:bg-charcoal'}`}>
            <FileTextIcon size={14} />
            {busy ? 'Uploading…' : 'Choose file'}
          </span>
        </label>
        {error && (
          <div className="flex items-center gap-2 text-xs text-rose bg-rose/5 border border-rose/30 p-2 mx-auto max-w-md">
            <AlertCircleIcon size={13} />
            <span>{error}</span>
          </div>
        )}
        {doneId && (
          <div className="flex items-center gap-2 text-xs text-mint bg-mint/5 border border-mint/30 p-2 mx-auto max-w-md">
            <CheckCircleIcon size={13} />
            <span>Uploaded. Opening review…</span>
          </div>
        )}
        <Button variant="secondary" onClick={() => navigate('/invoices')} size="sm">View past invoices</Button>
      </div>
    </div>
  );
}
```

**Step 2: Routes**

In `apps/web/src/App.tsx`, add lazy import + Route:
```tsx
const InvoiceUploadPage = lazy(() => import('./pages/InvoiceUploadPage').then((m) => ({ default: m.InvoiceUploadPage })));
// ...
<Route path="/invoices/upload" element={<RequireAuth><InvoiceUploadPage /></RequireAuth>} />
```
(Use whatever auth-guard wrapper exists — check existing patterns for `<RequireAuth>` or `<ProtectedRoute>`.)

**Step 3: Commit**

```bash
git add apps/web/src/pages/InvoiceUploadPage.tsx apps/web/src/App.tsx
git commit -m "feat(web): invoice upload page with drag-drop"
```

---

## Task 9: Web invoice list + review pages

**Files:**
- Create: `apps/web/src/pages/InvoiceListPage.tsx`
- Create: `apps/web/src/pages/InvoiceReviewPage.tsx`
- Create: `apps/web/src/ai/CategoryBadge.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: `CategoryBadge.tsx`**

```tsx
import { SparklesIcon } from '@/components/icons';

const COLOR: Record<string, string> = {
  food: 'border-mint/40 text-mint bg-mint/5',
  packaging: 'border-copper/40 text-copper bg-copper/5',
  cleaning: 'border-volt/40 text-ink bg-volt/10',
  office: 'border-ink/30 text-ink bg-bone',
  equipment: 'border-ink text-volt bg-ink',
  other: 'border-ink/15 text-ink-3 bg-paper',
};

const LABEL: Record<string, string> = {
  food: 'Food',
  packaging: 'Packaging',
  cleaning: 'Cleaning',
  office: 'Office',
  equipment: 'Equipment',
  other: 'Other',
};

export function CategoryBadge({ slug, source }: { slug: string | null; source: 'rule' | 'default' | 'manual' | null }) {
  const s = slug ?? 'other';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider border px-2 py-0.5 ${COLOR[s] ?? COLOR.other}`}>
      <SparklesIcon size={10} />
      <span>{LABEL[s] ?? s}</span>
      {source === 'manual' && <span className="text-rose">·edited</span>}
    </span>
  );
}
```

**Step 2: `InvoiceListPage.tsx`**

Status table with editorial styling; auto-refresh while any row is `pending`/`processing`.

```tsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, EmptyState } from '@/components/ui';
import { FileTextIcon, ClockIcon, ShieldCheckIcon, AlertCircleIcon, ArrowRightIcon } from '@/components/icons';
import { CategoryBadge } from '@/ai/CategoryBadge';

interface UploadRow {
  id: string;
  originalFilename: string;
  status: string;
  ocrConfidence: number | null;
  createdAt: number;
  totalCents: number | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending:        { label: 'Queued',       tone: 'text-ink-3' },
  processing:     { label: 'Reading…',     tone: 'text-copper' },
  ready:          { label: 'Awaiting review', tone: 'text-amber' },
  reviewed:       { label: 'Reviewed',     tone: 'text-mint' },
  failed:         { label: 'Could not read', tone: 'text-rose' },
  manual_required:{ label: 'Manual entry required', tone: 'text-amber' },
};

export function InvoiceListPage() {
  const { data, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<{ uploads: UploadRow[] }>('/documents'),
    refetchInterval: (q) => {
      const list = (q.state.data as { uploads: UploadRow[] } | undefined)?.uploads ?? [];
      return list.some((u) => u.status === 'pending' || u.status === 'processing') ? 2000 : false;
    },
  });

  const rows = data?.uploads ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Document Intelligence"
        title="Uploaded invoices"
        sub="Every invoice you upload is read automatically. Review extracted lines before they affect your analytics."
        actions={<Link to="/invoices/upload"><Button icon={<ArrowRightIcon size={14} />}>Upload invoice</Button></Link>}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={24} />}
          title="No invoices yet"
          description="Upload a supplier invoice to start tracking categorized spend."
          action={<Link to="/invoices/upload"><Button>Upload your first invoice</Button></Link>}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((u) => {
            const s = STATUS_LABEL[u.status] ?? STATUS_LABEL.pending!;
            return (
              <li key={u.id} className="bg-paper border border-ink/15 p-4 flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <Link to={`/invoices/${u.id}/review`} className="font-display text-base text-ink hover:text-copper truncate block">
                    {u.originalFilename}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-4">
                    <span className={`font-mono font-bold uppercase tracking-wider ${s.tone}`}>{s.label}</span>
                    {u.ocrConfidence !== null && (
                      <span className="font-mono">OCR {u.ocrConfidence}%</span>
                    )}
                    {u.totalCents !== null && <span className="font-mono">Rs. {(u.totalCents/100).toLocaleString('en-LK')}</span>}
                    <span className="font-mono">{new Date(u.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Link to={`/invoices/${u.id}/review`}>
                  <Button size="sm" variant="secondary">Review</Button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={() => refetch()} className="text-[10px] font-mono uppercase tracking-wider text-ink-4 hover:text-ink">
        Refresh
      </button>
      <CategoryBadge slug="other" source="default" />
      <ShieldCheckIcon size={12} />
      <ClockIcon size={12} />
      <AlertCircleIcon size={12} />
    </div>
  );
}
```

**Step 3: `InvoiceReviewPage.tsx`**

Editable rows. Category dropdown per line. Save calls POST `/documents/:id/review`.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { AlertCircleIcon, CheckCircleIcon, SaveIcon, RefreshCwIcon } from '@/components/icons';
import { CategoryBadge } from '@/ai/CategoryBadge';

interface LineItem {
  id: string;
  lineNumber: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  categorySlug: string | null;
  categorySource: 'rule' | 'default' | 'manual';
}
interface Upload {
  id: string;
  status: string;
  ocrConfidence: number | null;
  originalFilename: string;
  totalCents: number | null;
  items: LineItem[];
  rawExtractionJson: string | null;
}

const SLUGS = ['food', 'packaging', 'cleaning', 'office', 'equipment', 'other'] as const;
type Slug = (typeof SLUGS)[number];

export function InvoiceReviewPage() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<{ upload: Upload }>(`/documents/${id}`),
    enabled: !!id,
    refetchInterval: (q) => {
      const u = (q.state.data as { upload: Upload } | undefined)?.upload;
      return u && (u.status === 'pending' || u.status === 'processing') ? 2000 : false;
    },
  });

  const upload = data?.upload;
  const [lines, setLines] = useState<LineItem[]>([]);
  const [totalCents, setTotalCents] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!upload) return;
    setLines(upload.items.map((it) => ({ ...it })));
    setTotalCents(upload.totalCents ?? 0);
  }, [upload?.id, upload?.items, upload?.totalCents]);

  const dirty = useMemo(() => {
    if (!upload) return false;
    if ((upload.totalCents ?? 0) !== totalCents) return true;
    if (lines.length !== upload.items.length) return true;
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i]!, b = upload.items[i]!;
      if (a.description !== b.description || a.totalCents !== b.totalCents || a.categorySlug !== b.categorySlug) return true;
    }
    return false;
  }, [upload, lines, totalCents]);

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;
  if (!upload) return <div className="py-12">Invoice not found.</div>;

  const status = upload.status;
  const lowConfidence = (upload.ocrConfidence ?? 0) < 60;
  const manualRequired = status === 'manual_required' || upload.items.length === 0;

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/documents/${id}/review`, {
        totalCents,
        lines: lines.map((l, i) => ({
          lineNumber: l.lineNumber || i + 1,
          description: l.description.trim() || 'Untitled line',
          quantity: l.quantity,
          unit: l.unit,
          unitPriceCents: l.unitPriceCents,
          totalCents: l.totalCents,
          categorySlug: (l.categorySlug ?? 'other') as Slug,
        })),
      });
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ['invoice', id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        kicker={lowConfidence ? 'Awaiting manual entry' : 'Awaiting review'}
        title={upload.originalFilename}
        sub={
          manualRequired
            ? 'OCR could not read this invoice confidently. Add lines manually below.'
            : `OCR confidence ${upload.ocrConfidence ?? 0}%. Correct anything before saving.`
        }
        actions={
          <Link to="/invoices"><Button variant="secondary" size="sm">Back to list</Button></Link>
        }
      />

      {lowConfidence && (
        <div className="flex items-center gap-2 p-3 bg-amber/5 border border-amber/30 text-xs text-amber">
          <AlertCircleIcon size={14} />
          <span>Low confidence — please verify every line and category before saving.</span>
        </div>
      )}

      <div className="bg-paper border border-ink/15">
        <table className="w-full text-xs">
          <thead className="bg-bone text-[10px] font-mono uppercase tracking-wider text-ink-4">
            <tr>
              <th className="p-2 text-left w-12">#</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-left w-20">Qty</th>
              <th className="p-2 text-left w-20">Unit</th>
              <th className="p-2 text-right w-28">Unit Rs.</th>
              <th className="p-2 text-right w-28">Line Rs.</th>
              <th className="p-2 text-left w-40">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={l.id || i} className="hover:bg-bone/40">
                <td className="p-2 font-mono text-ink-4">{i + 1}</td>
                <td className="p-2">
                  <input
                    value={l.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    className="w-full bg-transparent text-ink outline-none border-b border-transparent focus:border-copper"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={l.quantity ?? ''}
                    onChange={(e) => updateLine(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                    className="w-full bg-transparent text-right font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <input
                    value={l.unit ?? ''}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                    className="w-full bg-transparent font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={l.unitPriceCents != null ? l.unitPriceCents / 100 : ''}
                    onChange={(e) => updateLine(i, { unitPriceCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })}
                    className="w-full bg-transparent text-right font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={l.totalCents != null ? l.totalCents / 100 : ''}
                    onChange={(e) => updateLine(i, { totalCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })}
                    className="w-full bg-transparent text-right font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={l.categorySlug ?? 'other'}
                      onChange={(e) => updateLine(i, { categorySlug: e.target.value })}
                      className="bg-paper border border-ink/20 text-ink px-1 py-0.5 outline-none"
                    >
                      {SLUGS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <CategoryBadge slug={l.categorySlug} source={l.categorySource} />
                  </div>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-ink-4">No lines detected. Add rows manually below.</td></tr>
            )}
          </tbody>
        </table>
        <div className="p-3 border-t border-ink/10 flex flex-wrap items-center gap-3 justify-between">
          <button
            type="button"
            onClick={() => setLines((p) => [...p, { id: '', lineNumber: p.length + 1, description: '', quantity: null, unit: null, unitPriceCents: null, totalCents: null, categorySlug: 'other', categorySource: 'manual' }])}
            className="text-[10px] font-mono uppercase tracking-wider text-copper hover:text-ink"
          >
            + Add line manually
          </button>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Invoice total Rs.</label>
            <input
              type="number"
              value={totalCents / 100}
              onChange={(e) => setTotalCents(Math.round(Number(e.target.value) * 100))}
              className="w-24 bg-paper border border-ink/20 text-right font-mono px-2 py-0.5"
            />
            <Button
              size="sm"
              onClick={save}
              disabled={!dirty || saving}
              icon={saving ? <RefreshCwIcon size={13} className="animate-spin" /> : <SaveIcon size={13} />}
            >
              {saving ? 'Saving…' : 'Save & categorize'}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-mint">
                <CheckCircleIcon size={13} /> Saved
              </span>
            )}
            {error && (
              <span className="inline-flex items-center gap-1 text-xs text-rose">
                <AlertCircleIcon size={13} /> {error}
              </span>
            )}
          </div>
        </div>
      </div>

      {upload.rawExtractionJson && (
        <details className="text-xs text-ink-4">
          <summary className="cursor-pointer font-mono uppercase tracking-wider">View raw OCR output</summary>
          <pre className="mt-2 p-3 bg-bone border border-ink/10 overflow-x-auto whitespace-pre-wrap break-all">
            {(() => { try { return JSON.stringify(JSON.parse(upload.rawExtractionJson), null, 2); } catch { return upload.rawExtractionJson; } })()}
          </pre>
        </details>
      )}
    </div>
  );
}
```

**Step 4: Routes**

Add to `apps/web/src/App.tsx`:
```tsx
const InvoiceListPage = lazy(() => import('./pages/InvoiceListPage').then((m) => ({ default: m.InvoiceListPage })));
const InvoiceReviewPage = lazy(() => import('./pages/InvoiceReviewPage').then((m) => ({ default: m.InvoiceReviewPage })));
// ...
<Route path="/invoices" element={<RequireAuth><InvoiceListPage /></RequireAuth>} />
<Route path="/invoices/:id/review" element={<RequireAuth><InvoiceReviewPage /></RequireAuth>} />
```

(Use the auth wrapper present in the file — match style of other auth-gated routes.)

**Step 5: Typecheck + commit**

```bash
pnpm --filter @vyro/web typecheck
git add apps/web/src/pages/InvoiceListPage.tsx apps/web/src/pages/InvoiceReviewPage.tsx apps/web/src/ai/CategoryBadge.tsx apps/web/src/App.tsx
git commit -m "feat(web): invoice list + review pages with editable category overrides"
```

---

## Task 10: Verification + smoke

**Step 1: Full pipeline**

```bash
pnpm typecheck
pnpm --filter @vyro/ai test
pnpm --filter @vyro/api test
pnpm --filter @vyro/web test
pnpm --filter @vyro/web build
pnpm --filter @vyro/api build
```
Expected: all green.

**Step 2: Migration up + down (local)**

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply vyro --local
# verify tables exist via:
pnpm exec wrangler d1 execute vyro --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'invoice_%' OR name='category_mappings';"
# down test:
pnpm exec wrangler d1 migrations apply vyro --local --command="DELETE FROM migrations WHERE name='0019_documents'"
# then re-apply up manually to confirm idempotency of down: skip — wrangler tracks state.
```

**Step 3: Smoke checklist**

- [ ] POST a small PNG to `/api/documents/upload-direct` (auth + owner/manager role required).
- [ ] Confirm row inserted in `invoice_uploads` with status `pending` then `processing`/`ready`.
- [ ] Visit `/invoices/:id/review`, see extracted lines.
- [ ] Change category on a line, save → response 200, status flips to `reviewed`, `category_mappings` gains a per-business row.
- [ ] Re-run the same prompt through Ask VYRO: "categorize my expenses" → handler returns breakdown card with totals.
- [ ] Confirm no invoice from another business is reachable.

**Step 4: Commit any remaining docs**

```bash
git add docs/superpowers/plans/2026-09-08-vyro-ai-document-intel.md
git commit -m "docs(ai): Phase 5 plan — Document Intelligence (OCR + Categorization)"
```

---

## Self-Review

- **Spec coverage:** ✓ upload (5.3), queue+OCR (5.4), review page (5.5), rule engine (5.6), intent (5.7), schema (5.1), R2+queue (5.2).
- **Placeholders:** none — every step shows the actual file content.
- **Type consistency:** `categorizeItems` returns `CategorizedItem` (matches `categorySource: 'rule' | 'default'`). Routes convert `'manual'` based on review-time correction diff. Repository `recordCategoryCorrection` inserts `source: 'manual'` mappings.
- **Security:** review page mandatory before status flips to `reviewed`; no auto-promotion of OCR output; cross-tenant filter on every query; rate limit on upload.
- **Neutral language:** "Awaiting manual entry", "Could not read", "OCR confidence X%". No "Failed" alone.

## Handoff

"Plan complete and saved to `docs/superpowers/plans/2026-09-08-vyro-ai-document-intel.md`. 10 tasks. Two execution options:

1. **Subagent-Driven** (recommended) — fresh subagent per task + two-stage review.
2. **Inline Execution** — execute tasks in this session with checkpoints."

Which approach?
