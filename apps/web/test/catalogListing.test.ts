import { describe, expect, it } from 'vitest';
import {
  existingOfferForProduct,
  listedOfferByProductId,
  productOptionsFromOffers,
} from '../src/supplier/catalogListing';

const offers = [
  { id: 'sp-1', productId: 'p-sugar-1kg' },
  { id: 'sp-2', productId: 'p-rice-5kg' },
];

describe('listedOfferByProductId', () => {
  it('maps catalog products this supplier already lists', () => {
    const map = listedOfferByProductId(offers);
    expect(map.get('p-sugar-1kg')).toBe('sp-1');
    expect(map.get('p-rice-5kg')).toBe('sp-2');
    expect(map.has('p-unknown')).toBe(false);
  });
});

describe('existingOfferForProduct', () => {
  it('returns the offer when this supplier already lists the SKU', () => {
    expect(existingOfferForProduct(offers, 'p-rice-5kg')?.id).toBe('sp-2');
  });

  it('returns undefined when the SKU is unlisted', () => {
    expect(existingOfferForProduct(offers, 'p-tea')).toBeUndefined();
  });
});

describe('productOptionsFromOffers', () => {
  it('returns only products the supplier actively lists', () => {
    const options = productOptionsFromOffers(
      [
        { productId: 'p-rice', active: true, deletedAt: null },
        { productId: 'p-sugar', active: false, deletedAt: null },
        { productId: 'p-tea', active: true, deletedAt: 123 },
        { productId: 'p-dhal', active: true, deletedAt: null },
      ],
      [
        { id: 'p-rice', name: 'Rice 5kg' },
        { id: 'p-sugar', name: 'Sugar 1kg' },
        { id: 'p-tea', name: 'Tea 100g' },
        { id: 'p-dhal', name: 'Dhal 1kg' },
        { id: 'p-flour', name: 'Flour 1kg' },
      ],
    );
    expect(options).toEqual([
      { id: 'p-rice', name: 'Rice 5kg' },
      { id: 'p-dhal', name: 'Dhal 1kg' },
    ]);
  });
});
