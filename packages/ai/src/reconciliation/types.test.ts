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
