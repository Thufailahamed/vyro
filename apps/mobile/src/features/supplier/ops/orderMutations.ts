import { useQueryClient } from '@tanstack/react-query';
import { useSupplier } from './kit';

/** Refresh every cache that shows a supplier purchase order after a lifecycle change. */
export function useInvalidateOrder() {
  const { supplierId } = useSupplier();
  const qc = useQueryClient();
  return (poId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'po'] }),
      qc.invalidateQueries({ queryKey: ['purchase-order', poId] }),
      qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'deliveries'] }),
      qc.invalidateQueries({ queryKey: ['supplier-delivery', poId] }),
      qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'returns'] }),
    ]);
}
