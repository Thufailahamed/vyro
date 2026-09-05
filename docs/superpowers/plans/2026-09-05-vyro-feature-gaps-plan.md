# VYRO Feature Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 33 feature gaps across business, supplier, and admin portals identified in `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md`. Ships in 10 phases, each phase = one task, each task ends at green `pnpm typecheck && pnpm test`.

**Architecture:** Most gaps are web UI work (gating, wiring, replacement of mock arrays). Where new endpoints are needed, follow the existing Hono router + Drizzle repository pattern. Where new tables are needed, add numbered migrations under `packages/db/migrations/`. No new packages.

**Tech Stack:** Hono + Drizzle + D1 (api), React + React Query + Tailwind (web), vitest with `@cloudflare/vitest-pool-workers` (api tests).

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true`
- `vi.hoisted` + `path.resolve(process.cwd(), 'src')` for nested test mock paths
- `errorEnvelope(err)` + `httpError(status, code, message, details?)` from `apps/api/src/lib/errors.ts`
- `session()` + `requireRole({ admin: true })` middleware on admin endpoints
- `Surface`, `PageHeader`, `Button`, `Input`, `Label`, `StatusDots` from existing `@vyro/ui` barrel
- `useToast` for mutation feedback; `ApiError.message` carries the user-facing text
- All audit log writes use `{ id: crypto.randomUUID(), actorUserId, action, resourceType, resourceId, metadata: JSON.stringify(...), ip, userAgent, createdAt: Date.now() }`
- One task = one commit; branches `feat/gap-p<N>-<slug>` off `main`
- Each new migration is a numbered file under `packages/db/migrations/` and committed in the same task as the code that uses it

---

### Task 1 (Phase 1): Disputes end-to-end

**Files:**
- Create: `apps/api/src/modules/admin/disputes.ts`
- Create: `apps/api/src/modules/admin/disputeRepository.ts`
- Modify: `apps/api/src/modules/admin/routes.ts:1-19` (mount new router)
- Create: `apps/api/test/admin/dispute.test.ts`
- Create: `apps/web/src/admin/DisputeResolutionPanel.tsx`
- Modify: `apps/web/src/admin/DisputedAndAudit.tsx:88-90` (mount panel)
- Modify: `scripts/e2e.md` (extend walkthrough)

**Interfaces:**
- `POST /api/admin/disputes/:poId/resolve` body `{ outcome: 'refund_business' | 'release_supplier', note?: string }` → `{ ok: true, status: 'cancelled' | 'delivered' }`
- `GET /api/admin/disputes` returns `{ disputes: [{ poId, businessId, supplierId, status, openedAt, counterpartyName }] }`

- [ ] **Step 1: Write failing test** `apps/api/test/admin/dispute.test.ts`:

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
  po: null as any,
  resolved: null as any,
  audit: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ get: async () => state.po }) }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ run: async () => { state.resolved = v; } }) }) }),
    insert: () => ({ values: (v: any) => ({ run: async () => { state.audit.push(v); } }) }),
  }),
}));

vi.mock(setup.SRC + '/middleware/requireRole', () => ({ requireRole: () => async (_c: any, n: any) => { await n(); } }));
vi.mock(setup.SRC + '/middleware/session', () => ({ session: () => async (c: any, n: any) => { c.set('ctx', { userId: 'admin-1' }); await n(); } }));

import disputeRouter from '../../src/modules/admin/disputes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => { const env = errorEnvelope(err); return c.json(env.body, env.status as any); });
  app.route('/api/admin', disputeRouter);
  return app;
}
const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('POST /api/admin/disputes/:poId/resolve', () => {
  beforeEach(() => { state.po = null; state.resolved = null; state.audit = []; });

  it('404 when PO not found', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/disputes/po-x/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'refund_business' }) }), env);
    expect(res.status).toBe(404);
  });

  it('refund_business → cancelled + audit row', async () => {
    state.po = { id: 'po-1', status: 'disputed', businessId: 'b-1', supplierId: 's-1' };
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/disputes/po-1/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'refund_business', note: 'seller no-show' }) }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('cancelled');
    expect(state.resolved).toEqual({ status: 'cancelled' });
    expect(state.audit[0].action).toBe('dispute.resolved');
  });

  it('release_supplier → delivered', async () => {
    state.po = { id: 'po-2', status: 'disputed', businessId: 'b-1', supplierId: 's-1' };
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/disputes/po-2/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'release_supplier' }) }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('delivered');
  });

  it('409 when PO not in disputed state', async () => {
    state.po = { id: 'po-3', status: 'pending', businessId: 'b-1', supplierId: 's-1' };
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/disputes/po-3/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'refund_business' }) }), env);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd apps/api && pnpm exec vitest run test/admin/dispute.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Create repository** `apps/api/src/modules/admin/disputeRepository.ts`:

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';

export async function findDisputedPo(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
}

export async function setPoStatus(d1: D1Database, id: string, status: string) {
  const db = getDb(d1);
  await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, id)).run();
}

export async function listDisputed(d1: D1Database) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).all();
}
```

- [ ] **Step 4: Create router** `apps/api/src/modules/admin/disputes.ts`:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { getDb } from '@vyro/db';
import { auditLogs, notifications } from '@vyro/db/schema';
import { findDisputedPo, listDisputed, setPoStatus } from './disputeRepository';

type Ctx = { userId: string };

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));

const resolveSchema = z.object({
  outcome: z.enum(['refund_business', 'release_supplier']),
  note: z.string().max(500).optional(),
}).strict();

router.get('/disputes', async (c) => {
  const rows = await listDisputed(c.env.DB);
  return c.json({ disputes: rows });
});

router.post('/disputes/:poId/resolve', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  if (!poId) throw httpError(400, 'VALIDATION_ERROR', 'Missing poId');
  const parsed = resolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const po = await findDisputedPo(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (po.status !== 'disputed') throw httpError(409, 'INVALID_STATE', 'PO not disputed');

  const next = parsed.data.outcome === 'refund_business' ? 'cancelled' : 'delivered';
  await setPoStatus(c.env.DB, poId, next);

  const db = getDb(c.env.DB);
  const now = Date.now();
  const counterpartyId = parsed.data.outcome === 'refund_business' ? po.supplierId : po.businessId;
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: counterpartyId,
    type: 'dispute.resolved',
    link: `/orders/${poId}`,
    read: 0,
    createdAt: now,
  }).run();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'dispute.resolved',
    resourceType: 'purchase_order',
    resourceId: poId,
    metadata: JSON.stringify({ outcome: parsed.data.outcome, note: parsed.data.note ?? null }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: now,
  }).run();

  return c.json({ ok: true, status: next });
});

export default router;
```

- [ ] **Step 5: Mount router** in `apps/api/src/modules/admin/routes.ts`. After the existing `adminRouter` export, mount the new router:

```ts
import disputeRouter from './disputes';
app.route('/api/admin', disputeRouter);
```

Place after `app.route('/api/admin', adminRouter);` in `apps/api/src/index.ts:57`.

- [ ] **Step 6: Run test to verify it passes**
Run: `cd apps/api && pnpm exec vitest run test/admin/dispute.test.ts`
Expected: PASS

- [ ] **Step 7: Add UI panel** `apps/web/src/admin/DisputeResolutionPanel.tsx`:

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Surface } from '@/components/ui';
import { useToast } from '@vyro/ui';

type Outcome = 'refund_business' | 'release_supplier';

export function DisputeResolutionPanel({ poId, onResolved }: { poId: string; onResolved?: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: (outcome: Outcome) =>
      api.post<{ ok: true; status: string }>(`/admin/disputes/${poId}/resolve`, { outcome, note: note || undefined }),
    onSuccess: (data) => {
      toast.success(`Resolved → ${data.status}`);
      void qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      onResolved?.();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  return (
    <Surface kind="elevated" className="p-4 space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (optional)"
        className="w-full h-20 rounded-xs border border-line bg-paper text-ink-1 p-2 text-body"
      />
      <div className="flex gap-2">
        <Button variant="primary" disabled={mut.isPending} onClick={() => mut.mutate('refund_business')}>Refund buyer</Button>
        <Button variant="ghost" disabled={mut.isPending} onClick={() => mut.mutate('release_supplier')}>Release supplier</Button>
      </div>
    </Surface>
  );
}
```

- [ ] **Step 8: Mount panel in DisputedAndAudit.tsx** (currently `apps/web/src/admin/DisputedAndAudit.tsx:88-90`). Replace the `<StatusDots>` cell with:

```tsx
<DisputeResolutionPanel poId={row.poId} onResolved={() => qc.invalidateQueries({ queryKey: ['admin-disputes'] })} />
```

Add import at top: `import { DisputeResolutionPanel } from './DisputeResolutionPanel';`

- [ ] **Step 9: Extend `scripts/e2e.md`** with one new section "Dispute resolution" — buyer marks delivered→disputed, admin resolves refund, verify PO cancelled + notification + audit row.

- [ ] **Step 10: Verify gates**
Run: `pnpm typecheck && cd apps/api && pnpm exec vitest run`
Expected: clean typecheck, all tests pass (previous 89 + new 4)

- [ ] **Step 11: Commit**
```bash
git add apps/api/src/modules/admin/disputes.ts apps/api/src/modules/admin/disputeRepository.ts apps/api/src/modules/admin/routes.ts apps/api/src/index.ts apps/api/test/admin/dispute.test.ts apps/web/src/admin/DisputeResolutionPanel.tsx apps/web/src/admin/DisputedAndAudit.tsx scripts/e2e.md
git commit -m "feat(gap): P1 disputes end-to-end — admin resolve + audit + notify"
```

---

### Task 2 (Phase 2): Suspend / unsuspend business

**Files:**
- Modify: `apps/api/src/modules/admin/routes.ts:80-140` (mirror supplier freeze)
- Create: `apps/api/test/admin/businessFreeze.test.ts`
- Modify: `apps/web/src/admin/BusinessDetailPage.tsx:48-50` (replace disabled stub)
- Create: `apps/web/src/admin/BusinessSuspendButton.tsx`

- [ ] **Step 1: Write failing test** `apps/api/test/admin/businessFreeze.test.ts` (mirror supplier freeze test at `apps/api/test/admin/freezeUnfreeze.test.ts`):

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

const state = vi.hoisted(() => ({ biz: null as any, update: null as any, audit: [] as any[] }));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ get: async () => state.biz }) }) }),
    update: () => ({ set: (v: any) => ({ where: () => ({ run: async () => { state.update = v; } }) }) }),
    insert: () => ({ values: (v: any) => ({ run: async () => { state.audit.push(v); } }) }),
  }),
  businesses: { id: 'id', status: 'status' },
}));

vi.mock(setup.SRC + '/middleware/requireRole', () => ({ requireRole: () => async (_c: any, n: any) => { await n(); } }));
vi.mock(setup.SRC + '/middleware/session', () => ({ session: () => async (c: any, n: any) => { c.set('ctx', { userId: 'admin-1' }); await n(); } }));

import { errorEnvelope } from '../../src/lib/errors';
import adminRouter from '../../src/modules/admin/routes';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => { const env = errorEnvelope(err); return c.json(env.body, env.status as any); });
  app.route('/api/admin', adminRouter);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('business freeze', () => {
  beforeEach(() => { state.biz = null; state.update = null; state.audit = []; });

  it('freezes business', async () => {
    state.biz = { id: 'biz-1', status: 'active' };
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/businesses/biz-1/freeze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'policy' }) }), env);
    expect(res.status).toBe(200);
    expect(state.update).toEqual({ status: 'suspended' });
    expect(state.audit[0].action).toBe('business.freeze');
  });

  it('unfreezes business', async () => {
    state.biz = { id: 'biz-1', status: 'suspended' };
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/businesses/biz-1/unfreeze', { method: 'POST' }), env);
    expect(res.status).toBe(200);
    expect(state.update).toEqual({ status: 'active' });
  });

  it('404 when business missing', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/admin/businesses/x/freeze', { method: 'POST' }), env);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to fail**
Run: `cd apps/api && pnpm exec vitest run test/admin/businessFreeze.test.ts`
Expected: FAIL (route not registered)

- [ ] **Step 3: Add freeze/unfreeze routes** in `apps/api/src/modules/admin/routes.ts`. Add after the supplier freeze block:

```ts
router.post('/businesses/:id/freeze', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const idParsed = idParam.safeParse(c.req.param());
  if (!idParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const parsed = freezeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const biz = await db.select().from(businesses).where(eq(businesses.id, idParsed.data.id)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  await db.update(businesses).set({ status: 'suspended' }).where(eq(businesses.id, biz.id)).run();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), actorUserId: ctx.userId, action: 'business.freeze',
    resourceType: 'business', resourceId: biz.id,
    metadata: JSON.stringify({ reason: parsed.data.reason }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: Date.now(),
  }).run();

  return c.json({ ok: true, status: 'suspended' });
});

router.post('/businesses/:id/unfreeze', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const idParsed = idParam.safeParse(c.req.param());
  if (!idParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');

  const biz = await db.select().from(businesses).where(eq(businesses.id, idParsed.data.id)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  await db.update(businesses).set({ status: 'active' }).where(eq(businesses.id, biz.id)).run();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), actorUserId: ctx.userId, action: 'business.unfreeze',
    resourceType: 'business', resourceId: biz.id,
    metadata: null,
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: Date.now(),
  }).run();

  return c.json({ ok: true, status: 'active' });
});
```

- [ ] **Step 4: Run test to pass**
Run: `cd apps/api && pnpm exec vitest run test/admin/businessFreeze.test.ts`
Expected: PASS

- [ ] **Step 5: Replace disabled stub** in `apps/web/src/admin/BusinessDetailPage.tsx:48-50` with `<BusinessSuspendButton>`:

```tsx
import { BusinessSuspendButton } from './BusinessSuspendButton';
// inside the page, replace the button block:
<BusinessSuspendButton businessId={business.id} status={business.status} />
```

- [ ] **Step 6: Create component** `apps/web/src/admin/BusinessSuspendButton.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@vyro/ui';

export function BusinessSuspendButton({ businessId, status }: { businessId: string; status: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      status === 'suspended'
        ? api.post(`/admin/businesses/${businessId}/unfreeze`)
        : api.post(`/admin/businesses/${businessId}/freeze`, { reason: 'policy' }),
    onSuccess: () => {
      toast.success(status === 'suspended' ? 'Unsuspended' : 'Suspended');
      void qc.invalidateQueries({ queryKey: ['admin-business', businessId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  return (
    <Button variant={status === 'suspended' ? 'primary' : 'ghost'} onClick={() => mut.mutate()} disabled={mut.isPending}>
      {status === 'suspended' ? 'Unsuspend' : 'Suspend'}
    </Button>
  );
}
```

- [ ] **Step 7: Verify gates and commit**
Run: `pnpm typecheck && cd apps/api && pnpm exec vitest run`
```bash
git add apps/api/src/modules/admin/routes.ts apps/api/test/admin/businessFreeze.test.ts apps/web/src/admin/BusinessSuspendButton.tsx apps/web/src/admin/BusinessDetailPage.tsx
git commit -m "feat(gap): P2 suspend business — mirror supplier freeze"
```

---

### Task 3 (Phase 3): Supplier mutations wired to UI

#### 3a — Settings edit

**Files:**
- Create: `apps/web/src/supplier/SupplierSettingsForm.tsx`
- Modify: `apps/web/src/supplier/SettingsPage.tsx:37-71`

- [ ] **Step 1: Build the form** `apps/web/src/supplier/SupplierSettingsForm.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Input, Label, Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

type Supplier = { id: string; name: string; description: string | null; address: string | null };

export function SupplierSettingsForm({ supplierId }: { supplierId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ supplier: Supplier }>(`/suppliers/${supplierId}/settings`),
  });

  const initial: Supplier = q.data?.supplier ?? { id: supplierId, name: '', description: null, address: null };
  const [draft, setDraft] = useState<Supplier>(initial);
  useEffect(() => { setDraft(initial); }, [q.data]);

  const dirty = draft.name !== initial.name || draft.description !== initial.description || draft.address !== initial.address;
  const save = useMutation({
    mutationFn: () => api.patch(`/suppliers/${supplierId}/settings`, {
      name: draft.name,
      description: draft.description ?? '',
      address: draft.address ?? '',
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['supplier-settings', supplierId] }); toast.success('Saved'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  return (
    <Surface kind="elevated" className="p-6 space-y-4">
      <h2 className="vyro-display text-lg">Supplier profile</h2>
      <div className="space-y-1.5"><Label htmlFor="s-name">Name</Label><Input id="s-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="s-desc">Description</Label><Input id="s-desc" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="s-addr">Address</Label><Input id="s-addr" value={draft.address ?? ''} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
      <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
    </Surface>
  );
}
```

- [ ] **Step 2: Mount in SettingsPage** at `apps/web/src/supplier/SettingsPage.tsx:37-63`. Replace the read-only `<dl>` block with `<SupplierSettingsForm supplierId={…} />`. Pull `supplierId` via the existing `useSupplierId()` hook.

- [ ] **Step 3: Verify + commit**
Run: `cd apps/web && pnpm typecheck`
```bash
git add apps/web/src/supplier/SupplierSettingsForm.tsx apps/web/src/supplier/SettingsPage.tsx
git commit -m "feat(gap): P3a supplier settings edit form"
```

#### 3b — Delivery transition buttons

**Files:**
- Create: `apps/web/src/supplier/DeliveryTransitionButtons.tsx`
- Modify: `apps/web/src/supplier/DeliveriesPage.tsx` (mount buttons per row)

- [ ] **Step 4: Build component** `apps/web/src/supplier/DeliveryTransitionButtons.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { OrderStatus } from '@vyro/shared';

const NEXT_BY_STATUS: Record<string, OrderStatus | null> = {
  pending: 'preparing',
  accepted: 'preparing',
  preparing: 'ready_for_pickup',
  ready_for_pickup: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

export function DeliveryTransitionButtons({ poId, status }: { poId: string; status: OrderStatus }) {
  const toast = useToast();
  const qc = useQueryClient();
  const next = NEXT_BY_STATUS[status] ?? null;
  const mut = useMutation({
    mutationFn: () => api.post(`/deliveries/${poId}/transitions`, { to: next }),
    onSuccess: () => { toast.success(`Moved to ${next}`); void qc.invalidateQueries({ queryKey: ['supplier-deliveries'] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  if (!next) return null;
  return <Button variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>Advance → {next}</Button>;
}
```

- [ ] **Step 5: Mount in DeliveriesPage row**. In `apps/web/src/supplier/DeliveriesPage.tsx`, locate the row renderer (around line 76-91) and append `<DeliveryTransitionButtons poId={row.poId} status={row.status} />`.

- [ ] **Step 6: Verify + commit**
```bash
git add apps/web/src/supplier/DeliveryTransitionButtons.tsx apps/web/src/supplier/DeliveriesPage.tsx
git commit -m "feat(gap): P3b supplier delivery transition buttons"
```

#### 3c — Payment confirm

**Files:**
- Create: `apps/web/src/supplier/PaymentConfirmButton.tsx`
- Modify: `apps/web/src/supplier/PaymentsPage.tsx:29`

- [ ] **Step 7: Build component** `apps/web/src/supplier/PaymentConfirmButton.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@vyro/ui';

export function PaymentConfirmButton({ paymentId, status }: { paymentId: string; status: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post(`/payments/${paymentId}/confirm`, { status: 'confirmed' }),
    onSuccess: () => { toast.success('Payment confirmed'); void qc.invalidateQueries({ queryKey: ['supplier-payments'] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  if (status !== 'pending') return null;
  return <Button variant="primary" onClick={() => mut.mutate()} disabled={mut.isPending}>Confirm receipt</Button>;
}
```

- [ ] **Step 8: Mount in PaymentsPage row** — append `<PaymentConfirmButton paymentId={row.id} status={row.status} />` to the row actions cell.

- [ ] **Step 9: Verify + commit**
```bash
git add apps/web/src/supplier/PaymentConfirmButton.tsx apps/web/src/supplier/PaymentsPage.tsx
git commit -m "feat(gap): P3c supplier payment confirm button"
```

- [ ] **Step 10: Phase gate**
Run: `pnpm typecheck && pnpm test`
Expected: clean

---

### Task 4 (Phase 4): Buyer dashboard honest data

**Files:**
- Create: `apps/api/src/modules/analytics/business/routes.ts`
- Modify: `apps/api/src/index.ts` (mount)
- Create: `apps/api/test/analytics/business.test.ts`
- Modify: `apps/web/src/pages/DashboardPage.tsx:11-43,150-152,158,211-231`
- Modify: `apps/web/src/pages/CartPage.tsx:155-160` (supplierCount duplicate)

- [ ] **Step 1: Write failing test** `apps/api/test/analytics/business.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ all: async () => state.rows }) }) }),
  }),
  purchaseOrders: { id: 'id', businessId: 'businessId', status: 'status', totalCents: 'totalCents', createdAt: 'createdAt' },
}));

vi.mock(setup.SRC + '/middleware/requireRole', () => ({ requireRole: () => async (_c: any, n: any) => { await n(); } }));
vi.mock(setup.SRC + '/middleware/session', () => ({ session: () => async (c: any, n: any) => { c.set('ctx', { userId: 'b-1' }); await n(); } }));

import bizAnalytics from '../../src/modules/analytics/business/routes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => { const env = errorEnvelope(err); return c.json(env.body, env.status as any); });
  app.route('/api/analytics/business', bizAnalytics);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('GET /api/analytics/business/monthly-spend', () => {
  it('buckets real PO totals, excludes cancelled', async () => {
    const now = Date.now();
    state.rows = [
      { id: 'po-1', businessId: 'b-1', status: 'completed', totalCents: 10000, createdAt: now },
      { id: 'po-2', businessId: 'b-1', status: 'cancelled', totalCents: 99999, createdAt: now },
      { id: 'po-3', businessId: 'b-2', status: 'completed', totalCents: 50000, createdAt: now },
    ];
    const res = await buildApp().fetch(new Request('http://localhost/api/analytics/business/monthly-spend'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const total = body.buckets.reduce((s: number, b: any) => s + b.totalCents, 0);
    expect(total).toBe(10000); // excludes cancelled + other business
  });
});
```

- [ ] **Step 2: Run to fail**
Run: `cd apps/api && pnpm exec vitest run test/analytics/business.test.ts`
Expected: FAIL

- [ ] **Step 3: Create route** `apps/api/src/modules/analytics/business/routes.ts`:

```ts
import { Hono } from 'hono';
import { eq, ne, and, sql } from 'drizzle-orm';
import { session } from '../../../middleware/session';
import { requireRole } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import type { Env } from '../../../env';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ business: true }));

router.get('/monthly-spend', async (c) => {
  const ctx = c.get('ctx') as { userId: string; businessId?: string } | undefined;
  if (!ctx?.businessId) throw httpError(403, 'FORBIDDEN', 'No business');
  const months = Math.min(Math.max(Number(c.req.query('months') ?? 12), 1), 24);
  const since = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
  const db = getDb(c.env.DB);
  const rows = await db.select({
    createdAt: purchaseOrders.createdAt,
    totalCents: purchaseOrders.totalCents,
  }).from(purchaseOrders)
    .where(and(eq(purchaseOrders.businessId, ctx.businessId), ne(purchaseOrders.status, 'cancelled'), sql`${purchaseOrders.createdAt} >= ${since}`))
    .all();
  const buckets = Array.from({ length: months }, (_, i) => {
    const start = new Date(Date.now() - (months - 1 - i) * 30 * 24 * 60 * 60 * 1000);
    const month = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month, totalCents: 0 };
  });
  for (const r of rows) {
    const d = new Date(r.createdAt as number);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const b = buckets.find((x) => x.month === key);
    if (b) b.totalCents += r.totalCents as number;
  }
  return c.json({ buckets });
});

export default router;
```

- [ ] **Step 4: Mount in `apps/api/src/index.ts`**. After the supplier analytics mount:

```ts
import businessAnalyticsRouter from './modules/analytics/business/routes';
// ...
app.route('/api/analytics/business', businessAnalyticsRouter);
```

- [ ] **Step 5: Run test to pass**
Run: `cd apps/api && pnpm exec vitest run test/analytics/business.test.ts`
Expected: PASS

- [ ] **Step 6: Replace DashboardPage mock data**. In `apps/web/src/pages/DashboardPage.tsx`:
- Delete `buildMockSpend` and the `mulberry32` seed.
- Add a `useQuery` keyed `['biz-monthly-spend']` calling `/api/analytics/business/monthly-spend`.
- Replace the TimeSeries `data` prop with the API buckets.
- Render the existing `ActionRow` component (lines 211-231) below the chart.
- Fix supplier count: change `key={…supplierName + id}` to `key={supplierId}` only.

- [ ] **Step 7: Fix CartPage supplierCount duplicate**. In `apps/web/src/pages/CartPage.tsx:155-160`, the second MetricStack row uses `supplierCount` again — change the second label and value to reflect purchase-order count from the actual cart payload (`purchaseOrderCount ?? row.poCount ?? 0`). Inspect the cart response shape and pick the correct field; if no PO count is in the payload, drop the duplicate tile.

- [ ] **Step 8: Verify + commit**
Run: `pnpm typecheck`
```bash
git add apps/api/src/modules/analytics/business/routes.ts apps/api/src/index.ts apps/api/test/analytics/business.test.ts apps/web/src/pages/DashboardPage.tsx apps/web/src/pages/CartPage.tsx
git commit -m "feat(gap): P4 buyer dashboard uses real spend aggregation + supplier count fix"
```

---

### Task 5 (Phase 5): Home page live data

**Files:**
- Create: `apps/api/src/modules/home/routes.ts`
- Modify: `apps/api/src/index.ts` (mount)
- Create: `apps/api/test/home.test.ts`
- Modify: `apps/web/src/pages/HomePage.tsx:11-334`

- [ ] **Step 1: Write failing test** `apps/api/test/home.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({ products: [] as any[], suppliers: [] as any[] }));
vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ all: async () => state.products }) }), all: async () => state.suppliers }),
  }),
}));

import homeRouter from '../../src/modules/home/routes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => { const env = errorEnvelope(err); return c.json(env.body, env.status as any); });
  app.route('/api/home', homeRouter);
  return app;
}
const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('GET /api/home/feed', () => {
  it('returns empty defaults when DB sparse', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/home/feed'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.featuredProducts).toEqual([]);
    expect(body.verifiedSuppliers).toEqual([]);
    expect(body.trustStats).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to fail, then create route** `apps/api/src/modules/home/routes.ts`:

```ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, products } from '@vyro/db/schema';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

router.get('/feed', async (c) => {
  const db = getDb(c.env.DB);
  const featured = await db.select().from(products).where(eq(products.featured, 1)).limit(8).all();
  const verified = await db.select().from(suppliers).where(eq(suppliers.status, 'active')).limit(8).all();
  return c.json({
    featuredProducts: featured,
    verifiedSuppliers: verified,
    trustStats: { districtsCovered: 25, lifetimeGmvCents: 10_000_000_00, activeBusinesses: 0, activeSuppliers: verified.length },
    journeySteps: [
      { title: 'Sign up', body: 'Create your free VYRO account in under a minute.' },
      { title: 'Browse', body: 'Discover verified suppliers across Sri Lanka.' },
      { title: 'Order', body: 'Compare offers, place POs, track in real-time.' },
    ],
    faq: [
      { q: 'How does VYRO verify suppliers?', a: 'We check business registration and trade references before activation.' },
      { q: 'What payment methods are supported?', a: 'Cash on delivery and bank transfer today; gateway integrations rolling out.' },
    ],
  });
});

export default router;
```

If `products.featured` column does not exist, drop the WHERE clause and `LIMIT 8` only.

- [ ] **Step 3: Mount**: `import homeRouter from './modules/home/routes';` and `app.route('/api/home', homeRouter);` in `apps/api/src/index.ts`.

- [ ] **Step 4: Run test to pass**
Run: `cd apps/api && pnpm exec vitest run test/home.test.ts`

- [ ] **Step 5: Replace hardcoded arrays in HomePage.tsx**. Delete lines 11-334 mock arrays. Add a `useQuery` keyed `['home-feed']` calling `/api/home/feed`. Map `feed.featuredProducts` into the "Featured Products" section, `feed.verifiedSuppliers` into the suppliers row, `feed.trustStats` into the stats row, `feed.journeySteps` into journey, `feed.faq` into FAQ. Keep static `HERO_MOSAIC` image sources (those are image assets, not data).

- [ ] **Step 6: Verify + commit**
Run: `pnpm typecheck && pnpm test`
```bash
git add apps/api/src/modules/home/routes.ts apps/api/src/index.ts apps/api/test/home.test.ts apps/web/src/pages/HomePage.tsx
git commit -m "feat(gap): P5 home page served by /api/home/feed"
```

---

### Task 6 (Phase 6): Supplier analytics uses cached endpoint

**Files:**
- Modify: `apps/web/src/supplier/AnalyticsPage.tsx:35-49`

- [ ] **Step 1: Inspect existing endpoint** at `apps/api/src/modules/analytics/supplier/routes.ts` to confirm response shape (likely `{ buckets: [{ month, totalCents }], topProducts: [...] }`). Adjust the next step to that shape.

- [ ] **Step 2: Replace AnalyticsPage data source**. Delete the client-side aggregation in `apps/web/src/supplier/AnalyticsPage.tsx:35-49`. Add:

```ts
const q = useQuery({
  queryKey: ['supplier-analytics', supplierId],
  queryFn: () => api.get<{ buckets: { month: string; totalCents: number }[]; topProducts: { id: string; name: string; revenueCents: number }[] }>(`/analytics/supplier?supplierId=${supplierId}`),
  refetchInterval: 30_000,
});
const buckets = q.data?.buckets ?? [];
const topProducts = q.data?.topProducts ?? [];
```

Use `buckets` for the TimeSeries and labels. Use `topProducts` for a top-N list. Drop the mislabeled "last 6 mo" string — derive the window from `buckets.length`.

- [ ] **Step 3: Verify + commit**
Run: `pnpm typecheck`
```bash
git add apps/web/src/supplier/AnalyticsPage.tsx
git commit -m "feat(gap): P6 supplier analytics consumes cached /api/analytics/supplier"
```

---

### Task 7 (Phase 7): Order lifecycle UI fixes

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx:41-46,50-59,63,159-164`
- Modify: `apps/web/src/pages/SupplierOrdersPage.tsx:113`
- Modify: `apps/web/src/pages/OrdersPage.tsx:68,75,104-115`

- [ ] **Step 1: Extend NEXT_OPTIONS_BY_ROLE**. In `apps/web/src/pages/OrderDetailPage.tsx`, add `preparing` entries. Confirm with `OrderStatus` enum in `@vyro/shared`:

```ts
const NEXT_OPTIONS_BY_ROLE: Record<string, OrderStatus[]> = {
  business: ['cancelled', 'completed', 'disputed'],
  supplier: ['accepted', 'rejected', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'],
  admin: ['cancelled', 'disputed'],
};
```

- [ ] **Step 2: Fix default value**. Replace the hardcoded `'completed'` default (line 63) with derivation:

```ts
const defaultNext = NEXT_OPTIONS_BY_ROLE[role]?.find((s) => s !== current) ?? null;
```

- [ ] **Step 3: Gate Reject on pending**. In `apps/web/src/pages/SupplierOrdersPage.tsx:113`, change the Reject button to render only when `row.status === 'pending'`:

```tsx
{row.status === 'pending' && (
  <Button variant="ghost" onClick={() => transition.mutate({ to: 'rejected' })} disabled={transition.isPending}>Reject</Button>
)}
```

- [ ] **Step 4: Fix OrdersPage status filter case mismatch**. In `apps/web/src/pages/OrdersPage.tsx:68,75`, change the filter id list to match the API's `OrderStatus` enum (lowercase strings):

```ts
const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready_for_pickup', label: 'Ready' },
  { id: 'out_for_delivery', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed', label: 'Disputed' },
  { id: 'cancelled', label: 'Cancelled' },
];
```

Ensure the filter param value is the lowercase id (already lowercase per the const above). Drop unused `StatusBadge` and `Surface` imports.

- [ ] **Step 5: Add Supplier column to OrdersPage** at line 104-115. Pull `supplierName` from the API payload (verify field exists in `apps/api/src/modules/purchaseOrders/routes.ts` list response; if absent, add to repository):

```tsx
<td className="px-3 py-2 text-sm">{row.supplierName ?? '—'}</td>
```

- [ ] **Step 6: Verify + commit**
Run: `pnpm typecheck`
```bash
git add apps/web/src/pages/OrderDetailPage.tsx apps/web/src/pages/SupplierOrdersPage.tsx apps/web/src/pages/OrdersPage.tsx
git commit -m "feat(gap): P7 order lifecycle UI — full transition coverage + reject gating + orders filter/column"
```

---

### Task 8 (Phase 8): Admin UX (lists, audit, shell)

#### 8a — Lists: server pagination + filter

**Files:**
- Modify: `apps/api/src/modules/admin/routes.ts:20-30`
- Create: `apps/api/test/admin/listPagination.test.ts`
- Create: `apps/web/src/lib/useAdminTable.ts`
- Modify: `apps/web/src/admin/Lists.tsx`, `UsersPage.tsx`

- [ ] **Step 1: Write failing test** `apps/api/test/admin/listPagination.test.ts` covering:
- `/admin/suppliers?q=&status=&cursor=` returns `{ suppliers, nextCursor }`
- `/admin/businesses?q=&status=&cursor=` returns `{ businesses, nextCursor }`
- `/admin/users?q=&cursor=` returns `{ users, nextCursor }`
- All require admin session.

- [ ] **Step 2: Run to fail, then implement cursor pagination**. Replace the three list endpoints in `apps/api/src/modules/admin/routes.ts`. Use `LIMIT 50` and `createdAt < cursor` ordering. Apply `q` as `LIKE` on name, `status` exact match where column exists.

- [ ] **Step 3: Run tests to pass**

- [ ] **Step 4: Create `apps/web/src/lib/useAdminTable.ts`**:

```ts
import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from './api';

export function useAdminTable<T>({ endpoint, queryKey, params = {} }: {
  endpoint: string;
  queryKey: readonly unknown[];
  params?: Record<string, string>;
}) {
  const [filter, setFilter] = useState<Record<string, string>>(params);
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, q: searchInput })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const q = useInfiniteQuery({
    queryKey: [...queryKey, filter],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams(filter);
      if (pageParam) qs.set('cursor', pageParam);
      const url = `${endpoint}?${qs.toString()}`;
      const data = await api.get<{ [k: string]: T[]; nextCursor?: string }>(url);
      const rows = Object.entries(data).find(([k]) => Array.isArray(data[k as keyof typeof data]))?.[1] as T[] | undefined;
      return { rows: rows ?? [], nextCursor: data.nextCursor ?? null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  return { rows, loading: q.isLoading, hasMore: !!q.hasNextPage, loadMore: () => q.fetchNextPage(), filter, setFilter, searchInput, setSearchInput };
}
```

- [ ] **Step 5: Refactor Lists.tsx and UsersPage.tsx** to consume the hook. Keep the existing column renderers. Pass `status` filter as a `<select>` bound to `setFilter`.

- [ ] **Step 6: Verify + commit**
```bash
git add apps/api/src/modules/admin/routes.ts apps/api/test/admin/listPagination.test.ts apps/web/src/lib/useAdminTable.ts apps/web/src/admin/Lists.tsx apps/web/src/admin/UsersPage.tsx
git commit -m "feat(gap): P8a admin lists server pagination + debounced search + status filter"
```

#### 8b — Audit: filters + pagination + dead link

**Files:**
- Modify: `apps/api/src/modules/admin/routes.ts:32-37`
- Modify: `apps/web/src/admin/DisputedAndAudit.tsx:104,157`
- Create: `apps/web/src/admin/AuditMetadataModal.tsx`

- [ ] **Step 7: Extend `/admin/audit`** in `apps/api/src/modules/admin/routes.ts`. Accept `action`, `resourceType`, `actorUserId`, `since`, `until`, `cursor`. Return `{ logs, nextCursor }`.

- [ ] **Step 8: Update AuditPage** in `DisputedAndAudit.tsx`. Add filter inputs above the list. Replace "Inspect →" link with a button that opens `<AuditMetadataModal row={row} />` rendering the parsed `metadata` JSON in a `<pre>`.

- [ ] **Step 9: Verify + commit**
```bash
git add apps/api/src/modules/admin/routes.ts apps/web/src/admin/DisputedAndAudit.tsx apps/web/src/admin/AuditMetadataModal.tsx
git commit -m "feat(gap): P8b audit filters + pagination + metadata modal"
```

#### 8c — Admin Home + Shell

**Files:**
- Modify: `apps/web/src/admin/HomePage.tsx:9-56`
- Modify: `apps/web/src/admin/Shell.tsx:61`

- [ ] **Step 10: Wire admin HomePage to `/api/analytics/admin`**. Replace tile count derivation with the analytics response. Replace hardcoded FlowLine states with real status counts.

- [ ] **Step 11: Redirect non-admin** in `apps/web/src/admin/Shell.tsx:61`. Replace the `Forbidden…` div with:

```tsx
if (!isAdmin) return <Navigate to="/admin/login" replace />;
```

- [ ] **Step 12: Verify + commit**
```bash
git add apps/web/src/admin/HomePage.tsx apps/web/src/admin/Shell.tsx
git commit -m "feat(gap): P8c admin home + shell redirect"
```

- [ ] **Step 13: Phase gate**
Run: `pnpm typecheck && pnpm test`

---

### Task 9 (Phase 9): Auth + profile completeness

#### 9a — Signup phone

**Files:**
- Modify: `apps/web/src/pages/SignupPage.tsx:54-65`

- [ ] **Step 1: Add phone field** matching the backend schema regex (see `apps/api/src/modules/auth/routes.ts:24` for the schema). Use `Input` with `type="tel"`, name `phone`. Submit alongside email/password.

- [ ] **Step 2: Verify + commit**
```bash
git add apps/web/src/pages/SignupPage.tsx
git commit -m "feat(gap): P9a signup phone field"
```

#### 9b — Forgot password

**Files:**
- Modify: `apps/api/src/modules/auth/routes.ts`
- Modify: `apps/web/src/pages/LoginPage.tsx:65-86`
- Create: `apps/web/src/pages/ForgotPasswordPage.tsx`
- Create: `apps/web/src/pages/ResetPasswordPage.tsx`
- Modify: `apps/web/src/App.tsx` (add routes)

- [ ] **Step 3: Verify better-auth `passwordReset` plugin exists** by `grep -n "passwordReset" node_modules/better-auth/dist/**/*.d.ts`. If missing, abort this sub-task and file a follow-up issue.

- [ ] **Step 4: Wire routes** `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` using the plugin's handlers. Validate body with zod.

- [ ] **Step 5: Add `LoginPage` link** "Forgot password?" next to the password input, navigating to `/forgot`.

- [ ] **Step 6: Build pages** `/forgot` (email input → POST) and `/reset?token=` (new password + confirm → POST). Both call `useToast` for feedback.

- [ ] **Step 7: Verify + commit**
Run: `pnpm typecheck && cd apps/api && pnpm exec vitest run`
```bash
git add apps/api/src/modules/auth/routes.ts apps/web/src/pages/LoginPage.tsx apps/web/src/pages/ForgotPasswordPage.tsx apps/web/src/pages/ResetPasswordPage.tsx apps/web/src/App.tsx
git commit -m "feat(gap): P9b forgot/reset password"
```

#### 9c — Real 2FA

**Files:**
- Modify: `apps/api/src/modules/auth/routes.ts`
- Modify: `apps/web/src/pages/profile/SecurityForm.tsx:56-69`
- Modify: `apps/web/src/pages/LoginPage.tsx:17-30`

- [ ] **Step 8: Verify better-auth `twoFactor` plugin**. Same grep.

- [ ] **Step 9: Wire enroll + verify endpoints**:
- `POST /api/auth/2fa/enroll` returns `{ secret, otpauthUrl }`.
- `POST /api/auth/2fa/verify` accepts `{ code }`, validates against the secret, sets `twoFactorEnabled=true` on success.
- `POST /api/auth/sign-in` returns `{ requires2fa: true, challengeToken }` when user has 2FA enabled; LoginPage collects the code and POSTs to `/api/auth/2fa/challenge`.

- [ ] **Step 10: Replace SecurityForm stub** with QR display + 6-digit verify input.

- [ ] **Step 11: Verify + commit**
```bash
git add apps/api/src/modules/auth/routes.ts apps/web/src/pages/profile/SecurityForm.tsx apps/web/src/pages/LoginPage.tsx
git commit -m "feat(gap): P9c real TOTP 2FA enroll + challenge"
```

#### 9d — Avatar upload

**Files:**
- Create: `packages/db/migrations/0007_user_avatar.sql`
- Modify: `apps/api/src/modules/settings/routes.ts`
- Modify: `apps/web/src/pages/profile/ProfileForm.tsx:74-80`

- [ ] **Step 12: Migration** `packages/db/migrations/0007_user_avatar.sql`:

```sql
ALTER TABLE user_settings ADD COLUMN avatar_key TEXT;
```

- [ ] **Step 13: Apply migration**: regenerate `packages/db/migrations/meta/_journal.json` if needed (run drizzle-kit). Verify `pnpm db:migrate` works locally.

- [ ] **Step 14: Endpoint** `POST /api/settings/me/avatar` (multipart) writes to R2 bucket under `avatars/<userId>/<uuid>`, persists `avatar_key`, returns `{ avatarUrl }`. Use the same R2 binding pattern as `apps/api/src/modules/products/routes.ts`.

- [ ] **Step 15: Replace ProfileForm URL input** with a file input calling the endpoint. Show the returned URL in an `<img>` preview.

- [ ] **Step 16: Verify + commit**
Run: `pnpm typecheck && cd apps/api && pnpm exec vitest run`
```bash
git add packages/db/migrations/0007_user_avatar.sql packages/db/migrations/meta/_journal.json apps/api/src/modules/settings/routes.ts apps/web/src/pages/profile/ProfileForm.tsx
git commit -m "feat(gap): P9d avatar upload to R2"
```

- [ ] **Step 17: Phase gate**
Run: `pnpm typecheck && pnpm test`

---

### Task 10 (Phase 10): Polish sweep

**Files:**
- Modify: `apps/web/src/pages/SearchPage.tsx:28-47` (debounce input)
- Modify: `apps/web/src/pages/CartPage.tsx` (qty-edit, MOQ enforce)
- Modify: `apps/web/src/pages/OrdersPage.tsx:104-115` (supplier column)
- Modify: `apps/web/src/supplier/useSupplierId.tsx:6` (role union `| 'sales'`)
- Modify: `apps/web/src/supplier/DashboardPage.tsx:59,102` (route links inside shell)
- Modify: `apps/api/src/modules/suppliers/routes.ts:14-17` (suppliers/types distinct)
- Modify: `apps/web/src/pages/ProductDetailPage.tsx:11,199` (drop unused import, drop unsafe cast)
- Modify: `apps/web/src/pages/profile/NotificationsForm.tsx:19` (drop "messages" hint)
- Modify: `apps/web/src/pages/BusinessOnboardingPage.tsx:16-42` (move districts to `apps/web/src/lib/sriLanka.ts`)
- Modify: `apps/web/src/pages/CheckoutPage.tsx:50-97` (show summary)
- Modify: `apps/web/src/supplier/InventoryPage.tsx` (add stock-quantity input)
- Modify: `apps/api/src/modules/admin/supplierDetailRepository.ts:40-44` (exclude cancelled from activePoCount)
- Modify: `apps/web/src/admin/DisputedAndAudit.tsx:104` (actor email resolved server-side)

- [ ] **Step 1: Search debounce**. In `apps/web/src/pages/SearchPage.tsx`, introduce a `searchInput` state, debounce 300ms into the URL `q` param.

- [ ] **Step 2: Cart qty + MOQ**. In `apps/web/src/pages/CartPage.tsx`:
- Add `<input type="number" min={cartItem.minOrderQty}>` per line.
- Add `PATCH /api/cart/items/:id` call (verify endpoint exists in `apps/api/src/modules/cart/routes.ts`; if not, skip the UI and file an issue).
- Block "Proceed to checkout" button if any line below MOQ.

- [ ] **Step 3: OrdersPage supplier column**. Add a "Supplier" column. Fetch supplier name via existing endpoint or denormalize at API.

- [ ] **Step 4: useSupplierId roles**. Add `'sales'` to the union type.

- [ ] **Step 5: Supplier DashboardPage links**. Change `/supplier/orders` to `/supplier` (already inside shell). For order detail, link to `/supplier/orders/:id` — but that route doesn't exist yet. Either (a) add the route under SupplierShell that delegates to SupplierOrdersPage with detail panel, or (b) move `/supplier/orders` under the shell. Prefer (b): move the route in `apps/web/src/App.tsx:59` under the SupplierShell branch and update `apps/web/src/pages/SupplierOrdersPage.tsx` to use SupplierShell chrome when accessed at `/supplier/orders`.

- [ ] **Step 6: Supplier types endpoint**. In `apps/api/src/modules/suppliers/routes.ts:14-17`, replace `listBusinessTypes` with a dedicated supplier-types repository if a `supplier_types` table exists; otherwise document the shared-table decision in a code comment and move on.

- [ ] **Step 7: ProductDetailPage cleanup**. Drop unused `ProductPlaceholder` import (line 11). Replace `StatusDots` cast at line 199 with a proper `availabilityStatus → 'in_stock' | 'low_stock' | 'out_of_stock'` mapping.

- [ ] **Step 8: NotificationsForm hint**. Remove "from suppliers and admins" copy from the messages hint.

- [ ] **Step 9: Districts constants**. Create `apps/web/src/lib/sriLanka.ts` with `export const SRI_LANKAN_DISTRICTS = […]`. Import in both onboarding pages. Delete inline copies.

- [ ] **Step 10: CheckoutPage summary**. Render a `<Surface>` with cart lines + total before the submit button. Use existing `useQuery(['cart'])` from the cart query.

- [ ] **Step 11: Inventory quantity**. Add a numeric input alongside the 3-state toggle. PATCH the new field to the existing endpoint (extend the schema if needed).

- [ ] **Step 12: supplierDetailRepository activePoCount**. In `apps/api/src/modules/admin/supplierDetailRepository.ts:40-44`, filter to `status NOT IN ('cancelled', 'rejected')`.

- [ ] **Step 13: Audit actor email**. In `apps/api/src/modules/admin/routes.ts` `/admin/audit`, join `users` on `actorUserId` and return `actorEmail` per row. AuditPage renders the email instead of the user-id prefix.

- [ ] **Step 14: PricingPage volume tiers**. Inspect `apps/api/src/modules/supplierProducts/routes.ts` for tier endpoints. If absent, add a TODO comment in `PricingPage.tsx` and move volume tiers to a follow-up sub-project.

- [ ] **Step 15: CustomersPage pagination**. In `apps/web/src/supplier/CustomersPage.tsx`, add a `Load more` button calling `?cursor=` on `/api/suppliers/:id/customers`. If the endpoint doesn't paginate, file a backend TODO and skip.

- [ ] **Step 16: ProductsPage window.confirm → modal**. In `apps/web/src/supplier/ProductsPage.tsx:116`, replace `window.confirm` with a `<ConfirmModal>` from `@vyro/ui` (or inline `<dialog>` if no shared modal). Render confirm before invoking the delete mutation.

- [ ] **Step 17: ProductFormPage readonly indicator**. In `apps/web/src/supplier/ProductFormPage.tsx`, in edit mode, add a `Read-only` badge next to the `productId` field. Disable the input.

- [ ] **Step 18: DashboardPage FlowLine states**. In `apps/web/src/supplier/DashboardPage.tsx:80-87`, replace hardcoded "done" states with derived booleans from real data (e.g., hasProducts → Catalog done; hasPricing → Pricing done; hasInventory → Inventory done).

- [ ] **Step 19: Verify + final E2E**
Run: `pnpm typecheck && pnpm test && cat scripts/e2e.md` and walk through it.

- [ ] **Step 20: Commit**
```bash
git add -A
git commit -m "feat(gap): P10 polish sweep — debounce, MOQ, types, imports, districts, customers pagination, modal, FlowLine"
```

---

## Acceptance criteria (whole plan)

1. `pnpm typecheck` clean.
2. `pnpm test` green across all apps.
3. `scripts/e2e.md` walks buyer + supplier + admin end-to-end without manual workarounds.
4. No portal surface advertises a feature it cannot deliver.
5. All unused backend endpoints from the audit are wired to UI or documented internal.
6. Each of the 33 gaps has a closing commit or an explicit deferral note in code.

## Out of scope (deferred)

- B1 Security hardening (secrets, rate limit, CSRF, RBAC audit)
- B2 Observability
- B3 Performance
- B4 Compliance (terms/privacy/cookies/GDPR)
- B5 Ops (CI/CD, runbook, env config, backups)
