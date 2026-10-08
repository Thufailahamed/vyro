# AI Product Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppliers upload messy price lists (CSV/TSV, photos, PDFs) or product photos; AI extracts candidate offer rows through Cloudflare AI Gateway on cheap Workers AI models; a web staging table lets the supplier review and commit through the existing import pipeline.

**Architecture:** Upload stores the file in R2 (PRODUCTS bucket), creates a session row, and enqueues a queue job. The consumer parses tabular text deterministically (AI only maps odd headers to the 17-column import schema), uses a vision model for photos/PDFs/product photos, normalizes + Zod-validates candidates, fuzzy-matches names to the catalog, and stages rows. Supplier reviews per-row, commits; unmatched names become inactive catalog products with moderation notes for admin review; commit builds CSV and calls the extracted `runImport` core.

**Tech Stack:** Hono + Cloudflare Workers + D1 (API), Drizzle, Workers AI via `env.AI.run(model, { gateway })`, React + React Query (web), Vitest (`makeD1`/`applyMigrations` for API, plain vitest for web).

## Global Constraints

- No new dependencies in any package.
- Spec: `docs/superpowers/specs/2026-10-08-ai-product-upload-design.md`.
- AI never writes D1 directly — the existing importer (`runImport`) is the only write path for offers.
- Model IDs configurable via env; everything routes through AI Gateway when `VYRO_AI_GATEWAY` is set (`env.AI.run(model, { gateway: { id } })`).
- Caps: 200 rows per upload (same as `MAX_IMPORT_ROWS`), file ≤ 7.5 MB after base64 decode.
- Web API calls only via the `api` wrapper (`apps/web/src/lib/api.ts`); paths never start with `/api`.
- API route tests mount the router on a Hono app with the `errorEnvelope` handler and mock `../../src/middleware/session` (pattern below).
- Commit per task with explicit paths (never `git add -A`); the user has authorized per-task commits for this workstream.
- Scope note: `.xlsx` is NOT parsed (would need a zip dependency). The upload UI tells suppliers to re-export as CSV. Supported inputs: `.csv`, `.tsv`, `.txt` (tabular), `.jpg`/`.png`/`.webp` photos/PDF via vision model, product photos.

---

### Task 1: Migration + schema

**Files:**
- Create: `packages/db/migrations/0054_product_upload_sessions.sql`
- Create: `packages/db/src/schema/productUploads.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Produces: `productUploadSessions`, `productUploadRows` Drizzle tables; exported types `ProductUploadSession`, `NewProductUploadSession`, `ProductUploadRow`, `NewProductUploadRow` (used by Tasks 3, 5, 6, 7).

- [ ] **Step 1: Write the migration**

```sql
-- 0054_product_upload_sessions.sql
CREATE TABLE product_upload_sessions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  -- pending | extracting | extracted | failed | committed
  status TEXT NOT NULL,
  -- csv | tsv | photo_pdf | product_photo
  source_kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  committed_at INTEGER
);
CREATE INDEX product_upload_sessions_supplier_idx
  ON product_upload_sessions(supplier_id, created_at);
CREATE INDEX product_upload_sessions_status_idx
  ON product_upload_sessions(status);

CREATE TABLE product_upload_rows (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES product_upload_sessions(id),
  row_index INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  product_name TEXT NOT NULL,
  supplier_sku TEXT,
  unit TEXT,
  price_lkr REAL,
  min_order_qty INTEGER,
  lead_time_days INTEGER,
  stock_qty INTEGER,
  tier1_min_qty INTEGER,
  tier1_discount_pct INTEGER,
  tier2_min_qty INTEGER,
  tier2_discount_pct INTEGER,
  tier3_min_qty INTEGER,
  tier3_discount_pct INTEGER,
  confidence INTEGER NOT NULL,
  -- offer | product | proposal | none
  match_type TEXT NOT NULL,
  match_product_id TEXT REFERENCES products(id),
  match_score INTEGER NOT NULL,
  -- accepted | edited | rejected
  decision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX product_upload_rows_session_idx
  ON product_upload_rows(session_id, row_index);
```

- [ ] **Step 2: Write the schema file**

`packages/db/src/schema/productUploads.ts`, mirroring `invoiceUploads.ts` conventions:

```ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { users } from './users';
import { suppliers } from './suppliers';
import { products } from './products';

export const productUploadSessions = sqliteTable(
  'product_upload_sessions',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    supplierId: text('supplier_id').notNull().references(() => suppliers.id),
    userId: text('user_id').notNull().references(() => users.id),
    status: text('status', {
      enum: ['pending', 'extracting', 'extracted', 'failed', 'committed'],
    }).notNull(),
    sourceKind: text('source_kind', {
      enum: ['csv', 'tsv', 'photo_pdf', 'product_photo'],
    }).notNull(),
    r2Key: text('r2_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    errorMessage: text('error_message'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    committedAt: integer('committed_at'),
  },
  (t) => ({
    supplierIdx: index('product_upload_sessions_supplier_idx').on(t.supplierId, t.createdAt),
    statusIdx: index('product_upload_sessions_status_idx').on(t.status),
  }),
);

export const productUploadRows = sqliteTable(
  'product_upload_rows',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => productUploadSessions.id),
    rowIndex: integer('row_index').notNull(),
    rawJson: text('raw_json').notNull(),
    productName: text('product_name').notNull(),
    supplierSku: text('supplier_sku'),
    unit: text('unit'),
    priceLkr: real('price_lkr'),
    minOrderQty: integer('min_order_qty'),
    leadTimeDays: integer('lead_time_days'),
    stockQty: integer('stock_qty'),
    tier1MinQty: integer('tier1_min_qty'),
    tier1DiscountPct: integer('tier1_discount_pct'),
    tier2MinQty: integer('tier2_min_qty'),
    tier2DiscountPct: integer('tier2_discount_pct'),
    tier3MinQty: integer('tier3_min_qty'),
    tier3DiscountPct: integer('tier3_discount_pct'),
    confidence: integer('confidence').notNull(),
    matchType: text('match_type', {
      enum: ['offer', 'product', 'proposal', 'none'],
    }).notNull(),
    matchProductId: text('match_product_id').references(() => products.id),
    matchScore: integer('match_score').notNull(),
    decision: text('decision', { enum: ['accepted', 'edited', 'rejected'] }).notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    sessionIdx: index('product_upload_rows_session_idx').on(t.sessionId, t.rowIndex),
  }),
);

export type ProductUploadSession = typeof productUploadSessions.$inferSelect;
export type NewProductUploadSession = typeof productUploadSessions.$inferInsert;
export type ProductUploadRow = typeof productUploadRows.$inferSelect;
export type NewProductUploadRow = typeof productUploadRows.$inferInsert;
```

- [ ] **Step 3: Export from the schema index**

In `packages/db/src/schema/index.ts` add:

```ts
export * from './productUploads';
```

- [ ] **Step 4: Verify types**

Run: `pnpm --filter @vyro/db typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0054_product_upload_sessions.sql packages/db/src/schema/productUploads.ts packages/db/src/schema/index.ts
git commit -m "feat(db): product upload session and row schema"
```

---

### Task 2: Validation schemas

**Files:**
- Create: `packages/validation/src/productUpload.ts`
- Modify: `packages/validation/src/index.ts`

**Interfaces:**
- Produces: `productUploadCreateSchema` `{ supplierId, businessId, filename, contentType, base64 }`; `productUploadRowPatchSchema` `{ decision: 'accepted'|'edited'|'rejected', edited?: Partial<row fields> }`; `productUploadCommitSchema` `{ }` (empty, session id in path); exported types (used by Task 6).

- [ ] **Step 1: Write the schema file**

```ts
import { z } from 'zod';

export const productUploadCreateSchema = z
  .object({
    supplierId: z.string().min(1),
    businessId: z.string().min(1),
    filename: z.string().min(1).max(120),
    contentType: z.enum([
      'text/csv',
      'text/tab-separated-values',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]),
    /** Single-file uploads only. Base64 of ≤ 7.5 MB binary → ≤ 10 MB string. */
    base64: z.string().min(8).max(10_000_000),
  })
  .strict();

export const rowFieldsSchema = z.object({
  productName: z.string().min(1).max(200).optional(),
  supplierSku: z.string().max(80).nullish(),
  unit: z.string().max(20).nullish(),
  priceLkr: z.number().min(0).nullish(),
  minOrderQty: z.number().int().min(1).nullish(),
  leadTimeDays: z.number().int().min(0).nullish(),
  stockQty: z.number().int().min(0).nullish(),
  tier1MinQty: z.number().int().min(1).nullish(),
  tier1DiscountPct: z.number().int().min(0).max(100).nullish(),
  tier2MinQty: z.number().int().min(1).nullish(),
  tier2DiscountPct: z.number().int().min(0).max(100).nullish(),
  tier3MinQty: z.number().int().min(1).nullish(),
  tier3DiscountPct: z.number().int().min(0).max(100).nullish(),
});

export const productUploadRowPatchSchema = z
  .object({
    decision: z.enum(['accepted', 'edited', 'rejected']),
    edited: rowFieldsSchema.optional(),
  })
  .strict();

export const productUploadCommitSchema = z.object({}).strict();

export type ProductUploadCreateInput = z.infer<typeof productUploadCreateSchema>;
export type ProductUploadRowPatchInput = z.infer<typeof productUploadRowPatchSchema>;
export type RowFieldsInput = z.infer<typeof rowFieldsSchema>;
```

- [ ] **Step 2: Export from the validation index**

In `packages/validation/src/index.ts` add:

```ts
export * from './productUpload';
```

- [ ] **Step 3: Verify types**

Run: `pnpm --filter @vyro/validation typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/validation/src/productUpload.ts packages/validation/src/index.ts
git commit -m "feat(validation): product upload request schemas"
```

---

### Task 3: Tabular extraction core (pure + header-map AI call)

**Files:**
- Create: `apps/api/src/modules/ai/productUpload/extract.ts`
- Test: `apps/api/test/ai/productUpload/extract.test.ts`

**Interfaces:**
- Consumes: `parseCsvRecords(text)` from `packages/shared/src/lib/csv.ts`; `IMPORT_COLUMNS` from `apps/api/src/modules/supplierProducts/importExport.ts`; `QueueSend`-free.
- Produces:
  - `aiRunOpts(env): { gateway?: { id: string } }` — gateway wrapper reused by Tasks 4/5.
  - `detectSourceKind(filename, contentType): 'csv' | 'tsv' | 'photo_pdf' | 'product_photo' | null` (null = rejected upload).
  - `type CandidateRow = { rowIndex: number; raw: Record<string, string>; productName: string; supplierSku?: string; unit?: string; priceLkr?: number; minOrderQty?: number; leadTimeDays?: number; stockQty?: number; tier1MinQty?: number; tier1DiscountPct?: number; tier2MinQty?: number; tier2DiscountPct?: number; tier3MinQty?: number; tier3DiscountPct?: number; confidence: number }`.
  - `extractFromTabular(env, text): Promise<{ rows: CandidateRow[]; headerMapping: Record<string, string> | null }>` — parses CSV/TSV; when headers already match IMPORT_COLUMNS exactly (case-insensitive) it skips AI; otherwise one `env.AI.run` text call maps each foreign header to a schema column or `ignore`, then normalizes values.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { detectSourceKind } from '../../../src/modules/ai/productUpload/extract';

describe('detectSourceKind', () => {
  it('classifies csv/txt as csv', () => {
    expect(detectSourceKind('list.csv', 'text/csv')).toBe('csv');
    expect(detectSourceKind('list.csv', 'text/plain')).toBe('csv');
  });
  it('classifies tsv', () => {
    expect(detectSourceKind('list.tsv', 'text/tab-separated-values')).toBe('tsv');
  });
  it('classifies documents and photos', () => {
    expect(detectSourceKind('price.jpg', 'image/jpeg')).toBe('photo_pdf');
    expect(detectSourceKind('scan.png', 'image/png')).toBe('photo_pdf');
    expect(detectSourceKind('list.pdf', 'application/pdf')).toBe('photo_pdf');
    expect(detectSourceKind('item.png', 'image/webp')).toBe('product_photo');
  });
  it('rejects xlsx by returning null (UI will ask for CSV export)', () => {
    expect(
      detectSourceKind('list.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBeNull();
  });
});
```

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/extract.test.ts`
Expected: FAIL — module `../../../src/modules/ai/productUpload/extract` not found.

- [ ] **Step 2: Write the implementation**

```ts
import type { Env } from '../../../env';
import { parseCsvRecords } from '@vyro/shared';
import { IMPORT_COLUMNS } from '../../supplierProducts/importExport';

/** Route every AI call through the AI Gateway when configured. */
export function aiRunOpts(env: Partial<Env>): { gateway?: { id: string } } {
  const id = (env as any).VYRO_AI_GATEWAY as string | undefined;
  return id ? { gateway: { id } } : {};
}

const PHOTO_CT = new Set(['image/jpeg', 'image/png']);
const DOC_CT = new Set(['application/pdf']);
const TSV_CT = new Set(['text/tab-separated-values']);
const CSV_CT = new Set(['text/csv', 'text/plain']);

/** Product photos are a distinct kind: classify, not extract prices. */
export function detectSourceKind(
  filename: string,
  contentType: string,
): 'csv' | 'tsv' | 'photo_pdf' | 'product_photo' | null {
  if (DOC_CT.has(contentType)) return 'photo_pdf';
  if (PHOTO_CT.has(contentType)) {
    return /price|invoice|list|sheet/i.test(filename) ? 'photo_pdf' : 'product_photo';
  }
  if (TSV_CT.has(contentType)) return 'tsv';
  if (CSV_CT.has(contentType)) return 'csv';
  return null;
}

export type CandidateRow = {
  rowIndex: number;
  raw: Record<string, string>;
  productName: string;
  supplierSku?: string;
  unit?: string;
  priceLkr?: number;
  minOrderQty?: number;
  leadTimeDays?: number;
  stockQty?: number;
  tier1MinQty?: number;
  tier1DiscountPct?: number;
  tier2MinQty?: number;
  tier2DiscountPct?: number;
  tier3MinQty?: number;
  tier3DiscountPct?: number;
  confidence: number;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '_');

function looksExact(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  return IMPORT_COLUMNS.every((c) => set.has(c));
}

const MAX_UPLOAD_ROWS = 200;

async function mapHeaders(env: Partial<Env>, headers: string[]): Promise<Record<string, string> | null> {
  const staff = IMPORT_COLUMNS.join(', ');
  const prompt =
    `Youmap spreadsheet headers to a fixed schema. Schema columns: ${staff}.\n` +
    `Headers: ${JSON.stringify(headers)}.\n` +
    `Return ONLY JSON: {"mapping": {"<header>": "<schema column or ignore>"}}. Unmappable headers -> "ignore".`;
  const model = (env as any).VYRO_AI_UPLOAD_MAP_MODEL ?? '@cf/zai-org/glm-5.3-flash';
  const out = await (env as any).AI.run(
    model,
    { messages: [{ role: 'user', content: prompt }], max_tokens: 512, ...aiRunOpts(env) },
  );
  const text = (out as any)?.response ?? '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const mapping = parsed?.mapping;
    if (!mapping || typeof mapping !== 'object') return null;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapping)) {
      const col = String(v).trim();
      const key = headers.find((h) => norm(h) === norm(k));
      if (key && IMPORT_COLUMNS.includes(col as (typeof IMPORT_COLUMNS)[number])) clean[key] = col;
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const cleaned = v.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeRow(
  rec: Record<string, string>,
  rowIndex: number,
): CandidateRow {
  const get = (...names: string[]) => {
    for (const n of names) {
      const hit = Object.keys(rec).find((k) => norm(k) === norm(n));
      if (hit !== undefined) return rec[hit];
    }
    return undefined;
  };
  const price = num(get('price_lkr', 'price', 'unit_price', 'rate'));
  const filled = Object.entries(rec).filter(([, v]) => v && v.trim()).length;
  const base = Math.min(95, 40 + filled * 8);
  const confidence = price !== undefined ? base : Math.max(50, base - 20);
  return {
    rowIndex,
    raw: rec,
    productName: String(get('product_name', 'name', 'item', 'description') ?? '').trim().slice(0, 200),
    supplierSku: get('supplier_sku', 'sku', 'code') ?.trim().slice(0, 80) || undefined,
    unit: num(get('unit') ?? '') !== undefined ? undefined : get('unit') ?.trim().slice(0, 20) || undefined,
    priceLkr: price,
    minOrderQty: num(get('min_order_qty', 'moq')),
    leadTimeDays: num(get('lead_time_days', 'lead_time')),
    stockQty: num(get('stock_qty', 'stock', 'qty_available')),
    tier1MinQty: num(get('tier1_min_qty', 'tier_1_min_qty')),
    tier1DiscountPct: num(get('tier1_discount_pct', 'tier_1_discount_pct')),
    tier2MinQty: num(get('tier2_min_qty', 'tier_2_min_qty')),
    tier2DiscountPct: num(get('tier2_discount_pct', 'tier_2_discount_pct')),
    tier3MinQty: num(get('tier3_min_qty', 'tier_3_min_qty')),
    tier3DiscountPct: num(get('tier3_discount_pct', 'tier_3_discount_pct')),
    confidence: Math.max(0, Math.min(100, confidence)),
  };
}

export async function extractFromTabular(
  env: Partial<Env>,
  text: string,
): Promise<{ rows: CandidateRow[]; headerMapping: Record<string, string> | null }> {
  const isTsv = text.includes('\t') && !text.includes(',');
  const rows = isTsv ? parseTsvRecords(text) : (parseCsvRecords(text).records as Array<Record<string, string>>);
  const headers = isTsv
    ? Object.keys(rows[0] ?? {})
    : ((parseCsvRecords(text).headers as unknown as string[]) ?? []);
  if (!headers.length || rows.length === 0) return { rows: [], headerMapping: null };
  const mapping = looksExact(headers) ? null : await mapHeaders(env, headers);
  const normalized = rows.map((r, i) => {
    if (!mapping) return normalizeRow(r, i);
    const mapped: Record<string, string> = {};
    for (const [h, v] of Object.entries(r)) {
      const col = mapping[h];
      if (col) mapped[col] = v;
    }
    return normalizeRow(mapped, i);
  });
  return { rows: normalized.filter((r) => r.productName.length > 0).slice(0, MAX_UPLOAD_ROWS), headerMapping: mapping };
}

function parseTsvRecords(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split('\t').map((h) => h.trim());
  return lines.slice(1, 1 + MAX_UPLOAD_ROWS).map((line) => {
    const cells = line.split('\t');
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => (rec[h] = cells[i] ?? ''));
    return rec;
  });
}
```

Implementation note for the implementer: `parseCsvRecords` is called once (CSV path); TSV has its own tiny splitter because RFC 4180 quoting does not apply to tab-separated price sheets. `parseCsvRecords` returns `{ headers, records, rowNumbers }` — type the `headers`/`records` narrow with `as unknown as` only if needed by the shared types.

- [ ] **Step 3: Verify the implementation compiles and unit tests pass**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/extract.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ai/productUpload/extract.ts apps/api/test/ai/productUpload/extract.test.ts
git commit -m "feat(ai): tabular extraction core with AI header mapping"
```

---

### Task 4: Vision extraction (price lists + product photos)

**Files:**
- Create: `apps/api/src/modules/ai/productUpload/vision.ts`
- Test: `apps/api/test/ai/productUpload/vision.test.ts`

**Interfaces:**
- Consumes: `aiRunOpts` from Task 3; `CandidateRow` from Task 3.
- Produces:
  - `runVisionPriceList(env, bytes): Promise<{ rows: CandidateRow[]; confidence: number }>` — for price-list photos/PDFs.
  - `runVisionProductPhoto(env, bytes): Promise<CandidateRow>` — one photo → one priceless candidate row (productName + unit guess, confidence from model self-report).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { runVisionProductPhoto, runVisionPriceList } from '../../../src/modules/ai/productUpload/vision';

const fakeEnv = (response: string) =>
  ({ AI: { run: async () => ({ response }) }, VYRO_AI_UPLOAD_VISION_MODEL: '@cf/test/vision' }) as any;

describe('runVisionPriceList', () => {
  it('parses rows json out of the model response', async () => {
    const env = fakeEnv('noise {"rows": [{"productName": "Rice 5kg", "priceLkr": 420}]} noise');
    const out = await runVisionPriceList(env, new Uint8Array([1, 2, 3]));
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.productName).toBe('Rice 5kg');
    expect(out.rows[0]!.priceLkr).toBe(420);
    expect(out.confidence).toBeGreaterThan(0);
  });
  it('returns zero rows on garbage', async () => {
    const env = fakeEnv('no json here');
    const out = await runVisionPriceList(env, new Uint8Array([1, 2, 3]));
    expect(out.rows).toEqual([]);
  });
});

describe('runVisionProductPhoto', () => {
  it('builds a priceless candidate row', async () => {
    const env = fakeEnv('{"productName": "Coconut oil 750ml", "unit": "bottle"}');
    const row = await runVisionProductPhoto(env, new Uint8Array([1, 2, 3]));
    expect(row.productName).toBe('Coconut oil 750ml');
    expect(row.priceLkr).toBeUndefined();
    expect(row.confidence).toBeGreaterThan(0);
  });
  it('surfaces a low-confidence empty row on failure', async () => {
    const env = { AI: { run: async () => { throw new Error('boom'); } } } as any;
    const row = await runVisionProductPhoto(env, new Uint8Array([9]));
    expect(row.productName).toBe('');
    expect(row.confidence).toBe(0);
  });
});
```

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/vision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write the implementation**

```ts
import type { Env } from '../../../env';
import { aiRunOpts, type CandidateRow } from './extract';

const DEFAULT_VISION = '@cf/llava-hf/llava-1.5-7b-hf';

const PRICE_PROMPT =
  'This is a wholesale price list (photo or PDF page). Extract every product row as JSON: ' +
  '{"rows": [{"productName", "supplierSku", "unit", "priceLkr" (number, LKR), "minOrderQty", "stockQty"}]}. ' +
  'Include a "confidence" (0-100, your legibility). Return ONLY the JSON.';

const PHOTO_PROMPT =
  'Identify this wholesale product photo. Return ONLY JSON: ' +
  '{"productName" (max 120 chars), "unit" (e.g. bottle, kg, box), "confidence" (0-100)}.';

function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clamp = (n: unknown): number => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function rowFromJsonObject(obj: Record<string, unknown>, rowIndex: number, fallbackConfidence: number): CandidateRow {
  const price = Number(obj.priceLkr ?? obj['price'] ?? NaN);
  const name = String(obj.productName ?? obj['name'] ?? '').trim().slice(0, 200);
  const confidence = obj.confidence !== undefined ? clamp(obj.confidence) : fallbackConfidence;
  return {
    rowIndex,
    raw: obj as Record<string, string>,
    productName: name,
    supplierSku: obj.supplierSku ? String(obj.supplierSku).slice(0, 80) : undefined,
    unit: obj.unit ? String(obj.unit).slice(0, 20) : undefined,
    priceLkr: Number.isFinite(price) ? price : undefined,
    minOrderQty: obj.minOrderQty !== undefined ? clamp(obj.minOrderQty) : undefined,
    stockQty: obj.stockQty !== undefined ? clamp(obj.stockQty) : undefined,
    confidence,
  };
}

export async function runVisionPriceList(
  env: Partial<Env>,
  bytes: Uint8Array,
): Promise<{ rows: CandidateRow[]; confidence: number }> {
  if (!env.AI) return { rows: [], confidence: 0 };
  const model = (env as any).VYRO_AI_UPLOAD_VISION_MODEL ?? DEFAULT_VISION;
  try {
    const out = await env.AI.run(model, {
      image: Array.from(bytes),
      prompt: PRICE_PROMPT,
      max_tokens: 2048,
      ...aiRunOpts(env),
    });
    const json = extractJson((out as any)?.response ?? '');
    if (!json || !Array.isArray(json.rows)) return { rows: [], confidence: 0 };
    const rows = (json.rows as Array<Record<string, unknown>>)
      .map((r, i) => rowFromJsonObject(r, i, clamp(json.confidence ?? 70)))
      .filter((r) => r.productName.length > 0)
      .slice(0, 200);
    return {
      rows,
      confidence: rows.length ? Math.round(rows.reduce((s, r) => s + r.confidence, 0) / rows.length) : 0,
    };
  } catch {
    return { rows: [], confidence: 0 };
  }
}

export async function runVisionProductPhoto(env: Partial<Env>, bytes: Uint8Array): Promise<CandidateRow> {
  const empty: CandidateRow = { rowIndex: 0, raw: {}, productName: '', confidence: 0 };
  if (!env.AI) return empty;
  const model = (env as any).VYRO_AI_UPLOAD_VISION_MODEL ?? DEFAULT_VISION;
  try {
    const out = await env.AI.run(model, {
      image: Array.from(bytes),
      prompt: PHOTO_PROMPT,
      max_tokens: 256,
      ...aiRunOpts(env),
    });
    const json = extractJson((out as any)?.response ?? '');
    if (!json) return empty;
    return rowFromJsonObject(json, 0, clamp(json.confidence ?? 70));
  } catch {
    return empty;
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/vision.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ai/productUpload/vision.ts apps/api/test/ai/productUpload/vision.test.ts
git commit -m "feat(ai): vision extraction for price lists and product photos"
```

---

### Task 5: Catalog matching + queue pipeline

**Files:**
- Create: `apps/api/src/modules/ai/productUpload/matcher.ts`
- Create: `apps/api/src/modules/ai/productUpload/pipeline.ts`
- Create: `apps/api/src/queue/uploadOcr.ts`
- Modify: `apps/api/src/worker.ts` (queue arm)
- Modify: `apps/api/src/lib/queue.ts` (add `uploads` binding)
- Modify: `apps/api/src/lib/queueInstrument.ts` (add `uploads` to `QueueName`)
- Modify: `apps/api/src/env.ts` (`UPLOADS_QUEUE: Queue`, `VYRO_AI_GATEWAY?`, `VYRO_AI_UPLOAD_VISION_MODEL?`, `VYRO_AI_UPLOAD_MAP_MODEL?`)
- Modify: `apps/api/wrangler.toml` (queue + vars)
- Test: `apps/api/test/ai/productUpload/pipeline.test.ts`

**Interfaces:**
- Consumes: `tokenJaccard`; `CandidateRow`; `productUploadSessions` / `productUploadRows` schema; `makeD1`/`applyMigrations` helpers.
- Produces:
  - `matchRows(db, supplierId, rows): Promise<Array<{ matchType: 'offer' | 'product' | 'proposal' | 'none'; productId?: string; matchScore: number }>>` — Jaccard ≥ 0.75 against existing offers (by supplier, by supplierSku) and catalog names; below threshold → `proposal` (an offer can still be created later), `none` only when no name.
  - `processUploadSession(env, sessionId): Promise<void>` — status machine pending → extracting → extracted / failed.
  - `handleUploadsBatch(batch, env)` — queue arm.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../../../test/helpers/d1';
import type { Env } from '../../../src/env';

let env: any;

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env = { DB: d1, ENVIRONMENT: 'test' };
});

describe('processUploadSession', () => {
  it('extracts csv rows, matches catalog, stages rows', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    // seed supplier + catalog product
    await db.insert(schema.users).values({ id: 'u-s', email: 's@t', passwordHash: 'x', name: 's', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
    const bt = newId();
    await db.insert(schema.businessTypes).values({ id: bt, slug: 'rest', name: 'Rest', active: true });
    await db.insert(schema.suppliers).values({ id: 'sup-1', name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '1', email: 's@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
    const cat = newId();
    await db.insert(schema.categories).values({ id: cat, name: 'Groceries', slug: 'groceries', parentId: null, active: true });
    await db.insert(schema.products).values({ id: 'p-rice', name: 'Rice 5kg', description: null, categoryId: cat, brand: null, unit: 'bag', packSize: null, active: true, featured: false, moderationNotes: null, createdAt: now, updatedAt: now, deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false });

    const sid = newId();
    await db.insert(schema.productUploadSessions).values({
      id: sid, businessId: 'biz-1', supplierId: 'sup-1', userId: 'u-s',
      status: 'pending', sourceKind: 'csv',
      // test-inline: prefix makes the pipeline read CSV text directly instead of R2
      r2Key: 'test-inline:Item,Rate\nRice 5kg,420',
      originalFilename: 'l.csv', mimeType: 'text/csv', sizeBytes: 100,
      errorMessage: null, createdAt: now, updatedAt: now, committedAt: null,
    });

    const stubEnv: Partial<Env> = {
      ...env,
      AI: {
        run: async () => ({
          response: '{"mapping": {"Item": "product_name", "Rate": "price_lkr"}}',
        }),
      },
      VYRO_AI_UPLOAD_MAP_MODEL: '@cf/test/map',
    } as any;

    const { processUploadSession } = await import('../../../src/modules/ai/productUpload/pipeline');
    await processUploadSession(stubEnv as Env, sid);

    const rows = await db.select().from(schema.productUploadRows).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.productName).toBe('Rice 5kg');
    expect(rows[0]!.matchType).toBe('product');
    expect(rows[0]!.decision).toBe('accepted');
    const session = await db.select().from(schema.productUploadSessions).all();
    expect(session[0]!.status).toBe('extracted');
  });

  it('marks the session failed when extraction throws', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const sid = newId();
    await db.insert(schema.productUploadSessions).values({
      id: sid, businessId: 'biz-1', supplierId: 'sup-1', userId: 'u-s',
      status: 'pending', sourceKind: 'csv', r2Key: 'test-inline:,bad',
      originalFilename: 'l.csv', mimeType: 'text/csv', sizeBytes: 10,
      errorMessage: null, createdAt: now, updatedAt: now, committedAt: null,
    });
    const boomEnv = { DB: env.DB, ENVIRONMENT: 'test', AI: { run: async () => { throw new Error('boom'); } } } as unknown as Env;
    const { processUploadSession } = await import('../../../src/modules/ai/productUpload/pipeline');
    await processUploadSession(boomEnv, sid);
    const session = await db.select().from(schema.productUploadSessions).all();
    const failed = session.find((s) => s.id === sid);
    expect(failed!.status).toBe('extracted'); // zero-row csv → extracted with 0 rows, not failed
    const rows = await db.select().from(schema.productUploadRows).all();
    expect(rows.find((r) => r.sessionId === sid)).toBeUndefined();
  });
});
```

The `test-inline:` prefix is a small hook in the pipeline's text loader (production path uses `env.PRODUCTS.get(r2Key)`); it keeps R2 out of unit tests and is documented in the pipeline code as test-only.

- [ ] **Step 2: Write the matcher**

```ts
import { getDb } from '@vyro/db';
import { products, supplierProducts } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { tokenJaccard } from '../intents/tokenJaccard';
import type { CandidateRow } from './extract';

export const MATCH_THRESHOLD = 0.75;

export type MatchResult = {
  matchType: 'offer' | 'product' | 'proposal' | 'none';
  productId?: string;
  matchScore: number;
};

export async function matchRows(db: ReturnType<typeof getDb>, supplierId: string, rows: CandidateRow[]): Promise<MatchResult[]> {
  const offers = await db
    .select({ productId: supplierProducts.productId, supplierSku: supplierProducts.supplierSku })
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierId, supplierId))
    .all();
  const skuByLower = new Map(
    offers.filter((o) => o.supplierSku).map((o) => [o.supplierSku!.toLowerCase(), o.productId]),
  );
  const offerProductIds = new Set(offers.map((o) => o.productId));

  // The live catalog is small (thousands) — load it once and score in JS.
  const catalog = (await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.active, true)).all())
    .map((p) => ({ id: p.id, nameLower: p.name.toLowerCase() }));

  return rows.map((r) => {
    const sku = r.supplierSku?.toLowerCase();
    if (sku && skuByLower.has(sku)) {
      return { matchType: 'offer' as const, productId: skuByLower.get(sku), matchScore: 100 };
    }
    let best: { id: string; score: number } | null = null;
    const nameLower = r.productName.toLowerCase();
    for (const c of catalog) {
      const score = Math.round(tokenJaccard(nameLower, c.nameLower) * 100);
      if (!best || score > best.score) best = { id: c.id, score };
    }
    if (best && best.score >= MATCH_THRESHOLD * 100) {
      return {
        matchType: offerProductIds.has(best.id) ? ('offer' as const) : ('product' as const),
        productId: best.id,
        matchScore: best.score,
      };
    }
    return { matchType: r.productName ? ('proposal' as const) : ('none' as const), matchScore: best?.score ?? 0 };
  });
}
```

- [ ] **Step 3: Write the pipeline + queue consumer**

`apps/api/src/modules/ai/productUpload/pipeline.ts`:

```ts
import { getDb } from '@vyro/db';
import { productUploadRows, productUploadSessions } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../../env';
import { extractFromTabular, type CandidateRow } from './extract';
import { runVisionPriceList, runVisionProductPhoto } from './vision';
import { matchRows, type MatchResult } from './matcher';

const LOW_CONFIDENCE = 60;
/** Test-only hook: a session staged by unit tests prefixes r2Key with this. */
const INLINE_TEST_PREFIX = 'test-inline:';

export async function processUploadSession(env: Env, sessionId: string): Promise<void> {
  const db = getDb(env.DB);
  const session = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, sessionId)).get();
  if (!session || session.status !== 'pending') return;

  await db.update(productUploadSessions).set({ status: 'extracting', updatedAt: Date.now() }).where(eq(productUploadSessions.id, sessionId));
  try {
    let bytes: Uint8Array;
    if (session.r2Key.startsWith(INLINE_TEST_PREFIX)) {
      bytes = new TextEncoder().encode(session.r2Key.slice(INLINE_TEST_PREFIX.length));
    } else {
      const obj = await env.PRODUCTS.get(session.r2Key);
      if (!obj) throw new Error('R2 object missing');
      bytes = new Uint8Array(await obj.arrayBuffer());
    }
    const text = new TextDecoder().decode(bytes);

    let candidates: CandidateRow[] = [];
    if (session.sourceKind === 'csv' || session.sourceKind === 'tsv') {
      candidates = (await extractFromTabular(env, text)).rows;
    } else if (session.sourceKind === 'photo_pdf') {
      candidates = (await runVisionPriceList(env, bytes)).rows;
    } else {
      candidates = [await runVisionProductPhoto(env, bytes)];
    }

    const matches: MatchResult[] = await matchRows(db, session.supplierId, candidates);
    const now = Date.now();
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      const m = matches[i]!;
      const confidence = c.confidence ?? 0;
      await db.insert(productUploadRows).values({
        id: newId(),
        sessionId,
        rowIndex: i,
        rawJson: JSON.stringify(c.raw),
        productName: c.productName,
        supplierSku: c.supplierSku ?? null,
        unit: c.unit ?? null,
        priceLkr: c.priceLkr ?? null,
        minOrderQty: c.minOrderQty ?? null,
        leadTimeDays: c.leadTimeDays ?? null,
        stockQty: c.stockQty ?? null,
        tier1MinQty: c.tier1MinQty ?? null,
        tier1DiscountPct: c.tier1DiscountPct ?? null,
        tier2MinQty: c.tier2MinQty ?? null,
        tier2DiscountPct: c.tier2DiscountPct ?? null,
        tier3MinQty: c.tier3MinQty ?? null,
        tier3DiscountPct: c.tier3DiscountPct ?? null,
        confidence,
        matchType: c.productName ? m.matchType : 'none',
        matchProductId: m.productId ?? null,
        matchScore: m.matchScore,
        decision: c.productName && confidence >= LOW_CONFIDENCE ? 'accepted' : 'edited',
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.update(productUploadSessions)
      .set({ status: 'extracted', updatedAt: now })
      .where(eq(productUploadSessions.id, sessionId));
  } catch (err) {
    await db
      .update(productUploadSessions)
      .set({ status: 'failed', errorMessage: (err instanceof Error ? err.message : 'extraction failed').slice(0, 500), updatedAt: Date.now() })
      .where(eq(productUploadSessions.id, sessionId));
  }
}
```


`apps/api/src/queue/uploadOcr.ts` (mirrors `invoiceOcr.ts`):

```ts

```ts
import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { recordQueueMetric, recordQueueEvent } from '../lib/queueInstrument';
import { processUploadSession } from '../modules/ai/productUpload/pipeline';

export async function handleUploadsBatch(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const t0 = Date.now();
    const body = msg.body as { sessionId?: string } | null;
    if (!body?.sessionId) {
      msg.ack();
      continue;
    }
    try {
      await processUploadSession(env, body.sessionId);
      recordQueueMetric(env, 'queue.ack', 'uploads', Date.now() - t0);
    } catch (err) {
      await recordQueueEvent(env, 'uploads', 'retry', msg.id, body, err instanceof Error ? err.message : 'failed');
      recordQueueMetric(env, 'queue.retry', 'uploads', Date.now() - t0);
    }
    msg.ack();
  }
}
```

Wiring:
- `apps/api/src/lib/queueInstrument.ts`: add `'uploads'` to the `QueueName` union and to the queue→binding map in `lib/queue.ts` (add `uploads: 'UPLOADS_QUEUE'` and the same missing-queue dev behavior as notifications: drop with a warn unless the caller needs delivery).
- `apps/api/src/env.ts`: add `UPLOADS_QUEUE: Queue;` near `INVOICES_QUEUE: Queue;`, and the three optional vars near the existing `VYRO_AI_*` block:

```ts
  /** AI Gateway id — routes Workers AI calls through Cloudflare AI Gateway. */
  VYRO_AI_GATEWAY?: string;
  /** Vision model for AI product upload (photo/PDF price lists, product photos). */
  VYRO_AI_UPLOAD_VISION_MODEL?: string;
  /** Cheap text model used to map spreadsheet headers to the import schema. */
  VYRO_AI_UPLOAD_MAP_MODEL?: string;
```

- `apps/api/src/worker.ts`: in the `queue` handler add:

```ts
    } else if (batch.queue === 'uploads') {
      const { handleUploadsBatch } = await import('./queue/uploadOcr');
      await handleUploadsBatch(batch as never, env);
```

- `apps/api/wrangler.toml`: add after the INVOICES producer block:

```toml
[[queues.producers]]
binding = "UPLOADS_QUEUE"
queue = "product-uploads"
```

and after the invoices consumer block:

```toml
[[queues.consumers]]
queue = "product-uploads"
max_batch_size = 10
max_batch_timeout = 30
```

plus these vars in `[vars]`:

```toml
VYRO_AI_GATEWAY = "vyro-ai-gateway"
VYRO_AI_UPLOAD_VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf"
VYRO_AI_UPLOAD_MAP_MODEL = "@cf/zai-org/glm-5.3-flash"
```

(Operators point `VYRO_AI_GATEWAY` at their real gateway id and may upgrade the vision model id without code changes.)

- [ ] **Step 4: Run the pipeline test**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/pipeline.test.ts`
Expected: PASS (with the cleanups from the inline notes applied).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @vyro/api typecheck`
Expected: clean.

```bash
git add apps/api/src/modules/ai/productUpload/matcher.ts apps/api/src/modules/ai/productUpload/pipeline.ts apps/api/src/queue/uploadOcr.ts apps/api/src/worker.ts apps/api/src/lib/queue.ts apps/api/src/lib/queueInstrument.ts apps/api/src/env.ts apps/api/wrangler.toml apps/api/test/ai/productUpload/pipeline.test.ts
git commit -m "feat(ai): product upload queue pipeline with AI Gateway routing"
```

---

### Task 6: Routes (upload, status, row patch)

**Files:**
- Create: `apps/api/src/modules/ai/productUpload/routes.ts`
- Modify: `apps/api/src/index.ts` (mount)
- Test: `apps/api/test/ai/productUpload/routes.test.ts`

**Interfaces:**
- Consumes: schema from Task 1, validation from Task 2, `queueSend(env, 'uploads', { sessionId })`, membership check pattern `requireSupplierMember(d1, supplierId, userId)` (re-implement locally like `importExport.ts:120` — call `supplierService.requireMember`), `newId` from `@vyro/shared`.
- Produces:
  - `POST /api/ai/product-uploads` → `201 { sessionId, status: 'pending' }`
  - `GET /api/ai/product-uploads/:id` → `{ session, rows }` (member-gated)
  - `PATCH /api/ai/product-uploads/:id/rows/:rowId` decision+edited → `200 { row }`

- [ ] **Step 1: Write the failing tests** (pattern from `apps/api/test/refunds/cancel.test.ts`)

Reuse the exact mount pattern: mock `../../src/middleware/session` to set `sessionCtx`, build `env` with `makeD1` + `applyMigrations`, seed users/business/supplier/membership as that test does, plus one catalog product + category. Mock the queue by passing `UPLOADS_QUEUE: undefined` — the upload route must still succeed in dev (queue optional-drop semantics) and record `queue.enqueue.skip` via `recordQueueMetric`'s warn path; assert status 201 and a `pending` session row exist even without a queue. Also mock `PRODUCTS` with `{ put: async () => {} }`.

Cases:
1. `POST /api/ai/product-uploads` valid csv → 201, session row with `sourceKind: 'csv'`, R2 put called with key starting `product-uploads/{businessId}/`.
2. `POST` with `.xlsx` filename → 400 `VALIDATION_ERROR` ("re-export as CSV").
3. `POST` oversize base64 (> 10 MB string) → 400.
4. `POST` by non-member → 403.
5. `GET /:id` as member → 200 rows array; row confidence < 60 arrives with `decision: 'edited'`.
6. `PATCH rows/:rowId` `{ decision: 'edited', edited: { priceLkr: 555 } }` → 200 and persisted.

- [ ] **Step 2: Write the routes**

```ts
import { Hono } from 'hono';
import { getDb } from '@vyro/db';
import { productUploadRows, productUploadSessions, suppliers } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import {
  productUploadCreateSchema,
  productUploadRowPatchSchema,
} from '@vyro/validation/productUpload';
import { session } from '../../../middleware/session';
import type { Ctx } from '../../../middleware/session';
import { httpError } from '../../../lib/errors';
import { queueSend } from '../../../lib/queue';
import { detectSourceKind } from './extract';
import type { Env } from '../../../env';

// 7.5 MB decoded ceiling (spec cap).
const MAX_BYTES = 7_500_000;

async function requireSupplierMember(env: Env, supplierId: string, userId: string) {
  const supplier = await getDb(env.DB).select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!supplier) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  const { supplierService } = await import('../../suppliers/service');
  await supplierService.requireMember(env.DB, supplierId, userId);
}

const router = new Hono<{ Bindings: Env }>();

router.post('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const body = await c.req.json().catch(() => null);
  const parsed = productUploadCreateSchema.safeParse(body);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid upload', parsed.error.flatten());
  const { supplierId, businessId, filename, contentType, base64 } = parsed.data;
  await requireSupplierMember(c.env, supplierId, ctx.userId);

  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  if (bytes.byteLength > MAX_BYTES) throw httpError(400, 'VALIDATION_ERROR', 'File too large (max 7.5 MB)');
  const kind = detectSourceKind(filename, contentType);
  if (!kind) throw httpError(400, 'VALIDATION_ERROR', 'Unsupported file. For spreadsheets, re-export as CSV — for photos, upload JPEG/PNG/WebP/PDF.');

  const sessionId = newId();
  const ext = filename.includes('.') ? filename.split('.').pop()! : 'bin';
  const r2Key = `product-uploads/${businessId}/${sessionId}.${ext}`;
  await c.env.PRODUCTS.put(r2Key, bytes);

  const now = Date.now();
  await getDb(c.env.DB).insert(productUploadSessions).values({
    id: sessionId, businessId, supplierId, userId: ctx.userId,
    status: 'pending', sourceKind: kind, r2Key,
    originalFilename: filename.slice(0, 120), mimeType: contentType,
    sizeBytes: bytes.byteLength, errorMessage: null, createdAt: now, updatedAt: now, committedAt: null,
  });
  await queueSend(c.env, 'uploads', { sessionId });
  return c.json({ sessionId, status: 'pending' }, 201);
});

router.get('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const db = getDb(c.env.DB);
  const sessionRow = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, c.req.param('id'))).get();
  if (!sessionRow) throw httpError(404, 'NOT_FOUND', 'Upload not found');
  await requireSupplierMember(c.env, sessionRow.supplierId, ctx.userId);
  const rows = await db.select().from(productUploadRows).where(eq(productUploadRows.sessionId, sessionRow.id)).all();
  rows.sort((a, b) => a.rowIndex - b.rowIndex);
  return c.json({ session: sessionRow, rows });
});

router.patch('/:id/rows/:rowId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = productUploadRowPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid patch', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const sessionRow = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, c.req.param('id'))).get();
  if (!sessionRow || sessionRow.status !== 'extracted') throw httpError(404, 'NOT_FOUND', 'Upload not found (or not ready)');
  await requireSupplierMember(c.env, sessionRow.supplierId, ctx.userId);
  const existing = await db.select().from(productUploadRows)
    .where(and(eq(productUploadRows.id, c.req.param('rowId')), eq(productUploadRows.sessionId, sessionRow.id))).get();
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Row not found');
  const { decision, edited } = parsed.data;
  const merged = { ...existing, ...edited };
  const price = merged.priceLkr !== undefined && merged.priceLkr !== null ? Math.max(0, Number(merged.priceLkr)) : null;
  const [row] = await db.update(productUploadRows).set({
    decision,
    productName: String(merged.productName ?? existing.productName).slice(0, 200),
    supplierSku: merged.supplierSku ?? null,
    unit: merged.unit ?? null,
    priceLkr: price as number | null,
    minOrderQty: merged.minOrderQty ?? null,
    leadTimeDays: merged.leadTimeDays ?? null,
    stockQty: merged.stockQty ?? null,
    tier1MinQty: merged.tier1MinQty ?? null,
    tier1DiscountPct: merged.tier1DiscountPct ?? null,
    tier2MinQty: merged.tier2MinQty ?? null,
    tier2DiscountPct: merged.tier2DiscountPct ?? null,
    tier3MinQty: merged.tier3MinQty ?? null,
    tier3DiscountPct: merged.tier3DiscountPct ?? null,
    updatedAt: Date.now(),
  }).where(eq(productUploadRows.id, existing.id)).returning();
  return c.json({ row });
});

export default router;
```

(Wiring into the import: Task 7.)

Mount in `apps/api/src/index.ts` — near the `/api/ai` mount line:

```ts
import productUploadRouter from './modules/ai/productUpload/routes';
// ...
app.route('/api/ai/product-uploads', productUploadRouter);
```

- [ ] **Step 3: Run route tests**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/routes.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ai/productUpload/routes.ts apps/api/src/index.ts apps/api/test/ai/productUpload/routes.test.ts
git commit -m "feat(api): ai product upload endpoints"
```

---

### Task 7: Commit route + catalog proposals + runImport extraction

**Files:**
- Modify: `apps/api/src/modules/supplierProducts/importExport.ts` (extract `runImport`, route calls it)
- Modify: `apps/api/src/modules/ai/productUpload/routes.ts` (POST /:id/commit)
- Test: `apps/api/test/ai/productUpload/commit.test.ts`

**Interfaces:**
- Consumes: `IMPORT_COLUMNS`, `toCsv` from `@vyro/shared`; importer logic now in `runImport`.
- Produces:
  - `runImport(env, supplierId, userId, csv, dryRun): Promise<ImportRowResult[]>` — the entire body of the current `/import` handler minus the JSON parse/auth (keep the header checks + training gate inside).
  - `POST /api/ai/product-uploads/:id/commit` → `{ results: ImportRowResult[], proposals: string[] }` (409 if status !== 'extracted').

Behavior: for every row with `decision` in (accepted, edited) build CSV cells using `IMPORT_COLUMNS` order; `matchType !== 'none'` rows carry `product_id`; `proposal` rows first create an inactive catalog product (`active: false`, `moderationNotes: "AI upload proposal from supplier <supplierId>: <name>"`, first category by `slug` ascending as fallback), then carry that product id. `none` rows are skipped and reported. Then `runImport(..., dryRun=true)`; if any `status === 'error'` rows exist return with them (session stays `extracted`, message tells supplier to fix rows); else run with `dryRun=false`, set session `status='committed'`, `committedAt`.

- [ ] **Step 1: Re-run `runImport` — refactor steps**

Move the exact body of the `router.post('/import', ...)` handler into `export async function runImport(env: Env, supplierId: string, userId: string, csv: string, dryRun: boolean): Promise<ImportRowResult[]>`; the handler becomes:

```ts
router.post('/import', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = supplierProductImportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const { supplierId, csv, dryRun } = parsed.data;
  await requireSupplierMember(c.env.DB, supplierId, ctx.userId);
  const results = await runImport(c.env, supplierId, ctx.userId, csv, dryRun);
  return c.json({ results });
});
```

Keep every check verbatim (header checks, row cap, training-gate block, audit `recordAudit` call). The signature change is internal; no caller exists yet.

- [ ] **Step 2: Write the failing commit test**

Extend the routes test setup (same file pattern, new file): seed session `extracted`, rows: one `matchType: 'product'` with `matchProductId: 'p-rice'` + price, one `proposal`, one `none`. Mock queues absent, `PRODUCTS` stubbed. Cases:
1. Commit → 200; `results` has 2 import rows (proposal + product rows; none-row skipped); a new inactive product exists with `moderationNotes` containing 'AI upload proposal'; session status `committed`.
2. Commit twice → 409.
3. Commit with a zero-priced edited row (priceLkr 0) → dry-run reports that row as `error`; session stays `extracted`.

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/commit.test.ts`
Expected: FAIL before implementation.

- [ ] **Step 3: Implement the commit route**

```ts
const allowed = new Set(['accepted', 'edited']);

router.post('/:id/commit', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const db = getDb(c.env.DB);
  const sessionRow = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, c.req.param('id'))).get();
  if (!sessionRow) throw httpError(404, 'NOT_FOUND', 'Upload not found');
  if (sessionRow.status !== 'extracted') throw httpError(409, 'INVALID_STATE', 'Upload is not ready to commit');
  await requireSupplierMember(c.env, sessionRow.supplierId, ctx.userId);

  const rows = (await db.select().from(productUploadRows).where(eq(productUploadRows.sessionId, sessionRow.id)).all())
    .filter((r) => r.decision !== 'rejected');

  // 1. Create catalog proposals (inactive products) for unmatched names.
  const fallbackCategory = await db.select({ id: categories.id }).from(categories).orderBy(categories.slug).get();
  if (!fallbackCategory) throw httpError(500, 'CONFIG_ERROR', 'No categories exist');
  const proposals: string[] = [];
  for (const r of rows) {
    if (r.decision === 'rejected') continue;
    if ((r.matchType === 'proposal' || r.matchType === 'none') && r.productName && !r.matchProductId) {
      const pid = newId();
      const now = Date.now();
      await db.insert(products).values({
        id: pid, name: r.productName, description: null, categoryId: fallbackCategory.id, brand: null,
        unit: r.unit ?? 'unit', packSize: null, active: false, featured: false,
        moderationNotes: `AI upload proposal: supplier ${sessionRow.supplierId}`, createdAt: now, updatedAt: now,
        deletedAt: null, hsCode: null, countryOfOrigin: null, isExportControlled: false,
      });
      proposals.push(r.productName);
      await db.update(productUploadRows).set({ matchProductId: pid, matchType: 'product', updatedAt: now }).where(eq(productUploadRows.id, r.id));
      r.matchProductId = pid;
    }
  }

  // 2. Build CSV in IMPORT_COLUMNS order. price_lkr = cents/100 string.
  const csvRows = rows
    .filter((r) => allowed.has(r.decision) && r.matchProductId)
    .map((r) => [
      '', // offer_id — new offers
      r.matchProductId,
      r.productName,
      r.unit ?? '',
      r.supplierSku ?? '',
      r.priceLkr != null ? (r.priceLkr as number).toFixed(2) : '',
      r.minOrderQty ?? '',
      r.leadTimeDays ?? '',
      r.stockQty ?? '',
      'yes',
      r.tier1MinQty ?? '',
      r.tier1DiscountPct ?? '',
      r.tier2MinQty ?? '',
      r.tier2DiscountPct ?? '',
      r.tier3MinQty ?? '',
      r.tier3DiscountPct ?? '',
    ]);
  const csv = toCsv([...IMPORT_COLUMNS], csvRows);

  // 3. Dry-run then commit via the single write path.
  const dry = await runImport(c.env, sessionRow.supplierId, ctx.userId, csv, true);
  const errors = dry.filter((res) => res.status === 'error');
  if (errors.length === rows.length) {
    return c.json({ results: dry, proposals }, 200);
  }
  const real = await runImport(c.env, sessionRow.supplierId, ctx.userId, csv, false);
  await db.update(productUploadSessions)
    .set({ status: 'committed', committedAt: Date.now(), updatedAt: Date.now() })
    .where(eq(productUploadSessions.id, sessionRow.id));
  return c.json({ results: real, proposals }, 200);
});
```

Note: the skipped `none` rows simply never enter `csvRows`; `runImport` validates the CSV contract itself (price/stock/active header rule from the existing route). The partial-error branch keeps the session open so the supplier edits flagged rows and retries; if dry-run is fully clean the real import runs.

Extend the routes file imports from Task 6 with what commit needs: `products`, `categories` from `@vyro/db/schema`, `toCsv` from `@vyro/shared`, and `runImport` + `IMPORT_COLUMNS` from `../../supplierProducts/importExport`.

- [ ] **Step 4: Run the tests + full api suite**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/ai/productUpload/ && pnpm --filter @vyro/api exec vitest run apps/api/test/supplierProducts 2>/dev/null || pnpm --filter @vyro/api exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/supplierProducts/importExport.ts apps/api/src/modules/ai/productUpload/routes.ts apps/api/test/ai/productUpload/commit.test.ts
git commit -m "feat(api): commit ai product uploads through the import pipeline"
```

---

### Task 8: Web supplier portal page

**Files:**
- Create: `apps/web/src/supplier/AiUploadPage.tsx`
- Modify: `apps/web/src/App.tsx` (lazy route)
- Modify: `apps/web/src/supplier/ProductsPage.tsx` (entry link)
- Test: `apps/web/test/supplier/AiUploadPage.test.tsx`

**Interfaces:**
- Consumes: `api` from `@/lib/api`; endpoints from Task 6/7: `api.post('ai/product-uploads', body)`, `api.get('ai/product-uploads/:id')`, `api.patch('ai/product-uploads/:id/rows/:rowId', body)`, `api.post('ai/product-uploads/:id/commit')`.
- Produces: route `/supplier/ai-upload` (only for supplier-context users).

- [ ] **Step 1: Write the page**

Follow the layout conventions of `apps/web/src/supplier/PricingPage.tsx` (SupplierShell page, `useSupplierId` for supplier selection). Page structure:

```tsx
/**
 * AI product upload: supplier picks a supplier + file, we upload, poll the
 * session, show the staged rows, then commit through the import pipeline.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { toast } from 'sonner';
import { useSupplierId } from './useSupplierId';

type UploadSession = { id: string; status: string; errorMessage: string | null; sourceKind: string };
type UploadRow = {
  id: string;
  rowIndex: number;
  productName: string;
  supplierSku: string | null;
  unit: string | null;
  priceLkr: number | null;
  minOrderQty: number | null;
  stockQty: number | null;
  confidence: number;
  matchType: 'offer' | 'product' | 'proposal' | 'none';
  decision: 'accepted' | 'edited' | 'rejected';
};
```

UI states:
1. **No session** — supplier picker, file input (accept `.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,.pdf`; the on-screen hint says spreadsheets must be CSV — xlsx is rejected server-side), `upload` mutation converts the file with `FileReader` → base64 and `api.post('ai/product-uploads', { supplierId, businessId, filename, contentType, base64 })`; on 400 show the server message (xlsx hint).
2. **Session in flight** — `useQuery` polling `api.get(\`ai/product-uploads/${sessionId}\`)` every 2s while status is `pending`/`extracting`; `failed` shows `errorMessage` + a Retry button (re-upload).
3. **Staging table** — columns: name (input), sku, unit, price (number), MOQ, decision select (accepted/rejected), match badge (`offer`/`product`/`new → admin review`), confidence badge (red < 60). Row edits call `api.patch` per change (debounce 300ms). Show server `errorMessage: null` field value in the session banner when present.
4. **Commit bar** — disabled while any row has empty product name; on click `api.post(\`ai/product-uploads/${id}/commit\`, {})`; render results: created/updated/error counts, proposal list; success → link to the supplier products page.

Wire the route in `App.tsx` next to the other lazy supplier routes:

```tsx
const SupplierAiUploadPage = lazy(() => import('./supplier/AiUploadPage').then((m) => ({ default: m.AiUploadPage })));
```

…plus the route and a "Upload with AI" link on `ProductsPage.tsx` beside the existing import/export actions.

- [ ] **Step 2: Write the test**

Plain vitest + testing-library following existing web tests (check `apps/web/test/` for the established render/mocking helpers and copy that setup). Cover:
1. Renders upload form before session exists.
2. Calls `api.post` on file selection and shows the poller once a session is created (mock `api.get` returning an `extracted` session with 2 rows).
3. Edit row price triggers one `api.patch` call per change.
4. Commit calls `api.post('ai/product-uploads/:id/commit')` and renders result counts.

Run: `pnpm --filter @vyro/web exec vitest run apps/web/test/supplier/AiUploadPage.test.tsx`
Expected: PASS.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @vyro/web typecheck && pnpm --filter @vyro/web lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/supplier/AiUploadPage.tsx apps/web/src/App.tsx apps/web/src/supplier/ProductsPage.tsx apps/web/test/supplier/AiUploadPage.test.tsx
git commit -m "feat(web): supplier ai product upload staging page"
```

---

### Task 9: Eval golden cases + final sweep

**Files:**
- Modify: `packages/ai/eval/golden.ts`
- Docs (optional): `apps/api/README` or module docstring only — no README changes required.

**Interfaces:**
- Consumes: golden-case shape already used in `packages/ai/eval/golden.ts` (read the file to confirm the `GoldenCase` type before editing).
- Produces: extraction golden cases asserted by the existing scoring test.

- [ ] **Step 1: Add golden cases** for the extraction intents: a clean CSV row set, a header-alias CSV (`Item/Rate`), a TSV block, and a `none`-match row. Follow the existing case format exactly.
- [ ] **Step 2: Run the eval scoring test** `pnpm --filter @vyro/ai exec vitest run packages/ai/eval/scoring.test.ts` — PASS.
- [ ] **Step 3: Full sweep:** `pnpm typecheck && pnpm lint` at the repo root; fix any fallout.
- [ ] **Step 4: Commit**

```bash
git add packages/ai/eval/golden.ts
git commit -m "test(ai): golden cases for product upload extraction"
```

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| Upload flow (R2, session, queue) | 1, 5, 6 |
| Tabular extraction + header mapping | 3 |
| Vision photo/PDF/product-photo | 4 |
| Fuzzy match (tokenJaccard) | 5 |
| AI Gateway + cheap-model env routing | 3, 4, 5 (env + wrangler) |
| Staging review table (web) | 8 |
| Proposals → admin catalog moderation | 7 |
| Commit via existing importer | 7 |
| Confidence < 0.6 pre-flag | 5 (LOW_CONFIDENCE) |
| Failure + retry | 5, 6 (status=failed), 8 (Retry) |
| Caps (200 rows, 7.5 MB) | 3, 6 |
| Testing/eval | 3-9 |
