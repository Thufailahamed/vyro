import { describe, it, expect } from 'vitest';
import { buildCartLineHints, type CartHintLine } from '../../../src/modules/ai/cartHints';

describe('buildCartLineHints', () => {
  const repos = {
    listOffersByProduct: async (productId: string) => {
      if (productId === 'p1') {
        return [
          { priceCents: 10000, leadTimeDays: 2, availabilityStatus: 'in_stock', supplier: { id: 's1', name: 'CurrentMill' } },
          { priceCents: 8500, leadTimeDays: 3, availabilityStatus: 'in_stock', supplier: { id: 's2', name: 'AltMill' } },
        ];
      }
      if (productId === 'p2') {
        return [
          { priceCents: 5000, leadTimeDays: 1, availabilityStatus: 'in_stock', supplier: { id: 's3', name: 'OnlySupplier' } },
        ];
      }
      return [];
    },
  };

  it('returns empty when cart is empty', async () => {
    expect(await buildCartLineHints(repos, [])).toEqual([]);
  });

  it('emits one chip per line where a cheaper live alt exists', async () => {
    const cart: CartHintLine[] = [
      { cartItemId: 'c1', productId: 'p1', productName: 'Samba Rice', quantity: 10, priceCents: 10000, supplierName: 'CurrentMill' },
      { cartItemId: 'c2', productId: 'p2', productName: 'Coconut Oil', quantity: 5, priceCents: 5000, supplierName: 'OnlySupplier' },
    ];
    const hints = await buildCartLineHints(repos, cart);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      cartItemId: 'c1',
      productName: 'Samba Rice',
      cheaperSupplierName: 'AltMill',
      currentPriceCents: 10000,
      altPriceCents: 8500,
      savingCents: (10000 - 8500) * 10,
    });
  });

  it('skips lines where no cheaper alt exists', async () => {
    const cart: CartHintLine[] = [
      { cartItemId: 'c2', productId: 'p2', productName: 'Coconut Oil', quantity: 5, priceCents: 5000, supplierName: 'OnlySupplier' },
    ];
    expect(await buildCartLineHints(repos, cart)).toEqual([]);
  });

  it('skips same-supplier offers even if cheaper in their own list', async () => {
    const sameRepos = {
      listOffersByProduct: async () => [
        { priceCents: 8000, leadTimeDays: 2, availabilityStatus: 'in_stock', supplier: { id: 's1', name: 'CurrentMill' } },
      ],
    };
    const cart: CartHintLine[] = [
      { cartItemId: 'c1', productId: 'p1', productName: 'Samba Rice', quantity: 10, priceCents: 10000, supplierName: 'CurrentMill' },
    ];
    expect(await buildCartLineHints(sameRepos, cart)).toEqual([]);
  });

  it('ignores out-of-stock alts', async () => {
    const oosRepos = {
      listOffersByProduct: async () => [
        { priceCents: 9000, leadTimeDays: 2, availabilityStatus: 'in_stock', supplier: { id: 's1', name: 'CurrentMill' } },
        { priceCents: 8000, leadTimeDays: 3, availabilityStatus: 'out_of_stock', supplier: { id: 's2', name: 'AltMill' } },
      ],
    };
    const cart: CartHintLine[] = [
      { cartItemId: 'c1', productId: 'p1', productName: 'Samba Rice', quantity: 10, priceCents: 9000, supplierName: 'CurrentMill' },
    ];
    expect(await buildCartLineHints(oosRepos, cart)).toEqual([]);
  });
});
