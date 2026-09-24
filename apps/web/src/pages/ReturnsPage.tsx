import { Link } from 'react-router-dom';
import { usePageTitle } from '@/lib/usePageTitle';
import { useAuth } from '@/lib/auth';
import { ReturnsListView } from '@/components/orders/ReturnsPanels';
import { Button } from '@/components/ui';
import { PackageIcon } from '@/components/icons';

export function ReturnsPage() {
  usePageTitle('Returns');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;

  return (
    <ReturnsListView
      kicker="Procurement / Returns"
      title="Returns"
      sub="Track return requests (RMAs) you have raised against delivered orders."
      queryKey={['returns', 'business', businessId]}
      path={`/returns?businessId=${businessId ?? ''}`}
      orderLink={(r) => `/orders/${r.purchaseOrderId}`}
      enabled={!!businessId}
      emptyAction={
        <Link to="/orders">
          <Button variant="secondary" size="sm" icon={<PackageIcon size={14} />}>
            View purchase orders
          </Button>
        </Link>
      }
    />
  );
}
