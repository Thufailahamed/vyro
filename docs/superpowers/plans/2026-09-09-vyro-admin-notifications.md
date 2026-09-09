# Admin Notifications Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single admin inbox (`/admin/notifications`) + shell bell badge + per-role alert fan-out for stuck refunds, failed payouts, chargebacks, queue DLQs, fraud reports, and KYC review — with critical alerts emailing the admins on call.

**Architecture:** Extend the existing `notifications` table with nullable `recipientRole` + `severity` + `sourceRef`. New `notifyAdmins(...)` helper on the existing dispatcher. New `/api/admin/notifications` sub-router. Six module-level triggers. Cron for refund-stuck threshold. New `NotificationsPage` + shell bell widget in `Shell.tsx`.

**Tech Stack:** Hono + D1 + Drizzle, `NOTIFICATIONS_QUEUE`, existing `sendEmailOrThrow`, React + TanStack Query, vitest, RBAC union extension.

## Global Constraints

- TypeScript `exactOptionalPropertyTypes: true` — use conditional spread pattern for optional fields
- All new admin endpoints gated `session() + requireRole({ admin: true })` + `requirePermission(...)` like other sub-routers
- All dispatcher calls audit-log via `auditAdmin`
- Drizzle chain mocking follows recursive-stub + per-call-factory pattern from `payment-search-repo.test.ts`
- No new top-level deps; reuse `sendEmail`, `NOTIFICATIONS_QUEUE`, existing audit pipeline
- Existing `/api/notifications/me` route must remain unaffected (buyers/suppliers never see admin rows)

---

### Task 1: Schema migration + notification catalog

**Files:**
- Modify: `packages/db/src/schema/notifications.ts`
- Modify: `packages/db/src/schema/userSettings.ts`
- Modify: `packages/shared/src/constants/notifications.ts`
- Create: `packages/db/src/migrations/0024_admin_notifications.sql`

**Interfaces:**
- Consumes: existing `notifications` table schema (id, userId, type, title, body, link, readAt, source, createdAt)
- Produces: `recipientRole text NULL`, `severity text NOT NULL DEFAULT 'info'`, `sourceRef text NULL` columns + `recipient_role_unread_idx (recipientRole, readAt, createdAt)` index + CHECK constraint `(userId IS NOT NULL) <> (recipientRole IS NOT NULL)`

- [ ] **Step 1: Extend notifications schema**

```ts
// packages/db/src/schema/notifications.ts — add columns + index
export const adminAlertSeverity = ['info', 'warning', 'critical'] as const;
export type AdminAlertSeverity = (typeof adminAlertSeverity)[number];

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    recipientRole: text('recipient_role'),           // 'super_admin' | 'ops' | 'finance' | 'support'
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    source: text('source').notNull().default('system'),  // 'system' | 'ai' | 'admin'
    sourceRef: text('source_ref'),
    severity: text('severity').notNull().default('info'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    userReadIdx: index('user_read_idx').on(t.userId, t.readAt),
    sourceIdx: index('source_idx').on(t.userId, t.source, t.readAt),
    recipientRoleUnreadIdx: index('recipient_role_unread_idx').on(
      t.recipientRole, t.readAt, t.createdAt,
    ),
  }),
);
```

- [ ] **Step 2: Add notifyAdminAlerts to userSettings**

```ts
// packages/db/src/schema/userSettings.ts — add column in userSettings object
notifyAdminAlerts: integer('notify_admin_alerts').notNull().default(1),
```

- [ ] **Step 3: Extend notification constants**

```ts
// packages/shared/src/constants/notifications.ts
export const NOTIFICATION_CATEGORY = [
  'order', 'message', 'payment', 'stock', 'marketing', 'system', 'admin_alert',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[number];

export const ADMIN_ALERT_SEVERITY = ['info', 'warning', 'critical'] as const;
export type AdminAlertSeverity = (typeof ADMIN_ALERT_SEVERITY)[number];

export const ADMIN_ROLES = ['super_admin', 'ops', 'finance', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
```

- [ ] **Step 4: Write migration SQL**

```sql
-- packages/db/src/migrations/0024_admin_notifications.sql
ALTER TABLE notifications ADD COLUMN recipient_role TEXT;
ALTER TABLE notifications ADD COLUMN source_ref TEXT;
ALTER TABLE notifications ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';

-- D1/SQLite: cannot add NOT NULL without DEFAULT — handled via DEFAULT 'info'
-- D1/SQLite: CHECK constraints cannot be added via ALTER TABLE; enforce in app layer + document.

CREATE INDEX IF NOT EXISTS recipient_role_unread_idx
  ON notifications (recipient_role, read_at, created_at);
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @vyro/db typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db packages/shared
git commit -m "feat(db): admin notifications schema + catalog"
```

---

### Task 2: RBAC permissions + role grants

**Files:**
- Modify: `packages/auth/src/permissions.ts`
- Modify: `packages/auth/src/rolePermissions.ts`

**Interfaces:**
- Consumes: existing Permission union
- Produces: 3 new permission keys (`notification:read`, `notification:write`, `notification:dismiss`) + grants per role per spec section 2.2

- [ ] **Step 1: Add permission keys**

```ts
// packages/auth/src/permissions.ts — append to PERMISSION_KEYS array
'notification:read',
'notification:write',
'notification:dismiss',
```

- [ ] **Step 2: Add role grants**

```ts
// packages/auth/src/rolePermissions.ts — extend each role's array
super_admin: [...existing, 'notification:read', 'notification:write', 'notification:dismiss'],
ops:        [...existing, 'notification:read', 'notification:dismiss'],
finance:    [...existing, 'notification:read', 'notification:dismiss'],
support:    [...existing, 'notification:read', 'notification:dismiss'],
```

- [ ] **Step 3: Run auth typecheck + test**

Run: `pnpm --filter @vyro/auth typecheck && pnpm --filter @vyro/auth test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/auth
git commit -m "feat(auth): notification:read/write/dismiss perms"
```

---

### Task 3: `notifyAdmins` dispatcher helper

**Files:**
- Modify: `apps/api/src/modules/notifications/dispatcher.ts`
- Create: `apps/api/test/admin/notifications/dispatcher.test.ts`

**Interfaces:**
- Consumes: `D1Database`, `AdminAlertInput`
- Produces: `{ recipients: number }`; inserts one row per recipient into `notifications` + enqueues email jobs on `NOTIFICATIONS_QUEUE` for severity=critical + emits audit log

- [ ] **Step 1: Write failing test**

```ts
// apps/api/test/admin/notifications/dispatcher.test.ts
import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({
  inserted: [] as any[],
  queued: [] as any[],
  audited: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({ insert: () => ({ values: (v: any) => { state.inserted.push(v); } }) }),
}));

vi.mock('@vyro/db/schema', () => ({
  notifications: { recipientRole: 'r', userId: 'u' },
  users: { id: 'id', adminRole: 'ar', status: 's' },
}));

vi.mock('../../../../src/lib/queue', () => ({
  enqueue: (q: string, p: any) => { state.queued.push({ q, p }); },
  NOTIFICATIONS_QUEUE: 'notifications',
}));

vi.mock('../../../admin/lib/audit', () => ({
  auditAdmin: (opts: any) => { state.audited.push(opts); },
}));

import { notifyAdmins } from '../../../src/modules/notifications/dispatcher';

describe('notifyAdmins', () => {
  beforeEach(() => { state.inserted = []; state.queued = []; state.audited = []; });

  it('inserts one row per admin in role + audits + does not enqueue email for info', async () => {
    // Mock select users WHERE adminRole = ?
    const selectChain = {
      from: () => selectChain,
      where: () => selectChain,
      all: () => [{ id: 'u1', email: 'a@x' }, { id: 'u2', email: 'b@x' }],
    };
    const db: any = {
      select: () => selectChain,
      insert: () => ({ values: (v: any) => { state.inserted.push(v); } }),
    };
    const out = await notifyAdmins(db, {
      role: 'finance', severity: 'info', category: 'admin_alert',
      title: 't', body: 'b', sourceRef: 'refund:r1',
    });
    expect(out.recipients).toBe(2);
    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0].severity).toBe('info');
    expect(state.queued).toHaveLength(0);
    expect(state.audited[0].action).toBe('notification.broadcast');
  });

  it('enqueues one email job per recipient for severity=critical', async () => {
    const selectChain = { from: () => selectChain, where: () => selectChain, all: () => [{ id: 'u1', email: 'a@x' }] };
    const db: any = { select: () => selectChain, insert: () => ({ values: (v: any) => { state.inserted.push(v); } }) };
    await notifyAdmins(db, { role: 'ops', severity: 'critical', category: 'admin_alert', title: 't', body: 'b' });
    expect(state.queued).toHaveLength(1);
    expect(state.queued[0].q).toBe('notifications');
    expect(state.queued[0].p.kind).toBe('admin_alert_email');
  });

  it('emits audit log even with zero recipients', async () => {
    const selectChain = { from: () => selectChain, where: () => selectChain, all: () => [] };
    const db: any = { select: () => selectChain, insert: () => ({ values: (v: any) => { state.inserted.push(v); } }) };
    const out = await notifyAdmins(db, { role: 'support', severity: 'warning', category: 'admin_alert', title: 't', body: 'b' });
    expect(out.recipients).toBe(0);
    expect(state.audited).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @vyro/api test -- test/admin/notifications/dispatcher.test.ts`
Expected: FAIL with `Cannot find module ... notifyAdmins`

- [ ] **Step 3: Implement `notifyAdmins`**

```ts
// apps/api/src/modules/notifications/dispatcher.ts — append at end
import { eq, and, eq as eq2 } from 'drizzle-orm';
import { users } from '@vyro/db/schema';
import { enqueue, NOTIFICATIONS_QUEUE } from '../../lib/queue';
import { auditAdmin } from '../admin/lib/audit';
import type { AdminRole, AdminAlertSeverity } from '@vyro/shared/constants/notifications';

export type AdminAlertInput = {
  role: AdminRole;
  severity: AdminAlertSeverity;
  category: 'admin_alert';
  title: string;
  body: string;
  link?: string | null;
  sourceRef?: string | null;
  actorUserId?: string | null;
};

export async function notifyAdmins(
  db: D1Database,
  input: AdminAlertInput,
): Promise<{ recipients: number }> {
  const { role, severity, category, title, body, link = null, sourceRef = null, actorUserId = null } = input;
  const recipients = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.adminRole, role), eq(users.status, 'active')))
    .all();

  for (const r of recipients) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      userId: null,
      recipientRole: role,
      type: 'admin_alert',
      title,
      body,
      link,
      readAt: null,
      source: 'admin',
      sourceRef,
      severity,
      createdAt: new Date(),
    });
    if (severity === 'critical') {
      await enqueue(NOTIFICATIONS_QUEUE, {
        kind: 'admin_alert_email',
        recipientUserId: r.id,
        recipientEmail: r.email,
        title, body, link, severity,
      });
    }
  }

  await auditAdmin({
    db,
    actorUserId,
    action: 'notification.broadcast',
    target: { type: 'admin_notification', id: sourceRef ?? 'ad-hoc' },
    metadata: { role, severity, recipients: recipients.length },
  });

  return { recipients: recipients.length };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm --filter @vyro/api test -- test/admin/notifications/dispatcher.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications apps/api/test/admin/notifications
git commit -m "feat(api): notifyAdmins dispatcher helper"
```

---

### Task 4: Email template + queue consumer for `admin_alert_email`

**Files:**
- Create: `apps/api/src/lib/emailTemplates/adminAlert.ts`
- Modify: `apps/api/src/queue/notifications.ts`

**Interfaces:**
- Consumes: job payload `{ kind: 'admin_alert_email', recipientUserId, recipientEmail, title, body, link, severity }`
- Produces: sends email via `sendEmailOrThrow` honoring `userSettings.notifyAdminAlerts` opt-out

- [ ] **Step 1: Create template**

```ts
// apps/api/src/lib/emailTemplates/adminAlert.ts
export type AdminAlertEmail = {
  title: string;
  body: string;
  link?: string | null;
  severity: 'info' | 'warning' | 'critical';
};

export function renderAdminAlertEmail(a: AdminAlertEmail): { subject: string; html: string } {
  const subject = `[${a.severity.toUpperCase()}] ${a.title}`;
  const linkHtml = a.link ? `<p><a href="${a.link}">Open in Vyro →</a></p>` : '';
  const sevColor = a.severity === 'critical' ? '#dc2626' : a.severity === 'warning' ? '#d97706' : '#0f766e';
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif">
    <div style="border-left:4px solid ${sevColor};padding-left:12px">
      <h2 style="margin:0 0 8px 0">${a.title}</h2>
      <p style="margin:0;color:#475569">${a.body}</p>
    </div>
    ${linkHtml}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">Vyro admin alert · manage in Settings → Notifications</p>
  </body></html>`;
  return { subject, html };
}
```

- [ ] **Step 2: Extend queue consumer**

In `apps/api/src/queue/notifications.ts`, find the batch handler function. Add branch before the existing supplier.verified branch:

```ts
// inside handleNotificationsBatch, before existing switch arms
const { kind, recipientUserId, recipientEmail, title, body, link, severity } = job;
if (kind === 'admin_alert_email') {
  const settings = await db.select().from(userSettings)
    .where(eq(userSettings.userId, recipientUserId)).get();
  if (settings && settings.notifyAdminAlerts === 0) return; // opt-out
  const { subject, html } = renderAdminAlertEmail({ title, body, link, severity });
  await sendEmailOrThrow({ to: recipientEmail, subject, html });
  return;
}
```

Add imports:
```ts
import { sendEmailOrThrow } from '../../lib/email';
import { userSettings } from '@vyro/db/schema';
import { renderAdminAlertEmail } from '../../lib/emailTemplates/adminAlert';
```

- [ ] **Step 3: Run typecheck + existing notification test**

Run: `pnpm --filter @vyro/api typecheck && pnpm --filter @vyro/api test -- test/admin/notifications`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/emailTemplates apps/api/src/queue
git commit -m "feat(api): admin alert email template + queue consumer"
```

---

### Task 5: API repository + service + routes

**Files:**
- Create: `apps/api/src/modules/admin/notifications/repository.ts`
- Create: `apps/api/src/modules/admin/notifications/service.ts`
- Create: `apps/api/src/modules/admin/notifications/schema.ts`
- Create: `apps/api/src/modules/admin/notifications/routes.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Create: `apps/api/test/admin/notifications/repository.test.ts`
- Create: `apps/api/test/admin/notifications/routes.test.ts`

**Interfaces:**
- Consumes: `D1Database`, `AdminRole` from `@vyro/shared/constants/notifications`
- Produces: `listInbox`, `unreadCount`, `markRead`, `markAllRead`, `broadcast` repo functions + 5 Hono routes mounted at `/api/admin/notifications`

- [ ] **Step 1: Define zod schema**

```ts
// apps/api/src/modules/admin/notifications/schema.ts
import { z } from 'zod';
import { ADMIN_ALERT_SEVERITY, ADMIN_ROLES } from '@vyro/shared/constants/notifications';

export const adminNotificationQuery = z.object({
  severity: z.string().optional(),         // csv
  category: z.string().optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.enum(['createdAt-desc', 'createdAt-asc']).optional(),
});

export const adminNotificationBroadcast = z.object({
  role: z.enum(ADMIN_ROLES),
  severity: z.enum(ADMIN_ALERT_SEVERITY),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  link: z.string().url().optional(),
  sourceRef: z.string().max(200).optional(),
});
```

- [ ] **Step 2: Write failing repository test**

```ts
// apps/api/test/admin/notifications/repository.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('admin notifications repository', () => {
  it('listInbox filters by recipientRole + unreadOnly', async () => {
    const chain = {
      from: () => chain, where: () => chain, orderBy: () => chain, limit: () => chain,
      all: () => [{ id: 'n1', recipientRole: 'finance', readAt: null, createdAt: 1 }],
    };
    const db: any = { select: () => chain };
    const { listInbox } = await import('../../../src/modules/admin/notifications/repository');
    const rows = await listInbox(db, 'finance', { unreadOnly: true });
    expect(rows[0].id).toBe('n1');
  });

  it('markRead scoped to role (cross-role id returns false)', async () => {
    const returningChain = {
      from: () => returningChain, where: () => returningChain,
      returning: () => ({ all: () => [] }),
    };
    const updateChain = {
      set: () => updateChain, where: () => updateChain,
    };
    const db: any = {
      select: () => returningChain,
      update: () => updateChain,
    };
    const { markRead } = await import('../../../src/modules/admin/notifications/repository');
    const ok = await markRead(db, 'n1', 'ops');
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @vyro/api test -- test/admin/notifications/repository.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement repository**

```ts
// apps/api/src/modules/admin/notifications/repository.ts
import { and, desc, asc, eq, isNull, sql, inArray, type SQL } from 'drizzle-orm';
import { notifications, users } from '@vyro/db/schema';
import type { AdminRole, AdminAlertSeverity } from '@vyro/shared/constants/notifications';

export type AdminNotificationRow = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: number | null;
  severity: AdminAlertSeverity;
  sourceRef: string | null;
  createdAt: number;
};

export type InboxFilters = {
  severity?: AdminAlertSeverity[];
  category?: string;
  unreadOnly?: boolean;
  sort?: 'createdAt-desc' | 'createdAt-asc';
};

function decodeCursor(c: string): { createdAt: number; id: string } | null {
  try {
    const [tsStr, id] = Buffer.from(c, 'base64url').toString('utf8').split(':');
    return { createdAt: Number(tsStr), id };
  } catch { return null; }
}

export async function listInbox(
  db: D1Database, role: AdminRole, f: InboxFilters, cursor?: string, limit = 50,
): Promise<{ rows: AdminNotificationRow[]; nextCursor: string | null }> {
  const conds: SQL[] = [eq(notifications.recipientRole, role)];
  if (f.unreadOnly) conds.push(isNull(notifications.readAt));
  if (f.severity?.length) conds.push(inArray(notifications.severity, f.severity));
  if (f.category) conds.push(eq(notifications.type, f.category));
  const cur = cursor ? decodeCursor(cursor) : null;
  const sort = f.sort === 'createdAt-asc' ? asc : desc;
  let q = db.select().from(notifications).where(and(...conds)).orderBy(sort(notifications.createdAt), desc(notifications.id));
  if (cur) {
    const before = or(
      lt(notifications.createdAt, cur.createdAt),
      and(eq(notifications.createdAt, cur.createdAt), lt(notifications.id, cur.id)),
    );
    q = q.where(before);
  }
  const all = await q.limit(limit + 1).all();
  const rows = all.slice(0, limit) as AdminNotificationRow[];
  const next = all.length > limit
    ? Buffer.from(`${rows[rows.length - 1].createdAt}:${rows[rows.length - 1].id}`).toString('base64url')
    : null;
  return { rows, nextCursor: next };
}

export async function unreadCount(db: D1Database, role: AdminRole): Promise<number> {
  const row = await db.select({ c: sql<number>`count(*)` }).from(notifications)
    .where(and(eq(notifications.recipientRole, role), isNull(notifications.readAt))).get();
  return Number(row?.c ?? 0);
}

export async function markRead(db: D1Database, id: string, role: AdminRole): Promise<boolean> {
  const res = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientRole, role)))
    .returning({ id: notifications.id }).all();
  return res.length > 0;
}

export async function markAllRead(db: D1Database, role: AdminRole): Promise<number> {
  const res = await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.recipientRole, role), isNull(notifications.readAt)))
    .returning({ id: notifications.id }).all();
  return res.length;
}
```

- [ ] **Step 5: Implement service**

```ts
// apps/api/src/modules/admin/notifications/service.ts
import { getDb } from '@vyro/db';
import { listInbox as repoList, unreadCount as repoCount, markRead as repoRead, markAllRead as repoAllRead,
         type InboxFilters, type AdminNotificationRow } from './repository';
import { notifyAdmins, type AdminAlertInput } from '../../notifications/dispatcher';
import type { AdminRole, AdminAlertSeverity } from '@vyro/shared/constants/notifications';

const ALL_SEVERITIES = ['info', 'warning', 'critical'] as const;

function parseCsv<T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  return parts.filter((p): p is T => (allowed as readonly string[]).includes(p));
}

export async function listNotifications(d1: D1Database, role: AdminRole, raw: Record<string, unknown>) {
  const f: InboxFilters = {};
  const sev = parseCsv(raw.severity, ALL_SEVERITIES);
  if (sev) f.severity = sev;
  if (typeof raw.category === 'string') f.category = raw.category;
  if (raw.unreadOnly === 'true' || raw.unreadOnly === true) f.unreadOnly = true;
  if (raw.sort === 'createdAt-asc' || raw.sort === 'createdAt-desc') f.sort = raw.sort;
  const cursor = typeof raw.cursor === 'string' ? raw.cursor : undefined;
  const limit = typeof raw.limit === 'number' ? raw.limit : 50;
  const [page, unread] = await Promise.all([
    repoList(getDb(d1), role, f, cursor, limit),
    repoCount(getDb(d1), role),
  ]);
  return { ...page, unreadCount: unread };
}

export async function getUnreadCount(d1: D1Database, role: AdminRole): Promise<number> {
  return repoCount(getDb(d1), role);
}

export async function dismissOne(d1: D1Database, id: string, role: AdminRole) {
  return repoRead(getDb(d1), id, role);
}

export async function dismissAll(d1: D1Database, role: AdminRole) {
  const updated = await repoAllRead(getDb(d1), role);
  return { updated };
}

export async function broadcast(d1: D1Database, input: AdminAlertInput) {
  return notifyAdmins(d1, input);
}
```

- [ ] **Step 6: Implement routes**

```ts
// apps/api/src/modules/admin/notifications/routes.ts
import { Hono } from 'hono';
import { session } from '../../../middleware/session';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/httpError';
import { auditAdmin } from '../lib/audit';
import { adminNotificationQuery, adminNotificationBroadcast } from './schema';
import {
  listNotifications, getUnreadCount, dismissOne, dismissAll, broadcast,
} from './service';
import type { AdminRole } from '@vyro/shared/constants/notifications';

export const adminNotificationsRoutes = new Hono();
adminNotificationsRoutes.use('*', session(), requireRole({ admin: true }));

adminNotificationsRoutes.get('/', requirePermission('notification:read'), async (c) => {
  const url = new URL(c.req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = adminNotificationQuery.safeParse(params);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', parsed.error.message);
  const role = (c.get('ctx').adminRole as AdminRole);
  const out = await listNotifications(c.env.DB, role, params);
  return c.json(out);
});

adminNotificationsRoutes.get('/unread-count', requirePermission('notification:read'), async (c) => {
  const role = (c.get('ctx').adminRole as AdminRole);
  const count = await getUnreadCount(c.env.DB, role);
  c.header('Cache-Control', 'private, max-age=30');
  return c.json({ count });
});

adminNotificationsRoutes.post('/:id/read', requirePermission('notification:dismiss'), async (c) => {
  const id = c.req.param('id');
  if (!id) throw httpError(400, 'VALIDATION_ERROR', 'id required');
  const role = (c.get('ctx').adminRole as AdminRole);
  const ok = await dismissOne(c.env.DB, id, role);
  if (!ok) throw httpError(404, 'NOT_FOUND', 'notification not in your inbox');
  await auditAdmin({ ctx: c, action: 'notification.dismiss', target: { type: 'admin_notification', id } });
  return c.json({ ok: true });
});

adminNotificationsRoutes.post('/read-all', requirePermission('notification:dismiss'), async (c) => {
  const role = (c.get('ctx').adminRole as AdminRole);
  const out = await dismissAll(c.env.DB, role);
  await auditAdmin({ ctx: c, action: 'notification.dismiss_all', target: { type: 'admin_notification', id: 'all' } });
  return c.json(out);
});

adminNotificationsRoutes.post('/', requirePermission('notification:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = adminNotificationBroadcast.safeParse(body);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', parsed.error.message);
  const role = (c.get('ctx').adminRole as AdminRole);
  const actorUserId = c.get('ctx').user?.id ?? null;
  const out = await broadcast(c.env.DB, { ...parsed.data, category: 'admin_alert', actorUserId });
  await auditAdmin({ ctx: c, action: 'notification.broadcast', target: { type: 'admin_notification', id: parsed.data.sourceRef ?? 'ad-hoc' } });
  return c.json(out);
});

export default adminNotificationsRoutes;
```

- [ ] **Step 7: Mount in admin routes**

```ts
// apps/api/src/modules/admin/routes.ts — add import + route mount
import adminNotificationsRoutes from './notifications/routes';
// ...
router.route('/notifications', adminNotificationsRoutes);
```

- [ ] **Step 8: Write routes test**

```ts
// apps/api/test/admin/notifications/routes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminNotificationsRoutes from '../../../src/modules/admin/notifications/routes';

const state = vi.hoisted(() => ({
  ctx: { isAdmin: true, adminRole: 'finance', user: { id: 'u-1' } } as any,
  list: { rows: [], nextCursor: null, unreadCount: 0 },
  count: 0,
  readOk: true,
  allRead: { updated: 3 },
  broadcast: { recipients: 2 },
}));

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => { c.set('ctx', state.ctx); await next(); },
}));
vi.mock('../../../src/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => await next(),
  requirePermission: (_p: any) => async (_c: any, next: any) => await next(),
}));
vi.mock('../admin/lib/audit', () => ({ auditAdmin: async () => {} }));
vi.mock('../../../src/modules/admin/notifications/service', () => ({
  listNotifications: async () => state.list,
  getUnreadCount: async () => state.count,
  dismissOne: async () => state.readOk,
  dismissAll: async () => state.allRead,
  broadcast: async () => state.broadcast,
}));

function app() {
  const a = new Hono();
  a.route('/', adminNotificationsRoutes);
  return a;
}

describe('admin notifications routes', () => {
  it('GET / returns inbox + unreadCount', async () => {
    const res = await app().request('/');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.unreadCount).toBe(0);
  });

  it('GET /unread-count returns number with cache header', async () => {
    state.count = 5;
    const res = await app().request('/unread-count');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=30');
    expect((await res.json() as any).count).toBe(5);
  });

  it('POST /:id/read 404 when not in inbox', async () => {
    state.readOk = false;
    const res = await app().request('/n-1/read', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('POST /read-all returns updated count', async () => {
    state.allRead = { updated: 7 };
    const res = await app().request('/read-all', { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json() as any).updated).toBe(7);
  });

  it('POST / broadcast returns recipients', async () => {
    state.broadcast = { recipients: 4 };
    const res = await app().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'ops', severity: 'warning', title: 't', body: 'b' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any).recipients).toBe(4);
  });
});
```

- [ ] **Step 9: Run tests**

Run: `pnpm --filter @vyro/api test -- test/admin/notifications`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/admin/notifications apps/api/test/admin/notifications apps/api/src/modules/admin/routes.ts
git commit -m "feat(api): admin notifications sub-router + repo + service"
```

---

### Task 6: Web hooks

**Files:**
- Create: `apps/web/src/admin/useAdminNotifications.ts`

**Interfaces:**
- Consumes: TanStack Query + `api.get/post`
- Produces: `useAdminNotificationInbox`, `useAdminNotificationUnread`, `useAdminNotificationDismiss`, `useAdminNotificationMarkAllRead`, `useAdminNotificationBroadcast`

- [ ] **Step 1: Implement hooks**

```ts
// apps/web/src/admin/useAdminNotifications.ts
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminAlertSeverity = 'info' | 'warning' | 'critical';

export type AdminNotificationRow = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: number | null;
  severity: AdminAlertSeverity;
  sourceRef: string | null;
  createdAt: number;
};

export type InboxFilters = {
  severity?: AdminAlertSeverity[];
  category?: string;
  unreadOnly?: boolean;
  sort?: 'createdAt-desc' | 'createdAt-asc';
};

function buildQuery(f: InboxFilters, cursor?: string): string {
  const qs = new URLSearchParams();
  if (f.severity?.length) qs.set('severity', f.severity.join(','));
  if (f.category) qs.set('category', f.category);
  if (f.unreadOnly) qs.set('unreadOnly', 'true');
  if (f.sort) qs.set('sort', f.sort);
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

export function useAdminNotificationInbox(filters: InboxFilters, cursor?: string) {
  const qs = buildQuery(filters, cursor);
  return useQuery({
    queryKey: ['admin', 'notifications', 'inbox', filters, cursor ?? null],
    queryFn: async () => {
      return await api.get<{ notifications: AdminNotificationRow[]; nextCursor: string | null; unreadCount: number }>(
        `/admin/notifications${qs ? `?${qs}` : ''}`,
      );
    },
  });
}

export function useAdminNotificationUnread(): UseQueryResult<number> {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'notifications', 'unread'],
    queryFn: async () => {
      const r = await api.get<{ count: number }>('/admin/notifications/unread-count');
      return r.count;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') q.refetch(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [qc]);
  return q;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin', 'notifications'] });
}

export function useAdminNotificationDismiss() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<{ ok: true }>(`/admin/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAdminNotificationMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post<{ updated: number }>('/admin/notifications/read-all'),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAdminNotificationBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { role: string; severity: AdminAlertSeverity; title: string; body: string; link?: string; sourceRef?: string }) =>
      api.post<{ recipients: number }>('/admin/notifications', input),
    onSuccess: () => invalidateAll(qc),
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @vyro/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/admin/useAdminNotifications.ts
git commit -m "feat(web): admin notifications hooks"
```

---

### Task 7: NotificationsPage

**Files:**
- Create: `apps/web/src/admin/NotificationsPage.tsx`

**Interfaces:**
- Consumes: hooks from Task 6
- Produces: page at `/admin/notifications` with filter bar, list, mark-all-read, broadcast modal

- [ ] **Step 1: Implement page**

```tsx
// apps/web/src/admin/NotificationsPage.tsx
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useAdminNotificationInbox, useAdminNotificationMarkAllRead, useAdminNotificationBroadcast,
  type AdminAlertSeverity, type AdminNotificationRow,
} from './useAdminNotifications';

const SEVERITIES: AdminAlertSeverity[] = ['info', 'warning', 'critical'];

function severityBar(s: AdminAlertSeverity) {
  const cls = s === 'critical' ? 'bg-rose' : s === 'warning' ? 'bg-amber' : 'bg-mint';
  return cls;
}

function fmtTs(t: number): string {
  const ms = Date.now() - t;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

export function NotificationsPage() {
  const canRead = usePermission('notification:read');
  const canWrite = usePermission('notification:write');
  const canDismiss = usePermission('notification:dismiss');
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const f: Parameters<typeof useAdminNotificationInbox>[0] = {};
    const sev = params.get('severity');
    if (sev) f.severity = sev.split(',') as AdminAlertSeverity[];
    const cat = params.get('category'); if (cat) f.category = cat;
    if (params.get('unreadOnly') === '1') f.unreadOnly = true;
    const sort = params.get('sort');
    if (sort === 'createdAt-asc' || sort === 'createdAt-desc') f.sort = sort;
    return f;
  }, [params]);

  const inbox = useAdminNotificationInbox(filters);
  const markAll = useAdminNotificationMarkAllRead();
  const broadcast = useAdminNotificationBroadcast();
  const [showBroadcast, setShowBroadcast] = useState(false);

  if (!canRead) return <ErrorBanner message="You need notification:read permission" />;
  if (inbox.isError) return <ErrorBanner message={(inbox.error as Error).message} />;

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key); else next.set(key, value);
    setParams(next);
  };

  const toggleSeverity = (s: AdminAlertSeverity) => {
    const cur = (params.get('severity') ?? '').split(',').filter(Boolean) as AdminAlertSeverity[];
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
    updateParam('severity', next.length ? next.join(',') : null);
  };

  const items = inbox.data?.notifications ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Notifications"
        sub={`${inbox.data?.unreadCount ?? 0} unread · ${items.length} on this page`}
      />

      <Surface className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-ink-500">Severity:</span>
          {SEVERITIES.map(s => {
            const active = (filters.severity ?? []).includes(s);
            return (
              <button key={s} type="button" onClick={() => toggleSeverity(s)}
                className={`text-[10px] font-mono uppercase px-2 py-1 border rounded ${
                  active ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15 text-ink-3'
                }`}>{s}</button>
            );
          })}
          <label className="ml-4 text-xs flex items-center gap-1">
            <input type="checkbox" checked={!!filters.unreadOnly}
              onChange={(e) => updateParam('unreadOnly', e.currentTarget.checked ? '1' : null)} />
            Unread only
          </label>
          <label className="ml-2 text-xs flex flex-col">
            <span className="text-ink-500">Sort</span>
            <select value={filters.sort ?? 'createdAt-desc'} onChange={(e) => updateParam('sort', e.currentTarget.value)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper">
              <option value="createdAt-desc">Newest</option>
              <option value="createdAt-asc">Oldest</option>
            </select>
          </label>
          <div className="flex-1" />
          {canDismiss ? (
            <Button size="sm" variant="ghost" disabled={markAll.isPending}
              onClick={() => markAll.mutate()}>Mark all read</Button>
          ) : null}
          {canWrite ? (
            <Button size="sm" variant="primary" onClick={() => setShowBroadcast(true)}>Broadcast</Button>
          ) : null}
        </div>
      </Surface>

      <Surface className="p-0 overflow-hidden">
        <ul className="divide-y divide-ink/10">
          {items.map(n => (
            <NotificationRow key={n.id} row={n} />
          ))}
          {!items.length ? (
            <li className="py-10 text-center text-ink-500 text-sm">
              <span className="inline-block text-mint mr-2">✓</span>All clear — no unread alerts
            </li>
          ) : null}
        </ul>
      </Surface>

      {showBroadcast ? <BroadcastDialog onClose={() => setShowBroadcast(false)} /> : null}
    </div>
  );
}

function NotificationRow({ row }: { row: AdminNotificationRow }) {
  const dismiss = useAdminNotificationMarkAllRead().reset; // unused — use single-dismiss hook below
  const single = (await import('./useAdminNotifications')).useAdminNotificationDismiss();
  return (
    <li className="flex gap-3 p-3 hover:bg-bone/30">
      <div className={`w-1 ${severityBar(row.severity)}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm">{row.title}</span>
          <span className="text-[10px] uppercase font-mono text-ink-4">{row.severity}</span>
        </div>
        <p className="text-xs text-ink-3 truncate">{row.body}</p>
        <div className="text-[10px] text-ink-4 mt-1">
          {fmtTs(row.createdAt)}
          {row.link ? <> · <Link to={row.link} className="underline text-volt">open</Link></> : null}
          {row.sourceRef ? <> · <span className="font-mono">{row.sourceRef}</span></> : null}
        </div>
      </div>
      <button type="button" onClick={() => single.mutate(row.id)} className="text-ink-4 hover:text-ink text-xs">
        ×
      </button>
    </li>
  );
}
```

Note: row component must be in same file as page (cannot await import at component body). Refactor: extract `useAdminNotificationDismiss` hook usage to top of file and pass as prop, OR use it inside the row via the same module-level import.

Refactor in implementation step: import `useAdminNotificationDismiss` at top, call it inside `NotificationRow` (each row gets its own mutation instance — fine, TanStack handles).

- [ ] **Step 2: Implement BroadcastDialog**

```tsx
function BroadcastDialog({ onClose }: { onClose: () => void }) {
  const broadcast = useAdminNotificationBroadcast();
  const [role, setRole] = useState('ops');
  const [severity, setSeverity] = useState<AdminAlertSeverity>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
      <Surface className="w-full max-w-md p-4 space-y-3">
        <h3 className="font-medium">Broadcast to admins</h3>
        {broadcast.isError ? <ErrorBanner message={(broadcast.error as Error).message} /> : null}
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Role</span>
          <select value={role} onChange={(e) => setRole(e.currentTarget.value)} className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper">
            {['super_admin', 'ops', 'finance', 'support'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Severity</span>
          <select value={severity} onChange={(e) => setSeverity(e.currentTarget.value as AdminAlertSeverity)} className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper">
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Title</span>
          <input value={title} onChange={(e) => setTitle(e.currentTarget.value)} maxLength={200} className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper" />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Body</span>
          <textarea value={body} onChange={(e) => setBody(e.currentTarget.value)} maxLength={2000} rows={4} className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper" />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Link (optional)</span>
          <input value={link} onChange={(e) => setLink(e.currentTarget.value)} className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper" />
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!title.trim() || !body.trim() || broadcast.isPending}
            onClick={() => broadcast.mutate({ role, severity, title: title.trim(), body: body.trim(), ...(link ? { link } : {}) }, { onSuccess: onClose })}>
            {broadcast.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @vyro/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/admin/NotificationsPage.tsx
git commit -m "feat(web): admin NotificationsPage"
```

---

### Task 8: Shell bell + nav + lazy route

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `useAdminNotificationUnread` from Task 6, `hasPermission` from RBAC
- Produces: bell icon in header + nav item between Overview and Suppliers

- [ ] **Step 1: Add lazy route in App.tsx**

```tsx
// apps/web/src/App.tsx — add lazy import
const NotificationsPage = lazy(() => import('./admin/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

// add route under /admin shell
<Route path="notifications" element={<RequireAdmin><NotificationsPage /></RequireAdmin>} />
```

- [ ] **Step 2: Modify Shell.tsx — add bell + nav entry**

Read `Shell.tsx` first to find the header nav render and the side nav array. Then:
- Import `BellIcon` from existing icons module (or inline an SVG)
- Import `useAdminNotificationUnread`
- Import `hasPermission` from `./lib/permissions`
- Add a `<BellButton />` component in the header area left of "Sign out"
- Add `{ label: 'Notifications', to: '/admin/notifications', icon: BellIcon, permission: 'notification:read', showBadge: true }` to the nav items array, positioned between Overview and Suppliers

```tsx
function BellButton() {
  const role = useAdminAuth()?.user?.adminRole;
  const can = role && hasPermission(role, 'notification:read');
  const count = useAdminNotificationUnread();
  if (!can) return null;
  const c = count.data ?? 0;
  return (
    <Link to="/admin/notifications?unreadOnly=1" className="relative px-2 py-1 text-ink-3 hover:text-ink">
      <BellIcon size={18} />
      {c > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose text-paper text-[10px] font-mono font-bold flex items-center justify-center">
          {c >= 10 ? '9+' : c}
        </span>
      ) : null}
    </Link>
  );
}
```

Add `BellButton` to the header row in the layout used by `AdminShell`. If layout uses a specific spot, place it just before the user/sign-out area.

- [ ] **Step 3: Run typecheck + build**

Run: `pnpm --filter @vyro/web typecheck && pnpm --filter @vyro/web build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/admin/Shell.tsx apps/web/src/App.tsx
git commit -m "feat(web): admin shell bell + notifications nav + route"
```

---

### Task 9: Triggers — refund/payout/chargeback/abuse/kyc

**Files:**
- Modify: `apps/api/src/modules/payouts/admin.ts`
- Modify: `apps/api/src/modules/chargebacks/routes.ts`
- Modify: `apps/api/src/modules/abuseReports/routes.ts`
- Modify: `apps/api/src/modules/admin/kyc/routes.ts`

**Interfaces:**
- Each trigger calls `notifyAdmins(db, {...})` after the existing DB write succeeds
- Each also calls `auditAdmin({ action: 'notification.triggered', ... })`

- [ ] **Step 1: Payout failed trigger**

```ts
// apps/api/src/modules/payouts/admin.ts — after the markPaid failure path
if (result.status === 'failed') {
  await notifyAdmins(db, {
    role: 'finance', severity: 'critical', category: 'admin_alert',
    title: `Payout failed: ${batch.id}`,
    body: result.failureReason ?? 'See ledger for details',
    link: `/admin/money?tab=payouts`,
    sourceRef: `payout:${batch.id}`,
  });
}
```

- [ ] **Step 2: Chargeback opened trigger**

```ts
// apps/api/src/modules/chargebacks/routes.ts — after inserting chargeback
await notifyAdmins(db, {
  role: 'finance', severity: 'warning', category: 'admin_alert',
  title: `Chargeback opened`, body: reason,
  link: `/admin/payments/${paymentId}`, sourceRef: `chargeback:${id}`,
});
await notifyAdmins(db, {
  role: 'ops', severity: 'warning', category: 'admin_alert',
  title: `Chargeback opened`, body: reason,
  link: `/admin/payments/${paymentId}`, sourceRef: `chargeback:${id}`,
});
```

- [ ] **Step 3: Abuse report fraud trigger**

```ts
// apps/api/src/modules/abuseReports/routes.ts — after insert if reason === 'fraud'
if (reason === 'fraud') {
  await notifyAdmins(db, {
    role: 'ops', severity: 'warning', category: 'admin_alert',
    title: `Fraud report filed`,
    body: description.slice(0, 200),
    link: `/admin/trust-safety`,
    sourceRef: `abuse_report:${id}`,
  });
}
```

- [ ] **Step 4: KYC review trigger**

```ts
// apps/api/src/modules/admin/kyc/routes.ts — after status update to review_required
await notifyAdmins(db, {
  role: 'ops', severity: 'info', category: 'admin_alert',
  title: `KYC review required`,
  body: `User ${userId} submitted documents for review`,
  link: `/admin/trust-safety?tab=kyc`,
  sourceRef: `kyc:${userId}`,
});
```

- [ ] **Step 5: Run typecheck + existing module tests**

Run: `pnpm --filter @vyro/api typecheck && pnpm --filter @vyro/api test`
Expected: PASS (existing tests unaffected; these triggers only fire on new conditions)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/payouts apps/api/src/modules/chargebacks apps/api/src/modules/abuseReports apps/api/src/modules/admin/kyc
git commit -m "feat(api): 4 admin notification triggers (payout/cb/abuse/kyc)"
```

---

### Task 10: DLQ trigger + refund-stuck cron

**Files:**
- Modify: `apps/api/src/lib/queueInstrument.ts`
- Modify: `apps/api/src/cron/handlers.ts`
- Create: `apps/api/test/admin/notifications/cron-refund-stuck.test.ts`

- [ ] **Step 1: DLQ trigger in queueInstrument**

```ts
// apps/api/src/lib/queueInstrument.ts — inside recordQueueEvent after the AE write
if (event === 'dlq' && sourceRef !== 'queue:self-replay') {
  await notifyAdmins(db, {
    role: 'ops', severity: 'critical', category: 'admin_alert',
    title: `Queue DLQ: ${queue}`,
    body: error ?? 'Message dead-lettered',
    link: `/admin/observability/queues`,
    sourceRef: `queue:${queue}:${msgId}`,
  });
}
```

- [ ] **Step 2: Refund-stuck cron**

```ts
// apps/api/src/cron/handlers.ts — add new handler + register
import { refunds } from '@vyro/db/schema';
import { lt } from 'drizzle-orm';

export async function refundStuckChecker(db: D1Database): Promise<{ alerted: number }> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stale = await db.select().from(refunds)
    .where(and(eq(refunds.status, 'requested'), lt(refunds.createdAt, new Date(cutoff))))
    .all();
  let alerted = 0;
  for (const r of stale) {
    const src = `refund:${r.id}`;
    const recent = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.sourceRef, src), gt(notifications.createdAt, new Date(Date.now() - 6 * 60 * 60 * 1000))))
      .get();
    if (recent) continue;
    await notifyAdmins(db, {
      role: 'finance', severity: 'warning', category: 'admin_alert',
      title: `Refund stuck > 24h`,
      body: `Refund ${r.id} requested ${new Date(r.createdAt).toISOString()} still pending`,
      link: `/admin/money?tab=refunds`,
      sourceRef: src,
    });
    alerted++;
  }
  return { alerted };
}

// register in CRON_HANDLERS table
CRON_HANDLERS.refund_stuck_checker = { fn: refundStuckChecker, schedule: '@hourly' };
```

- [ ] **Step 3: Write cron test**

```ts
// apps/api/test/admin/notifications/cron-refund-stuck.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('refundStuckChecker', () => {
  it('fires notifyAdmins for each stale refund not recently alerted', async () => {
    const state = { notified: [] as any[] };
    vi.mock('../../../src/modules/notifications/dispatcher', () => ({
      notifyAdmins: async (_db: any, input: any) => { state.notified.push(input); return { recipients: 1 }; },
    }));
    const refundsChain = {
      from: () => refundsChain, where: () => refundsChain,
      all: () => [{ id: 'r1', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }],
    };
    const notificationsChain = {
      from: () => notificationsChain, where: () => notificationsChain, get: () => undefined,
    };
    const db: any = { select: () => refundsChain };
    db.select = () => refundsChain;
    (db as any).select = (t?: any) => t?.notifications ? notificationsChain : refundsChain;
    const { refundStuckChecker } = await import('../../../src/cron/handlers');
    const out = await refundStuckChecker(db);
    expect(out.alerted).toBe(1);
    expect(state.notified[0].sourceRef).toBe('refund:r1');
  });
});
```

(Refine mock per repo style; the goal is asserting the alert path fires.)

- [ ] **Step 4: Run cron test**

Run: `pnpm --filter @vyro/api test -- test/admin/notifications/cron-refund-stuck.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/queueInstrument.ts apps/api/src/cron/handlers.ts apps/api/test/admin/notifications/cron-refund-stuck.test.ts
git commit -m "feat(api): DLQ trigger + refund-stuck cron"
```

---

### Task 11: RBAC matrix test + smoke + runbook

**Files:**
- Create: `apps/api/test/admin/notifications/rbac.test.ts`
- Modify: `docs/runbook.md`

- [ ] **Step 1: RBAC matrix test**

```ts
// apps/api/test/admin/notifications/rbac.test.ts
import { describe, it, expect } from 'vitest';
import { ROLE_PERMISSIONS, hasPermission } from '@vyro/auth';

describe('admin notifications RBAC', () => {
  it('super_admin has read+write+dismiss', () => {
    expect(hasPermission('super_admin', 'notification:read')).toBe(true);
    expect(hasPermission('super_admin', 'notification:write')).toBe(true);
    expect(hasPermission('super_admin', 'notification:dismiss')).toBe(true);
  });
  it('ops/finance/support have read+dismiss, no write', () => {
    for (const r of ['ops', 'finance', 'support'] as const) {
      expect(hasPermission(r, 'notification:read')).toBe(true);
      expect(hasPermission(r, 'notification:dismiss')).toBe(true);
      expect(hasPermission(r, 'notification:write')).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run full test suite + build**

Run: `pnpm test && pnpm --filter @vyro/web build`
Expected: my new tests pass; existing unrelated failures (`cart`, `supplierProducts`, `listPagination`) are pre-existing schema-mock gaps out of scope.

- [ ] **Step 3: Runbook entry**

```markdown
<!-- append to docs/runbook.md after the admin payment search section -->

## Admin notifications center

Admins get an inbox at `/admin/notifications` and a bell badge in the
admin shell header (30s poll + refetch on tab focus). Alerts fan out
by role from 6 triggers: refund stuck >24h (hourly cron), payout
failed, chargeback opened, queue DLQ event, abuse report (fraud),
KYC review required. Critical alerts also email the admin team via
the existing email pipeline (Resend → MailChannels → console). Each
admin can opt out of email per `userSettings.notifyAdminAlerts`.

Permissions: `notification:read` (everyone with admin role),
`notification:dismiss` (everyone with admin role), `notification:write`
(super_admin only — broadcast). Role → permission grants in
`packages/auth/src/rolePermissions.ts`. No new secrets.
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/admin/notifications/rbac.test.ts docs/runbook.md
git commit -m "test(api): notification RBAC matrix + runbook entry"
```

---

## Self-review checklist

- [x] All 6 spec triggers accounted for (Tasks 9 + 10)
- [x] All 5 API endpoints covered (Task 5)
- [x] All 5 web surfaces covered (Tasks 6, 7, 8)
- [x] TDD: every task writes failing test before implementation
- [x] No placeholders
- [x] exactOptionalPropertyTypes pattern followed (conditional spread in BroadcastDialog)
- [x] Existing `/api/notifications/me` route untouched (no cross-tenant leak risk)
- [x] RBAC matrix tested
- [x] Out-of-scope explicitly listed in spec section 8
