import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type RefundRow = {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedByUserId: string;
  requestedAt: number;
  processedAt: number | null;
  failureReason: string | null;
};

export type PayoutBatchRow = {
  id: string;
  periodStart: number;
  periodEnd: number;
  payoutCount: number;
  totalCents: number;
  status: 'pending' | 'approved' | 'rejected';
  createdByUserId: string;
  createdAt: number;
  approvedByUserId: string | null;
  approvedAt: number | null;
  notes: string | null;
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
    queryFn: async () => (await api.get<RefundRow[]>('/admin/refunds/queue')) as RefundRow[],
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
    mutationFn: async (id: string) => api.post<RefundRow>(`/admin/refunds/${id}/reject`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-refund-queue'] }),
  });
}

export function usePayoutBatchQueue() {
  return useQuery({
    queryKey: ['admin-payout-batch-queue'],
    queryFn: async () => (await api.get<PayoutBatchRow[]>('/admin/payout-batches/queue')) as PayoutBatchRow[],
  });
}

export function useCreatePayoutBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { periodStart: number; periodEnd: number; notes?: string }) =>
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
