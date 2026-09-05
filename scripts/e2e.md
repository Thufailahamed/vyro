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
