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
