import { describe, expect, it } from 'vitest';
import { PaymentsLkGateway } from '@vyro/payments';

const CHECKOUT_INPUT = {
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
};

describe('payments.lk checkout wire', () => {
  it('uses payment.id as the reference with the backend amount', async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const g = new PaymentsLkGateway(
      { secretKey: 'sk_test_k', webhookSecret: 'whsec_k', apiBaseUrl: 'https://api.test' },
      async (url, init) => {
        captured.push({ url, init });
        return new Response(
          JSON.stringify({ id: 'ch_abc', url: 'https://pay.payments.lk/checkout/ch_abc' }),
          { status: 200 },
        );
      },
    );
    const r = await g.startCheckout(CHECKOUT_INPUT);
    expect(r.gatewayRef).toBe('ch_abc');
    expect(r.redirectUrl).toBe('https://pay.payments.lk/checkout/ch_abc');
    const body = JSON.parse(String(captured[0]!.init!.body));
    expect(body.amountCents).toBe(4550000);
    expect(body.reference).toBe('pay_abc');
    expect(body.successUrl).toBe('https://x/return');
    expect(body.cancelUrl).toBe('https://x/cancel');
  });

  it('rejects non-LKR and non-integer amounts', async () => {
    const g = new PaymentsLkGateway({ secretKey: 'sk_test_k', webhookSecret: 'whsec_k' });
    await expect(
      g.startCheckout({ ...CHECKOUT_INPUT, currency: 'USD' }),
    ).rejects.toThrow(/LKR only/);
    await expect(
      g.startCheckout({ ...CHECKOUT_INPUT, amountCents: 10.5 }),
    ).rejects.toThrow(/invalid amountCents/);
  });
});
