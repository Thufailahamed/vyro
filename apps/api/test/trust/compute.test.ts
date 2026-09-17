import { describe, expect, it } from 'vitest';
import { computeTrustSignal, sampleGateMeetsOnTimeBadge, isDisputeFree } from '../../src/modules/trust/compute';

describe('computeTrustSignal — pure math', () => {
  it('on-time pct = onTimeCount / totalCompletedPos', () => {
    const out = computeTrustSignal({
      supplierCreatedAt: Date.UTC(2024, 0, 15),
      kycVerified: true,
      totalCompletedPos: 10,
      onTimeCount: 9,
      disputedSupplierFaultCount90d: 0,
      now: Date.UTC(2026, 8, 17),
    });
    expect(out.kycVerified).toBe(1);
    expect(out.onTimePctCached).toBeCloseTo(0.9, 5);
    expect(out.memberSinceYear).toBe(2024);
    expect(out.disputedSupplierFaultCount).toBe(0);
  });

  it('on-time pct is null when sample = 0', () => {
    const out = computeTrustSignal({
      supplierCreatedAt: Date.UTC(2025, 0, 1),
      kycVerified: true,
      totalCompletedPos: 0,
      onTimeCount: 0,
      disputedSupplierFaultCount90d: 0,
      now: Date.UTC(2026, 8, 17),
    });
    expect(out.onTimePctCached).toBeNull();
  });

  it('kycVerified flag is 0 or 1', () => {
    const off = computeTrustSignal({
      supplierCreatedAt: null,
      kycVerified: false,
      totalCompletedPos: 0,
      onTimeCount: 0,
      disputedSupplierFaultCount90d: 0,
      now: 0,
    });
    expect(off.kycVerified).toBe(0);
    expect(off.memberSinceYear).toBeNull();
  });

  it('preserves disputedSupplierFaultCount verbatim', () => {
    const out = computeTrustSignal({
      supplierCreatedAt: Date.UTC(2024, 0, 1),
      kycVerified: true,
      totalCompletedPos: 5,
      onTimeCount: 5,
      disputedSupplierFaultCount90d: 2,
      now: Date.UTC(2026, 8, 17),
    });
    expect(out.disputedSupplierFaultCount).toBe(2);
  });
});

describe('sample gates + helpers', () => {
  it('meets on-time sample gate at >=5', () => {
    expect(sampleGateMeetsOnTimeBadge(5)).toBe(true);
    expect(sampleGateMeetsOnTimeBadge(4)).toBe(false);
  });
  it('dispute-free = 0 supplier-fault count', () => {
    expect(isDisputeFree(0)).toBe(true);
    expect(isDisputeFree(1)).toBe(false);
  });
});
