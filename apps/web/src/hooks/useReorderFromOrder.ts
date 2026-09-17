import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@vyro/ui';
import { ApiError } from '@/lib/api';
import { reorderFromOrder, type ReorderResponse } from '@/lib/cartApi';

/**
 * Mutation hook: reorder items from a previous order into the active cart.
 *
 * On success: invalidates cart queries, shows a toast with added/skipped counts,
 * and navigates to `/cart` so the buyer can review before checkout.
 *
 * On error: shows an error toast with the API error message.
 */
export function useReorderFromOrder() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  return useMutation<ReorderResponse, Error, string>({
    mutationFn: (orderId: string) => reorderFromOrder(orderId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      const total = result.addedCount + result.skippedCount;
      toast.show(
        toast.success(
          `Added ${result.addedCount} of ${total} items to cart`,
          result.skippedCount > 0
            ? `${result.skippedCount} item${result.skippedCount === 1 ? '' : 's'} unavailable — see cart`
            : undefined,
        ),
      );
      navigate('/cart');
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : e.message || 'Reorder failed';
      toast.show(toast.error('Reorder failed', msg));
    },
  });
}
