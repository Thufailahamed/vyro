import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatLKR } from '@/lib/format';

interface Order { id: string; poNumber: string; status: string; totalCents: number; createdAt: number }

export function SupplierOrdersPage() {
  const { user } = useAuth();
  const supplierId = user?.supplierMemberships[0]?.supplierId;
  const { data, refetch } = useQuery({
    queryKey: ['supplier-orders', supplierId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?supplierId=${supplierId}`),
    enabled: !!supplierId,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function transition(poId: string, to: string) {
    setBusyId(poId);
    try { await api.post(`/purchase-orders/${poId}/transition`, { to }); await refetch(); } finally { setBusyId(null); }
  }

  if (!user || !supplierId) return <p className="text-muted">Sign in as a supplier member to view incoming orders.</p>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const pending = data.orders.filter((o) => o.status === 'pending');
  const active = data.orders.filter((o) => !['pending'].includes(o.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-3">Incoming orders ({pending.length})</h1>
        {pending.length === 0 ? <p className="text-muted">Nothing waiting.</p> : (
          <div className="space-y-2">
            {pending.map((o) => (
              <Card key={o.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-mono text-sm">{o.poNumber}</div>
                  <div className="text-xs text-muted">{new Date(o.createdAt).toLocaleString()}</div>
                </div>
                <div className="font-bold">{formatLKR(o.totalCents)}</div>
                <Button disabled={busyId === o.id} onClick={() => transition(o.id, 'accepted')}>Accept</Button>
                <Button disabled={busyId === o.id} className="bg-red-600 hover:bg-red-700" onClick={() => transition(o.id, 'rejected')}>Reject</Button>
                <Link to={`/orders/${o.id}`} className="text-brand-600 text-sm">Open</Link>
              </Card>
            ))}
          </div>
        )}
      </div>
      <div>
        <h2 className="font-semibold mb-3">Active & completed</h2>
        {active.length === 0 ? <p className="text-muted">No history yet.</p> : (
          <div className="space-y-2">
            {active.map((o) => (
              <Card key={o.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-mono text-sm">{o.poNumber}</div>
                  <div className="text-xs text-muted capitalize">{o.status.replace(/_/g, ' ')}</div>
                </div>
                <div className="font-bold">{formatLKR(o.totalCents)}</div>
                <Link to={`/orders/${o.id}`} className="text-brand-600 text-sm">Open</Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
