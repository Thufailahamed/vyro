import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaymentRow } from './useAdminPaymentSearch';

export type DetailBundle = {
  payment: PaymentRow & {
    statusReason: string | null;
    idempotencyKey: string | null;
    gatewayPayload: string | null;
    confirmedByUserId: string | null;
    notes: string | null;
    updatedAt: number;
  };
  purchaseOrder: {
    id: string;
    poNumber: string;
    status: string;
    totalCents: number;
    createdAt: number;
    deliveryAt: number | null;
  } | null;
  business: { id: string; name: string; email: string | null } | null;
  supplier: { id: string; name: string; email: string | null } | null;
  refunds: Array<{
    id: string;
    paymentId: string;
    amountCents: number;
    reason: string | null;
    status: string;
    requestedByUserId: string;
    processedAt: number | null;
    failureReason: string | null;
    createdAt: number;
  }>;
  chargebacks: Array<{
    id: string;
    paymentId: string;
    reason: string;
    status: 'open' | 'resolved' | 'cancelled';
    resolvedBy: string | null;
    resolvedAt: number | null;
    notes: string | null;
    createdAt: number;
  }>;
  ledger: Array<{
    id: string;
    accountType: string;
    accountId: string;
    direction: 'debit' | 'credit';
    amountCents: number;
    currency: string;
    refType: string;
    refId: string;
    description: string;
    createdAt: number;
  }>;
};

export function useAdminPaymentDetail(id: string): UseQueryResult<DetailBundle> {
  return useQuery({
    queryKey: ['admin', 'payments', 'detail', id],
    queryFn: async () => await api.get<DetailBundle>(`/admin/payments/${encodeURIComponent(id)}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}
