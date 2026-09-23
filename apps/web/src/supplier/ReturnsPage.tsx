import { usePageTitle } from '@/lib/usePageTitle';
import { ReturnsListView } from '@/components/orders/ReturnsPanels';
import { useSupplierId } from './useSupplierId';

export function SupplierReturnsPage() {
  usePageTitle('Returns');
  const { supplierId, supplierName } = useSupplierId();

  return (
    <ReturnsListView
      kicker={`${supplierName} / Returns`}
      title="Returns"
      sub="Approve, reject and receive buyer return requests. Open the order to act on a return."
      queryKey={['returns', 'supplier', supplierId]}
      path={`/returns?supplierId=${supplierId}`}
      orderLink={(r) => `/supplier/orders/${r.purchaseOrderId}`}
    />
  );
}
