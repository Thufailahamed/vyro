---
title: Admin Payment Search + Detail
status: approved
date: 2026-09-09
---

# Admin Payment Search + Detail

## Problem

MoneyPage (`/admin/money`) covers refund queue, payout batches, ledger
summary, and open chargebacks. It does not expose the underlying payment
record. When ops needs to investigate a chargeback, look up a duplicate
charge, or reconcile a PayHere settlement, there is no way to:

- find a payment by id, transaction reference, or gateway reference across
  every business and supplier,
- see the full timeline of a payment (created → paid → confirmed → refunded
  or chargeback),
- inspect the linked purchase order, business, supplier, refund attempts,
  chargebacks, and ledger entries in one place,
- filter by status, method, amount, date, business, or supplier.

## Goal

Add two admin surfaces:

- `/admin/payments` — cross-tenant payment search with filters and pagination.
- `/admin/payments/:id` — single-payment detail page with timeline + linked
  entities + ledger entries.

Reuse the existing `payment:read` permission (already granted to
`super_admin`, `finance`, `support`). No new tables, no new indexes, no new
permissions.

## Non-goals

- Admin-initiated refund issuance (covered by a follow-up spec).
- Failed-payment triage inbox (follow-up spec).
- Reconciliation report against PayHere settled amounts (follow-up spec).
- Editing payment records.
- Refunding from the detail page (deep-link to MoneyPage refund tab only).

## Architecture

```
admin SPA →  /admin/payments        (list)
             /admin/payments/:id    (detail)
               │
               └─ GET /api/admin/payments            (search)
                  GET /api/admin/payments/:id        (bundle)
                  GET /api/admin/payments/options    (filter lookups)
```

Three new files under `apps/api/src/modules/admin/payments/`:

- `paymentSearchRepository.ts` — D1 queries with filter / cursor logic.
- `paymentSearchService.ts` — list / detail bundle assembly.
- `routes.ts` — Hono sub-router mounted at `/api/admin/payments/*`.

Three new hooks in `apps/web/src/admin/`:

- `useAdminPaymentSearch.ts`
- `useAdminPaymentDetail.ts`
- `useAdminPaymentOptions.ts`

Two new pages in `apps/web/src/admin/`:

- `PaymentsPage.tsx` (list)
- `PaymentDetailPage.tsx` (detail)

## Data shape

### List query parameters

| Param | Type | Notes |
|---|---|---|
| `q` | string ≤200 | prefix match on `id`, exact match on `transactionReference` / `gatewayRef` |
| `status` | csv enum | `pending`, `confirmed`, `failed`, `refunded` |
| `method` | enum | `cash`, `bank_transfer`, `online` |
| `businessId` | string | exact |
| `supplierId` | string | exact |
| `minCents` | int ≥0 | inclusive |
| `maxCents` | int ≥0 | inclusive |
| `from` | unix ms | created_at lower bound |
| `to` | unix ms | created_at upper bound |
| `cursor` | string | opaque, base64(`createdAtMs:id`) |
| `limit` | int 1..200 | default 50 |
| `sort` | enum | `createdAt-desc` (default), `createdAt-asc`, `amount-desc`, `amount-asc` |

### List response

```ts
{
  payments: Array<{
    id: string;
    purchaseOrderId: string;
    poNumber: string;
    businessId: string;
    businessName: string;
    supplierId: string;
    supplierName: string;
    amountCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    status: 'pending' | 'confirmed' | 'failed' | 'refunded';
    method: 'cash' | 'bank_transfer' | 'online';
    transactionReference: string | null;
    gatewayRef: string | null;
    paidAt: number | null;
    confirmedAt: number | null;
    createdAt: number;
  }>;
  nextCursor: string | null;
}
```

### Detail response

```ts
{
  payment:        PaymentRow & {
    statusReason: string | null;
    idempotencyKey: string | null;
    gatewayPayload: string | null;       // raw JSON string from PayHere
    confirmedByUserId: string | null;
    notes: string | null;
    updatedAt: number;
  };
  purchaseOrder:  {
    id: string;
    poNumber: string;
    status: string;
    totalCents: number;
    createdAt: number;
    deliveryAt: number | null;
  };
  business:       { id: string; name: string; email: string | null };
  supplier:       { id: string; name: string; email: string | null };
  refunds: Array<{
    id: string;
    status: string;
    amountCents: number;
    requestedByUserId: string | null;
    requestedAt: number;
    resolvedAt: number | null;
    resolvedByUserId: string | null;
    reason: string | null;
  }>;
  chargebacks: Array<{
    id: string;
    status: 'open' | 'resolved';
    reason: string | null;
    notes: string | null;
    createdAt: number;
    resolvedAt: number | null;
  }>;
  ledger: Array<{
    id: string;
    accountType: string;
    direction: 'credit' | 'debit';
    amountCents: number;
    currency: string;
    description: string | null;
    createdAt: number;
  }>;
}
```

## API contracts

All routes require the authenticated admin context. Reads gated by
`requirePermission('payment:read')`. Writes (none in this spec) gated by
their own permissions in follow-up work.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/admin/payments` | `{ payments, nextCursor }` |
| GET | `/api/admin/payments/:id` | detail bundle |
| GET | `/api/admin/payments/options` | `{ businesses, suppliers }` for filter dropdowns |

### Cursor format

`base64(createdAtMs + ':' + id)` — opaque to clients. Server decodes for
the next page query: `created_at < X OR (created_at = X AND id < Y)`.
Stable across inserts/deletes because the tie-breaker is the primary key.

### Search repository

A single SQL composition in
`apps/api/src/modules/admin/payments/paymentSearchRepository.ts`:

```ts
export async function searchPayments(
  db: DrizzleDb,
  filters: PaymentSearchFilters,
): Promise<{ rows: PaymentRow[]; nextCursor: string | null }>;
```

Internals:

- Joins `payments ⋈ purchase_orders ⋈ suppliers ⋈ businesses` for names.
- Builds `AND`-chain of conditions.
- `q` filter: `(id LIKE :prefix) OR (transaction_reference = :q) OR (gateway_ref = :q)`. Prefix is `q + '%'`; max length 200.
- `status` (csv) splits to `IN (...)` clause.
- `from` / `to` clamp `created_at`.
- Amount filters on `amount_cents`.
- Sort dispatches to `.orderBy(...)`.
- Cursor: `lt(createdAt, X) OR (and(eq(createdAt, X), lt(id, Y)))`.
- `.limit(limit + 1)`; if `limit + 1` returned, drop last, encode `nextCursor = base64(rows[last].createdAt + ':' + rows[last].id)`.

### Detail bundle repository

Three queries (one for the payment + joins, one for refunds, one for
chargebacks + ledger) executed in parallel via `Promise.all`.

Refund linkage: `refunds.paymentId = payment.id` — confirm schema has this
column before implementation; if not, fall back to linking via
`refunds.purchaseOrderId = payment.purchaseOrderId` and document.

Chargeback linkage: `chargebacks.paymentId = payment.id`.

Ledger linkage: `ledger_entries.metadata_json LIKE '%"paymentId":"<id>"%'`
(D1 JSON1 query) — fragile; alternative is `ledger_entries.id` keyed by
metadata. Document chosen strategy in the implementation plan.

## Permissions

Reuses existing `payment:read` (already in `PERMISSION_KEYS` and granted to
`super_admin`, `finance`, `support` roles). No schema changes.

## UI

### `/admin/payments` (list)

Sections:

1. **Filter bar** — collapsible panel with chips:
   - free-text `q`
   - status multi-select (chips: pending / confirmed / failed / refunded)
   - method radio (any / cash / bank_transfer / online)
   - business dropdown (from `/api/admin/payments/options`)
   - supplier dropdown
   - min/max amount (numeric inputs in LKR; convert to cents on submit)
   - date range (datetime-local pair)
2. **Results table** — paginated (default 50). Columns: payment id,
   PO #, business, supplier, amount (with currency), fee, status badge,
   method, when (relative time with hover ISO). Row click navigates to
   `/admin/payments/:id`.
3. **Saved views** — leverage `useSavedViews` (already in
   `apps/web/src/admin/lib/`). Filter state serializes to URL params.

### `/admin/payments/:id` (detail)

Sections:

1. **Header** — payment id (truncated, copy on click), status badge,
   amount + currency, action chips: jump to PO, business, supplier.
2. **Timeline** — vertical timeline of events:
   - created (timestamp, actor if known)
   - paid (if `paidAt`)
   - confirmed (timestamp + actor)
   - refund requested / approved / rejected / processed (per refund)
   - chargeback opened / resolved (per chargeback)
3. **Linked entities** — three side-by-side cards: PO summary (status +
   total), business card (name + email), supplier card (name + email).
4. **Gateway response** — collapsible `<details>` showing the raw JSON
   from `gatewayPayload`. Keys matching `(secret|password|signature)` are
   masked in the UI (not in storage — storage unchanged).
5. **Refunds table** — linked refunds; for `requested` status, show
   "Open in refund queue →" link to `MoneyPage` tab.
6. **Chargebacks table** — linked chargebacks with resolve link if open.
7. **Ledger table** — entries for this payment or any of its refunds.
   Columns: timestamp, account type, direction, amount, description.

### Hooks

- `useAdminPaymentSearch(filters)` — TanStack Query; refetches on filter
  change with stable query key.
- `useAdminPaymentDetail(id)` — TanStack Query; stale time 60s.
- `useAdminPaymentOptions()` — TanStack Query; stale time 5 min; provides
  business + supplier dropdowns.

### Reuse

- `useAdminTable.ts` for pagination/sort state in the list.
- `useSavedViews.ts` for saved filter sets.
- `PageHeader`, `Surface`, `ErrorBanner`, `Button` from `@/components/ui`.

## Audit

Every detail-page open emits an `admin_audit_logs` row (action
`payment.view`, target `{ type: 'payment', id }`). No PII in metadata
beyond the viewer + payment id. Bulk list queries do not audit per row —
only the user's first search load is logged via existing
`/api/admin/payments` request audit pattern (mirrors the existing audit
strategy for `/admin/suppliers`, `/admin/businesses`).

## Testing

Unit:

- `paymentSearchRepository.test.ts` — filter composition; cursor
  pagination; sort dispatch; `q` matching on prefix / exact; amount range
  clamping; status multi-value.
- `paymentSearchService.test.ts` — detail bundle shape; graceful empty
  fields when refund / chargeback / ledger arrays are empty.

Integration:

- The existing `apps/api/test/admin/freezeUnfreeze.test.ts` is the
  template. Add `payments.test.ts` that hits a mocked D1 returning a
  payment row + joins, verifies the list response shape and the detail
  bundle.

Permission:

- Non-admin → 401 from `session()` middleware; admin without
  `payment:read` → 403.

UI:

- `PaymentsPage.test.tsx` — render with mocked list payload, click row,
  assert navigation.
- `PaymentDetailPage.test.tsx` — render detail, verify timeline + linked
  cards render.

## Migration plan

1. Add the three repository / service / route files (additive, no schema
   change).
2. Wire the page + routes into the SPA shell behind a feature flag
   `ADMIN_PAYMENTS_ENABLED` (env var defaulting to `true` for local +
   `false` for prod until shipped). Reads from `Env.ADMIN_PAYMENTS_ENABLED`.
3. Flip flag in prod after one week of staging soak.
4. Remove flag once stable.

Rollback: remove the three files, the page components, the routes; no
data migration. Flag is the only blast radius.

## Open risks

- **Ledger linkage via metadata JSON LIKE**: D1 does not have native JSON
  indexing. Acceptable for v1 because the typical fan-out per payment is
  small (1–5 ledger entries). Defer a `ledger_payment_id` column until
  measured.
- **Gateway payload PII**: PayHere payloads can contain customer email
  and last-4 of card. The masking rule only hides obvious secret fields;
  the operator still sees emails. Documented in runbook; v1 risk
  accepted; v2 should redact at storage time.
- **`q` performance**: prefix `LIKE` with no index. Acceptable to ~100k
  payments. If slow, add `payments_id_prefix_idx` later.

## Out of scope (deferred)

- Admin-initiated refund issuance (separate spec).
- Failed payment inbox + retry (separate spec).
- PayHere reconciliation report (separate spec).
- Editing payment records.
- Cross-business payment analytics (separate spec).