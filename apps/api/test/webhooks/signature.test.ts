import { describe, expect, it } from 'vitest';
import { buildPaymentsSignatureHeader, verifyPaymentsSignature, hmacSha256Sync } from '@vyro/payments';

describe('payments.lk signature header format', () => {
  it('is "t=<unix>,v1=<hmac-sha256(t.body)>" and verifies round-trip', () => {
    const secret = 'whsec_doc';
    const raw = '{"type":"payment.succeeded","data":{"reference":"pay_1","amountCents":350000}}';
    const header = buildPaymentsSignatureHeader(secret, raw, 1726400000);
    expect(header).toMatch(/^t=1726400000,v1=[0-9a-f]{64}$/);
    // Fixed historical timestamp: verify with a widened tolerance.
    expect(verifyPaymentsSignature(secret, raw, header, 10 * 365 * 24 * 3600)).toBe(true);
    const expected = hmacSha256Sync(secret, `1726400000.${raw}`);
    expect(header).toBe(`t=1726400000,v1=${expected}`);
  });

  it('verifies round-trip at the current time', () => {
    const secret = 'whsec_doc';
    const raw = '{"type":"payment.succeeded"}';
    const header = buildPaymentsSignatureHeader(secret, raw);
    expect(verifyPaymentsSignature(secret, raw, header)).toBe(true);
  });

  it('fails verification when the body changes or t drifts outside tolerance', () => {
    const secret = 'whsec_doc';
    const raw = '{"type":"payment.succeeded"}';
    const header = buildPaymentsSignatureHeader(secret, raw);
    expect(verifyPaymentsSignature(secret, raw + ' ', header)).toBe(false);
    const stale = buildPaymentsSignatureHeader(secret, raw, Math.floor(Date.now() / 1000) - 400);
    expect(verifyPaymentsSignature(secret, raw, stale)).toBe(false);
  });
});
