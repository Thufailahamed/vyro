import { describe, expect, it } from 'vitest';
import { checkPurchasable, deriveAvailability, availableQty } from '../src/lib/inventory';

describe('availableQty', () => {
  it('returns 0 when nothing in stock', () => {
    expect(availableQty({ stockQty: 0, reservedQty: 0 })).toBe(0);
  });
  it('subtracts reserved', () => {
    expect(availableQty({ stockQty: 10, reservedQty: 3 })).toBe(7);
  });
  it('never goes negative when reserved exceeds stock', () => {
    expect(availableQty({ stockQty: 2, reservedQty: 9 })).toBe(0);
  });
  it('treats undefined as 0', () => {
    expect(availableQty({ stockQty: undefined, reservedQty: undefined })).toBe(0);
  });
});

describe('deriveAvailability', () => {
  const base = { availabilityStatus: 'in_stock' as const, lowStockThreshold: 0, trackInventory: true };

  it('OUT_OF_STOCK when free is 0 and tracking enabled', () => {
    expect(deriveAvailability({ ...base, stockQty: 0, reservedQty: 0 })).toBe('out_of_stock');
  });
  it('LOW when free is at or below threshold', () => {
    expect(deriveAvailability({ ...base, stockQty: 5, reservedQty: 0, lowStockThreshold: 5 })).toBe('low');
    expect(deriveAvailability({ ...base, stockQty: 5, reservedQty: 4, lowStockThreshold: 1 })).toBe('low');
  });
  it('IN_STOCK when free > threshold', () => {
    expect(deriveAvailability({ ...base, stockQty: 10, reservedQty: 1, lowStockThreshold: 2 })).toBe('in_stock');
  });
  it('uses static status when tracking disabled', () => {
    expect(
      deriveAvailability({
        availabilityStatus: 'low',
        lowStockThreshold: 0,
        trackInventory: false,
        stockQty: 0,
        reservedQty: 0,
      }),
    ).toBe('low');
  });
});

describe('checkPurchasable', () => {
  const offer = { stockQty: 10, reservedQty: 2, trackInventory: true, lowStockThreshold: 1, minOrderQty: 5 };

  it('ok when everything fits', () => {
    const r = checkPurchasable(offer, 5);
    expect(r.ok).toBe(true);
  });
  it('rejects below MOQ', () => {
    const r = checkPurchasable(offer, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('BELOW_MOQ');
      expect(r.minOrderQty).toBe(5);
    }
  });
  it('rejects insufficient stock', () => {
    const r = checkPurchasable(offer, 9); // only 8 free
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('INSUFFICIENT_STOCK');
      expect(r.available).toBe(8);
    }
  });
  it('rejects out of stock when nothing tracked', () => {
    const r = checkPurchasable({ ...offer, stockQty: 0, reservedQty: 0 }, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('OUT_OF_STOCK');
  });
  it('ignores stock when tracking disabled (MOQ still enforced)', () => {
    const r = checkPurchasable({ ...offer, trackInventory: false, stockQty: 0, reservedQty: 0 }, 5);
    expect(r.ok).toBe(true);
  });
});
