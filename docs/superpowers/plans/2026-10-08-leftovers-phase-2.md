# Leftovers Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile buyer invoices share the server-rendered PDF, and supplier accept/transition actions are idempotent.

**Architecture:** The mobile invoice screen switches its share call to the existing `GET /invoices/:id/pdf` (streamed via `api.raw`). `POST /purchase-orders/:id/accept` gains the same optional `Idempotency-Key` support as `/transition`, and all supplier accept/transition call sites in web and mobile send keys.

**Tech Stack:** Hono + D1 (API), React + React Query (web), Expo Router (mobile), Vitest with `makeD1`/`applyMigrations`.

## Global Constraints

- No new dependencies.
- Spec: `docs/superpowers/specs/2026-10-08-leftovers-phase-2-design.md`.
- Web API calls via `api` wrapper (`@/lib/api`); `api.post(path, body, { idempotencyKey })` expects a string; use `crypto.randomUUID()`.
- Mobile `api.post(path, body, { idempotencyKey: true })` generates the key client-side.
- Another session may be editing web files: check `git status` before staging and stage explicit paths only (never `git add -A`).
- Commit per task; the user has authorized commits for this workstream.

---

### Task 1: Mobile invoice PDF share

**Files:**
- Modify: `apps/mobile/src/features/buyer/orders/InvoiceScreen.tsx`

**Interfaces:** consumes the existing `GET /api/invoices/:id/pdf` via `shareApiFile`.

- [ ] **Step 1: Switch the share call to the PDF endpoint**

In `apps/mobile/src/features/buyer/orders/InvoiceScreen.tsx`, `share()` (line 49-59):

```tsx
  async function share() {
    const number = q.data?.invoice.number ?? invoiceId;
    setSharing(true);
    try {
      await shareApiFile(`/invoices/${encodeURIComponent(number!)}/pdf`, `${number}.pdf`, 'application/pdf');
    } catch (e) {
      toast.error('Could not open invoice', errorMessage(e));
    } finally {
      setSharing(false);
    }
  }
```

- [ ] **Step 2: Update copy**

- Footer button (line 97): `title="Share / print invoice"` → `title="Share invoice PDF"`.
- Component doc comment (line 36): `offers the printable HTML via share sheet.` → `offers the printable PDF via share sheet.`
- Empty-lines copy (line 121): `Line detail is inside the printable invoice — share it above.` → `Line detail is inside the invoice PDF — share it above.`

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @vyro/mobile typecheck && pnpm --filter @vyro/mobile lint`
Expected: clean (lint is fully green as of commit `16b6156`).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/buyer/orders/InvoiceScreen.tsx
git commit -m "feat(mobile): share buyer invoices as PDF"
```

---

### Task 2: Server idempotency for accept

**Files:**
- Modify: `apps/api/src/modules/purchaseOrders/routes.ts` (`POST /:id/accept`, line 214-234)
- Create: `apps/api/test/orders/acceptIdempotency.test.ts`

**Interfaces:**
- Consumes: `getIdempotencyResponse`, `storeIdempotencyResponse`, `assertIdempotencyMatch`, `hashRequestBody` from `apps/api/src/lib/idempotency.ts` (already imported in this file).
- Produces: optional `Idempotency-Key` on `POST /api/purchase-orders/:id/accept`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/orders/acceptIdempotency.test.ts`:

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
  await db.insert(schema.users).values([
    { id: 'buyer', email: 'buyer@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'sup-u', email: 'sup@t', passwordHash: 'x', name: 's', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
  ]);
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  const cat = newId();
  await db.insert(schema.categories).values({ id: cat, slug: 'staples', name: 'Staples', active: true, sortOrder: 0 });
  const pid = newId();
  await db.insert(schema.products).values({ id: pid, name: 'Rice 5kg', categoryId: cat, unit: 'bag', createdAt: now, updatedAt: now });
  const spId = newId();
  await db.insert(schema.supplierProducts).values({ id: spId, supplierId: sup, productId: pid, priceCents: 10000, minOrderQty: 1, stockQty: 100, trackInventory: true, leadTimeDays: 2, createdAt: now, updatedAt: now });
  const mkPo = async (n: number) => {
    const poId = newId();
    await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: `PO-ACC-${n}`, businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'buyer', createdAt: now, updatedAt: now });
    await db.insert(schema.purchaseOrderItems).values({ id: newId(), purchaseOrderId: poId, supplierProductId: spId, productNameSnapshot: 'Rice 5kg', unitPriceCents: 10000, unitPriceCentsSnapshot: 10000, quantity: 1, requestedQuantity: 1, lineTotalCents: 10000 });
    return poId;
  };
  ids.biz = biz;
  ids.sup = sup;
  ids.po1 = await mkPo(1);
  ids.po2 = await mkPo(2);
}, 60000);

const supplier = () => ({ userId: 'sup-u', isAdmin: false, adminRole: null, businesses: [], suppliers: [{ supplierId: ids.sup, role: 'owner' }] });

describe('POST /api/purchase-orders/:id/accept idempotency', () => {
  it('replays the stored response and writes one accepted event', async () => {
    sessionCtx = supplier();
    const key = 'idem-accept-replay';
    const r1 = await post(`/api/purchase-orders/${ids.po1}/accept`, {}, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.status).toBe('accepted');

    const r2 = await post(`/api/purchase-orders/${ids.po1}/accept`, {}, { 'Idempotency-Key': key });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual(body1);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const events = (await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.purchaseOrderId, ids.po1)).all()) as any[];
    expect(events.filter((e) => e.toStatus === 'accepted')).toHaveLength(1);
  });

  it('rejects key reuse with a different payload', async () => {
    sessionCtx = supplier();
    const key = 'idem-accept-mismatch';
    const r1 = await post(`/api/purchase-orders/${ids.po2}/accept`, { note: 'first' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);

    const r2 = await post(`/api/purchase-orders/${ids.po2}/accept`, { note: 'different' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(409);
  });

  it('leaves keyless callers unchanged', async () => {
    sessionCtx = supplier();
    const res = await post(`/api/purchase-orders/${ids.po1}/accept`, {});
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/orders/acceptIdempotency.test.ts`
Expected: FAIL — the replay test gets 409 on the second call.

- [ ] **Step 3: Implement server-side idempotency**

In `apps/api/src/modules/purchaseOrders/routes.ts`, replace the tail of `POST /:id/accept` (from `const out = await acceptOrder(...)` to the `return`):

```ts
  const idemKey = c.req.header('Idempotency-Key');
  const requestHash = hashRequestBody({
    poId: po.id,
    lines: parsed.data.lines ?? null,
    note: parsed.data.note ?? null,
  });
  if (idemKey) {
    const hit = await getIdempotencyResponse(c.env.DB, ctx.userId, idemKey);
    if (hit) {
      await assertIdempotencyMatch(c.env.DB, ctx.userId, idemKey, requestHash);
      c.status(hit.statusCode as 200);
      return c.json(JSON.parse(hit.responseJson));
    }
  }

  const out = await acceptOrder(c.env, {
    poId: po.id,
    actor: { role, userId: ctx.userId },
    lines: parsed.data.lines,
    note: parsed.data.note ?? null,
  });
  if (idemKey) {
    await storeIdempotencyResponse(c.env.DB, ctx.userId, idemKey, requestHash, 200, JSON.stringify(out));
  }
  return c.json(out);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run test/orders/acceptIdempotency.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/purchaseOrders/routes.ts apps/api/test/orders/acceptIdempotency.test.ts
git commit -m "feat(orders): idempotent supplier accept endpoint"
```

---

### Task 3: Web supplier keys

**Files:**
- Modify: `apps/web/src/pages/SupplierOrdersPage.tsx` (lines 126, 145, 650)
- Modify: `apps/web/src/supplier/SupplierOrderDetailPage.tsx` (lines 81, 345, 461)

**Interfaces:** consumes the optional `Idempotency-Key` support on `/transition` and `/accept`.

- [ ] **Step 1: Add keys at the six call sites**

`apps/web/src/pages/SupplierOrdersPage.tsx`:

1. Line 126:

```tsx
      await api.post(
        `/purchase-orders/${poId}/transition`,
        { to, ...(reason ? { reason } : {}) },
        { idempotencyKey: crypto.randomUUID() },
      );
```

2. Line 145:

```tsx
      await api.post(`/purchase-orders/${poId}/accept`, {}, { idempotencyKey: crypto.randomUUID() });
```

3. Line 650:

```tsx
            await api.post(
              `/purchase-orders/${podPoId}/transition`,
              { to: 'delivered' },
              { idempotencyKey: crypto.randomUUID() },
            );
```

`apps/web/src/supplier/SupplierOrderDetailPage.tsx`:

4. Line 81:

```tsx
      await api.post(
        `/purchase-orders/${id}/transition`,
        { to, ...(reason ? { reason } : {}) },
        { idempotencyKey: crypto.randomUUID() },
      );
```

5. Line 345:

```tsx
              await api.post(
                `/purchase-orders/${order.id}/transition`,
                { to: 'delivered' },
                { idempotencyKey: crypto.randomUUID() },
              );
```

6. Line 461 (partial accept):

```tsx
      const res = await api.post<{ partial: boolean }>(
        `/purchase-orders/${poId}/accept`,
        {
          ...(payload.length ? { lines: payload } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vyro/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/SupplierOrdersPage.tsx apps/web/src/supplier/SupplierOrderDetailPage.tsx
git commit -m "feat(web): idempotency keys on supplier accept and transitions"
```

---

### Task 4: Mobile supplier keys

**Files:**
- Modify: `apps/mobile/src/features/supplier/ops/OrderActions.tsx` (line 23)
- Modify: `apps/mobile/src/features/supplier/ops/AcceptOrderSheet.tsx` (line 94)
- Modify: `apps/mobile/src/features/supplier/ops/DeliverySheets.tsx` (line 67)

**Interfaces:** consumes the optional `Idempotency-Key` support on `/transition` and `/accept`; `api.post` accepts `{ idempotencyKey: true }`.

- [ ] **Step 1: Add keys at the three call sites**

1. `OrderActions.tsx` `useTransition`:

```tsx
    mutationFn: (v: { poId: string; to: string; reason?: string }) =>
      api.post(
        `/purchase-orders/${v.poId}/transition`,
        { to: v.to, ...(v.reason ? { reason: v.reason } : {}) },
        { idempotencyKey: true },
      ),
```

2. `AcceptOrderSheet.tsx` accept mutation:

```tsx
    mutationFn: () =>
      api.post<AcceptResponse>(
        `/purchase-orders/${poId}/accept`,
        {
          ...(payload.length ? { lines: payload } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        { idempotencyKey: true },
      ),
```

3. `DeliverySheets.tsx` delivered transition (leave the POD upload above it unchanged):

```tsx
      await api.post(`/purchase-orders/${poId}/transition`, { to: 'delivered' }, { idempotencyKey: true });
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm --filter @vyro/mobile typecheck && pnpm --filter @vyro/mobile lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/supplier/ops/OrderActions.tsx apps/mobile/src/features/supplier/ops/AcceptOrderSheet.tsx apps/mobile/src/features/supplier/ops/DeliverySheets.tsx
git commit -m "feat(mobile): idempotency keys on supplier accept and transitions"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Monorepo typecheck**

Run: `pnpm typecheck`
Expected: 16/16 tasks pass.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all packages pass (api baseline was 1131 passed + 1 skipped; +3 new accept tests).

- [ ] **Step 3: Web build**

Run: `pnpm --filter @vyro/web build`
Expected: succeeds.

- [ ] **Step 4: Mobile checks**

Run: `pnpm --filter @vyro/mobile typecheck && pnpm --filter @vyro/mobile lint`
Expected: clean.

- [ ] **Step 5: Manual smoke (user)**

1. Mobile buyer: open an invoice → Share invoice PDF → OS sheet shows a PDF.
2. Supplier accept: tap accept twice quickly (or retry after network loss) → one acceptance, no duplicate event.
3. Supplier reject/dispatch: button retries are idempotent.
