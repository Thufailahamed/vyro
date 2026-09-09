import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PaymentOptions = {
  businesses: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
};

export function useAdminPaymentOptions(): UseQueryResult<PaymentOptions> {
  return useQuery({
    queryKey: ['admin', 'payments', 'options'],
    queryFn: async () => await api.get<PaymentOptions>('/admin/payments/options'),
    staleTime: 5 * 60_000,
  });
}
