# VYRO Sub-project A — Foundations (API Surface for B/C/D) Design

**Date:** 2026-09-05
**Status:** Approved (brainstorm complete, pending spec review)
**Owner:** VYRO engineering
**Scope:** Sub-project A of the full "implement remaining spec'd pages" effort. UI work lives in sub-projects B, C, D.

## 1. Summary

VYRO MVP spine + redesign polish is shipped (16 web pages, 5 admin pages, 13 API modules, 21 DB tables). Remaining per redesign spec §17: 20+ new routes across profile settings, supplier portal, admin portal. Those pages need real data.

This spec covers the API + schema foundations so the page sub-projects can wire real data without each one re-discovering the same gaps:

- Lazy-fill `user_settings`, `supplier_settings`, `platform_settings` so settings UI never hits a 404 on first load.
- Expose settings CRUD endpoints for user, supplier, and admin scopes.
- Expose `businesses/types` and `suppliers/types` read endpoints (currently absent — onboarding pages fetch them and silently fail).
- Add minimal analytics aggregations for supplier + admin dashboards.
- Add admin user list + suspend/unsuspend.

Out of scope (deferred):
- Notifications queue/CF Queues consumer (MVP deferred in 2026-09-04 spec).
- Disputes workflow UI.
- Ratings/reviews.
- AI package (`packages/ai` stays placeholder).
- `apps/admin` bundle separation (admin stays inside `apps/web/src/admin`).
- Auth route changes — already in place (`sign-in`/`sign-up`/`sign-out` + `/me`).
- New product features, new order statuses, new roles.

## 2. Decisions locked

| Decision | Choice |
|---|---|
| Module pattern | `routes.ts` + `repository.ts` per module (existing convention) |
| Auth | session middleware + `requireRole({ business \| supplier \| admin })` |
| Validation | zod in `@vyro/validation`; `.strict()`; explicit field picking — no `...body` spread |
| Settings storage | `user_settings`, `supplier_settings`, `platform_settings` rows in D1 |
| Analytics queries | SQL aggregations against existing tables; no event stream |
| Analytics caching | 60s in-memory per Worker instance, keyed by `${range}:${dayBucket}` |
| Error envelope | existing `{ error: { code, message, details? } }` |
| Pagination | opaque uuidv7 cursor |
| Tests | Vitest + `@cloudflare/vitest-pool-workers` |
| Migration | one file `0042_settings.sql`, additive only |
| Money | unchanged from MVP spec (`_cents` integer, `LKR` default) |

## 3. Data model additions (D1 + Drizzle)

All new tables use `created_at` + `updated_at` (unix ms integer). IDs `uuidv7()`. Soft-delete via `deleted_at` where the entity is tenanted.

### 3.1 `user_settings`

```
user_settings
  user_id (uuidv7 pk, fk users.id on delete cascade)
  display_name (text nullable),
  avatar_url (text nullable),
  phone (text nullable),
  preferred_currency (text not null default 'LKR'),
  notify_order_updates (integer not null default 1), -- 0|1
  notify_messages (integer not null default 1),
  notify_marketing (integer not null default 0),
  two_factor_enabled (integer not null default 0),
  session_timeout_min (integer not null default 1440),
  updated_at (integer not null),
  created_at (integer not null)
```

Lazy-created on first read.

### 3.2 `supplier_settings`

```
supplier_settings
  supplier_id (uuidv7 pk, fk suppliers.id on delete cascade)
  -- company tab
  company_name (text nullable),
  registration_no (text nullable),
  tax_id (text nullable),
  contact_email (text nullable),
  contact_phone (text nullable),
  -- warehouse tab
  warehouse_address (text nullable),
  warehouse_city (text nullable),
  warehouse_district (text nullable),
  warehouse_lat (real nullable),
  warehouse_lng (real nullable),
  default_lead_time_days (integer nullable),
  -- payouts tab
  payout_method (text nullable check in ('bank','cash')),
  bank_name (text nullable),
  bank_account_no (text nullable),
  bank_branch (text nullable),
  -- notifications tab
  notify_new_orders (integer not null default 1),
  notify_low_stock (integer not null default 1),
  notify_payment_received (integer not null default 1),
  updated_at (integer not null),
  created_at (integer not null)
```

Created on supplier verification (admin action). Repository creates lazily on first read if missing.

### 3.3 `platform_settings`

```
platform_settings
  id (integer pk check id = 1)  -- singleton
  brand_name (text not null default 'VYRO'),
  support_email (text nullable),
  support_phone (text nullable),
  default_currency (text not null default 'LKR'),
  platform_fee_bps (integer not null default 250), -- 2.5%
  enable_business_signup (integer not null default 1),
  enable_supplier_signup (integer not null default 1),
  updated_at (integer not null),
  updated_by_user_id (uuidv7 nullable)
```

Seeded at migration time with one row `(id=1)`. Brand colour override deliberately omitted — cyan is locked for brand consistency (per redesign spec §5.3).

### 3.4 No changes to existing tables

`businessTypes` table already exists and has seed rows. `supplierTypes` does not exist — supplier categories are derived from existing `categories` table (configurable). We expose `/suppliers/types` as an alias of `/categories` (filtered active), or add a separate table if reviewers disagree. **Default: alias `/categories` filtered by `active=1`, sorted by `sort_order`.** Documenting here for review.

## 4. API surface (additions)

Mounted via `apps/api/src/index.ts` — new lines only, no removals.

### 4.1 Type endpoints (read)

```
GET /api/businesses/types
  Auth: any
  Response: { types: [{ id, slug, name, sortOrder }] }
  Behaviour: returns all rows where active=1, ordered by sort_order.

GET /api/suppliers/types
  Auth: any
  Response: { types: [{ id, slug, name, sortOrder }] }
  Behaviour: alias for categories where active=1 and parent_id is null (root categories).
```

### 4.2 User settings

```
GET /api/settings/me
  Auth: session required
  Response: UserSettings (full shape; defaults filled if row missing)
  Behaviour: lazy-upsert; read returns persisted values; missing fields defaulted.

PATCH /api/settings/me
  Body: { displayName?, avatarUrl?, phone?, preferredCurrency? }
  Auth: session required
  Response: UserSettings

GET /api/settings/me/notifications
PATCH /api/settings/me/notifications
  Body: { notifyOrderUpdates?, notifyMessages?, notifyMarketing? } (booleans)
  Response: { notifyOrderUpdates, notifyMessages, notifyMarketing }

GET /api/settings/me/security
PATCH /api/settings/me/security
  Body: { twoFactorEnabled?, sessionTimeoutMin? }
  Constraints: sessionTimeoutMin in {15,30,60,240,1440}
  Response: { twoFactorEnabled, sessionTimeoutMin }
```

### 4.3 Supplier settings

```
GET    /api/suppliers/:id/settings
PATCH  /api/suppliers/:id/settings
  Auth: supplier owner|manager of :id
  Body: any subset of { company.*, warehouse.*, payouts.*, notifications.* }
  Field picking explicit; .strict() zod.
  Response: full SupplierSettings shape
  Tenant guard: supplier_members.userId === ctx.userId AND role ∈ {owner,manager}
```

### 4.4 Admin settings

```
GET   /api/admin/settings
PATCH /api/admin/settings
  Auth: admin
  Body: any subset of { brandName, supportEmail, supportPhone, platformFeeBps,
                        enableBusinessSignup, enableSupplierSignup }
  Constraint: platformFeeBps in [0,1000]
  Response: full PlatformSettings
  Side effect: updates audit_logs row { action: 'platform_settings.update' }
```

### 4.5 Analytics

```
GET /api/analytics/supplier?supplierId=...&range=30d
  Auth: supplier member of supplierId OR admin
  Query: range ∈ {7d,30d,90d}
  Response:
    {
      range,
      metrics: {
        revenueCents, ordersCount, avgOrderValueCents,
        repeatCustomerRate, lowStockCount, avgLeadTimeDays
      },
      revenueTrend: [{ day: 'YYYY-MM-DD', cents: N }, ...],
      ordersByDay: [{ day, count }, ...],
      topProducts: [{ productId, name, revenueCents, units }]   -- top 10
    }

GET /api/analytics/admin?range=30d
  Auth: admin
  Response:
    {
      range,
      metrics: {
        gmvCents, takeRateCents, activeBuyers, activeSuppliers,
        newSignups, disputeRate, completionRate
      },
      gmvByDay: [{ day, cents }],
      topCategories: [{ categoryId, name, cents }],     -- top 10
      topRegions: [{ district, cents }]                  -- top 10
    }
```

### 4.6 Admin users

```
GET   /api/admin/users?cursor=&q=&role=
  Auth: admin
  Response: { items: [{ id, email, name, phone, isPlatformAdmin, status,
                        membershipsCount, createdAt }], nextCursor? }

POST  /api/admin/users/:id/suspend
POST  /api/admin/users/:id/unsuspend
  Auth: admin
  Effect: sets users.status = 'suspended' or 'active'
  Audit: writes audit_logs row
  On suspend: invalidates sessions (delete rows in sessions where user_id = :id)
```

## 5. Module layout

New files only — no rewrites:

```
apps/api/src/modules/
  businessTypes/
    routes.ts             router mounted at '/api' → exposes /businesses/types
    repository.ts         read-only (categories table actually)
  supplierTypes/
    routes.ts             router mounted at '/api' → exposes /suppliers/types
    repository.ts         read-only
  settings/
    routes.ts             user settings at /api/settings/*
    supplier.ts           supplier settings at /api/suppliers/:id/settings
    admin.ts              platform settings at /api/admin/settings
    repository.ts         user_settings ops
    supplierRepository.ts supplier_settings ops
    adminRepository.ts    platform_settings ops
    defaults.ts           default shapes
  analytics/
    supplier/routes.ts
    admin/routes.ts
    repo/supplier.ts
    repo/admin.ts
    cache.ts              60s TTL cache helper
  admin/
    users.ts              mounted at /api/admin/users + suspend endpoints
    usersRepository.ts

packages/validation/src/
  settings.ts             zod schemas (User, Notification, Security, Supplier, Platform)
  analytics.ts            range enum + query schema
  adminUsers.ts           list query + ID param
  businessTypes.ts        response schema (no input)

packages/db/src/schema/
  userSettings.ts
  supplierSettings.ts
  platformSettings.ts
  index.ts                add exports
```

## 6. Cross-cutting concerns

### 6.1 Lazy defaults

`user_settings`, `supplier_settings` rows created on first GET if missing. Repository functions:

```ts
getOrCreateUserSettings(db, userId): UserSettings
getOrCreateSupplierSettings(db, supplierId): SupplierSettings
getPlatformSettings(db): PlatformSettings   // singleton, seed row
```

Defaults defined in `settings/defaults.ts` and shared between repo + validation default schemas (single source of truth).

### 6.2 Tenant isolation

- `supplierSettings` repo takes (supplierId, ctx). Re-verifies `supplier_members` membership in same transaction before read/write. 404 (not 403) on miss.
- `analytics/supplier` repo re-verifies membership or admin flag.

### 6.3 Caching

`analytics/cache.ts` exports:

```ts
cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T>
```

In-memory `Map<string, { value, expiresAt }>`. Bounded LRU cap 256 entries. Stale-on-error preferred over DB-down 503.

Cache keys:
- `supplier:${supplierId}:${range}:${dayBucket}` (dayBucket = utc date)
- `admin:${range}:${dayBucket}`

### 6.4 Money

`revenueCents`, `avgOrderValueCents`, `gmvCents`, `takeRateCents` all integer. `takeRateCents = floor(gmvCents * platform_fee_bps / 10000)`.

### 6.5 Audit

Every write to `user_settings`, `supplier_settings`, `platform_settings`, `users.status` writes one `audit_logs` row. Repository helpers emit audit in same transaction.

### 6.6 Pagination

`GET /api/admin/users` cursor = uuidv7 of last seen row. Order by `created_at` desc, tiebreak by `id`. Cursor encoded base64url.

## 7. Error handling

Reuse existing `errorEnvelope` in `apps/api/src/lib/errors.ts`. Codes used by this spec:

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod fail; surface `flattened()` in details |
| `UNAUTHORIZED` | 401 | missing/expired session |
| `FORBIDDEN` | 403 | wrong role (non-tenant) |
| `NOT_FOUND` | 404 | id resolves but tenant guard fails |
| `CONFLICT` | 409 | unique constraint (e.g. reserved singleton id) |
| `INTERNAL` | 500 | unexpected; logs full trace |

Stack traces stripped from all responses. `onError` logs.

## 8. RBAC matrix (new routes only)

| Route | business | supplier | admin | anon |
|---|---|---|---|---|
| `GET /businesses/types` | yes | yes | yes | yes |
| `GET /suppliers/types` | yes | yes | yes | yes |
| `GET/PATCH /settings/me*` | any auth | — | — | 401 |
| `GET/PATCH /suppliers/:id/settings` | — | owner/manager of `:id` | — | 401 |
| `GET/PATCH /admin/settings` | — | — | yes | 401 |
| `GET /analytics/supplier` | — | owner/sales of `:id` | yes | 401 |
| `GET /analytics/admin` | — | — | yes | 401 |
| `GET /admin/users` | — | — | yes | 401 |
| `POST /admin/users/:id/suspend|unsuspend` | — | — | yes | 401 |

## 9. Testing

### 9.1 Unit (Vitest)

- zod schemas: rejects extra keys (mass-assignment), accepts valid, range clamping (`sessionTimeoutMin`).
- cursor encode/decode.
- analytics aggregation helpers (pure functions, no DB).

### 9.2 Service integration (`@cloudflare/vitest-pool-workers`)

Per-test local D1. Migrations applied, tables truncated between tests.

- `businessTypes/types.test.ts` — returns active types ordered, excludes inactive.
- `supplierTypes/categories.test.ts` — root categories only.
- `settings/user.test.ts` — lazy create on first read; defaults applied; PATCH partial updates; another user cannot read another user's settings (404).
- `settings/supplier.test.ts` — supplier A cannot read/write supplier B's settings (404); manager can write, sales cannot.
- `settings/admin.test.ts` — non-admin 403; PATCH writes audit row.
- `analytics/supplier.test.ts` — totals match raw PO sums; cancelled POs excluded; empty supplier returns 200 with zeros; range filtering correct.
- `analytics/admin.test.ts` — GMV calc excludes cancelled; takeRateCents math correct.
- `admin/users.test.ts` — cursor pagination; suspend flips status; suspended user's session removed; unsuspend restores.

### 9.3 HTTP layer

`app.fetch(req, env)` smoke against 401/403/404/200 for each route.

### 9.4 Coverage targets

- Repos ≥80%.
- RBAC matrix 100%.
- Settings defaults 100%.

### 9.5 What we don't add

- No Playwright. Manual click-through for the pages themselves (handled in sub-projects B/C/D).

## 10. Migration

`packages/db/drizzle/0042_settings.sql`:

```sql
CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  preferred_currency TEXT NOT NULL DEFAULT 'LKR',
  notify_order_updates INTEGER NOT NULL DEFAULT 1,
  notify_messages INTEGER NOT NULL DEFAULT 1,
  notify_marketing INTEGER NOT NULL DEFAULT 0,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  session_timeout_min INTEGER NOT NULL DEFAULT 1440,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE supplier_settings (
  supplier_id TEXT PRIMARY KEY,
  company_name TEXT,
  registration_no TEXT,
  tax_id TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  warehouse_address TEXT,
  warehouse_city TEXT,
  warehouse_district TEXT,
  warehouse_lat REAL,
  warehouse_lng REAL,
  default_lead_time_days INTEGER,
  payout_method TEXT CHECK (payout_method IN ('bank','cash')),
  bank_name TEXT,
  bank_account_no TEXT,
  bank_branch TEXT,
  notify_new_orders INTEGER NOT NULL DEFAULT 1,
  notify_low_stock INTEGER NOT NULL DEFAULT 1,
  notify_payment_received INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

CREATE TABLE platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  brand_name TEXT NOT NULL DEFAULT 'VYRO',
  support_email TEXT,
  support_phone TEXT,
  default_currency TEXT NOT NULL DEFAULT 'LKR',
  platform_fee_bps INTEGER NOT NULL DEFAULT 250,
  enable_business_signup INTEGER NOT NULL DEFAULT 1,
  enable_supplier_signup INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by_user_id TEXT
);

INSERT INTO platform_settings (id, brand_name, default_currency, platform_fee_bps,
                               enable_business_signup, enable_supplier_signup, updated_at)
VALUES (1, 'VYRO', 'LKR', 250, 1, 1, CAST(strftime('%s','now')*1000 AS INTEGER));
```

Drizzle schema TS files mirror this. Auto-generated via `drizzle-kit generate`.

## 11. Acceptance criteria

1. `pnpm db:migrate` applies cleanly; rollback script exists.
2. `pnpm typecheck` zero errors.
3. `pnpm test` (api) all green; coverage targets met.
4. `curl` smoke against local `wrangler dev` returns 200 for every new endpoint with valid auth.
5. Audit log row written for every settings write.
6. Analytics cache hit logged at info level.
7. No new feature beyond this scope — disables the urge to refactor existing code.

## 12. Out of scope / deferred reminders

Re-flagged so they're not regressed:

- Notifications queue dispatch (`packages/db` migration to add `notification_outbox` + CF Queues producer already exists in MVP spec but consumer not built).
- Disputes state transitions + admin dispute resolution UI.
- Ratings/reviews.
- `packages/ai`.

Sub-projects B (supplier portal pages), C (admin portal pages), D (`/profile/settings` page itself) consume this surface. Each gets its own spec + plan + impl cycle.

## 13. Risks

- **Lazy-create race**: two concurrent first reads can race-create rows. Acceptable for settings; UPSERT makes the conflict harmless (last writer wins, both write same defaults).
- **Cache stale**: 60s TTL. For admin/seller analytics this is tolerable. If charts need real-time, drop cache per query (defer).
- **Brand color locked to cyan**: spec-rule. Documented in settings UI as read-only.

## 14. Open items

None at design time. Spec review may surface gaps.
