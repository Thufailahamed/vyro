import { RefreshCwIcon } from './icons';
import { Button } from './ui';
import { useReorderFromOrder } from '../hooks/useReorderFromOrder';

const REORDER_ELIGIBLE_STATUSES = new Set<string>([
  'completed',
  'delivered',
  'ready_for_pickup',
]);

interface ReorderButtonProps {
  orderId: string;
  orderStatus: string;
}

/**
 * Renders a "Reorder these items" button that adds items from a previous
 * order into the buyer's active cart.
 *
 * Only renders for eligible statuses (completed / delivered / ready_for_pickup).
 * On success: invalidates cart queries, shows a toast, and navigates to /cart.
 */
export function ReorderButton({ orderId, orderStatus }: ReorderButtonProps) {
  const reorder = useReorderFromOrder();

  if (!REORDER_ELIGIBLE_STATUSES.has(orderStatus)) return null;

  return (
    <Button
      variant="secondary"
      onClick={() => reorder.mutate(orderId)}
      loading={reorder.isPending}
      className="w-full"
      data-testid="reorder-button"
    >
      <RefreshCwIcon size={14} />
      {reorder.isPending ? 'Adding…' : 'Reorder these items'}
    </Button>
  );
}
