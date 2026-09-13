import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type RefundRow = {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed';
  requestedByUserId: string;
  createdAt: number;
};

export type PayoutBatchRow = {
  id: string;
  createdBy: string;
  approvedBy: string | null;
  status: 'pending' | 'approved' | 'rejected';
  totalCents: number;
  note: string | null;
  createdAt: number;
  approvedAt: number | null;
};

export type PayoutRow = {
  id: string;
  batchId: string | null;
  supplierId: string;
  amountCents: number;
  netCents: number;
  status: string;
  periodStart: number;
  periodEnd: number;
};

export type LedgerSummary = {
  totalCreditCents: number;
  totalDebitCents: number;
  netCents: number;
  byAccountType: Array<{ accountType: string; creditCents: number; debitCents: number }>;
  byRefType: Array<{ refType: string; creditCents: number; debitCents: number }>;
  from: number | null;
  to: number | null;
};

export type ChargebackRow = {
  id: string;
  paymentId: string;
  reason: string;
  status: 'open' | 'resolved' | 'cancelled';
  resolvedBy: string | null;
  resolvedAt: number | null;
  refundId: string | null;
  notes: string | null;
  createdAt: number;
};

export function useRefundQueue() {
  return useQuery({
    queryKey: ['admin-refund-queue'],
    queryFn: async () => {
      const r = await api.get<{ items: RefundRow[]; nextCursor: string | null }>(
        '/admin/refunds/queue',
      );
      return r.items;
    },
  });
}

export function useApproveRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<RefundRow>(`/admin/refunds/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-refund-queue'] }),
  });
}

export function useRejectRefund() {
  const qc = useQueryClient();
  return useMutation({
    // The API requires a non-empty rejection reason (adminRefundRejectBody).
    mutationFn: async (vars: { id: string; reason: string }) =>
      api.post<RefundRow>(`/admin/refunds/${vars.id}/reject`, { reason: vars.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-refund-queue'] }),
  });
}

export function usePayoutBatchQueue() {
  return useQuery({
    queryKey: ['admin-payout-batch-queue'],
    queryFn: async () => {
      const r = await api.get<{ items: PayoutBatchRow[]; nextCursor: string | null }>(
        '/admin/payout-batches/queue',
      );
      return r.items;
    },
  });
}

export function useCreatePayoutBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { note?: string; supplierIds?: string[] }) =>
      api.post<PayoutBatchRow>('/admin/payout-batches/batch', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-payout-batch-queue'] }),
  });
}

export function useApprovePayoutBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<PayoutBatchRow>(`/admin/payout-batches/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-payout-batch-queue'] }),
  });
}

export function useLedgerSummary(opts: { from?: number | undefined; to?: number | undefined }) {
  return useQuery({
    queryKey: ['admin-ledger-summary', opts],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (opts.from) qs.set('from', String(opts.from));
      if (opts.to) qs.set('to', String(opts.to));
      return (await api.get<LedgerSummary>(`/admin/ledger/summary?${qs}`)) as LedgerSummary;
    },
  });
}

export function useOpenChargebacks() {
  return useQuery({
    queryKey: ['admin-chargebacks-open'],
    queryFn: async () => (await api.get<ChargebackRow[]>('/admin/chargebacks')) as ChargebackRow[],
  });
}

export function useResolveChargeback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { id: string; notes?: string; refundId?: string }) =>
      api.post<ChargebackRow>(`/admin/chargebacks/${body.id}/resolve`, {
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.refundId !== undefined ? { refundId: body.refundId } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-chargebacks-open'] }),
  });
}

export type CreditFacilityRow = {
  businessId: string;
  limitCents: number;
  usedCents: number;
  status: 'active' | 'suspended' | 'closed';
  defaultTerms: 'net14' | 'net30';
  autoGranted: number;
};

export function useCreditFacilities(status?: string) {
  return useQuery({
    queryKey: ['admin-credit-facilities', status ?? 'all'],
    queryFn: async () => {
      const qs = status ? `?status=${status}` : '';
      const r = await api.get<{ items: CreditFacilityRow[] }>(`/admin/credit/facilities${qs}`);
      return r.items;
    },
  });
}

export function usePatchCreditFacility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { businessId: string; patch: { limitCents?: number; status?: string; reason?: string } }) =>
      api.patch<{ ok: true }>(`/admin/credit/facilities/${vars.businessId}`, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-credit-facilities'] }),
  });
}
