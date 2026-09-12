# VYRO 3-Way PO & Invoice Reconciliation Design

**Status:** Approved Design  
**Date:** 2026-09-12  
**Scope:** Automated 3-way reconciliation engine linking Purchase Orders (PO), Delivery Receipts, and Supplier Invoices. Eliminates manual line-by-line invoice checking by deterministically detecting price variances, quantity shortfalls, and unexpected charges, and synthesizing structured dispute claims before escrow funds are released.

---

## 1. Background & Problem Statement

In B2B wholesale distribution in Sri Lanka, discrepancies between purchase orders and supplier invoices frequently occur due to:
1. **Price Creep**: Suppliers billing higher unit prices than agreed upon during PO placement or RFQ quoting.
2. **Short Deliveries**: Physical stock received at the buyer depot is less than the quantity billed on the vendor invoice.
3. **Unapproved Surcharges**: Extra freight, handling, or unquoted SKU lines added without buyer approval.
4. **Premature Billing**: Suppliers invoicing orders before goods have been physically received and inspected.

Currently, buyers must manually cross-reference paper delivery notes, digital POs in `apps/web/src/pages/OrderDetailPage.tsx`, and invoice PDFs. If buyers confirm receipt without noticing discrepancies, escrow funds are prematurely released to the supplier, resulting in painful disputes and lost capital.

**The Solution:** The **3-Way Reconciliation Copilot** integrates directly into `OrderDetailPage.tsx`. It runs a deterministic line pairing and arithmetic variance calculation across the PO items, delivery records, and OCR invoice lines. If a match is verified, payment release is greenlit with 1 click. If discrepancies are found, the engine highlights line-by-line variances and pre-drafts a formal credit claim for the supplier.

---

## 2. Architecture & Monorepo Layout

```
packages/
  ai/src/
    reconciliation/
      matcher.ts              # Deterministic line pairing, variance math, match classification
      types.ts                # Reconciliation schemas, input/output types
      index.ts                # Package exports

apps/
  api/src/
    modules/
      reconciliation/
        routes.ts             # POST /api/orders/:id/reconciliation & POST /api/orders/:id/reconciliation/claim
        reconciliationService.ts # Orchestrates PO loading, OCR data parsing, matcher execution, LLM synthesis
  web/src/
    components/reconciliation/
      ThreeWayReconciliationCard.tsx # 3-pillar summary, itemized discrepancy table, claim drawer
```

---

## 3. Data Contracts & API Specification

### Endpoint 1: Run 3-Way Match
`POST /api/orders/:id/reconciliation`

**Authentication & Authorization:**
- Session required.
- Buyer role: `owner`, `manager`, `purchasing`, `accountant` for `order.businessId`, or platform admin.

**Request Schema (`ReconciliationRequestSchema`):**
```ts
export const ReconciliationRequestSchema = z.object({
  invoiceUploadId: z.string().optional(),
  invoiceData: z.object({
    invoiceNumber: z.string().optional(),
    totalCents: z.number().int().min(0),
    items: z.array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().optional(),
        unitPriceCents: z.number().int().min(0),
        totalCents: z.number().int().min(0),
      })
    ).min(1),
  }).optional(),
}).strict();
```

**Response Schema (`ThreeWayReconciliationResponseSchema`):**
```ts
export const ThreeWayReconciliationResponseSchema = z.object({
  reconciliation: z.object({
    status: z.enum(['perfect_match', 'discrepancy_detected', 'critical_mismatch']),
    matchConfidence: z.number().min(0).max(1),
    poTotalCents: z.number().int().min(0),
    invoiceTotalCents: z.number().int().min(0),
    netDifferenceCents: z.number().int(), // positive = overcharge, negative = undercharge
    isDeliveryConfirmed: z.boolean(),
    summary: z.string().max(1000),
    recommendedAction: z.enum(['approve_payment', 'request_amendment', 'file_claim']),
    draftClaimNote: z.string().max(2000).optional(),
    lines: z.array(
      z.object({
        poItemId: z.string().optional(),
        description: z.string(),
        poQuantity: z.number().optional(),
        billedQuantity: z.number().optional(),
        poUnitPriceCents: z.number().int().optional(),
        billedUnitPriceCents: z.number().int().optional(),
        poTotalCents: z.number().int().optional(),
        billedTotalCents: z.number().int().optional(),
        status: z.enum([
          'matched',
          'price_variance',
          'quantity_variance',
          'unexpected_item',
          'missing_item',
        ]),
        varianceCents: z.number().int(),
        discrepancyReason: z.string().optional(),
      })
    ),
  }),
});
```

### Endpoint 2: Submit Discrepancy Claim
`POST /api/orders/:id/reconciliation/claim`

**Request Schema:**
```ts
export const ReconciliationClaimRequestSchema = z.object({
  claimMessage: z.string().min(5).max(2000),
  discrepancyCents: z.number().int(),
  affectedLineItems: z.array(z.string()).min(1),
}).strict();
```

**Response:**
`{ ok: true, exceptionId: string }`

---

## 4. Deterministic 3-Way Matching Engine

### 4.1. Line Pairing Algorithm
1. Normalize line strings by stripping punctuation, bracketed pack text, and case folding.
2. For each invoice line, evaluate against unmapped PO items using token Jaccard similarity:
   $$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
3. Pairs with $J(A, B) \ge 0.4$ are mapped. The remaining unmapped invoice items are classified as `unexpected_item`. Unmapped PO items are classified as `missing_item`.

### 4.2. Variance Classification Logic
For each paired line item:
- **Price Variance**: If $\text{billedUnitPrice} > \text{poUnitPrice}$:
  - `status = 'price_variance'`
  - `varianceCents = (billedUnitPrice - poUnitPrice) * billedQuantity`
  - `discrepancyReason = "Billed unit price of Rs. X exceeds authorized PO rate of Rs. Y"`
- **Quantity Variance**: If $\text{billedQuantity} > \text{poQuantity}$:
  - `status = 'quantity_variance'`
  - `varianceCents = (billedQuantity - poQuantity) * poUnitPrice`
  - `discrepancyReason = "Billed for X units, but PO authorized Y units"`
- **Matched**: If unit prices and quantities match within 0 tolerance:
  - `status = 'matched'`, `varianceCents = 0`

### 4.3. Delivery Confirmation Check
Checks `deliveries.status` and `deliveries.deliveredAt`. If the order is still `pending`, `assigned`, or `in_transit`, flags `isDeliveryConfirmed: false` with warning: *"Goods have not been marked delivered at dock."*

### 4.4. Overall Status & Recommendation
- **`perfect_match`**: All lines `matched`, `netDifferenceCents == 0`, delivery verified $\rightarrow$ `recommendedAction: 'approve_payment'`.
- **`discrepancy_detected`**: Total variance $\le 15\%$ of PO value $\rightarrow$ `recommendedAction: 'request_amendment'`.
- **`critical_mismatch`**: Total variance $> 15\%$ or unconfirmed delivery $\rightarrow$ `recommendedAction: 'file_claim'`.

---

## 5. LLM Synthesis & Deterministic Fallback

### 5.1. LLM Claim & Summary Generator
Passes the structured variance report to `AIProvider` (`narrate_complex`):
- **System Prompt**: Professional Sri Lankan B2B procurement auditor.
- **Output**:
  - `summary`: High-level 2-sentence summary of findings.
  - `draftClaimNote`: Polite but firm formal dispute letter itemizing exact discrepancies, quoting the PO number and requested credit adjustment in Rupees.

### 5.2. Deterministic Fallback Template
If the AI provider times out (>8s) or is unavailable:
```ts
summary = `Found ${discrepancies.length} discrepancy(ies) totaling Rs. ${(netDifferenceCents / 100).toLocaleString()} variance on PO ${poNumber}.`
draftClaimNote = `Regarding PO ${poNumber}: We have identified a discrepancy of Rs. ${(netDifferenceCents / 100).toLocaleString()} between our purchase order and invoice ${invoiceNumber}. Please issue an amended invoice or credit note.`
```
Guarantees 100% uptime and immediate response.

---

## 6. Order Detail UI Experience

### 6.1. Component Layout (`ThreeWayReconciliationCard.tsx`)
Mounted on `apps/web/src/pages/OrderDetailPage.tsx`:
1. **3-Pillar Summary Cards**:
   - 📋 **Purchase Order**: Authorized Total (Rs. X) & Item Count.
   - 🚚 **Delivery Verification**: Delivered Date or Transit Status.
   - 🧾 **Vendor Invoice**: Billed Total (Rs. Y) & Variance Indicator.
2. **Itemized Audit Table**:
   - Columns: Product / Description, PO Qty & Rate, Billed Qty & Rate, Variance (Rs.), Status.
   - Pill badges: 🟢 *Matched*, 🔴 *Price Variance*, 🟠 *Short Delivery*, 🟣 *Unexpected Surcharge*.
3. **Interactive Resolution Drawer**:
   - If `perfect_match`: Green button to `Approve & Release Payment`.
   - If `discrepancy_detected`: Amber/Red button to `File Claim / Request Adjustment` opening an editable pre-filled AI dispute letter.

---

## 7. Security, Rate Limits & Dispute Recording

1. **RBAC**: Strictly limited to buyer members with financial authority (`owner`, `manager`, `purchasing`, `accountant`) or system admins.
2. **Tenant Isolation**: Orders and invoices must belong to the caller's active business organization.
3. **Dispute Recording**:
   - Submitting a claim creates a persistent exception row in `reconciliation_exceptions` (`kind: 'amount_mismatch'`).
   - Notifies the supplier organization with a direct link to the order dispute.
4. **Audit Logging**:
   - Logs `action = 'ai.reconciliation.match'` with `metadata: { orderId, poTotalCents, invoiceTotalCents, differenceCents, status, latencyMs }`.

---

## 8. Verification & Testing Plan

1. **Unit Tests (`packages/ai/src/reconciliation/matcher.test.ts`)**:
   - Exact line matching with identical items.
   - Fuzzy pairing for abbreviated supplier names.
   - Unit price overcharge detection.
   - Short delivery quantity variance detection.
   - Unexpected extra fee lines.
   - Omitted PO lines.
   - Deterministic claim letter generator.
2. **API Route Tests (`apps/api/test/ai/reconciliationRoute.test.ts`)**:
   - Reject unauthenticated and non-business requests (401, 403).
   - Reject cross-tenant access.
   - Full 3-way match response verification with mock DB.
   - Dispute claim creation and exception logging.
3. **Frontend Integration & Monorepo Typecheck**:
   - Mounts cleanly into `OrderDetailPage.tsx`.
   - `pnpm --filter @vyro/web typecheck` passes with 0 errors.
   - `pnpm typecheck` and `pnpm test` pass across the entire workspace.
