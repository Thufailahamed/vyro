# Invoice Product Alias Learning — Design

Date: 2026-10-08  
Status: Approved (pending spec review)  
Workstream: Doc intelligence v2, phase C

## Goal

Make repeat invoice reconciliation more accurate and cheaper by remembering
buyer-confirmed OCR descriptions for catalog products. Example: a buyer maps
`WHT SGR 1KG` to `White Sugar 1kg` once; the next invoice from that supplier
can resolve the same description exactly, before Jaccard matching or Workers
AI is considered.

## Non-goals

- Learning from an unconfirmed AI suggestion or from a description edit alone.
- Cross-buyer/global aliases shared between businesses.
- Fuzzy or embedding-based alias lookup.
- Training or fine-tuning a model.
- Product selection from the entire catalog in this phase; choices are limited
  to the linked PO's items.

## User flow

1. Buyer opens a PO-linked invoice in the existing invoice review page.
2. Each invoice line has a `PO product` selector populated only from that PO's
   catalog products. No selection is pre-confirmed by the AI line suggestion;
   the buyer explicitly selects a product.
3. On Save, the existing review path stores `invoiceLineItems.productId` as it
   already supports. For each line with a selected product, the server upserts
   a supplier-specific alias for the line's invoice description.
4. The alias is private to `(businessId, supplierId)`. For the same normalized
   alias, the buyer's latest explicit product selection replaces the previous
   product mapping and emits an audit event with old/new product IDs and the
   source upload ID (not the raw invoice text).
5. On future reconciliation for that business/supplier, exact alias matches
   are checked first. An alias is usable only when its catalog product exists
   on the current PO; otherwise it is ignored and matching falls through.

## Architecture and match order

```
InvoiceReviewPage
  GET /api/documents/:id
    → upload + line items + PO match candidates when purchaseOrderId exists
  POST /api/documents/:id/review
    → validate productId ∈ linked PO candidates
    → persist reviewed line productId
    → upsert exact alias in invoice_product_aliases
    → audit alias creation/replacement (no raw invoice description)

runThreeWayReconciliation (persisted invoiceUploadId only)
  1. Load buyer-business + supplier scoped aliases
  2. Exact normalized alias → catalog productId → exactly one unused PO item
  3. Existing deterministic token-Jaccard matcher for remaining lines
  4. Phase B confidence-gated Workers AI for remaining ambiguous lines
```

Alias matches are one-to-one and carry `matchSource: 'alias'`,
`matchConfidence: 1`, and a short explanation such as `Previously confirmed
for this supplier`. Alias records do not match a product absent from the
current PO. If more than one unused PO item has the alias's productId, do not
choose by the alias alone; leave it to deterministic matching / Phase B.

The pure matcher receives validated alias overrides, reserves them before
Jaccard matching, then Phase B receives only still-unmatched lines and PO
items. This keeps reservation/discrepancy calculations centralized and
preserves the existing one-to-one invariant.

## Data model

Add `invoice_product_aliases`:

- `id TEXT PRIMARY KEY`
- `business_id TEXT NOT NULL REFERENCES businesses(id)`
- `supplier_id TEXT NOT NULL REFERENCES suppliers(id)`
- `normalized_alias TEXT NOT NULL`
- `product_id TEXT NOT NULL REFERENCES products(id)`
- `source_upload_id TEXT NOT NULL REFERENCES invoice_uploads(id)`
- `created_by_user_id TEXT NOT NULL REFERENCES users(id)`
- `created_at INTEGER NOT NULL`
- `updated_at INTEGER NOT NULL`
- unique index `(business_id, supplier_id, normalized_alias)`

Use an upsert on that unique key: update `product_id`, `source_upload_id`,
`created_by_user_id`, and `updated_at` to the latest buyer-confirmed choice.
The audit event records prior/new product IDs and source upload ID when a
mapping is created or changed, so a replacement is explainable without
creating noise on an unchanged repeat save.

## Normalization

`normalizeInvoiceAlias(description)` is a pure helper:

1. Unicode normalize with `NFKC`.
2. Lowercase and trim.
3. Replace punctuation/symbol runs with a single space.
4. Collapse whitespace and trim again.
5. Preserve digits and unit/pack-size tokens (`1kg`, `5 kg`, `400g` remain
   semantically present; no stemming or stop-word removal).
6. Skip empty normalized strings and strings longer than 200 characters.

Lookup is exact on the normalized value; no partial/fuzzy alias matching.

## PO product candidates and validation

For a PO-linked upload, `GET /api/documents/:id` includes the PO's existing
line candidates with `productId`, `productNameSnapshot`, and current unit.
`InvoiceReviewPage` renders a per-line selector with an empty `Unmapped`
option and one option per distinct catalog product present in the PO.

On `POST /api/documents/:id/review`, any non-null `productId` must be a product
candidate attached to that upload's PO. An arbitrary catalog ID or a product
from another PO is rejected with `400 VALIDATION_ERROR`; a non-PO-linked
invoice cannot train aliases in this phase. The server derives `supplierId`
from the purchase order when the invoice upload's optional supplierId is null.

## Error handling and audit

- Review line save remains the primary operation. Alias upsert runs after the
  reviewed rows are saved; failures are logged and do not roll back the user's
  corrected invoice lines.
- Alias lookup errors fall back to deterministic Jaccard + Phase B; they do
  not fail reconciliation.
- A stale alias whose product is not on the current PO is ignored.
- Audit action `invoice_product_alias.upsert` records `businessId`,
  `supplierId`, `sourceUploadId`, `previousProductId`, `productId`, and
  `actorUserId`; raw invoice descriptions are excluded from audit metadata.

## Cost and measurement

- Alias lookup is exact indexed D1 access and invokes no model.
- An alias match is resolved before Jaccard and Phase B, reducing the number
  of lines sent to Workers AI.
- Add non-sensitive reconciliation audit counts: alias matches applied,
  deterministic matches applied, AI call attempted, AI matches applied, and
  suggestions left for review. Do not log alias text or prompts.

## Testing

- Pure normalization tests: case/whitespace/punctuation normalization,
  numeric pack-size preservation, Unicode normalization, empty/overlength skip.
- Repository tests: create alias, update same business/supplier/alias to a
  different product, isolate aliases across businesses and suppliers.
- Review route tests: PO product accepted; product outside PO rejected; no
  alias written when `productId` is null; confirmed selection upserts alias
  and audit event.
- Reconciliation tests: exact alias matches before Jaccard/AI; alias for a
  product absent from this PO is ignored; duplicate PO product lines do not
  alias-match ambiguously; alias hit causes zero AI calls for that line.
- Web static-markup tests: PO product selector is present for linked invoice;
  no PO candidate selector appears for unlinked invoice.
- No live model calls in tests.

## Constraints

- No new dependencies.
- Keep aliases scoped by both buyer business and supplier.
- Only buyer-confirmed product selections train or update aliases.
- Alias lookup is exact after normalization; fuzzy matching remains in the
  existing deterministic matcher and Phase B AI resolver.
