import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/ui';
import { go } from './kit';
import type { ReorderPoResponse, ReorderToCartResponse } from './types';

/**
 * Web `useReorderFromOrder`: copies a past order's lines into the active cart
 * (POST /cart/from-order/:id), then opens the cart for review.
 */
export function useReorderToCart() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<ReorderToCartResponse, Error, string>({
    mutationFn: (orderId) => api.post<ReorderToCartResponse>(`/cart/from-order/${orderId}`, {}),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      const total = r.addedCount + r.skippedCount;
      toast.success(
        `Added ${r.addedCount} of ${total} items to cart`,
        r.skippedCount > 0 ? `${r.skippedCount} item${r.skippedCount === 1 ? '' : 's'} unavailable — see cart` : undefined,
      );
      go('/buyer/cart');
    },
    onError: (e) => toast.error('Reorder failed', errorMessage(e)),
  });
}

/** Web OrdersPage reorder: re-issues the same purchase order directly (POST /purchase-orders/:id/reorder). */
export function useReissueOrder(businessId: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<ReorderPoResponse, Error, string>({
    mutationFn: (orderId) => api.post<ReorderPoResponse>(`/purchase-orders/${orderId}/reorder`),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['orders', businessId] });
      const skipped = r.skipped?.length ?? 0;
      toast.success(
        r.poIds.length > 1 ? `${r.poIds.length} purchase orders issued` : 'Purchase order issued',
        skipped ? `${skipped} item${skipped === 1 ? '' : 's'} no longer available` : undefined,
      );
      if (r.poIds[0]) go(`/buyer/order/${r.poIds[0]}`);
    },
    onError: (e) =>
      toast.error('Could not reorder', errorMessage(e, 'Some items may no longer be available in the current wholesale catalog.')),
  });
}
