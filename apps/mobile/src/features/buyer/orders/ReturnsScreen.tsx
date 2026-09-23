import { useBusinessId } from '@/lib/auth';
import { ReturnsListScreen } from '@/features/common/ReturnsListScreen';

/** Returns raised by the active business (GET /returns?businessId=…). */
export function ReturnsScreen() {
  const businessId = useBusinessId();
  return (
    <ReturnsListScreen
      scope="businessId"
      scopeId={businessId}
      queryKey={['buyer-returns', businessId]}
      orderHref={(poId) => `/buyer/order/${poId}`}
      kicker="Procurement"
      subtitle="Goods you are sending back, and the refunds that follow."
    />
  );
}
