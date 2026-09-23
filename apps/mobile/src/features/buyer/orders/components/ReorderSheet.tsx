import { useState } from 'react';
import { View } from 'react-native';
import { RefreshCw, ShoppingCart, Zap } from 'lucide-react-native';
import { Button, RadioCards, Sheet, Text } from '@/ui';
import { formatLKR } from '@/lib/format';
import { useReissueOrder, useReorderToCart } from '../useReorder';
import { REORDER_TO_CART, REORDERABLE } from '../orderStatus';

type Mode = 'cart' | 'reissue';

/**
 * One sheet for both reorder paths the web offers: "add to cart" (order
 * detail's ReorderButton) and "re-issue the PO" (orders list).
 */
export function ReorderSheet({
  order,
  businessId,
  onClose,
}: {
  order: { id: string; poNumber: string; status: string; totalCents: number } | null;
  businessId: string | undefined;
  onClose: () => void;
}) {
  const toCart = useReorderToCart();
  const reissue = useReissueOrder(businessId);
  const canCart = !!order && REORDER_TO_CART.has(order.status);
  const canReissue = !!order && REORDERABLE.has(order.status);
  const [mode, setMode] = useState<Mode>('cart');
  const effective: Mode = mode === 'reissue' && canReissue ? 'reissue' : canCart ? 'cart' : 'reissue';

  const run = () => {
    if (!order) return;
    const opts = { onSettled: onClose };
    if (effective === 'cart') toCart.mutate(order.id, opts);
    else reissue.mutate(order.id, opts);
  };

  return (
    <Sheet
      visible={!!order}
      onClose={onClose}
      title="Order again"
      subtitle={order ? `${order.poNumber} · ${formatLKR(order.totalCents)}` : undefined}
      footer={
        <Button
          title={effective === 'cart' ? 'Add items to cart' : 'Issue purchase order'}
          icon={effective === 'cart' ? ShoppingCart : RefreshCw}
          size="lg"
          full
          loading={toCart.isPending || reissue.isPending}
          onPress={run}
        />
      }
    >
      <View style={{ gap: 12 }}>
        <RadioCards<Mode>
          value={effective}
          onChange={setMode}
          options={[
            {
              value: 'cart',
              label: 'Review in cart',
              description: 'Copy these lines into your cart at today’s prices, then check out.',
              icon: ShoppingCart,
              disabled: !canCart,
            },
            {
              value: 'reissue',
              label: 'Re-issue instantly',
              description: 'Send the same purchase order to the supplier right now.',
              icon: Zap,
              disabled: !canReissue,
            },
          ]}
        />
        <Text variant="caption" color="ink4">
          Items no longer stocked are skipped — you'll see exactly what was added.
        </Text>
      </View>
    </Sheet>
  );
}
