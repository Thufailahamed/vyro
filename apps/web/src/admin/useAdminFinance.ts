import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type FailedPayout = {
  id: string;
  status: string;
  supplierId?: string;
  supplierName?: string | null;
  amountCents?: number;
  feeCents?: number;
  netCents?: number;
  currency?: string;
  periodStart?: number;
  periodEnd?: number;
  method?: string;
  reference?: string | null;
  batchId?: string | null;
  failureReason?: string | null;
  createdAt?: number;
  updatedAt?: number;
};

export type FinanceMetrics = {
  failedCount: number;
  failedAmountCents: number;
  pendingCount: number;
  totalCount: number;
};

export type FinanceSummaryResponse = {
  failedPayouts: FailedPayout[];
  metrics?: FinanceMetrics;
};

export function useFailedPayouts() {
  return useQuery({
    queryKey: ['admin-finance-summary'],
    queryFn: () => api.get<FinanceSummaryResponse>('/admin/finance/summary'),
  });
}

export function useRetryPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; reason: string; idempotencyKey: string }) =>
      api.post<{ ok: true }>(`/admin/finance/payouts/${body.id}/retry`, {
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-finance-summary'] }),
  });
}

export function useIssueRefund() {
  return useMutation({
    mutationFn: (body: { paymentId: string; amountCents: number; reason: string; idempotencyKey: string }) =>
      api.post<{ ok: true }>('/admin/finance/refunds', body),
  });
}
