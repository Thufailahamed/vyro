# VYRO PayHere Gateway — Design (2026-09-09)

Approach A approved: surgical correctness fix on existing implementation, Checkout API redirect first.

## 1. Context & findings

Existing (~70% complete):
- `packages/payments`: `PayHereGateway`, `MockGateway`, `resolveGateway`, `md5` (Workers-safe, no Buffer).
- `apps/api/src/modules/payments/routes.ts`: `POST /payments`, `POST /:id/confirm`, `POST /:id/checkout`, `GET /by-po/:poId`.
- `apps/api/src/modules/webhooks/payhere.ts`: `POST /api/webhooks/payhere`.
- Web: `PaymentPanel`, `PaymentReturnPage` (polls, never trusts return URL), `CheckoutPage`, admin `PaymentsPage`.

Critical bugs (evidence-backed, official docs = https://support.payhere.lk/api-%26-mobile-sdk/checkout-api):
1. Hash wrong: code does `md5(mid+oid+amount+curr+UPPER(secret))`. Official: `UPPER(md5(mid+oid+amount+curr+UPPER(md5(secret))))`. Same for `md5sig` with `payhere_amount/payhere_currency/status_code`.
2. Webhook lookup broken: checkout sends `order_id=PO.id`, webhook looks up `payments.gatewayRef == order_id`, but `gatewayRef=mid-po-timestamp`. Always `unknown_payment`.
3. Status mapping wrong: `0→success` (must stay pending), `-3→failed` (must be chargeback). DB `payments.status` lacks `cancelled,chargeback`.

## 2. Goals / non-goals

Goals: provider-agnostic `PaymentProvider→PayHereProvider`, backend-authoritative amounts, payment-before-redirect, robust states, double-md5 hash service + tests, secure notify, idempotency, return/cancel UX, history, admin, audit, sandbox/prod env switching, full test matrix.
Non-goals: payhere.js onsite modal now (keep abstraction swappable), additional gateways, refund REST wiring (stub stays explicit).

## 3. Architecture

```
VYRO Checkout/Cart/PO → Payment Service (Hono) → GatewayAdapter (PayHere|Mock) → PayHere
                                    ↓ notify_url (form-encoded, public, CSRF-exempt, rate-limited)
```

- Frontend never sees `PAYHERE_MERCHANT_SECRET`, never generates hash.
- `PAYHERE_ENV=sandbox|production` (fallback `PAYHERE_SANDBOX=1`), `PAYHERE_MERCHANT_ID/SECRET`, `PAYHERE_RETURN_URL/CANCEL_URL/NOTIFY_URL` overrides, `WEB_ORIGIN` default. Never commit secrets.

## 4. Checkout flow

Cart → Checkout → validate PO → backend totals (products×qty+supplier prices+delivery+fees) → `POST /payments` (outstanding guard, `Idempotency-Key`) → `POST /payments/:id/checkout` (RBAC business/admin, amount from DB) → `order_id=payment.id`, `amount=(cents/100).toFixed(2)`, server hash → store `gatewayRef=payment.id`, audit `PAYMENT_CREATED/PAYMENT_REDIRECTED` → redirect to `sandbox|live/pay/checkout` → PayHere → `notify_url` → verify → update → return URL polls status.

## 5. Hash service

`packages/payments`: `formatAmountLKR(cents)`, `hashCheckout(mid,oid,amount,curr,secret)`, `verifyMd5sig(params,secret)` (uppercase compare, constant-time intent). Unit tests: RFC vectors, official JS/PHP vectors, amount formatting (`1000→1000.00`, no commas), currency `LKR/USD` only.

## 6. Notify endpoint

`POST /api/webhooks/payhere` (keep) + alias `POST /api/payments/payhere/notify` (spec compliance). Public, no auth middleware, CSRF exempt, rate-limit, `application/x-www-form-urlencoded` parse, validate required params + `merchant_id==env`, lookup `payments.id==order_id`, verify `md5sig`, validate amount/currency/relationship/not-already-processed/tenant, map:
- `2→confirmed` (ledger+receipt+notify both)
- `0→pending` (no-op, event only)
- `-1→cancelled`
- `-2→failed`
- `-3→chargeback` (+ `chargebacks` row, flag for investigation)
Idempotent via status guard + `payment_events(payment_id,status_code,payment_id_provider)` unique. Sanitized event storage (no card/CVV/full secret). Audit: `PAYMENT_NOTIFICATION_RECEIVED/VERIFIED/SUCCESS/FAILED/CANCELLED/CHARGEBACK/VERIFICATION_FAILED`.

## 7. States & data

Extend `payments.status`: `pending,confirmed,failed,cancelled,chargeback,refunded` (keep `confirmed` as SUCCESS to avoid ledger rewrite). New `payment_events(id,payment_id,provider,event_type,provider_payment_id,status_code,payload_hash,received_at,processed_at,processing_status)`. Retry: new `payments` row per attempt, `order_id=payment.id` keeps history `Order→A1 FAILED→A2 CANCELLED→A3 SUCCESS`. Order vs payment states separate; `CHARGEBACK` flags order for investigation.

## 8. Frontend

- `PaymentPanel`: PAYMENT total, PayHere method, PAY SECURELY (editorial style), `Preparing secure payment...` → redirect, `Verifying your payment...` on return.
- `PaymentReturnPage`: SUCCESS (`Rs. X confirmed, VYRO-NNNN, View order/Continue/Dashboard`), FAILED (Try again/Change method/View order), PROCESSING (`Refresh status/View order`, 45s poll). Never claim success before webhook.
- Order detail payment block (Status/Method/Amount/Reference, no card data), business payment history (Date/Order/Amount/Method/Provider/Status/Ref), cancel page (`Payment cancelled, Try again/Return to order`).
- Admin: search (id/txn/gateway ref), filter status/date/provider, detail + events + order + notification history + failure reason, reconciliation query (success-missing, unpaid, duplicates, failed, chargebacks).

## 9. Security / multi-tenancy

Verify checksum, validate all fields/merchant/order-amount-currency, idempotency, rate-limit, log suspicious, never trust custom params, no card/CVV/PIN storage, server-side tenant enforcement (business/supplier/admin scopes), no secret in React/git.

## 10. Local dev & SDK

`localhost` cannot receive callbacks — document ngrok/staging public URL workflow. `PAYHERE_MOCK=1` local simulator. Keep Checkout API; `payhere.js` evaluation deferred (same notify verification regardless).

## 11. Testing

Unit: hash, verify, formatting, currency, mapping, transitions, idempotency. Integration: create→checkout→notify success/failed/cancelled/pending/chargeback/duplicate/bad-sig/bad-amount/bad-currency/unknown-order/already-paid. Security: forged/modified-amount/modified-order/bad-merchant/cross-tenant/unauthorized. E2E: cart→checkout→PayHere sandbox→notify→order→return poll→success.
Verification: typecheck, lint, tests, sandbox flow, duplicate callbacks, failed/cancelled, tenant isolation.

## 12. Rollout

Migration 1: extend status enum, add `payment_events`, index `payments(id)`, `gatewayRef`. Migration 2 (optional): backfill `gatewayRef=payment.id` for pending online payments. Deploy sandbox creds → E2E → prod secrets via `wrangler secret`, `PAYHERE_ENV=production`.
