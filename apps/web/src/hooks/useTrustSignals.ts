import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trustApi, type TrustSignalView } from '../lib/trustApi';

export function useSupplierTrustSignals(supplierId: string) {
  return useQuery({
    queryKey: ['trust', 'supplier', supplierId],
    queryFn: () => trustApi.getSupplierTrustSignals(supplierId),
    enabled: Boolean(supplierId),
    staleTime: 60_000,
  });
}

export function useRecomputeTrustSignals(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => trustApi.recomputeSupplierTrustSignals(supplierId),
    onSuccess: (data) => {
      qc.setQueryData(['trust', 'supplier', supplierId], {
        raw: null,
        view: data.view,
        flagEnabled: true,
      });
    },
  });
}

export type { TrustSignalView };
