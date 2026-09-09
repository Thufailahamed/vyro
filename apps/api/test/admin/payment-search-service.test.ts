import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listPayments, getPaymentDetail, getPaymentOptions } from '../../src/modules/admin/payments/paymentSearchService';

const state = vi.hoisted(() => ({
  search: vi.fn(),
  detail: vi.fn(),
  options: vi.fn(),
}));

vi.mock('@vyro/db', () => ({ getDb: (d1: any) => d1 }));

vi.mock('../../src/modules/admin/payments/paymentSearchRepository', () => ({
  searchPayments: (...args: any[]) => state.search(...args),
  getPaymentDetailBundle: (...args: any[]) => state.detail(...args),
  listPaymentOptions: (...args: any[]) => state.options(...args),
}));

describe('listPayments', () => {
  beforeEach(() => {
    state.search.mockClear();
    state.detail.mockClear();
    state.options.mockClear();
  });
  it('parses csv status + clamps limit + returns rows + cursor', async () => {
    state.search.mockResolvedValueOnce({ rows: [{ id: 'p1' }], nextCursor: 'cur' });
    const out = await listPayments({} as any, { status: 'pending,confirmed', limit: '500', sort: 'amount-desc' } as any);
    expect(out.nextCursor).toBe('cur');
    const filters = state.search.mock.calls[0][1];
    expect(filters.status).toEqual(['pending', 'confirmed']);
    expect(filters.limit).toBe(200); // clamped to max
    expect(filters.sort).toBe('amount-desc');
  });

  it('falls back to default sort when invalid', async () => {
    state.search.mockResolvedValueOnce({ rows: [], nextCursor: null });
    await listPayments({} as any, { sort: 'bogus' } as any);
    expect(state.search.mock.calls[0][1].sort).toBe('createdAt-desc');
  });

  it('drops unknown status values from csv', async () => {
    state.search.mockResolvedValueOnce({ rows: [], nextCursor: null });
    await listPayments({} as any, { status: 'pending,unknown,bogus' } as any);
    expect(state.search.mock.calls[0][1].status).toEqual(['pending']);
  });
});

describe('getPaymentDetail', () => {
  it('delegates and returns bundle', async () => {
    state.detail.mockResolvedValueOnce({ payment: { id: 'p1' } });
    const out = await getPaymentDetail({} as any, 'p1');
    expect(out?.payment.id).toBe('p1');
  });

  it('returns null when missing', async () => {
    state.detail.mockResolvedValueOnce(null);
    const out = await getPaymentDetail({} as any, 'x');
    expect(out).toBeNull();
  });
});

describe('getPaymentOptions', () => {
  it('delegates', async () => {
    state.options.mockResolvedValueOnce({ businesses: [{ id: 'b1', name: 'Biz' }], suppliers: [] });
    const out = await getPaymentOptions({} as any);
    expect(out.businesses).toEqual([{ id: 'b1', name: 'Biz' }]);
  });
});
