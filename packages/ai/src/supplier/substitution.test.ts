import { describe, it, expect } from 'vitest';
import { findCatalogMatch } from './substitution';
import type { SolverCatalogOffer, SolverRfqItem } from './types';

const catalog: SolverCatalogOffer[] = [
  {
    supplierProductId: 'sp-1',
    productId: 'p-1',
    name: 'Samba Rice 50kg bag',
    category: 'Grains & Rice',
    basePriceCents: 12000,
    availabilityStatus: 'in_stock',
    deliveryAvailable: true,
  },
  {
    supplierProductId: 'sp-2',
    productId: 'p-2',
    name: 'Nadu Rice 50kg bag',
    category: 'Grains & Rice',
    basePriceCents: 10500,
    availabilityStatus: 'out_of_stock',
    deliveryAvailable: true,
  },
  {
    supplierProductId: 'sp-3',
    productId: 'p-3',
    name: 'White Sugar 50kg',
    category: 'Sugar & Sweeteners',
    basePriceCents: 14000,
    availabilityStatus: 'in_stock',
    deliveryAvailable: true,
  },
];

describe('findCatalogMatch', () => {
  it('returns exact match by productId when in stock', () => {
    const item: SolverRfqItem = {
      id: 'item-1',
      productId: 'p-1',
      description: 'Samba Rice 50kg',
      quantity: 10,
      unit: 'bag',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('exact');
    expect(res.offer?.productId).toBe('p-1');
    expect(res.isAlternative).toBe(false);
  });

  it('suggests in-stock alternative in same category when exact item is out of stock', () => {
    const item: SolverRfqItem = {
      id: 'item-2',
      productId: 'p-2',
      description: 'Nadu Rice 50kg',
      quantity: 20,
      unit: 'bag',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('substitute');
    expect(res.offer?.productId).toBe('p-1'); // Samba Rice in same category
    expect(res.isAlternative).toBe(true);
  });

  it('matches fuzzy description when productId is not provided', () => {
    const item: SolverRfqItem = {
      id: 'item-3',
      description: 'Sugar white 50kg bags',
      quantity: 5,
      unit: 'bag',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('fuzzy');
    expect(res.offer?.productId).toBe('p-3');
    expect(res.isAlternative).toBe(false);
  });

  it('returns unmatched when no category or keyword matches exist', () => {
    const item: SolverRfqItem = {
      id: 'item-4',
      description: 'Motor Oil 5W30 4L',
      quantity: 1,
      unit: 'tin',
    };
    const res = findCatalogMatch(item, catalog, true);
    expect(res.matchType).toBe('unmatched');
    expect(res.offer).toBeUndefined();
  });
});
