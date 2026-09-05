# VYRO — Local E2E walkthrough

Use this checklist after running the seed.

## 0. Prereqs

```bash
# 1. install
pnpm install
# 2. apply migrations
pnpm --filter @vyro/db exec tsx src/migrate.ts -- --local
# 3. seed sample categories + products
pnpm --filter @vyro/api exec wrangler d1 execute vyro --local --file=./scripts/seed.sql
# 4. run api
pnpm --filter @vyro/api dev
# 5. run web
pnpm --filter @vyro/web dev
# 6. run admin (optional)
pnpm --filter @vyro/admin dev
```

## 1. Smoke (auth + catalogues)

- Open `http://localhost:5173` — landing renders.
- Sign up with `owner@example.com` / `password123`.
- Confirm `/profile` shows your user.
- Visit `/onboarding/business` — set up business (e.g. "Sunrise Restaurant" / type Restaurant).
- Sign up a second user `sup1@example.com` and onboard a supplier.

## 2. Catalog seeding (admin)

Use the API (or admin SPA) to seed:

```bash
curl -X POST localhost:8787/api/categories -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"slug":"beverages","name":"Beverages"}'
```

(Best done via admin session; seed.sql covers the base rows.)

## 3. Supplier offers

Sign in as `sup1@example.com`. POST offers on `p-rice-5kg`:

```bash
curl -X POST localhost:8787/api/supplier-products -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"supplierId":"<S>","productId":"p-rice-5kg","priceCents":12000,"minOrderQty":5,"leadTimeDays":2}'
```

## 4. Compare + add to cart

Sign in as the business. Visit `/products/p-rice-5kg`. Add qty 10. Visit `/cart`. Click Checkout.

Expect: one PO created per supplier (status `pending`).

## 5. PO lifecycle

- Supplier view `/supplier/orders`: see pending PO → Accept.
- Business view `/orders/<id>` → see timeline `∅ → pending → accepted`.
- Supplier: walk `preparing → ready_for_pickup → out_for_delivery → delivered`.
- Business: `delivered → completed`. Verify dispute path: business/admin can mark `delivered → disputed`.

## 6. Payments (manual)

- Business: POST `/api/payments` `{ purchaseOrderId, method: 'cash' }`.
- Supplier: POST `/api/payments/:id/confirm` `{ status: 'confirmed' }`.

## 7. Admin

Sign into admin SPA, browse Suppliers / Businesses / Audit. Verify each admin action writes an `audit_logs` row.

## 7b. Admin core ops (T1)

Use 4 fixed roles — `super_admin`, `ops`, `finance`, `support`. `isPlatformAdmin` boolean no longer used; gates now use enum + permission helpers.

### 7b.1 Invite flow

1. Sign in as super_admin. Open `/admin/roles`.
2. Click **Invite admin**. Pick role `ops`. Submit.
3. Copy the returned invite token + link `http://localhost:5173/admin/invite/accept?token=...`.
4. Open the link in a private window. Accept — optional display name + optional password.
5. New admin lands at `/admin` signed in as `ops`. Sidebar shows Activity link (granted via `audit:read`) but **not** Roles link (no `admin:role_change`).
6. Resend invite: revoke original from `/admin/roles` → POST same role again. Old token returns `INVITE_REVOKED`.

### 7b.2 Role change

1. From `/admin/roles`, change the `ops` admin to `finance`.
2. Verify `GET /api/admin/audit?action=admin.role_change` returns a row with `before.adminRole === 'ops'` and `after.adminRole === 'finance'`.
3. Refresh the admin's session — sidebar Activity link persists; Roles link now absent (`finance` lacks `admin:role_change`).
4. Demote self to `support` while signed in as super_admin → expect `CANNOT_DEMOTE_SELF`.

### 7b.3 Last-super guard

1. Add a second super_admin via invite + accept.
2. Sign in as admin #1. Demote admin #2 from `super_admin` → `ops` → success.
3. As admin #1, try demoting self → `LAST_SUPER_ADMIN` (only one super_admin left).
4. Invite a fresh super_admin, accept, then repeat demotion of self → success (2 super_admins → 1).

### 7b.4 Audit CSV

1. Trigger a few role changes + invite revokes. Open `/admin/activity`.
2. Apply a filter (`actorId`, `from` timestamp) → cursor pagination shows older rows.
3. Click **Export CSV** → downloads `audit.csv`. Open — header `createdAt,actorId,action,targetType,targetId,before,after,requestId,ip,userAgent`. RFC-4180 quoting around JSON payloads.
4. CSV caps at 1000 rows per export; use `from`/`to` cursor for larger windows.

### 7b.5 Cron purge

The audit-purge cron runs daily at 03:00 UTC via CF Cron Trigger (`[triggers] crons = ["0 3 * * *"]` in `wrangler.toml`). Under `wrangler dev` the trigger fires on the same schedule; to exercise it without waiting, tail logs and let one tick fire, or import the handler directly:

```bash
# Direct handler invocation against local D1
pnpm --filter @vyro/api exec tsx -e "import {handleAuditPurge} from './src/cron/audit-purge'; (async()=>{await handleAuditPurge({DB:process.env.DB} as any); console.log('purged');})()"
```

Rows older than 365d removed from `admin_audit_logs`. Confirm via:

```bash
pnpm --filter @vyro/api exec wrangler d1 execute vyro --local \
  --command "SELECT count(*) FROM admin_audit_logs WHERE created_at < strftime('%s','now','-1 year')*1000"
```

Expected: `0`.

## 7c. Admin catalog moderation (T2)

Ops admin: products, categories, business types. All writes audit-logged.

### 7c.1 Edit product

1. Sign in as ops. Open `/admin/catalog?tab=products`.
2. Click any product → `/admin/catalog/products/<id>`.
3. Edit name, click Save. Verify `GET /api/admin/audit?targetId=<id>&action=product.update` returns a row.
4. Click **Feature** button. Verify `product.feature` audit row.
5. Open same product in a second ops session → click Save with stale `expectedUpdatedAt` (won't happen via UI normally — verify via API curl: `PATCH /api/admin/products/:id { name, expectedUpdatedAt: 1 }` → expect 409 STALE_WRITE).

### 7c.2 Category tree

1. As ops, open `/admin/catalog?tab=categories`.
2. Create new category `Spices`. Reparent under `Staples` (existing).
3. Attempt to delete `Staples` while `Spices` is active → expect inline error "Has children — cannot delete".
4. Reparent `Spices` into itself via curl → expect 400 CATEGORY_CYCLE.
5. Soft-delete `Spices` → row shows strikethrough. Audit row `category.delete`.

### 7c.3 Type in-use

1. As ops, open `/admin/catalog?tab=types`.
2. Try to delete `bt-restaurant` → expect 409 TYPE_IN_USE (a business exists with that type).
3. Create new `bt-supplier-crafts` → succeeds, audit row `business_type.create`.
4. Toggle it inactive → audit row `business_type.update`.

### 7c.4 Featured products

1. SQL-check: `SELECT id, name FROM products WHERE featured = 1`.
2. Verify ops can feature/unfeature. Other roles (finance/support) see the catalog list but no Feature button.

## 7d. Admin money & orders (T3)

Sign in as finance admin. Visit `/admin/money`. The page exposes 4 tabs.

### 7d.1 Refund queue

1. Seed a refund via `seed.refundFixture({ paymentId: 'pay-1', amountCents: 5000, requestedByUserId: 'admin-finance-seed', status: 'pending' })`.
2. GET `/api/admin/refunds/queue` → 1 row, status `pending`.
3. POST `/api/admin/refunds/<id>/approve` → 200, status `completed`.
4. Audit row: `refund.approve` with before/after snapshots.
5. As ops role, GET queue → 200 (ops has payment:read). POST approve → 403 (no payment:refund).

### 7d.2 Payout batches

1. POST `/api/admin/payout-batches/batch` with a period → 201 + `pending` row.
2. GET `/api/admin/payout-batches/queue` → 1 row.
3. POST `/api/admin/payout-batches/<id>/approve` → 200, status `approved`.
4. Audit row: `payout_batch.approve` with after.
5. Approve twice → second call returns 409 `BATCH_ALREADY_APPROVED`.

### 7d.3 Ledger summary

1. Seed 3 ledger entries via `seed.ledgerEntryFixture(...)` — supplier credit, supplier debit, platform credit.
2. GET `/api/admin/ledger/summary` → totalCreditCents=1050, totalDebitCents=200, netCents=850, byAccountType length=2.
3. As ops role → 403.

### 7d.4 Chargebacks

1. Seed `seed.chargebackFixture({ paymentId: 'pay-1', reason: 'fraud' })`.
2. GET `/api/admin/chargebacks` → 1 row.
3. POST `/api/admin/chargebacks/<id>/resolve` with `notes` → 200, status `resolved`, audit `chargeback.resolve`.
4. Resolve again → 409 `CHARGEBACK_RESOLVED`.

## 8. Notifications

Sign in as a business. POST `/api/deliveries/<po>/transitions` (as supplier) with `delivered`. Hit `/api/notifications/me` as the business — expect a notification tied to the order event.

## 9. Dispute resolution

- As the business, mark a delivered PO: `POST /api/deliveries/<po>/transitions` `{ to: 'disputed' }`.
- Sign in as admin. Open `/admin/disputed`. The PO row renders a resolution panel.
- Add a note, click "Refund buyer". Expect 200, PO `cancelled`, notification row for the supplier, audit row `dispute.resolved`.
- Repeat with "Release supplier" on a fresh dispute. Expect PO back to `delivered`, notification row for the buyer.

## Notes / known limits

- vitest-pool-workers not configured; D1-touching integration tests run via `wrangler dev --local` + manual curl walks above.
- No payment gateway; payments record intent only.
- Webhooks/email out of scope; queue stubs only emit local writes.

## Rate limit verification (B1 security)

Run a curl loop that POSTs to login 6 times within 60 seconds. The first 5 attempts respond normally; the 6th returns 429 with `Retry-After: 60` header.

```bash
for i in $(seq 1 6); do
  curl -sS -w "\n%{http_code} retry-after=%header{retry-after}\n" \
    -X POST http://localhost:8787/api/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"nobody@example.com","password":"wrong"}' \
    | tail -1
done
```

Expected:
- Attempts 1-5: `401`
- Attempt 6: `429 retry-after=60`

## CSP header verification (B1 security)

```bash
curl -sI http://localhost:8787/api/health | grep -i content-security-policy
```

Expected: header contains `default-src 'self'`, `frame-ancestors 'none'`, and a per-request nonce in `script-src`.

## Security headers verification (B1 security)

```bash
curl -sI http://localhost:8787/api/health
```

Expected headers present:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
