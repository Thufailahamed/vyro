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
