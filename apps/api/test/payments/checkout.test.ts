import { describe, expect, it } from 'vitest';
import { PayHereGateway } from '@vyro/payments';

describe('checkout wire', () => {
  it('uses payment.id as PayHere order_id with backend amount', async () => {
    const g = new PayHereGateway({ merchantId: '121XXX', merchantSecret: 's3cr3t', sandbox: true });
    const r = await g.startCheckout({
      paymentId: 'pay_abc',
      purchaseOrderId: 'po_xyz',
      amountCents: 4550000,
      currency: 'LKR',
      businessName: 'Acme',
      businessEmail: 'a@b.c',
      supplierName: 'Sup',
      description: 'PO VYRO-1',
      returnUrl: 'https://x/return',
      cancelUrl: 'https://x/cancel',
      notifyUrl: 'https://x/notify',
    });
    expect(r.gatewayRef).toBe('pay_abc');
    expect(r.redirectUrl).toContain('order_id=pay_abc');
    expect(r.redirectUrl).toContain('amount=45500.00');
    expect(r.redirectUrl).not.toContain('po_xyz');
  });
});
