import { describe, expect, it } from 'vitest';
import { trustRepository } from '../../src/modules/trust/repository';

describe('trust repository shape', () => {
  it('exports upsert', () => {
    expect(typeof trustRepository.upsert).toBe('function');
  });
  it('exports getBySupplierId', () => {
    expect(typeof trustRepository.getBySupplierId).toBe('function');
  });
  it('exports listAllSupplierIds', () => {
    expect(typeof trustRepository.listAllSupplierIds).toBe('function');
  });
});
