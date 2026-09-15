import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buyLeadsMatcher } from '../../src/modules/buyLeads/matcher';
import { buyLeadsRepository } from '../../src/modules/buyLeads/repository';

const NOW = 1_700_000_000_000;
const DB = {} as D1Database;

describe('buyLeadsMatcher.topMatchesForSupplier', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns empty when subscription disabled', async () => {
    vi.spyOn(buyLeadsRepository, 'getSubscription').mockResolvedValue({
      supplierId: 'supA',
      enabled: false,
      categoryIds: ['cat1'],
    });
    const result = await buyLeadsMatcher.topMatchesForSupplier(DB, 'supA', NOW, 10);
    expect(result).toEqual([]);
  });

  it('returns empty when no category IDs', async () => {
    vi.spyOn(buyLeadsRepository, 'getSubscription').mockResolvedValue({
      supplierId: 'supA',
      enabled: true,
      categoryIds: [],
    });
    const result = await buyLeadsMatcher.topMatchesForSupplier(DB, 'supA', NOW, 10);
    expect(result).toEqual([]);
  });

  it('returns empty when no subscription row', async () => {
    vi.spyOn(buyLeadsRepository, 'getSubscription').mockResolvedValue(null);
    const result = await buyLeadsMatcher.topMatchesForSupplier(DB, 'supA', NOW, 10);
    expect(result).toEqual([]);
  });

  it('returns matched RFQs (limit N)', async () => {
    vi.spyOn(buyLeadsRepository, 'getSubscription').mockResolvedValue({
      supplierId: 'supA',
      enabled: true,
      categoryIds: ['cat1'],
    });
    const newMatchingSpy = vi
      .spyOn(buyLeadsRepository, 'newRfqsMatchingCategories')
      .mockResolvedValue([
        { rfqId: 'rfq1', rfqNumber: 'RFQ-001', title: 'Need 100kg rice', createdAt: NOW - 1000 },
      ]);
    const result = await buyLeadsMatcher.topMatchesForSupplier(DB, 'supA', NOW, 10);
    expect(result).toHaveLength(1);
    expect(result[0].rfqId).toBe('rfq1');
    expect(newMatchingSpy).toHaveBeenCalledWith(DB, ['cat1'], NOW, 10);
  });
});
