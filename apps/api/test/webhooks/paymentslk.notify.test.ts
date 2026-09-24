import { describe, expect, it } from 'vitest';
import { PaymentsLkGateway, buildPaymentsSignatureHeader } from '@vyro/payments';

const SECRET = 'whsec_e2e';

function body(type: string, data: Record<string, unknown>): string {
  return JSON.stringify({ id: 'evt_1', type, data });
}

async function parse(g: PaymentsLkGateway, s: string) {
  return g.parseWebhook(s, buildPaymentsSignatureHeader(SECRET, s));
}

describe('payments.lk notify security', () => {
  it('accepts a correctly signed success event', async () => {
    const raw = body('payment.succeeded', { reference: 'pay_1', amountCents: 10000, id: 'pay_gw_1', currency: 'LKR' });
    const ev = await parse(new PaymentsLkGateway({ secretKey: 'sk_test_x', webhookSecret: SECRET }), raw);
    expect(ev.type).toBe('payment.success');
    expect(ev.gatewayRef).toBe('pay_1');
    expect(ev.amountCents).toBe(10000);
  });

  it('rejects forged signatures', async () => {
    const raw = body('payment.succeeded', { reference: 'pay_1', amountCents: 10000 });
    const g = new PaymentsLkGateway({ secretKey: 'sk_test_x', webhookSecret: SECRET });
    await expect(g.parseWebhook(raw, 't=1,v1=00')).rejects.toThrow(/signature mismatch/);
    expect(g.verifySignature(raw, buildPaymentsSignatureHeader('OTHER', raw))).toBe(false);
  });

  it('signature binds the body bytes (amount tamper rejected)', async () => {
    const raw = body('payment.succeeded', { reference: 'pay_1', amountCents: 10000 });
    const tampered = raw.replace('"amountCents":10000', '"amountCents":100');
    const g = new PaymentsLkGateway({ secretKey: 'sk_test_x', webhookSecret: SECRET });
    expect(g.verifySignature(tampered, buildPaymentsSignatureHeader(SECRET, raw))).toBe(false);
  });

  it('keeps expired distinct from success', async () => {
    const raw = body('checkout.expired', { reference: 'p1' });
    const ev = await parse(new PaymentsLkGateway({ secretKey: 'sk', webhookSecret: SECRET }), raw);
    expect(ev.type).toBe('payment.expired');
  });
});
