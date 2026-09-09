import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminOrder = {
  id: string;
  poNumber?: string;
  status: string;
  businessId?: string;
  supplierId?: string;
  updatedAt?: number;
};

export function useAdminOrders(status?: string) {
  return useQuery({
    queryKey: ['admin-orders', status ?? 'all'],
    queryFn: () =>
      api.get<{ orders: AdminOrder[] }>(`/admin/orders${status ? `?status=${status}` : ''}`),
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => api.get<{ order: AdminOrder }>(`/admin/orders/${id}`),
    enabled: Boolean(id),
  });
}
