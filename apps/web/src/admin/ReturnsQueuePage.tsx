import { ReturnsListView } from '@/components/orders/ReturnsPanels';

export function ReturnsQueuePage() {
  return (
    <ReturnsListView
      kicker="Operations / Returns"
      title="Returns queue"
      sub="Return requests (RMAs) across the marketplace. Open returns hold the supplier's settlement until closed."
      queryKey={['admin-returns']}
      path="/admin/returns"
      orderLink={(r) => `/admin/orders/${r.purchaseOrderId}`}
    />
  );
}
