# Admin Bulk Actions Framework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins apply one action (suspend/unsuspend/role) to many users or businesses in a single request, with partial-success handling, per-item audit, and a sticky bottom-bar UI.

**Architecture:** Shared executor module `apps/api/src/modules/admin/bulk/` with per-action files. New `batchId` column on `admin_audit_logs` groups per-item rows + summary. Web: `BulkActionBar` + `useBulkAction` hooks + checkbox column on UsersPage + BusinessesPage.

**Tech Stack:** Hono + D1/Drizzle (api), React + TanStack Query (web), Vitest.

## Global Constraints

- Cap: 100 IDs per request (zod-enforced).
- Dedupe server-side via Set.
- Sequential per-item execution; partial-success semantics.
- One audit row per item (success or failure) + one summary row per batch.
- Reuse existing permissions: `user:suspend`, `admin:role_change`. No new keys.
- SQLite/D1 migration adds nullable column with index.

---

### Task 1: Schema migration + adminAuditLogs.batchId

**Files:**
- Create: `packages/db/migrations/0023_admin_audit_batch.sql`
- Modify: `packages/db/src/schema/adminAuditLogs.ts`

- [ ] **Step 1: Write migration**

`packages/db/migrations/0023_admin_audit_batch.sql`:
```sql
ALTER TABLE `admin_audit_logs` ADD `batch_id` text;
CREATE INDEX IF NOT EXISTS `admin_audit_logs_batch_idx`
  ON `admin_audit_logs` (`batch_id`);
```

- [ ] **Step 2: Update schema**

Add `batchId: text('batch_id')` to the column list in `packages/db/src/schema/adminAuditLogs.ts`. Place after `actorId` or `metadata` (anywhere in the object is fine — Drizzle maps by key).

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @vyro/db typecheck && pnpm --filter @vyro/api typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0023_admin_audit_batch.sql packages/db/src/schema/adminAuditLogs.ts
git commit -m "feat(db): admin_audit_logs.batchId for bulk action grouping"
```

---

### Task 2: Bulk executor + schema

**Files:**
- Create: `apps/api/src/modules/admin/bulk/schema.ts`
- Create: `apps/api/src/modules/admin/bulk/executor.ts`

- [ ] **Step 1: Write schema**

`apps/api/src/modules/admin/bulk/schema.ts`:
```ts
import { z } from 'zod';

export const bulkIdsBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export const bulkUsersRoleBody = bulkIdsBody.extend({
  role: z.enum(['super_admin', 'ops', 'finance', 'support']),
});

export type BulkResult = {
  batchId: string;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; code: string; message: string }>;
};
```

- [ ] **Step 2: Write executor**

`apps/api/src/modules/admin/bulk/executor.ts`:
```ts
import { httpError } from '../../../lib/errors';
import { auditAdminFromDb } from '../lib/audit';
import { newId } from '@vyro/shared';
import { getDb } from '@vyro/db';
import { adminAuditLogs } from '@vyro/db/schema';
import type { Env } from '../../../env';

export type AdminContext = { role: 'super_admin' | 'ops' | 'finance' | 'support'; userId: string };

export type BulkEntity = 'users' | 'businesses';
export type BulkAction = 'suspend' | 'unsuspend' | 'role';

export interface BulkActionOptions {
  env: Env;
  ctx: AdminContext;
  entity: BulkEntity;
  action: BulkAction;
  ids: string[];
  /** Per-item function. Throw to fail; return 'noop' for idempotent skip; return 'ok' for success. */
  perItem: (id: string) => Promise<'ok' | 'noop'>;
  /** Optional extras recorded in the summary audit row. */
  extras?: Record<string, unknown>;
}

export type BulkResult = {
  batchId: string;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; code: string; message: string }>;
};

export async function bulkAction(opts: BulkActionOptions): Promise<BulkResult> {
  const unique = [...new Set(opts.ids.filter(Boolean))];
  const batchId = newId();
  const succeeded: string[] = [];
  const failed: Array<{ id: string; code: string; message: string }> = [];

  for (const id of unique) {
    try {
      const r = await opts.perItem(id);
      if (r === 'ok') succeeded.push(id);
      // 'noop' counts as neither success nor failure — caller treats as idempotent
    } catch (err) {
      const e = err as { code?: string; message?: string; status?: number };
      failed.push({
        id,
        code: e.code ?? 'INTERNAL_ERROR',
        message: e.message ?? 'unexpected error',
      });
    }
  }

  // Per-item audit rows
  const db = getDb(opts.env.DB);
  const now = Date.now();
  const perItemRows = [
    ...succeeded.map((id) => ({
      id: newId(),
      actorId: opts.ctx.userId,
      action: `${opts.entity}.${opts.action}`,
      target: JSON.stringify({ type: opts.entity, id }),
      metadata: JSON.stringify({ batchId }),
      success: 1,
      createdAt: now,
    })),
    ...failed.map((f) => ({
      id: newId(),
      actorId: opts.ctx.userId,
      action: `${opts.entity}.${opts.action}.failed`,
      target: JSON.stringify({ type: opts.entity, id: f.id }),
      metadata: JSON.stringify({ batchId, code: f.code, message: f.message }),
      success: 0,
      createdAt: now,
    })),
  ];
  for (const row of perItemRows) {
    try { await db.insert(adminAuditLogs).values(row).run(); } catch { /* never throw from audit */ }
  }

  // Summary audit row
  await auditAdminFromDb({
    db,
    actorUserId: opts.ctx.userId,
    action: 'bulk.batch',
    target: { type: 'batch', id: batchId },
    metadata: {
      entity: opts.entity,
      action: opts.action,
      total: unique.length,
      succeeded: succeeded.length,
      failed: failed.length,
      ...(opts.extras ?? {}),
    },
  });

  return { batchId, total: unique.length, succeeded, failed };
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/admin/bulk/schema.ts apps/api/src/modules/admin/bulk/executor.ts
git commit -m "feat(api): bulk action executor with per-item + summary audit"
```

---

### Task 3: Per-action files (5 actions)

**Files:**
- Create: `apps/api/src/modules/admin/bulk/actions/usersSuspend.ts`
- Create: `apps/api/src/modules/admin/bulk/actions/usersUnsuspend.ts`
- Create: `apps/api/src/modules/admin/bulk/actions/usersRole.ts`
- Create: `apps/api/src/modules/admin/bulk/actions/businessesSuspend.ts`
- Create: `apps/api/src/modules/admin/bulk/actions/businessesUnsuspend.ts`

Each exports `run(env, id): Promise<'ok' | 'noop'>`.

- [ ] **Step 1: usersSuspend.ts**

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';

export async function run(env: Env, id: string): Promise<'ok' | 'noop'> {
  const db = getDb(env.DB);
  const row = await db.select({ status: users.status }).from(users).where(eq(users.id, id)).get();
  if (!row) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });
  if (row.status === 'suspended') return 'noop';
  await db.update(users).set({ status: 'suspended', updatedAt: Date.now() }).where(eq(users.id, id)).run();
  return 'ok';
}
```

- [ ] **Step 2: usersUnsuspend.ts**

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';

export async function run(env: Env, id: string): Promise<'ok' | 'noop'> {
  const db = getDb(env.DB);
  const row = await db.select({ status: users.status }).from(users).where(eq(users.id, id)).get();
  if (!row) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });
  if (row.status !== 'suspended') return 'noop';
  await db.update(users).set({ status: 'active', updatedAt: Date.now() }).where(eq(users.id, id)).run();
  return 'ok';
}
```

- [ ] **Step 3: usersRole.ts**

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import type { AdminRole } from '@vyro/auth';

export async function run(env: Env, id: string, role: AdminRole): Promise<'ok' | 'noop'> {
  const db = getDb(env.DB);
  const row = await db.select({ adminRole: users.adminRole }).from(users).where(eq(users.id, id)).get();
  if (!row) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });
  if (row.adminRole === role) return 'noop';
  await db.update(users).set({ adminRole: role, updatedAt: Date.now() }).where(eq(users.id, id)).run();
  return 'ok';
}
```

- [ ] **Step 4: businessesSuspend.ts**

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses } from '@vyro/db/schema';

export async function run(env: Env, id: string): Promise<'ok' | 'noop'> {
  const db = getDb(env.DB);
  const row = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, id)).get();
  if (!row) throw Object.assign(new Error('business not found'), { code: 'NOT_FOUND', status: 404 });
  if (row.status === 'suspended') return 'noop';
  await db.update(businesses).set({ status: 'suspended', updatedAt: Date.now() }).where(eq(businesses.id, id)).run();
  return 'ok';
}
```

- [ ] **Step 5: businessesUnsuspend.ts**

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses } from '@vyro/db/schema';

export async function run(env: Env, id: string): Promise<'ok' | 'noop'> {
  const db = getDb(env.DB);
  const row = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, id)).get();
  if (!row) throw Object.assign(new Error('business not found'), { code: 'NOT_FOUND', status: 404 });
  if (row.status !== 'suspended') return 'noop';
  await db.update(businesses).set({ status: 'active', updatedAt: Date.now() }).where(eq(businesses.id, id)).run();
  return 'ok';
}
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin/bulk/actions/
git commit -m "feat(api): bulk per-action files (users/businesses)"
```

---

### Task 4: Bulk routes sub-router

**Files:**
- Create: `apps/api/src/modules/admin/bulk/routes.ts`
- Modify: `apps/api/src/modules/admin/routes.ts` (mount)

- [ ] **Step 1: Write routes**

`apps/api/src/modules/admin/bulk/routes.ts`:
```ts
import { Hono } from 'hono';
import { session } from '../../../middleware/session';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { isAdminRole, ADMIN_ROLES } from '@vyro/auth';
import { bulkIdsBody, bulkUsersRoleBody } from './schema';
import { bulkAction, type AdminContext } from './executor';
import * as usersSuspend from './actions/usersSuspend';
import * as usersUnsuspend from './actions/usersUnsuspend';
import * as usersRole from './actions/usersRole';
import * as businessesSuspend from './actions/businessesSuspend';
import * as businessesUnsuspend from './actions/businessesUnsuspend';
import type { Env } from '../../../env';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));

function ctx(c: any): AdminContext {
  const v = c.get('ctx') as { adminRole?: string; userId?: string };
  if (!isAdminRole(v.adminRole) || !v.userId) throw httpError(401, 'UNAUTHORIZED', 'admin session');
  return { role: v.adminRole, userId: v.userId };
}

router.post('/users/suspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'users', action: 'suspend',
    ids: body.data.ids,
    perItem: (id) => usersSuspend.run(env, id),
  });
  return c.json(result);
});

router.post('/users/unsuspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'users', action: 'unsuspend',
    ids: body.data.ids,
    perItem: (id) => usersUnsuspend.run(env, id),
  });
  return c.json(result);
});

router.post('/users/role', requirePermission('admin:role_change'), async (c) => {
  const body = bulkUsersRoleBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'users', action: 'role',
    ids: body.data.ids,
    extras: { role: body.data.role },
    perItem: (id) => usersRole.run(env, id, body.data.role),
  });
  return c.json(result);
});

router.post('/businesses/suspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'businesses', action: 'suspend',
    ids: body.data.ids,
    perItem: (id) => businessesSuspend.run(env, id),
  });
  return c.json(result);
});

router.post('/businesses/unsuspend', requirePermission('user:suspend'), async (c) => {
  const body = bulkIdsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', body.error.message);
  const admin = ctx(c);
  const env = c.env as unknown as Env;
  const result = await bulkAction({
    env, ctx: admin, entity: 'businesses', action: 'unsuspend',
    ids: body.data.ids,
    perItem: (id) => businessesUnsuspend.run(env, id),
  });
  return c.json(result);
});

export default router;
```

- [ ] **Step 2: Mount in admin router**

Edit `apps/api/src/modules/admin/routes.ts`: add
```ts
import adminBulkRoutes from './bulk/routes';
...
router.route('/bulk', adminBulkRoutes);
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/admin/bulk/routes.ts apps/api/src/modules/admin/routes.ts
git commit -m "feat(api): bulk routes sub-router mounted at /api/admin/bulk"
```

---

### Task 5: Bulk executor test

**Files:**
- Create: `apps/api/test/admin/bulk/executor.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { bulkAction } from '../../../src/modules/admin/bulk/executor';

const state = vi.hoisted(() => ({
  insertedRows: [] as any[],
  summaryRows: [] as any[],
}));

vi.mock('../../../src/modules/admin/lib/audit', () => ({
  auditAdminFromDb: async (opts: any) => { state.summaryRows.push(opts); },
}));

vi.mock('@vyro/db', () => {
  const db = {
    insert: () => ({
      values: (row: any) => ({
        run: async () => { state.insertedRows.push(row); },
      }),
    }),
  };
  return { getDb: () => db };
});

function env() { return { DB: {} as any } as any; }
function ctx() { return { role: 'super_admin', userId: 'u-admin' }; }

describe('bulkAction executor', () => {
  beforeEach(() => { state.insertedRows = []; state.summaryRows = []; });

  it('dedupes IDs and returns ok for each', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a', 'a', 'b', 'b'],
      perItem: async () => 'ok',
    });
    expect(result.total).toBe(2);
    expect(result.succeeded).toEqual(['a', 'b']);
    expect(result.failed).toEqual([]);
  });

  it('captures thrown errors per-item with code + message', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a', 'b', 'c'],
      perItem: async (id) => {
        if (id === 'b') throw Object.assign(new Error('not found'), { code: 'NOT_FOUND', status: 404 });
        return 'ok';
      },
    });
    expect(result.succeeded).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ id: 'b', code: 'NOT_FOUND', message: 'not found' }]);
  });

  it('noop counts as neither success nor failure', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a'],
      perItem: async () => 'noop',
    });
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('audits per-item + summary rows', async () => {
    await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a', 'b'],
      perItem: async (id) => id === 'a' ? 'ok' : (() => { throw new Error('boom'); })(),
    });
    expect(state.insertedRows.length).toBe(2);
    expect(state.insertedRows.find(r => r.action === 'users.suspend')).toBeTruthy();
    expect(state.insertedRows.find(r => r.action === 'users.suspend.failed')).toBeTruthy();
    expect(state.summaryRows.length).toBe(1);
    expect(state.summaryRows[0].action).toBe('bulk.batch');
    expect(state.summaryRows[0].metadata).toMatchObject({ entity: 'users', action: 'suspend', total: 2, succeeded: 1, failed: 1 });
  });

  it('empty after dedupe returns empty result + summary', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['', '', ''],
      perItem: async () => 'ok',
    });
    expect(result.total).toBe(0);
    expect(state.summaryRows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @vyro/api test admin/bulk/executor`
Expected: PASS (5 tests)

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/admin/bulk/executor.test.ts
git commit -m "test(api): bulk executor tests (dedupe, failure capture, audit)"
```

---

### Task 6: Bulk routes + RBAC tests

**Files:**
- Create: `apps/api/test/admin/bulk/routes.test.ts`
- Create: `apps/api/test/admin/bulk/rbac.test.ts`

- [ ] **Step 1: routes.test.ts**

```ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminBulkRoutes from '../../../src/modules/admin/bulk/routes';

const state = vi.hoisted(() => ({
  ctx: { isAdmin: true, adminRole: 'super_admin', userId: 'u-1' } as any,
  lastCall: null as null | { path: string; ids: any },
}));

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => { c.set('ctx', state.ctx); await next(); },
}));
vi.mock('../../../src/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => await next(),
  requirePermission: () => async (_c: any, next: any) => await next(),
}));
vi.mock('../../../src/modules/admin/lib/audit', () => ({ auditAdminFromDb: async () => {} }));
vi.mock('../../../src/modules/admin/bulk/executor', () => ({
  bulkAction: async (opts: any) => {
    state.lastCall = { path: `${opts.entity}/${opts.action}`, ids: opts.ids };
    return { batchId: 'b1', total: opts.ids.length, succeeded: opts.ids, failed: [] };
  },
}));
vi.mock('../../../src/modules/admin/bulk/actions/usersSuspend', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/usersUnsuspend', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/usersRole', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/businessesSuspend', () => ({ run: async () => 'ok' }));
vi.mock('../../../src/modules/admin/bulk/actions/businessesUnsuspend', () => ({ run: async () => 'ok' }));

function app() {
  const a = new Hono();
  a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
  a.route('/admin/bulk', adminBulkRoutes);
  return a;
}

const post = (path: string, body: any) =>
  app().request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('bulk routes happy path', () => {
  it('users/suspend', async () => {
    const r = await post('/admin/bulk/users/suspend', { ids: ['a', 'b'] });
    expect(r.status).toBe(200);
    expect((await r.json() as any).total).toBe(2);
    expect(state.lastCall?.path).toBe('users/suspend');
  });

  it('users/unsuspend', async () => {
    const r = await post('/admin/bulk/users/unsuspend', { ids: ['a'] });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('users/unsuspend');
  });

  it('users/role', async () => {
    const r = await post('/admin/bulk/users/role', { ids: ['a'], role: 'ops' });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('users/role');
  });

  it('businesses/suspend', async () => {
    const r = await post('/admin/bulk/businesses/suspend', { ids: ['x'] });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('businesses/suspend');
  });

  it('businesses/unsuspend', async () => {
    const r = await post('/admin/bulk/businesses/unsuspend', { ids: ['x'] });
    expect(r.status).toBe(200);
    expect(state.lastCall?.path).toBe('businesses/unsuspend');
  });
});
```

- [ ] **Step 2: rbac.test.ts**

```ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

const state = vi.hoisted(() => ({
  ctx: { isAdmin: true, adminRole: 'super_admin', userId: 'u-1' } as any,
  permissions: new Set<string>(),
}));

function makeMocks() {
  vi.doMock('../../../src/middleware/session', () => ({
    session: () => async (c: any, next: any) => { c.set('ctx', state.ctx); await next(); },
  }));
  vi.doMock('../../../src/middleware/rbac', () => ({
    requireRole: () => async (_c: any, next: any) => await next(),
    requirePermission: (perm: string) => async (_c: any, next: any) => {
      if (!state.permissions.has(perm)) throw new Error('FORBIDDEN');
      await next();
    },
  }));
  vi.doMock('../../../src/modules/admin/lib/audit', () => ({ auditAdminFromDb: async () => {} }));
  vi.doMock('../../../src/modules/admin/bulk/executor', () => ({
    bulkAction: async () => ({ batchId: 'b', total: 0, succeeded: [], failed: [] }),
  }));
  vi.doMock('../../../src/modules/admin/bulk/actions/usersSuspend', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/usersUnsuspend', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/usersRole', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/businessesSuspend', () => ({ run: async () => 'ok' }));
  vi.doMock('../../../src/modules/admin/bulk/actions/businessesUnsuspend', () => ({ run: async () => 'ok' }));
}

async function loadFreshApp() {
  vi.resetModules();
  makeMocks();
  const mod = await import('../../../src/modules/admin/bulk/routes');
  const a = new Hono();
  a.onError((err, c) => c.json({ message: (err as Error).message }, 500));
  a.route('/admin/bulk', mod.default);
  return a;
}

const post = (app: Hono, path: string, body: any) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('bulk routes RBAC', () => {
  it('user:suspend grants users/businesses suspend+unsuspend', async () => {
    state.permissions = new Set(['user:suspend']);
    const a = await loadFreshApp();
    expect((await post(a, '/admin/bulk/users/suspend', { ids: ['a'] })).status).toBe(200);
    expect((await post(a, '/admin/bulk/users/unsuspend', { ids: ['a'] })).status).toBe(200);
    expect((await post(a, '/admin/bulk/businesses/suspend', { ids: ['a'] })).status).toBe(200);
    expect((await post(a, '/admin/bulk/businesses/unsuspend', { ids: ['a'] })).status).toBe(200);
  });

  it('admin:role_change grants users/role', async () => {
    state.permissions = new Set(['admin:role_change']);
    const a = await loadFreshApp();
    expect((await post(a, '/admin/bulk/users/role', { ids: ['a'], role: 'ops' })).status).toBe(200);
  });

  it('missing permission rejects with 500', async () => {
    state.permissions = new Set();
    const a = await loadFreshApp();
    expect((await post(a, '/admin/bulk/users/suspend', { ids: ['a'] })).status).toBe(500);
    expect((await post(a, '/admin/bulk/users/role', { ids: ['a'], role: 'ops' })).status).toBe(500);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @vyro/api test admin/bulk`
Expected: PASS (3 + 5 + 3 = 11 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/admin/bulk/
git commit -m "test(api): bulk routes + RBAC matrix tests"
```

---

### Task 7: Web hooks + shared components

**Files:**
- Create: `apps/web/src/admin/useBulkAction.ts`
- Create: `apps/web/src/admin/BulkActionBar.tsx`
- Create: `apps/web/src/admin/BulkConfirmDialog.tsx`
- Create: `apps/web/src/admin/BulkResultDialog.tsx`

- [ ] **Step 1: useBulkAction.ts**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type BulkResult = {
  batchId: string;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; code: string; message: string }>;
};

function postBulk<T>(path: string, qc: ReturnType<typeof useQueryClient>, invalidateKey: readonly unknown[]) {
  return useMutation({
    mutationFn: async (body: T) => api.post<BulkResult>(`/admin/bulk/${path}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}

export function useBulkUsersSuspend(qc: ReturnType<typeof useQueryClient>) {
  return postBulk<{ ids: string[] }>('users/suspend', qc, ['admin', 'users']);
}
export function useBulkUsersUnsuspend(qc: ReturnType<typeof useQueryClient>) {
  return postBulk<{ ids: string[] }>('users/unsuspend', qc, ['admin', 'users']);
}
export function useBulkUsersRole(qc: ReturnType<typeof useQueryClient>) {
  return postBulk<{ ids: string[]; role: 'super_admin' | 'ops' | 'finance' | 'support' }>('users/role', qc, ['admin', 'users']);
}
export function useBulkBusinessesSuspend(qc: ReturnType<typeof useQueryClient>) {
  return postBulk<{ ids: string[] }>('businesses/suspend', qc, ['admin', 'businesses']);
}
export function useBulkBusinessesUnsuspend(qc: ReturnType<typeof useQueryClient>) {
  return postBulk<{ ids: string[] }>('businesses/unsuspend', qc, ['admin', 'businesses']);
}
```

- [ ] **Step 2: BulkActionBar.tsx**

```tsx
import { cn } from '@vyro/ui';

export interface BulkAction {
  label: string;
  run: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function BulkActionBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-void text-paper px-4 py-3 flex items-center gap-3 border-t border-paper/20">
      <span className="text-sm font-mono">{count} selected</span>
      <div className="flex-1 flex gap-2 flex-wrap">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={a.disabled}
            onClick={a.run}
            className={cn(
              'px-3 py-1 text-xs uppercase tracking-wide border rounded',
              a.destructive
                ? 'border-rose text-rose hover:bg-rose hover:text-paper'
                : 'border-paper/40 text-paper hover:border-volt hover:text-volt',
              a.disabled && 'opacity-40 cursor-not-allowed',
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onClear} aria-label="Clear selection" className="text-paper/60 hover:text-paper">
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 3: BulkConfirmDialog.tsx**

```tsx
import { useState } from 'react';
import { Surface, Button } from '@/components/ui';

export function BulkConfirmDialog({
  open,
  count,
  action,
  requireReason = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  action: string;
  requireReason?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  if (!open) return null;
  const ready = !requireReason || reason.trim().length > 0;
  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <Surface className="w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium">{action} {count} item{count === 1 ? '' : 's'}?</h3>
        {requireReason ? (
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              rows={3}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            />
          </label>
        ) : null}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!ready} onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}>
            Confirm
          </Button>
        </div>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 4: BulkResultDialog.tsx**

```tsx
import { Surface, Button } from '@/components/ui';
import type { BulkResult } from './useBulkAction';

export function BulkResultDialog({
  open,
  result,
  onClose,
  onRetryFailed,
}: {
  open: boolean;
  result: BulkResult | null;
  onClose: () => void;
  onRetryFailed?: (ids: string[]) => void;
}) {
  if (!open || !result) return null;
  const failedIds = result.failed.map((f) => f.id);
  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Surface className="w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium">Bulk action complete</h3>
        <p className="text-sm">
          <span className="text-mint font-mono">{result.succeeded.length}</span> succeeded ·{' '}
          <span className="text-rose font-mono">{result.failed.length}</span> failed ·{' '}
          <span className="text-ink-4 font-mono">{result.total}</span> total
        </p>
        {result.failed.length > 0 ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-3">Failures ({result.failed.length})</summary>
            <ul className="mt-2 space-y-1">
              {result.failed.map((f) => (
                <li key={f.id} className="flex gap-2 font-mono">
                  <span className="truncate flex-1">{f.id}</span>
                  <span className="text-rose">{f.code}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="flex gap-2 justify-end">
          {onRetryFailed && failedIds.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onRetryFailed(failedIds)}>
              Retry failed
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </div>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @vyro/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/admin/useBulkAction.ts apps/web/src/admin/BulkActionBar.tsx apps/web/src/admin/BulkConfirmDialog.tsx apps/web/src/admin/BulkResultDialog.tsx
git commit -m "feat(web): bulk action hooks + bar + confirm/result dialogs"
```

---

### Task 8: Wire bulk actions into UsersPage + BusinessesPage

**Files:**
- Modify: `apps/web/src/admin/UsersPage.tsx`
- Modify: `apps/web/src/admin/BusinessesPage.tsx`

For each page: add row checkbox column, header select-all, selection state, mount `<BulkActionBar>`, wire `useBulkAction` hooks with confirm + result dialogs.

- [ ] **Step 1: Read UsersPage + BusinessesPage**

Read both files to understand current structure (filter, list, query hooks).

- [ ] **Step 2: Add selection + bulk wiring to UsersPage**

In UsersPage:
- `const [selected, setSelected] = useState<Set<string>>(new Set())`
- `const [confirm, setConfirm] = useState<null | 'suspend' | 'unsuspend' | {role: AdminRole}>(null)`
- `const [result, setResult] = useState<BulkResult | null>(null)`
- `const qc = useQueryClient()`
- Wire 3 hooks from useBulkAction
- In table: add `<th>` with select-all checkbox + `<td>` per row with checkbox
- After list: render `<BulkActionBar>` with actions
- After bulk mutation success: setResult; on retry: take failed IDs and re-run

- [ ] **Step 3: Add same pattern to BusinessesPage**

Same as UsersPage but only suspend/unsuspend (no role action). Invalidates `['admin', 'businesses']`.

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter @vyro/web typecheck && pnpm --filter @vyro/web build`
Expected: PASS

- [ ] **Step 5: Run web tests**

Run: `pnpm --filter @vyro/web test`
Expected: existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/admin/UsersPage.tsx apps/web/src/admin/BusinessesPage.tsx
git commit -m "feat(web): bulk action wiring on Users + Businesses pages"
```

---

### Task 9: Runbook + smoke

**Files:**
- Modify: `docs/runbook.md`

- [ ] **Step 1: Append runbook section**

```markdown
## Admin Bulk Actions

Multi-row actions live under `/api/admin/bulk/*`. Each request accepts up
to 100 IDs (zod-enforced). Response shape:

```ts
{
  batchId: string;
  total: number;          // after dedupe
  succeeded: string[];    // actually transitioned
  failed: Array<{ id, code, message }>;
}
```

Status code is `200` even with partial failures. Inspect `failed[]` for
per-item outcomes. Every request writes one summary audit row
(`action='bulk.batch'`) plus one row per item attempt under the same
`batch_id` on `admin_audit_logs`. Query with
`SELECT * FROM admin_audit_logs WHERE batch_id = ?`.

### Endpoints

| Endpoint                              | Permission         |
|---------------------------------------|--------------------|
| POST /api/admin/bulk/users/suspend    | user:suspend       |
| POST /api/admin/bulk/users/unsuspend  | user:suspend       |
| POST /api/admin/bulk/users/role       | admin:role_change  |
| POST /api/admin/bulk/businesses/suspend    | user:suspend  |
| POST /api/admin/bulk/businesses/unsuspend  | user:suspend  |

### Cap rationale

100 IDs ≈ 5s sequential on Workers; larger batches risk the CPU-time
limit. Override with `BULK_MAX_IDS` env if needed.

### UI

UsersPage + BusinessesPage show a sticky bottom action bar when rows are
selected. Cap warning: if the filtered list exceeds 100, the select-all
checkbox is disabled with a tooltip "Bulk actions cap at 100 — refine
filter".
```

- [ ] **Step 2: Full smoke**

```bash
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/web typecheck
pnpm --filter @vyro/api test admin/bulk
pnpm --filter @vyro/web test
pnpm --filter @vyro/api build
pnpm --filter @vyro/web build
```

Expected: all green (except 3 pre-existing unrelated failures:
paymentSearch, cart, supplierProducts).

- [ ] **Step 3: Commit**

```bash
git add docs/runbook.md
git commit -m "docs(admin): bulk actions runbook entry"
```
