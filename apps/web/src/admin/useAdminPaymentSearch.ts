import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'online';

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
  businessId?: string;
  supplierId?: string;
  minCents?: number;
  maxCents?: number;
  from?: number;
  to?: number;
  sort?: 'createdAt-desc' | 'createdAt-asc' | 'amount-desc' | 'amount-asc';
};

function buildQuery(filters: PaymentSearchFilters, cursor?: string): string {
  const qs = new URLSearchParams();
  if (filters.q) qs.set('q', filters.q);
  if (filters.status?.length) qs.set('status', filters.status.join(','));
  if (filters.method) qs.set('method', filters.method);
  if (filters.businessId) qs.set('businessId', filters.businessId);
  if (filters.supplierId) qs.set('supplierId', filters.supplierId);
  if (typeof filters.minCents === 'number') qs.set('minCents', String(filters.minCents));
  if (typeof filters.maxCents === 'number') qs.set('maxCents', String(filters.maxCents));
  if (typeof filters.from === 'number') qs.set('from', String(filters.from));
  if (typeof filters.to === 'number') qs.set('to', String(filters.to));
  if (filters.sort) qs.set('sort', filters.sort);
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

export function useAdminPaymentSearch(
  filters: PaymentSearchFilters,
  cursor?: string,
): UseQueryResult<{ payments: PaymentRow[]; nextCursor: string | null }> {
  const qs = buildQuery(filters, cursor);
  return useQuery({
    queryKey: ['admin', 'payments', 'search', filters, cursor ?? null],
    queryFn: async () => {
      const path = `/admin/payments${qs ? `?${qs}` : ''}`;
      return await api.get<{ payments: PaymentRow[]; nextCursor: string | null }>(path);
    },
  });
}
