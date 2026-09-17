import { describe, expect, it } from 'vitest';
import * as svc from '../../src/modules/trust/service';

describe('trust service shape', () => {
  it('exports recomputeForSupplier', () => {
    expect(typeof svc.recomputeForSupplier).toBe('function');
  });
  it('exports recomputeAllSuppliers', () => {
    expect(typeof svc.recomputeAllSuppliers).toBe('function');
  });
  it('exports getTrustSignalView', () => {
    expect(typeof svc.getTrustSignalView).toBe('function');
  });
});
