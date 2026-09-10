import { describe, expect, it } from 'vitest';
import { createSupplierProductSchema, updateSupplierProductSchema } from './supplierProduct';

describe('tier ordering', () => {
  it('rejects tier2 min below tier1 min', () => {
    const r = createSupplierProductSchema.safeParse({
      supplierId: 's',
      productId: 'p',
      priceCents: 1000,
      tier1MinQty: 50,
      tier1DiscountPct: 5,
      tier2MinQty: 10,
      tier2DiscountPct: 10,
    });
    expect(r.success).toBe(false);
  });
  it('rejects shrinking discounts', () => {
    const r = createSupplierProductSchema.safeParse({
      supplierId: 's',
      productId: 'p',
      priceCents: 1000,
      tier1MinQty: 10,
      tier1DiscountPct: 10,
      tier2MinQty: 50,
      tier2DiscountPct: 5,
    });
    expect(r.success).toBe(false);
  });
  it('accepts monotonic tiers', () => {
    const r = createSupplierProductSchema.safeParse({
      supplierId: 's',
      productId: 'p',
      priceCents: 1000,
      tier1MinQty: 10,
      tier1DiscountPct: 5,
      tier2MinQty: 50,
      tier2DiscountPct: 10,
      tier3MinQty: 100,
      tier3DiscountPct: 15,
    });
    expect(r.success).toBe(true);
  });
  it('rejects shrinking discounts on update', () => {
    const r = updateSupplierProductSchema.safeParse({
      tier1MinQty: 10,
      tier1DiscountPct: 10,
      tier2MinQty: 50,
      tier2DiscountPct: 5,
    });
    expect(r.success).toBe(false);
  });
});
