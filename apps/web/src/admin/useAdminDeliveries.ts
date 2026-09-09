import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminDelivery = {
  id: string;
  status: string;
  purchaseOrderId?: string;
  assigneeId?: string | null;
};

export function useAdminDeliveries() {
  return useQuery({
    queryKey: ['admin-deliveries'],
    queryFn: () => api.get<{ deliveries: AdminDelivery[] }>('/admin/deliveries'),
  });
}
