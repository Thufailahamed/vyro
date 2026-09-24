import { describe, it, expect, vi } from 'vitest';

const prepare = vi.fn();
const bind = vi.fn();
const first = vi.fn();

const supplierRow = {
  id: 'sup-1',
  createdAt: 0,
  verificationStatus: 'verified',
};

// getDb mock — returns a fake drizzle db that resolves to our supplier row.
vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => supplierRow,
        }),
      }),
    }),
  }),
}));

// Import after mocks so module init picks them up.
import { loadSupplierFacts } from '../../../src/modules/trust/service';

describe('loadSupplierFacts', () => {
  it('applies LIMIT 30 inside a subquery so trailing-30 deliveries are aggregated', async () => {
    // First call: deliveries aggregate — return 25 total, 22 on_time.
    // Second call: dispute count — return 0.
    first
      .mockResolvedValueOnce({ total: 25, on_time: 22 })
      .mockResolvedValueOnce({ n: 0 });

    bind
      .mockReturnValueOnce({ first })
      .mockReturnValueOnce({ first });

    prepare.mockImplementation(() => ({ bind }) as unknown as D1PreparedStatement);

    const fakeD1 = { prepare } as unknown as D1Database;
    const facts = await loadSupplierFacts(fakeD1, 'sup-1', Date.UTC(2026, 8, 24));

    // prepare should have been called twice (deliveries + disputes).
    expect(prepare).toHaveBeenCalledTimes(2);

    // The first prepare call (deliveries aggregate) must wrap the inner query
    // in a subquery so LIMIT 30 is applied BEFORE count/sum aggregate.
    const deliverySql = (prepare.mock.calls[0] as unknown as [string])[0];
    expect(deliverySql).toMatch(/FROM\s*\(\s*SELECT[\s\S]*ORDER BY delivered_at DESC[\s\S]*LIMIT\s*\?2/i);
    // Sanity: outer SELECT still does count + sum.
    expect(deliverySql).toMatch(/count\(\*\)/i);
    expect(deliverySql).toMatch(/sum\(case/i);

    // bind should have been called with (supplierId, 30) for deliveries, and
    // (supplierId, cutoffSec) for disputes.
    expect((bind as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['sup-1', 30]);

    // Returned facts match the row shape.
    expect(facts).toEqual({
      supplier: supplierRow,
      totalCompletedPos: 25,
      onTimeCount: 22,
      disputedSupplierFaultCount: 0,
    });
  });
});