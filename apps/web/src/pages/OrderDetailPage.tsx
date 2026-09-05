import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Select, Input, StatusDots } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { ArrowLeftIcon } from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { MessageThread } from '@/components/MessageThread';
import { PaymentPanel } from '@/components/payments/PaymentPanel';

interface OrderDetail {
  order: {
    id: string;
    poNumber: string;
    status: string;
    totalCents: number;
    subtotalCents: number;
    deliveryAddress: string;
    deliveryCity: string;
    deliveryDistrict: string;
    notes: string | null;
    createdAt: number;
  };
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    createdAt: number;
    reason: string | null;
  }>;
}

// Business-side allowed transitions. Mirrors @vyro/shared ORDER_TRANSITIONS.
const NEXT_OPTIONS_BY_ROLE: Record<string, string[]> = {
  pending: ['cancelled'],
  accepted: ['cancelled'],
  preparing: ['cancelled'],
  delivered: ['completed', 'disputed'],
  completed: ['disputed'],
};

const JOURNEY = ['pending', 'accepted', 'preparing', 'in_transit', 'delivered', 'completed'] as const;

function journeyState(status: string): Array<{ label: string; state: 'done' | 'active' | 'idle' }> {
  const labels = ['Order', 'Supplier', 'Preparation', 'Delivery', 'Business'];
  const idx = JOURNEY.indexOf(status as (typeof JOURNEY)[number]);
  const mapped = status === 'accepted' ? 1 : status === 'preparing' ? 2 : status === 'in_transit' ? 3 : status === 'delivered' || status === 'completed' ? 4 : 0;
  const active = idx === -1 ? 0 : mapped;
  return labels.map((label, i) => ({
    label,
    state: i < active ? 'done' : i === active ? 'active' : 'idle',
  }));
}

export function OrderDetailPage() {
  const { id } = useParams();
  const [to, setTo] = useState('completed');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/purchase-orders/${id}`),
  });

  async function transition() {
    setErr('');
    setLoading(true);
    try {
      await api.post(`/purchase-orders/${id}/transition`, { to, reason: reason || undefined });
      await refetch();
      setReason('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to update order status');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;
  if (!data) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">Order not found</h2>
        <Link to="/orders" className="mt-4 inline-block text-copper">
          ← Orders
        </Link>
      </div>
    );
  }

  const { order, items, events } = data;
  const allowed = NEXT_OPTIONS_BY_ROLE[order.status] ?? [];

  // Default the dropdown to the first valid option for the current status.
  useEffect(() => {
    const next = allowed[0];
    if (next) setTo(next);
  }, [order.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink">
        <ArrowLeftIcon size={14} /> Orders
      </Link>

      <header className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 items-end">
        <div>
          <div className="vyro-kicker">Purchase order</div>
          <h1 className="mt-2 vyro-metric text-4xl">{order.poNumber}</h1>
        </div>
        <div className="lg:text-right">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Total</div>
          <MetricNumber>{formatLKR(order.totalCents)}</MetricNumber>
        </div>
      </header>

      <Surface kind="ink" className="p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.16em] text-volt mb-5">Journey</div>
        <FlowLine tone="paper" nodes={journeyState(order.status)} />
      </Surface>

      <ErrorBanner message={err} />

      <div className="grid lg:grid-cols-12 gap-6">
        <Surface className="lg:col-span-8 p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink/10 font-display text-lg">Lines</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-ink-4 text-left">
                <th className="px-6 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Unit</th>
                <th className="px-6 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-ink/5">
                  <td className="px-6 py-3">{it.productNameSnapshot}</td>
                  <td className="px-3 py-3 vyro-metric">{it.quantity}</td>
                  <td className="px-3 py-3 text-right vyro-metric">{formatLKR(it.unitPriceCents)}</td>
                  <td className="px-6 py-3 text-right vyro-metric">{formatLKR(it.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-4 border-t border-ink/10 text-xs text-ink-4">
            {order.deliveryAddress}, {order.deliveryCity}, {order.deliveryDistrict}
            {order.notes ? ` · ${order.notes}` : ''}
          </div>
        </Surface>

        <div className="lg:col-span-4 space-y-4">
          <PaymentPanel
            purchaseOrderId={order.id}
            poStatus={order.status}
            totalCents={order.totalCents}
          />
          {allowed.length > 0 && (
            <Surface kind="elevated" className="p-5 space-y-3">
              <h3 className="font-display text-lg">Update status</h3>
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {allowed.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
              <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button onClick={transition} loading={loading} variant={to === 'cancelled' || to === 'disputed' ? 'danger' : 'primary'} className="w-full">
                Apply
              </Button>
            </Surface>
          )}
          <Surface className="p-5">
            <h3 className="font-display text-lg mb-4">Events</h3>
            <ol className="space-y-4">
              {events.map((e) => (
                <li key={e.id}>
                  <StatusDots status={(e.toStatus as OrderStatus) ?? 'pending'} />
                  <div className="text-[11px] text-ink-4 vyro-metric mt-1">
                    {new Date(e.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </li>
              ))}
            </ol>
          </Surface>
        </div>
      </div>

      <MessageThread purchaseOrderId={order.id} />
    </div>
  );
}
