import type { TrustSignalInput } from './repository';

export interface ComputeInput {
  supplierCreatedAt: number | null;
  kycVerified: boolean;
  totalCompletedPos: number;
  onTimeCount: number;
  disputedSupplierFaultCount90d: number;
  now: number;
}

export function computeTrustSignal(input: ComputeInput): TrustSignalInput {
  return {
    supplierId: '', // caller fills in
    kycVerified: input.kycVerified ? 1 : 0,
    memberSinceYear:
      input.supplierCreatedAt == null
        ? null
        : new Date(input.supplierCreatedAt).getUTCFullYear(),
    totalCompletedPos: input.totalCompletedPos,
    onTimeCount: input.onTimeCount,
    onTimePctCached:
      input.totalCompletedPos > 0 ? input.onTimeCount / input.totalCompletedPos : null,
    disputedSupplierFaultCount: input.disputedSupplierFaultCount90d,
    computedAt: Math.floor(input.now / 1000),
  };
}

export function sampleGateMeetsOnTimeBadge(totalCompletedPos: number, minSample = 5): boolean {
  return totalCompletedPos >= minSample;
}

export function isDisputeFree(disputedSupplierFaultCount: number): boolean {
  return disputedSupplierFaultCount === 0;
}
