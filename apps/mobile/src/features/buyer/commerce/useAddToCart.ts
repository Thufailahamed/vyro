import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/ui';
import { go, productHref } from './data';

/** Port of apps/web/src/lib/useAddToCart.ts — MOQ-aware add with auth routing. */
export function useAddToCart() {
  const { user, business } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const businessId = business?.businessId;

  async function addToCart(opts: { productId: string; supplierProductId: string; quantity: number; productName?: string }): Promise<boolean> {
    const next = productHref(opts.productId);
    if (!user) {
      router.push({ pathname: '/login', params: { next } });
      return false;
    }
    if (!businessId) {
      go(`/onboarding/business?next=${encodeURIComponent(next)}`);
      return false;
    }
    setPendingKey(opts.supplierProductId);
    try {
      await api.post('/cart/items', {
        businessId,
        supplierProductId: opts.supplierProductId,
        quantity: Math.max(1, Math.round(opts.quantity)),
      });
      await qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Added to cart', opts.productName ? `${opts.quantity} × ${opts.productName}` : undefined);
      return true;
    } catch (e) {
      toast.error('Could not add to cart', errorMessage(e, 'Failed to add item to cart'));
      return false;
    } finally {
      setPendingKey(null);
    }
  }

  return { addToCart, pendingKey, businessId };
}
