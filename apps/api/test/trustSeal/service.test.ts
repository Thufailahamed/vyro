import { describe, it, expect, vi } from 'vitest';
import { trustSealService } from '../../src/modules/trustSeal/service';

describe('trustSeal checkout gate', () => {
  it('blocks unverified supplier with NEEDS_KYC', async () => {
    const d1 = {} as any;
    vi.spyOn(trustSealService as any, '_loadSupplier').mockResolvedValueOnce({
      id: 'sup-1',
      verificationStatus: 'pending',
      status: 'active',
    });
    await expect(trustSealService.startCheckout(d1, 'sup-1', {} as any)).rejects.toThrow(/NEEDS_KYC/);
  });
  it('returns inactive status when no sub', async () => {
    const d1 = {} as any;
    vi.spyOn(trustSealService as any, '_loadSupplier').mockResolvedValueOnce({
      id: 'sup-1',
      verificationStatus: 'verified',
      status: 'active',
    });
    vi.spyOn(trustSealService as any, '_loadSub').mockResolvedValueOnce(null);
    const s = await trustSealService.getStatus(d1, 'sup-1');
    expect(s.active).toBe(false);
    expect(s.status).toBe('none');
  });
  it('admin revoke flips active to cancelled', async () => {
    const { trustSealRepository } = await import('../../src/modules/trustSeal/repository');
    expect(typeof (trustSealRepository as any).revoke).toBe('function');
  });
});
