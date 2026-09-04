import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Select } from '@/components/ui';
import { formatLKR } from '@/lib/format';

interface OrderDetail {
  order: { id: string; poNumber: string; status: string; totalCents: number; subtotalCents: number; deliveryAddress: string; deliveryCity: string; deliveryDistrict: string; notes: string | null; createdAt: number };
  items: Array<{ id: string; productNameSnapshot: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
  events: Array<{ id: string; fromStatus: string | null; toStatus: string; createdAt: number; reason: string | null }>;
}

const NEXT_OPTIONS_BY_ROLE: Record<string, string[]> = {
  pending: ['cancelled'],
  accepted: ['cancelled'],
  delivered: ['completed', 'disputed'],
  completed: ['disputed'],
};

export function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [to, setTo] = useState('completed');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const { data, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/purchase-orders/${id}`),
  });

  async function transition() {
    setErr('');
    try {
      await api.post(`/purchase-orders/${id}/transition`, { to, reason: reason || undefined });
      await refetch();
      setReason('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed');
    }
  }

  if (!data) return <p className="text-muted">Loading…</p>;

  const { order, items, events } = data;
  const allowed = NEXT_OPTIONS_BY_ROLE[order.status] ?? ['cancelled'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">{order.poNumber}</h1>
          <p className="text-sm text-muted">Placed {new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <span className="px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-sm capitalize">{order.status.replace(/_/g, ' ')}</span>
      </div>

      <Card>
        <h2 className="font-semibold mb-2">Items</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th>Product</th><th>Qty</th><th>Unit</th><th className="text-right">Line</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="py-2">{it.productNameSnapshot}</td>
                <td>{it.quantity}</td>
                <td>{formatLKR(it.unitPriceCents)}</td>
                <td className="text-right">{formatLKR(it.lineTotalCents)}</td>
              </tr>
            ))}
            <tr className="border-t font-bold"><td colSpan={3} className="text-right py-2">Total</td><td className="text-right">{formatLKR(order.totalCents)}</td></tr>
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Timeline</h2>
        <ol className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>{' '}
              <span className="font-mono">{e.fromStatus ?? '∅'} → {e.toStatus}</span>{e.reason && <span className="text-muted"> · {e.reason}</span>}
            </li>
          ))}
        </ol>
      </Card>

      {allowed.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2">Take action</h2>
          <ErrorBanner message={err} />
          <div className="flex items-center gap-2">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {allowed.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
            <input className="flex-1 border rounded-md px-3 py-2 text-sm" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={transition}>Apply</Button>
          </div>
          <Button className="mt-2 bg-slate-200 text-fg hover:bg-slate-300" onClick={() => navigate('/orders')}>Back to orders</Button>
        </Card>
      )}
    </div>
  );
}
