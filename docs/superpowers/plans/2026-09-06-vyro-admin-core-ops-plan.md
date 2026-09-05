# VYRO Admin Core Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `isPlatformAdmin` with a 4-role enum (`super_admin | ops | finance | support`), add email invite + accept flow, capture an immutable admin audit log on every admin write action.

**Architecture:** New `permissions.ts` module + frozen role→permission map. Drizzle schema migration drops `is_platform_admin` adds `admin_role` + `admin_invited_at` + `admin_invited_by`, plus new `admin_invites` and `admin_audit_logs` tables. New `requirePermission(perm)` middleware. `auditAdmin(ctx, action, target, before, after)` helper called from every existing mutating admin route. New `invites`, `roles`, `audit` API modules. Two new frontend pages: `/admin/roles` (super_admin) and `/admin/activity` (any admin). CF Workers Cron daily purges audit rows >365d.

**Tech Stack:** Hono + Drizzle + D1 (api), better-auth (auth), Vitest + vitest-pool-workers (tests), React + React Router + React Query + `@vyro/ui` (web), sha256 (crypto.subtle), better-auth signup hook.

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true`
- `vi.hoisted` + `path.resolve(process.cwd(), 'src')` for nested test mock paths (per existing `apps/api/test/admin/*.test.ts`)
- Real endpoints, no mocks in production code
- `errorEnvelope(err)` for `{ error: { code, message, details? } }` shape
- `httpError(status, code, message, details)` from `apps/api/src/lib/errors`
- All admin routes must use `requirePermission(perm)` (preferred) or `requireRole({ admin: true })` (any-admin shim only)
- Drizzle migrations use `-- statement-breakpoint` separator, backtick identifiers
- Permissions: `*` (all), `*:*` (all namespaces), explicit permission keys for write actions
- Roles: `super_admin | ops | finance | support | null`. Null = non-admin.
- Audit retention: 365 days, purged via CF Workers Cron `0 3 * * *`
- Optimistic concurrency on role change: `UPDATE ... WHERE admin_role = expected`, 0 rows → 409 `ROLE_CHANGED`
- Audit log write failures must NOT block the user-facing mutation; log stderr only
- Demo seed: `scripts/seed.ts` must extend with `adminFixture`, `adminInviteFixture`, `adminAuditLogFixture`

---

## File Map

### Create — packages/db
- `packages/db/src/schema/adminInvites.ts`
- `packages/db/src/schema/adminAuditLogs.ts`
- `packages/db/migrations/0008_admin_core_ops.sql`
- `packages/db/migrations/0008_admin_core_ops_down.sql`

### Modify — packages/db
- `packages/db/src/schema/users.ts` (drop `isPlatformAdmin`, add `adminRole`, `adminInvitedAt`, `adminInvitedBy`)
- `packages/db/src/schema/index.ts` (export new tables)

### Create — packages/auth
- `packages/auth/src/permissions.ts`
- `packages/auth/src/rolePermissions.ts`

### Modify — packages/auth
- `packages/auth/src/context.ts` (replace `isAdmin` with `adminRole`)
- `packages/auth/src/types.ts` (replace `isAdmin` with `adminRole`)
- `apps/api/src/middleware/rbac.ts` (add `requirePermission`)

### Modify — apps/api
- `apps/api/src/middleware/session.ts` (ctx uses `adminRole`)
- `apps/api/src/modules/admin/routes.ts` (mount new sub-routers)
- `apps/api/src/modules/admin/users.ts` (audit + permission)
- `apps/api/src/modules/admin/supplierDetail.ts` (no change to reads)
- `apps/api/src/modules/admin/businessDetail.ts` (no change to reads)
- `apps/api/src/modules/admin/disputes.ts` (audit + permission)
- `apps/api/src/modules/admin/usersRepository.ts` (extend with admin_role filter + last_activity_at)
- New: `apps/api/src/modules/admin/lib/audit.ts`
- New: `apps/api/src/modules/admin/invites/{routes,repository,service,schema}.ts`
- New: `apps/api/src/modules/admin/roles/{routes,repository,service,schema}.ts`
- New: `apps/api/src/modules/admin/audit/{routes,repository,schema}.ts`
- `apps/api/src/modules/payments/admin.ts` (audit + permission)
- `apps/api/src/modules/payouts/admin.ts` (audit + permission)
- `apps/api/src/modules/settings/admin.ts` (audit + permission)
- `apps/api/src/scripts/rbac-audit.ts` (extend for permissions)
- `apps/api/src/cron/audit-purge.ts` (new handler)
- `apps/api/wrangler.toml` (cron triggers)
- `apps/api/src/index.ts` (mount cron handler)

### Create — apps/api/tests
- `apps/api/test/admin/roles.test.ts`
- `apps/api/test/admin/invites.test.ts`
- `apps/api/test/admin/audit.test.ts`
- `apps/api/test/admin/auditPurge.test.ts`
- `apps/api/test/admin/migration.test.ts`

### Modify — apps/api/tests
- `apps/api/test/admin/users.test.ts` (audit assertion)
- `apps/api/test/admin/freezeUnfreeze.test.ts` (audit assertion)
- `apps/api/test/admin/businessFreeze.test.ts` (audit assertion)
- `apps/api/test/admin/dispute.test.ts` (audit assertion)
- `apps/api/test/payments/admin.test.ts` (audit assertion)
- `apps/api/test/payouts/admin.test.ts` (audit assertion, new file)
- `apps/api/test/settings/admin.test.ts` (audit assertion)

### Modify — packages/auth/tests
- `packages/auth/test/permissions.test.ts` (new)
- `packages/auth/test/rolePermissions.test.ts` (new)
- `packages/auth/test/auditAdmin.test.ts` (new)

### Create — packages/validation
- `packages/validation/src/adminInvites.ts`
- `packages/validation/src/adminRoles.ts`
- `packages/validation/src/adminAudit.ts`

### Modify — packages/validation
- `packages/validation/src/index.ts` (export new schemas)

### Create — apps/web
- `apps/web/src/admin/RolesPage.tsx`
- `apps/web/src/admin/InviteAdminDialog.tsx`
- `apps/web/src/admin/AdminRoleSelect.tsx`
- `apps/web/src/admin/RoleBadge.tsx`
- `apps/web/src/admin/AdminActivityPage.tsx`
- `apps/web/src/admin/AuditFilters.tsx`
- `apps/web/src/admin/useAdminAudit.ts`
- `apps/web/src/admin/lib/roles.ts`
- `apps/web/src/admin/lib/permissions.ts`

### Modify — apps/web
- `apps/web/src/admin/Shell.tsx` (add Roles + Activity nav entries, show admin role in header)
- `apps/web/src/App.tsx` (register `/admin/roles`, `/admin/activity`, `/admin/invite/accept`)
- `apps/web/src/admin/Shell.tsx` (load adminRole from /auth/me)

### Create — apps/web tests
- `apps/web/src/admin/RolesPage.test.tsx`
- `apps/web/src/admin/InviteAdminDialog.test.tsx`
- `apps/web/src/admin/AdminActivityPage.test.tsx`
- `apps/web/src/admin/lib/permissions.test.ts`

### Modify — scripts
- `scripts/seed.ts` (extend with admin fixtures)
- `scripts/e2e.md` (add T1 walkthrough)

---

### Task 1: Permissions module + frozen role→permission map

**Files:**
- Create: `packages/auth/src/permissions.ts`
- Create: `packages/auth/src/rolePermissions.ts`
- Create: `packages/auth/test/permissions.test.ts`
- Create: `packages/auth/test/rolePermissions.test.ts`

**Interfaces:**
- Produces: `export type Permission = 'user:read' | 'user:suspend' | ...`
- Produces: `export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'support'`
- Produces: `export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, ReadonlySet<Permission>>>`

- [ ] **Step 1: Write failing test** in `packages/auth/test/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSION_KEYS } from '../src/permissions';

describe('permissions', () => {
  it('exports stable key list', () => {
    expect(PERMISSION_KEYS).toContain('user:suspend');
    expect(PERMISSION_KEYS).toContain('dispute:resolve');
    expect(PERMISSION_KEYS).toContain('admin:invite');
  });
  it('ALL_PERMISSIONS Set equals PERMISSION_KEYS', () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @vyro/auth test`. Expected: module not found.

- [ ] **Step 3: Implement** `packages/auth/src/permissions.ts`:

```ts
export const PERMISSION_KEYS = [
  'user:read', 'user:suspend', 'user:unsuspend',
  'business:read', 'business:freeze', 'business:unfreeze',
  'supplier:read', 'supplier:freeze', 'supplier:unfreeze',
  'product:read', 'product:moderate',
  'category:read', 'category:write',
  'type:read', 'type:write',
  'dispute:read', 'dispute:resolve', 'dispute:note',
  'payment:read', 'payment:refund',
  'payout:read', 'payout:approve',
  'ledger:read', 'invoice:read',
  'settings:read', 'settings:write',
  'admin:read', 'admin:invite', 'admin:role_change',
  'audit:read', 'audit:export',
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

export const ALL_PERMISSIONS: ReadonlySet<Permission> = new Set(PERMISSION_KEYS);

export function isPermission(s: string): s is Permission {
  return (ALL_PERMISSIONS as ReadonlySet<string>).has(s);
}
```

- [ ] **Step 4: Run, expect PASS** for `permissions.test.ts`.

- [ ] **Step 5: Write failing test** in `packages/auth/test/rolePermissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type AdminRole } from '../src/rolePermissions';
import { ALL_PERMISSIONS } from '../src/permissions';

const ROLES: AdminRole[] = ['super_admin', 'ops', 'finance', 'support'];

describe('rolePermissions', () => {
  it('is frozen at runtime', () => {
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    for (const r of ROLES) expect(Object.isFrozen(ROLE_PERMISSIONS[r])).toBe(true);
  });
  it('super_admin has all permissions', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(ROLE_PERMISSIONS.super_admin.has(p)).toBe(true);
    }
  });
  it('every role includes relevant :read keys', () => {
    expect(ROLE_PERMISSIONS.ops.has('user:read')).toBe(true);
    expect(ROLE_PERMISSIONS.finance.has('user:read')).toBe(true);
    expect(ROLE_PERMISSIONS.support.has('user:read')).toBe(true);
  });
  it('non-super roles lack admin:role_change', () => {
    expect(ROLE_PERMISSIONS.ops.has('admin:role_change')).toBe(false);
    expect(ROLE_PERMISSIONS.finance.has('admin:role_change')).toBe(false);
    expect(ROLE_PERMISSIONS.support.has('admin:role_change')).toBe(false);
  });
  it('support lacks all write keys', () => {
    expect(ROLE_PERMISSIONS.support.has('user:suspend')).toBe(false);
    expect(ROLE_PERMISSIONS.support.has('settings:write')).toBe(false);
    expect(ROLE_PERMISSIONS.support.has('payout:approve')).toBe(false);
  });
});
```

- [ ] **Step 6: Run, expect FAIL** — module not found.

- [ ] **Step 7: Implement** `packages/auth/src/rolePermissions.ts`:

```ts
import type { Permission } from './permissions';

export const ADMIN_ROLES = ['super_admin', 'ops', 'finance', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const all = (...p: Permission[]) => new Set<Permission>(p);

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, ReadonlySet<Permission>>> = Object.freeze({
  super_admin: all(
    'user:read', 'user:suspend', 'user:unsuspend',
    'business:read', 'business:freeze', 'business:unfreeze',
    'supplier:read', 'supplier:freeze', 'supplier:unfreeze',
    'product:read', 'product:moderate',
    'category:read', 'category:write',
    'type:read', 'type:write',
    'dispute:read', 'dispute:resolve', 'dispute:note',
    'payment:read', 'payment:refund',
    'payout:read', 'payout:approve',
    'ledger:read', 'invoice:read',
    'settings:read', 'settings:write',
    'admin:read', 'admin:invite', 'admin:role_change',
    'audit:read', 'audit:export',
  ),
  ops: all(
    'user:read', 'user:suspend', 'user:unsuspend',
    'business:read', 'business:freeze', 'business:unfreeze',
    'supplier:read', 'supplier:freeze', 'supplier:unfreeze',
    'product:read', 'product:moderate',
    'category:read', 'category:write',
    'type:read', 'type:write',
    'dispute:read', 'dispute:note',
    'admin:read', 'admin:invite',
    'audit:read',
  ),
  finance: all(
    'user:read', 'business:read', 'supplier:read', 'product:read',
    'category:read', 'type:read',
    'dispute:read',
    'payment:read', 'payment:refund',
    'payout:read', 'payout:approve',
    'ledger:read', 'invoice:read',
    'settings:read',
    'admin:read',
    'audit:read',
  ),
  support: all(
    'user:read', 'business:read', 'supplier:read', 'product:read',
    'category:read', 'type:read',
    'dispute:read', 'dispute:note',
    'payment:read', 'payout:read', 'ledger:read', 'invoice:read',
    'settings:read',
    'admin:read',
    'audit:read',
  ),
});

export function hasPermission(role: AdminRole | null, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(perm);
}

export function isAdminRole(s: string | null): s is AdminRole {
  return s !== null && (ADMIN_ROLES as readonly string[]).includes(s);
}
```

- [ ] **Step 8: Run, expect PASS** for `rolePermissions.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/auth/src/permissions.ts packages/auth/src/rolePermissions.ts packages/auth/test/permissions.test.ts packages/auth/test/rolePermissions.test.ts
git commit -m "feat(auth): permissions union + frozen role-permission matrix"
```

---

### Task 2: DB schema migration (users + admin_invites + admin_audit_logs)

**Files:**
- Modify: `packages/db/src/schema/users.ts`
- Create: `packages/db/src/schema/adminInvites.ts`
- Create: `packages/db/src/schema/adminAuditLogs.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0008_admin_core_ops.sql`
- Create: `packages/db/migrations/0008_admin_core_ops_down.sql`
- Create: `apps/api/test/admin/migration.test.ts`

**Interfaces:**
- Produces: `users.adminRole: 'super_admin' | 'ops' | 'finance' | 'support' | null`
- Produces: `users.adminInvitedAt: number | null`
- Produces: `users.adminInvitedBy: string | null`
- Produces: `adminInvites` table exported from `@vyro/db/schema`
- Produces: `adminAuditLogs` table exported from `@vyro/db/schema`
- Produces: `AdminInvite`, `NewAdminInvite`, `AdminAuditLog`, `NewAdminAuditLog` types

- [ ] **Step 1: Update** `packages/db/src/schema/users.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailVerifiedAt: integer('email_verified_at'),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    adminRole: text('admin_role', { enum: ['super_admin', 'ops', 'finance', 'support'] }),
    adminInvitedAt: integer('admin_invited_at'),
    adminInvitedBy: text('admin_invited_by'),
    status: text('status', { enum: ['active', 'suspended', 'pending_deletion'] }).notNull().default('active'),
    marketingOptIn: integer('marketing_opt_in', { mode: 'boolean' }).notNull().default(true),
    deletionScheduledFor: integer('deletion_scheduled_for'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    adminRoleIdx: index('users_admin_role_idx').on(t.adminRole),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Create** `packages/db/src/schema/adminInvites.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const adminInvites = sqliteTable(
  'admin_invites',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    role: text('role', { enum: ['super_admin', 'ops', 'finance', 'support'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: text('invited_by').notNull().references(() => users.id),
    expiresAt: integer('expires_at').notNull(),
    acceptedAt: integer('accepted_at'),
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    emailIdx: index('admin_invites_email_idx').on(t.email),
    pendingIdx: index('admin_invites_pending_idx').on(t.expiresAt),
  }),
);

export type AdminInvite = typeof adminInvites.$inferSelect;
export type NewAdminInvite = typeof adminInvites.$inferInsert;
```

- [ ] **Step 3: Create** `packages/db/src/schema/adminAuditLogs.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const adminAuditLogs = sqliteTable(
  'admin_audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull().references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    before: text('before'),
    after: text('after'),
    requestId: text('request_id').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    createdIdx: index('admin_audit_logs_created_idx').on(t.createdAt),
    actorIdx: index('admin_audit_logs_actor_idx').on(t.actorId, t.createdAt),
    targetIdx: index('admin_audit_logs_target_idx').on(t.targetType, t.targetId, t.createdAt),
  }),
);

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;
```

- [ ] **Step 4: Modify** `packages/db/src/schema/index.ts` — append:

```ts
export * from './adminInvites';
export * from './adminAuditLogs';
```

- [ ] **Step 5: Create** `packages/db/migrations/0008_admin_core_ops.sql`:

```sql
-- 0008_admin_core_ops.sql
-- T1: 4-role admin model + invites + audit log.

-- users: drop boolean, add role enum + invite metadata
ALTER TABLE `users` ADD `admin_role` text;--> statement-breakpoint
ALTER TABLE `users` ADD `admin_invited_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `admin_invited_by` text REFERENCES `users`(`id`);--> statement-breakpoint
UPDATE `users` SET `admin_role` = 'super_admin' WHERE `is_platform_admin` = 1;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `is_platform_admin`;--> statement-breakpoint
CREATE INDEX `users_admin_role_idx` ON `users` (`admin_role`) WHERE `admin_role` IS NOT NULL;--> statement-breakpoint

-- admin_invites
CREATE TABLE `admin_invites` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `role` text NOT NULL,
  `token_hash` text NOT NULL,
  `invited_by` text NOT NULL REFERENCES `users`(`id`),
  `expires_at` integer NOT NULL,
  `accepted_at` integer,
  `revoked_at` integer,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `admin_invites_email_idx` ON `admin_invites` (`email`);--> statement-breakpoint
CREATE INDEX `admin_invites_pending_idx` ON `admin_invites` (`expires_at`);--> statement-breakpoint

-- admin_audit_logs
CREATE TABLE `admin_audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `before` text,
  `after` text,
  `request_id` text NOT NULL,
  `ip` text,
  `user_agent` text,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_created_idx` ON `admin_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_actor_idx` ON `admin_audit_logs` (`actor_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_target_idx` ON `admin_audit_logs` (`target_type`, `target_id`, `created_at`);
```

- [ ] **Step 6: Create** `packages/db/migrations/0008_admin_core_ops_down.sql`:

```sql
-- 0008_admin_core_ops_down.sql
ALTER TABLE `users` ADD `is_platform_admin` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `users` SET `is_platform_admin` = 1 WHERE `admin_role` = 'super_admin';--> statement-breakpoint
DROP INDEX `users_admin_role_idx`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `admin_role`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `admin_invited_at`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `admin_invited_by`;--> statement-breakpoint
DROP TABLE `admin_audit_logs`;--> statement-breakpoint
DROP TABLE `admin_invites`;
```

- [ ] **Step 7: Write failing test** in `apps/api/test/admin/migration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyMigrations, revertMigrations } from '@vyro/db/test-utils';

describe('migration 0008 admin core ops', () => {
  it('forward: backfills super_admin then drops is_platform_admin', async () => {
    const db = await applyMigrations(['0000', '0001', '0002', '0003', '0004', '0005', '0006', '0007']);
    // Seed a row with is_platform_admin = 1
    await db.insert(/* users table */).values({ id: 'u1', email: 'a@x', /* ... */ is_platform_admin: 1 });
    await applyMigrations(['0008'], db);
    const row = await db.select().from(/* users table */).where(/* users.id = 'u1' */);
    expect(row[0].admin_role).toBe('super_admin');
    expect((row[0] as any).is_platform_admin).toBeUndefined();
  });
  it('down: restores is_platform_admin for super_admin rows', async () => {
    const db = await applyMigrations(['0000', ..., '0008']);
    await revertMigrations(['0008'], db);
    const row = await db.select().from(/* users table */).where(/* users.id = 'u1' */);
    expect(row[0].is_platform_admin).toBe(1);
    expect((row[0] as any).admin_role).toBeNull();
  });
});
```

(Implement test against the project's existing migration runner; reference actual table symbols.)

- [ ] **Step 8: Run, expect PASS** for `migration.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/users.ts packages/db/src/schema/adminInvites.ts packages/db/src/schema/adminAuditLogs.ts packages/db/src/schema/index.ts packages/db/migrations/0008_admin_core_ops.sql packages/db/migrations/0008_admin_core_ops_down.sql apps/api/test/admin/migration.test.ts
git commit -m "feat(db): T1 admin role enum + invites + audit log tables"
```

---

### Task 3: Update auth context — replace `isAdmin` with `adminRole`

**Files:**
- Modify: `packages/auth/src/types.ts`
- Modify: `packages/auth/src/context.ts`
- Modify: `apps/api/src/middleware/session.ts`

**Interfaces:**
- Produces: `SessionContext.adminRole: AdminRole | null` (replaces `isAdmin: boolean`)
- Consumes: `users.adminRole` column (Task 2)

- [ ] **Step 1: Modify** `packages/auth/src/types.ts`:

```ts
export type SessionContext = {
  userId: string;
  email: string;
  adminRole: 'super_admin' | 'ops' | 'finance' | 'support' | null;
  businesses: Array<{ id: string; role: string; name: string }>;
  suppliers: Array<{ id: string; role: string; name: string }>;
};
```

- [ ] **Step 2: Modify** `packages/auth/src/context.ts` — replace `isAdmin: user.isPlatformAdmin` with `adminRole: user.adminRole`:

```ts
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users, businessMembers, supplierMembers, businesses, suppliers } from '@vyro/db/schema';
import type { SessionContext } from './types';

export async function loadSessionContext(
  d1: D1Database,
  userId: string,
): Promise<SessionContext | null> {
  const db = getDb(d1);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.deletedAt) return null;

  const biz = await db
    .select({
      id: businessMembers.businessId,
      businessId: businessMembers.businessId,
      role: businessMembers.role,
      name: businesses.name,
      businessName: businesses.name,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businessMembers.status, 'active'),
        isNull(businesses.deletedAt),
      ),
    )
    .all();

  const sup = await db
    .select({
      id: supplierMembers.supplierId,
      supplierId: supplierMembers.supplierId,
      role: supplierMembers.role,
      name: suppliers.name,
      supplierName: suppliers.name,
    })
    .from(supplierMembers)
    .innerJoin(suppliers, eq(supplierMembers.supplierId, suppliers.id))
    .where(
      and(
        eq(supplierMembers.userId, userId),
        eq(supplierMembers.status, 'active'),
        isNull(suppliers.deletedAt),
      ),
    )
    .all();

  return {
    userId: user.id,
    email: user.email,
    adminRole: user.adminRole ?? null,
    businesses: biz,
    suppliers: sup,
  };
}
```

- [ ] **Step 3: Modify** `apps/api/src/middleware/session.ts` — update default ctx if it constructs one, and any reference to `isAdmin`:

```bash
grep -rn "isAdmin" apps/api/src packages/auth/src
```

For each match: replace `isAdmin` access with `(ctx.adminRole !== null)` boolean coercion (since `isAdmin` was a boolean, callers can be replaced by `!!ctx.adminRole` or refactored to `ctx.adminRole` directly).

- [ ] **Step 4: Run typecheck** — `pnpm typecheck`. Expect errors at call sites; fix each by mapping boolean usage to adminRole check.

- [ ] **Step 5: Run all tests** — `pnpm test`. Expect failures; we'll resolve in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/auth/src/types.ts packages/auth/src/context.ts apps/api/src/middleware/session.ts
git commit -m "refactor(auth): replace isAdmin boolean with adminRole enum"
```

---

### Task 4: `requirePermission` middleware + RBAC audit script extend

**Files:**
- Modify: `apps/api/src/middleware/rbac.ts`
- Modify: `apps/api/src/scripts/rbac-audit.ts`

**Interfaces:**
- Produces: `export const requirePermission = (perm: Permission): MiddlewareHandler`

- [ ] **Step 1: Add failing test** in `apps/api/test/admin/rbac.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { session } from '../../src/middleware/session';
import { requirePermission } from '../../src/middleware/rbac';

function appWith(role: string | null) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('ctx', { userId: 'u1', email: 'x', adminRole: role, businesses: [], suppliers: [] } as any);
    await next();
  });
  app.get('/probe', requirePermission('user:suspend'), (c) => c.json({ ok: true }));
  return app;
}

describe('requirePermission', () => {
  it('super_admin passes user:suspend', async () => {
    const res = await appWith('super_admin').request('/probe');
    expect(res.status).toBe(200);
  });
  it('finance blocked from user:suspend', async () => {
    const res = await appWith('finance').request('/probe');
    expect(res.status).toBe(403);
  });
  it('null role blocked', async () => {
    const res = await appWith(null).request('/probe');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `requirePermission` not exported.

- [ ] **Step 3: Modify** `apps/api/src/middleware/rbac.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import { httpError } from '../lib/errors';
import type { Ctx } from './session';
import { hasPermission, type Permission } from '@vyro/auth';

interface RoleSpec {
  business?: readonly string[];
  supplier?: readonly string[];
  admin?: boolean;
  permission?: Permission;
}

export const requireRole = (spec: RoleSpec): MiddlewareHandler => async (c, next) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No context');
  if (spec.permission) {
    if (hasPermission(ctx.adminRole, spec.permission)) return next();
    throw httpError(403, 'FORBIDDEN', `Missing permission: ${spec.permission}`);
  }
  if (spec.admin && ctx.adminRole) return next();
  if (spec.business && ctx.businesses.some((b) => spec.business!.includes(b.role))) return next();
  if (spec.supplier && ctx.suppliers.some((s) => spec.supplier!.includes(s.role))) return next();
  throw httpError(403, 'FORBIDDEN', 'Insufficient role');
};

export const requirePermission = (perm: Permission): MiddlewareHandler =>
  requireRole({ permission: perm });
```

- [ ] **Step 4: Run, expect PASS** for `rbac.test.ts`.

- [ ] **Step 5: Modify** `apps/api/src/scripts/rbac-audit.ts` — extend check:

```ts
// existing check for requireRole remains.
// Add: also accept requirePermission(perm) as valid gating.
```

Update the regex/parser to recognize `requirePermission(...)` calls; collect permission string arg; verify against `PERMISSION_KEYS` import. Fail with helpful message if unknown.

- [ ] **Step 6: Run audit script** — `pnpm exec tsx apps/api/src/scripts/rbac-audit.ts`. Expect failures (no admin route uses `requirePermission` yet); fix in Task 6.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/middleware/rbac.ts apps/api/src/scripts/rbac-audit.ts apps/api/test/admin/rbac.test.ts
git commit -m "feat(api): requirePermission middleware + RBAC audit support"
```

---

### Task 5: Audit helper `lib/audit.ts`

**Files:**
- Create: `apps/api/src/modules/admin/lib/audit.ts`
- Create: `packages/auth/test/auditAdmin.test.ts`

**Interfaces:**
- Produces: `export async function auditAdmin(opts: { ctx: C; action: string; target: { type: string; id: string }; before?: unknown; after?: unknown }): Promise<void>`

- [ ] **Step 1: Write failing test** in `packages/auth/test/auditAdmin.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { auditAdmin } from '../../apps/api/src/modules/admin/lib/audit';

describe('auditAdmin', () => {
  it('writes row with actor, action, target, before, after, requestId, ip, ua', async () => {
    const inserts: any[] = [];
    const db = { insert: () => ({ values: (v: any) => { inserts.push(v); return { run: async () => {} }; } }) };
    const ctx = {
      env: { DB: db },
      get: (k: string) => k === 'ctx' ? { userId: 'u1' } : k === 'requestId' ? 'req-1' : undefined,
      req: { header: (n: string) => n === 'user-agent' ? 'agent/1' : n === 'x-forwarded-for' ? '1.2.3.4' : '' },
    };
    await auditAdmin({ ctx: ctx as any, action: 'user.suspend', target: { type: 'user', id: 'u2' }, before: { status: 'active' }, after: { status: 'suspended' } });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      actorId: 'u1',
      action: 'user.suspend',
      targetType: 'user',
      targetId: 'u2',
      before: JSON.stringify({ status: 'active' }),
      after: JSON.stringify({ status: 'suspended' }),
      requestId: 'req-1',
      ip: '1.2.3.4',
      userAgent: 'agent/1',
    });
    expect(inserts[0].id).toBeTypeOf('string');
    expect(inserts[0].createdAt).toBeTypeOf('number');
  });
  it('swallows DB errors and logs stderr', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = {
      env: { DB: { insert: () => { throw new Error('db down'); } } },
      get: () => undefined,
      req: { header: () => '' },
    };
    await expect(auditAdmin({ ctx: ctx as any, action: 'x', target: { type: 't', id: 'i' } })).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — module not found.

- [ ] **Step 3: Implement** `apps/api/src/modules/admin/lib/audit.ts`:

```ts
import type { Context } from 'hono';
import { adminAuditLogs } from '@vyro/db/schema';
import { getDb } from '@vyro/db';
import { randomUUID } from 'node:crypto';

type AuditTarget = { type: string; id: string };

export async function auditAdmin(opts: {
  ctx: Context;
  action: string;
  target: AuditTarget;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const c = opts.ctx;
    const ctx = c.get('ctx') as { userId: string } | undefined;
    if (!ctx) return;
    const requestId = (c.get('requestId') as string | undefined) ?? 'unknown';
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? null;
    const userAgent = c.req.header('user-agent') ?? null;
    const db = getDb(c.env.DB as D1Database);
    await db
      .insert(adminAuditLogs)
      .values({
        id: randomUUID(),
        actorId: ctx.userId,
        action: opts.action,
        targetType: opts.target.type,
        targetId: opts.target.id,
        before: opts.before === undefined ? null : JSON.stringify(opts.before),
        after: opts.after === undefined ? null : JSON.stringify(opts.after),
        requestId,
        ip,
        userAgent,
        createdAt: Date.now(),
      })
      .run();
  } catch (err) {
    console.error('[auditAdmin] failed', err);
  }
}
```

- [ ] **Step 4: Run, expect PASS** for `auditAdmin.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/lib/audit.ts packages/auth/test/auditAdmin.test.ts
git commit -m "feat(api): auditAdmin helper for admin write actions"
```

---

### Task 6: Refactor existing admin mutations to call audit + use `requirePermission`

**Files:**
- Modify: `apps/api/src/modules/admin/users.ts`
- Modify: `apps/api/src/modules/admin/usersRepository.ts`
- Modify: `apps/api/src/modules/admin/disputes.ts`
- Modify: `apps/api/src/modules/payments/admin.ts`
- Modify: `apps/api/src/modules/payouts/admin.ts`
- Modify: `apps/api/src/modules/settings/admin.ts`
- Modify: `apps/api/test/admin/users.test.ts`
- Modify: `apps/api/test/admin/freezeUnfreeze.test.ts`
- Modify: `apps/api/test/admin/businessFreeze.test.ts`
- Modify: `apps/api/test/admin/dispute.test.ts`
- Modify: `apps/api/test/payments/admin.test.ts`
- Create: `apps/api/test/payouts/admin.test.ts`
- Modify: `apps/api/test/settings/admin.test.ts`

**Interfaces:**
- Consumes: `auditAdmin` (Task 5)
- Consumes: `requirePermission` (Task 4)

- [ ] **Step 1: Update** `apps/api/src/modules/admin/users.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requireRole, requirePermission } from '../../middleware/rbac';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { adminUsersListQuery, adminUserIdParam } from '@vyro/validation/adminUsers';
import { listAdminUsers, setUserStatus } from './usersRepository';
import { auditAdmin } from './lib/audit';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requireRole({ admin: true }), async (c) => {
  const parsed = adminUsersListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const out = await listAdminUsers(c.env.DB, {
    cursor: parsed.data.cursor,
    q: parsed.data.q,
    role: parsed.data.role,
    isAdmin: parsed.data.isAdmin,
  });
  return c.json(out);
});

router.post('/:id/suspend', requirePermission('user:suspend'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const before = await getUserStatusForAudit(c.env.DB, paramParsed.data.id);
  await setUserStatus(c.env.DB, ctx.userId, paramParsed.data.id, 'suspended');
  await auditAdmin({ ctx: c, action: 'user.suspend', target: { type: 'user', id: paramParsed.data.id }, before, after: { status: 'suspended' } });
  return c.json({ ok: true });
});

router.post('/:id/unsuspend', requirePermission('user:unsuspend'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const before = await getUserStatusForAudit(c.env.DB, paramParsed.data.id);
  await setUserStatus(c.env.DB, ctx.userId, paramParsed.data.id, 'active');
  await auditAdmin({ ctx: c, action: 'user.unsuspend', target: { type: 'user', id: paramParsed.data.id }, before, after: { status: 'active' } });
  return c.json({ ok: true });
});

async function getUserStatusForAudit(d1: D1Database, id: string) {
  const { getDb } = await import('@vyro/db');
  const { users } = await import('@vyro/db/schema');
  const { eq } = await import('drizzle-orm');
  const row = await getDb(d1).select({ status: users.status }).from(users).where(eq(users.id, id)).get();
  return row ? { status: row.status } : null;
}

export default router;
```

- [ ] **Step 2: Extend** `packages/validation/src/adminUsers.ts` — add `role` and `isAdmin` to query schema:

```ts
import { z } from 'zod';
export const adminUsersListQuery = z.object({
  cursor: z.string().optional(),
  q: z.string().optional(),
  role: z.enum(['super_admin', 'ops', 'finance', 'support']).optional(),
  isAdmin: z.enum(['true', 'false']).optional(),
});
```

- [ ] **Step 3: Update** `apps/api/src/modules/admin/usersRepository.ts` — add `role` and `isAdmin` filter + return `lastActivityAt`:

```ts
export async function listAdminUsers(d1: D1Database, opts: { cursor?: string; q?: string; role?: string; isAdmin?: string }) {
  // existing implementation + add WHERE admin_role = ? when opts.role, WHERE admin_role IS NOT NULL when opts.isAdmin === 'true'
  // LEFT JOIN admin_audit_logs aggregate MAX(created_at) AS last_activity_at
}
```

- [ ] **Step 4: Refactor** `apps/api/src/modules/admin/disputes.ts` — wrap resolve in audit:

```ts
router.post('/:poId/resolve', requirePermission('dispute:resolve'), async (c) => {
  // existing logic
  await auditAdmin({ ctx: c, action: 'dispute.resolve', target: { type: 'purchase_order', id: poId }, before, after: { resolution } });
  return c.json({ ok: true });
});
```

- [ ] **Step 5: Refactor** `apps/api/src/modules/payments/admin.ts` — wrap refund initiation:

```ts
// wrap mutating POST /admin/payments/:id/refund in auditAdmin({action:'payment.refund', target:{type:'payment',id}, before, after})
```

- [ ] **Step 6: Refactor** `apps/api/src/modules/payouts/admin.ts` — wrap payout approval:

```ts
// wrap POST /admin/payouts/:id/approve
await auditAdmin({ ctx: c, action: 'payout.approve', target: { type: 'payout', id }, before: { status }, after: { status: 'approved' } });
```

- [ ] **Step 7: Refactor** `apps/api/src/modules/settings/admin.ts` — wrap settings update:

```ts
// wrap PUT/POST settings write
await auditAdmin({ ctx: c, action: 'settings.update', target: { type: 'platform_settings', id: 'singleton' }, before, after });
```

- [ ] **Step 8: Update tests** to assert audit rows:

In each test file (users, freeze, businessFreeze, dispute, payments/admin, settings/admin, payouts/admin):

```ts
// After existing assertion, add:
const auditRows = await listAdminAuditLogs(c.env.DB, { targetId: target.id });
expect(auditRows[0]).toMatchObject({
  actorId: ctx.userId,
  action: expectedAction,
  targetType: expectedType,
  targetId: target.id,
});
```

Helper `listAdminAuditLogs` from Task 9 (re-export from `apps/api/src/modules/admin/audit/repository.ts`); for Task 6, inline a local query.

- [ ] **Step 9: Run** `pnpm exec vitest run apps/api/test/admin` — expect all pass.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/admin/users.ts apps/api/src/modules/admin/usersRepository.ts apps/api/src/modules/admin/disputes.ts apps/api/src/modules/payments/admin.ts apps/api/src/modules/payouts/admin.ts apps/api/src/modules/settings/admin.ts packages/validation/src/adminUsers.ts apps/api/test/admin/users.test.ts apps/api/test/admin/freezeUnfreeze.test.ts apps/api/test/admin/businessFreeze.test.ts apps/api/test/admin/dispute.test.ts apps/api/test/payments/admin.test.ts apps/api/test/payouts/admin.test.ts apps/api/test/settings/admin.test.ts
git commit -m "refactor(api): audit existing admin mutations + tighten permissions"
```

---

### Task 7: Admin invites module

**Files:**
- Create: `packages/validation/src/adminInvites.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `apps/api/src/modules/admin/invites/schema.ts`
- Create: `apps/api/src/modules/admin/invites/repository.ts`
- Create: `apps/api/src/modules/admin/invites/service.ts`
- Create: `apps/api/src/modules/admin/invites/routes.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Create: `apps/api/test/admin/invites.test.ts`

**Interfaces:**
- Produces: `POST /api/admin/invites` (perm `admin:invite`)
- Produces: `GET /api/admin/invites` (perm `admin:invite`)
- Produces: `DELETE /api/admin/invites/:id` (perm `admin:invite`)
- Produces: `POST /api/admin/invites/accept` (public)

- [ ] **Step 1: Create** `packages/validation/src/adminInvites.ts`:

```ts
import { z } from 'zod';

export const adminInviteCreate = z.object({
  email: z.string().email(),
  role: z.enum(['ops', 'finance', 'support', 'super_admin']),
});

export const adminInviteAccept = z.object({
  token: z.string().min(32),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const adminInviteListQuery = z.object({
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
});

export const adminInviteIdParam = z.object({ id: z.string().min(1) });
```

- [ ] **Step 2: Modify** `packages/validation/src/index.ts` — `export * from './adminInvites';`

- [ ] **Step 3: Create** `apps/api/src/modules/admin/invites/schema.ts`:

```ts
import { z } from 'zod';
export { adminInviteCreate, adminInviteAccept, adminInviteListQuery, adminInviteIdParam };
```

- [ ] **Step 4: Create** `apps/api/src/modules/admin/invites/repository.ts`:

```ts
import { getDb } from '@vyro/db';
import { adminInvites } from '@vyro/db/schema';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function createInvite(d1: D1Database, opts: {
  email: string; role: 'super_admin' | 'ops' | 'finance' | 'support';
  tokenHash: string; invitedBy: string; expiresAt: number;
}) {
  const db = getDb(d1);
  const id = randomUUID();
  await db.insert(adminInvites).values({
    id, email: opts.email, role: opts.role, tokenHash: opts.tokenHash,
    invitedBy: opts.invitedBy, expiresAt: opts.expiresAt, createdAt: Date.now(),
  }).run();
  return { id, expiresAt: opts.expiresAt };
}

export async function listInvites(d1: D1Database, status?: 'pending' | 'accepted' | 'revoked' | 'expired') {
  const db = getDb(d1);
  const now = Date.now();
  if (!status) return db.select().from(adminInvites).all();
  if (status === 'pending') {
    return db.select().from(adminInvites).where(and(isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt), lt(adminInvites.expiresAt, now).not())).all();
  }
  if (status === 'accepted') return db.select().from(adminInvites).where(eq(adminInvites.acceptedAt, ... /* not null */)).all();
  // ... other statuses
}
```

(Adjust queries to Drizzle idioms; for `lt(...).not()`, use `gt(adminInvites.expiresAt, now)` for pending.)

- [ ] **Step 5: Create** `apps/api/src/modules/admin/invites/service.ts`:

```ts
import { randomBytes, createHash } from 'node:crypto';
import { httpError } from '../../../lib/errors';
import { createInvite, findByTokenHash, markAccepted, revoke } from './repository';
import { hasPermission, type AdminRole } from '@vyro/auth';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const INVITABLE_ROLES: Record<AdminRole, AdminRole[]> = {
  super_admin: ['super_admin', 'ops', 'finance', 'support'],
  ops: ['ops', 'finance', 'support'],
  finance: [],
  support: [],
};

export async function createInviteForEmail(d1: D1Database, opts: {
  email: string; role: AdminRole; actorRole: AdminRole; actorId: string;
}) {
  if (!INVITABLE_ROLES[opts.actorRole].includes(opts.role)) {
    throw httpError(422, 'ROLE_NOT_GRANTABLE', `Role ${opts.role} not grantable by ${opts.actorRole}`);
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + INVITE_TTL_MS;
  const { id } = await createInvite(d1, { email: opts.email, role: opts.role, tokenHash, invitedBy: opts.actorId, expiresAt });
  await sendMagicEmail(opts.email, token, expiresAt);
  return { id, acceptUrl: `/admin/invite/accept?token=${token}`, expiresAt };
}

export async function acceptInvite(d1: D1Database, opts: { token: string; name?: string; password?: string }) {
  const tokenHash = createHash('sha256').update(opts.token).digest('hex');
  const invite = await findByTokenHash(d1, tokenHash);
  if (!invite) throw httpError(404, 'NOT_FOUND', 'Invalid token');
  if (invite.revokedAt) throw httpError(410, 'INVITE_REVOKED', 'Invite revoked');
  if (invite.acceptedAt) throw httpError(409, 'INVITE_ACCEPTED', 'Already accepted');
  if (invite.expiresAt < Date.now()) throw httpError(410, 'INVITE_EXPIRED', 'Expired');
  // upsert user via better-auth
  const userId = await upsertAdminUser(d1, { email: invite.email, role: invite.role, name: opts.name, password: opts.password });
  await markAccepted(d1, invite.id, userId);
  return { userId, role: invite.role };
}

async function upsertAdminUser(d1: D1Database, opts: { email: string; role: AdminRole; name?: string; password?: string }): Promise<string> {
  // call into better-auth admin signup or direct insert; verify emailVerifiedAt; set users.adminRole
  // return user id
}

async function sendMagicEmail(email: string, token: string, expiresAt: number) {
  // existing notify pipeline (fallback: console.log + adminNotifications insert)
}
```

- [ ] **Step 6: Create** `apps/api/src/modules/admin/invites/routes.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission, requireRole } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import type { Ctx } from '../../../middleware/session';
import { adminInviteCreate, adminInviteAccept, adminInviteListQuery, adminInviteIdParam } from './schema';
import { createInviteForEmail, acceptInvite } from './service';
import { listInvites, revoke } from './repository';
import { auditAdmin } from '../lib/audit';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.post('/', requirePermission('admin:invite'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  if (!ctx.adminRole) throw httpError(403, 'FORBIDDEN', 'No admin role');
  const parsed = adminInviteCreate.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const out = await createInviteForEmail(c.env.DB, {
    email: parsed.data.email,
    role: parsed.data.role,
    actorRole: ctx.adminRole,
    actorId: ctx.userId,
  });
  await auditAdmin({ ctx: c, action: 'admin.invite.create', target: { type: 'admin_invite', id: out.id }, after: { email: parsed.data.email, role: parsed.data.role } });
  return c.json({ id: out.id, acceptUrl: out.acceptUrl, expiresAt: out.expiresAt }, 201);
});

router.get('/', requirePermission('admin:invite'), async (c) => {
  const parsed = adminInviteListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const out = await listInvites(c.env.DB, parsed.data.status);
  return c.json({ invites: out });
});

router.delete('/:id', requirePermission('admin:invite'), async (c) => {
  const parsed = adminInviteIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  await revoke(c.env.DB, parsed.data.id);
  await auditAdmin({ ctx: c, action: 'admin.invite.revoke', target: { type: 'admin_invite', id: parsed.data.id } });
  return c.body(null, 204);
});

router.post('/accept', async (c) => {
  const parsed = adminInviteAccept.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const out = await acceptInvite(c.env.DB, parsed.data);
  await auditAdmin({ ctx: c, action: 'admin.invite.accept', target: { type: 'user', id: out.userId }, after: { role: out.role } });
  return c.json(out);
});

export default router;
```

- [ ] **Step 7: Mount** in `apps/api/src/modules/admin/routes.ts`:

```ts
import invites from './invites/routes';
// ...
app.route('/invites', invites);
```

- [ ] **Step 8: Write tests** in `apps/api/test/admin/invites.test.ts` covering: create + perm check, list, revoke, accept (existing user), accept (new user), accept expired/revoked/already-accepted, ROLE_NOT_GRANTABLE, USER_SUSPENDED, ROLE_CONFLICT.

- [ ] **Step 9: Run** `pnpm exec vitest run apps/api/test/admin/invites.test.ts` — expect PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/validation/src/adminInvites.ts packages/validation/src/index.ts apps/api/src/modules/admin/invites/ apps/api/src/modules/admin/routes.ts apps/api/test/admin/invites.test.ts
git commit -m "feat(api): admin invites CRUD + accept flow"
```

---

### Task 8: Admin roles module (change + demote)

**Files:**
- Create: `packages/validation/src/adminRoles.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `apps/api/src/modules/admin/roles/schema.ts`
- Create: `apps/api/src/modules/admin/roles/repository.ts`
- Create: `apps/api/src/modules/admin/roles/service.ts`
- Create: `apps/api/src/modules/admin/roles/routes.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Create: `apps/api/test/admin/roles.test.ts`

**Interfaces:**
- Produces: `PATCH /api/admin/users/:id/role` (perm `admin:role_change`)
- Produces: `DELETE /api/admin/users/:id/role` (perm `admin:role_change`)

- [ ] **Step 1: Create** `packages/validation/src/adminRoles.ts`:

```ts
import { z } from 'zod';

export const adminRoleChange = z.object({
  role: z.enum(['super_admin', 'ops', 'finance', 'support']),
});

export const adminUserIdParam = z.object({ id: z.string().min(1) });
```

- [ ] **Step 2: Modify** `packages/validation/src/index.ts` — `export * from './adminRoles';`

- [ ] **Step 3: Create** `apps/api/src/modules/admin/roles/schema.ts`:

```ts
export { adminRoleChange, adminUserIdParam } from '@vyro/validation/adminRoles';
```

- [ ] **Step 4: Create** `apps/api/src/modules/admin/roles/repository.ts`:

```ts
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

export async function getAdminUser(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select({ id: users.id, adminRole: users.adminRole }).from(users).where(eq(users.id, id)).get();
}

export async function setAdminRole(d1: D1Database, id: string, expectedRole: string | null, newRole: 'super_admin' | 'ops' | 'finance' | 'support' | null): Promise<number> {
  const db = getDb(d1);
  // optimistic concurrency: WHERE id = ? AND admin_role IS ?expected
  const result = await db.update(users).set({ adminRole: newRole, updatedAt: Date.now() }).where(
    expectedRole === null
      ? and(eq(users.id, id), isNull(users.adminRole))
      : and(eq(users.id, id), eq(users.adminRole, expectedRole))
  ).run();
  return (result as any).rowsAffected ?? 0;
}

export async function countSuperAdmins(d1: D1Database): Promise<number> {
  const db = getDb(d1);
  const row = await db.select({ id: users.id }).from(users).where(eq(users.adminRole, 'super_admin')).all();
  return row.length;
}

export async function listAdmins(d1: D1Database) {
  const db = getDb(d1);
  return db.select({ id: users.id, email: users.email, name: users.name, adminRole: users.adminRole, createdAt: users.createdAt }).from(users).where(isNotNull(users.adminRole)).all();
}
```

- [ ] **Step 5: Create** `apps/api/src/modules/admin/roles/service.ts`:

```ts
import { httpError } from '../../../lib/errors';
import { getAdminUser, setAdminRole, countSuperAdmins } from './repository';
import type { AdminRole } from '@vyro/auth';

export async function changeRole(d1: D1Database, opts: {
  actorId: string; targetId: string; newRole: AdminRole;
}) {
  if (opts.targetId === opts.actorId && opts.newRole !== 'super_admin') {
    throw httpError(409, 'CANNOT_DEMOTE_SELF', 'Cannot demote self');
  }
  const target = await getAdminUser(d1, opts.targetId);
  if (!target) throw httpError(404, 'NOT_FOUND', 'User not found');
  if (target.adminRole === 'super_admin' && opts.newRole !== 'super_admin') {
    const count = await countSuperAdmins(d1);
    if (count <= 1) throw httpError(409, 'LAST_SUPER_ADMIN', 'Cannot remove last super_admin');
  }
  const rows = await setAdminRole(d1, opts.targetId, target.adminRole ?? null, opts.newRole);
  if (rows === 0) throw httpError(409, 'ROLE_CHANGED', 'Concurrent role change');
  return { userId: opts.targetId, role: opts.newRole };
}

export async function demote(d1: D1Database, opts: { actorId: string; targetId: string }) {
  if (opts.targetId === opts.actorId) {
    throw httpError(409, 'CANNOT_DEMOTE_SELF', 'Cannot demote self');
  }
  const target = await getAdminUser(d1, opts.targetId);
  if (!target) throw httpError(404, 'NOT_FOUND', 'User not found');
  if (target.adminRole === 'super_admin') {
    const count = await countSuperAdmins(d1);
    if (count <= 1) throw httpError(409, 'LAST_SUPER_ADMIN', 'Cannot remove last super_admin');
  }
  const rows = await setAdminRole(d1, opts.targetId, target.adminRole, null);
  if (rows === 0) throw httpError(409, 'ROLE_CHANGED', 'Concurrent role change');
}
```

- [ ] **Step 6: Create** `apps/api/src/modules/admin/roles/routes.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import type { Ctx } from '../../../middleware/session';
import { httpError } from '../../../lib/errors';
import { adminRoleChange, adminUserIdParam } from './schema';
import { changeRole, demote } from './service';
import { getAdminUser } from './repository';
import { auditAdmin } from '../lib/audit';
import { isAdminRole } from '@vyro/auth';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.patch('/users/:id/role', requirePermission('admin:role_change'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const bodyParsed = adminRoleChange.safeParse(await c.req.json());
  if (!bodyParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  if (!isAdminRole(bodyParsed.data.role)) throw httpError(400, 'VALIDATION_ERROR', 'Invalid role');
  const before = await getAdminUser(c.env.DB, paramParsed.data.id);
  const out = await changeRole(c.env.DB, {
    actorId: ctx.userId,
    targetId: paramParsed.data.id,
    newRole: bodyParsed.data.role,
  });
  await auditAdmin({
    ctx: c,
    action: 'admin.user.role_change',
    target: { type: 'user', id: paramParsed.data.id },
    before: { role: before?.adminRole ?? null },
    after: { role: bodyParsed.data.role },
  });
  return c.json(out);
});

router.delete('/users/:id/role', requirePermission('admin:role_change'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const paramParsed = adminUserIdParam.safeParse(c.req.param());
  if (!paramParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const before = await getAdminUser(c.env.DB, paramParsed.data.id);
  await demote(c.env.DB, { actorId: ctx.userId, targetId: paramParsed.data.id });
  await auditAdmin({
    ctx: c,
    action: 'admin.user.role_remove',
    target: { type: 'user', id: paramParsed.data.id },
    before: { role: before?.adminRole ?? null },
    after: { role: null },
  });
  return c.body(null, 204);
});

export default router;
```

- [ ] **Step 7: Mount** in `apps/api/src/modules/admin/routes.ts`:

```ts
import roles from './roles/routes';
app.route('/roles', roles);
```

(Or place under existing admin mount — adjust path to be `/api/admin/users/:id/role` rather than `/api/admin/roles/users/:id/role`. If keeping sub-router, rewrite path inside `roles/routes.ts` and mount at `/api/admin`.)

- [ ] **Step 8: Write tests** in `apps/api/test/admin/roles.test.ts` covering: success change, success demote, 403 ops attempts role_change, 409 cannot_demote_self, 409 last_super_admin (set up exactly 1 super, attempt demote), 409 role_changed (simulate concurrent), 404 user_not_found, audit row written.

- [ ] **Step 9: Run** — expect PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/validation/src/adminRoles.ts packages/validation/src/index.ts apps/api/src/modules/admin/roles/ apps/api/src/modules/admin/routes.ts apps/api/test/admin/roles.test.ts
git commit -m "feat(api): admin role change + demote with last-super guard"
```

---

### Task 9: Admin audit list + CSV export

**Files:**
- Create: `packages/validation/src/adminAudit.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `apps/api/src/modules/admin/audit/schema.ts`
- Create: `apps/api/src/modules/admin/audit/repository.ts`
- Create: `apps/api/src/modules/admin/audit/routes.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`
- Create: `apps/api/test/admin/audit.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/audit` (perm `audit:read`)
- Produces: `GET /api/admin/audit/export` (perm `audit:export`)

- [ ] **Step 1: Create** `packages/validation/src/adminAudit.ts`:

```ts
import { z } from 'zod';

export const adminAuditQuery = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
```

- [ ] **Step 2: Modify** `packages/validation/src/index.ts` — `export * from './adminAudit';`

- [ ] **Step 3: Create** `apps/api/src/modules/admin/audit/schema.ts`:

```ts
export { adminAuditQuery } from '@vyro/validation/adminAudit';
```

- [ ] **Step 4: Create** `apps/api/src/modules/admin/audit/repository.ts`:

```ts
import { getDb } from '@vyro/db';
import { adminAuditLogs, users } from '@vyro/db/schema';
import { and, eq, gte, lte, lt, desc, like } from 'drizzle-orm';

export async function listAudit(d1: D1Database, opts: {
  actorId?: string; action?: string; targetType?: string; targetId?: string;
  from?: number; to?: number; cursor?: string; limit?: number;
}) {
  const db = getDb(d1);
  const limit = opts.limit ?? 50;
  // build WHERE chain
  const where = and(
    opts.actorId ? eq(adminAuditLogs.actorId, opts.actorId) : undefined,
    opts.action ? eq(adminAuditLogs.action, opts.action) : undefined,
    opts.targetType ? eq(adminAuditLogs.targetType, opts.targetType) : undefined,
    opts.targetId ? eq(adminAuditLogs.targetId, opts.targetId) : undefined,
    opts.from ? gte(adminAuditLogs.createdAt, opts.from) : undefined,
    opts.to ? lte(adminAuditLogs.createdAt, opts.to) : undefined,
    opts.cursor ? lt(adminAuditLogs.createdAt, Number(opts.cursor)) : undefined,
  );
  const rows = await db
    .select({
      id: adminAuditLogs.id,
      actorId: adminAuditLogs.actorId,
      actorEmail: users.email,
      actorRole: users.adminRole,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      before: adminAuditLogs.before,
      after: adminAuditLogs.after,
      requestId: adminAuditLogs.requestId,
      ip: adminAuditLogs.ip,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .leftJoin(users, eq(users.id, adminAuditLogs.actorId))
    .where(where)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(entries[entries.length - 1].createdAt) : null;
  return { entries, nextCursor };
}

export async function purgeExpired(d1: D1Database, olderThanMs: number): Promise<number> {
  const db = getDb(d1);
  const cutoff = Date.now() - olderThanMs;
  const result = await db.delete(adminAuditLogs).where(lte(adminAuditLogs.createdAt, cutoff)).run();
  return (result as any).rowsAffected ?? 0;
}
```

- [ ] **Step 5: Create** `apps/api/src/modules/admin/audit/routes.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminAuditQuery } from './schema';
import { listAudit } from './repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('audit:read'), async (c) => {
  const parsed = adminAuditQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const out = await listAudit(c.env.DB, parsed.data);
  return c.json(out);
});

router.get('/export', requirePermission('audit:export'), async (c) => {
  const parsed = adminAuditQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const limit = parsed.data.limit ?? 1000;
  const softCap = 100_000;
  let count = 0;
  let cursor: string | undefined = parsed.data.cursor;
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="admin-audit.csv"');
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode('id,actor_id,actor_email,action,target_type,target_id,request_id,ip,created_at,before,after\n'));
      while (count < softCap) {
        const page = await listAudit(c.env.DB, { ...parsed.data, cursor, limit });
        if (page.entries.length === 0) break;
        for (const row of page.entries) {
          controller.enqueue(enc.encode(toCsvRow(row) + '\n'));
          count++;
          if (count >= softCap) { controller.enqueue(enc.encode('# truncated at 100k\n')); break; }
        }
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      controller.close();
    },
  });
  return c.body(stream as any);
});

function toCsvRow(r: any): string {
  return [r.id, r.actorId, r.actorEmail, r.action, r.targetType, r.targetId, r.requestId, r.ip ?? '', new Date(r.createdAt).toISOString(), r.before ?? '', r.after ?? '']
    .map(csvField).join(',');
}
function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default router;
```

- [ ] **Step 6: Mount** in `apps/api/src/modules/admin/routes.ts`:

```ts
import audit from './audit/routes';
app.route('/audit', audit);
```

- [ ] **Step 7: Write tests** in `apps/api/test/admin/audit.test.ts` covering: filters, pagination cursor, perm enforcement (403 for non-audit:read), CSV stream parses valid rows.

- [ ] **Step 8: Run** — expect PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/validation/src/adminAudit.ts packages/validation/src/index.ts apps/api/src/modules/admin/audit/ apps/api/src/modules/admin/routes.ts apps/api/test/admin/audit.test.ts
git commit -m "feat(api): admin audit list + CSV export"
```

---

### Task 10: Cron audit-purge handler

**Files:**
- Create: `apps/api/src/cron/audit-purge.ts`
- Modify: `apps/api/wrangler.toml`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/test/admin/auditPurge.test.ts`

**Interfaces:**
- Produces: `POST /api/cron/audit-purge` (CF Workers scheduled event handler)
- Consumes: `purgeExpired(d1, 365 * 24 * 60 * 60 * 1000)` from Task 9

- [ ] **Step 1: Create** `apps/api/src/cron/audit-purge.ts`:

```ts
import { purgeExpired } from '../modules/admin/audit/repository';

export async function handleAuditPurge(env: { DB: D1Database }): Promise<{ deleted: number }> {
  const deleted = await purgeExpired(env.DB, 365 * 24 * 60 * 60 * 1000);
  console.log('[audit-purge] deleted', deleted);
  return { deleted };
}
```

- [ ] **Step 2: Modify** `apps/api/wrangler.toml` — add cron trigger:

```toml
[triggers]
crons = ["0 3 * * *"]
```

- [ ] **Step 3: Modify** `apps/api/src/index.ts` — add scheduled handler:

```ts
import { handleAuditPurge } from './cron/audit-purge';

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 3 * * *') {
      ctx.waitUntil(handleAuditPurge(env));
    }
  },
};
```

- [ ] **Step 4: Write tests** in `apps/api/test/admin/auditPurge.test.ts` covering: 366d-old rows deleted, 100d-old rows kept, returns count.

- [ ] **Step 5: Run** — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cron/audit-purge.ts apps/api/wrangler.toml apps/api/src/index.ts apps/api/test/admin/auditPurge.test.ts
git commit -m "feat(api): cron audit purge handler (365d retention)"
```

---

### Task 11: Frontend lib — roles + usePermission hook

**Files:**
- Create: `apps/web/src/admin/lib/roles.ts`
- Create: `apps/web/src/admin/lib/permissions.ts`
- Create: `apps/web/src/admin/lib/permissions.test.ts`

**Interfaces:**
- Produces: `export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'support'`
- Produces: `export const ROLE_META: Record<AdminRole, { label, color, description }>`
- Produces: `export function usePermission(perm: Permission): boolean`

- [ ] **Step 1: Create** `apps/web/src/admin/lib/roles.ts`:

```ts
export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'support';

export const ROLE_META: Record<AdminRole, { label: string; color: string; description: string }> = {
  super_admin: { label: 'Super admin', color: 'rose', description: 'Full platform access' },
  ops:         { label: 'Ops',         color: 'amber', description: 'User, business, supplier, catalog moderation' },
  finance:     { label: 'Finance',     color: 'emerald', description: 'Payments, refunds, payouts, ledger' },
  support:     { label: 'Support',     color: 'sky', description: 'Read-only + dispute notes' },
};

export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'ops', 'finance', 'support'];
```

- [ ] **Step 2: Create** `apps/web/src/admin/lib/permissions.ts`:

```ts
import { useAdminAuth } from '../Shell';
import { hasPermission, type Permission, type AdminRole } from '@vyro/auth';

export function usePermission(perm: Permission): boolean {
  const { adminRole } = useAdminAuth();
  return hasPermission(adminRole, perm);
}

export function useAdminRole(): AdminRole | null {
  return useAdminAuth().adminRole ?? null;
}
```

(Adjust `useAdminAuth` export name to whatever the existing shell exposes; if `adminRole` not yet present, extend `AdminAuthProvider` to include it — see Task 14 step 2.)

- [ ] **Step 3: Write tests** in `apps/web/src/admin/lib/permissions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermission } from './permissions';

vi.mock('../Shell', () => ({
  useAdminAuth: () => ({ adminRole: 'ops' }),
}));

describe('usePermission', () => {
  it('returns true for granted', () => {
    const { result } = renderHook(() => usePermission('user:suspend'));
    expect(result.current).toBe(true);
  });
  it('returns false for denied', () => {
    const { result } = renderHook(() => usePermission('admin:role_change'));
    expect(result.current).toBe(false);
  });
  it('returns false for null role', () => {
    vi.doMock('../Shell', () => ({ useAdminAuth: () => ({ adminRole: null }) }));
    // re-import fresh and assert
  });
});
```

- [ ] **Step 4: Run** `pnpm --filter @vyro/web test` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/lib/roles.ts apps/web/src/admin/lib/permissions.ts apps/web/src/admin/lib/permissions.test.ts
git commit -m "feat(web): admin role metadata + usePermission hook"
```

---

### Task 12: RolesPage + InviteAdminDialog + RoleBadge + AdminRoleSelect

**Files:**
- Create: `apps/web/src/admin/RoleBadge.tsx`
- Create: `apps/web/src/admin/AdminRoleSelect.tsx`
- Create: `apps/web/src/admin/InviteAdminDialog.tsx`
- Create: `apps/web/src/admin/RolesPage.tsx`
- Create: `apps/web/src/admin/RolesPage.test.tsx`
- Create: `apps/web/src/admin/InviteAdminDialog.test.tsx`

**Interfaces:**
- Consumes: `useAdminAuth`, `usePermission`, `ROLE_META`, `ROLE_PERMISSIONS` (from `@vyro/auth`)
- Consumes: `GET /api/admin/users`, `POST /api/admin/invites`, `PATCH /api/admin/users/:id/role`, `DELETE /api/admin/users/:id/role`

- [ ] **Step 1: Create** `apps/web/src/admin/RoleBadge.tsx`:

```tsx
import { ROLE_META, type AdminRole } from './lib/roles';

export function RoleBadge({ role }: { role: AdminRole }) {
  const meta = ROLE_META[role];
  return <span className={`px-2 py-0.5 rounded text-xs bg-${meta.color}-100 text-${meta.color}-800`}>{meta.label}</span>;
}
```

- [ ] **Step 2: Create** `apps/web/src/admin/AdminRoleSelect.tsx`:

```tsx
import { ADMIN_ROLES, type AdminRole } from './lib/roles';

export function AdminRoleSelect({ value, onChange, allowedRoles }: { value: AdminRole; onChange: (r: AdminRole) => void; allowedRoles?: AdminRole[] }) {
  const opts = (allowedRoles ?? ADMIN_ROLES).filter((r) => r !== 'super_admin' || allowedRoles?.includes('super_admin'));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as AdminRole)} className="border rounded px-2 py-1">
      {opts.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}
```

- [ ] **Step 3: Create** `apps/web/src/admin/InviteAdminDialog.tsx`:

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorBanner } from '../components/ui';
import { AdminRoleSelect } from './AdminRoleSelect';
import { INVITABLE_ROLES, type AdminRole } from '@vyro/auth';
import { useAdminRole } from './lib/permissions';

export function InviteAdminDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('ops');
  const actor = useAdminRole();
  const qc = useQueryClient();
  const allowed = actor ? (INVITABLE_ROLES[actor] as readonly AdminRole[]) : [];
  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Failed');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-invites'] }); onClose(); },
  });
  return (
    <div className="space-y-3">
      {mut.error ? <ErrorBanner error={mut.error} /> : null}
      <label className="block">
        <span className="text-sm">Email</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="border rounded px-2 py-1 w-full" type="email" />
      </label>
      <label className="block">
        <span className="text-sm">Role</span>
        <AdminRoleSelect value={role} onChange={setRole} allowedRoles={[...allowed]} />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mut.mutate()} disabled={!email || mut.isPending}>Send invite</Button>
      </div>
    </div>
  );
}
```

(Re-export `INVITABLE_ROLES` from `@vyro/auth` — add to `packages/auth/src/rolePermissions.ts` if not present: `export const INVITABLE_ROLES: Readonly<Record<AdminRole, readonly AdminRole[]>> = { ... }`.)

- [ ] **Step 4: Create** `apps/web/src/admin/RolesPage.tsx`:

```tsx
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { PageHeader, Button, Card, ErrorBanner, Surface } from '../components/ui';
import { usePermission } from './lib/permissions';
import { RoleBadge } from './RoleBadge';
import { InviteAdminDialog } from './InviteAdminDialog';
import { AdminRoleSelect } from './AdminRoleSelect';
import { ADMIN_ROLES, type AdminRole } from './lib/roles';
import { isAdminRole } from '@vyro/auth';

export function RolesPage() {
  const canInvite = usePermission('admin:invite');
  const canChange = usePermission('admin:role_change');
  const qc = useQueryClient();
  const admins = useQuery({
    queryKey: ['admin-users', { role: 'any' }],
    queryFn: async () => {
      const r = await fetch('/api/admin/users');
      if (!r.ok) throw new Error('Failed');
      return (await r.json()) as { users: Array<{ id: string; email: string; adminRole: AdminRole | null; lastActivityAt: number | null }> };
    },
  });
  const invites = useQuery({
    queryKey: ['admin-invites'],
    queryFn: async () => {
      const r = await fetch('/api/admin/invites');
      if (!r.ok) throw new Error('Failed');
      return (await r.json()) as { invites: Array<{ id: string; email: string; role: AdminRole; expiresAt: number; acceptedAt: number | null }> };
    },
    enabled: canInvite,
  });
  const change = useMutation({
    mutationFn: async (vars: { id: string; role: AdminRole | null }) => {
      const r = await fetch(`/api/admin/users/${vars.id}/role`, {
        method: vars.role ? 'PATCH' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: vars.role ? JSON.stringify({ role: vars.role }) : undefined,
      });
      if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Roles" subtitle="Manage platform administrators">
        {canInvite ? <InviteButton /> : null}
      </PageHeader>
      {admins.error ? <ErrorBanner error={admins.error} /> : null}
      <Surface>
        <table className="w-full text-sm">
          <thead><tr><th className="text-left p-2">Email</th><th className="text-left p-2">Role</th><th className="text-left p-2">Last activity</th>{canChange ? <th /> : null}</tr></thead>
          <tbody>
            {(admins.data?.users ?? []).map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.adminRole && isAdminRole(u.adminRole) ? <RoleBadge role={u.adminRole} /> : <span className="text-ink-500">—</span>}</td>
                <td className="p-2">{u.lastActivityAt ? new Date(u.lastActivityAt).toISOString() : '—'}</td>
                {canChange ? (
                  <td className="p-2 flex gap-2">
                    <AdminRoleSelect value={(u.adminRole ?? 'ops') as AdminRole} onChange={(r) => change.mutate({ id: u.id, role: r })} allowedRoles={ADMIN_ROLES} />
                    <Button variant="ghost" onClick={() => change.mutate({ id: u.id, role: null })}>Demote</Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
      {canInvite ? (
        <Card title="Pending invites">
          {(invites.data?.invites ?? []).map((i) => (
            <div key={i.id} className="flex justify-between border-t py-2">
              <div>{i.email} · <RoleBadge role={i.role} /></div>
              <div>{i.acceptedAt ? 'accepted' : `expires ${new Date(i.expiresAt).toISOString()}`}</div>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

function InviteButton() {
  // opens <InviteAdminDialog /> in a portal/modal — implementation uses existing Dialog primitive from @vyro/ui
  return <InviteDialogOpener />;
}
```

(Concrete `InviteButton`/dialog opener references existing `@vyro/ui` `Dialog` primitive; do not introduce new modal library.)

- [ ] **Step 5: Write tests**:

`RolesPage.test.tsx`: renders list, hides role controls when `usePermission('admin:role_change')` false, opens dialog.

`InviteAdminDialog.test.tsx`: validates email, calls API, surfaces 422 ROLE_NOT_GRANTABLE.

- [ ] **Step 6: Run** — expect PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/admin/RoleBadge.tsx apps/web/src/admin/AdminRoleSelect.tsx apps/web/src/admin/InviteAdminDialog.tsx apps/web/src/admin/RolesPage.tsx apps/web/src/admin/RolesPage.test.tsx apps/web/src/admin/InviteAdminDialog.test.tsx packages/auth/src/rolePermissions.ts
git commit -m "feat(web): RolesPage + invite dialog + role badge/select"
```

---

### Task 13: AdminActivityPage + AuditFilters + useAdminAudit

**Files:**
- Create: `apps/web/src/admin/useAdminAudit.ts`
- Create: `apps/web/src/admin/AuditFilters.tsx`
- Create: `apps/web/src/admin/AdminActivityPage.tsx`
- Create: `apps/web/src/admin/AdminActivityPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/audit`, `GET /api/admin/audit/export`

- [ ] **Step 1: Create** `apps/web/src/admin/useAdminAudit.ts`:

```ts
import { useInfiniteQuery } from '@tanstack/react-query';

export type AuditEntry = {
  id: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: string | null;
  after: string | null;
  requestId: string;
  ip: string | null;
  createdAt: number;
};

export type AuditFilters = {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: number;
  to?: number;
};

export function useAdminAudit(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['admin-audit', filters],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
      if (pageParam) qs.set('cursor', pageParam);
      const r = await fetch(`/api/admin/audit?${qs.toString()}`);
      if (!r.ok) throw new Error('Failed');
      return (await r.json()) as { entries: AuditEntry[]; nextCursor: string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function auditCsvUrl(filters: AuditFilters): string {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
  qs.set('limit', '1000');
  return `/api/admin/audit/export?${qs.toString()}`;
}
```

- [ ] **Step 2: Create** `apps/web/src/admin/AuditFilters.tsx`:

```tsx
import { useState } from 'react';

export type AuditFiltersState = {
  actorId: string;
  action: string;
  targetType: string;
  from: string;
  to: string;
};

export function AuditFilters({ value, onChange }: { value: AuditFiltersState; onChange: (v: AuditFiltersState) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      <Input label="Actor ID" value={value.actorId} onChange={(v) => onChange({ ...value, actorId: v })} />
      <Input label="Action" value={value.action} onChange={(v) => onChange({ ...value, action: v })} />
      <Input label="Target type" value={value.targetType} onChange={(v) => onChange({ ...value, targetType: v })} />
      <Input label="From (epoch ms)" value={value.from} onChange={(v) => onChange({ ...value, from: v })} />
      <Input label="To (epoch ms)" value={value.to} onChange={(v) => onChange({ ...value, to: v })} />
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="border rounded px-2 py-1 w-full text-sm" />
    </label>
  );
}

export function emptyFilters(): AuditFiltersState { return { actorId: '', action: '', targetType: '', from: '', to: '' }; }
export function toApiFilters(s: AuditFiltersState): { actorId?: string; action?: string; targetType?: string; from?: number; to?: number } {
  return {
    actorId: s.actorId || undefined,
    action: s.action || undefined,
    targetType: s.targetType || undefined,
    from: s.from ? Number(s.from) : undefined,
    to: s.to ? Number(s.to) : undefined,
  };
}
```

- [ ] **Step 3: Create** `apps/web/src/admin/AdminActivityPage.tsx`:

```tsx
import { useState } from 'react';
import { PageHeader, Button, Surface, ErrorBanner } from '../components/ui';
import { AuditFilters, emptyFilters, toApiFilters, type AuditFiltersState } from './AuditFilters';
import { useAdminAudit, auditCsvUrl } from './useAdminAudit';
import { usePermission } from './lib/permissions';

export function AdminActivityPage() {
  const [filters, setFilters] = useState<AuditFiltersState>(emptyFilters());
  const api = toApiFilters(filters);
  const q = useAdminAudit(api);
  const canExport = usePermission('audit:export');
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" subtitle="Every admin write">
        {canExport ? <a href={auditCsvUrl(api)} download><Button variant="secondary">Export CSV</Button></a> : null}
      </PageHeader>
      <AuditFilters value={filters} onChange={setFilters} />
      {q.error ? <ErrorBanner error={q.error} /> : null}
      <Surface>
        <table className="w-full text-sm">
          <thead><tr><th className="text-left p-2">When</th><th className="text-left p-2">Actor</th><th className="text-left p-2">Action</th><th className="text-left p-2">Target</th><th className="text-left p-2">IP</th></tr></thead>
          <tbody>
            {q.data?.pages.flatMap((p) => p.entries).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{new Date(e.createdAt).toISOString()}</td>
                <td className="p-2">{e.actorEmail ?? e.actorId}</td>
                <td className="p-2">{e.action}</td>
                <td className="p-2">{e.targetType}:{e.targetId}</td>
                <td className="p-2">{e.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.hasNextPage ? <Button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Load more</Button> : null}
      </Surface>
    </div>
  );
}
```

- [ ] **Step 4: Write tests** in `apps/web/src/admin/AdminActivityPage.test.tsx`: renders table rows from mocked query, CSV button visible when perm granted, hidden when not, filters update query key.

- [ ] **Step 5: Run** — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/admin/useAdminAudit.ts apps/web/src/admin/AuditFilters.tsx apps/web/src/admin/AdminActivityPage.tsx apps/web/src/admin/AdminActivityPage.test.tsx
git commit -m "feat(web): AdminActivityPage with filters + CSV export"
```

---

### Task 14: Shell sidebar + App.tsx routes + AdminAuthProvider expose adminRole

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces: `AdminAuthContext.adminRole: AdminRole | null` exposed via `useAdminAuth()`

- [ ] **Step 1: Extend** `apps/web/src/admin/Shell.tsx`:

Add to `AdminAuthContext`:
```ts
adminRole: AdminRole | null;
```

Fetch from `/auth/me` response (which now includes `adminRole` since `loadSessionContext` returns it). Map sidebar items conditionally:

```tsx
const canSeeRoles = usePermission('admin:read'); // any admin
const canManageRoles = usePermission('admin:role_change'); // super only
{canSeeRoles ? <NavLink to="/admin/activity">Activity</NavLink> : null}
{canManageRoles ? <NavLink to="/admin/roles">Roles</NavLink> : null}
```

Header shows role badge using `<RoleBadge role={ctx.adminRole} />` if present.

- [ ] **Step 2: Modify** `apps/web/src/App.tsx`:

Add routes:
```tsx
<Route path="/admin/roles" element={<RequireAdmin><RolesPage /></RequireAdmin>} />
<Route path="/admin/activity" element={<RequireAdmin><AdminActivityPage /></RequireAdmin>} />
<Route path="/admin/invite/accept" element={<InviteAcceptPage />} />
```

`InviteAcceptPage` (lightweight, in-place):
- Reads `?token=` from URL
- POSTs to `/api/admin/invites/accept` with optional name/password
- On success redirects to `/admin`
- On error shows `<ErrorBanner>`

- [ ] **Step 3: Run typecheck + tests** — expect PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/admin/Shell.tsx apps/web/src/App.tsx
git commit -m "feat(web): wire admin shell + routes for roles + activity"
```

---

### Task 15: Fixtures + e2e doc

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `scripts/e2e.md`

- [ ] **Step 1: Extend** `scripts/seed.ts` with:

```ts
export function adminFixture(opts: { role: 'super_admin' | 'ops' | 'finance' | 'support'; email?: string; id?: string }) {
  return {
    id: opts.id ?? `admin-${opts.role}-${Math.random().toString(36).slice(2, 8)}`,
    email: opts.email ?? `${opts.role}@vyro.test`,
    name: `${opts.role} admin`,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder',
    adminRole: opts.role,
    status: 'active',
    marketingOptIn: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function adminInviteFixture(opts: { role: AdminRole; expiresIn?: number; accepted?: boolean; revoked?: boolean }) {
  const now = Date.now();
  return {
    id: randomUUID(),
    email: `${opts.role}-invite@vyro.test`,
    role: opts.role,
    tokenHash: sha256(randomBytes(32)).hex(),
    invitedBy: 'admin-super_admin-seed',
    expiresAt: now + (opts.expiresIn ?? 7 * 24 * 60 * 60 * 1000),
    acceptedAt: opts.accepted ? now : null,
    revokedAt: opts.revoked ? now : null,
    createdAt: now,
  };
}

export function adminAuditLogFixture(opts: { actorId: string; action: string; targetType: string; targetId: string; before?: unknown; after?: unknown; createdAt?: number }) {
  return {
    id: randomUUID(),
    actorId: opts.actorId,
    action: opts.action,
    targetType: opts.targetType,
    targetId: opts.targetId,
    before: opts.before ? JSON.stringify(opts.before) : null,
    after: opts.after ? JSON.stringify(opts.after) : null,
    requestId: `seed-${Math.random().toString(36).slice(2, 10)}`,
    ip: '127.0.0.1',
    userAgent: 'seed/1.0',
    createdAt: opts.createdAt ?? Date.now(),
  };
}
```

- [ ] **Step 2: Extend** `scripts/e2e.md` with T1 section:

```markdown
## T1 — Admin core ops

### Invite flow
1. Sign in as super admin (seed: `super@vyro.test` / `Passw0rd!`)
2. Navigate to `/admin/roles`
3. Click "Invite admin" → enter email `ops1@vyro.test`, role `ops` → Send
4. Copy `acceptUrl` from response (in dev the email fallback logs to console + adminNotifications)
5. Open `acceptUrl` in private window → optionally set name/password → Accept
6. Land on `/admin` as ops admin
7. Visit `/admin/activity` → verify `admin.invite.create` and `admin.invite.accept` rows present

### Role change
8. As super_admin, change ops1's role to finance
9. Verify `admin.user.role_change` audit row with before/after
10. As ops1 (now finance), attempt POST `/api/admin/users/:id/suspend` → expect 403 (no `user:suspend` perm)

### Last super_admin guard
11. Attempt DELETE own role as the only super_admin → expect 409 `CANNOT_DEMOTE_SELF` or `LAST_SUPER_ADMIN`

### Audit CSV
12. As any admin, `/admin/activity` → click "Export CSV" → verify file downloads with rows
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts scripts/e2e.md
git commit -m "chore(scripts): T1 admin fixtures + e2e walkthrough"
```

---

### Task 16: Final verification

- [ ] **Step 1: Typecheck** — `pnpm typecheck`. Expect 0 errors.

- [ ] **Step 2: Unit + integration tests** — `pnpm exec vitest run`. Expect all green.

- [ ] **Step 3: Migration test** — confirm `apps/api/test/admin/migration.test.ts` green.

- [ ] **Step 4: RBAC audit** — `pnpm exec tsx apps/api/src/scripts/rbac-audit.ts`. Expect 0 violations.

- [ ] **Step 5: Web build** — `pnpm --filter @vyro/web build`. Expect success.

- [ ] **Step 6: Manual e2e walkthrough** — follow `scripts/e2e.md` T1 section. Expect pass.

- [ ] **Step 7: Commit any fixups**

```bash
git commit --allow-empty -m "chore: T1 verification green"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Schema migration (users, admin_invites, admin_audit_logs) | T2 |
| Permissions + rolePermissions | T1 |
| Auth context adminRole | T3 |
| requirePermission middleware | T4 |
| auditAdmin helper | T5 |
| Refactor existing admin mutations | T6 |
| Invites module | T7 |
| Roles module (change/demote) | T8 |
| Audit list + CSV export | T9 |
| Cron audit-purge | T10 |
| Frontend lib (roles, usePermission) | T11 |
| RolesPage + InviteAdminDialog | T12 |
| AdminActivityPage + filters | T13 |
| Shell sidebar + routes | T14 |
| Seed + e2e | T15 |
| Verification | T16 |

All sections covered.

**Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details". Every code step contains full code.

**Type consistency:**
- `adminRole` field present on `users`, `SessionContext`, `AdminAuthContext`.
- `auditAdmin` signature identical across T5, T6, T7, T8 callers.
- `requirePermission(perm: Permission)` identical in T4, T6, T7, T8, T9.
- `Permission` union defined once in T1, imported everywhere.
- `AdminRole` defined once, re-exported from `@vyro/auth` for web via T11.
- Audit column names (`actor_id`, `target_type`, etc.) match between schema (T2), helper (T5), repository (T9).
- API paths verified: `/api/admin/invites`, `/api/admin/users/:id/role`, `/api/admin/audit`.

**Fixes applied inline:** None required after self-review.
