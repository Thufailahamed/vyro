# Leftovers Phase 2 — Mobile Invoice PDF & Supplier Idempotency (Design)

2026-10-08

## Scope

Two follow-ups accepted after the leftovers workstream:

1. Mobile buyer invoice screen shares the server-rendered PDF instead of the
   HTML snapshot.
2. Supplier-side idempotency: optional `Idempotency-Key` on
   `POST /purchase-orders/:id/accept`, and keys sent from every supplier
   accept/transition call in web and mobile.

User decisions (2026-10-08):
- Mobile: replace the HTML share with PDF share (no second button).
- Supplier keys: cover the accept endpoint plus all supplier transition calls;
  delivery transitions and POD upload stay as-is (they already have status /
  `expectedFrom` guards).

## Design

### 1. Mobile invoice PDF

File: `apps/mobile/src/features/buyer/orders/InvoiceScreen.tsx`

- `share()` (line 49-59) changes to
  `shareApiFile(`/invoices/${encodeURIComponent(number!)}/pdf`, `${number}.pdf`, 'application/pdf')`.
- Footer button (line 97) title → `Share invoice PDF` (icon stays `Share2`).
- Update the two stale HTML references: the component doc comment (line 36)
  and the empty-lines copy (line 121) now say PDF.
- Rationale: external/in-app browser URLs cannot carry the native session
  cookie; `shareApiFile` streams through `api.raw` (cookie header) then uses
  the OS share sheet — the existing pattern for the supplier PO invoice PDF
  (`features/supplier/portal/SupplierOrderDetailScreen.tsx:116`).

No API, web, or schema changes.

### 2. Supplier-side idempotency

#### 2a. Server: optional key on `/accept`

File: `apps/api/src/modules/purchaseOrders/routes.ts` (`POST /:id/accept`,
line 214-234), mirroring the existing `/transition` implementation
(lines 189-211):

- Read `Idempotency-Key`; `requestHash = hashRequestBody({ poId: po.id, lines: parsed.data.lines ?? null, note: parsed.data.note ?? null })`.
- If key present and a stored response exists: `assertIdempotencyMatch` →
  409 on mismatch, otherwise replay with the stored status/body.
- On success store
  `storeIdempotencyResponse(DB, ctx.userId, key, hash, 200, JSON.stringify(out))`
  where `out` is the `AcceptOrderResult` (`partialAccept.ts:20`).
- Keyless behaviour unchanged; the existing `po.status !== 'pending'` guard
  (`partialAccept.ts:49`) still rejects a second accept.

#### 2b. Clients send keys

Web (`api.post` third arg `{ idempotencyKey: crypto.randomUUID() }`):

| File:line | Call |
|---|---|
| `apps/web/src/pages/SupplierOrdersPage.tsx:126` | reject/advance transition |
| `apps/web/src/pages/SupplierOrdersPage.tsx:145` | quick accept (in full) |
| `apps/web/src/pages/SupplierOrdersPage.tsx:650` | POD dialog delivered transition |
| `apps/web/src/supplier/SupplierOrderDetailPage.tsx:81` | advance/reject transition |
| `apps/web/src/supplier/SupplierOrderDetailPage.tsx:345` | delivered transition |
| `apps/web/src/supplier/SupplierOrderDetailPage.tsx:461` | partial accept |

Mobile (`api.post(..., { idempotencyKey: true })` — the client generates the
key, `src/lib/api.ts:97`):

| File:line | Call |
|---|---|
| `apps/mobile/src/features/supplier/ops/OrderActions.tsx:23` | `useTransition` |
| `apps/mobile/src/features/supplier/ops/AcceptOrderSheet.tsx:94` | accept |
| `apps/mobile/src/features/supplier/ops/DeliverySheets.tsx:67` | delivered transition |

Included because they are `/transition` calls. Pod upload
(`DeliverySheets.tsx:65`), tracking PATCH, and
`POST /deliveries/:poId/transitions` are unchanged.

## Test gate

- New `apps/api/test/orders/acceptIdempotency.test.ts` (real D1, session mock):
  - accept full (`{}`) with key → 200 `AcceptOrderResult`; replay same key
    returns the identical body; exactly one `order_events` row with
    `to_status = 'accepted'`.
  - same key + different `note` → 409.
  - keyless second accept → 409 (state guard unchanged).
- Web: `pnpm --filter @vyro/web typecheck` + existing suite.
- Mobile: `pnpm --filter @vyro/mobile typecheck && pnpm --filter @vyro/mobile lint`.
- Final: `pnpm typecheck`, `pnpm test`, `pnpm --filter @vyro/web build`.

## Risks / notes

- Mobile has no test runner; verification is typecheck + lint (per
  `apps/mobile/CONVENTIONS.md`).
- The supplier web pages may be under active edit by another session; stage
  explicit paths only and re-check `git status` before committing.
- `/accept` stores only successful responses; a failed accept can be retried
  with the same key.

## Deferred

- `/deliveries/:poId/transitions` idempotency, POD upload idempotency.
- Buyer transition keys already shipped; admin override keys are not planned.
