import { describe, expect, it } from 'vitest';
import { getSupplierTenure } from '../../src/modules/storefront/service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('getSupplierTenure', () => {
  it('derives year, ISO date, and floor years', () => {
    const createdAt = new Date('2021-06-15T00:00:00Z').getTime();
    const now = new Date('2026-09-15T00:00:00Z').getTime();
    const out = getSupplierTenure(createdAt, now);
    expect(out.supplierSinceYear).toBe(2021);
    expect(out.supplierSinceDate).toBe(new Date(createdAt).toISOString());
    expect(out.supplierMemberYears).toBe(Math.floor((now - createdAt) / (365 * DAY_MS)));
  });
  it('returns nulls for null input', () => {
    expect(getSupplierTenure(null, 1000)).toEqual({
      supplierSinceYear: null,
      supplierSinceDate: null,
      supplierMemberYears: null,
    });
  });
  it('returns nulls for future createdAt', () => {
    expect(getSupplierTenure(2000, 1000)).toEqual({
      supplierSinceYear: null,
      supplierSinceDate: null,
      supplierMemberYears: null,
    });
  });
  it('clamps same-day tenure to 0 years (not negative)', () => {
    const now = new Date('2026-09-15T00:00:00Z').getTime();
    const out = getSupplierTenure(now, now);
    expect(out.supplierSinceYear).toBe(2026);
    expect(out.supplierMemberYears).toBe(0);
  });
});
