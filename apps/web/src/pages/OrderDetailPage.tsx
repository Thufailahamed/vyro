import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Select, StatusBadge, Input } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import {
  ArrowLeftIcon,
  MapPinIcon,
  FileTextIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  TruckIcon,
} from '@/components/icons';

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

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-4">
        <div className="h-6 w-32 bg-slate-200 rounded animate-pulse" />
        <div className="h-10 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse border border-slate-200" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <h2 className="text-xl font-bold text-slate-800">Order Not Found</h2>
        <p className="text-xs text-slate-500 mt-1">This purchase order ID may be invalid or belongs to another organization.</p>
        <Link to="/orders" className="mt-4 inline-block">
          <Button variant="outline">← Back to Orders</Button>
        </Link>
      </div>
    );
  }

  const { order, items, events } = data;
  const allowed = NEXT_OPTIONS_BY_ROLE[order.status] ?? [];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-950 transition-colors bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-soft-sm"
        >
          <ArrowLeftIcon size={14} /> Back to my orders
        </Link>
        <StatusBadge status={order.status} />
      </div>

      {/* PO Overview Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-soft-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Official purchase order
          </div>
          <h1 className="text-3xl font-semibold font-mono tracking-tight text-slate-950">
            {order.poNumber}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ClockIcon size={14} className="text-slate-400" />
            <span className="num-tabular">Placed {new Date(order.createdAt).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}</span>
          </div>
        </div>

        <div className="text-left sm:text-right space-y-1 bg-pearl sm:bg-transparent p-4 sm:p-0 rounded-lg">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Total payable
          </span>
          <div className="text-3xl font-bold font-mono text-slate-950 num-tabular">
            {formatLKR(order.totalCents)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">LKR wholesale value</div>
        </div>
      </div>

      <ErrorBanner message={err} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Items & Delivery Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items Table */}
          <Card className="p-6 border-slate-200/90 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Line Items & Quantities</h2>
              <span className="text-xs font-medium text-slate-500">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wider text-slate-600 border-b border-slate-200/80 bg-slate-50/70">
                    <th className="py-2.5 px-3 rounded-l-lg">Product Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right rounded-r-lg">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900">{it.productNameSnapshot}</td>
                      <td className="py-3 px-3 text-center text-slate-600 font-medium">{it.quantity}</td>
                      <td className="py-3 px-3 text-right text-slate-600">{formatLKR(it.unitPriceCents)}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">{formatLKR(it.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={3} className="py-3 px-3 text-right font-bold text-slate-700">Subtotal</td>
                    <td className="py-3 px-3 text-right font-black text-slate-900">{formatLKR(order.subtotalCents || order.totalCents)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="py-2 px-3 text-right font-bold text-brand-800">Grand Total (LKR)</td>
                    <td className="py-2 px-3 text-right font-black text-brand-700 text-base">{formatLKR(order.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Delivery Details */}
          <Card className="p-6 border-slate-200/90 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <MapPinIcon size={18} className="text-brand-600" />
              <h2 className="text-base font-bold text-slate-900">Destination & Delivery Details</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="font-semibold text-slate-400 uppercase tracking-wider">Address</span>
                <p className="font-medium text-slate-800">{order.deliveryAddress || 'Standard Business Address'}</p>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-400 uppercase tracking-wider">City & District</span>
                <p className="font-medium text-slate-800">{order.deliveryCity}, {order.deliveryDistrict}</p>
              </div>

              {order.notes && (
                <div className="sm:col-span-2 space-y-1 pt-2 border-t border-slate-100">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider">Buyer Notes</span>
                  <p className="text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/70 italic">
                    "{order.notes}"
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Actions & Timeline */}
        <div className="space-y-6">
          {/* Action Card */}
          {allowed.length > 0 && (
            <Card className="p-6 border-slate-200/90 space-y-4 shadow-soft-sm bg-gradient-to-b from-white to-slate-50/50">
              <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                Manage Order Status
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Status</label>
                  <Select value={to} onChange={(e) => setTo(e.target.value)}>
                    {allowed.map((s) => (
                      <option key={s} value={s}>
                        Mark as {s.replace(/_/g, ' ').toUpperCase()}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Note (Optional)</label>
                  <Input
                    placeholder="e.g. All goods received in good condition"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <Button
                  onClick={transition}
                  disabled={loading}
                  loading={loading}
                  className="w-full font-bold"
                  variant={to === 'cancelled' || to === 'disputed' ? 'danger' : 'primary'}
                >
                  Apply Status Change
                </Button>
              </div>
            </Card>
          )}

          {/* Timeline & Audit Events */}
          <Card className="p-6 border-slate-200/90 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ClockIcon size={18} className="text-brand-600" />
              <h3 className="text-base font-bold text-slate-900">Audit Trail</h3>
            </div>

            <ol className="relative border-l border-slate-200 ml-3 space-y-5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="ml-5">
                  <span className="absolute -left-2 mt-0.5 h-4 w-4 rounded-full border-2 border-white bg-brand-500 shadow-soft-sm" />
                  <div className="flex flex-col">
                    <div className="font-bold text-slate-900 capitalize">
                      {e.toStatus.replace(/_/g, ' ')}
                    </div>
                    <span className="text-[11px] text-slate-600">
                      {new Date(e.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {e.reason && (
                      <p className="mt-1 text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 text-[11px]">
                        {e.reason}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
