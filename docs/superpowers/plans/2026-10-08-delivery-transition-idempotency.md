# Delivery Transition Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional `Idempotency-Key` support on `POST /api/deliveries/:poId/transitions` plus client keys on the two supplier web buttons.

**Architecture:** Reuse `apps/api/src/lib/idempotency.ts` exactly as shipped for order transitions and accept — replay stored `{ ok: true }`, 409 on key reuse with a different body, keyless unchanged.

**Tech Stack:** Hono + D1, React + React Query (web), Vitest with `makeD1`/`applyMigrations`.

## Global Constraints

- No new dependencies.
- Spec: `docs/superpowers/specs/2026-10-08-delivery-transition-idempotency-design.md`.
- `requestHash` is computed once before the replay branch and reused for storage.
- Web `api.post` third argument is `{ idempotencyKey: crypto.randomUUID() }`.
- Another session may be editing web files: stage explicit paths only.
- Commit per task; commits are authorized.

---

### Task 1: Server idempotency for delivery transitions

**Files:**
- Modify: `apps/api/src/modules/deliveries/routes.ts`
- Create: `apps/api/test/deliveries/transitionsIdempotency.test.ts`

**Interfaces:**
- Consumes: `getIdempotencyResponse`, `storeIdempotencyResponse`, `assertIdempotencyMatch`, `hashRequestBody` from `apps/api/src/lib/idempotency.ts`.
- Produces: optional `Idempotency-Key` on `POST /api/deliveries/:poId/transitions`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/deliveries/transitionsIdempotency.test.ts`:

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
  const router = (await import('../../src/modules/deliveries/routes')).default;
  app.route('/api/deliveries', router);

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
  await db.insert(schema.supplierMembers).values({ id: newId(), supplierId: sup, userId: 'sup-u', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  const mkPo = async (n: number) => {
    const poId = newId();
    await db.insert(schema.purchaseOrders).values({ id: poId, poNumber: `PO-DEL-${n}`, businessId: biz, supplierId: sup, status: 'pending', subtotalCents: 1000, deliveryFeeCents: 0, totalCents: 1000, currency: 'LKR', deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'buyer', createdAt: now, updatedAt: now });
    return poId;
  };
  ids.biz = biz;
  ids.sup = sup;
  ids.po1 = await mkPo(1);
  ids.po2 = await mkPo(2);
}, 60000);

const supplier = () => ({ userId: 'sup-u', isAdmin: false, adminRole: null, businesses: [], suppliers: [] });

describe('POST /api/deliveries/:poId/transitions idempotency', () => {
  it('replays the stored response and writes one delivery event', async () => {
    sessionCtx = supplier();
    const key = 'idem-delivery-replay';
    const body = { status: 'assigned', driverName: 'Kamal' };
    const r1 = await post(`/api/deliveries/${ids.po1}/transitions`, body, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true });

    const r2 = await post(`/api/deliveries/${ids.po1}/transitions`, body, { 'Idempotency-Key': key });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ ok: true });

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const events = (await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.purchaseOrderId, ids.po1)).all()) as any[];
    const deliveryEvents = events.filter((e) => {
      try {
        return JSON.parse(e.metadata ?? '{}').kind === 'delivery';
      } catch {
        return false;
      }
    });
    expect(deliveryEvents).toHaveLength(1);
  });

  it('rejects key reuse with a different payload', async () => {
    sessionCtx = supplier();
    const key = 'idem-delivery-mismatch';
    const r1 = await post(`/api/deliveries/${ids.po2}/transitions`, { status: 'assigned', driverName: 'Kamal' }, { 'Idempotency-Key': key });
    expect(r1.status).toBe(200);

    const r2 = await post(`/api/deliveries/${ids.po2}/transitions`, { status: 'failed', reason: 'no answer' }, { 'Idempotency-Key': key });
    expect(r2.status).toBe(409);
  });

  it('leaves keyless callers unchanged', async () => {
    sessionCtx = supplier();
    const res = await post(`/api/deliveries/${ids.po1}/transitions`, { status: 'assigned', driverName: 'Kamal' });
    expect(res.status).toBe(409);
  });

  it('is 401 without a session', async () => {
    sessionCtx = null;
    const res = await post(`/api/deliveries/${ids.po1}/transitions`, { status: 'assigned' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/deliveries/transitionsIdempotency.test.ts`
Expected: FAIL — the replay test gets 409 on the second call.

- [ ] **Step 3: Implement**

In `apps/api/src/modules/deliveries/routes.ts`:

1. Add the import after the existing `recordAudit` import (line 18):

```ts
import {
  assertIdempotencyMatch,
  getIdempotencyResponse,
  hashRequestBody,
  storeIdempotencyResponse,
} from '../../lib/idempotency';
```

2. Insert between the role check (line 76-78) and `await ensureDelivery` (line 80):

```ts
  const idemKey = c.req.header('Idempotency-Key');
  const requestHash = hashRequestBody({ poId: c.req.param('poId'), body: parsed.data });
  if (idemKey) {
    const hit = await getIdempotencyResponse(c.env.DB, ctx.userId, idemKey);
    if (hit) {
      await assertIdempotencyMatch(c.env.DB, ctx.userId, idemKey, requestHash);
      c.status(hit.statusCode as 200);
      return c.json(JSON.parse(hit.responseJson));
    }
  }
```

3. Replace the final `return c.json({ ok: true });` (line 224):

```ts
  const responseBody = { ok: true as const };
  if (idemKey) {
    await storeIdempotencyResponse(c.env.DB, ctx.userId, idemKey, requestHash, 200, JSON.stringify(responseBody));
  }
  return c.json(responseBody);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run test/deliveries/transitionsIdempotency.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/deliveries/routes.ts apps/api/test/deliveries/transitionsIdempotency.test.ts
git commit -m "feat(deliveries): idempotent delivery transitions"
```

---

### Task 2: Web keys

**Files:**
- Modify: `apps/web/src/supplier/DeliveryTransitionButtons.tsx` (lines 47, 172)

**Interfaces:** consumes the optional `Idempotency-Key` support from Task 1.

- [ ] **Step 1: Add keys at both call sites**

Line 47-51:

```tsx
      api.post(
        `/deliveries/${poId}/transitions`,
        {
          status: next,
          ...(payload?.driverName ? { driverName: payload.driverName } : {}),
          ...(payload?.driverPhone ? { driverPhone: payload.driverPhone } : {}),
        },
        { idempotencyKey: crypto.randomUUID() },
      ),
```

Line 172:

```tsx
            await api.post(
              `/deliveries/${poId}/transitions`,
              { status: 'delivered' },
              { idempotencyKey: crypto.randomUUID() },
            );
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vyro/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/supplier/DeliveryTransitionButtons.tsx
git commit -m "feat(web): idempotency keys on delivery transitions"
```

---

### Task 3: Full verification

- [ ] **Step 1: Fresh full gate**

Run: `pnpm typecheck` (16/16), `pnpm test` (all packages), `pnpm --filter @vyro/web build`, `pnpm --filter @vyro/mobile typecheck && pnpm --filter @vyro/mobile lint`.
Expected: all pass. If the other session's uncommitted files break the web suite, report precisely which tests are theirs.

- [ ] **Step 2: Manual smoke (user)**

Supplier delivery button double-tap/retry → single delivery event.
