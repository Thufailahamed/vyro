# Vyro × Payments.lk — Gateway Migration & Payments/Accounts Completion

**Date:** 2026-09-24
**Status:** Approved design (pending implementation plan)
**Approach:** A — adapter swap, keep all existing money flows

## Context

Vyro's online payments currently run through PayHere (payhere.lk) via the `GatewayAdapter` abstraction in `packages/payments`. The business is switching to **payments.lk** as the sole online gateway. Known gaps to close at the same time:

1. Gateway refunds are stubbed (`payhere-refund-rest-not-configured`) — refunds only work via the admin manual queue.
2. TrustSEAL subscription checkout builds a stale notify URL that doesn't match mounted routes.
3. No saved-card support.
4. Frontend copy/filters still reference PayHere.

## Decisions (from user)

- **Full replacement**: remove PayHere entirely; only payments.lk (plus Mock for dev/test) remains.
- **Scope**: gateway swap + real API refunds + saved cards + TrustSEAL webhook fix + frontend polish.
- **Integration style**: plain REST via `fetch` inside the existing `GatewayAdapter`; no vendor SDK dependency.
- **Existing data**: historical rows keep `provider = 'payhere'`; only new payments use `payments_lk`. Old online refunds stay manual.
- **Payouts**: remain manual-recording (admin marks paid) — payments.lk has no payout API yet.
- **Saved cards**: in scope (saveCard at checkout, card list, off-session charge for repeat orders).

## Payments.lk contract (from vendor docs)

- REST, JSON over HTTPS. Bearer secret key (`sk_test_` / `sk_live_`). Every write takes an `Idempotency-Key` header.
- `POST /v1/checkouts` → `{ amountCents, description, reference, successUrl, cancelUrl, customer?, saveCard? }` → hosted-checkout `url` (+ `id`). 3DS happens on the hosted page.
- `GET /v1/checkouts/:id` → checkout + payment (for late-webhook polling).
- `POST /v1/refunds` → `{ paymentId, amountCents }`; live refunds settle next bank working day; events `refund.succeeded` / `refund.failed`.
- `GET /v1/payments`, `GET /v1/payments/:id`.
- Saved cards: `saveCard: true` at checkout → `card.saved` event → `POST /v1/cards/:id/charge` off-session; `GET/DELETE /v1/cards`.
- Webhooks: `Payments-Signature: t=<unix>,v1=<hex>`; HMAC-SHA256(secret, `t + "." + rawBody`); 300s tolerance; timing-safe compare. Events: `payment.succeeded`, `payment.failed`, `checkout.expired`, `card.saved`, `refund.succeeded`, `refund.failed`. Retries: 1/5/30 min, 2/6/12 h. Return-page redirect is never proof of payment; fulfil only from webhook or checkout-read.
- Amounts are whole LKR cents.

## Design

### 1. Gateway adapter & config (`packages/payments`)

New `src/paymentslk.ts` implementing `GatewayAdapter`:

- **`startCheckout`**: `POST {API}/v1/checkouts` with `Authorization: Bearer PAYMENTS_LK_SECRET_KEY`, `Idempotency-Key: pay_<paymentId>` (reuses the payment idempotency machinery; a retried checkout can never double-charge). Body: `amountCents` (payment net payable cents), `description` (PO number + supplier), `reference: paymentId`, `successUrl`/`cancelUrl` (from `PAYMENTS_LK_RETURN_URL`/`PAYMENTS_LK_CANCEL_URL`, defaulting to existing `/orders/:id/payment-success|payment-cancel` web routes), `saveCard` when the buyer opts in. Response: store checkout `id` in `gatewayRef`, full payload in `gatewayPayload`, redirect buyer to `url`.
- **`parseWebhook`**: verify `Payments-Signature` over raw bytes (below), map events:
  - `payment.succeeded` → success
  - `payment.failed` → failed
  - `checkout.expired` → expired
  - `refund.succeeded` → refund completed
  - `refund.failed` → refund failed
  - `card.saved` → saved-card persistence (Section 3)
  - Unknown event types → 200 + ignored (forward compatible).
- **`refund`**: `POST /v1/refunds` `{ paymentId, amountCents }`, `Idempotency-Key: refund_<refundId>`. Real API call — replaces the PayHere stub.
- **`verifySignature`**: exposed for route use and tests; the check is pure (no fetch) → unit-testable with vendor vectors.
- API base overridable via `PAYMENTS_LK_API_URL` (default `https://api.payments.lk`). Sandbox is implied by `sk_test_` keys; no separate mode flag.

**Config**: `resolveGateway(env)` chooses `payments_lk` when `PAYMENTS_LK_SECRET_KEY` is set, else mock; the existing mock-in-production guard (`ENVIRONMENT=production` + mock) stays. New env vars: `PAYMENTS_LK_SECRET_KEY`, `PAYMENTS_LK_WEBHOOK_SECRET`, `PAYMENTS_LK_API_URL`, `PAYMENTS_LK_RETURN_URL`, `PAYMENTS_LK_CANCEL_URL`. All PayHere env vars and `src/payhere.ts` are deleted. DB retains `provider='payhere'` historical values only.

**Mock gateway**: `src/mock.ts` updated to the payments.lk event vocabulary and HMAC contract (`t.v1` signature over `t + "." + body`) so all dev/test flows behave identically; keeps `MOCK_FORCE_FAILURE`.

### 2. Webhook route & payment lifecycle (`apps/api/src/modules/webhooks/`)

New `src/paymentslk.ts` mounted at `POST /api/webhooks/payments-lk` (public, CSRF-exempt, rate-limited 30/min, alias `POST /api/webhooks/plk-notify`):

1. Read **raw body text** (signature requires exact bytes — the current PayHere route parses JSON first; the new route must not).
2. Verify HMAC → 400 on mismatch (no body processing).
3. Resolve payment via `event.data.reference` (fallback: checkout id in `gatewayPayload`).
4. Idempotent `payment_events` write — dedupe key (payment_id, event type, provider payment id), payload hash stored, never raw card data.
5. Bind amounts before honoring success: event `amountCents` must equal payment `amountCents`; currency must be LKR. Mismatch → event recorded, no state change, alert raised.
6. Lifecycle reuse: success → attempt paid + payment confirmed + allocation/earning + ledger writes (existing handlers untouched); failed/expired → attempt + payment state, PO notified; refund events → drive refund executor state machine.
7. Disputes/chargebacks: payments.lk has no dispute feed yet → chargebacks remain admin-created; manual path unchanged.
8. TrustSEAL subscriptions (`ts_*` references) use the same checkout/webhook path; the stale legacy notify URL in `trustSeal/service.ts` is fixed to the new mounted route.
9. **Late-webhook fallback**: `GET /v1/checkouts/:id` polling endpoint (`POST /api/payments/:id/checkout-status`) lets the return page confirm state when a webhook is slow; this confirms from the server, never from the redirect alone.

### 3. Refunds via gateway

`refunds/executor.ts` changes:

- Online payments (`provider = 'payments_lk'`) → executor calls `adapter.refund()` for real; refund row `processing` until `refund.succeeded` webhook → `completed`, or `refund.failed` → `failed` (admin can retry with a new refund row; idempotency key per refund id).
- Ledger reversal, pro-rata fee reversal, commission/earning adjustments trigger **on completion** (not initiation) for gateway refunds — offline (COD/bank-transfer) refunds keep triggering immediately as today.
- Partial refunds supported natively (`amountCents`).
- Historical PayHere online refunds stay manual/admin-queue (provider check, not just method check).
- Existing refund idempotency keys and sources (cancel/reject/partial_accept/return/dispute/manual) unchanged.

### 4. Saved cards

New module `apps/api/src/modules/savedCards/`:

- Schema (D1 migration): `saved_cards` — `id`, `businessId` (FK), `paymentsLkCardId` (provider id), `brand`, `last4`, `expiryMonth`, `expiryYear`, `createdAt`; unique `(businessId, paymentsLkCardId)`; no PAN/CVV data ever stored.
- API: `GET /api/payments/saved-cards`, `DELETE /api/payments/saved-cards/:id` (RBAC: business payment roles); checkout request accepts optional `useSavedCardId` to charge off-session.
- Off-session path: executor `POST /v1/cards/:id/charge`; on decline → fall back to normal hosted checkout for the same payment row (new attempt), buyer just sees the hosted page.
- `card.saved` webhook persists the card reference for the buyer's business (linked via checkout reference → payment → business).
- Frontend: saved-card management in buyer Accounts (list + delete + "use saved card" toggle in PaymentPanel, web) and equivalent mobile screens.

### 5. Accounts & admin completeness

- Drizzle schema: `payments.provider` default flips to `'payments_lk'`; enum gains `payments_lk` and keeps `payhere` for history; `payment_attempts.provider`, `payment_events`, admin search filters likewise.
- Admin payment-search provider filter: `payments_lk | payhere | mock` (payhere retained for historical filtering only).
- `packages/shared` payment constants: canonical method map `online ↔ PAYMENTS_LK`.
- Web frontend: gateway-agnostic copy ("Pay online"), provider labels (`payments_lk` → "Payments.lk"), saved-cards UI, refund status showing "gateway refund" vs "manual", PaymentReturnPage unchanged in behavior (polls state; server truth only).
- Mobile: CheckoutScreen/PaymentReturnScreen + `lib/orderLifecycle.ts` provider-neutral; saved-card toggle.
- Accounts module (balances/statement/CSV), earnings→settlements→payouts chain, financial adjustments, commission rules, reconciliation: **unchanged** — they are gateway-agnostic and already complete.
- Docs: runbook env/secrets section updated; old PayHere plan docs marked superseded.

### 6. Error handling

- Webhook signature failure → 400, logged, no state change.
- Amount/currency mismatch → event stored, alert (ALERTS_KV/Slack pattern), no state change.
- Refund API failure → refund row `failed` + statusReason; retry creates a new refund row (never reuse a completed key).
- Checkout API failure (network/5xx) → payment stays `pending`, user can retry (idempotency key makes retries safe).
- Unknown events → 200 ignored.
- Mock-in-prod guard unchanged.

### 7. Testing

- Adapter unit tests: signature vectors (accept/reject/tamper/expired-timestamp), event→status mapping, checkout payload shape, refund payload shape, idempotency headers.
- Webhook route tests: success/failed/expired/refund flows; dedupe (replayed event); amount binding rejection; signature rejection; raw-body exactness; rate limit.
- Refund executor tests: gateway refund lifecycle (processing→completed/failed), offline refund unchanged, fee/commission reversal timing.
- Saved cards: persistence via `card.saved`, list/delete RBAC, off-session charge success/decline→fallback.
- Mock gateway parity tests (same signing contract as payments.lk).
- Existing PayHere adapter/webhook tests → ported to payments.lk equivalents; `test/payments/checkout.test.ts`, `test/webhooks/*`, `test/finance/*` updated.
- `resolveGateway` tests: payments_lk selection, mock fallback, mock-in-prod guard.

## Non-goals

- Automated supplier payouts (no payout API available; stays manual-recording).
- Disputes/chargebacks via webhook (no vendor feed yet).
- Multi-currency (LKR only, matching the existing finance spec).
- Subscription auto-renewal for TrustSEAL (stays per-period checkout, as today).

## Rollout

1. Ship adapter + webhook + refund wiring behind `PAYMENTS_LK_*` secrets (unset → mock, so staging behaves the same).
2. Point sandbox webhooks at `/api/webhooks/payments-lk`; run sandbox end-to-end (success/failed/expired/refund/saved-card).
3. Swap to `sk_live_` keys on approval; PayHere env vars removed at cleanup commit (after any in-flight PayHere payments settle — historical rows unaffected).
