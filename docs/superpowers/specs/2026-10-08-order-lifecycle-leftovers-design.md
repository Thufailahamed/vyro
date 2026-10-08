# Order Lifecycle Leftovers — Design (2026-10-08)

## Scope

Five follow-ups from the 2026-10-08 order-lifecycle audit, all in one plan:

1. Mobile delivery address book (mirrors web `/addresses`).
2. Delete the unmounted dead router `apps/api/src/modules/purchaseOrders/events.ts`.
3. Invoice PDF endpoint + web download buttons.
4. Refund cancel/withdraw endpoint + buyer withdraw UI.
5. Idempotency on `POST /api/purchase-orders/:id/transition` + client keys.

User decisions (2026-10-08):
- Refunds: requester may withdraw only `requested`; admin may cancel
  `requested|approved`; `processing` is never cancellable (gateway in flight).
- Invoice PDF: endpoint + web buttons only (mobile out of scope).
- Mobile address book: full CRUD, write actions role-gated to owner/manager.
- Transition idempotency: optional server header + web/mobile send keys for
  buyer cancel / dispute / confirm-receipt.

## Design

### 1. Mobile address book

Files:
- Create `apps/mobile/src/features/buyer/addresses/AddressBookScreen.tsx`
- Create `apps/mobile/src/app/buyer/addresses.tsx` (2-line route re-export)
- Modify `apps/mobile/src/features/buyer/BuyerAccountScreen.tsx` (GROUPS link)
- Modify `apps/mobile/src/lib/mobileHref.ts` (map `/addresses` → `/buyer/addresses`)

Pattern (from recon): `Gate need="business"` wrapper; `useBusinessId()`;
`useQuery(['addresses', businessId])` → `GET /businesses/:businessId/addresses`;
mutations POST/PATCH/DELETE with React Query invalidation; form in `<Sheet>`
(fields label, contact name, phone, address, city, district `Select` from
`src/lib/sriLanka.ts`, default checkbox) validated with the same rules as web
`apps/web/src/lib/addressBook.ts` (port `EMPTY_ADDRESS_FORM`,
`isAddressFormValid`, `toAddressPayload` locally or copy semantics);
delete via `<ConfirmSheet>`; rows via `ListRow` with a "Default" badge and
Set default action. Write actions hidden unless `business.role` is
`owner|manager` (read-only for purchasing/accountant). Loading, empty, and
error states per `apps/mobile/CONVENTIONS.md`.

### 2. Dead router

Delete `apps/api/src/modules/purchaseOrders/events.ts`. It is mounted nowhere;
`apps/api/src/modules/purchaseOrders/routes.ts:222` already serves
`GET /:id/events` with correct participant checks. `eventsRepository.ts` is
used by `routes.ts` and stays. Verify with grep that nothing imports
`./events` or `purchaseOrders/events`.

### 3. Invoice PDF

Files:
- Create `apps/api/src/modules/invoices/pdf.ts` — `renderInvoicePdf(invoice, items, parties): Promise<Uint8Array>` using `pdfkit` (same chunk-collection pattern as `apps/api/src/modules/cross-border/invoicePdf.ts`). Title varies by `invoice.type`: `RECEIPT`, `TAX INVOICE`, `CREDIT NOTE`. Renders: invoice number, issue date, PO number, supplier (name, VAT no), buyer (name, tax id), line items (description, qty, unit price, line total), subtotal, VAT, SSCL, total, currency. Returns bytes, not a browser `ArrayBuffer`.
- Modify `apps/api/src/modules/invoices/routes.ts` — add
  `GET /:id/pdf` mirroring `/:id/html` auth/load (id or number):
  `Content-Type: application/pdf`,
  `Content-Disposition: attachment; filename="<number>.pdf"`, and set
  `invoices.pdf_generated_at = Date.now()` after render.
- Web: `apps/web/src/pages/InvoicePage.tsx` gets a "Download PDF" link
  (`/api/invoices/:id/pdf`, same absolute-path style as the existing HTML
  download) and the invoice rows in
  `apps/web/src/pages/OrderDetailPage.tsx` (~line 924-949) get a PDF link
  beside the existing view link.

Data: reuse `findInvoice`/`findInvoiceByNumber`, `listInvoiceItems`
(`invoices/repository.ts`), plus the PO for `poNumber` and the
business/supplier names (same joins as the HTML snapshot generator in
`invoices/generate.ts`; the invoice row already carries `businessId`/
`supplierId` and `htmlSnapshot` contains the rendered figures — the PDF
renderer reads structured fields, not the HTML).

### 4. Refund cancel / withdraw

Files:
- Modify `packages/validation/src/payment.ts` — add
  `refundCancelSchema = z.object({ reason: z.string().max(500).optional() }).strict()`.
- Modify `apps/api/src/modules/refunds/routes.ts` — add
  `POST /:id/cancel`:
  - Load refund; if missing 404. Load its payment and PO (`loadPaymentAndPo`).
  - Access: admin (`ctx.isAdmin`) may cancel `requested|approved`; a business
    user who is the refund's `requestedByUserId` and holds a business payment
    role (`requireBusinessPaymentRole`) may cancel only `requested`.
  - Guard with `canTransitionRefund(refund.status, 'cancelled')` **and** the
    stage rules above; `processing` → 409 `CONFLICT`.
  - Write `status: 'cancelled'`, `statusReason`/rejection-style note from the
    optional reason, `updatedAt`; append audit
    (`action: 'REFUND_CANCELLED'`) and notify finance/admins via
    `notifyAdmins` (best-effort, same pattern as other refund mutations).
  - Return `{ id, status: 'cancelled' }`.
- Web: `apps/web/src/pages/AccountsPage.tsx` `Refunds` list adds
  `requestedByUserId?: string` to the row type and a Withdraw button on
  `requested` rows (mutation → `POST /refunds/:id/cancel`, invalidates
  `['accounts', 'business-refunds', businessId]`, confirm dialog). Admin
  surfaces already have approve/reject; no admin UI change required.

No gateway interaction: `processing` refunds cannot be cancelled here. The
`refundableCents` calculation already excludes `cancelled` refunds, so a
withdrawn request returns the amount to the refundable balance.

### 5. Transition idempotency

Files:
- Modify `apps/api/src/modules/purchaseOrders/routes.ts` `POST /:id/transition`:
  - Read `Idempotency-Key` header. If present:
    `getIdempotencyResponse(DB, ctx.userId, key)` → replay with stored status
    code; `assertIdempotencyMatch(DB, ctx.userId, key, hashRequestBody({poId, to, reason}))`
    → 409 on reuse with a different body.
  - On success `storeIdempotencyResponse(DB, ctx.userId, key, hash, 200, JSON.stringify({ ok: true, status, refunds }))`.
  - Keyless requests behave exactly as today.
- Web `apps/web/src/pages/OrderDetailPage.tsx`: pass
  `{ idempotencyKey: crypto.randomUUID() }` to `api.post` for the
  `transitionWithReason` (cancel/dispute) and `confirmReceipt` calls. `api.post`
  already supports the option.
- Mobile `apps/mobile/src/features/buyer/orders/OrderDetailScreen.tsx`: same
  for its transition calls (`api.post` supports `{ idempotencyKey }`).

Reuses `apps/api/src/lib/idempotency.ts` (table `payment_idempotency_keys`,
24h TTL, per-user key). Supplier-transition buttons are not in scope.

## Test gate

TDD per module:

| Change | Test |
|---|---|
| Invoice PDF route | `apps/api/test/invoices/pdf.test.ts` (or extend existing invoices tests): seed invoice+items, `GET /:id/pdf` → 200, body starts `%PDF`, `content-disposition` attachment, `pdf_generated_at` set; non-participant → 403 |
| Refund cancel | `apps/api/test/refunds/cancel.test.ts`: requester withdraws `requested`; other business user 403; admin cancels `approved`; `processing` 409; audit written |
| Transition idempotency | `apps/api/test/orders/transitionIdempotency.test.ts`: same key replays one `order_event`; same key + different body → 409; keyless still works |
| Dead router | grep check only (no test) |
| Mobile address book | no test runner — `pnpm --filter @vyro/mobile typecheck` + `npx expo lint` (per `CONVENTIONS.md`) |
| Web withdraw + keys | web typecheck + existing suite; withdraw button behavior covered by API tests + manual smoke |

Full verification: `pnpm typecheck`, `pnpm test`,
`pnpm --filter @vyro/web build`, mobile typecheck + lint.

## Risks / notes

- Invoice PDF: `pdfkit` bundle/runtime is already proven in the Worker by the
  cross-border PDF route; keep the renderer dependency-free (no fonts beyond
  defaults) to stay within Worker size/runtime limits.
- Refund withdraw: `requestedByUserId` can be the order creator when the
  requester was a system path; in that case only admins can cancel. Acceptable.
- Transition idempotency stores only successful responses; a failed transition
  can be retried with the same key. The idempotency table is payment-named but
  the helpers are generic; no schema change.
- Client keys are per action invocation (`crypto.randomUUID()`), so a genuine
  user retry after a network error reuses the key only within the same call.

## Deferred

- Mobile invoice PDF, supplier-side transition keys.
- Cancelling `processing` refunds via gateway void.
- Remaining audit expansions: product variants, warehouses/lots, shipment
  tracking events, disputes-as-entity, payout bank execution.
