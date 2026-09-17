import { api } from './api';

export interface TrustSignalView {
  kyc: boolean;
  memberSinceYear: number | null;
  onTimePct: number | null;
  onTimeSampleSize: number;
  disputeFree: boolean;
  lastComputedAt: number | null;
}

export const trustApi = {
  async getSupplierTrustSignals(supplierId: string): Promise<{ raw: unknown; view: TrustSignalView; flagEnabled: boolean }> {
    return api.get(`/admin/trust/signals/${encodeURIComponent(supplierId)}`);
  },
  async recomputeSupplierTrustSignals(supplierId: string): Promise<{ ok: true; view: TrustSignalView }> {
    return api.post(`/admin/trust/signals/${encodeURIComponent(supplierId)}/recompute`, {});
  },
};
