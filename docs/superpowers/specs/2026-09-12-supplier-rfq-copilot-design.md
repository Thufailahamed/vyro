# VYRO Supplier AI RFQ Quoting Copilot Design

**Status:** Approved Design  
**Date:** 2026-09-12  
**Scope:** AI-powered RFQ quoting assistant for wholesale suppliers on Vyro. Bridges the gap between buyer RFQ requests and supplier rate cards by automatically calculating competitive, margin-protected quote line prices, proposing stock substitutions, generating bulk volume tiers, and synthesizing professional quotation cover notes.

---

## 1. Background & Value Proposition

Vyro currently provides buyer-facing AI features (`/ask` procurement assistant, price anomaly detection, cart hints, budget optimization). However, suppliers still manage incoming Requests for Quotes (RFQs) entirely by hand in `apps/web/src/supplier/SupplierQuoteDetailPage.tsx`.

When an enterprise buyer (hotel chain, supermarket, bakery, catering kitchen) publishes an RFQ with 5–20 line items, suppliers must:
1. Cross-reference their catalog prices and stock availability.
2. Calculate wholesale volume discounts based on order size.
3. Determine whether out-of-stock items can be substituted with matching catalog inventory.
4. Calculate delivery costs, validity deadlines, and payment terms.
5. Draft quotation notes and counter-proposal justifications.

This manual process causes slow response times, missed bids, pricing math errors, and lost sales when primary stock is low.

**The Solution:** The **Supplier RFQ Quoting Copilot** provides a 1-click draft generation engine. It executes a deterministic, margin-guarded pricing solver across the supplier's active catalog and stock, suggests substitutions for unavailable lines, and leverages LLM reasoning to write a tailored B2B cover note. The supplier reviews, adjusts, and submits with full control (human-in-the-loop).

---

## 2. Architecture & Monorepo Layout

```
packages/
  ai/src/
    supplier/
      rfqSolver.ts            # Deterministic pricing engine, margin floor, tier calculations
      substitution.ts         # Token + category heuristic matcher for out-of-stock items
      types.ts                # Strategy, SolverInput, SolverOutput schemas
      index.ts                # Package exports
    schemas.ts                # Zod schemas for request/response contracts

apps/
  api/src/
    modules/
      rfqs/
        routes.ts             # POST /rfqs/:rfqId/ai-quote-draft
        aiQuotingService.ts   # Orchestrates catalog loading, solver execution, LLM prompt & fallback
      ai/
        provider/             # Existing Workers AI & Gemini provider abstraction
  web/src/
    supplier/
      SupplierQuoteDetailPage.tsx # Integrated quote view
      components/
        AiQuoteCopilotCard.tsx    # Strategy selector, draft trigger, preview summary, 1-click fill
```

---

## 3. Data Contracts & API Specification

### Endpoint
`POST /api/rfqs/:rfqId/ai-quote-draft?supplierId={supplierId}`

### Authentication & Authorization
- Session required (`session()` middleware).
- Must have active role `owner`, `manager`, or `sales` in the target supplier organization (`requireSupplierRole`).
- RFQ must exist and have status `published` or `open`.

### Request Schema (`AiQuoteDraftRequest`)
```ts
export const AiQuoteDraftRequestSchema = z.object({
  strategy: z.enum(['win_deal', 'balanced', 'premium_margin']).default('balanced'),
  includeAlternatives: z.boolean().default(true),
  targetMarginDeltaPct: z.number().min(-15).max(30).optional(),
}).strict();
```

### Response Schema (`AiQuoteDraftResponse`)
```ts
export const AiQuoteDraftResponseSchema = z.object({
  draft: z.object({
    deliveryFeeCents: z.number().int().min(0),
    validDays: z.number().int().min(1).max(90),
    paymentTerms: z.string().min(1).max(100),
    notes: z.string().max(2000),
    summaryExplanation: z.string().max(1000),
    strategyUsed: z.enum(['win_deal', 'balanced', 'premium_margin']),
    items: z.array(
      z.object({
        rfqItemId: z.string(),
        productId: z.string().optional(),
        supplierProductId: z.string().optional(),
        description: z.string(),
        quantity: z.number().int().positive(),
        unit: z.string(),
        unitPriceCents: z.number().int().min(0),
        discountCents: z.number().int().min(0),
        subtotalCents: z.number().int().min(0),
        isAlternative: z.boolean(),
        alternativeForRfqItemId: z.string().optional(),
        notes: z.string().optional(),
        rationale: z.string(),
        stockStatus: z.enum(['in_stock', 'low', 'substitute', 'unmatched']),
        tier: z.object({
          minQty: z.number().int().positive(),
          unitPriceCents: z.number().int().positive(),
        }).optional(),
      })
    ),
  }),
});
```

---

## 4. Deterministic Pricing Solver Engine

The pricing solver never relies on LLM arithmetic, preventing hallucinated prices or sub-cost quotes.

### 4.1. Catalog Matching & Substitution
1. **Direct Match**: If `rfq_item.productId` matches an active `supplier_products.productId` for this supplier:
   - Check `supplier_products.availabilityStatus`.
   - If `'in_stock'` or `'low'`, use this item.
2. **Fuzzy Match**: If unlinked, normalize item description and compute token Jaccard similarity against the supplier's active catalog. Matches with similarity score $\ge 0.5$ are mapped.
3. **Auto-Substitution**:
   - If an item is `'out_of_stock'` or unstocked, and `includeAlternatives: true`:
   - Search the supplier's active catalog in the same category or matching query (e.g. *Keeri Samba 50kg* when *Nadu Rice 50kg* is unavailable).
   - Flag `isAlternative: true`, set `alternativeForRfqItemId: rfq_item.id`, and mark `stockStatus: 'substitute'`.
   - If no reasonable substitute is found, mark `stockStatus: 'unmatched'` and leave `unitPriceCents: 0` so the supplier can manually price.

### 4.2. Strategy Pricing Rules
Given supplier catalog base price $P_{base}$ and buyer target price $P_{target}$ (if specified):

- **Margin Floor Guardrail**:  
  Under NO circumstances can the quoted price drop below $P_{floor} = \text{round}(P_{base} \times 0.88)$ (12% maximum permissible discount from standard catalog rate).

- **Strategy 1: `win_deal` (Aggressive / Win Account)**:
  - If $P_{target}$ is provided and $P_{target} \ge P_{floor}$:  
    $P_{quote} = \max(P_{floor}, \text{round}(P_{target} \times 0.98))$ (undercut target by 2% to win bid).
  - If $P_{target}$ is missing:  
    $P_{quote} = \max(P_{floor}, \text{round}(P_{base} \times 0.94))$ (6% competitive discount).
  - Discount is explicitly shown: `unitPriceCents = P_base`, `discountCents = P_base - P_quote`.

- **Strategy 2: `balanced` (Standard Wholesale; Default)**:
  - Base catalog rate: $P_{quote} = P_{base}$.
  - Volume tier trigger: If order volume is large ($\ge 500\text{kg}$ or total item value $\ge \text{Rs. } 100,000$), apply a 3% volume discount.
  - Generates an additional bulk discount tier for $2 \times$ order quantity with an extra 4% discount.

- **Strategy 3: `premium_margin` (Quality & Dispatch Priority)**:
  - $P_{quote} = \text{round}(P_{base} \times 1.04)$ (4% premium for expedited dispatch, batch testing certificates, or premium packaging).
  - Zero discount applied.

### 4.3. Logistics & Terms Defaults
- **Delivery Fee**: If supplier has `deliveryAvailable: true`, quote supplier standard delivery rate or Rs. 2,500 base. If buyer is in the same district, apply local freight reduction (Rs. 1,500).
- **Payment Terms**:
  - `win_deal`: Match buyer's requested payment terms (e.g. "Net 15 upon delivery").
  - `balanced`: "Net 7 days from invoice".
  - `premium_margin`: "Bank transfer before dispatch" or "Cash on Delivery (COD)".
- **Validity**: 14 days default (7 days for perishable categories).

---

## 5. LLM Synthesis & Deterministic Fallback

### 5.1. LLM Narrative Generation
Once the solver completes the calculations, a structured payload is dispatched to `AIProvider` (Workers AI small model with Gemini fallback):
- **System Prompt**: Professional B2B wholesale trade agent in Sri Lanka.
- **Inputs**:
  - Buyer organization name & district
  - Delivery requirements and deadlines
  - Quoted items, pricing, discounts, and substitutions
  - Selected strategy preset
- **Outputs** (JSON format):
  - `notes`: Polite, professional quotation message explaining fulfillment lead time, quality assurance, and any suggested substitutions.
  - `summaryExplanation`: Concise internal briefing for the supplier explaining the strategy applied.

### 5.2. Deterministic Fallback Template
If the LLM provider times out (>8s) or is unavailable:
```ts
notes = `Thank you for your RFQ request. We are pleased to quote our wholesale rates under ${strategyLabel} terms. Delivery can be fulfilled to ${deliveryDistrict} within required timelines. Please find our itemized pricing attached.`
summaryExplanation = `Generated draft using ${strategyLabel} strategy across ${itemCount} items based on active catalog rates.`
```
The quote generation succeeds 100% of the time, guaranteeing zero broken workflows.

---

## 6. Supplier Portal User Experience

### 6.1. Component Layout (`AiQuoteCopilotCard.tsx`)
Mounted directly above the quote lines form in `apps/web/src/supplier/SupplierQuoteDetailPage.tsx`:

1. **Copilot Banner**:
   - Header: ✨ **AI Quoting Copilot**
   - Subtitle: *Automatically price items from your catalog, apply volume tiers, and suggest in-stock substitutes.*
2. **Interactive Controls**:
   - Strategy Pills:
     - `🎯 Win Deal`
     - `⚖️ Balanced (Recommended)`
     - `💎 Premium Margin`
   - Include Substitutes checkbox (checked by default)
   - Button: **Draft AI Quote** (displays spinner during fetch)
3. **Draft Result Preview Card**:
   - Displays `summaryExplanation`.
   - Line items breakdown with status badges:
     - 🟢 *Catalog Match (Rs. X)*
     - 🟡 *Substitute Offered (Out of stock → Suggested Y)*
     - 🔵 *Volume Discount (-X%)*
     - ⚪ *Unmatched (Enter manually)*
   - Action Bar:
     - **Apply to Quote Form** (primary button)
     - **Dismiss** (secondary button)

### 6.2. 1-Click Form Population & Safety
Clicking **Apply to Quote Form**:
- Populates the parent form state:
  - `lines`: Updates `unitPrice`, `discount`, `isAlternative`, `alternativeFor`, `notes`, `tierQty`, `tierPrice`.
  - `deliveryFee`: Pre-fills calculated delivery fee in Rupees.
  - `paymentTerms`: Pre-fills suggested terms.
  - `validDays`: Sets validity days.
  - `notes`: Sets generated cover letter.
- Displays toast: *"AI quote applied! Review and adjust any values before submitting."*
- Supplier retains complete freedom to modify any line or field before clicking existing "Submit Quote" button.

---

## 7. Security, Rate Limits & Audit Logging

1. **Security**:
   - Tenant isolation: Suppliers can only price against their own catalog and assigned RFQs.
   - Competitor confidentiality: Quoting assistant never exposes other suppliers' private quote data.
2. **Rate Limiting**:
   - 20 AI quote generations per minute per supplier org via KV rate limiter.
3. **Audit Logging**:
   - Every execution logs an audit event:
     - `action`: `'ai.supplier.quote_draft'`
     - `metadata`: `{ rfqId, supplierId, strategy, itemCount, substituteCount, provider, latencyMs, tokensIn, tokensOut }`
   - Integrated into the existing Admin AI Usage dashboard (`/admin/ai/usage`).

---

## 8. Testing & Verification Plan

1. **Unit Tests (`packages/ai/src/supplier/rfqSolver.test.ts`)**:
   - `win_deal` discounts against buyer target price without breaking floor.
   - `balanced` applies correct volume tier discounts.
   - `premium_margin` applies quality markup.
   - Margin floor clamp: when target price is below floor, floor is enforced.
   - Auto-substitution matches in-stock category alternatives for out-of-stock items.
   - Bulk volume tier creation for quantities $\ge 2\times$.
   - Deterministic fallback output when LLM is offline.
2. **API Route Tests (`apps/api/src/modules/rfqs/aiQuoteDraft.test.ts`)**:
   - Unauthenticated request rejected (401).
   - User without supplier role rejected (403).
   - Valid RFQ returns 200 with valid `AiQuoteDraftResponseSchema`.
   - Rate limit enforcement.
3. **Frontend Tests / Typecheck**:
   - Typecheck passes cleanly across monorepo (`pnpm typecheck`).
   - `AiQuoteCopilotCard` renders strategy buttons and populates quote form on apply.

---

## 9. Non-Goals (YAGNI)

- **No Autonomous Auto-Submission**: The AI will NEVER submit a quote on behalf of a supplier without manual review and click.
- **No Complex Dynamic Margin Optimization Algorithms**: Keep solver rules transparent, predictable, and verifiable.
- **No Multi-Round Automated Bot Bidding Wars**: Only single-bid drafting; negotiation copilot remains a separate follow-up phase.
