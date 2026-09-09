import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminDelivery = {
  id: string;
  purchaseOrderId: string;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | string;
  driverName?: string | null;
  driverPhone?: string | null;
  estimatedAt?: number | null;
  pickedUpAt?: number | null;
  deliveredAt?: number | null;
  assignedByUserId?: string | null;
  createdAt?: number;
  updatedAt?: number;

  // Joined PO & Counterparty fields
  poNumber?: string | null;
  orderStatus?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  totalCents?: number | null;
  currency?: string | null;
  businessId?: string | null;
  businessName?: string | null;
  businessPhone?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
};

export interface AdminDeliveriesFilter {
  status?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
}

export function useAdminDeliveries(filterOrStatus?: string | AdminDeliveriesFilter) {
  const filter: AdminDeliveriesFilter =
    typeof filterOrStatus === 'string'
      ? (filterOrStatus && filterOrStatus !== 'all' ? { status: filterOrStatus } : {})
      : (filterOrStatus ?? {});

  const params = new URLSearchParams();
  if (filter.status && filter.status !== 'all') params.set('status', filter.status);
  if (filter.q && filter.q.trim()) params.set('q', filter.q.trim());
  if (filter.limit) params.set('limit', String(filter.limit));

  const queryStr = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['admin-deliveries', filter.status ?? 'all', filter.q ?? '', filter.limit ?? 50],
    queryFn: () => api.get<{ deliveries: AdminDelivery[] }>(`/admin/deliveries${queryStr}`),
  });
}

