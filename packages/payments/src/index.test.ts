import { describe, expect, it } from 'vitest';
import { GatewayConfigError, MockGateway, PaymentsLkGateway, resolveGateway } from './index';
import { buildPaymentsSignatureHeader } from './paymentslk';

describe('resolveGateway', () => {
  it('throws in production when creds missing (silent fallback guard)', () => {
    expect(() => resolveGateway({ ENVIRONMENT: 'production' })).toThrow(GatewayConfigError);
    expect(() => resolveGateway({ ENVIRONMENT: 'production' })).toThrow(/silent money loss/);
  });

  it('returns mock in local env without creds', () => {
    const r = resolveGateway({ ENVIRONMENT: 'local' });
    expect(r.isMock).toBe(true);
    expect(r.provider).toBe('mock');
  });

  it('returns mock when PAYMENTS_LK_MOCK=1 even with creds', () => {
    const r = resolveGateway({
      ENVIRONMENT: 'local',
      PAYMENTS_LK_MOCK: '1',
      PAYMENTS_LK_SECRET_KEY: 'sk_test_x',
      PAYMENTS_LK_WEBHOOK_SECRET: 'whsec_x',
    });
    expect(r.isMock).toBe(true);
  });

  it('returns payments_lk when both secrets present (any environment)', () => {
    const r = resolveGateway({
      ENVIRONMENT: 'production',
      PAYMENTS_LK_SECRET_KEY: 'sk_live_x',
      PAYMENTS_LK_WEBHOOK_SECRET: 'whsec_x',
    });
    expect(r.isMock).toBe(false);
    expect(r.provider).toBe('payments_lk');
    expect(r.adapter).toBeInstanceOf(PaymentsLkGateway);
  });

  it('GatewayConfigError carries 500 status', () => {
    const e = new GatewayConfigError('x');
    expect(e.status).toBe(500);
  });
});

describe('MockGateway (payments.lk event contract)', () => {
  it('accepts null signature only when no secret configured (dev)', () => {
    const g = new MockGateway();
    expect(g.verifySignature('{"type":"payment.succeeded"}', null)).toBe(true);
    expect(g.verifySignature('{"type":"payment.succeeded"}', 'spoof')).toBe(false);
  });

  it('enforces the t.v1 HMAC contract when secret is configured', async () => {
    const secret = 'whsec_test';
    const g = new MockGateway({ secret });
    const body = JSON.stringify({
      type: 'payment.succeeded',
      data: { reference: 'pay_1', amountCents: 1000, paymentId: 'MOCK-PAY-1' },
    });
    const header = buildPaymentsSignatureHeader(secret, body);
    expect(g.verifySignature(body, header)).toBe(true);
    expect(g.verifySignature(body, 't=1,v1=00')).toBe(false);
    expect(g.verifySignature(body, null)).toBe(false);
    const ev = await g.parseWebhook(body, header);
    expect(ev.type).toBe('payment.success');
    expect(ev.gatewayRef).toBe('pay_1');
    expect(ev.paymentId).toBe('MOCK-PAY-1');
    expect(ev.amountCents).toBe(1000);
    expect(ev.currency).toBe('LKR');
  });

  it('still parses the legacy form-encoded body shape', async () => {
    const g = new MockGateway();
    const ev = await g.parseWebhook('order_id=pay_2&amount=12.50&payhere_currency=LKR&type=payment.success', null);
    expect(ev.gatewayRef).toBe('pay_2');
    expect(ev.amountCents).toBe(1250);
  });

  it('forces failure when configured', async () => {
    const g = new MockGateway({ forceFailure: true });
    await expect(g.parseWebhook('{"type":"payment.succeeded"}', null)).rejects.toThrow(/forced failure/);
    const refund = await g.refund({ paymentGatewayRef: 'x', refundId: 'r1', amountCents: 1 });
    expect(refund.status).toBe('failed');
    const charge = await g.chargeSavedCard!({
      cardId: 'card_1',
      amountCents: 1,
      description: 'PO',
      reference: 'pay_1',
      idempotencyKey: 'charge_pay_1',
    });
    expect(charge.status).toBe('failed');
  });

  it('supports pending refund result', async () => {
    const g = new MockGateway({ refundResult: 'pending' });
    const r = await g.refund({ paymentGatewayRef: 'ch_1', refundId: 'r1', amountCents: 1 });
    expect(r.status).toBe('pending');
    expect(r.gatewayRefundId).toBe('MOCK-RFND-r1');
  });

  it('charges saved cards successfully by default', async () => {
    const g = new MockGateway();
    const r = await g.chargeSavedCard!({
      cardId: 'card_1',
      amountCents: 100,
      description: 'PO',
      reference: 'pay_1',
      idempotencyKey: 'charge_pay_1',
    });
    expect(r.status).toBe('succeeded');
    expect(r.paymentId).toMatch(/^MOCK-PAY-/);
  });

  it('getCheckoutStatus reports pending by default', async () => {
    const g = new MockGateway();
    expect((await g.getCheckoutStatus!('MOCK-x')).status).toBe('pending');
  });
});
