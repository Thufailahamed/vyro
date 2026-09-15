import { describe, it, expect } from 'vitest';
import { isVerifiedBuyer } from '../src/lib/buyerVerification';

describe('isVerifiedBuyer', () => {
  it('returns true only when level is not none and verifiedAt is set', () => {
    expect(isVerifiedBuyer({ kycLevel: 'basic', kycVerifiedAt: 1700000000000 })).toBe(true);
    expect(isVerifiedBuyer({ kycLevel: 'enhanced', kycVerifiedAt: 1700000000000 })).toBe(true);
    expect(isVerifiedBuyer({ kycLevel: 'none', kycVerifiedAt: 1700000000000 })).toBe(false);
    expect(isVerifiedBuyer({ kycLevel: 'basic', kycVerifiedAt: null })).toBe(false);
    expect(isVerifiedBuyer({ kycLevel: null, kycVerifiedAt: null })).toBe(false);
  });
});
