import { describe, expect, it } from 'vitest';
import * as repo from '../../src/modules/storefront/repository';

describe('storefront repository', () => {
  it('exports findBySlug', () => expect(typeof repo.findBySlug).toBe('function'));
  it('exports listPublishedOffersBySupplierId', () => expect(typeof repo.listPublishedOffersBySupplierId).toBe('function'));
  it('exports updateSupplierSlug', () => expect(typeof repo.updateSupplierSlug).toBe('function'));
  it('exports existingSlugsStartingWith', () => expect(typeof repo.existingSlugsStartingWith).toBe('function'));
});
