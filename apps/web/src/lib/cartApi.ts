import { api } from './api';
import { reorderResponseSchema, type ReorderResponse } from '@vyro/validation/cart';

/**
 * Reorder items from a previous order into the active cart.
 *
 * Calls `POST /cart/from-order/:orderId` and validates the response
 * against `reorderResponseSchema` from `@vyro/validation/cart`.
 */
export async function reorderFromOrder(orderId: string): Promise<ReorderResponse> {
  const raw = await api.post<unknown>(`/cart/from-order/${orderId}`, {});
  return reorderResponseSchema.parse(raw);
}

export type { ReorderResponse };
