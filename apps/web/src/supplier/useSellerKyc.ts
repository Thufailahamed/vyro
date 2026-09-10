import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { KycReviewRow } from '@/admin/useAdminTrustSafety';

export function useSellerKyc() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['seller-kyc'],
    queryFn: () => api.get<{ kyc: KycReviewRow | null }>('/kyc/my'),
    enabled: !!user,
  });
}

export function useSubmitKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<KycReviewRow>('/kyc/submit', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-kyc'] }),
  });
}
