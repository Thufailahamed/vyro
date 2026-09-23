import { useBusinessId } from '@/lib/auth';
import { useCart } from './commerce/data';

/**
 * Number of lines in the active cart, for the tab badge. Shares the
 * `['cart', businessId]` query with the cart screen, so it updates as soon as
 * any add-to-cart / quantity change invalidates `['cart']`.
 */
export function useCartCount(): number | undefined {
  const businessId = useBusinessId();
  const q = useCart(businessId);
  const n = q.data?.items?.length ?? 0;
  return n > 0 ? n : undefined;
}
