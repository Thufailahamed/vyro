import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repeatOffers } from '../../src/modules/repeatOffers/service';
import { repeatOffersRepository } from '../../src/modules/repeatOffers/repository';
import {
  REPEAT_OFFER_THRESHOLD_CENTS,
  REPEAT_OFFER_PERCENT,
} from '../../src/modules/repeatOffers/constants';

const NOW = 1_700_000_000_000;
const env = { DB: {} as D1Database } as any;

// Mock @vyro/db so analyticsForSupplier exercises the Drizzle chain end-to-end
// without a real D1 binding. Mirrors Drizzle's QueryPromise semantics: the
// returned builder is awaitable and resolves to a snapshot of `purchaseOrdersRows`.
// Also exposes `.all()` so the production code (after the api-004 fix) can
// terminate the chain explicitly.
const purchaseOrdersRows: any[] = [];
vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => {
      const snapshot = () => purchaseOrdersRows.slice();
      const builder: any = {
        from: () => builder,
        where: () => builder,
        all: async () => snapshot(),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(snapshot()).then(resolve, reject),
        catch: (reject: (e: unknown) => unknown) =>
          Promise.resolve(snapshot()).catch(reject),
        finally: (cb: () => void) => Promise.resolve(snapshot()).finally(cb),
      };
      return builder;
    },
  }),
}));

describe('repeatOffers.computeEligibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns suppliers whose trailing 90d spend >= threshold', async () => {
    vi.spyOn(repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(
      new Map([['supA', REPEAT_OFFER_THRESHOLD_CENTS + 1_000_00]]),
    );
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers).toEqual([{
      supplierId: 'supA',
      percent: REPEAT_OFFER_PERCENT,
      trailingSpendCents: REPEAT_OFFER_THRESHOLD_CENTS + 1_000_00,
      supplierName: '',
    }]);
  });

  it('excludes suppliers below threshold', async () => {
    vi.spyOn(repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(
      new Map([['supA', REPEAT_OFFER_THRESHOLD_CENTS - 1]]),
    );
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers).toEqual([]);
  });

  it('returns multiple qualifying suppliers', async () => {
    vi.spyOn(repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(
      new Map([
        ['supA', REPEAT_OFFER_THRESHOLD_CENTS + 5_000_00],
        ['supB', REPEAT_OFFER_THRESHOLD_CENTS],
        ['supC', REPEAT_OFFER_THRESHOLD_CENTS - 1],
      ]),
    );
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers.map((o) => o.supplierId).sort()).toEqual(['supA', 'supB']);
  });

  it('returns empty when no spend history', async () => {
    vi.spyOn(repeatOffersRepository, 'trailingSpendForBusiness').mockResolvedValue(new Map());
    const offers = await repeatOffers.computeEligibility(env.DB, 'biz1', NOW);
    expect(offers).toEqual([]);
  });
});

describe('repeatOffers.applyForCart', () => {
  const offers = [
    { supplierId: 'supA', percent: 10, trailingSpendCents: 200_000_00 },
  ];

  it('applies 10% to qualifying supplier POs', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supA', subtotalCents: 10_000_00, existingDiscountCents: 0 },
    ]);
    expect(result).toEqual([
      { supplierId: 'supA', discountCents: 1_000_00, percent: 10 },
    ]);
  });

  it('skips POs with existing discount (best-discount-wins)', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supA', subtotalCents: 10_000_00, existingDiscountCents: 500_00 },
    ]);
    expect(result).toEqual([]);
  });

  it('skips POs whose supplier is not in offers', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supB', subtotalCents: 10_000_00, existingDiscountCents: 0 },
    ]);
    expect(result).toEqual([]);
  });

  it('multi-supplier cart: only qualifying suppliers get discount', () => {
    const multiOffers = [
      { supplierId: 'supA', percent: 10, trailingSpendCents: 200_000_00 },
      { supplierId: 'supC', percent: 10, trailingSpendCents: 200_000_00 },
    ];
    const result = repeatOffers.applyForCart('biz1', multiOffers, [
      { supplierId: 'supA', subtotalCents: 10_000_00, existingDiscountCents: 0 },
      { supplierId: 'supB', subtotalCents: 5_000_00, existingDiscountCents: 0 },
      { supplierId: 'supC', subtotalCents: 8_000_00, existingDiscountCents: 0 },
    ]);
    expect(result.map((r) => r.supplierId).sort()).toEqual(['supA', 'supC']);
  });

  it('floors fractional cents', () => {
    const result = repeatOffers.applyForCart('biz1', offers, [
      { supplierId: 'supA', subtotalCents: 199_999, existingDiscountCents: 0 },
    ]);
    expect(result[0]!.discountCents).toBe(19999);
  });
});

describe('repeatOffers.analyticsForSupplier', () => {
  beforeEach(() => {
    purchaseOrdersRows.length = 0;
  });

  it('returns triggeredCount = number of completed POs in trailing 30d (not undefined)', async () => {
    purchaseOrdersRows.push(
      { businessId: 'biz1', completedAt: NOW - 1_000, subtotalCents: 200_000_00 },
      { businessId: 'biz2', completedAt: NOW - 2_000, subtotalCents: 50_000_00 },
    );
    const out = await repeatOffers.analyticsForSupplier(env.DB, 'supA', NOW);
    expect(typeof out.triggeredCount).toBe('number');
    expect(out.triggeredCount).toBe(2);
  });

  it('returns triggeredCount = 0 when no completed POs exist (not undefined)', async () => {
    const out = await repeatOffers.analyticsForSupplier(env.DB, 'supA', NOW);
    expect(out.triggeredCount).toBe(0);
  });

  it('aggregates totalSavingsCents at REPEAT_OFFER_PERCENT', async () => {
    purchaseOrdersRows.push(
      { businessId: 'biz1', completedAt: NOW - 1_000, subtotalCents: 100_000_00 },
      { businessId: 'biz1', completedAt: NOW - 2_000, subtotalCents: 50_000_00 },
    );
    const out = await repeatOffers.analyticsForSupplier(env.DB, 'supA', NOW);
    // 10% of (100k + 50k) = 15k
    expect(out.totalSavingsCents).toBe(15_000_00);
  });

  it('groups byRetailer with trailingSpendCents per businessId', async () => {
    purchaseOrdersRows.push(
      { businessId: 'biz1', completedAt: NOW - 1_000, subtotalCents: 30_000_00 },
      { businessId: 'biz1', completedAt: NOW - 2_000, subtotalCents: 20_000_00 },
      { businessId: 'biz2', completedAt: NOW - 3_000, subtotalCents: 10_000_00 },
    );
    const out = await repeatOffers.analyticsForSupplier(env.DB, 'supA', NOW);
    expect(out.byRetailer).toHaveLength(3);
    const biz1Rows = out.byRetailer.filter((r) => r.businessId === 'biz1');
    expect(biz1Rows).toHaveLength(2);
  });
});
