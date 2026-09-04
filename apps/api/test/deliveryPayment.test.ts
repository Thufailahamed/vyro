import { describe, expect, it } from 'vitest';

describe('delivery + payment module wiring', () => {
  it('delivery status enum has expected values', async () => {
    const { DELIVERY_STATUSES } = await import('@vyro/validation/delivery');
    expect(DELIVERY_STATUSES).toContain('delivered');
    expect(DELIVERY_STATUSES).toContain('failed');
  });

  it('payment schema rejects unknown method', async () => {
    const { createPaymentSchema } = await import('@vyro/validation/payment');
    const r = createPaymentSchema.safeParse({ purchaseOrderId: 'p1', method: 'bitcoin' });
    expect(r.success).toBe(false);
  });

  it('payment schema rejects unknown status on confirm', async () => {
    const { confirmPaymentSchema } = await import('@vyro/validation/payment');
    const r = confirmPaymentSchema.safeParse({ status: 'reversed' });
    expect(r.success).toBe(false);
  });

  it('payment schema accepts valid create payload', async () => {
    const { createPaymentSchema } = await import('@vyro/validation/payment');
    const r = createPaymentSchema.safeParse({ purchaseOrderId: 'p1', method: 'cash', transactionReference: 'T-1' });
    expect(r.success).toBe(true);
  });
});
