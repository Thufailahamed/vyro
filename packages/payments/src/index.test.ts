import { describe, expect, it } from 'vitest';
import { GatewayConfigError, MockGateway, resolveGateway } from './index';
import { md5 } from './hash';

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

  it('returns mock when PAYHERE_MOCK=1 even with creds', () => {
    const r = resolveGateway({
      ENVIRONMENT: 'local',
      PAYHERE_MOCK: '1',
      PAYHERE_MERCHANT_ID: '1',
      PAYHERE_MERCHANT_SECRET: 's',
    });
    expect(r.isMock).toBe(true);
  });

  it('returns payhere when creds present and prod', () => {
    const r = resolveGateway({
      ENVIRONMENT: 'production',
      PAYHERE_MERCHANT_ID: '123',
      PAYHERE_MERCHANT_SECRET: 'sec',
    });
    expect(r.isMock).toBe(false);
    expect(r.provider).toBe('payhere');
  });

  it('GatewayConfigError carries 500 status', () => {
    const e = new GatewayConfigError('x');
    expect(e.status).toBe(500);
  });
});

describe('MockGateway.verifySignature', () => {
  it('accepts null signature only when no secret configured (dev)', () => {
    const g = new MockGateway();
    expect(g.verifySignature('foo=bar', null)).toBe(true);
    expect(g.verifySignature('foo=bar', 'spoof')).toBe(false);
  });

  it('enforces HMAC when secret is configured', () => {
    const secret = 'TEST_SECRET';
    const g = new MockGateway({ secret });
    const body =
      'merchant_id=1&order_id=PO-1&payhere_amount=100.00&payhere_currency=LKR&type=payment.success';
    const sig = md5(`1PO-1100.00LKRpayment.success${md5(secret).toUpperCase()}`);
    expect(g.verifySignature(body, sig)).toBe(true);
    expect(g.verifySignature(body, 'WRONG')).toBe(false);
    expect(g.verifySignature(body, null)).toBe(false);
  });
});
