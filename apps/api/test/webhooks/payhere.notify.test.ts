import { describe, expect, it } from 'vitest';
import { md5, PayHereGateway } from '@vyro/payments';

const MID = '121XXX';
const SECRET = 's3cr3t';

function signed(
  oid: string,
  amt: string,
  cur: string,
  code: string,
  secret = SECRET,
  extra = '',
): string {
  const sig = md5(`${MID}${oid}${amt}${cur}${code}${md5(secret).toUpperCase()}`).toUpperCase();
  return (
    `merchant_id=${MID}&order_id=${oid}&payhere_amount=${amt}` +
    `&payhere_currency=${cur}&status_code=${code}&md5sig=${sig}&payment_id=PH1${extra}`
  );
}

function gateway() {
  return new PayHereGateway({ merchantId: MID, merchantSecret: SECRET, sandbox: true });
}

describe('payhere notify security', () => {
  it('accepts correctly signed success notification', async () => {
    const ev = await gateway().parseWebhook(signed('pay_1', '100.00', 'LKR', '2'), null);
    expect(ev.type).toBe('payment.success');
    expect(ev.gatewayRef).toBe('pay_1');
    expect(ev.amountCents).toBe(10000);
  });

  it('rejects forged md5sig', async () => {
    const raw = signed('pay_1', '100.00', 'LKR', '2');
    const forged = raw.replace(/md5sig=[A-F0-9]+/, 'md5sig=00'.repeat(16));
    expect(gateway().verifySignature(forged, null)).toBe(false);
    await expect(gateway().parseWebhook(forged, null)).rejects.toThrow(/signature mismatch/);
  });

  it('rejects modified amount (signature binds amount)', async () => {
    const raw = signed('pay_1', '100.00', 'LKR', '2');
    const tampered = raw.replace('payhere_amount=100.00', 'payhere_amount=1.00');
    expect(gateway().verifySignature(tampered, null)).toBe(false);
  });

  it('rejects modified order id', async () => {
    const raw = signed('pay_1', '100.00', 'LKR', '2');
    const tampered = raw.replace('order_id=pay_1', 'order_id=pay_2');
    expect(gateway().verifySignature(tampered, null)).toBe(false);
  });

  it('keeps pending distinct from success', async () => {
    const ev = await gateway().parseWebhook(signed('pay_1', '100.00', 'LKR', '0'), null);
    expect(ev.type).toBe('payment.pending');
  });

  it('maps cancelled and chargeback distinctly', async () => {
    expect((await gateway().parseWebhook(signed('p', '1.00', 'LKR', '-1'), null)).type).toBe(
      'payment.cancelled',
    );
    expect((await gateway().parseWebhook(signed('p', '1.00', 'LKR', '-3'), null)).type).toBe(
      'payment.chargeback',
    );
  });
});
