# VYRO Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 3 new admin pages (Supplier detail, Business detail, Users) + polish 6 existing admin pages.

**Architecture:** 3 new endpoints in existing admin router → 3 new React pages under `<AdminShell>`. Visual polish sweeps across the 6 existing pages. No new schema. Tests for endpoints only.

**Tech Stack:** Hono + Drizzle + D1 (api), React + React Router + React Query + Surface/PageHeader/StatusDots (web), vi.hoisted + path.resolve test pattern.

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true`
- `vi.hoisted` + `path.resolve(process.cwd(), 'src')` for nested test mock paths
- Real endpoints, no mocks in production code
- `errorEnvelope(err)` for `{ error: { code, message, details? } }` shape
- `httpError(status, code, message, details)` from `lib/errors`
- `requireRole({ admin: true })` on all admin endpoints
- Visual polish criteria: PageHeader present, StatusDots for PO/status, `slate-*` → `ink-*`, `font-bold` → `font-semibold`

---

### Task C1: GET /api/admin/suppliers/:id

**Files:**
- Create: `apps/api/src/modules/admin/supplierDetailRepository.ts`
- Modify: `apps/api/src/modules/admin/routes.ts:1-19`
- Test: `apps/api/test/admin/supplierDetail.test.ts`

**Interfaces:**
- Produces: `getSupplierDetailForAdmin(d1, id): Promise<SupplierDetail | null>`
- `SupplierDetail = { id, name, description, status, createdAt, members: [{ userId, role, email }], offerCount, activePoCount }`

- [ ] **Step 1: Write the failing test** in `apps/api/test/admin/supplierDetail.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  supplier: null as any,
  members: [] as any[],
  offerCount: 0,
  poCount: 0,
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({
          get: async () => state.supplier,
          all: async () => state.members,
        }),
      }),
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/requireRole', () => ({
  requireRole: () => async (_c: any, next: any) => { await next(); },
}));

import supplierDetailRouter from '../../src/modules/admin/supplierDetail';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin', supplierDetailRouter);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('GET /api/admin/suppliers/:id', () => {
  beforeEach(() => { state.supplier = null; state.members = []; });

  it('404 when supplier not found', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers/sup-1'), env);
    expect(res.status).toBe(404);
  });

  it('200 with members + counts', async () => {
    state.supplier = { id: 'sup-1', name: 'Acme', description: null, status: 'active', createdAt: 1000 };
    state.members = [
      { userId: 'u-1', role: 'owner', email: 'a@b.com' },
      { userId: 'u-2', role: 'manager', email: 'c@d.com' },
    ];
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers/sup-1'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.supplier.name).toBe('Acme');
    expect(body.supplier.members).toHaveLength(2);
    expect(body.supplier.offerCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd apps/api && pnpm exec vitest run test/admin/supplierDetail.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Create repository** `apps/api/src/modules/admin/supplierDetailRepository.ts`:

```ts
import { eq, isNull, and, ne } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, supplierMembers, users, supplierProducts, purchaseOrders } from '@vyro/db/schema';

export type SupplierDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  offerCount: number;
  activePoCount: number;
};

export async function getSupplierDetailForAdmin(
  d1: D1Database,
  id: string,
): Promise<SupplierDetail | null> {
  const db = getDb(d1);
  const supplier = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .get();
  if (!supplier) return null;

  const members = await db
    .select({ userId: supplierMembers.userId, role: supplierMembers.role, email: users.email })
    .from(supplierMembers)
    .innerJoin(users, eq(users.id, supplierMembers.userId))
    .where(eq(supplierMembers.supplierId, id))
    .all();

  const offerRow = await db
    .select({ c: supplierProducts.id })
    .from(supplierProducts)
    .where(and(eq(supplierProducts.supplierId, id), isNull(supplierProducts.deletedAt)))
    .all();
  const poRow = await db
    .select({ c: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.supplierId, id), ne(purchaseOrders.status, 'cancelled')))
    .all();

  return {
    id: supplier.id,
    name: supplier.name,
    description: supplier.description ?? null,
    status: supplier.status,
    createdAt: supplier.createdAt,
    members,
    offerCount: offerRow.length,
    activePoCount: poRow.length,
  };
}
```

- [ ] **Step 4: Create router** `apps/api/src/modules/admin/supplierDetail.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../env';
import { requireRole } from '../../middleware/requireRole';
import { httpError } from '../../lib/errors';
import { getSupplierDetailForAdmin } from './supplierDetailRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', requireRole({ admin: true }));

router.get('/suppliers/:id', async (c) => {
  const detail = await getSupplierDetailForAdmin(c.env.DB, c.req.param('id'));
  if (!detail) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  return c.json({ supplier: detail });
});

export default router;
```

- [ ] **Step 5: Wire into index** — modify `apps/api/src/index.ts` to import and mount `supplierDetail` under `/api/admin`. Look at how existing admin router is mounted; add a sibling mount.

- [ ] **Step 6: Run test to verify it passes**
Run: `cd apps/api && pnpm exec vitest run test/admin/supplierDetail.test.ts`
Expected: 2 passed

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/admin/supplierDetail.ts apps/api/src/modules/admin/supplierDetailRepository.ts apps/api/test/admin/supplierDetail.test.ts apps/api/src/modules/admin/routes.ts apps/api/src/index.ts
git commit -m "feat(api): GET /api/admin/suppliers/:id — supplier detail for admin"
```

---

### Task C2: GET /api/admin/businesses/:id

**Files:**
- Create: `apps/api/src/modules/admin/businessDetailRepository.ts`
- Create: `apps/api/src/modules/admin/businessDetail.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/admin/businessDetail.test.ts`

**Interfaces:**
- Produces: `getBusinessDetailForAdmin(d1, id): Promise<BusinessDetail | null>`
- `BusinessDetail = { id, name, status, createdAt, members: [{ userId, role, email }], orderCount, recentOrders: [{ id, status, totalCents, createdAt }] }`

- [ ] **Step 1: Write the failing test** mirroring C1's structure, replacing `suppliers` → `businesses`, `supplierMembers` → `businessMembers`, offers → orders. Assert 404 + 200 with `recentOrders`.

- [ ] **Step 2: Run test to verify it fails**
Run: `cd apps/api && pnpm exec vitest run test/admin/businessDetail.test.ts`
Expected: FAIL

- [ ] **Step 3: Create repository** mirroring C1's pattern, joining `purchaseOrders` on `businessId`, ordering by `desc(purchaseOrders.createdAt)`, limiting to 20.

```ts
export async function getBusinessDetailForAdmin(
  d1: D1Database,
  id: string,
): Promise<BusinessDetail | null> {
  const db = getDb(d1);
  const business = await db.select().from(businesses).where(eq(businesses.id, id)).get();
  if (!business) return null;
  const members = await db
    .select({ userId: businessMembers.userId, role: businessMembers.role, email: users.email })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, id))
    .all();
  const orders = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, totalCents: purchaseOrders.totalCents, createdAt: purchaseOrders.createdAt })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.businessId, id))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(20)
    .all();
  const all = await db
    .select({ c: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.businessId, id), ne(purchaseOrders.status, 'cancelled')))
    .all();
  return {
    id: business.id,
    name: business.name,
    status: business.status,
    createdAt: business.createdAt,
    members,
    orderCount: all.length,
    recentOrders: orders,
  };
}
```

- [ ] **Step 4: Create router** mirroring C1, path = `/businesses/:id`.

- [ ] **Step 5: Wire into index** — add mount to `apps/api/src/index.ts`.

- [ ] **Step 6: Run test to verify it passes**
Run: `cd apps/api && pnpm exec vitest run test/admin/businessDetail.test.ts`
Expected: 2 passed

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/modules/admin/businessDetail.ts apps/api/src/modules/admin/businessDetailRepository.ts apps/api/test/admin/businessDetail.test.ts apps/api/src/index.ts
git commit -m "feat(api): GET /api/admin/businesses/:id — business detail for admin"
```

---

### Task C3: POST /api/admin/suppliers/:id/unfreeze

**Files:**
- Modify: `apps/api/src/modules/admin/routes.ts:38-67`
- Test: `apps/api/test/admin/freezeUnfreeze.test.ts`

**Interfaces:**
- Mirrors existing `/freeze` endpoint. Sets `suppliers.status = 'active'`. Writes audit log.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  supplier: null as any,
  audits: [] as any[],
  updated: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_t: any) => ({
        where: (_c: any) => ({ get: async () => state.supplier }),
      }),
    }),
    update: (_t: any) => ({
      set: (_v: any) => ({
        where: (_c: any) => ({ run: async () => { state.updated.push(_v); } }),
      }),
    }),
    insert: (_t: any) => ({
      values: (_v: any) => ({ run: async () => { state.audits.push(_v); } }),
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/requireRole', () => ({
  requireRole: () => async (_c: any, next: any) => { _c.set('ctx', { userId: 'admin-1', isAdmin: true }); await next(); },
}));

import adminRouter from '../../src/modules/admin/routes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin', adminRouter);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('POST /api/admin/suppliers/:id/unfreeze', () => {
  beforeEach(() => { state.supplier = null; state.audits = []; state.updated = []; });

  it('404 when supplier not found', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers/sup-1/unfreeze', { method: 'POST' }), env);
    expect(res.status).toBe(404);
  });

  it('200 + audit when unfrozen', async () => {
    state.supplier = { id: 'sup-1', status: 'frozen' };
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/suppliers/sup-1/unfreeze', { method: 'POST' }), env);
    expect(res.status).toBe(200);
    expect(state.updated[0]).toEqual({ status: 'active' });
    expect(state.audits[0].action).toBe('supplier.unfreeze');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd apps/api && pnpm exec vitest run test/admin/freezeUnfreeze.test.ts`
Expected: FAIL (route not found)

- [ ] **Step 3: Add unfreeze handler** in `apps/api/src/modules/admin/routes.ts` mirroring the freeze handler:

```ts
router.post('/suppliers/:id/unfreeze', async (c) => {
  const supplier = await findSupplierById(c.env.DB, c.req.param('id'));
  if (!supplier) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  await setSupplierStatus(c.env.DB, supplier.id, 'active');
  await recordAudit(c.env.DB, {
    actorUserId: c.get('ctx')?.userId ?? null,
    action: 'supplier.unfreeze',
    resourceType: 'supplier',
    resourceId: supplier.id,
    metadata: null,
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
  return c.json({ ok: true, status: 'active' });
});
```

Add a `setSupplierStatus` helper to `apps/api/src/modules/suppliers/repository.ts`:

```ts
export async function setSupplierStatus(d1: D1Database, id: string, status: string): Promise<void> {
  const db = getDb(d1);
  await db.update(suppliers).set({ status }).where(eq(suppliers.id, id)).run();
}
```

Also refactor the existing freeze handler to use this helper (avoid duplication).

- [ ] **Step 4: Run test to verify it passes**
Run: `cd apps/api && pnpm exec vitest run test/admin/freezeUnfreeze.test.ts`
Expected: 2 passed

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/admin/routes.ts apps/api/src/modules/suppliers/repository.ts apps/api/test/admin/freezeUnfreeze.test.ts
git commit -m "feat(api): POST /api/admin/suppliers/:id/unfreeze + status helper"
```

---

### Task C4: SupplierDetailPage + route

**Files:**
- Create: `apps/web/src/admin/SupplierDetailPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/admin/Lists.tsx` (link row to detail)

- [ ] **Step 1: Create page** `apps/web/src/admin/SupplierDetailPage.tsx`:

```tsx
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Badge, StatusDots } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

type Detail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  offerCount: number;
  activePoCount: number;
};

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ['admin-supplier', id],
    queryFn: () => api.get<{ supplier: Detail }>(`/admin/suppliers/${id}`),
    retry: false,
  });

  const toggleFreeze = useMutation({
    mutationFn: () =>
      detail.data?.supplier.status === 'frozen'
        ? api.post(`/admin/suppliers/${id}/unfreeze`)
        : api.post(`/admin/suppliers/${id}/freeze`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-supplier', id] });
      void qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      toast.success('Supplier updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (detail.isError) {
    return (
      <div className="space-y-4">
        <PageHeader kicker="Admin" title="Supplier not found" />
        <Link to="/admin/suppliers" className="text-volt underline">← Back to suppliers</Link>
      </div>
    );
  }
  if (!detail.data) return <p className="text-sm text-ink-4">Loading…</p>;
  const s = detail.data.supplier;
  const isFrozen = s.status === 'frozen';

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-4 mb-1">Supplier</p>
          <h1 className="vyro-display text-2xl">{s.name}</h1>
          <p className="text-sm text-ink-4">{s.description ?? 'No description.'}</p>
        </div>
        <Button variant={isFrozen ? 'primary' : 'danger'} onClick={() => toggleFreeze.mutate()} disabled={toggleFreeze.isPending}>
          {isFrozen ? 'Unfreeze supplier' : 'Freeze supplier'}
        </Button>
      </header>

      <div className="grid sm:grid-cols-3 gap-px bg-ink/10">
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Status</div>
          <div className="flex items-center gap-2 mt-2">
            <StatusDots status={isFrozen ? 'failed' : 'delivered'} />
            <span className="font-medium capitalize">{s.status}</span>
          </div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Offers</div>
          <div className="text-2xl vyro-display mt-1">{s.offerCount}</div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Active POs</div>
          <div className="text-2xl vyro-display mt-1">{s.activePoCount}</div>
        </div>
      </div>

      <Surface kind="elevated" className="p-6">
        <h2 className="vyro-display text-lg mb-4">Members</h2>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
            <tr>
              <th className="text-left py-2 font-normal">Email</th>
              <th className="text-left py-2 font-normal">Role</th>
            </tr>
          </thead>
          <tbody>
            {s.members.map((m) => (
              <tr key={m.userId} className="border-t border-line">
                <td className="py-2">{m.email ?? '—'}</td>
                <td className="py-2"><Badge variant="neutral">{m.role}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>

      <Link to="/admin/suppliers" className="text-xs text-ink-4 hover:text-volt">← Back to suppliers</Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire route** in `apps/web/src/App.tsx` — add inside the existing `<Route path="/admin" element={<AdminShell />}>` block:

```tsx
<Route path="suppliers/:id" element={<RequireAdmin><SupplierDetailPage /></RequireAdmin>} />
```

Add the import near the other admin page imports.

- [ ] **Step 3: Link rows to detail** in `apps/web/src/admin/Lists.tsx` — wrap the supplier row cells (or just the name) in `<Link to={`/admin/suppliers/${s.id}`}>`.

- [ ] **Step 4: Verify**
Run: `cd apps/web && pnpm typecheck && pnpm build`
Expected: both succeed

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/admin/SupplierDetailPage.tsx apps/web/src/App.tsx apps/web/src/admin/Lists.tsx
git commit -m "feat(admin): supplier detail page + row link + freeze/unfreeze"
```

---

### Task C5: BusinessDetailPage + route

**Files:**
- Create: `apps/web/src/admin/BusinessDetailPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/admin/Lists.tsx` (link business row)

- [ ] **Step 1: Create page** `apps/web/src/admin/BusinessDetailPage.tsx` mirroring C4's pattern:
- Header: name + status + suspend button (placeholder alert "suspend not yet wired")
- Tiles: Members count, Orders, Recent orders list
- Members table (same as suppliers)
- Recent orders table (id, status, total, created)

- [ ] **Step 2: Wire route** in `apps/web/src/App.tsx`:

```tsx
<Route path="businesses/:id" element={<RequireAdmin><BusinessDetailPage /></RequireAdmin>} />
```

- [ ] **Step 3: Link rows to detail** in `apps/web/src/admin/Lists.tsx` — wrap the business row name in `<Link to={`/admin/businesses/${b.id}`}>`.

- [ ] **Step 4: Verify**
Run: `cd apps/web && pnpm typecheck && pnpm build`

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/admin/BusinessDetailPage.tsx apps/web/src/App.tsx apps/web/src/admin/Lists.tsx
git commit -m "feat(admin): business detail page + row link"
```

---

### Task C6: UsersPage + route

**Files:**
- Create: `apps/web/src/admin/UsersPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/admin/Shell.tsx` (add nav link)

- [ ] **Step 1: Create page** `apps/web/src/admin/UsersPage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

type User = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  suspendedAt: number | null;
  createdAt: number;
};

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<{ users: User[] }>('/admin/users'),
    retry: false,
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/suspend`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User suspended'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  const unsuspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/unsuspend`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User restored'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  const list = users.data?.users ?? [];

  return (
    <div className="space-y-6">
      <PageHeader kicker="Moderation" title="Users" sub={`${list.length} registered user${list.length === 1 ? '' : 's'}.`} />
      <Surface kind="elevated" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
            <tr>
              <th className="text-left px-4 py-3 font-normal">Name</th>
              <th className="text-left px-4 py-3 font-normal">Email</th>
              <th className="text-left px-4 py-3 font-normal">Role</th>
              <th className="text-left px-4 py-3 font-normal">Status</th>
              <th className="text-right px-4 py-3 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{u.name || '—'}</td>
                <td className="px-4 py-3 text-ink-3">{u.email}</td>
                <td className="px-4 py-3">{u.isAdmin ? <Badge variant="brand">Admin</Badge> : <Badge variant="neutral">User</Badge>}</td>
                <td className="px-4 py-3">{u.suspendedAt ? <Badge variant="danger">Suspended</Badge> : <Badge variant="success">Active</Badge>}</td>
                <td className="px-4 py-3 text-right">
                  {u.suspendedAt ? (
                    <Button size="sm" variant="ghost" onClick={() => unsuspend.mutate(u.id)} disabled={unsuspend.isPending}>Unsuspend</Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => suspend.mutate(u.id)} disabled={suspend.isPending || u.isAdmin}>Suspend</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 2: Wire route** in `apps/web/src/App.tsx`:

```tsx
<Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
```

- [ ] **Step 3: Add nav link** in `apps/web/src/admin/Shell.tsx` — insert `<NavLink to="/admin/users">Users</NavLink>` into the nav.

- [ ] **Step 4: Verify**
Run: `cd apps/web && pnpm typecheck && pnpm build`

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/admin/UsersPage.tsx apps/web/src/App.tsx apps/web/src/admin/Shell.tsx
git commit -m "feat(admin): users moderation page + nav link"
```

---

### Task C7: polish 6 existing admin pages

**Files:**
- Modify: `apps/web/src/admin/HomePage.tsx`
- Modify: `apps/web/src/admin/LoginPage.tsx`
- Modify: `apps/web/src/admin/Lists.tsx`
- Modify: `apps/web/src/admin/DisputedAndAudit.tsx`

Polish criteria applied to each:
- `PageHeader` present and consistent (kicker/title/sub structure)
- `StatusDots` for status displays (replaces raw status strings where possible)
- `slate-*` → `ink-*` (search and replace)
- `font-bold` → `font-semibold`
- All pages use Surface/MetricNumber consistent with B + polish sweeps

- [ ] **Step 1: HomePage polish**
- Verify PageHeader present (it is). Replace any `slate-*` → `ink-*`. Replace `font-bold` → `font-semibold`.

- [ ] **Step 2: LoginPage polish**
- PageHeader already present. Visual tokens consistent. No `font-bold` / `slate-*`.

- [ ] **Step 3: Lists polish (SuppliersPage + BusinessesPage)**
- Ensure PageHeader in both branches. Replace `slate-*` → `ink-*`. Replace `font-bold` → `font-semibold`. Use `StatusDots` for status badges.

- [ ] **Step 4: DisputedAndAudit polish**
- Ensure PageHeader in both DisputedPage + AuditPage. Apply same replacements. Use `StatusDots` for PO status in DisputedPage.

- [ ] **Step 5: Verify**
Run: `cd apps/web && pnpm typecheck && pnpm build`

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/admin/
git commit -m "polish(admin): visual token sweep across all 6 existing admin pages"
```

---

### Task C8: smoke + final

- [ ] **Step 1: Run full test suite**
Run: `cd apps/api && pnpm exec vitest run`
Expected: all tests pass (3 new test files, total suite ≥ 85 tests)

- [ ] **Step 2: Run typecheck across monorepo**
Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 3: Run web build**
Run: `cd apps/web && pnpm build`
Expected: built without errors

- [ ] **Step 4: Verify routes in App.tsx**
Confirm all 3 new routes wired and import block clean.

- [ ] **Step 5: Commit (if any cleanup)**
Only if previous steps surfaced fixups; otherwise this is a no-op.

- [ ] **Step 6: Report**
Report commit list for sub-project C and offer sub-project D.

---

## Execution Choice

User selected **Inline Execution** during brainstorming. Begin with C1.
