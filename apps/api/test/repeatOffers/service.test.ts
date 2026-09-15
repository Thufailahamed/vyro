import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repeatOffers } from '../../src/modules/repeatOffers/service';
import { repeatOffersRepository } from '../../src/modules/repeatOffers/repository';
import {
  REPEAT_OFFER_THRESHOLD_CENTS,
  REPEAT_OFFER_PERCENT,
} from '../../src/modules/repeatOffers/constants';

const NOW = 1_700_000_000_000;
const env = { DB: {} as D1Database } as any;

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
