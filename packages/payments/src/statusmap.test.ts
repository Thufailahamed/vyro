import { describe, expect, it } from 'vitest';
import { PayHereGateway } from './payhere';
import { md5 } from './hash';

function signedBody(code: string): string {
  const secret = 's';
  const hs = md5(secret).toUpperCase();
  const sig = md5(`1pay_1100.00LKR${code}${hs}`).toUpperCase();
  return `merchant_id=1&order_id=pay_1&payhere_amount=100.00&payhere_currency=LKR&status_code=${code}&md5sig=${sig}&payment_id=PH1`;
}

describe('status mapping', () => {
  it('maps 0 to pending not success', async () => {
    const g = new PayHereGateway({ merchantId: '1', merchantSecret: 's', sandbox: true });
    const ev = await g.parseWebhook(signedBody('0'), null);
    expect(ev.type).toBe('payment.pending');
  });

  it('maps -3 to chargeback', async () => {
    const g = new PayHereGateway({ merchantId: '1', merchantSecret: 's', sandbox: true });
    const ev = await g.parseWebhook(signedBody('-3'), null);
    expect(ev.type).toBe('payment.chargeback');
  });

  it('maps -1 to cancelled', async () => {
    const g = new PayHereGateway({ merchantId: '1', merchantSecret: 's', sandbox: true });
    const ev = await g.parseWebhook(signedBody('-1'), null);
    expect(ev.type).toBe('payment.cancelled');
  });
});
