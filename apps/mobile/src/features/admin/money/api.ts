/**
 * Admin money hooks — port of apps/web/src/admin/useAdminMoney.ts,
 * useAdminPaymentSearch.ts, useAdminPaymentOptions.ts and useAdminPaymentDetail.ts.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

/* ---------------------------------- Types --------------------------------- */

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

export type LedgerSummary = {
  totalCreditCents: number;
  totalDebitCents: number;
  netCents: number;
  byAccountType: { accountType: string; creditCents: number; debitCents: number }[];
  byRefType: { refType: string; creditCents: number; debitCents: number }[];
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

export type CreditFacilityRow = {
  businessId: string;
  limitCents: number;
  usedCents: number;
  status: 'active' | 'suspended' | 'closed';
  defaultTerms: 'net14' | 'net30';
  autoGranted: number;
};

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'chargeback' | 'refunded';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'online';
export type PaymentProvider = 'payments_lk' | 'payhere' | 'mock';
export type PaymentSort = 'createdAt-desc' | 'createdAt-asc' | 'amount-desc' | 'amount-asc';

export type PaymentRow = {
  id: string;
  purchaseOrderId: string;
  poNumber: string;
  businessId: string;
  businessName: string;
  supplierId: string;
  supplierName: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  transactionReference: string | null;
  gatewayRef: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  createdAt: number;
};

export type PaymentSearchFilters = {
  q?: string;
  status?: PaymentStatus[];
  method?: PaymentMethod;
  provider?: PaymentProvider;
  businessId?: string;
  supplierId?: string;
  minCents?: number;
  maxCents?: number;
  from?: number;
  to?: number;
  sort?: PaymentSort;
};

export type PaymentOptions = {
  businesses: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
};

export type PaymentDetailBundle = {
  payment: PaymentRow & {
    statusReason: string | null;
    idempotencyKey: string | null;
    gatewayPayload: string | null;
    confirmedByUserId: string | null;
    notes: string | null;
    updatedAt: number;
  };
  purchaseOrder: { id: string; poNumber: string; status: string; totalCents: number; createdAt: number; deliveryAt: number | null } | null;
  business: { id: string; name: string; email: string | null } | null;
  supplier: { id: string; name: string; email: string | null } | null;
  refunds: {
    id: string;
    paymentId: string;
    amountCents: number;
    reason: string | null;
    status: string;
    requestedByUserId: string;
    processedAt: number | null;
    failureReason: string | null;
    createdAt: number;
  }[];
  chargebacks: {
    id: string;
    paymentId: string;
    reason: string;
    status: 'open' | 'resolved' | 'cancelled';
    resolvedBy: string | null;
    resolvedAt: number | null;
    notes: string | null;
    createdAt: number;
  }[];
  ledger: {
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
  }[];
  events?: {
    id: string;
    provider: string;
    eventType: string;
    providerPaymentId: string | null;
    statusCode: number | null;
    processingStatus: string;
    receivedAt: number;
    processedAt: number | null;
  }[];
};

/* ---------------------------------- Keys ---------------------------------- */

export const moneyKeys = {
  refunds: ['admin-refund-queue'] as const,
  batches: ['admin-payout-batch-queue'] as const,
  ledger: (from?: number, to?: number) => ['admin-ledger-summary', { from, to }] as const,
  ledgerAll: ['admin-ledger-summary'] as const,
  chargebacks: ['admin-chargebacks-open'] as const,
  credit: ['admin-credit-facilities'] as const,
  payments: ['admin', 'payments'] as const,
};

/* --------------------------------- Refunds -------------------------------- */

export function useRefundQueue(enabled = true) {
  return useQuery({
    queryKey: moneyKeys.refunds,
    enabled,
    queryFn: async () => (await api.get<{ items: RefundRow[]; nextCursor: string | null }>('/admin/refunds/queue')).items ?? [],
  });
}

export function useApproveRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<RefundRow>(`/admin/refunds/${id}/approve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moneyKeys.refunds });
      qc.invalidateQueries({ queryKey: moneyKeys.payments });
    },
  });
}

export function useRejectRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post<RefundRow>(`/admin/refunds/${v.id}/reject`, { reason: v.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: moneyKeys.refunds }),
  });
}

/* --------------------------------- Payouts -------------------------------- */

export function usePayoutBatchQueue(enabled = true) {
  return useQuery({
    queryKey: moneyKeys.batches,
    enabled,
    queryFn: async () => (await api.get<{ items: PayoutBatchRow[]; nextCursor: string | null }>('/admin/payout-batches/queue')).items ?? [],
  });
}

export function useCreatePayoutBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { note?: string; supplierIds?: string[] }) => api.post<PayoutBatchRow>('/admin/payout-batches/batch', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: moneyKeys.batches }),
  });
}

export function useApprovePayoutBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<PayoutBatchRow>(`/admin/payout-batches/${id}/approve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moneyKeys.batches });
      qc.invalidateQueries({ queryKey: moneyKeys.ledgerAll });
    },
  });
}

/* --------------------------------- Ledger --------------------------------- */

export function useLedgerSummary(opts: { from?: number; to?: number } = {}) {
  return useQuery({
    queryKey: moneyKeys.ledger(opts.from, opts.to),
    queryFn: () => api.get<LedgerSummary>('/admin/ledger/summary' + qs({ from: opts.from, to: opts.to })),
  });
}

/* ------------------------------- Chargebacks ------------------------------ */

export function useOpenChargebacks(enabled = true) {
  return useQuery({
    queryKey: moneyKeys.chargebacks,
    enabled,
    queryFn: async () => (await api.get<ChargebackRow[]>('/admin/chargebacks')) ?? [],
  });
}

export function useResolveChargeback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { id: string; notes?: string; refundId?: string }) =>
      api.post<ChargebackRow>(`/admin/chargebacks/${b.id}/resolve`, {
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
        ...(b.refundId !== undefined ? { refundId: b.refundId } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moneyKeys.chargebacks });
      qc.invalidateQueries({ queryKey: moneyKeys.payments });
    },
  });
}

/* --------------------------------- Credit --------------------------------- */

export function useCreditFacilities(status?: string, enabled = true) {
  return useQuery({
    queryKey: [...moneyKeys.credit, status ?? 'all'],
    enabled,
    queryFn: async () => (await api.get<{ items: CreditFacilityRow[] }>('/admin/credit/facilities' + qs({ status }))).items ?? [],
  });
}

export function usePatchCreditFacility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { businessId: string; patch: { limitCents?: number; status?: string; reason?: string } }) =>
      api.patch<{ ok: true }>(`/admin/credit/facilities/${v.businessId}`, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: moneyKeys.credit }),
  });
}

/* -------------------------------- Payments -------------------------------- */

function paymentQuery(f: PaymentSearchFilters, cursor?: string | null) {
  return qs({
    q: f.q,
    status: f.status?.length ? f.status.join(',') : undefined,
    method: f.method,
    provider: f.provider,
    businessId: f.businessId,
    supplierId: f.supplierId,
    minCents: f.minCents,
    maxCents: f.maxCents,
    from: f.from,
    to: f.to,
    sort: f.sort,
    cursor: cursor ?? undefined,
  });
}

export function useAdminPaymentSearch(filters: PaymentSearchFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['admin', 'payments', 'search', filters],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<{ payments: PaymentRow[]; nextCursor: string | null }>('/admin/payments' + paymentQuery(filters, pageParam)),
    getNextPageParam: (last) => last?.nextCursor ?? null,
  });
}

export function useAdminPaymentOptions(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'payments', 'options'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => api.get<PaymentOptions>('/admin/payments/options'),
  });
}

export function useAdminPaymentDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'payments', 'detail', id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: () => api.get<PaymentDetailBundle>(`/admin/payments/${encodeURIComponent(id ?? '')}`),
  });
}
