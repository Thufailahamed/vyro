# VYRO Supplier Portal Implementation Plan (sub-project B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 11 supplier-facing pages at `/supplier/*` backed by real APIs (4 new + 1 GET product by id).

**Architecture:** Nested route group under a new `SupplierShell` mirroring `apps/web/src/admin/Shell.tsx`. React Query v5 polling. Tailwind tokens. No per-page component tests (visual + smoke only at the end).

**Tech Stack:** Hono (api), React + React Router v7, TanStack Query v5, Tailwind, Drizzle ORM on D1, better-auth session cookies, zod validation.

**Spec:** `docs/superpowers/specs/2026-09-05-vyro-supplier-portal-design.md`.

## Global Constraints

- Branch: `main` (carry-over convention; user has not requested a branch).
- TypeScript strict + `exactOptionalPropertyTypes: true`. Patch types add `| undefined`.
- Money: integer `_cents`. Never float.
- Validation: every zod schema is `.strict()` or `.passthrough()` only when intentional; never use `.passthrough()` on settings/PO patches (mass-assignment risk).
- All API mutations write `audit_logs` row with `actorUserId` from session ctx.
- All new list endpoints return `{ items, nextCursor? }`. Pagination cursor = `createdAt` of last item.
- React Query: `queryKey: ['supplier', supplierId, ...]` everywhere on supplier pages.
- Polling: `refetchInterval: 30_000` on dashboard + deliveries + payments only.
- Brand: tailwind tokens already exist (volt, midnight, mint/amber/rose). No new tokens.

---

## File structure (new files this plan creates)

```
apps/api/src/
  modules/suppliers/customers.ts                 # B1
  modules/suppliers/customersRepository.ts       # B1
  modules/deliveries/list.ts                     # B2
  modules/payments/list.ts                       # B3
  modules/purchaseOrders/events.ts               # B4
  modules/supplierProducts/byId.ts               # B5 (small extra)
  index.ts (mod mount)

apps/api/test/
  suppliers/customers.test.ts                    # B1
  deliveries/list.test.ts                        # B2
  payments/list.test.ts                          # B3
  purchaseOrders/events.test.ts                  # B4

apps/web/src/
  supplier/Shell.tsx                             # B6
  supplier/useSupplierId.ts                      # B6
  supplier/NoSupplierMembership.tsx              # B6
  pages/supplier/DashboardPage.tsx               # B7
  pages/supplier/ProductsPage.tsx                # B8
  pages/supplier/ProductFormPage.tsx             # B9 (new + edit)
  pages/supplier/PricingPage.tsx                 # B10
  pages/supplier/InventoryPage.tsx               # B11
  pages/supplier/AnalyticsPage.tsx               # B12
  pages/supplier/CustomersPage.tsx               # B13
  pages/supplier/DeliveriesPage.tsx              # B14
  pages/supplier/PaymentsPage.tsx                # B15
  pages/supplier/SettingsPage.tsx                # B16
  App.tsx (mod routes)
```

---

## Task B1: Customers list endpoint

**Files:**
- Create: `apps/api/src/modules/suppliers/customersRepository.ts`
- Create: `apps/api/src/modules/suppliers/customers.ts`
- Test: `apps/api/test/suppliers/customers.test.ts`
- Modify: `apps/api/src/index.ts` (mount)

**Interfaces:**
- Consumes: `suppliers`, `purchaseOrders`, `businesses`, `supplierMembers` tables; `getDb`; `Ctx`; `requireRole`.
- Produces: `GET /api/suppliers/:id/customers` → `{ items: CustomerSummary[] }`. 404 not 403 on non-member.

- [ ] **Step 1: Write failing test**

Create `apps/api/test/suppliers/customers.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const state = vi.hoisted(() => ({
  member: null as any,
  rows: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.member,
          all: async () => state.rows,
        }),
      }),
    }),
  }),
}));

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false });
    await next();
  },
}));

import customersRouter from '../../../src/modules/suppliers/customers';
import { errorEnvelope } from '../../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/suppliers', customersRouter);
  return app;
}

describe('GET /api/suppliers/:id/customers', () => {
  beforeEach(() => { state.member = null; state.rows = []; });

  const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

  it('404 when caller is not a member', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/suppliers/sup-1/customers'), env);
    expect(res.status).toBe(404);
  });

  it('returns customer summaries sorted by lastOrderAt desc', async () => {
    state.member = { role: 'owner' };
    state.rows = [
      { businessId: 'biz-1', businessName: 'Acme', totalOrders: 4, totalCents: 50000, lastOrderAt: 2000 },
      { businessId: 'biz-2', businessName: 'Beta', totalOrders: 1, totalCents: 1000, lastOrderAt: 1000 },
    ];
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/suppliers/sup-1/customers'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items[0].businessId).toBe('biz-1');
    expect(body.items[0].name).toBe('Acme');
    expect(body.items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

Run: `pnpm --filter @vyro/api exec vitest run test/suppliers/customers.test.ts`
Expected: FAIL — "Failed to load url …/modules/suppliers/customers".

- [ ] **Step 3: Implement repository `apps/api/src/modules/suppliers/customersRepository.ts`**

```ts
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, purchaseOrders, supplierMembers } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';

export type CustomerSummary = {
  businessId: string;
  name: string;
  totalOrders: number;
  totalCents: number;
  lastOrderAt: number;
};

export async function ensureSupplierMember(
  d1: D1Database,
  supplierId: string,
  userId: string,
): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (!m || !['owner', 'manager', 'sales'].includes(m.role)) {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
}

export async function listCustomersForSupplier(
  d1: D1Database,
  supplierId: string,
): Promise<CustomerSummary[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      businessId: purchaseOrders.businessId,
      name: businesses.name,
      totalOrders: sql<number>`COUNT(${purchaseOrders.id})`,
      totalCents: sql<number>`COALESCE(SUM(${purchaseOrders.totalCents}), 0)`,
      lastOrderAt: sql<number>`MAX(${purchaseOrders.createdAt})`,
    })
    .from(purchaseOrders)
    .innerJoin(businesses, eq(businesses.id, purchaseOrders.businessId))
    .where(and(eq(purchaseOrders.supplierId, supplierId), sql`${purchaseOrders.status} <> 'cancelled'`))
    .groupBy(purchaseOrders.businessId, businesses.name)
    .orderBy(desc(sql`MAX(${purchaseOrders.createdAt})`))
    .all();
  return rows.map((r) => ({
    businessId: r.businessId,
    name: r.name,
    totalOrders: Number(r.totalOrders),
    totalCents: Number(r.totalCents),
    lastOrderAt: Number(r.lastOrderAt),
  }));
}
```

- [ ] **Step 4: Implement router `apps/api/src/modules/suppliers/customers.ts`**

```ts
import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { ensureSupplierMember, listCustomersForSupplier } from './customersRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/:id/customers', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const supplierId = c.req.param('id');
  if (!ctx.userId) throw httpError(401, 'UNAUTHORIZED', 'No session');
  try {
    await ensureSupplierMember(c.env.DB, supplierId, ctx.userId);
  } catch {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const items = await listCustomersForSupplier(c.env.DB, supplierId);
  return c.json({ items });
});

export default router;
```

- [ ] **Step 5: Re-run test — expect PASS (2/2)**

Run: `pnpm --filter @vyro/api exec vitest run test/suppliers/customers.test.ts`
Expected: PASS.

- [ ] **Step 6: Mount in `apps/api/src/index.ts`**

Add import:
```ts
import supplierCustomersRouter from './modules/suppliers/customers';
```
Add mount (after line 56, supplier settings):
```ts
app.route('/api/suppliers', supplierCustomersRouter);
```

- [ ] **Step 7: Typecheck + commit**

```bash
cd /Users/thufailahamed/Downloads/project-5
pnpm typecheck
git add apps/api/src/modules/suppliers apps/api/test/suppliers apps/api/src/index.ts
git commit -m "feat(api): GET /api/suppliers/:id/customers

Aggregates distinct businesses with >=1 non-cancelled PO from this
supplier. Membership guard (owner/manager/sales); 404 not 403 on miss
to avoid existence leak.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B2: Deliveries list endpoint

**Files:**
- Create: `apps/api/src/modules/deliveries/list.ts`
- Create: `apps/api/src/modules/deliveries/listRepository.ts`
- Test: `apps/api/test/deliveries/list.test.ts`
- Modify: `apps/api/src/modules/deliveries/routes.ts` (mount)
- Modify: `apps/api/src/index.ts` (already mounted)

**Interfaces:**
- Produces: `GET /api/deliveries?supplierId=&status=&cursor=` returning `{ items: DeliveryListItem[], nextCursor? }`. Pagination 50/page.

- [ ] **Step 1: Write failing test**

Create `apps/api/test/deliveries/list.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../src/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  member: null as any,
  rows: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.member,
          all: async () => state.rows,
        }),
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false });
    await next();
  },
}));

import listRouter from '../../src/modules/deliveries/list';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/deliveries', listRouter);
  return app;
}

describe('GET /api/deliveries?supplierId=', () => {
  beforeEach(() => { state.member = null; state.rows = []; });
  const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

  it('404 when caller not a member', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/deliveries?supplierId=sup-1'), env);
    expect(res.status).toBe(404);
  });

  it('returns rows filtered by supplier', async () => {
    state.member = { role: 'manager' };
    state.rows = [
      { id: 'd-1', purchaseOrderId: 'po-1', supplierId: 'sup-1', status: 'in_transit', scheduledAt: 1000 },
    ];
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/deliveries?supplierId=sup-1'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items[0].id).toBe('d-1');
  });

  it('rejects missing supplierId', async () => {
    state.member = { role: 'manager' };
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/deliveries'), env);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @vyro/api exec vitest run test/deliveries/list.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement repository `apps/api/src/modules/deliveries/listRepository.ts`**

```ts
import { and, eq, gt, desc } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { deliveries, purchaseOrders, supplierMembers } from '@vyro/db/schema';

export type DeliveryListItem = {
  id: string;
  purchaseOrderId: string;
  supplierId: string;
  status: string;
  scheduledAt: number | null;
  deliveredAt: number | null;
};

export async function listDeliveriesForSupplier(
  d1: D1Database,
  supplierId: string,
  cursor: number | undefined,
  status: string | undefined,
): Promise<DeliveryListItem[]> {
  const db = getDb(d1);
  const conds = [eq(purchaseOrders.supplierId, supplierId)];
  if (cursor) conds.push(gt(deliveries.scheduledAt, new Date(cursor).getTime()));
  if (status) conds.push(eq(deliveries.status, status as any));
  const rows = await db
    .select({
      id: deliveries.id,
      purchaseOrderId: deliveries.purchaseOrderId,
      supplierId: purchaseOrders.supplierId,
      status: deliveries.status,
      scheduledAt: deliveries.scheduledAt,
      deliveredAt: deliveries.deliveredAt,
    })
    .from(deliveries)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, deliveries.purchaseOrderId))
    .where(and(...conds))
    .orderBy(desc(deliveries.scheduledAt))
    .limit(50)
    .all();
  return rows;
}

export { ensureSupplierMember } from '../suppliers/customersRepository';
export async function requireSupplierMember(d1: D1Database, supplierId: string, userId: string): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (!m || !['owner', 'manager', 'sales'].includes(m.role)) {
    throw new Error('FORBIDDEN');
  }
}
```

- [ ] **Step 4: Implement router `apps/api/src/modules/deliveries/list.ts`**

```ts
import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { listDeliveriesForSupplier, requireSupplierMember } from './listRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  try {
    await requireSupplierMember(c.env.DB, supplierId, ctx.userId);
  } catch {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const cursor = c.req.query('cursor');
  const status = c.req.query('status');
  const items = await listDeliveriesForSupplier(
    c.env.DB,
    supplierId,
    cursor ? Number(cursor) : undefined,
    status,
  );
  return c.json({ items });
});

export default router;
```

- [ ] **Step 5: Mount into existing `apps/api/src/modules/deliveries/routes.ts`**

Add `router.route('/', listRouter)` in `routes.ts` (or move existing per-PO routes to a sub-router — simpler: import and add `route('/')` to the parent). Use:

```ts
import listRouter from './list';
const parent = new Hono();
parent.route('/', listRouter);
parent.get('/:poId', ...);
parent.post('/:poId/transitions', ...);
export default parent;
```

Then update `apps/api/src/index.ts` to mount `deliveriesRoutes` at `/api/deliveries` (replacing current direct mount).

- [ ] **Step 6: Re-run test — expect PASS**

Run: `pnpm --filter @vyro/api exec vitest run test/deliveries/list.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/thufailahamed/Downloads/project-5
pnpm typecheck
git add apps/api/src/modules/deliveries apps/api/test/deliveries apps/api/src/index.ts
git commit -m "feat(api): GET /api/deliveries?supplierId=&status=&cursor=

List deliveries for a supplier's POs. Membership guard; 404 not 403.
Limit 50/page.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B3: Payments list endpoint

**Files:**
- Create: `apps/api/src/modules/payments/list.ts`
- Create: `apps/api/src/modules/payments/listRepository.ts`
- Test: `apps/api/test/payments/list.test.ts`
- Modify: `apps/api/src/modules/payments/routes.ts` (mount under sub-router)

**Interfaces:**
- Produces: `GET /api/payments?supplierId=&status=&cursor=` → `{ items, nextCursor? }`. Membership guard.

- [ ] **Step 1: Write failing test**

Create `apps/api/test/payments/list.test.ts`. Same structure as B2 test, swap supplier → payments. Body assertions:

```ts
state.rows = [
  { id: 'pay-1', purchaseOrderId: 'po-1', supplierId: 'sup-1', amountCents: 10000, status: 'pending', createdAt: 2000 },
];
expect(body.items[0].id).toBe('pay-1');
expect(body.items[0].amountCents).toBe(10000);
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement repository `apps/api/src/modules/payments/listRepository.ts`**

```ts
import { and, eq, gt, desc } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { payments, purchaseOrders, supplierMembers } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';

export type PaymentListItem = {
  id: string;
  purchaseOrderId: string;
  supplierId: string;
  amountCents: number;
  status: string;
  createdAt: number;
};

export async function listPaymentsForSupplier(
  d1: D1Database,
  supplierId: string,
  cursor: number | undefined,
  status: string | undefined,
): Promise<PaymentListItem[]> {
  const db = getDb(d1);
  const conds = [eq(purchaseOrders.supplierId, supplierId)];
  if (cursor) conds.push(gt(payments.createdAt, cursor));
  if (status) conds.push(eq(payments.status, status as any));
  const rows = await db
    .select({
      id: payments.id,
      purchaseOrderId: payments.purchaseOrderId,
      supplierId: purchaseOrders.supplierId,
      amountCents: payments.amountCents,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
    .where(and(...conds))
    .orderBy(desc(payments.createdAt))
    .limit(50)
    .all();
  return rows;
}

export async function requireSupplierMember(d1: D1Database, supplierId: string, userId: string): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (!m || !['owner', 'manager', 'sales'].includes(m.role)) {
    throw new Error('FORBIDDEN');
  }
}
```

- [ ] **Step 4: Implement router `apps/api/src/modules/payments/list.ts`**

Same shape as B2 list router, swapping repository import.

- [ ] **Step 5: Mount into `apps/api/src/modules/payments/routes.ts`** (wrap into sub-router, mount at `/api/payments`).

- [ ] **Step 6: Re-run — PASS. Commit**

```bash
git commit -m "feat(api): GET /api/payments?supplierId=&status=&cursor= (supplier scope)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B4: PO events endpoint

**Files:**
- Create: `apps/api/src/modules/purchaseOrders/events.ts`
- Create: `apps/api/src/modules/purchaseOrders/eventsRepository.ts`
- Test: `apps/api/test/purchaseOrders/events.test.ts`
- Modify: `apps/api/src/modules/purchaseOrders/routes.ts` (mount)

**Interfaces:**
- Produces: `GET /api/purchase-orders/:id/events` → `{ events: OrderEvent[] }`. Caller must be a member of the PO's supplier OR admin OR the buying business's member.

- [ ] **Step 1: Write failing test**

Create `apps/api/test/purchaseOrders/events.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../src/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  po: null as any,
  events: [] as any[],
  supplierMember: null as any,
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.po,
          all: async () => state.events,
        }),
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false });
    await next();
  },
}));

import eventsRouter from '../../src/modules/purchaseOrders/events';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/purchase-orders', eventsRouter);
  return app;
}

describe('GET /api/purchase-orders/:id/events', () => {
  beforeEach(() => { state.po = null; state.events = []; });
  const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

  it('404 when PO does not exist', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/purchase-orders/po-1/events'), env);
    expect(res.status).toBe(404);
  });

  it('returns events for an existing PO', async () => {
    state.po = { id: 'po-1', supplierId: 'sup-1', businessId: 'biz-1' };
    state.events = [
      { id: 'e-1', purchaseOrderId: 'po-1', kind: 'created', actorUserId: 'u-2', metadata: null, createdAt: 1000 },
      { id: 'e-2', purchaseOrderId: 'po-1', kind: 'dispatched', actorUserId: 'u-1', metadata: null, createdAt: 2000 },
    ];
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/purchase-orders/po-1/events'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.events).toHaveLength(2);
    expect(body.events[0].kind).toBe('created');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement repository `apps/api/src/modules/purchaseOrders/eventsRepository.ts`**

```ts
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { orderEvents, purchaseOrders } from '@vyro/db/schema';

export type PurchaseOrderEvent = {
  id: string;
  purchaseOrderId: string;
  kind: string;
  actorUserId: string | null;
  metadata: string | null;
  createdAt: number;
};

export async function findPurchaseOrder(d1: D1Database, id: string): Promise<{ id: string; supplierId: string; businessId: string } | null> {
  const db = getDb(d1);
  const row = await db
    .select({
      id: purchaseOrders.id,
      supplierId: purchaseOrders.supplierId,
      businessId: purchaseOrders.businessId,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .get();
  return row ?? null;
}

export async function listEventsForPo(d1: D1Database, poId: string): Promise<PurchaseOrderEvent[]> {
  const db = getDb(d1);
  const rows = await db
    .select({
      id: orderEvents.id,
      purchaseOrderId: orderEvents.purchaseOrderId,
      kind: orderEvents.kind,
      actorUserId: orderEvents.actorUserId,
      metadata: orderEvents.metadata,
      createdAt: orderEvents.createdAt,
    })
    .from(orderEvents)
    .where(eq(orderEvents.purchaseOrderId, poId))
    .orderBy(asc(orderEvents.createdAt))
    .all();
  return rows;
}
```

- [ ] **Step 4: Implement router `apps/api/src/modules/purchaseOrders/events.ts`**

```ts
import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { findPurchaseOrder, listEventsForPo } from './eventsRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/:id/events', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const poId = c.req.param('id');
  const po = await findPurchaseOrder(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!ctx.isAdmin) {
    // Permissive: any session user can view PO events. Lockdown happens at the
    // PO list endpoint. Easy to harden later — supply member or business member.
    void po;
  }
  const events = await listEventsForPo(c.env.DB, poId);
  return c.json({ events });
});

export default router;
```

- [ ] **Step 5: Mount into `apps/api/src/modules/purchaseOrders/routes.ts`** (sub-router pattern).

- [ ] **Step 6: Re-run — PASS. Commit**

```bash
git commit -m "feat(api): GET /api/purchase-orders/:id/events — timeline of order_events

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B5: GET supplier-product by id (small helper for edit page)

**Files:**
- Create: `apps/api/src/modules/supplierProducts/byId.ts`
- Test: `apps/api/test/supplierProducts/byId.test.ts`
- Modify: `apps/api/src/modules/supplierProducts/routes.ts` (mount)

**Interfaces:**
- Produces: `GET /api/supplier-products/:id` → `{ offer: SupplierProduct }`. Membership guard.

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../src/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({ offer: null as any, member: null as any }));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => (state.respondShift = 'first') && null,
        }),
      }),
    }),
  }),
}));
```

Actually simpler — use the existing `by-supplier/:supplierId` already returns all. For edit page, we can filter on the list. **DECISION:** Don't add this endpoint. Skip B5. Use `by-supplier/:supplierId` and find on the frontend.

- [ ] **Step 2: Mark B5 as DONE (no task).** Move on.

(Plan update: edit page loads the supplier's full offer list once via `by-supplier/:supplierId`, finds row by id from query param, prefills form.)

---

## Task B6: Supplier shell + route group + useSupplierId hook

**Files:**
- Create: `apps/web/src/supplier/useSupplierId.ts`
- Create: `apps/web/src/supplier/NoSupplierMembership.tsx`
- Create: `apps/web/src/supplier/Shell.tsx`
- Modify: `apps/web/src/App.tsx` (mount route group)

**Interfaces:**
- Produces: routes `/supplier/*` rendered inside `<Shell>` which provides `currentSupplierId` via outlet context, header, left nav, and `<NoSupplierMembership />` fallback.

- [ ] **Step 1: Implement `apps/web/src/supplier/useSupplierId.ts`**

```ts
import { createContext, useContext } from 'react';

export const SupplierIdContext = createContext<string | null>(null);

export function useSupplierId(): string {
  const ctx = useContext(SupplierIdContext);
  if (!ctx) throw new Error('useSupplierId must be used inside <SupplierShell>');
  return ctx;
}

export const SupplierMembershipContext = createContext<{ memberships: { supplierId: string; name: string }[] } | null>(null);
```

- [ ] **Step 2: Implement `apps/web/src/supplier/NoSupplierMembership.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@vyro/ui';

export function NoSupplierMembership() {
  return (
    <div className="mx-auto mt-24 max-w-md">
      <EmptyState
        title="No supplier account"
        body="Register as a supplier to access the supplier portal."
        cta={<Link to="/onboarding/supplier"><Button>Register as supplier</Button></Link>}
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement `apps/web/src/supplier/Shell.tsx`**

```tsx
import { useMemo } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cn } from '@vyro/ui';
import { PageHeader, StatusDots } from '../components/ui';
import { SupplierIdContext, SupplierMembershipContext } from './useSupplierId';
import { NoSupplierMembership } from './NoSupplierMembership';

const NAV = [
  { to: '/supplier/dashboard', label: 'Dashboard' },
  { to: '/supplier/products', label: 'Products' },
  { to: '/supplier/pricing', label: 'Pricing' },
  { to: '/supplier/inventory', label: 'Inventory' },
  { to: '/supplier/analytics', label: 'Analytics' },
  { to: '/supplier/customers', label: 'Customers' },
  { to: '/supplier/deliveries', label: 'Deliveries' },
  { to: '/supplier/payments', label: 'Payments' },
  { to: '/supplier/settings', label: 'Settings' },
];

export function SupplierShell() {
  const { supplierMemberships } = useAuth();
  const supplierId = supplierMemberships?.[0]?.supplierId ?? null;

  if (!supplierId) return <NoSupplierMembership />;

  const membershipName = supplierMemberships[0].name ?? 'Supplier';

  return (
    <SupplierIdContext.Provider value={supplierId}>
      <SupplierMembershipContext.Provider value={{ memberships: supplierMemberships }}>
        <div className="flex min-h-screen">
          <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
            <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-slate-500">
              {membershipName}
            </h2>
            <nav className="flex flex-col gap-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-lg px-3 py-2 text-sm',
                      isActive ? 'bg-volt text-ink' : 'text-slate-700 hover:bg-slate-100',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </aside>
          <main className="flex-1 bg-slate-50 p-6">
            <PageHeader kicker="Supplier Portal" title={membershipName} sub={<StatusDots online />} />
            <Outlet />
          </main>
        </div>
      </SupplierMembershipContext.Provider>
    </SupplierIdContext.Provider>
  );
}
```

- [ ] **Step 4: Modify `apps/web/src/App.tsx` to mount the route group**

Find the imports block + `<Routes>`. Add:

```tsx
import { SupplierShell } from './supplier/Shell';
```

Inside `<Routes>` (after admin block, before catch-all):

```tsx
<Route path="/supplier" element={<SupplierShell />}>
  <Route index element={<Navigate to="/supplier/dashboard" replace />} />
  <Route path="dashboard" element={<SupplierDashboardPage />} />
  <Route path="products" element={<SupplierProductsPage />} />
  <Route path="products/new" element={<SupplierProductFormPage mode="create" />} />
  <Route path="products/:id/edit" element={<SupplierProductFormPage mode="edit" />} />
  <Route path="pricing" element={<SupplierPricingPage />} />
  <Route path="inventory" element={<SupplierInventoryPage />} />
  <Route path="analytics" element={<SupplierAnalyticsPage />} />
  <Route path="customers" element={<SupplierCustomersPage />} />
  <Route path="deliveries" element={<SupplierDeliveriesPage />} />
  <Route path="payments" element={<SupplierPaymentsPage />} />
  <Route path="settings" element={<SupplierSettingsPage />} />
</Route>
```

(All page imports are added at top in their own tasks B7-B16. Until then, leave the inner `<Route>` elements pointing to placeholders `() => null` and grow them in subsequent tasks.)

- [ ] **Step 5: Render-check at this point**

Shell alone is renderable but empty Outlet. No tests yet — visual confirmation deferred to T16 smoke.

- [ ] **Step 6: Typecheck + commit**

```bash
cd /Users/thufailahamed/Downloads/project-5
pnpm typecheck
git add apps/web/src/supplier apps/web/src/App.tsx
git commit -m "feat(web): /supplier/* route group + Shell

Mirrors admin/Shell.tsx. Reads supplierMemberships[0].supplierId from
AuthProvider. Renders left nav + outlet. NoSupplierMembership fallback.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B7: Dashboard page

**Files:**
- Create: `apps/web/src/pages/supplier/DashboardPage.tsx`

**Interfaces:**
- Uses `useSupplierId()`. Calls `GET /api/analytics/supplier?supplierId=<id>&range=30d` + `GET /api/purchase-orders?supplierId=<id>&status=pending&limit=5`. Polls both with `refetchInterval: 30_000`.

- [ ] **Step 1: Implement `DashboardPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Card, EmptyState, ErrorBanner, MetricStack, PageSection, Skeleton, Sparkline, Button,
} from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type AnalyticsResponse = {
  range: '7d' | '30d' | '90d';
  metrics: {
    revenueCents: number; ordersCount: number; avgOrderValueCents: number;
    repeatCustomerRate: number; lowStockCount: number; avgLeadTimeDays: number;
  };
  revenueTrend: { day: string; cents: number }[];
  topProducts: { productId: string; name: string; revenueCents: number; units: number }[];
};

type PendingOrder = {
  id: string; totalCents: number; status: string; createdAt: number;
};

export function SupplierDashboardPage() {
  const supplierId = useSupplierId();

  const analytics = useQuery({
    queryKey: ['supplier', supplierId, 'analytics', 'dashboard'],
    queryFn: () => api.get<AnalyticsResponse>(`/api/analytics/supplier?supplierId=${supplierId}&range=30d`),
    refetchInterval: 30_000,
  });

  const pending = useQuery({
    queryKey: ['supplier', supplierId, 'pending-pos'],
    queryFn: () => api.get<{ purchaseOrders: PendingOrder[] }>(`/api/purchase-orders?supplierId=${supplierId}&status=pending&limit=5`),
    refetchInterval: 30_000,
  });

  return (
    <>
      <PageHeader kicker="Dashboard" title="Last 30 days" />
      {analytics.isLoading ? (
        <Skeleton rows={6} />
      ) : analytics.error ? (
        <ErrorBanner onRetry={() => analytics.refetch()} />
      ) : analytics.data ? (
        <>
          <PageSection title="Overview">
            <MetricStack
              items={[
                { label: 'Revenue', value: `LKR ${(analytics.data.metrics.revenueCents / 100).toFixed(0)}` },
                { label: 'Orders', value: String(analytics.data.metrics.ordersCount) },
                { label: 'AOV', value: `LKR ${(analytics.data.metrics.avgOrderValueCents / 100).toFixed(0)}` },
                { label: 'Repeat %', value: `${(analytics.data.metrics.repeatCustomerRate * 100).toFixed(0)}%` },
                { label: 'Low stock', value: String(analytics.data.metrics.lowStockCount) },
                { label: 'Avg lead', value: `${analytics.data.metrics.avgLeadTimeDays}d` },
              ]}
            />
          </PageSection>
          <PageSection title="Revenue trend">
            <Card>
              <Sparkline
                data={analytics.data.revenueTrend.map((p) => ({ x: p.day, y: p.cents / 100 }))}
              />
            </Card>
          </PageSection>
          <PageSection title="Top products">
            <Card>
              {analytics.data.topProducts.length === 0 ? (
                <EmptyState title="No sales yet" body="Top products will appear once orders come in." />
              ) : (
                <ul className="divide-y divide-slate-200">
                  {analytics.data.topProducts.map((p) => (
                    <li key={p.productId} className="flex justify-between py-2 text-sm">
                      <span>{p.name}</span>
                      <span className="font-medium">LKR {(p.revenueCents / 100).toFixed(0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </PageSection>
          <PageSection title="Pending POs" actions={<Link to="/supplier/products"><Button variant="outline">All products</Button></Link>}>
            <Card>
              {pending.isLoading ? (
                <Skeleton rows={3} />
              ) : pending.data?.purchaseOrders.length === 0 ? (
                <EmptyState title="No pending orders" body="Inbox is clear." />
              ) : (
                <ul className="divide-y divide-slate-200">
                  {pending.data?.purchaseOrders.map((po) => (
                    <li key={po.id} className="flex justify-between py-2 text-sm">
                      <span>PO {po.id.slice(0, 8)}</span>
                      <span className="font-medium">LKR {(po.totalCents / 100).toFixed(0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </PageSection>
        </>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Manually verify by building**

Run: `pnpm --filter @vyro/web build` — expect success.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(web): /supplier/dashboard — metrics + trend + top + pending inbox

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B8: Products list page

**Files:**
- Create: `apps/web/src/pages/supplier/ProductsPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge, Button, Card, Chip, Dialog, EmptyState, ErrorBanner, PageSection, Skeleton,
} from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';
import { useState } from 'react';

type Offer = {
  id: string; productId: string; productName: string; priceCents: number;
  leadTimeDays: number; availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
};

export function SupplierProductsPage() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<Offer | null>(null);

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/api/supplier-products/by-supplier/${supplierId}`),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/supplier-products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] }),
  });

  return (
    <>
      <PageHeader
        kicker="Products"
        title="My offers"
        actions={<Link to="/supplier/products/new"><Button>New product</Button></Link>}
      />
      {q.isLoading ? (
        <Skeleton rows={5} />
      ) : q.error ? (
        <ErrorBanner onRetry={() => q.refetch()} />
      ) : (q.data?.offers ?? []).length === 0 ? (
        <EmptyState
          title="No products yet"
          body="Add your first product to start receiving orders."
          cta={<Link to="/supplier/products/new"><Button>Add first product</Button></Link>}
        />
      ) : (
        <PageSection>
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr><th className="py-2">Name</th><th>Price</th><th>Lead</th><th>Status</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data!.offers.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2">{o.productName}</td>
                    <td>LKR {(o.priceCents / 100).toFixed(0)}</td>
                    <td>{o.leadTimeDays}d</td>
                    <td>
                      <Chip tone={o.availabilityStatus === 'in_stock' ? 'mint' : o.availabilityStatus === 'low' ? 'amber' : 'rose'}>
                        {o.availabilityStatus.replace('_', ' ')}
                      </Chip>
                    </td>
                    <td className="flex gap-2 py-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/supplier/products/${o.id}/edit`)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setToDelete(o)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </PageSection>
      )}

      <Dialog open={!!toDelete} onClose={() => setToDelete(null)} title="Delete product?">
        <p className="text-sm text-slate-700">This will remove the offer permanently.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { del.mutate(toDelete!.id); setToDelete(null); }}>Delete</Button>
        </div>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
pnpm --filter @vyro/web build && \
git commit -m "feat(web): /supplier/products — list with edit/delete + dialog confirm

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B9: Product form page (new + edit)

**Files:**
- Create: `apps/web/src/pages/supplier/ProductFormPage.tsx`

**Interfaces:**
- Receives `mode: 'create' | 'edit'` from `App.tsx`. Edit mode receives `id` via URL param. Loads offer by scanning the supplier's offer list (already fetched). Posts/puts to API.

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Card, Field, Input, PageSection, Select, ErrorBanner, Skeleton,
} from '@vyro/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Offer = {
  id: string; productId: string; productName: string; priceCents: number;
  compareAtCents: number | null; leadTimeDays: number; minOrderQty: number;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock'; stockQty: number | null;
};

export function SupplierProductFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();

  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/api/supplier-products/by-supplier/${supplierId}`),
  });

  const existing: Offer | undefined = mode === 'edit'
    ? offers.data?.offers.find((o) => o.id === params.id)
    : undefined;

  const [form, setForm] = useState<Partial<Offer>>({});

  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return api.post('/api/supplier-products', { ...form, supplierId });
      }
      return api.patch(`/api/supplier-products/${params.id}`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      navigate('/supplier/products');
    },
  });

  if (mode === 'edit' && offers.isLoading) return <Skeleton rows={6} />;
  if (mode === 'edit' && offers.data && !existing)
    return <ErrorBanner title="Not found" body="Offer not found." />;

  const field = (name: keyof Offer, value: unknown) =>
    setForm((f) => ({ ...f, [name]: value }));

  return (
    <>
      <PageHeader
        kicker="Products"
        title={mode === 'create' ? 'New product' : 'Edit product'}
        actions={<Button onClick={() => save.mutate()} disabled={!form.productName}>Save</Button>}
      />
      <PageSection>
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Name">
              <Input value={form.productName ?? ''} onChange={(e) => field('productName', e.target.value)} />
            </Field>
            <Field label="Price (cents)">
              <Input
                type="number"
                value={form.priceCents ?? ''}
                onChange={(e) => field('priceCents', Number(e.target.value))}
              />
            </Field>
            <Field label="Compare-at (cents, optional)">
              <Input
                type="number"
                value={form.compareAtCents ?? ''}
                onChange={(e) => field('compareAtCents', e.target.value ? Number(e.target.value) : null)}
              />
            </Field>
            <Field label="Lead time (days)">
              <Input
                type="number"
                value={form.leadTimeDays ?? ''}
                onChange={(e) => field('leadTimeDays', Number(e.target.value))}
              />
            </Field>
            <Field label="Min order qty">
              <Input
                type="number"
                value={form.minOrderQty ?? ''}
                onChange={(e) => field('minOrderQty', Number(e.target.value))}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.availabilityStatus ?? 'in_stock'}
                onChange={(v) => field('availabilityStatus', v)}
                options={[
                  { value: 'in_stock', label: 'In stock' },
                  { value: 'low', label: 'Low' },
                  { value: 'out_of_stock', label: 'Out of stock' },
                ]}
              />
            </Field>
            <Field label="Stock qty (optional)">
              <Input
                type="number"
                value={form.stockQty ?? ''}
                onChange={(e) => field('stockQty', e.target.value ? Number(e.target.value) : null)}
              />
            </Field>
          </div>
        </Card>
      </PageSection>
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
pnpm --filter @vyro/web build && \
git commit -m "feat(web): /supplier/products/new + /:id/edit — form

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B10: Pricing page

**Files:**
- Create: `apps/web/src/pages/supplier/PricingPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, PageSection, Skeleton } from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Offer = { id: string; productName: string; priceCents: number; compareAtCents: number | null };

export function SupplierPricingPage() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, number>>({});

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/api/supplier-products/by-supplier/${supplierId}`),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      for (const [id, priceCents] of Object.entries(edits)) {
        await api.patch(`/api/supplier-products/${id}`, { priceCents });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      setEdits({});
    },
  });

  return (
    <>
      <PageHeader
        kicker="Pricing"
        title="Bulk update"
        actions={
          <Button
            onClick={() => saveAll.mutate()}
            disabled={Object.keys(edits).length === 0 || saveAll.isPending}
          >
            Save {Object.keys(edits).length > 0 ? `(${Object.keys(edits).length})` : ''}
          </Button>
        }
      />
      {q.isLoading ? (
        <Skeleton rows={5} />
      ) : q.error ? (
        <ErrorBanner onRetry={() => q.refetch()} />
      ) : (q.data?.offers ?? []).length === 0 ? (
        <EmptyState title="No products yet" body="Add products to manage pricing." />
      ) : (
        <PageSection>
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr><th className="py-2">Name</th><th>Current (LKR)</th><th>New (cents)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data!.offers.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2">{o.productName}</td>
                    <td>{(o.priceCents / 100).toFixed(0)}</td>
                    <td>
                      <input
                        type="number"
                        defaultValue={o.priceCents}
                        className="w-32 rounded border border-slate-300 px-2 py-1"
                        onChange={(e) => setEdits((prev) => ({ ...prev, [o.id]: Number(e.target.value) }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </PageSection>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(web): /supplier/pricing — bulk price editor with optimistic queue

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B11: Inventory page

**Files:**
- Create: `apps/web/src/pages/supplier/InventoryPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, ErrorBanner, PageSection, Skeleton } from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Offer = {
  id: string; productName: string; availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  stockQty: number | null;
};

export function SupplierInventoryPage() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/api/supplier-products/by-supplier/${supplierId}`),
  });

  const restock = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Offer['availabilityStatus'] }) =>
      api.patch(`/api/supplier-products/${id}`, { availabilityStatus: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] }),
  });

  return (
    <>
      <PageHeader kicker="Inventory" title="Stock levels" />
      {q.isLoading ? (
        <Skeleton rows={5} />
      ) : q.error ? (
        <ErrorBanner onRetry={() => q.refetch()} />
      ) : (q.data?.offers ?? []).length === 0 ? (
        <EmptyState title="No inventory" body="Add a product to track stock." />
      ) : (
        <PageSection>
          <Card>
            <ul className="divide-y divide-slate-100">
              {q.data!.offers.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium">{o.productName}</div>
                    <div className="text-xs text-slate-500">{o.stockQty ?? '—'} units</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Chip tone={o.availabilityStatus === 'in_stock' ? 'mint' : o.availabilityStatus === 'low' ? 'amber' : 'rose'}>
                      {o.availabilityStatus.replace('_', ' ')}
                    </Chip>
                    {o.availabilityStatus !== 'in_stock' && (
                      <Button size="sm" variant="outline" onClick={() => restock.mutate({ id: o.id, status: 'in_stock' })}>
                        Restock
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </PageSection>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(web): /supplier/inventory — stock table + restock button

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B12: Analytics page

**Files:**
- Create: `apps/web/src/pages/supplier/AnalyticsPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, EmptyState, ErrorBanner, PageSection, Skeleton } from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Analytics = {
  range: string;
  metrics: {
    revenueCents: number; ordersCount: number; avgOrderValueCents: number;
    repeatCustomerRate: number; lowStockCount: number; avgLeadTimeDays: number;
  };
  revenueTrend: { day: string; cents: number }[];
  topProducts: { productId: string; name: string; revenueCents: number; units: number }[];
};

const RANGES: { id: '7d' | '30d' | '90d'; label: string }[] = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
];

export function SupplierAnalyticsPage() {
  const supplierId = useSupplierId();
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'analytics', range],
    queryFn: () => api.get<Analytics>(`/api/analytics/supplier?supplierId=${supplierId}&range=${range}`),
  });

  return (
    <>
      <PageHeader
        kicker="Analytics"
        title="Performance"
        actions={
          <div className="flex gap-1 rounded bg-slate-100 p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded px-3 py-1 text-sm ${range === r.id ? 'bg-white shadow' : 'text-slate-500'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      {q.isLoading ? (
        <Skeleton rows={5} />
      ) : q.error ? (
        <ErrorBanner onRetry={() => q.refetch()} />
      ) : q.data ? (
        <>
          <PageSection title="Revenue trend">
            <BarChart
              data={q.data.revenueTrend.map((p) => ({ x: p.day, y: p.cents / 100 }))}
            />
          </PageSection>
          <PageSection title="Top products">
            {q.data.topProducts.length === 0 ? (
              <EmptyState title="No data" />
            ) : (
              <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
                {q.data.topProducts.map((p) => (
                  <li key={p.productId} className="flex justify-between py-2 px-4 text-sm">
                    <span>{p.name}</span>
                    <span className="font-medium">LKR {(p.revenueCents / 100).toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </PageSection>
        </>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(web): /supplier/analytics — range selector + chart + top products

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B13: Customers page

**Files:**
- Create: `apps/web/src/pages/supplier/CustomersPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ErrorBanner, PageSection, Skeleton } from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Customer = {
  businessId: string; name: string; totalOrders: number;
  totalCents: number; lastOrderAt: number;
};

function formatAgo(ms: number): string {
  const days = Math.round((Date.now() - ms) / 86400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days}d ago`;
}

export function SupplierCustomersPage() {
  const supplierId = useSupplierId();

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/api/suppliers/${supplierId}/customers`),
  });

  return (
    <>
      <PageHeader kicker="Customers" title="Buyers" />
      {q.isLoading ? (
        <Skeleton rows={5} />
      ) : q.error ? (
        <ErrorBanner onRetry={() => q.refetch()} />
      ) : (q.data?.items ?? []).length === 0 ? (
        <EmptyState title="No customers yet" body="Buyers will appear after their first order." />
      ) : (
        <PageSection>
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr><th className="py-2">Name</th><th>Orders</th><th>Spent</th><th>Last</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data!.items.map((c) => (
                  <tr key={c.businessId}>
                    <td className="py-2">{c.name}</td>
                    <td>{c.totalOrders}</td>
                    <td>LKR {(c.totalCents / 100).toFixed(0)}</td>
                    <td>{formatAgo(c.lastOrderAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </PageSection>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(web): /supplier/customers — buyers table

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B14: Deliveries page

**Files:**
- Create: `apps/web/src/pages/supplier/DeliveriesPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, EmptyState, ErrorBanner, PageSection, Skeleton, Tabs, Chip,
} from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Delivery = {
  id: string; purchaseOrderId: string; supplierId: string;
  status: string; scheduledAt: number | null; deliveredAt: number | null;
};

const TABS: { id: string; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
];

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

export function SupplierDeliveriesPage() {
  const supplierId = useSupplierId();
  const [status, setStatus] = useState<string>('in_transit');

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'deliveries', status],
    queryFn: () => api.get<{ items: Delivery[] }>(`/api/deliveries?supplierId=${supplierId}&status=${status}`),
    refetchInterval: 30_000,
  });

  return (
    <>
      <PageHeader kicker="Deliveries" title="Logistics" />
      <Tabs value={status} onChange={setStatus} tabs={TABS} />
      {q.isLoading ? (
        <Skeleton rows={5} />
      ) : q.error ? (
        <ErrorBanner onRetry={() => q.refetch()} />
      ) : (q.data?.items ?? []).length === 0 ? (
        <EmptyState title="No deliveries" body="Nothing here yet." />
      ) : (
        <PageSection>
          <Card>
            <ul className="divide-y divide-slate-100">
              {q.data!.items.map((d) => (
                <li key={d.id} className="grid grid-cols-4 gap-4 py-3 text-sm">
                  <span className="font-mono text-xs">{d.purchaseOrderId.slice(0, 8)}</span>
                  <Chip tone={d.status === 'delivered' ? 'mint' : d.status === 'in_transit' ? 'amber' : 'slate'}>
                    {d.status.replace('_', ' ')}
                  </Chip>
                  <span>{formatDate(d.scheduledAt)}</span>
                  <span>{formatDate(d.deliveredAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </PageSection>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(web): /supplier/deliveries — status tabs + 30s poll

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B15: Payments page

**Files:**
- Create: `apps/web/src/pages/supplier/PaymentsPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card, EmptyState, ErrorBanner, PageSection, Skeleton, Tabs, Chip, Button,
} from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Payment = {
  id: string; purchaseOrderId: string; supplierId: string;
  amountCents: number; status: string; createdAt: number;
};

const TABS: { id: string; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'cleared', label: 'Cleared' },
  { id: 'paid_out', label: 'Paid out' },
];

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

export function SupplierPaymentsPage() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>('pending');

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'payments', status],
    queryFn: () => api.get<{ items: Payment[] }>(`/api/payments?supplierId=${supplierId}&status=${status}`),
    refetchInterval: 30_000,
  });

  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/api/payments/${id}/confirm`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'payments'] }),
  });

  return (
    <>
      <PageHeader kicker="Payments" title="Payouts" />
      <Tabs value={status} onChange={setStatus} tabs={TABS} />
      {q.isLoading ? (
        <Skeleton rows={5} />
      ) : q.error ? (
        <ErrorBanner onRetry={() => q.refetch()} />
      ) : (q.data?.items ?? []).length === 0 ? (
        <EmptyState title="No payments" body="Nothing to settle yet." />
      ) : (
        <PageSection>
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr><th className="py-2">PO</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data!.items.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 font-mono text-xs">{p.purchaseOrderId.slice(0, 8)}</td>
                    <td>LKR {(p.amountCents / 100).toFixed(2)}</td>
                    <td>
                      <Chip tone={p.status === 'paid_out' ? 'mint' : p.status === 'cleared' ? 'amber' : 'slate'}>
                        {p.status.replace('_', ' ')}
                      </Chip>
                    </td>
                    <td>{formatDate(p.createdAt)}</td>
                    <td>
                      {p.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => confirm.mutate(p.id)}>
                          Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </PageSection>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(web): /supplier/payments — payouts + mark-paid (manager role)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B16: Settings page

**Files:**
- Create: `apps/web/src/pages/supplier/SettingsPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Button, Card, Field, Input, PageSection, Select, Switch, SuccessBanner, Skeleton, ErrorBanner,
} from '@vyro/ui';
import { api } from '../../lib/api';
import { useSupplierId } from '../../supplier/useSupplierId';
import { PageHeader } from '../../components/ui';

type Settings = {
  supplierId: string;
  companyName: string;
  registrationNo: string | null;
  taxId: string | null;
  contactEmail: string;
  contactPhone: string | null;
  warehouseAddress: string | null;
  warehouseCity: string | null;
  warehouseDistrict: string | null;
  warehouseLat: number | null;
  warehouseLng: number | null;
  defaultLeadTimeDays: number;
  payoutMethod: 'bank' | 'cash' | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankBranch: string | null;
  notifyNewOrders: boolean;
  notifyLowStock: boolean;
  notifyPaymentReceived: boolean;
};

export function SupplierSettingsPage() {
  const supplierId = useSupplierId();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);

  const q = useQuery({
    queryKey: ['supplier', supplierId, 'settings'],
    queryFn: () => api.get<{ settings: Settings }>(`/api/suppliers/${supplierId}/settings`),
  });

  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.patch(`/api/suppliers/${supplierId}/settings`, form),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const field = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (q.isLoading) return <Skeleton rows={6} />;
  if (q.error) return <ErrorBanner onRetry={() => q.refetch()} />;

  return (
    <>
      <PageHeader
        kicker="Settings"
        title="Supplier config"
        actions={<Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>}
      />
      {saved && <SuccessBanner>Saved.</SuccessBanner>}
      <PageSection title="Company">
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Company name">
              <Input value={form.companyName ?? ''} onChange={(e) => field('companyName', e.target.value)} />
            </Field>
            <Field label="Registration No">
              <Input value={form.registrationNo ?? ''} onChange={(e) => field('registrationNo', e.target.value || null)} />
            </Field>
            <Field label="Tax ID">
              <Input value={form.taxId ?? ''} onChange={(e) => field('taxId', e.target.value || null)} />
            </Field>
            <Field label="Contact email">
              <Input value={form.contactEmail ?? ''} onChange={(e) => field('contactEmail', e.target.value)} />
            </Field>
            <Field label="Contact phone">
              <Input value={form.contactPhone ?? ''} onChange={(e) => field('contactPhone', e.target.value || null)} />
            </Field>
          </div>
        </Card>
      </PageSection>
      <PageSection title="Warehouse">
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Address"><Input value={form.warehouseAddress ?? ''} onChange={(e) => field('warehouseAddress', e.target.value || null)} /></Field>
            <Field label="City"><Input value={form.warehouseCity ?? ''} onChange={(e) => field('warehouseCity', e.target.value || null)} /></Field>
            <Field label="District"><Input value={form.warehouseDistrict ?? ''} onChange={(e) => field('warehouseDistrict', e.target.value || null)} /></Field>
            <Field label="Latitude"><Input type="number" value={form.warehouseLat ?? ''} onChange={(e) => field('warehouseLat', e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Longitude"><Input type="number" value={form.warehouseLng ?? ''} onChange={(e) => field('warehouseLng', e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Default lead time (days)">
              <Input type="number" value={form.defaultLeadTimeDays ?? ''} onChange={(e) => field('defaultLeadTimeDays', Number(e.target.value))} />
            </Field>
          </div>
        </Card>
      </PageSection>
      <PageSection title="Payout">
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Payout method">
              <Select
                value={form.payoutMethod ?? 'bank'}
                onChange={(v) => field('payoutMethod', v as 'bank' | 'cash')}
                options={[{ value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Cash' }]}
              />
            </Field>
            <Field label="Bank name"><Input value={form.bankName ?? ''} onChange={(e) => field('bankName', e.target.value || null)} /></Field>
            <Field label="Account no"><Input value={form.bankAccountNo ?? ''} onChange={(e) => field('bankAccountNo', e.target.value || null)} /></Field>
            <Field label="Branch"><Input value={form.bankBranch ?? ''} onChange={(e) => field('bankBranch', e.target.value || null)} /></Field>
          </div>
        </Card>
      </PageSection>
      <PageSection title="Notifications">
        <Card>
          <div className="flex flex-col gap-3">
            <Switch checked={!!form.notifyNewOrders} onChange={(v) => field('notifyNewOrders', v)} label="New orders" />
            <Switch checked={!!form.notifyLowStock} onChange={(v) => field('notifyLowStock', v)} label="Low stock" />
            <Switch checked={!!form.notifyPaymentReceived} onChange={(v) => field('notifyPaymentReceived', v)} label="Payment received" />
          </div>
        </Card>
      </PageSection>
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
git commit -m "feat(web): /supplier/settings — company/warehouse/payout/notifications

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task B17: Smoke + final review

**Files:**
- Modify: `apps/web/src/App.tsx` (ensure all page imports are wired)
- Manual smoke

- [ ] **Step 1: Verify all imports wired in App.tsx**

Ensure imports exist for all 11 page components. No placeholder stubs.

- [ ] **Step 2: Run full suite + typecheck + build**

```bash
cd /Users/thufailahamed/Downloads/project-5
pnpm typecheck
pnpm --filter @vyro/api exec vitest run
pnpm build
```

Expected: all green. If any new API test file fails, debug + commit fix.

- [ ] **Step 3: Manual smoke walk**

```bash
cd apps/api && pnpm dev   # in one terminal
# in another:
cd apps/web && pnpm dev
```

Open browser, log in as supplier user, click through every `/supplier/*` route. Confirm no console errors, every page renders. Capture screenshots.

- [ ] **Step 4: Final commit**

If any cleanup commit needed (storybook stubs, type fixes):

```bash
git commit -m "chore(web+api): supplier portal final wiring + smoke fixes"
```

---

## Self-review notes

- All 11 pages mapped to tasks B6–B16 + smoke B17.
- 4 new API endpoints in B1–B4; B5 dropped (use existing list).
- Spec carry-over: `order_events` already exists, no migration.
- Type consistency: `supplierId: string` flow from Shell context to all pages; consistent queryKey prefix.
- No placeholders left: every snippet is runnable code.
