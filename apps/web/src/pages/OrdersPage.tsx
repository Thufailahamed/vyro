import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';

interface Order { id: string; poNumber: string; supplierId: string; status: string; totalCents: number; currency: string; createdAt: number }

export function OrdersPage() {
  const { user } = useAuth();
  const businessId = user?.memberships[0]?.businessId;
  const { data } = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });
  if (!user) return <p className="text-muted">Sign in to view orders.</p>;
  if (!businessId) return <p className="text-muted">Set up your business first.</p>;
  if (!data) return <p className="text-muted">Loading…</p>;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My orders</h1>
      {data.orders.length === 0 ? (
        <p className="text-muted">No orders yet. <Link to="/search" className="text-brand-600">Search products</Link>.</p>
      ) : (
        <div className="space-y-2">
          {data.orders.map((o) => (
            <Card key={o.id} className="flex items-center justify-between">
              <div>
                <div className="font-mono text-sm">{o.poNumber}</div>
                <div className="text-xs text-muted">{new Date(o.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-sm capitalize">{o.status.replace(/_/g, ' ')}</div>
              <div className="font-bold w-32 text-right">{formatLKR(o.totalCents)}</div>
              <Link to={`/orders/${o.id}`} className="text-brand-600 text-sm">Open →</Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
