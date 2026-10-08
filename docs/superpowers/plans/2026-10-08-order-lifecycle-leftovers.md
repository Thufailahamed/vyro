# Order Lifecycle Leftovers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the five approved leftovers: mobile address book, dead-router deletion, invoice PDF, refund cancel/withdraw, and transition idempotency.

**Architecture:** One migration + route for refund cancel; a pdfkit renderer + route for invoice PDF; optional `Idempotency-Key` on order transitions reusing `lib/idempotency.ts`; an Expo Router screen for the mobile address book mirroring the web page; one dead file deleted.

**Tech Stack:** Hono + Cloudflare Workers + D1 (API), Drizzle, React + React Query (web), Expo Router + React Query (mobile), Vitest (`@cloudflare/vitest-pool-workers` helpers `makeD1`/`applyMigrations`).

## Global Constraints

- No new dependencies.
- Spec: `docs/superpowers/specs/2026-10-08-order-lifecycle-leftovers-design.md`.
- API errors: `httpError(status, CODE, message)`; route tests mount the router on a Hono app with the `errorEnvelope` handler and mock `../../src/middleware/session` to set a module-level ctx.
- Web paths passed to `api.*` never start with `/api` (wrapper prefixes); download links use `apiBase` directly.
- Mobile: follow `apps/mobile/AGENTS.md` (Expo Router, no new native deps); run `pnpm --filter @vyro/mobile typecheck` and `pnpm --filter @vyro/mobile lint`.
- Commit per task with explicit paths (never `git add -A`); the user has authorized per-task commits for this workstream.

---

### Task 1: Delete the unmounted dead router

**Files:**
- Delete: `apps/api/src/modules/purchaseOrders/events.ts`

**Interfaces:** none.

- [ ] **Step 1: Verify it is unmounted**

Run: `grep -rn "purchaseOrders/events\|from './events'" apps/api/src apps/api/test`
Expected: no imports of `./events` (only `eventsRepository` references remain).

- [ ] **Step 2: Delete the file**

```bash
git rm apps/api/src/modules/purchaseOrders/events.ts
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vyro/api typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(api): remove unmounted duplicate purchase-order events router"
```

---

### Task 2: Refund cancel / withdraw

**Files:**
- Create: `packages/db/migrations/0053_refund_cancellation_reason.sql`
- Modify: `packages/db/src/schema/refunds.ts` (add column after `rejectionReason`, line 31)
- Modify: `packages/validation/src/payment.ts` (add `refundCancelSchema`)
- Modify: `apps/api/src/modules/refunds/routes.ts`
- Create: `apps/api/test/refunds/cancel.test.ts`
- Modify: `apps/web/src/pages/AccountsPage.tsx` (refunds list)

**Interfaces:**
- Produces: `POST /api/refunds/:id/cancel` → `{ id, status: 'cancelled' }`; 401/403/404/409 as specified.
- Produces: `refundCancelSchema` (`{ reason?: string ≤500 }`).

- [ ] **Step 1: Write the failing API test**

Create `apps/api/test/refunds/cancel.test.ts`:

```ts
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

let app: Hono;
let sessionCtx: any = null;

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  ENVIRONMENT: 'test',
};
const ids: Record<string, any> = {};

async function post(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  const router = (await import('../../src/modules/refunds/routes')).default;
  app.route('/api/refunds', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values([
    { id: 'u-buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'u-other', email: 'other@t', passwordHash: 'x', name: 'o', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'u-admin', email: 'admin@t', passwordHash: 'x', name: 'a', phone: null, avatarUrl: null, adminRole: 'finance', status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
  ]);
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values([
    { id: newId(), businessId: biz, userId: 'u-buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now },
    { id: newId(), businessId: biz, userId: 'u-other', role: 'owner', status: 'active', createdAt: now, updatedAt: now },
  ]);
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: 'PO-RC-1', businessId: biz, supplierId: sup, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-buyer', createdAt: now, updatedAt: now });
  const payId = newId();
  await db.insert(schema.payments).values({ id: payId, purchaseOrderId: poId, businessId: biz, supplierId: sup, method: 'online', provider: 'payments_lk', status: 'confirmed', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR', createdAt: now, updatedAt: now });
  const mkRefund = (status: string) => {
    const id = newId();
    return db.insert(schema.refunds).values({ id, paymentId: payId, purchaseOrderId: poId, amountCents: 1000, currency: 'LKR', status: status as any, source: 'manual', requestedByUserId: 'u-buyer', idempotencyKey: `rc-${status}`, createdAt: now, updatedAt: now }).run().then(() => id);
  };
  ids.biz = biz;
  ids.po = poId;
  ids.reqId = await mkRefund('requested');
  ids.appId = await mkRefund('approved');
  ids.procId = await mkRefund('processing');
}, 60000);

const buyerCtx = () => ({ userId: 'u-buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });
const otherCtx = () => ({ userId: 'u-other', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });
const adminCtx = () => ({ userId: 'u-admin', isAdmin: true, adminRole: 'finance', businesses: [], suppliers: [] });

describe('POST /api/refunds/:id/cancel', () => {
  it('lets the requester withdraw a requested refund', async () => {
    sessionCtx = buyerCtx();
    const res = await post(`/api/refunds/${ids.reqId}/cancel`, { reason: 'ordered by mistake' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ids.reqId, status: 'cancelled' });

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const row = (await db.select().from(schema.refunds).where(eq(schema.refunds.id, ids.reqId)).get()) as any;
    expect(row.status).toBe('cancelled');
    expect(row.cancellationReason).toBe('ordered by mistake');
  });

  it('rejects a different business user', async () => {
    sessionCtx = otherCtx();
    const res = await post(`/api/refunds/${ids.appId}/cancel`, {});
    expect(res.status).toBe(403);
  });

  it('rejects a requester trying to withdraw an approved refund', async () => {
    sessionCtx = buyerCtx();
    const res = await post(`/api/refunds/${ids.appId}/cancel`, {});
    expect(res.status).toBe(409);
  });

  it('lets an admin cancel an approved refund', async () => {
    sessionCtx = adminCtx();
    const res = await post(`/api/refunds/${ids.appId}/cancel`, { reason: 'superseded' });
    expect(res.status).toBe(200);
  });

  it('never cancels a processing refund', async () => {
    sessionCtx = adminCtx();
    const res = await post(`/api/refunds/${ids.procId}/cancel`, {});
    expect(res.status).toBe(409);
  });

  it('is 401 without a session', async () => {
    sessionCtx = null;
    const res = await post(`/api/refunds/${ids.procId}/cancel`, {});
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/refunds/cancel.test.ts`
Expected: FAIL — 404 (no route).

- [ ] **Step 3: Add the migration and schema column**

Create `packages/db/migrations/0053_refund_cancellation_reason.sql`:

```sql
-- 0053_refund_cancellation_reason.sql
-- Refund withdraw/cancel: preserve why a refund was cancelled.
ALTER TABLE refunds ADD COLUMN cancellation_reason TEXT;
```

In `packages/db/src/schema/refunds.ts`, after `rejectionReason` (line 31) add:

```ts
    cancellationReason: text('cancellation_reason'),
```

- [ ] **Step 4: Add the validation schema**

In `packages/validation/src/payment.ts`, after `createRefundSchema`:

```ts
export const refundCancelSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

export type RefundCancelInput = z.infer<typeof refundCancelSchema>;
```

- [ ] **Step 5: Implement the cancel route**

In `apps/api/src/modules/refunds/routes.ts`:

1. Update imports:

```ts
import { payments as paymentsTable, purchaseOrders, businessMembers, refunds as refundsTable, type Refund } from '@vyro/db/schema';
import { createRefundSchema, refundCancelSchema } from '@vyro/validation/payment';
import { canTransitionRefund } from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { notifyAdmins } from '../notifications/dispatcher';
```

2. Add before `export default router;`:

```ts
router.post('/:id/cancel', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = refundCancelSchema.safeParse((await c.req.json().catch(() => ({}))) ?? {});
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const refund = (await findRefund(c.env.DB, c.req.param('id'))) as Refund | null;
  if (!refund) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  const loaded = await loadPaymentAndPo(c.env.DB, refund.paymentId);
  if (!loaded) throw httpError(404, 'NOT_FOUND', 'Underlying payment missing');
  const { po } = loaded;

  const isRequester = refund.requestedByUserId === ctx.userId;
  if (!ctx.isAdmin) {
    if (!isRequester) throw httpError(403, 'FORBIDDEN', 'Only the requester or an admin can cancel a refund');
    try {
      await requireBusinessPaymentRole(c.env.DB, po.businessId, ctx.userId);
    } catch {
      throw httpError(403, 'FORBIDDEN', 'Insufficient role to cancel refund');
    }
    if (refund.status !== 'requested') {
      throw httpError(409, 'CONFLICT', `Buyers can only withdraw requested refunds (current: ${refund.status})`);
    }
  } else if (refund.status !== 'requested' && refund.status !== 'approved') {
    throw httpError(409, 'CONFLICT', `Refund cannot be cancelled from ${refund.status}`);
  }
  if (!canTransitionRefund(refund.status, 'cancelled')) {
    throw httpError(409, 'CONFLICT', `Refund cannot be cancelled from ${refund.status}`);
  }

  const now = Date.now();
  await getDb(c.env.DB)
    .update(refundsTable)
    .set({ status: 'cancelled', cancellationReason: parsed.data.reason ?? null, updatedAt: now })
    .where(eq(refundsTable.id, refund.id))
    .run();

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'refund.cancel',
    resourceType: 'payment',
    resourceId: refund.paymentId,
    metadata: { refundId: refund.id, amountCents: refund.amountCents, reason: parsed.data.reason ?? null },
  }).catch(() => undefined);

  await notifyAdmins(c.env, {
    role: 'finance',
    severity: 'info',
    category: 'admin_alert',
    title: `Refund ${refund.refundNumber ?? refund.id.slice(0, 8)} cancelled`,
    body: `${ctx.isAdmin ? 'An admin' : 'The requester'} cancelled a ${refund.status} refund on PO ${po.poNumber}.`,
    link: '/admin/finance',
    sourceRef: refund.id,
  }).catch(() => undefined);

  return c.json({ id: refund.id, status: 'cancelled' });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run test/refunds/cancel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Add the web Withdraw button**

In `apps/web/src/pages/AccountsPage.tsx`:

1. Imports: add `useMutation` to the react-query import, and add
   `import { useAuth } from '@/lib/auth';`
2. In `Refunds({ businessId })` (line 685):

```tsx
function Refunds({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { ask, dialog } = useConfirm();
  const withdraw = useMutation({
    mutationFn: (id: string) => api.post(`/refunds/${id}/cancel`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['accounts', 'business-refunds', businessId] });
      toast.success('Refund withdrawn');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not withdraw refund'),
  });
  const q = useQuery({
```

3. Add `requestedByUserId?: string;` to the refund row type (inside the `refunds: Array<{...}>`).
4. Wrap the returned JSX in a fragment `<>...</>` and render `{dialog}` at the end.
5. In each row, before the amount `<span>`, add:

```tsx
              {r.status === 'requested' && r.requestedByUserId === user?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    ask({
                      title: 'Withdraw refund request',
                      body: <>Withdraw the refund of <Money cents={r.amountCents} />? The amount becomes refundable again.</>,
                      confirmLabel: 'Withdraw',
                      action: async () => {
                        await withdraw.mutateAsync(r.id);
                      },
                    })
                  }
                >
                  Withdraw
                </Button>
              )}
```

- [ ] **Step 8: Run API test + web typecheck**

Run: `pnpm --filter @vyro/api exec vitest run test/refunds/cancel.test.ts && pnpm --filter @vyro/web typecheck`
Expected: PASS / no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/db/migrations/0053_refund_cancellation_reason.sql packages/db/src/schema/refunds.ts packages/validation/src/payment.ts apps/api/src/modules/refunds/routes.ts apps/api/test/refunds/cancel.test.ts apps/web/src/pages/AccountsPage.tsx
git commit -m "feat(refunds): allow buyers to withdraw requested refunds and admins to cancel approved ones"
```

---

### Task 3: Invoice PDF endpoint + web buttons

**Files:**
- Create: `apps/api/src/modules/invoices/pdf.ts`
- Create: `apps/api/src/modules/invoices/pdf.test.ts`
- Modify: `apps/api/src/modules/invoices/routes.ts`
- Create: `apps/api/test/invoices/pdfRoute.test.ts`
- Modify: `apps/web/src/pages/InvoicePage.tsx`
- Modify: `apps/web/src/pages/OrderDetailPage.tsx` (invoice rows)

**Interfaces:**
- Produces: `renderInvoicePdf(data: InvoicePdfData): Promise<ArrayBuffer>`.
- Produces: `GET /api/invoices/:id/pdf` (id or number) → `application/pdf`, attachment, sets `pdfGeneratedAt`.

- [ ] **Step 1: Write the failing renderer test**

Create `apps/api/src/modules/invoices/pdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderInvoicePdf } from './pdf';

describe('renderInvoicePdf', () => {
  it('renders a receipt with a %PDF header', async () => {
    const buf = await renderInvoicePdf({
      invoice: {
        number: 'RCP-2026-0001',
        type: 'receipt',
        currency: 'LKR',
        issuedAt: Date.now(),
        subtotalCents: 100000,
        vatCents: 18000,
        ssclCents: 0,
        totalCents: 118000,
        supplierVatNo: 'VAT-1',
        buyerTaxId: 'T-2',
      },
      items: [{ description: 'Rice 5kg', quantity: 10, unitCents: 10000, lineTotalCents: 100000 }],
      business: { name: 'Buyer Ltd' },
      supplier: { name: 'Mill Ltd' },
      po: { poNumber: 'PO-1' },
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(new Uint8Array(buf).slice(0, 5))).toBe('%PDF-');
  });

  it('renders credit notes too', async () => {
    const buf = await renderInvoicePdf({
      invoice: {
        number: 'CN-2026-0001', type: 'credit_note', currency: 'LKR', issuedAt: Date.now(),
        subtotalCents: 5000, vatCents: 0, ssclCents: 0, totalCents: 5000,
        supplierVatNo: null, buyerTaxId: null,
      },
      items: [{ description: 'Damaged units', quantity: 1, unitCents: 5000, lineTotalCents: 5000 }],
      business: { name: 'Buyer Ltd' },
      supplier: { name: 'Mill Ltd' },
      po: { poNumber: 'PO-2' },
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/invoices/pdf.test.ts`
Expected: FAIL — cannot find `./pdf`.

- [ ] **Step 3: Implement the renderer**

Create `apps/api/src/modules/invoices/pdf.ts`:

```ts
import PDFDocument from 'pdfkit';

export interface InvoicePdfData {
  invoice: {
    number: string;
    type: 'receipt' | 'tax_invoice' | 'credit_note';
    currency: string;
    issuedAt: number;
    subtotalCents: number;
    vatCents: number;
    ssclCents: number;
    totalCents: number;
    supplierVatNo: string | null;
    buyerTaxId: string | null;
  };
  items: Array<{ description: string; quantity: number; unitCents: number; lineTotalCents: number }>;
  business: { name: string };
  supplier: { name: string };
  po: { poNumber: string };
}

const TITLES: Record<InvoicePdfData['invoice']['type'], string> = {
  receipt: 'RECEIPT',
  tax_invoice: 'TAX INVOICE',
  credit_note: 'CREDIT NOTE',
};

const amount = (cents: number) => (cents / 100).toFixed(2);

export function renderInvoicePdf(data: InvoicePdfData): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on('data', (c: Uint8Array) => chunks.push(c));
    doc.on('end', () => {
      const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.byteLength;
      }
      resolve(merged.buffer);
    });
    doc.on('error', reject);

    doc.fontSize(20).text(TITLES[data.invoice.type], { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`Invoice: ${data.invoice.number}`)
      .text(`Issued: ${new Date(data.invoice.issuedAt).toISOString().slice(0, 10)}`)
      .text(`PO: ${data.po.poNumber}`)
      .text(`Currency: ${data.invoice.currency}`);
    doc.moveDown();
    doc
      .text(`Supplier: ${data.supplier.name}${data.invoice.supplierVatNo ? ` (VAT ${data.invoice.supplierVatNo})` : ''}`)
      .text(`Buyer: ${data.business.name}${data.invoice.buyerTaxId ? ` (Tax ID ${data.invoice.buyerTaxId})` : ''}`);
    doc.moveDown();
    doc.fontSize(12).text('Items', { underline: true });
    for (const item of data.items) {
      doc
        .fontSize(10)
        .text(
          `${item.description}  qty:${item.quantity}  unit:${amount(item.unitCents)}  total:${amount(item.lineTotalCents)}`,
        );
    }
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`Subtotal: ${amount(data.invoice.subtotalCents)}`)
      .text(`VAT: ${amount(data.invoice.vatCents)}`)
      .text(`SSCL: ${amount(data.invoice.ssclCents)}`)
      .fontSize(12)
      .text(`Total: ${data.invoice.currency} ${amount(data.invoice.totalCents)}`);
    doc.end();
  });
}
```

- [ ] **Step 4: Run renderer test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/invoices/pdf.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the route**

In `apps/api/src/modules/invoices/routes.ts`:

1. Add imports:

```ts
import { businesses, invoices, suppliers } from '@vyro/db/schema';
import { renderInvoicePdf } from './pdf';
```

(merge `invoices`/`businesses`/`suppliers` into the existing `@vyro/db/schema` import)

2. Add after the `/:id/html` handler (line 83):

```ts
router.get('/:id/pdf', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const invoice = await loadInvoiceByIdOrNumber(c.env.DB, c.req.param('id'));
  if (!invoice) throw httpError(404, 'NOT_FOUND', 'Invoice not found');
  const po = await loadPoForInvoice(c.env.DB, invoice);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO missing');
  await assertInvoiceAccess(c.env.DB, ctx, po);

  const db = getDb(c.env.DB);
  const biz = await db.select().from(businesses).where(eq(businesses.id, invoice.businessId)).get();
  const sup = await db.select().from(suppliers).where(eq(suppliers.id, invoice.supplierId)).get();
  if (!biz || !sup) throw httpError(404, 'NOT_FOUND', 'Invoice parties missing');

  const items = await listInvoiceItems(c.env.DB, invoice.id);
  const pdf = await renderInvoicePdf({ invoice, items, business: biz, supplier: sup, po: { poNumber: po.poNumber } });
  await db.update(invoices).set({ pdfGeneratedAt: Date.now() }).where(eq(invoices.id, invoice.id)).run();

  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
  return c.body(pdf);
});
```

- [ ] **Step 6: Write the failing route test**

Create `apps/api/test/invoices/pdfRoute.test.ts`:

```ts
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { makeD1, applyMigrations } from '../helpers/d1';

let app: Hono;
let sessionCtx: any = null;

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

const env: any = { DB: null, NOTIFICATIONS_QUEUE: undefined, AUDIT_QUEUE: undefined, INVOICES_QUEUE: undefined, ENVIRONMENT: 'test' };
const ids: Record<string, any> = {};

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  const router = (await import('../../src/modules/invoices/routes')).default;
  app.route('/api/invoices', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values([
    { id: 'u-buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'u-stranger', email: 'stranger@t', passwordHash: 'x', name: 's', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
  ]);
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'Buyer Ltd', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'Mill Ltd', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.businessMembers).values({ id: newId(), businessId: biz, userId: 'u-buyer', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: 'PO-PDF-1', businessId: biz, supplierId: sup, status: 'delivered', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'u-buyer', createdAt: now, updatedAt: now });
  const invId = newId();
  await db.insert(schema.invoices).values({ id: invId, number: 'RCP-2026-0001', type: 'receipt', purchaseOrderId: poId, businessId: biz, supplierId: sup, subtotalCents: 10000, taxCents: 0, vatCents: 0, ssclCents: 0, totalCents: 10000, currency: 'LKR', issuedAt: now, htmlSnapshot: '<html></html>', createdAt: now });
  await db.insert(schema.invoiceItems).values({ id: newId(), invoiceId: invId, description: 'Rice 5kg', quantity: 10, unitCents: 1000, lineTotalCents: 10000 });
  ids.biz = biz;
  ids.invId = invId;
}, 60000);

describe('GET /api/invoices/:id/pdf', () => {
  it('streams a PDF to a participant and stamps pdf_generated_at', async () => {
    sessionCtx = { userId: 'u-buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] };
    const res = await app.fetch(new Request(`http://localhost/api/invoices/${ids.invId}/pdf`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('RCP-2026-0001.pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const row = (await db.select().from(schema.invoices).where(eq(schema.invoices.id, ids.invId)).get()) as any;
    expect(row.pdfGeneratedAt).toBeGreaterThan(0);
  });

  it('is 403 for a non-participant', async () => {
    sessionCtx = { userId: 'u-stranger', isAdmin: false, adminRole: null, businesses: [], suppliers: [] };
    const res = await app.fetch(new Request(`http://localhost/api/invoices/${ids.invId}/pdf`), env);
    expect(res.status).toBe(403);
  });
});
```

Add `import { eq } from 'drizzle-orm';` at the top of the test file.

- [ ] **Step 7: Run route test**

Run: `pnpm --filter @vyro/api exec vitest run test/invoices/pdfRoute.test.ts`
Expected: PASS (2 tests). If the `invoices` migration column set differs, fix the seed to match `packages/db/src/schema/invoices.ts`.

- [ ] **Step 8: Web buttons**

1. `apps/web/src/pages/InvoicePage.tsx`: after `const htmlUrl = ...` (line 43) add:

```tsx
  const pdfUrl = `${apiBase}/invoices/${encodeURIComponent(data.invoice.number)}/pdf`;
```

Replace the print-to-PDF download button (lines 64-66) with:

```tsx
            <a href={pdfUrl} download={`${data.invoice.number}.pdf`}>
              <Button>Download PDF</Button>
            </a>
```

2. `apps/web/src/pages/OrderDetailPage.tsx`:
   - Change the api import to `import { api, apiBase } from '@/lib/api';`
   - In the invoice row (line 961-977), between the `Link` and the amount `<span>`, add:

```tsx
                    <a
                      href={`${apiBase}/invoices/${encodeURIComponent(inv.number)}/pdf`}
                      className="text-[10px] font-semibold text-copper hover:underline shrink-0"
                    >
                      PDF
                    </a>
```

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm --filter @vyro/api exec vitest run src/modules/invoices/pdf.test.ts test/invoices/pdfRoute.test.ts && pnpm --filter @vyro/web typecheck`
Expected: PASS / no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/invoices/pdf.ts apps/api/src/modules/invoices/pdf.test.ts apps/api/src/modules/invoices/routes.ts apps/api/test/invoices/pdfRoute.test.ts apps/web/src/pages/InvoicePage.tsx apps/web/src/pages/OrderDetailPage.tsx
git commit -m "feat(invoices): PDF endpoint and web download links"
```

---

### Task 4: Transition idempotency

**Files:**
- Modify: `apps/api/src/modules/purchaseOrders/routes.ts` (transition route, line 161)
- Create: `apps/api/test/orders/transitionIdempotency.test.ts`
- Modify: `apps/web/src/pages/OrderDetailPage.tsx` (transition calls)
- Modify: `apps/mobile/src/features/buyer/orders/OrderDetailScreen.tsx` (transition mutation)

**Interfaces:**
- Consumes: `getIdempotencyResponse`, `storeIdempotencyResponse`, `assertIdempotencyMatch`, `hashRequestBody` from `apps/api/src/lib/idempotency.ts`.
- Produces: optional `Idempotency-Key` support on `POST /api/purchase-orders/:id/transition`.

- [ ] **Step 1: Write the failing API test**

Create `apps/api/test/orders/transitionIdempotency.test.ts`:

```ts
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

let app: Hono;
let sessionCtx: any = null;

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

const env: any = { DB: null, NOTIFICATIONS_QUEUE: undefined, AUDIT_QUEUE: undefined, INVOICES_QUEUE: undefined, ENVIRONMENT: 'test' };
const ids: Record<string, any> = {};

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env,
  );
}

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  const { errorEnvelope } = await import('../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  const router = (await import('../../src/modules/purchaseOrders/routes')).default;
  app.route('/api/purchase-orders', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const mkPo = async (n: number) => {
    const id = newId();
    await db.insert(schema.purchaseOrders).values({ id, poNumber: `PO-IDEM-${n}`, businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 1000, deliveryFeeCents: 0, totalCents: 1000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: null, createdAt: now, updatedAt: now });
    return id;
  };
  ids.biz = biz;
  ids.po1 = await mkPo(1);
  ids.po2 = await mkPo(2);
}, 60000);

const buyer = () => ({ userId: 'buyer', isAdmin: false, adminRole: null, businesses: [{ businessId: ids.biz, role: 'owner' }], suppliers: [] });

describe('POST /api/purchase-orders/:id/transition idempotency', () => {
  it('replays the stored response and writes one event', async () => {
    sessionCtx = buyer();
    const key = 'idem-transition-replay';
    const r1 = await post(`/api/purchase-orders/${ids.po1}/transition`, { to: 'cancelled', reason: 'changed mind' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();

    const r2 = await post(`/api/purchase-orders/${ids.po1}/transition`, { to: 'cancelled', reason: 'changed mind' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual(body1);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const events = (await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.purchaseOrderId, ids.po1)).all()) as any[];
    expect(events.filter((e) => e.toStatus === 'cancelled')).toHaveLength(1);
  });

  it('rejects key reuse with a different payload', async () => {
    sessionCtx = buyer();
    const key = 'idem-transition-mismatch';
    const r1 = await post(`/api/purchase-orders/${ids.po2}/transition`, { to: 'cancelled', reason: 'first' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);

    const r2 = await post(`/api/purchase-orders/${ids.po2}/transition`, { to: 'disputed', reason: 'different' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(409);
  });

  it('leaves keyless callers unchanged', async () => {
    sessionCtx = buyer();
    const res = await post(`/api/purchase-orders/${ids.po2}/transition`, { to: 'cancelled', reason: 'again' });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/orders/transitionIdempotency.test.ts`
Expected: FAIL — the replay test sees a second transition attempt (409).

- [ ] **Step 3: Implement server-side idempotency**

In `apps/api/src/modules/purchaseOrders/routes.ts`:

1. Add imports:

```ts
import {
  assertIdempotencyMatch,
  getIdempotencyResponse,
  hashRequestBody,
  storeIdempotencyResponse,
} from '../../lib/idempotency';
```

2. Replace the body of `POST /:id/transition` after the role resolution block (line 179) with:

```ts
  const idemKey = c.req.header('Idempotency-Key');
  const requestHash = hashRequestBody({
    poId: po.id,
    to: parsed.data.to,
    reason: parsed.data.reason ?? null,
  });
  if (idemKey) {
    const hit = await getIdempotencyResponse(c.env.DB, ctx.userId, idemKey);
    if (hit) {
      await assertIdempotencyMatch(c.env.DB, ctx.userId, idemKey, requestHash);
      c.status(hit.statusCode as 200);
      return c.json(JSON.parse(hit.responseJson));
    }
  }

  const out = await applyTransition(c.env, {
    poId: po.id,
    to: parsed.data.to as never,
    actor: { role: actorRole, userId: ctx.userId },
    reason: parsed.data.reason ?? null,
  });
  const body = { ok: true as const, status: out.to, refunds: out.refunds };
  if (idemKey) {
    await storeIdempotencyResponse(c.env.DB, ctx.userId, idemKey, requestHash, 200, JSON.stringify(body));
  }
  return c.json(body);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run test/orders/transitionIdempotency.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Web client keys**

In `apps/web/src/pages/OrderDetailPage.tsx`:

1. `transitionWithReason` (line ~224): change the post call to

```tsx
    await api.post(
      `/purchase-orders/${id}/transition`,
      { to, reason },
      { idempotencyKey: crypto.randomUUID() },
    );
```

2. `confirmReceipt` (line ~245): change the post call to

```tsx
      await api.post(
        `/purchase-orders/${id}/transition`,
        { to: 'completed' },
        { idempotencyKey: crypto.randomUUID() },
      );
```

- [ ] **Step 6: Mobile client keys**

In `apps/mobile/src/features/buyer/orders/OrderDetailScreen.tsx` (line ~116), replace the transition mutation with:

```ts
  const idemKey = () =>
    globalThis.crypto?.randomUUID?.() ?? `vyro-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const transition = useMutation({
    mutationFn: (v: { to: string; reason?: string }) =>
      api.post(
        `/purchase-orders/${id}/transition`,
        { to: v.to, ...(v.reason ? { reason: v.reason } : {}) },
        { idempotencyKey: idemKey() },
      ),
```

(keep the existing `onSuccess`/`onError` handlers unchanged)

- [ ] **Step 7: Run tests + typechecks**

Run: `pnpm --filter @vyro/api exec vitest run test/orders/transitionIdempotency.test.ts && pnpm --filter @vyro/web typecheck && pnpm --filter @vyro/mobile typecheck`
Expected: PASS / no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/purchaseOrders/routes.ts apps/api/test/orders/transitionIdempotency.test.ts apps/web/src/pages/OrderDetailPage.tsx apps/mobile/src/features/buyer/orders/OrderDetailScreen.tsx
git commit -m "feat(orders): idempotent order transitions with client keys"
```

---

### Task 5: Mobile delivery address book

**Files:**
- Create: `apps/mobile/src/features/buyer/addresses/AddressBookScreen.tsx`
- Create: `apps/mobile/src/app/buyer/addresses.tsx`
- Modify: `apps/mobile/src/features/buyer/BuyerAccountScreen.tsx` (Business group link)
- Modify: `apps/mobile/src/lib/mobileHref.ts` (map `/addresses`)
- Optional doc: append `/buyer/addresses` to the buyer route table in `apps/mobile/CONVENTIONS.md`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /businesses/:businessId/addresses` (already implemented).
- Produces: mobile route `/buyer/addresses`.

- [ ] **Step 1: Create the screen**

Create `apps/mobile/src/features/buyer/addresses/AddressBookScreen.tsx`:

```tsx
import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useBusinessId } from '@/lib/auth';
import { SRI_LANKAN_DISTRICTS } from '@/lib/sriLanka';
import {
  Banner,
  Button,
  Checkbox,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  Input,
  ListRow,
  ListSection,
  Screen,
  Select,
  Sheet,
  Skeleton,
  useToast,
} from '@/ui';
import { Gate } from '../../common/Gate';

interface AddressRow {
  id: string;
  label: string;
  contactName: string | null;
  phone: string | null;
  address: string;
  city: string;
  district: string;
  isDefault: boolean;
}

const WRITE_ROLES = ['owner', 'manager'];

export function AddressBookScreen() {
  return (
    <Gate need="business">
      <AddressBookInner />
    </Gate>
  );
}

function AddressBookInner() {
  const businessId = useBusinessId()!;
  const { business } = useAuth();
  const canWrite = !!business && WRITE_ROLES.includes(business.role);
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['addresses', businessId],
    queryFn: () => api.get<{ addresses: AddressRow[] }>(`/businesses/${businessId}/addresses`),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AddressRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AddressRow | null>(null);
  const [label, setLabel] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid =
    label.trim().length > 0 && address.trim().length >= 3 && city.trim().length > 0 && !!district;

  function reset() {
    setEditing(null);
    setLabel('');
    setContactName('');
    setPhone('');
    setAddress('');
    setCity('');
    setDistrict(null);
    setIsDefault(false);
    setErr(null);
  }

  function openCreate() {
    reset();
    setFormOpen(true);
  }

  function openEdit(a: AddressRow) {
    setEditing(a);
    setLabel(a.label);
    setContactName(a.contactName ?? '');
    setPhone(a.phone ?? '');
    setAddress(a.address);
    setCity(a.city);
    setDistrict(a.district);
    setIsDefault(a.isDefault);
    setErr(null);
    setFormOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        label: label.trim(),
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        address: address.trim(),
        city: city.trim(),
        district: (district ?? '').trim(),
        isDefault,
      };
      if (editing) return api.patch(`/businesses/${businessId}/addresses/${editing.id}`, payload);
      return api.post(`/businesses/${businessId}/addresses`, payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success(editing ? 'Address updated' : 'Address added');
      setFormOpen(false);
      reset();
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/businesses/${businessId}/addresses/${id}`, { isDefault: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Default address updated');
    },
    onError: (e) => toast.error('Could not set default', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/businesses/${businessId}/addresses/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Address removed');
      setPendingDelete(null);
    },
    onError: (e) => toast.error('Could not remove address', errorMessage(e)),
  });

  const header = {
    back: true as const,
    title: 'Delivery addresses',
    subtitle: 'Choose a dock or receiving site at checkout.',
  };
  const addresses = q.data?.addresses ?? [];

  return (
    <>
      <Screen
        {...header}
        onRefresh={() => void q.refetch()}
        footer={canWrite ? <Button title="Add address" size="lg" full onPress={openCreate} /> : undefined}
      >
        {q.isLoading ? <Skeleton height={220} radius={16} /> : null}
        {q.isError ? (
          <ErrorState
            message={errorMessage(q.error, 'Could not load addresses.')}
            onRetry={() => void q.refetch()}
          />
        ) : null}
        {!q.isLoading && !q.isError && addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No saved addresses"
            message="Checkout uses your registered business address until you save one here."
            action={canWrite ? { label: 'Add address', onPress: openCreate } : undefined}
          />
        ) : null}
        {addresses.length > 0 ? (
          <ListSection label="Saved addresses">
            {addresses.map((a, i) => (
              <ListRow
                key={a.id}
                icon={MapPin}
                iconTone={a.isDefault ? 'volt' : 'ink'}
                title={a.label}
                subtitle={`${a.address}, ${a.city}${a.isDefault ? ' · Default' : ''}`}
                last={i === addresses.length - 1}
                onPress={canWrite ? () => openEdit(a) : undefined}
                trailing={
                  canWrite ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {!a.isDefault ? (
                        <Button title="Default" size="sm" variant="ghost" onPress={() => setDefault.mutate(a.id)} />
                      ) : null}
                      <Button title="Delete" size="sm" variant="ghost" onPress={() => setPendingDelete(a)} />
                    </View>
                  ) : undefined
                }
              />
            ))}
          </ListSection>
        ) : null}
      </Screen>

      <Sheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit address' : 'New address'}
        scroll
        footer={
          <Button
            title={editing ? 'Save changes' : 'Add address'}
            size="lg"
            full
            loading={save.isPending}
            disabled={!valid}
            onPress={() => save.mutate()}
          />
        }
      >
        <View style={{ gap: 16 }}>
          {err ? <Banner tone="danger" message={err} /> : null}
          <Field label="Label">
            <Input value={label} onChangeText={setLabel} placeholder="Main Depot" maxLength={60} />
          </Field>
          <Field label="Contact name">
            <Input value={contactName} onChangeText={setContactName} placeholder="Receiving officer" maxLength={120} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChangeText={setPhone} placeholder="077 000 0000" maxLength={20} keyboardType="phone-pad" />
          </Field>
          <Field label="Address">
            <Input value={address} onChangeText={setAddress} placeholder="12 Galle Road, Colombo 03" maxLength={300} />
          </Field>
          <Field label="City">
            <Input value={city} onChangeText={setCity} placeholder="Colombo" maxLength={80} />
          </Field>
          <Field label="District">
            <Select
              value={district}
              options={SRI_LANKAN_DISTRICTS.map((d) => ({ value: d, label: d }))}
              onChange={setDistrict}
              title="Select district"
            />
          </Field>
          <Checkbox checked={isDefault} onChange={setIsDefault} label="Make this the default delivery address" />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Remove address"
        message={pendingDelete ? `Remove ${pendingDelete.label}?` : undefined}
        confirmLabel="Remove"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
        }}
      />
    </>
  );
}
```

If `SelectOption` uses `{ value, label }`, the `options` mapping above is correct; if the barrel names differ, mirror `apps/mobile/src/ui/Form.tsx:212`.

- [ ] **Step 2: Create the route file**

Create `apps/mobile/src/app/buyer/addresses.tsx`:

```tsx
import { AddressBookScreen } from '@/features/buyer/addresses/AddressBookScreen';

export default AddressBookScreen;
```

(Confirmed against `apps/mobile/src/app/buyer/credit.tsx`, which uses the same `@/features` alias style.)

- [ ] **Step 3: Link from the account screen**

In `apps/mobile/src/features/buyer/BuyerAccountScreen.tsx`:

1. Add `MapPin` to the `lucide-react-native` import block.
2. In the `Business` group (line 46-52) add:

```tsx
      { icon: MapPin, label: 'Delivery addresses', to: '/buyer/addresses' },
```

- [ ] **Step 4: Map the notification deep-link**

In `apps/mobile/src/lib/mobileHref.ts`, add to `ROUTES` after the `/search` entry:

```ts
  ['/addresses', '/buyer/addresses'],
```

- [ ] **Step 5: Typecheck and lint mobile**

Run: `pnpm --filter @vyro/mobile typecheck && pnpm --filter @vyro/mobile lint`
Expected: no errors. Fix any prop/type mismatches against `apps/mobile/src/ui` (do not change shared UI components).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/buyer/addresses/AddressBookScreen.tsx apps/mobile/src/app/buyer/addresses.tsx apps/mobile/src/features/buyer/BuyerAccountScreen.tsx apps/mobile/src/lib/mobileHref.ts
git commit -m "feat(mobile): delivery address book screen"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Monorepo typecheck**

Run: `pnpm typecheck`
Expected: all packages pass.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: api/web/payments/ai/validation/shared/auth/db all pass, no regressions.

- [ ] **Step 3: Web build**

Run: `pnpm --filter @vyro/web build`
Expected: succeeds.

- [ ] **Step 4: Mobile checks**

Run: `pnpm --filter @vyro/mobile typecheck && pnpm --filter @vyro/mobile lint`
Expected: clean.

- [ ] **Step 5: Manual smoke (user)**

1. Buyer refunds: request a refund on a paid order, then Withdraw it from `/accounts` → Refunds; amount becomes refundable again.
2. Invoice: open an invoice → Download PDF; click PDF in the order detail invoice list.
3. Order transition: cancel an order; response is idempotent on retry (Network tab shows no duplicate event).
4. Mobile: Account → Delivery addresses → add/edit/default/delete; purchasing/accountant role sees read-only.
