import type { RfqMatch } from './repository';
import { buyLeadsRepository } from './repository';

export const buyLeadsMatcher = {
  async topMatchesForSupplier(
    d1: D1Database,
    supplierId: string,
    sinceMs: number,
    limit: number,
  ): Promise<RfqMatch[]> {
    const sub = await buyLeadsRepository.getSubscription(d1, supplierId);
    if (!sub?.enabled || sub.categoryIds.length === 0) return [];
    return buyLeadsRepository.newRfqsMatchingCategories(d1, sub.categoryIds, sinceMs, limit);
  },
};
