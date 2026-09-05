# VYRO Payments + Accounts — Design

Date: 2026-09-05
Status: Approved
Scope: gateway integration, refunds, payouts, ledger, invoices, bug fixes, reconciliation

## Goal

Complete VYRO's payments + accounts surface end-to-end so that:

1. Businesses can pay suppliers online (PayHere) or via recorded offline methods.
2. Suppliers can see real balances, statements, payouts, and downloadable invoices.
3. Admins can resolve disputes with real refunds and payout tracking.
4. Every monetary movement is captured in an internal ledger, auditable.

## Non-goals

- Real PDF generation (Workers constraint; HTML receipt + browser print-to-PDF v1).
- Multi-bank-account-per-supplier (single primary bank account v1).
- Multi-currency (LKR-only; schema permits but UI/codes hardcode LKR).
- KMS for bank encryption (env-key AES-GCM v1; KMS migration deferred).
- Buyer-side escrow / held funds (only supplier-side payouts).
- Subscription billing.

## Architecture

```
apps/api/src/modules/
├── payments/      (refactor: idempotency, tx wrap, partial, PO-guard, RBAC tighten)
├── refunds/       (NEW: routes, repository, list)
├── payouts/       (NEW: routes, repository, list)
├── ledger/        (NEW: write API, queries — internal, not a router)
├── invoices/      (NEW: routes, repository, html render)
├── webhooks/      (NEW: payhere receiver)
└── accounts/      (NEW: balance + statement views)

packages/
└── payments/      (NEW shared pkg: GatewayAdapter iface + PayHere impl)
```

### Layered write order

Every payment-state change writes through `ledger.write(...)` BEFORE returning to the client, inside the same DB transaction. Failure to write ledger aborts the entire state change.

```
payment.confirmed  → ledger entries → invoice row (if not exists)
payment.refunded   → ledger entries (reversal) → invoice reversal note
payout.paid        → ledger entries
```

## Schema (single migration set)

### Alter existing tables

```ts
// payments
+ gatewayRef text
+ gatewayPayload text (json string)
+ feeCents integer not null default 0
+ netCents integer not null  // amountCents - feeCents
+ statusReason text
+ idempotencyKey text  // unique per (userId, key)

// supplierSettings
+ bankAccountHolder text
+ bankVerified integer (boolean) default 0
```

### New tables

```ts
refunds {
  id PK text
  paymentId FK → payments.id
  amountCents int not null
  reason text
  status text enum[requested, processing, completed, failed] default requested
  gatewayRefundId text nullable
  requestedByUserId FK → users.id
  processedAt int nullable
  failureReason text nullable
  createdAt int
  updatedAt int
}

payouts {
  id PK text
  supplierId FK → suppliers.id
  amountCents int not null  // gross receivable
  feeCents int not null default 0
  netCents int not null
  currency text not null default 'LKR'
  status text enum[pending, processing, paid, failed] default pending
  periodStart int not null
  periodEnd int not null
  method text enum[bank, cash] not null
  reference text nullable  // bank ref or admin note
  paidAt int nullable
  paidByUserId FK → users.id nullable
  failureReason text nullable
  createdAt int
  updatedAt int
  index (supplierId, status)
}

invoice_sequences {
  supplierId FK + year int  // composite PK
  type text enum[receipt, tax_invoice]
  lastNumber int not null default 0
}

invoices {
  id PK text
  number text unique  // RC-{sup}-{year}-{seq} or INV-{sup}-{year}-{seq}
  type text enum[receipt, tax_invoice]
  paymentId FK → payments.id nullable
  purchaseOrderId FK → purchase_orders.id
  businessId FK → businesses.id
  supplierId FK → suppliers.id
  subtotalCents int not null
  taxCents int not null default 0
  totalCents int not null
  currency text not null default 'LKR'
  issuedAt int not null
  dueAt int nullable
  htmlSnapshot text not null
  pdfGeneratedAt int nullable  // always null v1
  createdByUserId FK → users.id
  createdAt int
  index (purchaseOrderId), index (supplierId, issuedAt)
}

invoice_items {
  id PK text
  invoiceId FK → invoices.id
  description text not null
  quantity int not null
  unitCents int not null
  lineTotalCents int not null
}

ledger_entries {
  id PK text
  accountType text enum[supplier, business, platform]
  accountId text not null  // supplierId, businessId, or 'platform'
  direction text enum[debit, credit] not null
  amountCents int not null
  currency text not null default 'LKR'
  refType text enum[payment, refund, payout, fee, adjustment] not null
  refId text not null
  description text not null
  createdByUserId FK → users.id nullable
  createdAt int not null
  index (accountType, accountId, createdAt)
  index (refType, refId)
}

payment_idempotency_keys {
  key text
  userId text
  // composite PK
  requestHash text not null
  responseJson text not null
  statusCode int not null
  expiresAt int not null
  createdAt int
}
```

## Gateway (PayHere)

### Adapter interface (`packages/payments/src/types.ts`)

```ts
export interface GatewayAdapter {
  readonly provider: 'payhere' | 'mock';
  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult>;
  parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifySignature(rawBody: string, signature: string | null): boolean;
}
```

### PayHere impl (`packages/payments/src/payhere.ts`)

- `startCheckout`: builds PayHere `checkout` form fields (merchant_id, return_url, cancel_url, notify_url, order_id, items, amount, currency, hash = MD5(merchantId + orderId + amount + currency + hmacSecret.uppercase())). Returns `{ redirectUrl, gatewayRef }`.
- `parseWebhook`: parses form-encoded body, verifies hash, returns typed event.
- `refund`: calls PayHere refund REST endpoint with `payment_id` + `amount` + HMAC.
- Sandbox toggle via `PAYHERE_SANDBOX=1` → uses `sandbox.payhere.lk` hosts.

### Env (add to `apps/api/wrangler.toml` + secrets)

```
PAYHERE_MERCHANT_ID
PAYHERE_MERCHANT_SECRET       (secret)
PAYHERE_NOTIFY_URL            (secret, derived from env if absent)
PAYHERE_SANDBOX               "1" | "0"  default "1"
PAYHERE_REFUND_API_URL        optional override
GATEWAY_DEFAULT_PROVIDER      "payhere" | "mock"  default "mock" if PAYHERE_MERCHANT_ID absent
LEDGER_ENCRYPTION_KEY         32-byte hex (secret)
```

Factory: if `PAYHERE_MERCHANT_ID` empty → return `MockGateway` (logs + returns success); else `PayHereGateway`. Both implement same iface.

## API surface

### New endpoints

```
POST  /api/payments/:id/checkout         method=online  → { redirectUrl, gatewayRef, expiresAt }
POST  /api/payments/:id/refund          business|admin, body { amountCents?, reason }
                                            → { refundId, status }
GET   /api/payments/:id/refunds         role-scoped
POST  /api/payments/webhook/payhere     raw body, HMAC verify, idempotent
                                            (mounted under /api/payments for legacy or /api/webhooks? — see Routing)

GET   /api/payouts?supplierId=          supplier members|admin
GET   /api/payouts/:id                  role-scoped
POST  /api/admin/payouts/:id/mark-paid  admin, body { reference }
POST  /api/admin/payouts/:id/mark-failed admin, body { reason }
POST  /api/admin/payouts/generate       admin, body { supplierId, periodStart, periodEnd }
                                            → creates payout row aggregating pending payments

GET   /api/invoices?poId=               role-scoped
GET   /api/invoices/:id                 role-scoped
GET   /api/invoices/:id/html            role-scoped, returns text/html
GET   /api/accounts/balance?accountType=&accountId=
GET   /api/accounts/statement?accountType=&accountId=&from=&to=&cursor=
```

### Refactored existing endpoints

```
POST  /api/payments                     now:
                                        - requires Idempotency-Key header
                                        - amountCents optional (defaults to PO outstanding)
                                        - business RBAC: purchasing|owner only
                                        - PO must be in {pending, accepted, preparing, ready_for_pickup}
                                        - inside db.transaction: insert payment + write ledger hold + audit

POST  /api/payments/:id/confirm         now:
                                        - body status enum [confirmed, failed] only
                                        - 409 if payment.status !== 'pending'
                                        - business|admin for failed; supplier|admin for confirmed
                                        - confirmed path writes ledger entries + generates invoice
                                        - inside db.transaction

GET   /api/payments                     cursor fixed: lt(payments.createdAt) for desc order

GET   /api/payments/by-po/:poId         same
```

## RBAC matrix

| Action | Business | Supplier | Admin |
|---|---|---|---|
| Create payment | owner\|purchasing | — | ✓ |
| Confirm (mark confirmed) | — | owner\|sales | ✓ |
| Confirm (mark failed) | owner\|purchasing | — | ✓ |
| Request refund | owner\|purchasing | — | ✓ |
| Generate payout | — | — | ✓ |
| Mark payout paid | — | — | ✓ |
| View balance | business member | supplier member | ✓ |
| View statement | business member | supplier member | ✓ |
| View invoice | business member | supplier member | ✓ |

## Idempotency

- Header: `Idempotency-Key: <uuid>` on `POST /api/payments` + `POST /api/payments/:id/checkout` + `POST /api/payments/:id/refund`.
- Scoped per (userId, key). TTL 24h.
- Replay returns stored response. Hash mismatch → 409.
- Webhook events: deduped by `gatewayRef + eventType`.

## Invoice rendering

### Numbering

`{PREFIX}-{supplierId}-{year}-{seq:06}`
- Receipt prefix `RC`, Tax invoice prefix `INV`.
- Counter per `(supplierId, year, type)` via `invoice_sequences` row, atomic UPDATE…RETURNING (SQLite supports via Drizzle `.returning()`).

### HTML template

- Single template file `packages/ui/src/invoice/template.ts` returns string.
- Inline CSS only (no external assets — print-friendly).
- Header: VYRO brand, supplier info, invoice number + type, date.
- Body: business info, PO ref, line items table (description / qty / unit / total), totals.
- Footer: payment status, "Generated electronically" note.

### Download

`GET /api/invoices/:id/html` sets `Content-Disposition: attachment; filename="invoice-{number}.html"`. Browser print-to-PDF gives a clean PDF locally.

## Ledger rules

```
payment.create   (no ledger — pending status not yet "movement")
payment.confirm  → { business:credit netCents, platform:credit feeCents  // platform fee retained }
payment.fail     (no ledger — money never moved)
refund.request   (no ledger — pending)
refund.complete  → { business:debit refundAmount, platform:debit feeRefund }
                  where feeRefund = round(refundAmount * feeCents / amountCents)
                  (proportional refund of the original platform fee)
payout.create    (no ledger — pending)
payout.paid      → { supplier:credit netCents, platform:debit netCents }
adjustment.create (admin only) → { accountX:credit/debit amount }
```

`accountId` for `platform` is the literal `'platform'`.

### Balance query

```sql
SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amountCents ELSE -amountCents END), 0) AS balance
FROM ledger_entries
WHERE accountType=? AND accountId=? AND createdAt <= ?
```

## Payout generation

- `POST /api/admin/payouts/generate` (admin) — aggregates confirmed payments not yet in a payout, within `[periodStart, periodEnd]`, supplier-scoped, computes `amountCents = SUM(netCents - feeCents)` minus existing pending payout amounts. Returns payout row.
- `payout.paid` writes ledger entry.
- Single payout per (supplier, period) enforced via index `(supplierId, periodStart, periodEnd) UNIQUE`.

## Endpoint mounting (`apps/api/src/index.ts`)

```
/api/payments           paymentRouter
/api/payments           refundRouter (mounted at same path, different verbs)
/api/payouts            payoutRouter
/api/admin/payouts      payoutAdminRouter
/api/invoices           invoiceRouter
/api/accounts           accountsRouter
/api/webhooks           webhookRouter  (mounted at /api/webhooks not /api/payments)
```

## UI changes

### `OrderDetailPage.tsx` — add PaymentPanel

- Fetches `/payments/by-po/:poId`.
- Shows: payment status badge, amount, method, transaction reference, confirmed-by, history timeline.
- CTAs:
  - Business (purchasing|owner) + PO not paid + method=online → "Pay online" → calls `/payments/:id/checkout` → `window.location = redirectUrl`.
  - Business (purchasing|owner) + method=offline → "Mark as paid" form (reference input).
  - Admin → "Refund" modal.
  - Supplier (sales|owner) + status=pending → "Confirm receipt" / "Reject".

### `SupplierSettingsForm.tsx` — add bank fields

- New section: Payout details.
- Fields: `payoutMethod` (bank|cash), `bankName`, `bankAccountNo`, `bankBranch`, `bankAccountHolder`.
- Include in PATCH payload.
- Show `bankVerified` badge if true.

### `SupplierPaymentsPage.tsx` — restructure with tabs

- Tabs: Payments / Payouts / Statement.
- Top tile: current balance (from `/accounts/balance`).
- Statement tab: period filter + table of ledger entries + CSV export.

### `ProfilePage.tsx` orgs tab — add balance

- Each business card shows current balance + "Statement" link.

### New: `InvoicePage.tsx` — `/orders/:poId/invoice/:id`

- Fetches `/invoices/:id/html` if `?format=html`, else fetches metadata + renders iframe with srcdoc.

## Bug fixes bundled

| Bug | Fix |
|---|---|
| `listRepository.ts:22` cursor inverted | Use `lt(payments.createdAt)` for desc order |
| No transaction wrapping | Wrap all payment writes in `db.transaction(...)` |
| No idempotency | `Idempotency-Key` header + `payment_idempotency_keys` table |
| Partial payments impossible | `amountCents` optional, validated ≤ PO outstanding |
| PO-status guard missing | Reject if PO ∈ {cancelled, completed, refunded} |
| Confirm blind overwrites status | 409 if not pending; partial state machine |
| RBAC loose | Role-gate per matrix above |
| Dispute refund cosmetic | Wire to `refunds` flow |
| Migrations journal stale | Reconcile after audit |
| OrderDetailPage has no payment panel | Add PaymentPanel |
| SupplierSettingsForm omits bank fields | Include in form + payload |

## Testing

### Unit (per module)

- Each route: happy path + 3-4 error paths + RBAC matrix
- Ledger math: payment→refund→payout sums to zero across platform
- Invoice number atomicity (concurrent increment)
- Idempotency replay returns same response
- PayHere HMAC verify: good, bad, partial

### Integration (helpers)

- `createPo → createPayment(method=online) → checkout → simulate webhook → payment.confirmed → ledger has entries → invoice row created`
- `createPayment(confirmed) → refund → refund.completed → ledger balanced → invoice reversal note`
- `aggregatePayments → generatePayout → markPaid → ledger balanced`

### Existing test updates

- `payments/list.test.ts` — add create/confirm cases
- `deliveryPayment.test.ts` — split schema tests from integration
- `admin/dispute.test.ts` — assert refund flow writes `refunds` row

### Mock gateway

`packages/payments/src/mock.ts` — returns success after 100ms; configurable failure modes.

## Migration journal

After audit, reconcile `packages/db/migrations/meta/_journal.json`:
1. Re-apply existing on-disk migrations in order via drizzle-kit.
2. Generate one new migration `0007_payments_accounts.sql` containing all schema changes in this spec.
3. Update `_journal.json` and snapshot.

## File map (approx LOC)

```
packages/db/migrations/0007_payments_accounts.sql              ~120
packages/db/src/schema/{refunds,payouts,invoices,ledger,...}.ts ~250
packages/payments/src/{types,payhere,mock,index,hash}.ts       ~280
packages/validation/src/{refund,payout,invoice,ledger,...}.ts  ~120
packages/shared/src/constants/{paymentStatus,payoutStatus}.ts  ~30
packages/ui/src/invoice/template.ts                             ~80
apps/api/src/modules/payments/{routes,listRepository,...}.ts   ~250 (refactor)
apps/api/src/modules/refunds/{routes,repository}.ts            ~200
apps/api/src/modules/payouts/{routes,repository,admin}.ts      ~280
apps/api/src/modules/ledger/{writer,queries}.ts                ~150
apps/api/src/modules/invoices/{routes,repository,render}.ts    ~220
apps/api/src/modules/webhooks/payhere.ts                       ~140
apps/api/src/modules/accounts/{routes,queries}.ts              ~150
apps/api/src/index.ts (route mounts)                            +20
apps/api/src/env.ts (env bindings)                             +30
apps/api/test/{refunds,payouts,invoices,accounts,webhooks}/    ~600
apps/api/test/payments/{create,confirm,checkout}.test.ts       ~250
apps/api/test/helpers/*                                        updates
apps/web/src/pages/OrderDetailPage.tsx (PaymentPanel)          ~180
apps/web/src/pages/InvoicePage.tsx (new)                       ~120
apps/web/src/supplier/SupplierSettingsForm.tsx (bank fields)   ~80
apps/web/src/supplier/PaymentsPage.tsx (tabs + statement)      ~280
apps/web/src/pages/profile/* (balance link)                    ~40
scripts/deploy-backend.mjs (env additions)                     +10
```

## Risks

1. **Migration reconciliation** — on-disk files 0001-0006 not in journal; will re-audit before regenerating.
2. **PayHere sandbox creds** — without them at deploy time, gateway falls back to mock; UI shows banner.
3. **HTML-only invoices** — users must print to PDF; acceptable v1, revisit with real PDF service later.
4. **Bank encryption** — env-key AES-GCM is acceptable for v1 but key rotation deferred.
5. **Ledger write cost** — every state change adds a write; small at this scale, monitor.

## Out of scope (deferred)

- Multi-bank per supplier
- Multi-currency
- Real PDF service
- KMS for bank encryption
- Subscription/recurring billing
- Webhook retry queue (synchronous retry inline for v1)
- International supplier tax (only Sri Lanka context)
