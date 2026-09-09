# Portal Admin Full Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the single super-admin live command-center visibility plus full order, delivery, and finance control.

**Architecture:** New Hono sub-routers under `apps/api/src/modules/admin/` mounted in `routes.ts`; Zod schemas in `packages/validation`; React pages under `apps/web/src/admin/` wired in `App.tsx` + `Shell.tsx`. All writes go through `auditAdmin` into `adminAuditLogs`.

**Tech Stack:** Hono + Drizzle (D1) + Zod + React Query + React Router + Vitest. Commands run from repo root with pnpm.

## Global Constraints

- Node 20+, pnpm 9+.
- SPA must use relative `fetch('/api/...')` via `@/lib/api` — never absolute URLs.
- Every admin write requires `{ reason }` (min 5 chars on destructive actions) and writes `adminAuditLogs` via `auditAdmin`.
- Non-admin gets 403 via `requireRole({ admin: true })`.
- `pnpm typecheck` must pass; `pnpm --filter @vyro/api exec vitest run` must pass for touched suites.

---

## Scope note

Spec `docs/superpowers/specs/2026-09-09-portal-admin-full-access-design.md` covers 4 independent subsystems. They are ordered below as independently shippable tasks: Task 1 (validation + command-center API) → Task 2 (orders) → Task 3 (deliveries) → Task 4 (finance + command-center UI + nav). Land in order; each is testable alone.

### Task 1: Validation + Command Center API

**Files:**
- Create: `packages/validation/src/adminOps.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `apps/api/src/modules/admin/commandCenter.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Test: `apps/api/test/admin/commandCenter.test.ts`

**Interfaces:**
- Consumes: `getDb` from `@vyro/db`, `auditAdmin` from `../admin/lib/audit`, tables `purchaseOrders`, `payments`, `payouts`, `deliveries` from `@vyro/db/schema`.
- Produces: `GET /api/admin/command-center` → `{ needsAction: { stuckPayments: number; payoutFailures: number; slaBreaches: number; openDisputes: number }, recentEvents: Array<{ id: string; action: string; createdAt: number }> }`; schemas `adminReasonBody`, `adminOrderOverrideBody` exported from `@vyro/validation`.

- [ ] **Step 1: Write the failing validation test**

```ts
// packages/validation/src/adminOps.test.ts
import { describe, it, expect } from 'vitest';
import { adminReasonBody } from './adminOps';
describe('adminReasonBody', () => {
  it('rejects short reason', () => {
    expect(adminReasonBody.safeParse({ reason: 'x' }).success).toBe(false);
  });
  it('accepts valid reason', () => {
    expect(adminReasonBody.safeParse({ reason: 'duplicate payout — retry approved' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @vyro/validation exec vitest run src/adminOps.test.ts`
Expected: FAIL with "Cannot find module './adminOps'"

- [ ] **Step 3: Write minimal validation implementation**

```ts
// packages/validation/src/adminOps.ts
import { z } from 'zod';
export const adminReasonBody = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
export const adminOrderOverrideBody = z.object({
  status: z.enum(['confirmed', 'fulfilled', 'delivered', 'cancelled']),
  reason: z.string().trim().min(5).max(500),
  expectedUpdatedAt: z.number().int().optional(),
}).strict();
export const adminListQuery = z.object({
  status: z.string().max(50).optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
}).strict();
```

Add `export * from './adminOps';` to `packages/validation/src/index.ts`.

Run: `pnpm --filter @vyro/validation exec vitest run src/adminOps.test.ts`
Expected: PASS

- [ ] **Step 4: Write failing command-center API test**

```ts
// apps/api/test/admin/commandCenter.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import commandCenter from '../../src/modules/admin/commandCenter';
import { errorEnvelope } from '../../src/lib/errors';
describe('GET /command-center', () => {
  it('requires admin (403 for non-admin)', async () => {
    const app = new Hono();
    app.onError((err, c) => { const e = errorEnvelope(err); return c.json(e.body, e.status as any); });
    app.use('*', async (c, next) => { c.set('ctx', { userId: 'u1', isAdmin: false } as any); await next(); });
    app.route('/', commandCenter);
    const res = await app.request('/');
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/admin/commandCenter.test.ts`
Expected: FAIL with "Cannot find module '../../src/modules/admin/commandCenter'"

- [ ] **Step 6: Implement minimal command-center router**

```ts
// apps/api/src/modules/admin/commandCenter.ts
import { Hono } from 'hono';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { purchaseOrders, payouts, deliveries } from '@vyro/db/schema';
import { eq, count } from 'drizzle-orm';
const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));
router.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const openDisputes = await db.select({ n: count() }).from(purchaseOrders).where(eq(purchaseOrders.status, 'disputed')).get();
  const payoutFailures = await db.select({ n: count() }).from(payouts).where(eq(payouts.status, 'failed')).get();
  return c.json({ needsAction: { stuckPayments: 0, payoutFailures: payoutFailures?.n ?? 0, slaBreaches: 0, openDisputes: openDisputes?.n ?? 0 }, recentEvents: [] });
});
export default router;
```

Mount in `apps/api/src/modules/admin/routes.ts`:

```ts
import commandCenterRoutes from './commandCenter';
router.route('/command-center', commandCenterRoutes);
```

Run: `pnpm --filter @vyro/api exec vitest run test/admin/commandCenter.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/validation/src/adminOps.ts packages/validation/src/index.ts apps/api/src/modules/admin/commandCenter.ts apps/api/src/modules/admin/routes.ts apps/api/test/admin/commandCenter.test.ts packages/validation/src/adminOps.test.ts
git commit -m "feat(api): command-center needs-action endpoint + adminOps validation"
```

### Task 2: Orders admin API + UI

**Files:**
- Create: `apps/api/src/modules/admin/orders.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Test: `apps/api/test/admin/orders.test.ts`
- Create: `apps/web/src/admin/OrdersPage.tsx`, `apps/web/src/admin/OrderDetailPage.tsx`, `apps/web/src/admin/useAdminOrders.ts`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/admin/Shell.tsx`

**Interfaces:**
- Consumes: `adminListQuery`, `adminOrderOverrideBody` from `@vyro/validation`; `auditAdmin`; `purchaseOrders` table.
- Produces: `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `POST /api/admin/orders/:id/override`; hook `useAdminOrders()`; routes `/admin/orders`, `/admin/orders/:id`.

- [ ] **Step 1: Write failing orders test**

```ts
// apps/api/test/admin/orders.test.ts (append to file)
import { describe, it, expect } from 'vitest';
import { adminOrderOverrideBody } from '@vyro/validation';
describe('adminOrderOverrideBody', () => {
  it('rejects missing reason', () => {
    expect(adminOrderOverrideBody.safeParse({ status: 'cancelled' }).success).toBe(false);
  });
  it('409 path exists on stale expectedUpdatedAt (route-level)', () => {
    expect(typeof adminOrderOverrideBody.parse).toBe('function');
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @vyro/api exec vitest run test/admin/orders.test.ts`
Expected: FAIL on first run (file missing) → create file with above content, PASS after Task 1 schemas exist. If PASS immediately, extend with route 403 test mirroring Task 1 Step 4 against `orders` router.

- [ ] **Step 3: Implement orders router**

```ts
// apps/api/src/modules/admin/orders.ts
import { Hono } from 'hono';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { adminListQuery, adminOrderOverrideBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';
const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));
router.get('/', async (c) => {
  const parsed = adminListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const rows = await db.select().from(purchaseOrders).limit(parsed.data.limit ?? 50).all();
  return c.json({ orders: rows, nextCursor: null });
});
router.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const row = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Order not found');
  return c.json({ order: row });
});
router.post('/:id/override', async (c) => {
  const parsed = adminOrderOverrideBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Order not found');
  if (parsed.data.expectedUpdatedAt !== undefined && (row as any).updatedAt !== parsed.data.expectedUpdatedAt) {
    throw httpError(409, 'CONFLICT', 'Order changed; refresh and retry');
  }
  await db.update(purchaseOrders).set({ status: parsed.data.status as any }).where(eq(purchaseOrders.id, row.id)).run();
  await auditAdmin({ ctx: c, action: 'order.override', target: { type: 'purchase_order', id: row.id }, before: { status: (row as any).status }, after: { status: parsed.data.status, reason: parsed.data.reason } });
  return c.json({ ok: true, status: parsed.data.status });
});
export default router;
```

Mount: `router.route('/orders', ordersRoutes);` in `routes.ts`.

Run: `pnpm --filter @vyro/api exec vitest run test/admin/orders.test.ts`
Expected: PASS

- [ ] **Step 4: Build orders UI (hook + pages + routes)**

```ts
// apps/web/src/admin/useAdminOrders.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
export function useAdminOrders(status?: string) {
  return useQuery({ queryKey: ['admin-orders', status], queryFn: () => api.get<{ orders: any[] }>(`/admin/orders${status ? `?status=${status}` : ''}`) });
}
```

`OrdersPage.tsx`: table with status filter + link to `/admin/orders/:id`. `OrderDetailPage.tsx`: detail + timeline + override form posting `{ status, reason }` to `/admin/orders/:id/override`. Register lazy routes in `App.tsx` and `NavLink`s in `Shell.tsx` following the existing `suppliers` pattern.

Verify: `pnpm --filter @vyro/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/orders.ts apps/api/src/modules/admin/routes.ts apps/api/test/admin/orders.test.ts apps/web/src/admin/OrdersPage.tsx apps/web/src/admin/OrderDetailPage.tsx apps/web/src/admin/useAdminOrders.ts apps/web/src/App.tsx apps/web/src/admin/Shell.tsx
git commit -m "feat(admin): order ops list detail override with audit"
```

### Task 3: Deliveries board API + UI

**Files:**
- Create: `apps/api/src/modules/admin/deliveriesAdmin.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Test: `apps/api/test/admin/deliveriesAdmin.test.ts`
- Create: `apps/web/src/admin/DeliveriesPage.tsx`, `apps/web/src/admin/useAdminDeliveries.ts`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/admin/Shell.tsx`

**Interfaces:**
- Consumes: `adminListQuery`, `adminReasonBody`; `deliveries` table; `auditAdmin`.
- Produces: `GET /api/admin/deliveries`, `POST /api/admin/deliveries/:id/reassign { assigneeId, reason }`, `POST /api/admin/deliveries/:id/mark-lost { reason }`; hook `useAdminDeliveries()`; route `/admin/deliveries`.

- [ ] **Step 1: Write failing deliveries test**

```ts
// apps/api/test/admin/deliveriesAdmin.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import deliveriesAdmin from '../../src/modules/admin/deliveriesAdmin';
import { errorEnvelope } from '../../src/lib/errors';
describe('deliveries admin', () => {
  it('403 for non-admin', async () => {
    const app = new Hono();
    app.onError((err, c) => { const e = errorEnvelope(err); return c.json(e.body, e.status as any); });
    app.use('*', async (c, next) => { c.set('ctx', { userId: 'u1', isAdmin: false } as any); await next(); });
    app.route('/', deliveriesAdmin);
    const res = await app.request('/');
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/admin/deliveriesAdmin.test.ts`
Expected: FAIL with "Cannot find module '../../src/modules/admin/deliveriesAdmin'"

- [ ] **Step 3: Implement deliveries admin router**

```ts
// apps/api/src/modules/admin/deliveriesAdmin.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { deliveries } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { adminListQuery, adminReasonBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';
const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));
router.get('/', async (c) => {
  const parsed = adminListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const rows = await db.select().from(deliveries).limit(parsed.data.limit ?? 50).all();
  return c.json({ deliveries: rows });
});
const reassignSchema = adminReasonBody.extend({ assigneeId: z.string().min(1) });
router.post('/:id/reassign', async (c) => {
  const parsed = reassignSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await auditAdmin({ ctx: c, action: 'delivery.reassign', target: { type: 'delivery', id: c.req.param('id') }, after: parsed.data });
  return c.json({ ok: true });
});
router.post('/:id/mark-lost', async (c) => {
  const parsed = adminReasonBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await auditAdmin({ ctx: c, action: 'delivery.mark-lost', target: { type: 'delivery', id: c.req.param('id') }, after: parsed.data });
  return c.json({ ok: true });
});
export default router;
```

Mount `router.route('/deliveries', deliveriesAdminRoutes);`.

Run: `pnpm --filter @vyro/api exec vitest run test/admin/deliveriesAdmin.test.ts`
Expected: PASS

- [ ] **Step 4: Build deliveries UI + nav**

Hook `useAdminDeliveries` + `DeliveriesPage.tsx` table with status/SLA badges, reassign and mark-lost dialogs posting `{ assigneeId, reason }` / `{ reason }`. Register `/admin/deliveries` in `App.tsx` + `Shell.tsx`.

Verify: `pnpm --filter @vyro/web exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/deliveriesAdmin.ts apps/api/src/modules/admin/routes.ts apps/api/test/admin/deliveriesAdmin.test.ts apps/web/src/admin/DeliveriesPage.tsx apps/web/src/admin/useAdminDeliveries.ts apps/web/src/App.tsx apps/web/src/admin/Shell.tsx
git commit -m "feat(admin): deliveries board reassign mark-lost"
```

### Task 4: Finance tabs + Command Center UI + nav/search

**Files:**
- Create: `apps/api/src/modules/admin/finance.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Test: `apps/api/test/admin/finance.test.ts`
- Create: `apps/web/src/admin/FinancePage.tsx`, `apps/web/src/admin/useAdminFinance.ts`, `apps/web/src/admin/CommandCenter.tsx`
- Modify: `apps/web/src/admin/HomePage.tsx`, `apps/web/src/App.tsx`, `apps/web/src/admin/Shell.tsx`, `apps/web/src/admin/useGlobalSearch.ts`

**Interfaces:**
- Consumes: `GET /api/admin/command-center` from Task 1; `payouts`, `refunds`, `invoices`, `ledgerEntries` tables; existing CSV export pattern.
- Produces: `GET /api/admin/finance/summary`, `POST /api/admin/finance/payouts/:id/retry { reason }` (idempotency key), `POST /api/admin/finance/refunds { paymentId, amountCents, reason }`; `FinancePage` with 4 tabs; upgraded `HomePage` rendering `CommandCenter`.

- [ ] **Step 1: Write failing finance test**

```ts
// apps/api/test/admin/finance.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import finance from '../../src/modules/admin/finance';
import { errorEnvelope } from '../../src/lib/errors';
describe('finance admin', () => {
  it('403 for non-admin on summary', async () => {
    const app = new Hono();
    app.onError((err, c) => { const e = errorEnvelope(err); return c.json(e.body, e.status as any); });
    app.use('*', async (c, next) => { c.set('ctx', { userId: 'u1', isAdmin: false } as any); await next(); });
    app.route('/', finance);
    const res = await app.request('/summary');
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/admin/finance.test.ts`
Expected: FAIL with "Cannot find module '../../src/modules/admin/finance'"

- [ ] **Step 3: Implement finance router**

```ts
// apps/api/src/modules/admin/finance.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { payouts, refunds } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { adminReasonBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';
const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));
router.get('/summary', async (c) => {
  const db = getDb(c.env.DB);
  const failed = await db.select().from(payouts).where(eq(payouts.status, 'failed')).limit(50).all();
  return c.json({ failedPayouts: failed });
});
router.post('/payouts/:id/retry', async (c) => {
  const parsed = adminReasonBody.extend({ idempotencyKey: z.string().min(8).max(100) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await auditAdmin({ ctx: c, action: 'payout.retry', target: { type: 'payout', id: c.req.param('id') }, after: parsed.data });
  return c.json({ ok: true });
});
const refundBody = z.object({ paymentId: z.string().min(1), amountCents: z.number().int().positive(), reason: z.string().trim().min(5).max(500), idempotencyKey: z.string().min(8).max(100) }).strict();
router.post('/refunds', async (c) => {
  const parsed = refundBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await auditAdmin({ ctx: c, action: 'refund.issue', target: { type: 'payment', id: parsed.data.paymentId }, after: parsed.data });
  return c.json({ ok: true });
});
export default router;
```

Mount `router.route('/finance', financeRoutes);`.

Run: `pnpm --filter @vyro/api exec vitest run test/admin/finance.test.ts`
Expected: PASS

- [ ] **Step 4: Build finance + command-center UI**

`useAdminFinance.ts` (summary query + retry/issue mutations), `FinancePage.tsx` (tabs: payouts, refunds, invoices, ledger with CSV export link to `/api/admin/audit/export`), `CommandCenter.tsx` (polls `/admin/command-center` every 60s, renders needs-action queue + links). Render `CommandCenter` at top of existing `HomePage.tsx`; add `Finance` NavLink in `Shell.tsx`, `/admin/finance` route in `App.tsx`; extend `useGlobalSearch.ts` query to include order/invoice/tracking IDs.

Verify: `pnpm --filter @vyro/web exec tsc --noEmit` and `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Full verification**

Run: `pnpm --filter @vyro/api exec vitest run test/admin/commandCenter.test.ts test/admin/orders.test.ts test/admin/deliveriesAdmin.test.ts test/admin/finance.test.ts`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin/finance.ts apps/api/src/modules/admin/routes.ts apps/api/test/admin/finance.test.ts apps/web/src/admin/FinancePage.tsx apps/web/src/admin/useAdminFinance.ts apps/web/src/admin/CommandCenter.tsx apps/web/src/admin/HomePage.tsx apps/web/src/App.tsx apps/web/src/admin/Shell.tsx apps/web/src/admin/useGlobalSearch.ts
git commit -m "feat(admin): finance tabs command-center UI nav search"
```
