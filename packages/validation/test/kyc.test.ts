import { describe, expect, it } from 'vitest';
import { sellerKycSubmitBody } from '../src/kyc';

describe('sellerKycSubmitBody', () => {
  it('accepts minimal submit', () => {
    expect(sellerKycSubmitBody.safeParse({ supplierId: 's-1' }).success).toBe(true);
  });
  it('rejects empty supplierId', () => {
    expect(sellerKycSubmitBody.safeParse({ supplierId: '' }).success).toBe(false);
  });
  it('rejects oversized documentsJson', () => {
    expect(sellerKycSubmitBody.safeParse({ supplierId: 's-1', documentsJson: 'x'.repeat(8001) }).success).toBe(false);
  });
});
