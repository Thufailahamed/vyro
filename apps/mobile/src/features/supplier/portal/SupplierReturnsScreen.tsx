import { useSupplierId } from '@/lib/auth';
import { ReturnsListScreen } from '@/features/common/ReturnsListScreen';
import { SupplierReturnActions } from '@/features/supplier/ops/SupplierReturns';

/** Returns raised against this supplier's orders (GET /returns?supplierId=…). */
export function SupplierReturnsScreen() {
  const supplierId = useSupplierId();
  return (
    <ReturnsListScreen
      scope="supplierId"
      scopeId={supplierId}
      queryKey={['supplier', supplierId, 'returns']}
      orderHref={(poId) => `/supplier/order/${poId}`}
      kicker="Operations"
      subtitle="Approve, reject and receive goods coming back from buyers."
      renderActions={(r) => (r.status === 'requested' || r.status === 'approved' ? <SupplierReturnActions ret={r} /> : null)}
    />
  );
}
