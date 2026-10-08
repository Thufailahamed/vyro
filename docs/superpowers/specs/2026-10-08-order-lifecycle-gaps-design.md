# Vyro Order Lifecycle Gap Closure — 2026-10-08

## Scope

Audit of the order lifecycle (supplier listing → cart → checkout → payment →
fulfilment → delivery → returns → refunds → settlement/payout) across API, DB,
and web, followed by implementation of the remaining core gaps and bugs.

Audit verdict: the core lifecycle **is** implemented end-to-end and covered by
`apps/api/test/buyerFlow/e2e.test.ts`. This spec closes the six gaps the user
selected ("Core gaps + bugs 1–6"). Advanced expansions (product variants,
warehouses/lots, shipment tracking events, disputes-as-entity, payout gateway,
invoice PDF endpoint) and the mobile address book are explicitly deferred.

## Method

- 3 parallel read-only exploration agents: API surface, DB schema + shared
  types, web/mobile UI/API wiring.
- Key files read directly for design: `packages/payments/src/paymentslk.ts`,
  `apps/api/src/modules/{cart,addresses,payments,refunds,purchaseOrders}`,
  `apps/web/src/pages/{CheckoutPage,CartPage,OrderDetailPage,ConversationalOrderPage}.tsx`,
  storefront/sponsored files.
- User decisions (brainstorming, 2026-10-08):
  1. Pay-at-checkout: auto-create payment per PO, redirect immediately for a
     single PO, multi-supplier lands on Orders with per-order payment.
  2. Address book: dedicated `/addresses` page + checkout selector.
  3. Buyer refunds: partial amount on the existing refund modal.

## Design

### 1. Pay at checkout (web only)

Problem: `checkoutSchema.paymentMethod='paynow'` is accepted but ignored by
`checkoutService` (only `'credit'` branches, `purchaseOrders/service.ts:283`).
After checkout the buyer lands on the order page and must manually create a
payment.

Approach: client-side orchestration using existing endpoints — no checkout
service changes, no new money-path server code.

`CheckoutPage.submit()` (apps/web/src/pages/CheckoutPage.tsx:187):

1. Generate one `checkoutKey = crypto.randomUUID()` per submit; use it to build
   deterministic payment idempotency keys. (`checkoutSchema` accepts an
   `idempotencyKey` but the route/service ignores it today — sending it would
   be a no-op, so checkout itself stays non-idempotent; payment creation is the
   retry-safe part.)
2. If `paymentMethod === 'paynow'`, after `res.poIds` returns:
   - For each `poId`: `POST /payments` with
     `{ purchaseOrderId: poId, method: 'online' }` and header
     `Idempotency-Key: checkout-${checkoutKey}-${poId}` (payments create
     supports idempotency, `payments/routes.ts:98`). The API defaults
     `amountCents` to the PO outstanding.
   - If exactly one PO: `POST /payments/:id/checkout`.
     - `isMock === true` → do not redirect to the unreachable
       `https://mock.vyro.local/...` URL; navigate to `/orders/:poId` with a
       "staging simulator" toast.
     - else `window.location.href = redirectUrl`.
   - If multiple POs: navigate to `/orders` with a toast
     "N purchase orders created — pay each supplier order".
3. Failure policy: payment startup is best-effort. The orders exist regardless;
   on failure navigate to the order(s) with an error toast. The buyer can start
   payment from the order page (existing `PaymentPanel`).
4. `paymentMethod === 'credit'` path unchanged.

Extract orchestration into `apps/web/src/lib/checkoutPayments.ts` with injected
deps so it is unit-testable without mocking the network layer.

### 2. Delivery address book (web)

The API is complete (`apps/api/src/modules/addresses/routes.ts`,
`:businessId/addresses` GET/POST/PATCH/DELETE, 50-address cap, soft delete,
default reassignment) and checkout already supports `deliveryAddressId`
(`resolveDeliveryAddress`, `addresses/repository.ts:126`). Only the UI is
missing.

- New page `apps/web/src/pages/AddressesPage.tsx`, route `/addresses` under
  `<RequireBusiness>` in `App.tsx`.
  - List (default first), add/edit form (label, contact name, phone, address,
    city, district, default checkbox), set-default, delete with confirm.
  - Fields match `businessAddressCreateSchema` / `businessAddressPatchSchema`
    (`packages/validation/src/wholesale.ts`).
  - Empty state explains the registered business address is used until one is
    saved (the first saved address becomes default automatically).
- `CheckoutPage`: query addresses; render a selector with the default
  pre-selected; "Manage addresses" link to `/addresses`; pass
  `deliveryAddressId` in the checkout POST; when the book is empty show the
  registered address as the resolved fallback (server does the same).
- `ProfilePage`: link to `/addresses`.
- Mobile: deferred (same API; Expo screen is a follow-up).

### 3. Buyer partial refunds (`OrderDetailPage.tsx`)

API already accepts `amountCents` (`createRefundSchema`,
`packages/validation/src/payment.ts:20`; `executeRefund` caps and validates,
`refunds/executor.ts:88`). UI is full-amount-only.

- On modal open, fetch `GET /refunds/:paymentId/refunds` and compute remaining
  = `payment.amountCents − Σ(amountCents where status ∈ {requested, approved,
  processing, completed})` — mirrors `refundableCents`
  (`refunds/executor.ts:54`). Extract to `apps/web/src/lib/refundable.ts`.
- Replace the fixed amount with an editable LKR input defaulting to remaining.
  Validate `0 < amountCents ≤ remaining`; submit `{ amountCents, reason }`.
- Full-amount behavior unchanged (default value).

### 4. `payment.cancelled` webhook mapping

`paymentsLkEventToType` (`packages/payments/src/paymentslk.ts:50`) never emits
`'payment.cancelled'`, making the processor branch at
`apps/api/src/modules/webhooks/paymentslk.ts:355` dead for real traffic (the
mock gateway passes the value through, `mock.ts:28`).

- Map vendor `payment.cancelled` and `checkout.cancelled` →
  `'payment.cancelled'`.
- Add a dedupe code in `paymentsLkStatusCode` (e.g. `-4`) so
  `payment_events` dedupe (`payment_id, status_code, provider_payment_id`)
  works for repeats.

### 5. Cart clear endpoint

`clearCart` exists in `cart/repository.ts:62` but no route uses it
(`cart/routes.ts:235` voids it); the UI deletes items one by one
(`CartPage.clearAll`, CartPage.tsx:207).

- Add `DELETE /api/cart?businessId=` — session, `requireBusinessRole` with
  `CART_ROLES`, `ensureOpenCart`, `clearCart(cart.id)` → `{ ok: true }`.
  Remove the `void clearCart`.
- `CartPage.clearAll()` calls the endpoint once and invalidates the cart query.

### 6. Bugs

| Bug | Fix |
|---|---|
| `ConversationalOrderPage.tsx:76` hardcoded `businessId: 'default'` (API 403s) | Use `user.memberships[0].businessId` (same pattern as CheckoutPage.tsx:62); show an error state when no membership |
| Dead `/marketplace` links (CheckoutPage.tsx:374, StorefrontPage.tsx:77,104) | Point to `/search` |
| Dead `/support` link (OrderDetailPage.tsx:1012) | Point to `/ask`, copy "Ask Vyro Assistant" (no ticket system exists) |
| Double `/api` prefix (CartHintsBanner.tsx:26, StorefrontPage.tsx:53) | Use paths without `/api` (wrapper already prefixes) |
| Sponsored `CampaignFormPage.tsx:23` calls nonexistent `GET /supplier/products` | Load `GET /supplier-products/by-supplier/:id` + `GET /products?limit=500`, build product options by joining on `productId` (same pattern as `supplier/ProductsPage.tsx:77-104`) |
| Orphan `apps/web/src/admin/Lists.new.tsx` | Delete (not imported anywhere) |

## Test gate

TDD during implementation (tests written first per module):

| Change | Test |
|---|---|
| Cart clear route | `apps/api/test/cart.test.ts`: clears items; 400 without `businessId`; 403 for non-cart role |
| `payment.cancelled` mapping | `packages/payments/src/index.test.ts` (or `paymentslk.test.ts`): mapper + status code + `parseWebhook` of a cancelled payload |
| Cancelled webhook processor | `apps/api/test/webhooks/paymentslk.webhook.test.ts`: cancelled event sets payment `cancelled` and closes attempt |
| Refund remaining helper | `apps/web/test/refundable.test.ts`: in-flight refunds subtract; failed/rejected/cancelled do not |
| Checkout payment orchestration | `apps/web/test/checkoutPayments.test.ts`: single PO redirects, multi-PO navigates to `/orders`, mock gateway does not redirect, failures are non-blocking |
| Address page | `apps/web/test/addressBook.test.ts`: payload mapping/validation for create/patch |

Verification commands (all must pass):

- `pnpm typecheck`
- `pnpm test` (api, web, payments, shared, validation)
- `pnpm --filter @vyro/web build`

Manual smoke: supplier lists product → buyer adds to cart → checkout with
address selection → pay-now redirect (or mock fallback) → supplier accept →
dispatch/POD → deliver → confirm receipt → return → partial refund request.

## Risks / notes

- Mock gateway redirect URL is unreachable; pay-at-checkout must branch on
  `isMock` (response field already returned by `POST /payments/:id/checkout`).
- Multi-PO payment creation is not atomic; deterministic `Idempotency-Key`s
  make retries safe and orders are never rolled back by a payment failure.
- Vendor event name for cancellation is assumed to be `payment.cancelled`
  (`checkout.cancelled` also mapped defensively); confirm against payments.lk
  dashboard docs before deploy.
- Address book cap (50) returns 409 from the server; the page should surface
  `ApiError.message`.
- `OrderDetailPage.refundablePayment` picks the largest confirmed payment; a
  payment partially refunded to zero may still surface until the API rejects
  with `payment already fully refunded` — the modal should show server errors.

## Deferred (out of scope, unchanged)

- Mobile address book screen.
- Product variants; warehouses/lots/expiry; shipment tracking events and
  partial shipments; disputes-as-entity; payout bank/gateway execution;
  invoice PDF endpoint; refund cancel/withdraw endpoint; supplier-facing
  refund initiation; idempotency on `POST /:id/transition`.
- Unmounted dead router `apps/api/src/modules/purchaseOrders/events.ts`.
