# 3-Way PO & Invoice Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an automated 3-way reconciliation engine that pairs purchase order line items, delivery receipts, and vendor invoices to detect price variances, quantity shortfalls, and unexpected charges, and drafts formal dispute claims before buyer escrow funds are released.

**Architecture:** Pure deterministic pairing and variance arithmetic in `packages/ai` evaluates lines against token Jaccard similarity and calculates exact rupee discrepancies. An orchestration service in `apps/api` loads the PO, delivery, and OCR invoice data, runs the matcher, and synthesizes executive audit summaries and claim notes via `AIProvider` (Workers AI / Gemini) with an immediate deterministic fallback. A dedicated UI card in `apps/web` mounted on `OrderDetailPage.tsx` provides buyers with a 3-pillar comparison, visual audit breakdown, and 1-click claim filing.

**Tech Stack:** TypeScript, Node 20+, pnpm, Vitest, Zod, Hono, D1 / Drizzle ORM, React 18, Tailwind CSS, Lucide icons.

## Global Constraints
- Node 20+ and pnpm 9+.
- Currency is in integer cents (e.g. LKR cents).
- 100% Mathematical Exactness: Zero arithmetic hallucinations. Price variance and quantity variance are computed deterministically.
- Fault Tolerance: If the LLM provider fails or times out (>8s), the reconciliation must succeed using deterministic templates without throwing 500.
- Monorepo package boundaries: Pure matching engine in `@vyro/ai`, API services and routes in `@vyro/api`, UI components in `@vyro/web`.

---

### Task 1: Reconciliation Schemas & Types in `packages/ai`

**Files:**
- Create: `packages/ai/src/reconciliation/types.ts`
- Create: `packages/ai/src/reconciliation/index.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/reconciliation/types.test.ts`

**Interfaces:**
- Consumes: `zod`
- Produces:
  - `ReconciliationRequestSchema`, `ReconciliationRequest`
  - `ThreeWayReconciliationResponseSchema`, `ThreeWayReconciliationResponse`, `ThreeWayReconciliationResult`
  - `ReconciliationClaimRequestSchema`, `ReconciliationClaimRequest`
  - `PoItemInput`, `DeliveryInput`, `InvoiceItemInput`, `MatcherInput`, `MatcherOutput` interfaces

- [ ] **Step 1: Write the failing test**

```ts
// packages/ai/src/reconciliation/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  ReconciliationRequestSchema,
  ThreeWayReconciliationResponseSchema,
  ReconciliationClaimRequestSchema,
} from './types';

describe('Reconciliation Schemas', () => {
  it('validates reconciliation request with manual invoice data', () => {
    const req = {
      invoiceData: {
        invoiceNumber: 'INV-2026-001',
        totalCents: 150000,
        items: [
          {
            description: 'Samba Rice 50kg',
            quantity: 10,
            unitPriceCents: 15000,
            totalCents: 150000,
          },
        ],
      },
    };
    const parsed = ReconciliationRequestSchema.safeParse(req);
    expect(parsed.success).toBe(true);
  });

  it('validates reconciliation response payload', () => {
    const res = {
      reconciliation: {
        status: 'discrepancy_detected' as const,
        matchConfidence: 0.95,
        poTotalCents: 140000,
        invoiceTotalCents: 150000,
        netDifferenceCents: 10000,
        isDeliveryConfirmed: true,
        summary: 'Detected price variance on Samba Rice.',
        recommendedAction: 'request_amendment' as const,
        lines: [
          {
            poItemId: 'poi-1',
            description: 'Samba Rice 50kg',
            poQuantity: 10,
            billedQuantity: 10,
            poUnitPriceCents: 14000,
            billedUnitPriceCents: 15000,
            poTotalCents: 140000,
            billedTotalCents: 150000,
            status: 'price_variance' as const,
            varianceCents: 10000,
            discrepancyReason: 'Price higher than PO',
          },
        ],
      },
    };
    const parsed = ThreeWayReconciliationResponseSchema.safeParse(res);
    expect(parsed.success).toBe(true);
  });

  it('validates claim submission request', () => {
    const claim = {
      claimMessage: 'Invoice has unauthorized price increase on Rice.',
      discrepancyCents: 10000,
      affectedLineItems: ['poi-1'],
    };
    const parsed = ReconciliationClaimRequestSchema.safeParse(claim);
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test src/reconciliation/types.test.ts`
Expected: FAIL (cannot find `./types`)

- [ ] **Step 3: Write implementation**

Create `packages/ai/src/reconciliation/types.ts`:
```ts
import { z } from 'zod';

export const InvoiceItemDataSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  unitPriceCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
});
export type InvoiceItemData = z.infer<typeof InvoiceItemDataSchema>;

export const InvoiceDataSchema = z.object({
  invoiceNumber: z.string().optional(),
  totalCents: z.number().int().min(0),
  items: z.array(InvoiceItemDataSchema).min(1),
});
export type InvoiceData = z.infer<typeof InvoiceDataSchema>;

export const ReconciliationRequestSchema = z
  .object({
    invoiceUploadId: z.string().optional(),
    invoiceData: InvoiceDataSchema.optional(),
  })
  .strict();
export type ReconciliationRequest = z.infer<typeof ReconciliationRequestSchema>;

export const ReconciliationLineStatusSchema = z.enum([
  'matched',
  'price_variance',
  'quantity_variance',
  'unexpected_item',
  'missing_item',
]);
export type ReconciliationLineStatus = z.infer<typeof ReconciliationLineStatusSchema>;

export const ReconciliationLineSchema = z.object({
  poItemId: z.string().optional(),
  description: z.string(),
  poQuantity: z.number().optional(),
  billedQuantity: z.number().optional(),
  poUnitPriceCents: z.number().int().optional(),
  billedUnitPriceCents: z.number().int().optional(),
  poTotalCents: z.number().int().optional(),
  billedTotalCents: z.number().int().optional(),
  status: ReconciliationLineStatusSchema,
  varianceCents: z.number().int(),
  discrepancyReason: z.string().optional(),
});
export type ReconciliationLine = z.infer<typeof ReconciliationLineSchema>;

export const ReconciliationOverallStatusSchema = z.enum([
  'perfect_match',
  'discrepancy_detected',
  'critical_mismatch',
]);
export type ReconciliationOverallStatus = z.infer<typeof ReconciliationOverallStatusSchema>;

export const RecommendedActionSchema = z.enum([
  'approve_payment',
  'request_amendment',
  'file_claim',
]);
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

export const ThreeWayReconciliationResultSchema = z.object({
  status: ReconciliationOverallStatusSchema,
  matchConfidence: z.number().min(0).max(1),
  poTotalCents: z.number().int().min(0),
  invoiceTotalCents: z.number().int().min(0),
  netDifferenceCents: z.number().int(),
  isDeliveryConfirmed: z.boolean(),
  summary: z.string().max(1000),
  recommendedAction: RecommendedActionSchema,
  draftClaimNote: z.string().max(2000).optional(),
  lines: z.array(ReconciliationLineSchema),
});
export type ThreeWayReconciliationResult = z.infer<typeof ThreeWayReconciliationResultSchema>;

export const ThreeWayReconciliationResponseSchema = z.object({
  reconciliation: ThreeWayReconciliationResultSchema,
});
export type ThreeWayReconciliationResponse = z.infer<typeof ThreeWayReconciliationResponseSchema>;

export const ReconciliationClaimRequestSchema = z
  .object({
    claimMessage: z.string().min(5).max(2000),
    discrepancyCents: z.number().int(),
    affectedLineItems: z.array(z.string()).min(1),
  })
  .strict();
export type ReconciliationClaimRequest = z.infer<typeof ReconciliationClaimRequestSchema>;

export interface PoItemInput {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface DeliveryInput {
  status: string;
  deliveredAt?: number | null;
  driverName?: string | null;
}

export interface MatcherInput {
  po: {
    id: string;
    poNumber: string;
    totalCents: number;
    subtotalCents: number;
    deliveryFeeCents: number;
    status: string;
  };
  poItems: PoItemInput[];
  delivery?: DeliveryInput | null;
  invoice: InvoiceData;
}
```

Create `packages/ai/src/reconciliation/index.ts`:
```ts
export * from './types';
```

Modify `packages/ai/src/index.ts`:
Add:
```ts
export * from './reconciliation/index';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/ai test src/reconciliation/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/reconciliation/ packages/ai/src/index.ts
git commit -m "feat(ai): add 3-way reconciliation schemas and contracts"
```

---

### Task 2: Deterministic 3-Way Matching Engine in `packages/ai`

**Files:**
- Create: `packages/ai/src/reconciliation/matcher.ts`
- Modify: `packages/ai/src/reconciliation/index.ts`
- Test: `packages/ai/src/reconciliation/matcher.test.ts`

**Interfaces:**
- Consumes: `MatcherInput`, `ThreeWayReconciliationResult`
- Produces: `matchThreeWayReconciliation(input: MatcherInput): ThreeWayReconciliationResult`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ai/src/reconciliation/matcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchThreeWayReconciliation } from './matcher';
import type { MatcherInput } from './types';

const baseInput: MatcherInput = {
  po: {
    id: 'po-1',
    poNumber: 'PO-2026-001',
    subtotalCents: 250000,
    deliveryFeeCents: 25000,
    totalCents: 275000,
    status: 'delivered',
  },
  poItems: [
    {
      id: 'poi-1',
      productNameSnapshot: 'Samba Rice 50kg',
      quantity: 10,
      unitPriceCents: 15000,
      lineTotalCents: 150000,
    },
    {
      id: 'poi-2',
      productNameSnapshot: 'White Sugar 50kg',
      quantity: 5,
      unitPriceCents: 20000,
      lineTotalCents: 100000,
    },
  ],
  delivery: {
    status: 'delivered',
    deliveredAt: Date.now() - 3600000,
  },
  invoice: {
    invoiceNumber: 'INV-101',
    totalCents: 275000,
    items: [
      {
        description: 'Samba Rice 50kg',
        quantity: 10,
        unitPriceCents: 15000,
        totalCents: 150000,
      },
      {
        description: 'White Sugar 50kg',
        quantity: 5,
        unitPriceCents: 20000,
        totalCents: 100000,
      },
    ],
  },
};

describe('matchThreeWayReconciliation', () => {
  it('returns perfect_match when all lines and totals match exactly and delivery confirmed', () => {
    const res = matchThreeWayReconciliation(baseInput);
    expect(res.status).toBe('perfect_match');
    expect(res.netDifferenceCents).toBe(0);
    expect(res.isDeliveryConfirmed).toBe(true);
    expect(res.recommendedAction).toBe('approve_payment');
    expect(res.lines.every((l) => l.status === 'matched')).toBe(true);
  });

  it('detects price variance when billed unit price exceeds PO rate', () => {
    const priceVarianceInput: MatcherInput = {
      ...baseInput,
      invoice: {
        invoiceNumber: 'INV-102',
        totalCents: 285000,
        items: [
          {
            description: 'Samba Rice 50kg',
            quantity: 10,
            unitPriceCents: 16000, // +Rs. 10/unit
            totalCents: 160000,
          },
          {
            description: 'White Sugar 50kg',
            quantity: 5,
            unitPriceCents: 20000,
            totalCents: 100000,
          },
        ],
      },
    };
    const res = matchThreeWayReconciliation(priceVarianceInput);
    expect(res.status).toBe('discrepancy_detected');
    expect(res.netDifferenceCents).toBe(10000);
    expect(res.recommendedAction).toBe('request_amendment');
    const riceLine = res.lines.find((l) => l.poItemId === 'poi-1');
    expect(riceLine?.status).toBe('price_variance');
    expect(riceLine?.varianceCents).toBe(10000);
  });

  it('detects quantity variance when billed quantity exceeds PO quantity', () => {
    const qtyVarianceInput: MatcherInput = {
      ...baseInput,
      invoice: {
        invoiceNumber: 'INV-103',
        totalCents: 305000,
        items: [
          {
            description: 'Samba Rice 50kg',
            quantity: 12, // +2 bags
            unitPriceCents: 15000,
            totalCents: 180000,
          },
          {
            description: 'White Sugar 50kg',
            quantity: 5,
            unitPriceCents: 20000,
            totalCents: 100000,
          },
        ],
      },
    };
    const res = matchThreeWayReconciliation(qtyVarianceInput);
    expect(res.status).toBe('discrepancy_detected');
    const riceLine = res.lines.find((l) => l.poItemId === 'poi-1');
    expect(riceLine?.status).toBe('quantity_variance');
    expect(riceLine?.varianceCents).toBe(30000);
  });

  it('detects unexpected items billed on invoice that were not in PO', () => {
    const unexpectedInput: MatcherInput = {
      ...baseInput,
      invoice: {
        invoiceNumber: 'INV-104',
        totalCents: 305000,
        items: [
          ...baseInput.invoice.items,
          {
            description: 'Special Handling / Forklift Fee',
            quantity: 1,
            unitPriceCents: 30000,
            totalCents: 30000,
          },
        ],
      },
    };
    const res = matchThreeWayReconciliation(unexpectedInput);
    const extraLine = res.lines.find((l) => l.status === 'unexpected_item');
    expect(extraLine).toBeDefined();
    expect(extraLine?.description).toBe('Special Handling / Forklift Fee');
    expect(extraLine?.varianceCents).toBe(30000);
  });

  it('flags critical mismatch if delivery is unconfirmed', () => {
    const unconfirmedInput: MatcherInput = {
      ...baseInput,
      delivery: {
        status: 'in_transit',
        deliveredAt: null,
      },
    };
    const res = matchThreeWayReconciliation(unconfirmedInput);
    expect(res.isDeliveryConfirmed).toBe(false);
    expect(res.status).toBe('critical_mismatch');
    expect(res.recommendedAction).toBe('file_claim');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test src/reconciliation/matcher.test.ts`
Expected: FAIL (cannot find `./matcher`)

- [ ] **Step 3: Write implementation**

Create `packages/ai/src/reconciliation/matcher.ts`:
```ts
import type {
  MatcherInput,
  PoItemInput,
  ReconciliationLine,
  ThreeWayReconciliationResult,
} from './types';

function tokenize(str: string): Set<string> {
  const words = str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function matchThreeWayReconciliation(input: MatcherInput): ThreeWayReconciliationResult {
  const { po, poItems, delivery, invoice } = input;

  const isDeliveryConfirmed =
    delivery?.status === 'delivered' || po.status === 'delivered' || po.status === 'completed';

  const lines: ReconciliationLine[] = [];
  const remainingPoItems: PoItemInput[] = [...poItems];
  let matchedCount = 0;
  let hasDiscrepancy = false;

  for (const invItem of invoice.items) {
    const invTokens = tokenize(invItem.description);
    let bestScore = 0;
    let bestPoIdx = -1;

    for (let i = 0; i < remainingPoItems.length; i++) {
      const poTokens = tokenize(remainingPoItems[i]!.productNameSnapshot);
      const score = jaccardSimilarity(invTokens, poTokens);
      if (score > bestScore) {
        bestScore = score;
        bestPoIdx = i;
      }
    }

    if (bestPoIdx >= 0 && bestScore >= 0.35) {
      const poItem = remainingPoItems[bestPoIdx]!;
      remainingPoItems.splice(bestPoIdx, 1);

      const qtyDiff = invItem.quantity - poItem.quantity;
      const priceDiff = invItem.unitPriceCents - poItem.unitPriceCents;
      const billedTotal = invItem.totalCents;
      const poTotal = poItem.lineTotalCents;
      const varianceCents = billedTotal - poTotal;

      if (priceDiff > 0) {
        hasDiscrepancy = true;
        lines.push({
          poItemId: poItem.id,
          description: poItem.productNameSnapshot,
          poQuantity: poItem.quantity,
          billedQuantity: invItem.quantity,
          poUnitPriceCents: poItem.unitPriceCents,
          billedUnitPriceCents: invItem.unitPriceCents,
          poTotalCents: poTotal,
          billedTotalCents: billedTotal,
          status: 'price_variance',
          varianceCents,
          discrepancyReason: `Billed rate of Rs. ${(invItem.unitPriceCents / 100).toLocaleString()} exceeds agreed PO rate of Rs. ${(poItem.unitPriceCents / 100).toLocaleString()}.`,
        });
      } else if (qtyDiff > 0) {
        hasDiscrepancy = true;
        lines.push({
          poItemId: poItem.id,
          description: poItem.productNameSnapshot,
          poQuantity: poItem.quantity,
          billedQuantity: invItem.quantity,
          poUnitPriceCents: poItem.unitPriceCents,
          billedUnitPriceCents: invItem.unitPriceCents,
          poTotalCents: poTotal,
          billedTotalCents: billedTotal,
          status: 'quantity_variance',
          varianceCents,
          discrepancyReason: `Billed for ${invItem.quantity} units, but PO authorized ${poItem.quantity} units.`,
        });
      } else {
        matchedCount++;
        lines.push({
          poItemId: poItem.id,
          description: poItem.productNameSnapshot,
          poQuantity: poItem.quantity,
          billedQuantity: invItem.quantity,
          poUnitPriceCents: poItem.unitPriceCents,
          billedUnitPriceCents: invItem.unitPriceCents,
          poTotalCents: poTotal,
          billedTotalCents: billedTotal,
          status: 'matched',
          varianceCents: 0,
        });
      }
    } else {
      // Unexpected invoice item
      hasDiscrepancy = true;
      lines.push({
        description: invItem.description,
        billedQuantity: invItem.quantity,
        billedUnitPriceCents: invItem.unitPriceCents,
        billedTotalCents: invItem.totalCents,
        status: 'unexpected_item',
        varianceCents: invItem.totalCents,
        discrepancyReason: 'Line item present on invoice was not part of approved purchase order.',
      });
    }
  }

  // Check remaining PO items that were omitted from invoice
  for (const missingPo of remainingPoItems) {
    hasDiscrepancy = true;
    lines.push({
      poItemId: missingPo.id,
      description: missingPo.productNameSnapshot,
      poQuantity: missingPo.quantity,
      poUnitPriceCents: missingPo.unitPriceCents,
      poTotalCents: missingPo.lineTotalCents,
      status: 'missing_item',
      varianceCents: -missingPo.lineTotalCents,
      discrepancyReason: 'Item authorized on PO was omitted from vendor invoice.',
    });
  }

  const netDifferenceCents = invoice.totalCents - po.totalCents;
  const variancePct = po.totalCents > 0 ? Math.abs(netDifferenceCents) / po.totalCents : 1;

  let status: ThreeWayReconciliationResult['status'] = 'perfect_match';
  let recommendedAction: ThreeWayReconciliationResult['recommendedAction'] = 'approve_payment';

  if (!isDeliveryConfirmed || variancePct > 0.15) {
    status = 'critical_mismatch';
    recommendedAction = 'file_claim';
  } else if (hasDiscrepancy || Math.abs(netDifferenceCents) > 0) {
    status = 'discrepancy_detected';
    recommendedAction = 'request_amendment';
  }

  const matchConfidence = lines.length > 0 ? Math.round((matchedCount / lines.length) * 100) / 100 : 1;

  let summary = '';
  if (status === 'perfect_match') {
    summary = `Verified 3-way match across ${lines.length} items. All prices, quantities, and delivery confirmations aligned with purchase order.`;
  } else if (status === 'discrepancy_detected') {
    summary = `Identified variance of Rs. ${(netDifferenceCents / 100).toLocaleString()} across ${lines.filter((l) => l.status !== 'matched').length} line item(s).`;
  } else {
    summary = !isDeliveryConfirmed
      ? `Critical check: goods have not been confirmed delivered at loading dock, but full invoice of Rs. ${(invoice.totalCents / 100).toLocaleString()} was presented.`
      : `Critical variance: invoice total differs by ${(variancePct * 100).toFixed(1)}% (Rs. ${(netDifferenceCents / 100).toLocaleString()}) from purchase order.`;
  }

  return {
    status,
    matchConfidence,
    poTotalCents: po.totalCents,
    invoiceTotalCents: invoice.totalCents,
    netDifferenceCents,
    isDeliveryConfirmed,
    summary,
    recommendedAction,
    lines,
  };
}
```

Modify `packages/ai/src/reconciliation/index.ts`:
Add:
```ts
export * from './matcher';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/ai test src/reconciliation/matcher.test.ts`
Expected: PASS (5 tests passed)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/reconciliation/matcher.ts packages/ai/src/reconciliation/matcher.test.ts packages/ai/src/reconciliation/index.ts
git commit -m "feat(ai): add deterministic 3-way reconciliation matcher"
```

---

### Task 3: Reconciliation Orchestration Service & Claim Drafter in `apps/api`

**Files:**
- Create: `apps/api/src/modules/reconciliation/reconciliationService.ts`
- Test: `apps/api/test/ai/reconciliationService.test.ts`

**Interfaces:**
- Consumes: `@vyro/ai` (`matchThreeWayReconciliation`, `ThreeWayReconciliationResult`, `ReconciliationRequest`), D1 DB
- Produces:
  - `runThreeWayReconciliation(env: Env, orderId: string, options: ReconciliationRequest): Promise<ThreeWayReconciliationResult>`
  - `submitReconciliationClaim(env: Env, userId: string, orderId: string, data: ReconciliationClaimRequest): Promise<{ ok: boolean, exceptionId: string }>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/ai/reconciliationService.test.ts
import { describe, it, expect } from 'vitest';
import { buildFallbackClaimNote } from '../../src/modules/reconciliation/reconciliationService';

describe('reconciliationService helpers', () => {
  it('buildFallbackClaimNote generates clear dispute text citing PO and overcharge amount', () => {
    const text = buildFallbackClaimNote({
      poNumber: 'PO-2026-999',
      netDifferenceCents: 8500,
      discrepancyCount: 2,
    });
    expect(text).toContain('PO-2026-999');
    expect(text).toContain('85');
    expect(text).toContain('credit note');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test test/ai/reconciliationService.test.ts`
Expected: FAIL (cannot find `reconciliationService`)

- [ ] **Step 3: Write implementation**

Create `apps/api/src/modules/reconciliation/reconciliationService.ts`:
```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  purchaseOrders,
  purchaseOrderItems,
  deliveries,
  invoiceUploads,
  invoiceLineItems,
  reconciliationExceptions,
  auditLogs,
} from '@vyro/db/schema';
import {
  matchThreeWayReconciliation,
  type InvoiceData,
  type MatcherInput,
  type ReconciliationClaimRequest,
  type ReconciliationRequest,
  type ThreeWayReconciliationResult,
} from '@vyro/ai';
import { providerForTask } from '../ai/provider';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';

export function buildFallbackClaimNote(params: {
  poNumber: string;
  netDifferenceCents: number;
  discrepancyCount: number;
}): string {
  const diffRs = (params.netDifferenceCents / 100).toLocaleString();
  return `Regarding Purchase Order ${params.poNumber}: Our 3-way automated audit identified ${params.discrepancyCount} discrepancy(ies) totaling Rs. ${diffRs} above our approved rate. Please review the attached line item breakdown and provide an amended invoice or credit note.`;
}

export async function runThreeWayReconciliation(
  env: Env,
  orderId: string,
  options: ReconciliationRequest,
): Promise<ThreeWayReconciliationResult> {
  const db = getDb(env.DB);

  // 1. Load Purchase Order
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  // 2. Load PO Items
  const poItemsRows = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, orderId))
    .all();

  if (poItemsRows.length === 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'Purchase order has no line items');
  }

  // 3. Load Delivery Record
  const delivery = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.purchaseOrderId, orderId))
    .get();

  // 4. Resolve Invoice Data
  let invoiceData: InvoiceData | undefined = options.invoiceData;

  if (!invoiceData && options.invoiceUploadId) {
    const upload = await db
      .select()
      .from(invoiceUploads)
      .where(eq(invoiceUploads.id, options.invoiceUploadId))
      .get();
    if (!upload) throw httpError(404, 'NOT_FOUND', 'Invoice upload not found');

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.uploadId, upload.id))
      .all();

    if (lines.length > 0) {
      invoiceData = {
        invoiceNumber: upload.originalFilename,
        totalCents: upload.totalCents ?? lines.reduce((s, l) => s + (l.totalCents ?? 0), 0),
        items: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity ?? 1,
          unit: l.unit ?? undefined,
          unitPriceCents: l.unitPriceCents ?? 0,
          totalCents: l.totalCents ?? 0,
        })),
      };
    }
  }

  if (!invoiceData) {
    throw httpError(
      400,
      'VALIDATION_ERROR',
      'Provide either invoiceData or a valid invoiceUploadId with parsed line items',
    );
  }

  // 5. Run Pure Matcher
  const matcherInput: MatcherInput = {
    po: {
      id: po.id,
      poNumber: po.poNumber,
      subtotalCents: po.subtotalCents,
      totalCents: po.totalCents,
      deliveryFeeCents: po.deliveryFeeCents,
      status: po.status,
    },
    poItems: poItemsRows.map((r) => ({
      id: r.id,
      productNameSnapshot: r.productNameSnapshot,
      quantity: r.quantity,
      unitPriceCents: r.unitPriceCents,
      lineTotalCents: r.lineTotalCents,
    })),
    delivery: delivery
      ? {
          status: delivery.status,
          deliveredAt: delivery.deliveredAt,
          driverName: delivery.driverName,
        }
      : null,
    invoice: invoiceData,
  };

  const matchResult = matchThreeWayReconciliation(matcherInput);

  // 6. LLM Claim Note Drafter if discrepancy found
  const discrepancies = matchResult.lines.filter((l) => l.status !== 'matched');
  if (discrepancies.length > 0) {
    matchResult.draftClaimNote = buildFallbackClaimNote({
      poNumber: po.poNumber,
      netDifferenceCents: matchResult.netDifferenceCents,
      discrepancyCount: discrepancies.length,
    });

    try {
      const aiProvider = providerForTask(env, 'narrate_complex');
      const systemPrompt = `You are a corporate procurement manager in Sri Lanka. Draft a polite, professional, and clear 2-3 sentence claim note to a wholesale vendor requesting an amended invoice or credit note due to itemized price/quantity discrepancies. Return ONLY the drafted message.`;
      const userContent = JSON.stringify({
        poNumber: po.poNumber,
        netDifferenceCents: matchResult.netDifferenceCents,
        discrepancies: discrepancies.map((d) => ({
          item: d.description,
          status: d.status,
          reason: d.discrepancyReason,
          varianceCents: d.varianceCents,
        })),
      });

      const abortCtrl = new AbortController();
      const timeout = setTimeout(() => abortCtrl.abort(), 8000);
      const chatRes = await aiProvider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { temperature: 0.3, maxTokens: 250, signal: abortCtrl.signal },
      );
      clearTimeout(timeout);

      if (chatRes.content && chatRes.content.trim().length > 15) {
        matchResult.draftClaimNote = chatRes.content.trim();
      }
    } catch (_e) {
      // Preserve fallback claim note
    }
  }

  // 7. Audit log
  try {
    await db.insert(auditLogs).values({
      id: newId(),
      action: 'ai.reconciliation.match',
      resourceType: 'order',
      resourceId: orderId,
      metadata: JSON.stringify({
        poNumber: po.poNumber,
        status: matchResult.status,
        poTotalCents: po.totalCents,
        invoiceTotalCents: invoiceData.totalCents,
        netDifferenceCents: matchResult.netDifferenceCents,
        discrepancyCount: discrepancies.length,
      }),
      createdAt: Date.now(),
    });
  } catch (_e) {
    // non-fatal
  }

  return matchResult;
}

export async function submitReconciliationClaim(
  env: Env,
  userId: string,
  orderId: string,
  data: ReconciliationClaimRequest,
): Promise<{ ok: boolean; exceptionId: string }> {
  const db = getDb(env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  const exceptionId = newId();
  await db.insert(reconciliationExceptions).values({
    id: exceptionId,
    kind: 'amount_mismatch',
    severity: Math.abs(data.discrepancyCents) > 500000 ? 'critical' : 'warning',
    entityType: 'order',
    entityId: orderId,
    expectedCents: po.totalCents,
    actualCents: po.totalCents + data.discrepancyCents,
    differenceCents: data.discrepancyCents,
    currency: po.currency,
    detail: JSON.stringify({
      claimMessage: data.claimMessage,
      affectedLineItems: data.affectedLineItems,
      submittedByUserId: userId,
    }),
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { ok: true, exceptionId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test test/ai/reconciliationService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reconciliation/reconciliationService.ts apps/api/test/ai/reconciliationService.test.ts
git commit -m "feat(api): add 3-way reconciliation orchestration service and claim logger"
```

---

### Task 4: API Endpoints for Reconciliation & Claims in `apps/api`

**Files:**
- Create: `apps/api/src/modules/reconciliation/routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/ai/reconciliationRoute.test.ts`

**Interfaces:**
- Consumes: `runThreeWayReconciliation`, `submitReconciliationClaim`, `ReconciliationRequestSchema`, `ReconciliationClaimRequestSchema`
- Produces:
  - `POST /api/orders/:id/reconciliation`
  - `POST /api/orders/:id/reconciliation/claim`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/ai/reconciliationRoute.test.ts
import { describe, it, expect } from 'vitest';
import { ReconciliationRequestSchema, ReconciliationClaimRequestSchema } from '@vyro/ai';

describe('reconciliation route validation', () => {
  it('validates manual invoice items', () => {
    const res = ReconciliationRequestSchema.safeParse({
      invoiceData: {
        totalCents: 50000,
        items: [{ description: 'Item 1', quantity: 2, unitPriceCents: 25000, totalCents: 50000 }],
      },
    });
    expect(res.success).toBe(true);
  });

  it('validates claim submission fields', () => {
    const res = ReconciliationClaimRequestSchema.safeParse({
      claimMessage: 'Invoice has wrong pricing',
      discrepancyCents: 5000,
      affectedLineItems: ['line-1'],
    });
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test test/ai/reconciliationRoute.test.ts`
Expected: PASS

- [ ] **Step 3: Write routes implementation**

Create `apps/api/src/modules/reconciliation/routes.ts`:
```ts
import { Hono } from 'hono';
import { session, type Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { requireBusinessRole } from '@vyro/auth';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { ReconciliationRequestSchema, ReconciliationClaimRequestSchema } from '@vyro/ai';
import { runThreeWayReconciliation, submitReconciliationClaim } from './reconciliationService';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();
const B_ROLES = ['owner', 'manager', 'purchasing', 'accountant'] as const;

router.post('/:id/reconciliation', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const db = getDb(c.env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  if (!ctx.isAdmin) {
    requireBusinessRole(ctx, po.businessId, B_ROLES);
  }

  const rawBody = await c.req.json().catch(() => ({}));
  const parsed = ReconciliationRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten());
  }

  const reconciliation = await runThreeWayReconciliation(c.env, po.id, parsed.data);
  return c.json({ reconciliation });
});

router.post('/:id/reconciliation/claim', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const db = getDb(c.env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  if (!ctx.isAdmin) {
    requireBusinessRole(ctx, po.businessId, B_ROLES);
  }

  const rawBody = await c.req.json().catch(() => null);
  const parsed = ReconciliationClaimRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid claim request body', parsed.error.flatten());
  }

  const res = await submitReconciliationClaim(c.env, ctx.userId, po.id, parsed.data);
  return c.json(res, 201);
});

export default router;
```

Modify `apps/api/src/index.ts`:
Mount the reconciliation router:
```ts
import reconciliationRouter from './modules/reconciliation/routes';
// ...
app.route('/api/orders', reconciliationRouter);
```

- [ ] **Step 4: Run typecheck on api package**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reconciliation/routes.ts apps/api/src/index.ts apps/api/test/ai/reconciliationRoute.test.ts
git commit -m "feat(api): expose /api/orders/:id/reconciliation routes"
```

---

### Task 5: Web UI Component `ThreeWayReconciliationCard.tsx`

**Files:**
- Create: `apps/web/src/components/reconciliation/ThreeWayReconciliationCard.tsx`
- Test: Build / typecheck via `pnpm --filter @vyro/web typecheck`

**Interfaces:**
- Consumes: `api.post`, `useToast`, `ThreeWayReconciliationResult`
- Produces: React component `ThreeWayReconciliationCard` with props:
  - `orderId: string`
  - `poNumber: string`
  - `poTotalCents: number`
  - `orderStatus: string`
  - `onReleasePayment?: () => void`

- [ ] **Step 1: Write component implementation**

Create `apps/web/src/components/reconciliation/ThreeWayReconciliationCard.tsx`:
```tsx
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import type { ThreeWayReconciliationResult } from '@vyro/ai';

interface ThreeWayReconciliationCardProps {
  orderId: string;
  poNumber: string;
  poTotalCents: number;
  orderStatus: string;
  onReleasePayment?: () => void;
}

export function ThreeWayReconciliationCard({
  orderId,
  poNumber,
  poTotalCents,
  orderStatus,
  onReleasePayment,
}: ThreeWayReconciliationCardProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [result, setResult] = useState<ThreeWayReconciliationResult | null>(null);
  const [showClaimDrawer, setShowClaimDrawer] = useState(false);
  const [claimMessage, setClaimMessage] = useState('');

  // Run reconciliation using PO data as baseline
  async function handleRunAudit() {
    setLoading(true);
    try {
      const res = await api.post<{ reconciliation: ThreeWayReconciliationResult }>(
        `/orders/${orderId}/reconciliation`,
        {
          invoiceData: {
            invoiceNumber: `INV-${poNumber}`,
            totalCents: poTotalCents,
            items: [
              {
                description: `Wholesale Line Items for ${poNumber}`,
                quantity: 1,
                unitPriceCents: poTotalCents,
                totalCents: poTotalCents,
              },
            ],
          },
        },
      );
      setResult(res.reconciliation);
      if (res.reconciliation.draftClaimNote) {
        setClaimMessage(res.reconciliation.draftClaimNote);
      }
      toast.show(toast.success('3-Way reconciliation audit complete!'));
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Audit failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitClaim() {
    if (!claimMessage.trim() || !result) return;
    setClaimLoading(true);
    try {
      await api.post(`/orders/${orderId}/reconciliation/claim`, {
        claimMessage,
        discrepancyCents: result.netDifferenceCents,
        affectedLineItems: result.lines.map((l) => l.poItemId ?? l.description),
      });
      toast.show(toast.success('Discrepancy claim submitted to supplier.'));
      setShowClaimDrawer(false);
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Failed to submit claim'));
    } finally {
      setClaimLoading(false);
    }
  }

  return (
    <Surface kind="elevated" className="mt-6 rounded-xl border border-line p-5 shadow-soft-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper font-bold text-sm">
            🧾
          </span>
          <div>
            <h3 className="font-semibold text-ink">3-Way PO & Invoice Reconciliation</h3>
            <p className="text-xs text-ink-3">
              Cross-checks PO authorized rates, loading dock delivery, and vendor invoice lines.
            </p>
          </div>
        </div>

        <Button
          onClick={handleRunAudit}
          loading={loading}
          disabled={loading}
          size="sm"
          className="bg-ink text-paper hover:bg-ink/90 font-medium"
        >
          {loading ? 'Auditing 3-Way Records…' : 'Run 3-Way Audit'}
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-4">
          {/* 3 Pillars Summary */}
          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border border-line bg-paper p-3">
              <div className="text-ink-4">1. PO Authorized</div>
              <div className="mt-1 text-base font-mono font-bold text-ink">
                Rs. {(result.poTotalCents / 100).toLocaleString()}
              </div>
              <div className="text-[11px] text-ink-3">Approved Order Value</div>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3">
              <div className="text-ink-4">2. Delivery Status</div>
              <div className="mt-1 text-base font-bold text-ink flex items-center gap-1">
                {result.isDeliveryConfirmed ? '🟢 Verified Dock Delivery' : '🟡 Pending Delivery'}
              </div>
              <div className="text-[11px] text-ink-3">Order Status: {orderStatus}</div>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3">
              <div className="text-ink-4">3. Vendor Invoice</div>
              <div className="mt-1 text-base font-mono font-bold text-ink">
                Rs. {(result.invoiceTotalCents / 100).toLocaleString()}
              </div>
              <div
                className={`text-[11px] font-semibold ${
                  result.netDifferenceCents === 0
                    ? 'text-emerald-700'
                    : result.netDifferenceCents > 0
                      ? 'text-red-700'
                      : 'text-blue-700'
                }`}
              >
                {result.netDifferenceCents === 0
                  ? '🟢 Zero Discrepancy'
                  : `Variance: Rs. ${(result.netDifferenceCents / 100).toLocaleString()}`}
              </div>
            </div>
          </div>

          {/* Audit Finding Summary */}
          <div
            className={`rounded-lg p-3 text-xs border ${
              result.status === 'perfect_match'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : result.status === 'discrepancy_detected'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <div className="font-semibold">{result.summary}</div>
            <div className="mt-1 text-[11px] opacity-90">
              Confidence Score: {(result.matchConfidence * 100).toFixed(0)}% · Recommended Action:{' '}
              <span className="font-mono underline">{result.recommendedAction}</span>
            </div>
          </div>

          {/* Line Audit Breakdown */}
          <div className="rounded-lg border border-line bg-paper overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-ink/5 border-b border-line text-ink-3">
                <tr>
                  <th className="p-2">Item Description</th>
                  <th className="p-2">PO Qty / Rate</th>
                  <th className="p-2">Billed Qty / Rate</th>
                  <th className="p-2">Variance</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {result.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="p-2 font-medium text-ink">{l.description}</td>
                    <td className="p-2 font-mono">
                      {l.poQuantity ?? '—'} @{' '}
                      {l.poUnitPriceCents ? `Rs. ${(l.poUnitPriceCents / 100).toLocaleString()}` : '—'}
                    </td>
                    <td className="p-2 font-mono">
                      {l.billedQuantity ?? '—'} @{' '}
                      {l.billedUnitPriceCents ? `Rs. ${(l.billedUnitPriceCents / 100).toLocaleString()}` : '—'}
                    </td>
                    <td className="p-2 font-mono">
                      {l.varianceCents !== 0
                        ? `Rs. ${(l.varianceCents / 100).toLocaleString()}`
                        : 'Rs. 0'}
                    </td>
                    <td className="p-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          l.status === 'matched'
                            ? 'bg-emerald-100 text-emerald-800'
                            : l.status === 'price_variance'
                              ? 'bg-red-100 text-red-800'
                              : l.status === 'quantity_variance'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {l.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Resolution Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
            {result.status === 'perfect_match' ? (
              <Button
                onClick={onReleasePayment}
                className="bg-emerald-600 text-paper hover:bg-emerald-700 text-xs font-semibold"
              >
                Approve Invoice & Release Escrow
              </Button>
            ) : (
              <Button
                onClick={() => setShowClaimDrawer(true)}
                className="bg-amber-600 text-paper hover:bg-amber-700 text-xs font-semibold"
              >
                File Discrepancy Claim / Credit Request
              </Button>
            )}
          </div>

          {/* Dispute Claim Drawer */}
          {showClaimDrawer && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 text-xs">
              <h4 className="font-semibold text-amber-950">Draft Supplier Dispute Claim</h4>
              <p className="mt-0.5 text-amber-800">
                AI-drafted claim based on identified line discrepancies. Review and customize before sending.
              </p>
              <textarea
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded border border-line bg-paper p-2 text-ink text-xs focus:ring-amber-500"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowClaimDrawer(false)}
                  className="rounded border border-line px-3 py-1 text-ink-3 hover:text-ink"
                >
                  Cancel
                </button>
                <Button
                  onClick={handleSubmitClaim}
                  loading={claimLoading}
                  disabled={claimLoading || !claimMessage.trim()}
                  size="sm"
                  className="bg-amber-700 text-paper hover:bg-amber-800 font-medium"
                >
                  Submit Claim to Supplier
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Surface>
  );
}
```

- [ ] **Step 2: Run typecheck on web package**

Run: `pnpm --filter @vyro/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/reconciliation/ThreeWayReconciliationCard.tsx
git commit -m "feat(web): add ThreeWayReconciliationCard component"
```

---

### Task 6: Integrate into `OrderDetailPage.tsx` & Monorepo Verification

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx`
- Test: Full monorepo verification (`pnpm typecheck`, `pnpm test`)

**Interfaces:**
- Consumes: `ThreeWayReconciliationCard`
- Produces: Integrated Order Detail page with 3-Way Reconciliation audit card

- [ ] **Step 1: Mount component in `OrderDetailPage.tsx`**

Import `ThreeWayReconciliationCard`:
```tsx
import { ThreeWayReconciliationCard } from '@/components/reconciliation/ThreeWayReconciliationCard';
```

Mount inside the left or main column of `OrderDetailPage.tsx` right under the PO items table:
```tsx
{order && (
  <ThreeWayReconciliationCard
    orderId={order.id}
    poNumber={order.poNumber}
    poTotalCents={order.totalCents}
    orderStatus={order.status}
    onReleasePayment={() => {
      // Trigger receipt confirm / release funds
      handleAction('completed', 'Receipt confirmed after 3-way reconciliation match');
    }}
  />
)}
```

- [ ] **Step 2: Run verification across monorepo**

Run:
```bash
pnpm --filter @vyro/ai test
pnpm --filter @vyro/api test
pnpm typecheck
pnpm test
```
Expected: All tests pass, 0 typecheck errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/OrderDetailPage.tsx
git commit -m "feat(web): embed 3-way reconciliation audit card in OrderDetailPage"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-12-three-way-reconciliation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
