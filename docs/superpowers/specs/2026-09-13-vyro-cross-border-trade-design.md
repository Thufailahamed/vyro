# Vyro Cross-Border Trade (Imports + Exports)

**Date:** 2026-09-13
**Status:** Approved design, pending implementation
**Parent:** Existing `orders`, `suppliers`, `buyers`, `products` schema in
`packages/db`; PayHere payment path in `packages/payments`; admin observability
+ audit queue primitives from prior specs.

## 1. Background

Vyro is a Sri Lanka wholesale distribution platform. Today every order is
domestic: SL supplier → SL buyer, LKR only, PayHere only.

The platform needs to support **cross-border trade** in both directions:

- **Export** — verified SL suppliers sell to foreign buyers/brokers.
- **Import** — foreign suppliers onboard, sell to SL buyers.

What is missing today:

- No `country_code` on suppliers or buyers. No way to tell who is in SL.
- No foreign-currency display or FX snapshot. Prices only in LKR.
- No customs model — no HS code, no country of origin, no commercial
  invoice, no COO.
- No incoterms (EXW/FOB/CIF/DDP/DDU). No shipping cost model.
- No foreign payment rail. PayHere is LKR-only.
- No KYC gating for foreign counterparties.
- No sanctions / restricted-goods checks.

The marketplace wants both directions live in v1 with minimum risk: extend
existing tables in place rather than build a parallel overlay system.

## 2. Goals

1. Both directions in single MVP: SL suppliers export, foreign suppliers
   import, foreign buyers + brokers transact.
2. LKR base currency, FX snapshot at order creation. Display converts via
   latest cached rate, but the order forever holds the snapshot it was
   created with.
3. Supplier self-declared shipping + incoterms. No freight-API integration.
4. Supplier-declared HS code per product + country of origin. Duty
   estimated via bundled tariff snapshot (top 500 HS lines).
5. PayHere for LKR-side payment (existing). Wire/SWIFT for foreign side,
   manually reconciled by admin.
6. KYC gate: foreign buyers require `kyc_level >= basic` before first
   cross-border order.
7. Sanctions + restricted-goods blocks at order creation with clear
   error codes. Blocked attempts logged to audit queue.
8. Feature-flagged rollout: `CROSS_BORDER_ENABLED` env var, default off
   in production until manually enabled.

## 3. Non-goals

- Stripe / card payments for foreigners. PayHere + wire only for v1.
- Live freight rate API integration. Supplier self-declared only.
- Live customs broker integration. Documents generated in-app only.
- Per-tenant tariff customization. Single global HS table.
- Trade escrow service. Out of scope.
- Per-country tax registration / VAT collection. SL VAT only for SL
  counterparties; foreign-side tax compliance deferred to buyer/supplier.
- Automatic wire reconciliation via SWIFT messaging. Manual entry only.

## 4. Architecture

```
apps/api/src/
  cross-border/
    fx/
      rates.ts           # fetch from CBSL → exchangerate.host fallback
      snapshot.ts        # freeze rate, return D1 row
    tariffs/
      hs-registry.ts     # lazy-load HS table from packages/db JSON
      duty-calc.ts       # snapshot-based duty estimate
    incoterms.ts         # EXW|FOB|CIF|DDP|DDU enum + required-field map
    shipping/
      self-declared.ts   # supplier enters cost per order
    compliance/
      sanctions.ts       # OFAC + UN list, KV cached, weekly refresh
      restricted.ts      # product × destination restriction check
    docs/
      commercial-invoice.ts   # PDF from order data
      packing-list.ts
      certificate-of-origin.ts
  routes/
    fx.ts                # GET /api/fx/rates
    cross-border.ts      # POST /api/orders/:id/cross-border-meta
                         # POST /api/orders/:id/customs-docs
                         # POST /api/admin/orders/:id/wire-received
  cron/
    fx-refresh.ts        # nightly live rate refresh
    sanctions-refresh.ts # weekly sanctions list refresh

packages/db/src/
  schema/
    countries.ts         # ISO codes, sanctioned flag, FX jurisdiction
    cross-border.ts      # supplier/buyer/order/product extensions
    fx-snapshots.ts
    order-customs-docs.ts
  data/
    hs-codes.json        # top 500 HS lines, snapshot of CBSL tariff
```

Layered: **data → services → routes → cron**. Existing handlers untouched
except where cross-border fields surface (order create hook, order list
filter, admin wire-recon endpoint).

## 5. Schema changes

### 5.1 New tables

**countries**
- `code` text PK (ISO 3166-1 alpha-2)
- `name` text
- `is_sanctioned` bool default false
- `fx_jurisdiction` text

**fx_snapshots**
- `id` text PK (uuid)
- `base` text (always LKR)
- `quote_currency` text
- `rate` numeric(18,8)
- `fetched_at` timestamp
- `provider` text (CBSL|exchangerate.host)

**order_customs_docs**
- `id` text PK (uuid)
- `order_id` text FK → orders.id
- `kind` enum(invoice|packing-list|coo|awb|bl)
- `r2_path` text
- `uploaded_at` timestamp
- `uploaded_by` text FK → users.id

### 5.2 Extended tables

**suppliers** add:
- `country_code` text FK → countries.code default 'LK'
- `tax_id` text nullable
- `is_export_eligible` bool default false
- `default_incoterms` enum(EXW|FOB|CIF|DDP|DDU) nullable
- `default_hs_code` text nullable
- `default_country_of_origin` text FK → countries.code nullable

**buyers** add:
- `country_code` text FK → countries.code default 'LK'
- `tax_id` text nullable
- `kyc_level` enum(none|basic|enhanced) default none
- `kyc_verified_at` timestamp nullable
- `kyc_verified_by` text FK → users.id nullable

**products** add:
- `hs_code` text nullable
- `country_of_origin` text FK → countries.code nullable
- `is_export_controlled` bool default false

**orders** add:
- `direction` enum(domestic|export|import) default domestic
- `incoterms` enum(EXW|FOB|CIF|DDP|DDU) nullable
- `fx_snapshot_id` text FK → fx_snapshots.id nullable
- `declared_shipping_cost_lkr` numeric(18,2) nullable
- `declared_duty_lkr` numeric(18,2) nullable
- `commercial_invoice_no` text nullable
- `customs_status` enum(none|pending|cleared|held) default none
- `wire_ref` text nullable
- `wire_received_amount` numeric(18,2) nullable
- `wire_received_currency` text nullable
- `wire_received_at` timestamp nullable
- `wire_received_by` text FK → users.id nullable

All money columns `numeric(18,2)`. FX rate `numeric(18,8)`. No float.

## 6. Components

### 6.1 FX service

- `getRate(base, quote)` → fetch + KV cache (TTL 3600s)
- `snapshot(base, quote)` → freeze rate, return `fx_snapshots` row id
- Provider order: CBSL → exchangerate.host (graceful fallback)
- Stale-rate policy: last successful snapshot used + `fx_stale: true` flag
- Nightly cron refresh at 02:00 UTC

### 6.2 Tariff service

- `estimateDuty(hsCode, countryOfOrigin, declaredValueLkr)` →
  `numeric(18,2)` | null. Returns an **estimate only**.
- HS table: bundled JSON, lazy-loaded.
- Unknown HS code → returns null + `HS_CODE_UNKNOWN` warning flag on order.
- `orders.declared_duty_lkr` is **supplier-declared** and overrides the
  estimate; admin reviews and may correct at the customs-clearance step.
- Non-blocking at order creation — admin reconciles later.

### 6.3 Sanctions + restricted-goods service

- `isCountrySanctioned(countryCode)` → bool, KV cached OFAC+UN, weekly refresh
- `isProductRestricted(productId, destCountry)` → bool, combines HS + category
- Order create blocks with `COUNTRY_SANCTIONED` or `PRODUCT_RESTRICTED`
- Audit log entry per blocked attempt

### 6.4 Incoterms helper

- Pure functions: `shipperResponsibility(incoterms)` → obligation set
- `requiredFields(incoterms)` → gates confirm step (e.g. CIF requires
  `declared_shipping_cost`)

### 6.5 Customs docs

- Upload to R2 bucket `vyro-cross-border-docs` (separate from products).
- PDF generated via `pdfkit` (new dep, no existing PDF lib in repo).
- Signed URL fetch (matches existing R2 pattern).
- Order `ready_to_ship` transition requires commercial invoice present;
  export orders additionally require COO.

### 6.6 Onboarding changes

- Supplier wizard: country + tax_id + default incoterms step
- Buyer wizard: country + KYC step (foreign buyer → `kyc_level=basic`
  upload + admin review)

### 6.7 Order lifecycle hooks

Existing order handler gets pre/post hooks, not rewrites:

- **Pre-create:** sanctions check, restricted check, FX snapshot
- **Pre-confirm:** incoterms required-field validation
- **Pre-ship:** commercial invoice present; COO if export

## 7. Data flow

### 7.1 Quote → Order (cross-border)

1. Buyer views product. Display: `(price_lkr × fx_rate_display)`.
2. Buyer POST `/api/orders`. Server derives counterparty country from
   `buyers.country_code` (cross-border) vs supplier country. If they
   differ → `direction=export` or `direction=import`; if both `LK` →
   `direction=domestic`.
3. Server: sanctions check (buyer country for export, supplier country
   for import) → restricted check → `fx_snapshots` row written →
   `orders` row with `fx_snapshot_id` + `direction`.
4. Order → supplier confirm → same path as domestic + incoterms required.

### 7.2 Shipment

1. Supplier marks `ready_to_ship` → must upload commercial invoice
   (auto-generated from order) + COO if export.
2. R2 path `cross-border-docs/{orderId}/{kind}.pdf`.
3. Server stamps `customs_status=pending` + `commercial_invoice_no`.

### 7.3 Payment reconciliation (foreign, wire/SWIFT)

1. Buyer selects wire → `awaiting_payment_confirmation`.
2. Admin POST `/api/admin/orders/:id/wire-received` with `wire_ref`,
   `received_amount`, `received_currency`, `received_at` (defaults
   to admin-action timestamp).
3. Server converts `received_amount` → LKR using the FX snapshot dated
   `received_at` (creates a fresh snapshot if none exists for that day),
   sets order `paid`. If `received_amount_lkr` differs from order total
   LKR by > 1% → 422 `WIRE_RECONCILIATION_MISMATCH` with the delta.
4. Admin must explicitly POST a follow-up acknowledge with the same
   amount to clear the mismatch (no auto-correct).
5. Audit log entry (append-only): who marked, when, wire ref, delta.

### 7.4 FX snapshot lifecycle

- **Live** (KV, TTL 1h) for display.
- **Frozen** (D1 `fx_snapshots` row) at order creation, immutable, tied to
  order forever.
- Refunds use original snapshot rate — never re-rated.
- Cron refreshes live only.

### 7.5 Compliance hooks

- Sanctioned country → 422 `COUNTRY_SANCTIONED` at create.
- Restricted product in dest country → 422 `PRODUCT_RESTRICTED`.
- All blocked attempts → audit queue.

### 7.6 Read paths

- `GET /api/orders` filterable by `direction`, `country_code`,
  `customs_status`.
- Existing buyer/supplier views gain cross-border columns (display only,
  no logic change in view code paths).

## 8. Error handling

### 8.1 Taxonomy

| Code | HTTP | Retryable | Surface |
|------|------|-----------|---------|
| `COUNTRY_SANCTIONED` | 422 | no | audit |
| `PRODUCT_RESTRICTED` | 422 | no | audit |
| `FX_UNAVAILABLE` | 503 | yes | client retry-with-backoff |
| `INVALID_INCOTERMS` | 422 | no | client form |
| `KYC_REQUIRED` | 422 | no | client redirect to KYC |
| `MISSING_CUSTOMS_DOC` | 422 | no | supplier UI |
| `WIRE_RECONCILIATION_MISMATCH` | 422 | no | admin ack required |
| `HS_CODE_UNKNOWN` | 200 | n/a | warning flag on order |

All errors: `{ code, message, retryable, details? }`. Internal list never
leaked; full detail in audit log only.

### 8.2 Observability

- Every cross-border event → audit queue (existing).
- Analytics Engine counters: `cross_border_orders_total{direction}`,
  `fx_snapshot_age_seconds`, `wire_recon_mismatch_total`.
- SLO rule: `fx_snapshot_age > 86400` → alert (existing pattern).

### 8.3 Rollback

- New columns nullable / default to existing values → safe additive
  migration.
- `direction` defaults `domestic` → no behavior change for existing rows.
- `CROSS_BORDER_ENABLED` env var gates order create path. Off → all
  orders forced to `direction=domestic`, no FX snapshot.
- One-shot backfill: existing suppliers/buyers default to `country_code=LK`,
  verified SL buyers get `kyc_level=basic`, all others `none`.

## 9. Testing

### 9.1 Unit (`vitest`)

- FX: snapshot immutability, rate math precision, cache TTL.
- Tariff: HS lookup hits + miss, duty calc edge cases.
- Incoterms: required-field mapping per term.
- Sanctions: country code normalization (case, ISO variants).
- Wire reconciliation: snapshot-vs-current delta handling.

### 9.2 Integration (vitest + miniflare)

- Order create: domestic → export transition with FX snapshot written.
- Sanctioned country → 422 + audit entry, no order row.
- Restricted product → 422, audit details contain HS + dest.
- Cross-border order missing incoterms → blocked at confirm.
- Customs doc upload: R2 put + signed URL fetch round-trip.
- Wire recon happy path + mismatch + stale snapshot paths.

### 9.3 E2E (Playwright)

- Supplier onboarding: country + tax_id + default incoterms →
  `is_export_eligible=true`.
- Buyer onboarding: foreign buyer → KYC gate blocks first order.
- Full export: SL supplier → foreign buyer → invoice generated → wire paid.
- Full import: foreign supplier → SL buyer → PayHere path unchanged,
  customs docs uploaded.
- Admin wire recon: mismatch requires explicit ack.

### 9.4 Contract / schema

- Drizzle schema vs migration diff — no drift.
- Zod schemas mirror DB enum values — single-source test.

### 9.5 Manual pre-prod checklist

- Sanctions list refresh against live KV.
- FX fallback (CBSL down → exchangerate.host) in dry-run cron.
- PDF generation renders real invoice from fixture order.
- Audit log search `code=COUNTRY_SANCTIONED` returns blocked attempts.

### 9.6 Coverage targets

- 90% lines on new cross-border modules.
- 100% on FX snapshot + wire recon paths (money-critical).

## 10. Migration plan

1. Ship schema migration + backfill (no behavior change). `direction`
   defaults `domestic` for all existing rows.
2. Ship FX service + cron behind `CROSS_BORDER_ENABLED=false`.
3. Ship sanctions + restricted service behind flag.
4. Enable flag in staging. Verify order create path for cross-border
   (sandbox buyer).
5. Enable flag in production after admin onboarding of first foreign
   counterparty.
6. Enable wire reconciliation endpoint after first wire payment lands.
7. Enable customs doc generation after first export order ships.

## 11. Open questions

- HS table source-of-truth: CBSL tariff API vs. manual snapshot PRs.
  Default: manual snapshot PRs. Revisit after first 90 days.
- SWIFT confirmation: integrate bank statement parsing? Defer until
  reconciliation volume justifies.
- Foreign-side tax compliance: legal counsel needed before any
  cross-border payment automation.