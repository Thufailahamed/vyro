import { describe, it, expect } from 'vitest';
import { isTrustSealed, memberSinceYear } from '@vyro/shared';

describe('isTrustSealed', () => {
  const now = 1_700_000_000_000;
  it('active + verified + future expiry = true', () => {
    expect(
      isTrustSealed(
        { verificationStatus: 'verified', status: 'active' },
        { status: 'active', expiresAt: now + 1000 },
        now,
      ),
    ).toBe(true);
  });
  it('expired = false', () => {
    expect(
      isTrustSealed(
        { verificationStatus: 'verified', status: 'active' },
        { status: 'active', expiresAt: now - 1 },
        now,
      ),
    ).toBe(false);
  });
  it('unverified KYC = false even if sub active', () => {
    expect(
      isTrustSealed(
        { verificationStatus: 'pending', status: 'active' },
        { status: 'active', expiresAt: now + 1000 },
        now,
      ),
    ).toBe(false);
  });
  it('suspended supplier = false', () => {
    expect(
      isTrustSealed(
        { verificationStatus: 'verified', status: 'suspended' },
        { status: 'active', expiresAt: now + 1000 },
        now,
      ),
    ).toBe(false);
  });
  it('memberSinceYear extracts year', () => {
    expect(memberSinceYear(new Date('2024-03-10T00:00:00Z').getTime())).toBe(2024);
  });
});
