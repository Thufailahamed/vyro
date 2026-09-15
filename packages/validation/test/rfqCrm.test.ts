import { describe, it, expect } from 'vitest';
import { leadRowSchema } from '../src/rfqCrm';

describe('leadRowSchema buyer verification', () => {
  it('parses enriched row with verified buyer', () => {
    const row = {
      id: 'l1', rfqId: 'r1', supplierId: 's1', status: 'invited', invitedAt: 1,
      tag: null, conversionStatus: null, quotedAt: null, orderId: null, orderValueCents: null,
      buyerBusinessId: 'b1', buyerName: 'Acme', buyerKycLevel: 'basic',
      buyerVerifiedAt: 1700000000000, buyerVerified: true,
    };
    expect(leadRowSchema.parse(row).buyerVerified).toBe(true);
  });

  it('rejects rows missing buyer verification fields', () => {
    const row = {
      id: 'l1', rfqId: 'r1', supplierId: 's1', status: 'invited', invitedAt: 1,
      tag: null, conversionStatus: null, quotedAt: null, orderId: null, orderValueCents: null,
    };
    expect(() => leadRowSchema.parse(row)).toThrow();
  });
});
