import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RepeatOfferPreviewResponse } from '@vyro/validation';

export function useRepeatOffersPreview(businessId: string | undefined) {
  return useQuery({
    queryKey: ['repeat-offers-preview', businessId],
    queryFn: () =>
      api.get<RepeatOfferPreviewResponse>(`/checkout/repeat-offers?businessId=${businessId}`),
    enabled: !!businessId,
    retry: false,
    staleTime: 60_000,
  });
}
