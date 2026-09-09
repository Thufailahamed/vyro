import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminOrderItem = {
  id: string;
  purchaseOrderId: string;
  supplierProductId: string;
  productNameSnapshot: string;
  unitPriceCents: number;
  unitPriceCentsSnapshot?: number;
  discountPctSnapshot?: number;
  quantity: number;
  lineTotalCents: number;
};

export type AdminOrderEvent = {
  id: string;
  purchaseOrderId: string;
  actorUserId?: string | null;
  fromStatus?: string | null;
  toStatus: string;
  reason?: string | null;
  metadata?: string | null;
  createdAt: number;
};

export type AdminOrder = {
  id: string;
  poNumber?: string;
  status: string;
  businessId?: string;
  supplierId?: string;
  subtotalCents?: number;
  deliveryFeeCents?: number;
  totalCents?: number;
  currency?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDistrict?: string;
  notes?: string | null;
  rejectionReason?: string | null;
  cancelledReason?: string | null;
  createdByUserId?: string;
  acceptedAt?: number | null;
  rejectedAt?: number | null;
  preparedAt?: number | null;
  readyAt?: number | null;
  dispatchedAt?: number | null;
  deliveredAt?: number | null;
  completedAt?: number | null;
  cancelledAt?: number | null;
  createdAt?: number;
  updatedAt?: number;

  // Joined counterparty fields
  businessName?: string | null;
  businessCity?: string | null;
  businessContactPerson?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessAddress?: string | null;

  supplierName?: string | null;
  supplierCity?: string | null;
  supplierContactPerson?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  supplierAddress?: string | null;
};

export interface AdminOrdersFilter {
  status?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
}

export function useAdminOrders(filterOrStatus?: string | AdminOrdersFilter) {
  const filter: AdminOrdersFilter =
    typeof filterOrStatus === 'string'
      ? (filterOrStatus && filterOrStatus !== 'all' ? { status: filterOrStatus } : {})
      : (filterOrStatus ?? {});

  const params = new URLSearchParams();
  if (filter.status && filter.status !== 'all') params.set('status', filter.status);
  if (filter.q && filter.q.trim()) params.set('q', filter.q.trim());
  if (filter.limit) params.set('limit', String(filter.limit));

  const queryStr = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['admin-orders', filter.status ?? 'all', filter.q ?? '', filter.limit ?? 50],
    queryFn: () => api.get<{ orders: AdminOrder[] }>(`/admin/orders${queryStr}`),
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: ['admin-order', id],
    queryFn: () =>
      api.get<{
        order: AdminOrder;
        items?: AdminOrderItem[];
        events?: AdminOrderEvent[];
      }>(`/admin/orders/${id}`),
    enabled: Boolean(id),
  });
}

