import { describe, expect, it } from 'vitest';
import {
  existingOfferForProduct,
  listedOfferByProductId,
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
