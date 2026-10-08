# Doc-Invoice Auto-Reconcile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect supplier-invoice uploads to purchase orders so reconciliation runs automatically after OCR, exceptions land in the finance queue, and the order page shows the persisted result.

**Architecture:** `upload-direct` gains an optional `purchaseOrderId` (validated against the buyer's business and PO ownership/status). The invoices queue consumer persists OCR line items + auto-categorization when the upload is PO-linked, then a new `reconcileIfLinked` helper runs the existing 3-way matcher, stores the payload on the upload row, and on discrepancy fans out a buyer notification plus a `reconciliation_exceptions` row. The web card hydrates the persisted payload from a new `GET /api/documents/by-po/:poId/auto-reconciliation` and gets an upload entry point.

**Tech Stack:** Hono + Cloudflare Workers + D1 (API), Drizzle, Vitest (`makeD1`/`applyMigrations`), React + React Query (web).

## Global Constraints

- No new dependencies.
- Spec: `docs/superpowers/specs/2026-10-08-doc-intel-auto-reconcile-design.md`.
- The matcher stays untouched: `matchThreeWayReconciliation` and `runThreeWayReconciliation` (in `apps/api/src/modules/reconciliation/reconciliationService.ts`, pure matcher in `packages/ai/src/reconciliation`) are consumed as-is.
- Web API calls via the `api` wrapper (`@/lib/api`); paths never start with `/api`. Multipart uploads go through `fetch(apiBase + …)` directly (existing pattern in `InvoiceUploadPage.tsx`).
- API route tests use `makeD1` + `applyMigrations` from `apps/api/test/helpers/d1.ts`, mount routers on a Hono app with the `errorEnvelope` handler, and mock the session middleware.
- Commit per task with explicit paths (never `git add -A`); the user has authorized per-task commits for this workstream.
- `upload-direct` is multipart only (`foto: file` field) — SKU-style JSON body does not apply.

---

### Task 1: Migration + schema columns

**Files:**
- Create: `packages/db/migrations/0055_invoice_upload_reconciliation.sql`
- Modify: `packages/db/src/schema/invoiceUploads.ts`

**Interfaces:**
- Produces: `invoiceUploads.purchaseOrderId`, `invoiceUploads.reconciliationStatus` (`'none' | 'passed' | 'discrepancy' | 'failed'`, default `'none'`), `invoiceUploads.reconciliationJson` (nullable text JSON). Used by Tasks 2-6.

- [ ] **Step 1: Write the migration**

```sql
-- 0055_invoice_upload_reconciliation.sql
-- Doc-intel v2 phase A: link invoice uploads to POs, auto-run 3-way
-- reconciliation after OCR, and persist the result for the order page card.
ALTER TABLE invoice_uploads ADD COLUMN purchase_order_id TEXT REFERENCES purchase_orders(id);
ALTER TABLE invoice_uploads ADD COLUMN reconciliation_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE invoice_uploads ADD COLUMN reconciliation_json TEXT;
CREATE INDEX invoice_uploads_po_idx ON invoice_uploads(purchase_order_id, created_at);
```

- [ ] **Step 2: Add the columns to the Drizzle schema**

In `packages/db/src/schema/invoiceUploads.ts`, extend the table with (import `purchaseOrders` from `./purchaseOrders`):

```ts
    purchaseOrderId: text('purchase_order_id').references(() => purchaseOrders.id),
    reconciliationStatus: text('reconciliation_status', {
      enum: ['none', 'passed', 'discrepancy', 'failed'],
    })
      .notNull()
      .default('none'),
    reconciliationJson: text('reconciliation_json'),
```

and add to the index builder:

```ts
    poIdx: index('invoice_uploads_po_idx').on(t.purchaseOrderId, t.createdAt),
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @vyro/db typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0055_invoice_upload_reconciliation.sql packages/db/src/schema/invoiceUploads.ts
git commit -m "feat(db): invoice upload po link and reconciliation columns"
```

---

### Task 2: upload-direct accepts purchaseOrderId

**Files:**
- Modify: `apps/api/src/modules/documents/repository.ts` (`createUpload` input)
- Modify: `apps/api/src/modules/documents/routes.ts` (`/upload-direct`)
- Test: `apps/api/test/documents/uploadDirectPo.test.ts`

**Interfaces:**
- Consumes: `createUpload(env, input)` from `documents/repository.ts` (adds `purchaseOrderId?: string | null`); session ctx shape `{ userId, businesses: [{ businessId, role }] }` from the mocked session.
- Produces: uploads can carry a PO reference; `POST /api/documents/upload-direct` with field `purchaseOrderId` (string) → stored on the row; 404 when the PO is missing; 403 when the PO belongs to another business; 400 when the PO is not delivered/completed.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../../helpers/d1';

let app: Hono;
let sessionCtx: any = null;

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

const env: any = { DB: null, INVOICES: null, AUDIT_QUEUE: undefined, NOTIFICATIONS_QUEUE: undefined, UPLOADS_QUEUE: undefined, INVOICES_QUEUE: undefined, METRICS: undefined, ENVIRONMENT: 'test' };
const ids: Record<string, any> = {};

const buyerCtx = () => ({ userId: 'u-b', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });

function multipart(purchaseOrderId?: string): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3, 4])], 'inv.png', { type: 'image/png' }));
  form.append('supplierId', 'null');
  if (purchaseOrderId) form.append('purchaseOrderId', purchaseOrderId);
  // avoid the supplierId NOT NULL-ish handling: use empty string to skip
  return form;
}

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  env.INVOICES = { put: async () => null, get: async () => null };
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => c.json(errorEnvelope(err).body, errorEnvelope(err).status as any));
  const router = (await import('../../src/modules/documents/routes')).default;
  app.route('/api/documents', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values({ id: 'u-b', email: 'b@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'rest', name: 'Rest', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '1', email: 'b@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '1', email: 'su@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz, userId: 'u-b', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  ids.biz = biz;
  ids.sup = sup;
  const del = newId();
  await db.insert(schema.purchaseOrders).values({ id: del, poNumber: 'PO-DOC-1', businessId: biz, supplierId: sup, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-b', createdAt: now, updatedAt: now });
  const drafting = newId();
  await db.insert(schema.purchaseOrders).values({ id: drafting, poNumber: 'PO-DOC-2', businessId: biz, supplierId: sup, status: 'drafting', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-b', createdAt: now, updatedAt: now });
  ids.poDelivered = del;
  ids.poDrafting = drafting;
}, 60000);

async function post(form: FormData) {
  return app.fetch(new Request('http://localhost/api/documents/upload-direct', { method: 'POST', body: form }), env);
}

describe('POST /api/documents/upload-direct with purchaseOrderId', () => {
  it('stores the po reference on a delivered PO', async () => {
    sessionCtx = buyerCtx();
    const res = await post(multipart(ids.poDelivered));
    expect(res.status).toBe(201);
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const upload = (await db.select().from(schema.invoiceUploads).all())[0]! as any;
    expect(upload.purchaseOrderId).toBe(ids.poDelivered);
    expect(upload.reconciliationStatus).toBe('none');
  });

  it('rejects a PO owned by another business with 403', async () => {
    sessionCtx = buyerCtx();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const bt = (await db.select().from(schema.businessTypes).all())[0]!;
    const otherBiz = newId();
    await db.insert(schema.businesses).values({ id: otherBiz, name: 'B2', businessTypeId: bt.id, contactPerson: 'B', phone: '1', email: 'b2@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
    const sup = (await db.select().from(schema.suppliers).all())[0]!;
    const foreignPo = newId();
    await db.insert(schema.purchaseOrders).values({ id: foreignPo, poNumber: 'PO-DOC-3', businessId: otherBiz, supplierId: sup.id, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: 'x', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-b', createdAt: now, updatedAt: now });
    const res = await post(multipart(foreignPo));
    expect(res.status).toBe(403);
  });

  it('rejects POs not yet delivered with 400', async () => {
    sessionCtx = buyerCtx();
    const res = await post(multipart(ids.poDrafting));
    expect(res.status).toBe(400);
  });

  it('accepts uploads without a PO reference unchanged', async () => {
    sessionCtx = buyerCtx();
    const res = await post(multipart());
    expect(res.status).toBe(201);
  });
});
```

Note for the implementer: the existing `upload-direct` casts `supplierId` from the form and passes null when absent — keep that behavior; `multipart()` above appends `'null'` as a string for `supplierId`, so tighten it by omitting the append entirely (delete that line). Only the `purchaseOrderId` handling is new.

- [ ] **Step 2: Extend createUpload**

In `apps/api/src/modules/documents/repository.ts`, add `purchaseOrderId?: string | null` to the input type and to the `values({ … })` insert:

```ts
    supplierId: input.supplierId ?? null,
    purchaseOrderId: input.purchaseOrderId ?? null,
```

- [ ] **Step 3: Implement the route handling**

In `apps/api/src/modules/documents/routes.ts` right after the `supplierId` parsing block:

```ts
  const poIdRaw = form.get('purchaseOrderId');
  const purchaseOrderId = typeof poIdRaw === 'string' && poIdRaw.length > 0 ? poIdRaw : null;
  if (purchaseOrderId) {
    const { purchaseOrders } = await import('@vyro/db/schema');
    const po = await getDb(c.env.DB).select().from(purchaseOrders).where(eq(purchaseOrders.id, purchaseOrderId)).get();
    if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');
    if (po.businessId !== businessId) throw httpError(403, 'FORBIDDEN', 'Not your purchase order');
    if (po.status !== 'delivered' && po.status !== 'completed') {
      throw httpError(400, 'VALIDATION_ERROR', 'Invoices can be attached once the order is delivered');
    }
  }
```

and pass `purchaseOrderId` into `createUpload(c.env, { … })`. (`purchaseOrders` is already imported near the top of the file if present — check imports; add `eq` import from drizzle-orm if missing.)

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && pnpm exec vitest run test/documents/uploadDirectPo.test.ts`
Expected: PASS.

- [ ] **Step 5: Full documents tests + typecheck**

Run: `cd apps/api && pnpm exec tsc --noEmit && pnpm exec vitest run test/documents/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/documents/repository.ts apps/api/src/modules/documents/routes.ts apps/api/test/documents/uploadDirectPo.test.ts
git commit -m "feat(documents): link uploads to delivered purchase orders"
```

---

### Task 3: Auto-stage OCR line items for linked uploads

**Files:**
- Create: `apps/api/src/modules/documents/autoStage.ts`
- Modify: `apps/api/src/queue/invoiceOcr.ts`
- Test: `apps/api/test/documents/autoStage.test.ts`

**Interfaces:**
- Consumes: `runOcr` result shape `{ items: [{description, quantity?, unit?, unitPriceCents?, totalCents?}], confidence }`; `categorizeItems(input, mappings, businessId)` from `@vyro/ai`; `listMappingsForBusiness(env, businessId)` from `documents/repository.ts`; `invoiceLineItems`, `invoiceUploads` schema.
- Produces: `persistOcrLines(env, upload: { id, businessId }, items): Promise<{ staged: number }>` — deletes prior rows and inserts one `invoice_line_items` row per OCR item with `categorySource: 'rule'` categories (distinct from the manual review path, which keeps using `saveReviewedLines`). Consumer calls it only for uploads with `purchaseOrderId` and `status === 'ready'` (confidence ≥ 60 per the existing threshold). Line items keep the un-linked flow untouched.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { persistOcrLines } from '../../src/modules/documents/autoStage';

const items = [
  { description: 'Basmati Rice 5kg', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000 },
  { description: 'White Sugar 1kg', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000 },
];

async function seedUpload(db: ReturnType<typeof import('@vyro/db')['getDb']>) {
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const now = Date.now();
  const userId = newId();
  await db.insert(schema.users).values({ id: userId, email: `${userId}@t`, passwordHash: 'x', name: 'u', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null });
  const btId = newId();
  await db.insert(schema.businessTypes).values({ id: btId, slug: `t-${btId}`, name: 'T', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: btId, contactPerson: 'B', phone: '1', email: 'b@t', address: 'x', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const uploadId = newId();
  await db.insert(schema.invoiceUploads).values({ id: uploadId, businessId: biz, uploadedByUserId: userId, status: 'ready', r2Key: 'k', mimeType: 'image/png', originalFilename: 'i.png', sizeBytes: 4, createdAt: now } as any);
  return { biz, uploadId };
}

describe('persistOcrLines', () => {
  it('stages rule-categorized line items for the upload', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { makeD1, applyMigrations } = await import('../helpers/d1');
    const d1 = makeD1();
    await applyMigrations(d1);
    const env: any = { DB: d1 };
    const { biz, uploadId } = await seedUpload(getDb(d1));
    const out = await persistOcrLines(env, { id: uploadId, businessId: biz }, items);
    expect(out.staged).toBe(2);
    const rows = await getDb(d1).select().from(schema.invoiceLineItems).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.categorySource === 'rule')).toBe(true);
    expect(rows.every((r: any) => r.categorySlug && r.categorySlug.length > 0)).toBe(true);
  });

  it('re-staging replaces previous rows instead of duplicating', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { makeD1, applyMigrations } = await import('../helpers/d1');
    const d1 = makeD1();
    await applyMigrations(d1);
    const env: any = { DB: d1 };
    const { biz, uploadId } = await seedUpload(getDb(d1));
    await persistOcrLines(env, { id: uploadId, businessId: biz }, items);
    await persistOcrLines(env, { id: uploadId, businessId: biz }, items);
    const rows = await getDb(d1).select().from(schema.invoiceLineItems).all();
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Implement `persistOcrLines`**

```ts
import { categorizeItems, type CategorySlug } from '@vyro/ai';
import { getDb } from '@vyro/db';
import { invoiceLineItems } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';
import { listMappingsForBusiness } from './repository';

type OcrItem = { description: string; quantity?: number | undefined; unit?: string | undefined; unitPriceCents?: number | undefined; totalCents?: number | undefined };

/**
 * Stage OCR-extracted line items immediately for PO-linked uploads so
 * reconciliation can run without waiting for a human review pass.
 * Idempotent: prior rows for the upload are replaced.
 */
export async function persistOcrLines(
  env: Env,
  upload: { id: string; businessId: string },
  items: OcrItem[],
): Promise<{ staged: number }> {
  const db = getDb(env.DB);
  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.uploadId, upload.id));
  if (!items.length) return { staged: 0 };

  const mappings = await listMappingsForBusiness(env, upload.businessId);
  const auto = categorizeItems(
    items.map((it) => ({ description: it.description })),
    mappings as never,
    upload.businessId,
  );
  const byDesc = new Map(auto.map((r) => [r.description.toLowerCase().trim(), r.categorySlug]));

  const rows = items.map((it, i) => ({
    id: newId(),
    uploadId: upload.id,
    businessId: upload.businessId,
    lineNumber: i + 1,
    description: it.description,
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    unitPriceCents: it.unitPriceCents ?? null,
    totalCents: it.totalCents ?? null,
    categorySlug: byDesc.get(it.description.toLowerCase().trim()) ?? ('other' as CategorySlug),
    categorySource: 'rule' as const,
    productId: null,
  }));
  await db.insert(invoiceLineItems).values(rows);
  return { staged: rows.length };
}
```

Note for the implementer: confirm `listMappingsForBusiness`'s exact signature by reading `documents/repository.ts:60-90` before wiring (adjust the call site rather than the helper). `categorizeItems` input shape comes from `packages/ai/src/analytics/categorize.ts` — mirror the call in `documents/routes.ts:144` exactly.

- [ ] **Step 3: Wire the consumer**

In `apps/api/src/queue/invoiceOcr.ts` inside `processUpload`, after the row update that sets `newStatus`, add:

```ts
    if (upload.purchaseOrderId && newStatus === 'ready' && result.items.length > 0 && upload.businessId) {
      const { persistOcrLines } = await import('../modules/documents/autoStage');
      const { reconcileIfLinked } = await import('../modules/documents/reconcile');
      await persistOcrLines(env, { id: uploadId, businessId: upload.businessId }, result.items);
      await reconcileIfLinked(env, uploadId);
    }
```

(`reconcileIfLinked` arrives in Task 4 — keep this wiring behind a feature-neutral guard; if Task 3 lands before Task 4, the import throws at runtime, so implementers must apply Task 3 and Task 4 consumer wiring together. split: put this consumer wiring in Task 4 instead.)

**Revised wiring placement:** leave `invoiceOcr.ts` untouched in Task 3; the consumer integration happens in Task 4 after `reconcileIfLinked` exists.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/api && pnpm exec tsc --noEmit && pnpm exec vitest run test/documents/autoStage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/documents/autoStage.ts apps/api/test/documents/autoStage.test.ts
git commit -m "feat(documents): auto-stage ocr line items for po-linked uploads"
```

---

### Task 4: reconcileIfLinked + consumer integration

**Files:**
- Create: `apps/api/src/modules/documents/reconcile.ts`
- Modify: `apps/api/src/queue/invoiceOcr.ts`
- Test: `apps/api/test/documents/reconcileLinked.test.ts`

**Interfaces:**
- Consumes: `runThreeWayReconciliation(env, orderId, { invoiceUploadId })` from `../reconciliation/reconciliationService`; `ThreeWayResolutionResult` payload has `lines` (each with `status`), `netDifferenceCents`, `invoiceTotalCents`, `poTotalCents`, `isDeliveryConfirmed` (verify exact field names in `packages/ai/src/reconciliation/types.ts` — `ThreeWayReconciliationResult`).
- Produces:
  - `reconcileIfLinked(env, uploadId): Promise<void>` — no-op unless the upload has `purchaseOrderId` and OCR ended `ready` with line items; otherwise: run matcher → persist `reconciliationStatus` (`passed` when every line `matched` AND `netDifferenceCents === 0`, `discrepancy` when mismatches exist, `failed` on throw) + `reconciliationJson`; on `discrepancy`: buyer org notification + admin exception row.
  - Consumer wiring above (from Task 3's revised note).

**Notification payload** (uses `notifyBusinessOrg(env.DB, env.NOTIFICATIONS_QUEUE, po.businessId, payload)` from `../notifications/dispatcher`):

```ts
const payload = {
  type: 'order.reconciliation.discrepancy',
  title: `Invoice mismatch on PO ${po.poNumber}`,
  body: `Automated invoice check found a difference of Rs. ${(Math.abs(result.netDifferenceCents) / 100).toFixed(2)} vs the approved order. Review before release.`,
  link: `/orders/${po.id}`,
};
```

**Exception row** (kind `amount_mismatch`, matching `reconciliation_exceptions` conventions used by `submitReconciliationClaim`, `apps/api/src/modules/reconciliation/reconciliationService.ts:203`):

```ts
await db.insert(reconciliationExceptions).values({
  id: newId(),
  kind: 'amount_mismatch',
  severity: 'warning',
  entityType: 'purchase_order',
  entityId: po.id,
  expectedCents: result.poTotalCents,
  actualCents: result.invoiceTotalCents,
  differenceCents: result.netDifferenceCents,
  status: 'open',
  createdAt: Date.now(),
  // remaining NOT NULL columns: copy exactly from submitReconciliationClaim's insert
});
```

Note: the `existing` check (a prior exception for the same `entityId`) keeps re-delivered queue messages from stacking duplicate exceptions.

- [ ] **Step 1: Write the failing integration test**

Seed (makeD1 + applyMigrations): user, businessType, business, supplier, businessMember; PO (`delivered`, totalCents 10000), delivery row (`delivered`, deliveredAt set), invoice upload (status `ready`, confidence-satisfied; set `purchaseOrderId`), two `invoice_line_items` rows: one matching a PO item at the PO price, one 20% above PO price. PO items: 2 rows matching the line descriptions (use product names tokenize matches: 'Basmati Rice 5kg' and 'White Sugar 1kg' — keep identical casing for the deterministic matcher).

Cases:
1. `reconcileIfLinked` runs, upload gets `reconciliationStatus: 'discrepancy'`, `reconciliationJson` parses, one open `reconciliation_exceptions` row exists (`entityId = po.id`), and a `notifications` row exists for the buyer user with type `order.reconciliation.discrepancy`.
2. All-matched fixture → `reconciliationStatus: 'passed'`, no exception, no notification.
3. Upload without purchaseOrderId → no status change stays `none`, no exception.
4. PO in `drafting` (spec: wrong PO status) → `reconciliationStatus: 'failed'`, JSON contains the failure message, no exception.

The env passed to `reconcileIfLinked` needs `NOTIFICATIONS_QUEUE: undefined` and a `DB`; the notification dispatcher degrades gracefully (verify `notifyBusinessOrg` catch behavior) — if it throws on missing queue, pass `NOTIFICATIONS_QUEUE: { send: async () => {} }`.

- [ ] **Step 2: Implement `reconcile.ts`**

```ts
import { getDb } from '@vyro/db';
import { invoiceUploads, purchaseOrders, reconciliationExceptions } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';
import { runThreeWayReconciliation } from '../reconciliation/reconciliationService';
import { notifyBusinessOrg } from '../notifications/dispatcher';

/**
 * Auto-reconciliation for PO-linked invoice uploads. Runs the existing 3-way
 * matcher, persists the outcome on the upload row, and on discrepancy fans
 * out a buyer notification plus a finance-queue exception row. Every failure
 * degrades into reconciliationStatus 'failed' — this path never throws into
 * the queue consumer's retry loop.
 */
export async function reconcileIfLinked(env: Env, uploadId: string): Promise<void> {
  const db = getDb(env.DB);
  const upload = await db.select().from(invoiceUploads).where(eq(invoiceUploads.id, uploadId)).get();
  if (!upload?.purchaseOrderId) return;

  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, upload.purchaseOrderId)).get();
  try {
    if (!po) throw new Error('Purchase order no longer exists');
    if (po.status !== 'delivered' && po.status !== 'completed') {
      throw new Error('Order must be delivered before invoice reconciliation');
    }

    const result = await runThreeWayReconciliation(env, upload.purchaseOrderId, { invoiceUploadId: uploadId });
    const mismatches = result.lines.filter((l) => l.status !== 'matched');
    const hasPriceDiff = result.netDifferenceCents !== 0;
    const status = mismatches.length === 0 && !hasPriceDiff ? 'passed' : 'discrepancy';

    await db
      .update(invoiceUploads)
      .set({
        reconciliationStatus: status,
        reconciliationJson: JSON.stringify(result),
      })
      .where(eq(invoiceUploads.id, uploadId));

    if (status === 'discrepancy') {
      await notifyBusinessOrg(env.DB, env.NOTIFICATIONS_QUEUE as never, po.businessId, {
        type: 'order.reconciliation.discrepancy',
        title: `Invoice mismatch on PO ${po.poNumber}`,
        body: `Automated invoice check found a difference of Rs. ${(Math.abs(result.netDifferenceCents) / 100).toFixed(2)} vs the approved order. Review before release.`,
        link: `/orders/${po.id}`,
      });
      const existing = await db
        .select({ id: reconciliationExceptions.id })
        .from(reconciliationExceptions)
        .where(eq(reconciliationExceptions.entityId, po.id))
        .get();
      if (!existing) {
        await db.insert(reconciliationExceptions).values({
          id: newId(),
          kind: 'amount_mismatch',
          severity: Math.abs(result.netDifferenceCents) > 500_000 ? 'critical' : 'warning',
          entityType: 'purchase_order',
          entityId: po.id,
          expectedCents: result.poTotalCents,
          actualCents: result.invoiceTotalCents,
          differenceCents: result.netDifferenceCents,
          currency: po.currency,
          detail: JSON.stringify({ source: 'auto_reconcile', uploadId }),
          status: 'open',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  } catch (err) {
    await db
      .update(invoiceUploads)
      .set({
        reconciliationStatus: 'failed',
        reconciliationJson: JSON.stringify({ error: err instanceof Error ? err.message : 'reconcile failed' }),
      })
      .where(eq(invoiceUploads.id, uploadId));
  }
}
```

Fill the exception insert from `submitReconciliationClaim`, including an `entityType: 'purchase_order'` idempotency guard (`existing` check keeps re-delivered queue messages from stacking exceptions).

- [ ] **Step 3: Wire the consumer (completes Task 3's revised note)**

Apply the `invoiceOcr.ts` wiring from Task 3 Step 3 exactly.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && pnpm exec tsc --noEmit && pnpm exec vitest run test/documents/reconcileLinked.test.ts test/documents/autoStage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/documents/reconcile.ts apps/api/src/queue/invoiceOcr.ts apps/api/test/documents/reconcileLinked.test.ts
git commit -m "feat(documents): auto-run 3-way reconciliation for po-linked uploads"
```

---

### Task 5: Review route triggers re-reconciliation

**Files:**
- Modify: `apps/api/src/modules/documents/routes.ts` (`POST /:id/review`)
- Test: extend `apps/api/test/documents/reconcileLinked.test.ts`

**Interfaces:**
- Consumes: `saveReviewedLines` result (already updates the upload to `reviewed`); `reconcileIfLinked`.
- Produces: after a successful review submit on a PO-linked upload, reconciliation runs against the human-corrected line items (status may flip from the staged-result).

- [ ] **Step 1: Failing test** — seed a linked upload at `manual_required` whose line items (after review fix) are all-matched; submit `POST /api/documents/:id/review` with corrected lines; expect `reconciliationStatus: 'passed'` afterwards (no exception row).

- [ ] **Step 2: Implement** — in the review route, after `saveReviewedLines(...)`, re-tender the reconcile when PO-linked:

```ts
  const fresh = await getUpload(c.env, businessId, id); // returns row or null
  if (fresh?.purchaseOrderId) {
    const { reconcileIfLinked } = await import('./reconcile');
    await reconcileIfLinked(c.env, id);
  }
```

Note: `reconcileIfLinked` currently returns silently when `status !== 'ready'` — verified in Task 4 impl (the guard is only on `purchaseOrderId`; keep it that way, or if you added a status guard, relax it to allow `ready` and `reviewed`).

- [ ] **Step 3: Run tests + typecheck**

Run: `cd apps/api && pnpm exec tsc --noEmit && pnpm exec vitest run test/documents/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/documents/routes.ts apps/api/test/documents/reconcileLinked.test.ts
git commit -m "feat(documents): re-reconcile after manual invoice review"
```

---

### Task 6: Auto-reconciliation read endpoint

**Files:**
- Modify: `apps/api/src/modules/documents/routes.ts`
- Test: extend `apps/api/test/documents/uploadDirectPo.test.ts`

**Interfaces:**
- Produces: `GET /api/documents/by-po/:poId/auto-reconciliation` → member-gated against `purchaseOrders.businessId`:
  - no linked upload → `{ status: 'none' }`
  - linked upload → `{ status, payload, uploadId, createdAt }` where `status` is the upload's `reconciliationStatus` and `payload` is `JSON.parse(reconciliationJson)` (or `null`).

- [ ] **Step 1: Failing test cases**
  1. Member of the owning business + linked upload with persisted JSON → 200 `{ status: 'discrepancy', payload: {…}, uploadId }`.
  2. No linked uploads → `{ status: 'none' }`.
  3. Upload for another business's PO → 403.
  4. No session → 401 (ctx undefined).

- [ ] **Step 2: Implement**

```ts
router.get('/by-po/:poId/auto-reconciliation', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  const db = getDb(c.env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');
  const member = ctx.businesses.find((b) => b.businessId === po.businessId);
  if (!member) throw httpError(403, 'FORBIDDEN', 'Not your purchase order');

  const upload = await db
    .select({ id: invoiceUploads.id, status: invoiceUploads.reconciliationStatus, json: invoiceUploads.reconciliationJson, createdAt: invoiceUploads.createdAt })
    .from(invoiceUploads)
    .where(eq(invoiceUploads.purchaseOrderId, poId))
    .orderBy(desc(invoiceUploads.createdAt))
    .limit(1)
    .get();
  if (!upload || upload.status === 'none') return c.json({ status: 'none' });
  return c.json({
    status: upload.status,
    payload: upload.json ? JSON.parse(upload.json) : null,
    uploadId: upload.id,
    createdAt: upload.createdAt,
  });
});
```

Route-order note: Hono matches `/by-po/:poId/…` fine alongside `/:id` because the path depth differs, but place this before `router.get('/:id')` anyway and import `desc` from drizzle-orm.

- [ ] **Step 3: Run + commit**

```bash
cd apps/api && pnpm exec tsc --noEmit && pnpm exec vitest run test/documents/uploadDirectPo.test.ts
git add apps/api/src/modules/documents/routes.ts apps/api/test/documents/uploadDirectPo.test.ts
git commit -m "feat(documents): expose persisted reconcile result per po"
```

---

### Task 7: Web card hydration + upload entry point

**Files:**
- Modify: `apps/web/src/components/reconciliation/ThreeWayReconciliationCard.tsx` (auto hydrate + upload link)
- Modify: `apps/web/src/pages/InvoiceUploadPage.tsx` (append `purchaseOrderId` from `?poId=`)
- Test: `apps/web/test/reconciliation/AutoReconcileCard.test.tsx`

**Interfaces:**
- Consumes: `api.get(\`/documents/by-po/${orderId}/auto-reconciliation\`)`; existing upload page; `ThreeWayReconciliationResult` type re-exported from `@vyro/ai` (verify import path used today in the card).
- Produces: on mount, if no manual result has run in this session, hydrate `result` state from the endpoint payload when `status` is `passed`|`discrepancy`; failed → info line "Automatic check couldn't read that invoice — review the upload"; `none` → unchanged UI. Header gains an "Upload supplier invoice" button linking `/invoices/upload?poId=${orderId}`.

- [ ] **Step 1: InvoiceUploadPage query param**

```tsx
import { useSearchParams } from 'react-router-dom';
// inside the component:
const [params] = useSearchParams();
const poId = params.get('poId');
// in submit(), after form.append('file', file):
if (poId) form.append('purchaseOrderId', poId);
```

Landing hint when `poId` is present, above the dropzone:

```tsx
<p className="text-xs text-ink-3">Uploaded against PO {poId} — you'll see the reconciliation result here.</p>
```

- [ ] **Step 2: Card hydration**

Extend the card component:

```tsx
import { useEffect } from 'react';            // add to the existing react import
import { Link } from 'react-router-dom';      // add (card has no Link today)

const [hydrated, setHydrated] = useState(false);
const [autoChecked, setAutoChecked] = useState(false);
useEffect(() => {
  let cancelled = false;
  api
    .get<{ status: string; payload: ThreeWayReconciliationResult | null }>(
      `/documents/by-po/${orderId}/auto-reconciliation`,
    )
    .then((data) => {
      if (cancelled) return;
      if ((data.status === 'passed' || data.status === 'discrepancy') && data.payload) {
        setResult(data.payload);
        setAutoChecked(true);
      }
      setHydrated(true);
    })
    .catch(() => setHydrated(true));
  return () => {
    cancelled = true;
  };
}, [orderId]);
```

Render the uploaded-but-failed state as a hint line once `hydrated && autoChecked` is distinct from the manual run (track `autoChecked` in state, show "Checked automatically" next to the result header). Add the upload link in the header actions row:

```tsx
<Link to={`/invoices/upload?poId=${orderId}`} className="text-xs text-ink-3 underline">
  Upload supplier invoice
</Link>
```

- [ ] **Step 3: Web tests**

Follow the existing web conventions (static markup; `QueryClientProvider` + providers wrapper as in `apps/web/test/reviews/AdminReviewQueue.test.tsx`). `api` is mocked with `vi.mock('@/lib/api')`. Cases:
1. `AiUpload…` counterpart: `InvoiceUploadPage` renders with a dropzone (MemoryRouter).
2. Card with mocked api returning `status: 'discrepancy'` + payload → markup contains "Checked automatically" and a difference figure.

Run: `cd apps/web && pnpm exec vitest run test/reconciliation/AutoReconcileCard.test.tsx`
Expected: PASS.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter @vyro/web typecheck
git add apps/web/src/components/reconciliation/ThreeWayReconciliationCard.tsx apps/web/src/pages/InvoiceUploadPage.tsx apps/web/test/reconciliation/AutoReconcileCard.test.tsx
git commit -m "feat(web): auto-reconcile result hydration and invoice upload entry"
```

---

### Task 8: Final sweep

- [ ] Full API suite: `pnpm --filter @vyro/api test` — 250+ files green.
- [ ] `pnpm --filter @vyro/web test` — no new failures beyond the two pre-existing `memberSinceHero.test.tsx` failures owned by the parallel storefront workstream (verify they exist before this project too).
- [ ] All typechecks: `pnpm --filter @vyro/db typecheck && pnpm --filter @vyro/validation typecheck && pnpm --filter @vyro/api typecheck && pnpm --filter @vyro/web typecheck`.
- [ ] No commit needed unless fixes were made.

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| `purchaseOrderId` on upload (member + ownership + status gates) | 2 |
| OCR-auto-staged line items for linked uploads (spec drift fix) | 3 |
| Auto-run reconciliation + persist status/json | 3, 4 |
| Buyer notification + finance exception on discrepancy | 4 |
| Re-review re-reconcile | 5 |
| Persisted payload on order page card + upload entry | 6, 7 |
| Failure degradation (no retry-loop breaking) | 4 |
| Testing | 2-8 |
