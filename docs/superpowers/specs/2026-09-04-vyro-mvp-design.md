# VYRO MVP — Design Spec

**Date:** 2026-09-04
**Status:** Approved (design phase complete)
**Scope:** End-to-end procurement spine for Sri Lankan B2B platform.

## 1. Summary

VYRO is a B2B procurement platform for Sri Lankan businesses. This spec covers the **MVP spine**: business + supplier onboarding, product catalog, supplier comparison, multi-supplier cart, purchase order state machine, delivery stub, payment stub, audit log, and minimal role-aware dashboards.

Out of scope for this implementation cycle:
- Notifications queue dispatch beyond in-app writes.
- AI procurement agent.
- Disputes workflow UI.
- Ratings/reviews.
- Admin analytics depth beyond basic counts.
- Credit / financing.
- Real payment gateway integration.
- Native mobile apps.
- Production Cloudflare account provisioning.

## 2. Decisions Locked

| Decision | Choice |
|---|---|
| Scope | End-to-end spine only |
| Auth | `better-auth` with D1 adapter, email + password |
| Tenancy | Own `businesses` / `suppliers` tables; `business_members` / `supplier_members` RBAC tables |
| IDs | UUIDv7 everywhere |
| Local dev | `wrangler dev --local` with local D1 / R2 / KV |
| Architecture | Modular monolith (Hono) with strict per-module layers |
| Money | Integer `_cents`, currency `LKR` default |
| Frontend | React 19, Vite, React Router 7, TanStack Query, Tailwind, shadcn/ui |
| Testing | Vitest + `@cloudflare/vitest-pool-workers` against local D1 |

## 3. Monorepo

Turborepo + pnpm workspaces. Node 20 LTS. TypeScript strict + `noUncheckedIndexedAccess`.

```
apps/
  web/        Vite + React 19, business + supplier SPA, role-gated views
  admin/      Vite + React 19, platform admin SPA (separate bundle)
  api/        Hono on Cloudflare Workers
packages/
  db/         Drizzle schema, drizzle-kit, migrations, getDb(env)
  auth/       better-auth factory wired to D1
  validation/ Zod schemas per domain (shared client/server)
  shared/     TS types + constants + branding config
  ui/         shadcn primitives + composed components
  ai/         placeholder (no impl)
```

## 4. Tooling

- TypeScript 5.x strict mode.
- ESLint flat config + Prettier.
- Vitest + `@cloudflare/vitest-pool-workers`.
- Drizzle Kit for SQL migrations.
- Wrangler for deploy + dev.

## 5. Branding

Centralized in `packages/shared/src/branding.ts`:

```ts
export const BRAND = {
  name: 'VYRO',
  tagline: 'Everything your business needs.',
  logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
  colors: { primary: 'oklch(...)' /* swappable */ },
} as const;
```

No `VYRO` strings hardcoded in components. Tailwind theme tokens reference `BRAND.colors`.

## 6. Database (D1 + Drizzle)

All IDs `uuidv7()`. Timestamps `integer` (unix ms). All tables have `created_at`, `updated_at`. Soft-delete via `deleted_at` where appropriate.

### 6.1 Identity & Tenancy

```
users
  id, email (unique), email_verified_at, password_hash, name, phone,
  avatar_url, is_platform_admin, status, created_at, updated_at, deleted_at

sessions
  id (text pk), user_id, expires_at, token, ip, user_agent, created_at

businesses
  id, name, business_type_id, contact_person, phone, email,
  address, city, district, description,
  verification_status (default 'pending'), status, created_at, updated_at, deleted_at

business_members
  id, business_id, user_id,
  role ('owner'|'manager'|'purchasing'|'accountant'),
  status ('active'|'invited'|'suspended'),
  UNIQUE(business_id, user_id)

suppliers
  id, name, business_type_id, contact_person, phone, email,
  address, city, district, description,
  verification_status ('pending'|'verified'|'rejected'|'suspended'),
  status, created_at, updated_at, deleted_at

supplier_members
  id, supplier_id, user_id,
  role ('owner'|'sales'|'operations'),
  status,
  UNIQUE(supplier_id, user_id)
```

### 6.2 Catalog

```
business_types             configurable, not hardcoded
  id, slug (unique), name, active

categories
  id, slug (unique), name, parent_id (nullable self-fk), active, sort_order

products
  id, name, description, category_id, brand, unit, pack_size, active,
  created_at, updated_at, deleted_at
  INDEX(category_id), INDEX(name)

product_images
  id, product_id, r2_key, sort_order, alt_text

supplier_products
  id, supplier_id, product_id,
  supplier_sku, price_cents, min_order_qty, lead_time_days,
  delivery_available, delivery_radius_km,
  availability_status ('in_stock'|'low'|'out_of_stock'), active,
  created_at, updated_at, deleted_at
  UNIQUE(supplier_id, product_id)
  INDEX(product_id), INDEX(supplier_id)
```

### 6.3 Procurement

```
carts
  id, business_id, status ('open'|'converted'), created_at, updated_at

cart_items
  id, cart_id, supplier_product_id, quantity
  UNIQUE(cart_id, supplier_product_id)

purchase_orders
  id, po_number (unique, 'PO-YYYY-NNNNN'),
  business_id, supplier_id,
  status (see state machine),
  subtotal_cents, delivery_fee_cents, total_cents, currency ('LKR'),
  delivery_address, delivery_city, delivery_district,
  notes, rejection_reason, cancelled_reason,
  created_by_user_id,
  accepted_at, rejected_at, prepared_at, ready_at, dispatched_at,
  delivered_at, completed_at, cancelled_at,
  created_at, updated_at
  INDEX(business_id, status), INDEX(supplier_id, status), INDEX(po_number)

purchase_order_items
  id, purchase_order_id, supplier_product_id,
  product_name_snapshot, unit_price_cents, quantity, line_total_cents

order_events
  id, purchase_order_id, actor_user_id (nullable for system),
  from_status, to_status, reason, metadata (json),
  created_at
```

### 6.4 Delivery stub

```
deliveries
  id, purchase_order_id (unique),
  status ('pending'|'assigned'|'picked_up'|'in_transit'|'delivered'|'failed'),
  driver_name, driver_phone,
  estimated_at, picked_up_at, delivered_at,
  assigned_by_user_id,
  created_at, updated_at
```

### 6.5 Payments stub

```
payments
  id, purchase_order_id,
  method ('cash'|'bank_transfer'|'online'),
  status ('pending'|'confirmed'|'failed'|'refunded'),
  amount_cents, currency ('LKR'),
  transaction_reference, paid_at, confirmed_at, confirmed_by_user_id,
  notes, created_at, updated_at
  INDEX(purchase_order_id)
```

### 6.6 Notifications + audit

```
notifications
  id, user_id, type, title, body,
  read_at, link,
  created_at
  INDEX(user_id, read_at)

audit_logs
  id, actor_user_id, action, resource_type, resource_id,
  metadata (json), ip, user_agent,
  created_at
  INDEX(resource_type, resource_id), INDEX(actor_user_id, created_at)
```

## 7. Storage (R2)

`product_images.r2_key` references bucket `vyro-products`. Read via Worker route `/cdn/:key`. R2 binding declared in `wrangler.toml`. Future: signed URLs for private buckets.

## 8. Money

All currency fields `_cents` (integer). LKR has no minor unit but integer discipline is mandatory. No floating-point math anywhere in the procurement pipeline. Conversion only at UI edges.

## 9. Auth + RBAC + Tenancy

### 9.1 better-auth setup

`packages/auth/src/index.ts` exports `createAuth(env)`. Uses D1 adapter for `users` + `sessions`. Email + password. Session cookie: `Secure; HttpOnly; SameSite=Lax; Path=/`. TTL 30 days sliding.

Mounted in API at `/api/auth/*` via `auth.handler(request)`.

### 9.2 sessionMiddleware

Runs on every non-auth route:
1. Read session cookie.
2. Validate session row (exists, not expired).
3. Load user.
4. Resolve memberships (`business_members`, `supplier_members`) with role.
5. Inject `ctx = { user, session, businesses, suppliers, isAdmin }` into Hono context.

### 9.3 RBAC

**Route-level**: `requireRole(ctx, { business?: role[], supplier?: role[], admin?: boolean })`. Composable, returns 403 on miss.

**Service-level**: every tenant-owned mutation takes resource id + ctx, re-verifies membership in that tenant before touching DB. Defense in depth — middleware + service both check.

### 9.4 Tenant isolation

All tenant-scoped queries go through repository functions that take ctx (or explicit tenant id) and inject the WHERE clause. Cross-tenant reads are physically impossible at the query level.

### 9.5 Mass-assignment protection

Zod `.strict()` schemas on every endpoint. 400 on extra fields. Handlers pick fields explicitly — no `...body` spread.

### 9.6 IDOR protection

All `:id` route params: handler resolves resource by id and verifies `resource.businessId === ctx.businessId` (or supplier). Returns 404 (not 403) on miss to avoid existence leaks.

### 9.7 Pagination

Opaque cursor (uuidv7 of last seen row). No offset injection.

### 9.8 Audit logging

`audit_logs` written for: user creation, business/supplier create/update/suspend, supplier verification, product create/update/disable, supplier offer create/update, price change, PO state transition, payment status change, admin overrides. Written via Cloudflare Queues consumer. Falls back to sync write if queue not bound.

### 9.9 Notifications

In-app only for MVP. `notifications/outbox` table + queue producer in service. Consumer writes `notifications` rows. Email/SMS are no-op stubs.

### 9.10 Rate limiting

Cloudflare WAF rules for `/api/auth/*`. KV sliding window in middleware for app routes: 60 req/min/user.

## 10. API Surface (Hono)

App shape:
```
app = new Hono()
  .use('*', requestId())
  .use('*', cors({ origin: [WEB_ORIGIN, ADMIN_ORIGIN], credentials: true }))
  .use('*', errorHandler())
  .use('/api/auth/*', auth.handler)
  .route('/api/auth', authHelpersRouter)
  .route('/api/businesses', businessRouter)
  .route('/api/suppliers', supplierRouter)
  .route('/api/products', productRouter)
  .route('/api/categories', categoryRouter)
  .route('/api/search', searchRouter)
  .route('/api/cart', cartRouter)
  .route('/api/orders', orderRouter)
  .route('/api/deliveries', deliveryRouter)
  .route('/api/payments', paymentRouter)
  .route('/api/notifications', notificationRouter)
  .route('/api/admin', adminRouter)
  .route('/api/cdn', cdnRouter)
```

### 10.1 Error envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { ... } } }
```

Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`. 4xx never leaks stack traces.

### 10.2 Routes

```
GET    /api/auth/me
POST   /api/auth/sign-out

POST   /api/businesses
GET    /api/businesses/me
GET    /api/businesses/:id
PATCH  /api/businesses/:id

POST   /api/suppliers
GET    /api/suppliers/me
GET    /api/suppliers/:id
PATCH  /api/suppliers/:id
POST   /api/suppliers/:id/verify         (admin)

GET    /api/categories
POST   /api/categories                   (admin)
PATCH  /api/categories/:id               (admin)

POST   /api/products                     (admin)
GET    /api/products/:id
PATCH  /api/products/:id                 (admin)
POST   /api/products/:id/images

POST   /api/supplier-products
GET    /api/supplier-products
PATCH  /api/supplier-products/:id

GET    /api/search?q=&category=&sort=&cursor=
GET    /api/search/products/:id/offers

GET    /api/cart
POST   /api/cart/items
PATCH  /api/cart/items/:id
DELETE /api/cart/items/:id
POST   /api/cart/checkout                splits into N POs

GET    /api/orders
GET    /api/orders/:id
POST   /api/orders/:id/accept            (supplier)
POST   /api/orders/:id/reject            (supplier)
POST   /api/orders/:id/prepare           (supplier)
POST   /api/orders/:id/ready             (supplier)
POST   /api/orders/:id/dispatch          (supplier)
POST   /api/orders/:id/deliver           (supplier)
POST   /api/orders/:id/complete          (business)
POST   /api/orders/:id/cancel            (business, before accepted)

GET    /api/deliveries
POST   /api/deliveries                   (admin / supplier ops)
PATCH  /api/deliveries/:id

POST   /api/payments
POST   /api/payments/:id/confirm         (admin / supplier)

GET    /api/notifications
POST   /api/notifications/:id/read

GET    /api/admin/businesses
POST   /api/admin/businesses/:id/suspend
GET    /api/admin/suppliers
POST   /api/admin/suppliers/:id/verify
GET    /api/admin/orders
GET    /api/admin/metrics
```

## 11. Purchase Order State Machine

```
PENDING ──accept──> ACCEPTED ──prepare──> PREPARING
   │                  │                    │
   │reject            │                    │ready
   ▼                  │                    ▼
REJECTED              │              READY_FOR_PICKUP
                      │                    │
PENDING ──cancel──> CANCELLED              │dispatch
                                            ▼
                                       OUT_FOR_DELIVERY
                                            │deliver
                                            ▼
                                        DELIVERED
                                            │complete
                                            ▼
                                        COMPLETED

* ──admin──> DISPUTED
```

Encoded as `canTransition(from, to, actorRole)` with explicit transition table. Each transition writes an `order_events` row in the same D1 batch.

## 12. Cart Checkout Split

`POST /api/cart/checkout`:
1. Load cart items + supplier_products.
2. Group by `supplier_id`.
3. For each group:
   - Allocate `po_number` = `PO-<year>-<5-digit-seq>` (atomic counter row in D1 transaction).
   - Insert `purchase_orders` row.
   - Insert `purchase_order_items` with price snapshot (product name + unit price copied at checkout time, immune to later edits).
4. Mark cart `status='converted'`.
5. Return `{ pos: [{ id, poNumber, supplierId, total }] }`.

Atomicity: single D1 batch. Any failure rolls back all.

## 13. Payment States

```
PENDING ──confirm──> CONFIRMED ──refund──> REFUNDED
   │
   └──fail──> FAILED
```

Only admin can REFUND. Payment confirm does NOT auto-complete PO — requires business confirmation. Business logic stays explicit.

## 14. Search

SQL only. `LIKE %q%` with normalization (lowercase, strip punctuation, prefix match). Sort by cheapest available offer per product. Filters: category, in-stock, delivery-available. Cursor pagination (uuidv7 of last result). Wrapped in `SearchService` interface so we can swap to Vectorize later without touching routes.

## 15. Frontend

### 15.1 `apps/web`

React Router 7 + TanStack Query + Tailwind + shadcn/ui.

Routes:
```
/                                  landing or redirect
/sign-in
/sign-up
/onboarding/business
/onboarding/supplier
/app                               authenticated shell
  /dashboard                       role-aware redirect
  /search
  /products/:id                    compare view
  /suppliers/:id
  /cart
  /orders
  /orders/:id
  /catalog                         supplier only
  /business
```

`AppShell`: left sidebar (role-filtered), top bar with notifications + user menu.

Critical screens:
1. **Search** — input, results (name, lowest price, # suppliers, category chip).
2. **Compare** — supplier offer table (price, MOQ, lead time, delivery, verification). Add-to-cart per row.
3. **Cart** — items grouped by supplier, editable quantities, totals, checkout.
4. **Order detail** — supplier, items, totals, status timeline (vertical stepper from `order_events`), delivery block, role+status gated actions.

All empty states honest (no fake data). Skeletons for loading. Toasts for errors.

### 15.2 `apps/admin`

Separate bundle. Routes:
```
/sign-in
/dashboard
/businesses
/suppliers
/products
/categories
/orders
/payments
```

Operations-grade tables: column sort, server-side filter, row actions. No fake analytics — only real numeric counts + recent activity lists.

### 15.3 Dashboards

**Business widgets** (all real SQL):
- This month procurement total (LKR).
- Open orders count.
- Completed orders all time.
- Recent orders (last 5).
- Suggested reorder — last 5 distinct products ordered, with current cheapest supplier offer.

**Supplier widgets**:
- Today's orders.
- Pending acceptance count.
- Revenue this month (sum of totals for non-cancelled POs).
- Completed orders all time.
- Recent customers (distinct business names, last 30 days).

Empty states everywhere when no data.

## 16. Testing

Three layers:

1. **Unit (Vitest)** — PO state machine, money formatters, Zod schemas, cursor pagination, RBAC matrix.
2. **Service integration (Vitest + @cloudflare/vitest-pool-workers + local D1)** — each service against per-test D1 (migrations applied, truncated between tests):
   - Auth: signup, signin, password hashing, session expiry.
   - Tenancy: business A cannot read business B's orders (404); supplier A cannot accept supplier B's order (403/404).
   - Products: create product, supplier offer creation, price update flow.
   - Cart: add, update qty, multi-supplier checkout produces correct PO split.
   - Orders: every legal transition; every illegal transition rejected.
   - Payments: confirm flow, refund gated to admin.
3. **HTTP layer (Vitest + `app.fetch(req, env)`)** — verifies status codes, error envelope shape, RBAC at route boundary.

No browser E2E in MVP. Manual click-through for visual regression.

Coverage targets: services ≥80%, state machine + RBAC 100%, repositories exercise all WHERE clauses.

## 17. Dev + Verification Loop

Per phase:
1. Write code.
2. `pnpm typecheck` — zero errors.
3. `pnpm test` — all pass.
4. `pnpm dev` — manual click-through of the phase's user journey.
5. `pnpm lint` — clean.

## 18. Phasing of Implementation

1. Monorepo scaffold + tooling.
2. Packages: `db`, `shared`, `validation`, `auth`, `ui`.
3. API: auth + business/supplier onboarding + RBAC middleware.
4. API: products + offers + search.
5. API: cart + checkout + PO state machine.
6. API: delivery + payment stubs + audit + notifications outbox.
7. Web: shell + auth flow + onboarding.
8. Web: search → compare → cart → checkout → order detail.
9. Web: dashboard widgets.
10. Admin: shell + tables + verify flows.
11. Seed data + polish + verification.

## 19. Critical MVP Path (E2E validation)

Business registers → supplier registers → admin verifies supplier → business searches "Samba Rice" → compares offers → adds to cart → checkout creates PO → supplier accepts → supplier prepares → supplier marks ready → supplier dispatches → supplier marks delivered → business completes.

This journey must pass manual + automated tests before declaring MVP done.
