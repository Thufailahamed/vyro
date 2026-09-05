# VYRO Admin Core Ops — T1 Design

**Date:** 2026-09-06
**Status:** Approved
**Parent:** `2026-09-04-vyro-mvp-design.md`
**Predecessor:** `2026-09-05-vyro-admin-portal-design.md` (sub-project C)
**Phase:** 1 of 8 in enterprise admin roadmap

## Goal

Replace the boolean `isPlatformAdmin` model with a 4-role taxonomy, add admin invite/accept flow, and capture an immutable admin activity log on every admin write action. Unblocks per-feature RBAC (T2–T7) and per-admin audit.

## Scope

### Schema changes

**`users` table**
- DROP `is_platform_admin` (boolean).
- ADD `admin_role` enum: `'super_admin' | 'ops' | 'finance' | 'support' | NULL`.
- ADD `admin_invited_at` timestamp nullable.
- ADD `admin_invited_by` userId nullable (FK self).
- Index: `idx_users_admin_role` partial WHERE `admin_role IS NOT NULL`.
- Migration backfill: existing `is_platform_admin = 1` rows → `admin_role = 'super_admin'`.

**`admin_invites` table (new)**
| col | type |
|---|---|
| id | uuid pk |
| email | text indexed |
| role | enum same as `admin_role` |
| token_hash | text (sha256 of 32 random bytes) |
| invited_by | userId fk users.id |
| expires_at | timestamp |
| accepted_at | timestamp nullable |
| revoked_at | timestamp nullable |

**`admin_audit_logs` table (new)**
| col | type |
|---|---|
| id | uuid pk |
| actor_id | userId fk users.id |
| action | text (e.g. `user.suspend`, `dispute.resolve`) |
| target_type | text (`user`, `business`, `supplier`, `dispute`, `settings`, `payout`) |
| target_id | text |
| before | json nullable |
| after | json nullable |
| request_id | text indexed |
| ip | text |
| user_agent | text |
| created_at | timestamp indexed |

Indexes:
- `idx_admin_audit_created` on `created_at`
- `idx_admin_audit_actor` on `(actor_id, created_at)`
- `idx_admin_audit_target` on `(target_type, target_id, created_at)`

### Auth/RBAC

**`packages/auth/src/permissions.ts`** — `Permission` key union:
```
user:read | user:suspend | user:unsuspend
business:read | business:freeze | business:unfreeze
supplier:read | supplier:freeze | supplier:unfreeze
product:read | product:moderate
category:read | category:write
type:read | type:write
dispute:read | dispute:resolve | dispute:note
payment:read | payment:refund
payout:read | payout:approve
ledger:read | invoice:read
settings:read | settings:write
admin:read | admin:invite | admin:role_change
audit:read | audit:export
```

**`packages/auth/src/rolePermissions.ts`** — frozen `Record<AdminRole, ReadonlySet<Permission>>`:
```
super_admin → all
ops         → user:*, business:*, supplier:*, product:moderate, category:*, type:*, dispute:read, dispute:note, admin:invite, audit:read
finance     → payment:*, payout:*, ledger:read, invoice:read, settings:read, audit:read
support     → *:read, dispute:read, dispute:note, audit:read

### Invitable roles per actor
- super_admin → can invite any of {ops, finance, support, super_admin}
- ops → can invite any of {ops, finance, support} (NOT super_admin)
- finance, support → cannot invite
```

**`packages/auth/src/context.ts`** — `loadSessionContext()` returns `adminRole: AdminRole | null` (replaces `isAdmin`).

**`apps/api/src/middleware/rbac.ts`** — add `requirePermission(perm: Permission)`. Keep `requireRole({ admin: true })` as "any admin" shim.

**`apps/api/src/scripts/rbac-audit.ts`** — extend: mutating route must have `requireRole` OR `requirePermission`; references must exist in `permissions.ts` union.

### API endpoints

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/admin/invites` | `admin:invite` | Create invite + send magic email |
| GET | `/api/admin/invites` | `admin:invite` | List invites (filter `?status=`) |
| DELETE | `/api/admin/invites/:id` | `admin:invite` | Revoke pending invite |
| POST | `/api/admin/invites/accept` | public (token) | Accept invite; create/upgrade user; set role; login |
| PATCH | `/api/admin/users/:id/role` | `admin:role_change` | Change role (super_admin only) |
| DELETE | `/api/admin/users/:id/role` | `admin:role_change` | Demote (set role NULL) |
| GET | `/api/admin/users` (extend) | `admin:read` | Add `?role=`, `?isAdmin=` filter, `last_activity_at` |
| GET | `/api/admin/audit` | `audit:read` | Paginated list (cursor, filters) |
| GET | `/api/admin/audit/export` | `audit:export` | CSV stream |
| Cron | `/api/cron/audit-purge` | internal | Daily delete `> 365d` |

### Service layer

```
apps/api/src/modules/admin/
├── routes.ts                   # mount + apply session + default permission
├── lib/audit.ts                # auditAdmin({ ctx, action, target, before, after })
├── invites/
│   ├── routes.ts
│   ├── repository.ts           # createInvite, listPending, findByTokenHash, markAccepted, revoke
│   ├── service.ts              # createInviteForEmail, acceptInvite, revokeInvite, sendMagicEmail
│   └── schema.ts               # Zod
├── roles/
│   ├── routes.ts
│   ├── repository.ts           # setAdminRole, listAdmins, countSuperAdmins
│   ├── service.ts              # assertNotLastSuperAdmin, changeRole, demote
│   └── schema.ts
└── audit/
    ├── routes.ts
    ├── repository.ts           # list (filters + pagination), purgeExpired, streamCsv
    └── schema.ts
```

`auditAdmin` helper called from every mutating admin route after success. Pulls actor_id from session, request_id from middleware, ip/ua from request. Errors swallowed (logged) so audit failure doesn't block ops.

Existing routes wrapped: `users` suspend/unsuspend, supplier/business freeze/unfreeze, dispute resolve, settings update, payouts approve.

### Frontend

```
apps/web/src/admin/
├── RolesPage.tsx               # list admins + invites tabs
├── InviteAdminDialog.tsx       # email + role form
├── AdminRoleSelect.tsx         # dropdown bound to AdminRole enum
├── RoleBadge.tsx               # colored badge per role
├── AdminActivityPage.tsx       # filter bar + table + CSV export
├── AuditFilters.tsx            # actor/action/target/date range
├── useAdminAudit.ts            # paginated query hook
└── lib/
    ├── roles.ts                # role metadata (label, color, description)
    └── permissions.ts          # client-side usePermission hook for UI gating
```

Routes:
- `/admin/roles` — super_admin only
- `/admin/roles/invites` — pending invites tab
- `/admin/activity` — any admin

Shell sidebar updated: `Roles` (gated by `usePermission('admin:read')`), `Activity` (any admin).

Client-side `usePermission(perm)` is UX only; server is authoritative.

### Data flow

**Invite accept:**
1. super_admin opens InviteAdminDialog → POST `/api/admin/invites` {email, role}
2. service.createInviteForEmail inserts `admin_invites` with `token_hash = sha256(randomBytes(32))`, returns `acceptUrl = /admin/invite/accept?token=<base64>`
3. `sendMagicEmail` via existing notify pipeline; fallback logs to adminNotifications
4. Invite email row + audit `admin.invite.create { before: null, after: {email, role} }`
5. Invitee opens acceptUrl → POST `/api/admin/invites/accept` {token, password?}
6. service.acceptInvite: find invite by sha256(token); reject if expired/revoked/accepted; upsert user (better-auth) with email verified; UPDATE users SET admin_role; UPDATE admin_invites SET accepted_at; audit `admin.invite.accept { target: user.id, before: {role:null}, after: {role} }`; set session cookie; redirect /admin

**Role change:**
1. PATCH `/api/admin/users/:id/role` {role}
2. requirePermission('admin:role_change') (super_admin only)
3. service.changeRole:
   - load target; guard `target.id === actor.id && newRole !== 'super_admin'` → 409 CANNOT_DEMOTE_SELF
   - guard demote-from-super_admin: `countSuperAdmins() === 1 && target.admin_role === 'super_admin'` → 409 LAST_SUPER_ADMIN
   - guard concurrent: UPDATE ... WHERE admin_role = expected; 0 rows → 409 ROLE_CHANGED
   - UPDATE users SET admin_role = newRole
4. audit `admin.user.role_change { before: {role}, after: {role} }`

**Demote:** DELETE same guards; sets admin_role NULL. Active sessions retain role until refresh (T6 will fully revoke).

**Audit capture:** helper called after each mutating admin route. Existing routes refactored to load before-state, perform mutation, call auditAdmin.

**Activity page:** AuditFilters compose query → GET `/api/admin/audit?actor=&action=&target_type=&from=&to=&cursor=&limit=`. CSV: GET `/audit/export?...` streamed.

**Daily purge:** CF Workers Cron `0 3 * * *` → DELETE rows `> 365d`. Triggers declared in `wrangler.toml`.

## Error handling

| Code | Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod fail |
| `UNAUTHENTICATED` | 401 | session() fail |
| `FORBIDDEN` | 403 | permission denied |
| `NOT_FOUND` | 404 | invite token invalid, user not found |
| `INVITE_EXPIRED` | 410 | past `expires_at` |
| `INVITE_REVOKED` | 410 | `revoked_at` set |
| `INVITE_ACCEPTED` | 409 | already accepted |
| `ROLE_CONFLICT` | 409 | invitee already has different role |
| `USER_SUSPENDED` | 409 | invitee account suspended |
| `LAST_SUPER_ADMIN` | 409 | would remove last super_admin |
| `CANNOT_DEMOTE_SELF` | 409 | actor demoting self |
| `ROLE_CHANGED` | 409 | optimistic concurrency miss |
| `EMAIL_SEND_FAILED` | 502 | invite email failed (invite row kept for retry) |

### Edge cases

1. Invite email has suspended user → 409 USER_SUSPENDED
2. Accept after partial create (crash between user-create and accepted_at) → idempotent re-run
3. Audit write fails → log stderr, do not fail mutation. Documented; full reconciliation is T7.
4. CSV export >10k rows → stream with cursor pagination, soft cap 100k rows
5. Cron purge fails → next-day retry
6. Demoted admin's active session retains role until refresh. T1 scope; full revocation T6.
7. Permission matrix change → CI lint: every role must define all keys referenced by routes
8. super_admin demoted by peer → allowed, logged with severity, email alert via notify stub

## Migration

`packages/db/migrations/00XX_admin_core_ops.sql`:
```sql
ALTER TABLE users ADD COLUMN admin_role TEXT;
ALTER TABLE users ADD COLUMN admin_invited_at TEXT;
ALTER TABLE users ADD COLUMN admin_invited_by TEXT REFERENCES users(id);
UPDATE users SET admin_role = 'super_admin' WHERE is_platform_admin = 1;
ALTER TABLE users DROP COLUMN is_platform_admin;
CREATE INDEX idx_users_admin_role ON users(admin_role) WHERE admin_role IS NOT NULL;

CREATE TABLE admin_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_admin_invites_email ON admin_invites(email);
CREATE INDEX idx_admin_invites_pending ON admin_invites(expires_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before TEXT,
  after TEXT,
  request_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_admin_audit_created ON admin_audit_logs(created_at);
CREATE INDEX idx_admin_audit_actor ON admin_audit_logs(actor_id, created_at);
CREATE INDEX idx_admin_audit_target ON admin_audit_logs(target_type, target_id, created_at);
```

Drizzle schema mirrors. Migration runs via `pnpm db:migrate`. Tested in miniflare D1 via vitest-pool-workers.

### Down migration

Re-add `is_platform_admin` boolean, copy from `admin_role='super_admin'`, drop new columns + tables. Tested in `migration.test.ts`.

### Backwards compat

None required (internal admin schema). Document in CHANGELOG. `packages/auth/src/context.ts` reads `admin_role`; all consumers recompile together.

## Testing

### Unit
- `packages/auth/test/permissions.test.ts` — matrix integrity
- `packages/auth/test/rolePermissions.test.ts` — frozen shape
- `packages/auth/test/auditAdmin.test.ts` — helper swallows errors, populates request_id/ip/ua
- `packages/db/test/adminInvites.repository.test.ts` — token hashing, expiry, idempotency

### API integration (`apps/api/test/admin/`)
- `roles.test.ts` — last-super guard, self-demote guard, role-conflict, role-changed 409
- `invites.test.ts` — create/list/revoke/accept flows (existing user, new user, expired, revoked, accepted, suspended)
- `audit.test.ts` — filters, pagination, CSV streaming, perm enforcement
- `users.test.ts` (extend) — audit row on suspend/unsuspend
- `businessFreeze.test.ts` (extend) — audit row
- `freezeUnfreeze.test.ts` (extend) — audit row
- `dispute.test.ts` (extend) — audit row on resolve
- `settings/admin.test.ts` (extend) — audit row on settings update
- `payouts/admin.test.ts` (new) — audit row on payout approve
- `migration.test.ts` — backfill + rollback
- `audit-purge.test.ts` — cron handler

### RBAC audit (`apps/api/src/scripts/rbac-audit.ts` extend)
- Mutating route must have requireRole OR requirePermission
- Permission refs must exist in union
- Run in CI

### Frontend
- `apps/web/src/admin/RolesPage.test.tsx` — renders, opens dialog, hides controls for non-super
- `apps/web/src/admin/InviteAdminDialog.test.tsx` — email validation, API call, errors
- `apps/web/src/admin/AdminActivityPage.test.tsx` — filters, pagination, CSV button
- `apps/web/src/admin/lib/permissions.test.ts` — usePermission truth table

### E2E manual (`scripts/e2e.md` extend)
- Invite → email → accept → land on /admin → audit row visible
- super promotes ops → finance → ops attempts freeze business → 403
- Last super_admin demote attempt → 409
- Audit CSV export download

### Coverage targets
- API admin routes: 100% lines + branches
- Auth/permissions matrix: 100%
- Audit helper: 100%
- Admin UI: smoke + interaction tests

### Fixtures (`scripts/seed.ts` extend)
```ts
adminFixture({ role: 'super_admin' | 'ops' | 'finance' | 'support' })
adminInviteFixture({ role, expiresAt, acceptedAt?, revokedAt? })
adminAuditLogFixture({ actor, action, target })
```

## Verification

- `pnpm exec vitest run` — all green
- `pnpm typecheck` — clean
- `pnpm --filter @vyro/web build` — clean
- `pnpm db:migrate` local + remote — clean
- `pnpm exec tsx apps/api/src/scripts/rbac-audit.ts` — clean
- Manual e2e walkthrough `scripts/e2e.md` T1 section — pass

## Out of scope (later phases)

- T2–T7: catalog moderation, money/orders, trust&safety, platform config, security, observability, UX polish
- T6 will add full session revocation on demote, 2FA enforcement, impersonation, GDPR export
- T5 will add feature flags, templates, webhooks admin
- T7 will add health dashboard, jobs admin
- T8 will add global search, audit export scheduling, saved views

## Open follow-ups

- Notify pipeline for invite emails — T4 will refactor; T1 falls back to adminNotifications log
- super_admin invite-grants-other-super_admin capability — default allowed; revisit if abuse
