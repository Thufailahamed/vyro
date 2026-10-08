# Doc-Invoice Auto-Reconcile (Doc Intelligence v2 / Phase A) — Design

Date: 2026-10-08
Status: Approved (pending spec review)
Workstream: AI document intelligence v2, phase A (auto-reconcile loop)

## Goal

Buyers already upload supplier invoices (`/api/documents/upload-direct`) and
the AI price-list matcher already reconciles invoices against purchase orders
(`runThreeWayReconciliation`, `POST /purchase-orders/:id/reconciliation`), but
the two are disconnected: uploads carry no PO reference and reconciliation
only runs by manual button press. Phase A connects them — upload from the
order page, automatic reconciliation after OCR, and an auto-raised exception
on discrepancy.

## Non-goals (deferred to phase B)

- AI-assisted line matching for messy OCR text (token-Jaccard threshold is 0.35 today; upgrade separately).
- Categorization rule engine (learned rules from admin corrections).
- Upload-from-anywhere AI PO guessing (matching an unordered invoice to its PO by text).
- Auto-sending the claim note to the supplier.

## User flow

1. Buyer opens a delivered/completed purchase order in the web portal and
   uses the new "Upload supplier invoice" action (marked inside the existing
   ThreeWayReconciliationCard surface).
2. `POST /api/documents/upload-direct` accepts an optional
   `purchaseOrderId` field; the upload row stores the reference.
3. The existing invoices queue consumer (`apps/api/src/queue/invoiceOcr.ts`)
   finishes OCR and writes line items as today. When it ends with a
   parseable upload (`ready`/line items present) and `purchaseOrderId` is
   set, it immediately runs `runThreeWayReconciliation` with
   `{ invoiceUploadId }` and persists the outcome on the upload row.
4. Outcomes:
   - `passed` → nothing pushed; the order page card shows the result.
   - `discrepancy` → buyer notification (owner/manager/purchasing via the
     existing notifications dispatcher, source 'reconciliation') and a
     `reconciliation_exceptions` row (`kind: 'amount_mismatch'`,
     `entityType: 'purchase_order'`, `entityId: poId`, severity
     `warning`, expected/actual/difference from the result) for the finance
     queue.
   - `failed` (PO not delivered yet, no items, validation error) → no
     notification, no exception; the failure text is visible on the card.

## Architecture

```
documents/upload-direct (+ purchaseOrderId)
  → invoice uploads consumer (invoiceOcr.ts)
      → OCR succeeds → line items stored (unchanged)
      → reconcileIfLinked(env, upload):
           po delivered/completed?
             → runThreeWayReconciliation(env, purchaseOrderId, { invoiceUploadId })
             → store reconciliationStatus + reconciliationJson
             → discrepancy → notify + exception
OrderDetailPage
  → ThreeWayReconciliationCard renders the persisted payload from the
    latest upload for the PO (unless a manual run is already shown).
```

The matcher itself is untouched — phase A is pure wiring around it.

## Data model (migration 0055)

`invoice_uploads` columns:

- `purchase_order_id TEXT REFERENCES purchase_orders(id)` — nullable.
- `reconciliation_status TEXT` (`none | passed | discrepancy | failed`), default `none`.
- `reconciliation_json TEXT` — full `ThreeWayReconciliationResult` payload for
  card rendering without re-running the matcher.

Both backfill-free (existing rows keep defaults).

## Error handling

- OCR failure → upload status `failed`; reconcile step skipped (existing path).
- Missing line items / PO in wrong status → `reconciliationStatus: 'failed'`
  with the human-readable failure message in the persisted JSON.
- Reconciliation throw (e.g. PO deleted mid-flight) → catch, persist
  `failed` + message; never breaks the OCR ack path (status row is the retry surface).

## Notifications + exceptions

- Buyer notification uses the existing notifications dispatcher pattern with
  source labelled 'reconciliation'; recipients: business members with roles
  owner/manager/purchasing (the same set allowed on upload-direct).
- Exceptions row reuses the existing `reconciliation_exceptions` writer
  conventions (finance queue reads by status open).

## Testing

- Consumer integration test: seed PO + delivered delivery + upload with line
  items → after `processUpload`, upload has `reconciliationStatus: 'discrepancy'`
  (price bumped fixture), notifications recorded (mocked dispatcher), and an
  open exception exists for the PO.
- `upload-direct` contract test: stores `purchaseOrderId` when provided and
  member-gates as today.
- Pure helper tests for `reconcileIfLinked` status machine (not linked →
  skip; wrong PO status → failed; matcher throws → failed).
- Web: card renders the persisted payload (static markup test).

## Constraints

- No new dependencies.
- Web API calls via `api` wrapper; paths never start with `/api`.
- Commit per task with explicit paths; the user has authorized per-task commits.
- AI cost stays near-zero (this phase calls no new models; the matcher's
  existing narration path runs only on manual runs).
