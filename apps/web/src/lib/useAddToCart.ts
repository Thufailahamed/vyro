import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@vyro/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function useAddToCart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const businessId = user?.memberships?.[0]?.businessId;

  async function addToCart(opts: {
    productId: string;
    supplierProductId: string;
    quantity: number;
    productName?: string;
  }): Promise<boolean> {
    const next = `/products/${opts.productId}`;
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return false;
    }
    if (!businessId) {
      navigate(`/onboarding/business?next=${encodeURIComponent(next)}`);
      return false;
    }

    setPendingKey(opts.supplierProductId);
    try {
      await api.post('/cart/items', {
        businessId,
        supplierProductId: opts.supplierProductId,
        quantity: opts.quantity,
      });
      await qc.invalidateQueries({ queryKey: ['cart'] });
      toast.show(
        toast.success(
          'Added to cart',
          opts.productName ? `${opts.quantity} × ${opts.productName}` : undefined,
        ),
      );
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to add item to cart';
      toast.show(toast.error(msg));
      return false;
    } finally {
      setPendingKey(null);
    }
  }

  return { addToCart, pendingKey, businessId };
}
