import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Select, Input, StatusBadge, Badge } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { ORDER_TRANSITIONS, canTransition, type OrderStatus as SharedOrderStatus } from '@vyro/shared';
import { formatLKR } from '@/lib/format';
import {
  ArrowLeftIcon,
  RefreshCwIcon,
  PackageIcon,
  TruckIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  FileTextIcon,
  CreditCardIcon,
  AlertCircleIcon,
  ShieldCheckIcon,
  CalendarIcon,
  XIcon,
} from '@/components/icons';
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
    discountPctSnapshot?: number | null;
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

// Business-side allowed transitions, derived from the API truth
// (ORDER_TRANSITIONS + TRANSITION_RULES in @vyro/shared). The buyer acts
// with the 'business' role; other roles have their own surfaces.
function allowedTransitionsFor(status: string): string[] {
  const next = ORDER_TRANSITIONS[status as SharedOrderStatus] as readonly string[] | undefined;
  if (!next) return [];
  return next.filter((to) =>
    canTransition(status as SharedOrderStatus, to as SharedOrderStatus, 'business'),
  );
}

const JOURNEY = [
  'pending',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'completed',
] as const;

// Five journey labels for seven statuses: pickup/delivery share a label.
const JOURNEY_LABEL_INDEX: Record<(typeof JOURNEY)[number], number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready_for_pickup: 3,
  out_for_delivery: 3,
  delivered: 4,
  completed: 4,
};

function journeyState(status: string): Array<{ label: string; state: 'done' | 'active' | 'idle' }> {
  const labels = ['Order', 'Supplier', 'Preparation', 'Delivery', 'Business'];
  // Terminal failure states: mark the journey stopped at Order with clear context.
  // The status badge (StatusDots) carries the actual rejected/cancelled/disputed/failed value.
  if (status === 'rejected' || status === 'cancelled' || status === 'disputed' || status === 'failed') {
    return labels.map((label, i) => ({
      label,
      state: (i === 0 ? 'active' : 'idle') as 'done' | 'active' | 'idle',
    }));
  }
  const active = JOURNEY_LABEL_INDEX[status as (typeof JOURNEY)[number]] ?? 0;
  return labels.map((label, i) => ({
    label,
    state: i < active ? 'done' : i === active ? 'active' : 'idle',
  }));
}

/* ── Helpers ────────────────────────────────────────────── */

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_ICON_MAP: Record<string, React.ReactNode> = {
  pending: <ClockIcon size={14} className="text-amber" />,
  accepted: <CheckCircleIcon size={14} className="text-emerald-600" />,
  preparing: <PackageIcon size={14} className="text-blue-500" />,
  ready_for_pickup: <PackageIcon size={14} className="text-violet-500" />,
  out_for_delivery: <TruckIcon size={14} className="text-copper" />,
  delivered: <CheckCircleIcon size={14} className="text-mint" />,
  completed: <ShieldCheckIcon size={14} className="text-mint" />,
  rejected: <AlertCircleIcon size={14} className="text-rose" />,
  cancelled: <XIcon size={14} className="text-rose" />,
  disputed: <AlertCircleIcon size={14} className="text-rose" />,
  failed: <AlertCircleIcon size={14} className="text-rose" />,
};

/* ── SectionHeader ──────────────────────────────────────── */

function SectionHeader({ number, title, icon }: { number: number; title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-ink/10">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
        {number}
      </span>
      <span className="text-ink-4">{icon}</span>
      <h3 className="font-display text-base font-semibold">{title}</h3>
    </div>
  );
}

/* ── Component ──────────────────────────────────────────── */

export function OrderDetailPage() {
  const { id } = useParams();
  usePageTitle(`Order ${id?.slice(0, 8) ?? ''}`);
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');
  const [reordering, setReordering] = useState(false);
  const [reorderMsg, setReorderMsg] = useState('');

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/purchase-orders/${id}`),
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['payments', id],
    queryFn: () =>
      api.get<{
        payments: Array<{
          id: string;
          status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'chargeback' | 'refunded';
          amountCents: number;
        }>;
      }>(`/payments/by-po/${id}`),
    enabled: !!id,
  });

  // Latest confirmed payment is the refund target. Refunds on failed or pending
  // payments are meaningless and rejected by the API anyway.
  const refundablePayment = useMemo(() => {
    const confirmed = (paymentsData?.payments ?? [])
      .filter((p) => p.status === 'confirmed')
      .sort((a, b) => b.amountCents - a.amountCents);
    return confirmed[0] ?? null;
  }, [paymentsData]);

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

  async function confirmReceipt() {
    if (!data || data.order.status !== 'delivered') return;
    setErr('');
    setConfirming(true);
    try {
      await api.post(`/purchase-orders/${id}/transition`, { to: 'completed' });
      await refetch();
      void qc.invalidateQueries({ queryKey: ['payments', id] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not confirm receipt');
    } finally {
      setConfirming(false);
    }
  }

  async function submitRefund() {
    if (!refundablePayment) return;
    setRefundMsg('');
    setRefundSubmitting(true);
    try {
      await api.post(`/refunds/${refundablePayment.id}/refund`, {
        reason: refundReason.trim() || 'Buyer requested refund',
      });
      setRefundMsg('Refund requested. You will be notified when it completes.');
      setRefundOpen(false);
      setRefundReason('');
      void qc.invalidateQueries({ queryKey: ['payments', id] });
    } catch (e) {
      setRefundMsg(e instanceof ApiError ? e.message : 'Refund request failed');
    } finally {
      setRefundSubmitting(false);
    }
  }

  async function reorder() {
    if (!data || !id) return;
    if (data.order.status !== 'delivered' && data.order.status !== 'completed') return;
    setReorderMsg('');
    setReordering(true);
    try {
      await api.post(`/purchase-orders/${id}/reorder`);
      setReorderMsg('Reorder placed. New order(s) are now in your orders list.');
      void qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) {
      setReorderMsg(
        e instanceof ApiError
          ? e.message
          : 'Could not reorder — some items may no longer be available.',
      );
    } finally {
      setReordering(false);
    }
  }

  // Allowed transitions and default selection — MUST stay above early returns
  const allowed = useMemo(() => {
    if (!data?.order?.status) return [];
    return allowedTransitionsFor(data.order.status);
  }, [data?.order?.status]);

  useEffect(() => {
    const next = allowed[0];
    if (next) setTo(next);
  }, [allowed]);

  /* ── Loading / Error states ────────────────────────────── */

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-4 w-24 bg-mist rounded" />
        <div className="h-10 w-80 bg-mist rounded" />
        <div className="h-28 bg-mist rounded-2xl" />
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-64 bg-mist rounded-2xl" />
          <div className="lg:col-span-4 h-80 bg-mist rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto py-16 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-mist mb-6">
          <FileTextIcon size={28} className="text-ink-4" />
        </div>
        <h2 className="vyro-display text-3xl mb-2">Order not found</h2>
        <p className="text-ink-4 text-sm mb-6">
          This purchase order may have been removed or you may not have access.
        </p>
        <Link to="/orders">
          <Button variant="secondary">
            <ArrowLeftIcon size={14} /> Back to Orders
          </Button>
        </Link>
      </div>
    );
  }

  const { order, items, events } = data;
  const isTerminal = ['rejected', 'cancelled', 'disputed', 'failed'].includes(order.status);
  const totalDiscount = items.reduce((sum, it) => {
    if (!it.discountPctSnapshot || it.discountPctSnapshot <= 0) return sum;
    const gross = it.unitPriceCents * it.quantity;
    return sum + Math.round(gross * (it.discountPctSnapshot / 100));
  }, 0);

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink transition-colors">
        <ArrowLeftIcon size={14} /> Back to Orders
      </Link>

      {/* ── Hero Header ─────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-ink/10 bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600/10">
                <FileTextIcon size={20} className="text-emerald-600" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-ink-4 font-semibold">Purchase Order</div>
                <h1 className="vyro-metric text-2xl sm:text-3xl tracking-tight">{order.poNumber}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={order.status as OrderStatus}>{statusLabel(order.status)}</StatusBadge>
              <span className="text-[11px] text-ink-4 flex items-center gap-1">
                <CalendarIcon size={12} />
                {formatDate(order.createdAt)}
              </span>
            </div>
          </div>
          <div className="sm:text-right space-y-1">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4 font-semibold">Order Total</div>
            <MetricNumber>{formatLKR(order.totalCents)}</MetricNumber>
            {totalDiscount > 0 && (
              <div className="text-[11px] text-emerald-600 font-semibold">
                Volume savings: {formatLKR(totalDiscount)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Journey Stepper ──────────────────────────────── */}
      <Surface kind="ink" className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-volt font-semibold">Order Journey</div>
          {isTerminal && (
            <Badge variant="danger">{statusLabel(order.status)}</Badge>
          )}
        </div>
        <FlowLine tone="paper" nodes={journeyState(order.status)} />
      </Surface>

      <ErrorBanner message={err} />

      {/* ── Main 2-Column Layout ─────────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* ── Left Column: Order Details ──────────────── */}
        <div className="lg:col-span-8 space-y-6">
          {/* Line Items */}
          <Surface className="p-0 overflow-hidden">
            <SectionHeader number={1} title={`Line Items (${items.length})`} icon={<PackageIcon size={16} />} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-ink-4 text-left bg-slate-50/50">
                    <th className="px-6 py-3 font-medium w-8">#</th>
                    <th className="px-3 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 font-medium text-center">Qty</th>
                    <th className="px-3 py-3 font-medium text-right">Unit Price</th>
                    <th className="px-6 py-3 font-medium text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id} className="border-t border-ink/5 hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4 text-ink-4 text-xs vyro-metric">{i + 1}</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 shrink-0">
                            <PackageIcon size={16} className="text-emerald-600" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{it.productNameSnapshot}</div>
                            {(it.discountPctSnapshot ?? 0) > 0 && (
                              <Badge variant="success" className="mt-1">
                                −{it.discountPctSnapshot}% volume discount
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center">
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-7 rounded-md bg-slate-100 vyro-metric text-sm">
                          {it.quantity}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-right vyro-metric text-sm">{formatLKR(it.unitPriceCents)}</td>
                      <td className="px-6 py-4 text-right vyro-metric text-sm font-semibold">{formatLKR(it.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink/10 bg-slate-50/40">
                    <td colSpan={4} className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-4">
                      {totalDiscount > 0 ? 'Subtotal after discounts' : 'Order Total'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="vyro-metric text-base font-bold">{formatLKR(order.totalCents)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Surface>

          {/* Delivery Address */}
          <Surface className="p-0 overflow-hidden">
            <SectionHeader number={2} title="Delivery Details" icon={<TruckIcon size={16} />} />
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 shrink-0">
                  <MapPinIcon size={18} className="text-blue-600" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4 font-semibold">Shipping Address</div>
                  <p className="text-sm font-medium">{order.deliveryAddress}</p>
                  <p className="text-sm text-ink-3">
                    {order.deliveryCity}, {order.deliveryDistrict}
                  </p>
                </div>
              </div>
              {order.notes && (
                <div className="mt-4 pt-4 border-t border-ink/5">
                  <div className="flex items-start gap-3">
                    <FileTextIcon size={14} className="text-ink-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4 font-semibold mb-1">Delivery Notes</div>
                      <p className="text-sm text-ink-3">{order.notes}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Surface>

          {/* Event Timeline */}
          <Surface className="p-0 overflow-hidden">
            <SectionHeader number={3} title="Activity Timeline" icon={<ClockIcon size={16} />} />
            <div className="p-6">
              <ol className="relative space-y-0">
                {events.map((e, i) => (
                  <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* Vertical connector line */}
                    {i < events.length - 1 && (
                      <span className="absolute left-[11px] top-7 bottom-0 w-px bg-ink/10" />
                    )}
                    {/* Status dot */}
                    <div className="relative z-[1] flex items-center justify-center w-6 h-6 rounded-full bg-white border-2 border-ink/10 shrink-0 mt-0.5">
                      {STATUS_ICON_MAP[e.toStatus] ?? <span className="w-2 h-2 rounded-full bg-ink-4" />}
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={e.toStatus as OrderStatus}>{statusLabel(e.toStatus)}</StatusBadge>
                        {e.fromStatus && (
                          <span className="text-[10px] text-ink-4">
                            from {statusLabel(e.fromStatus)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-4 mt-1 vyro-metric">
                        {formatDateTime(e.createdAt)}
                      </div>
                      {e.reason && (
                        <p className="text-xs text-ink-3 mt-1 italic">
                          &ldquo;{e.reason}&rdquo;
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Surface>

          {/* Messages */}
          <MessageThread purchaseOrderId={order.id} />
        </div>

        {/* ── Right Column: Payment & Actions ─────────── */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Payment Panel */}
          <PaymentPanel
            purchaseOrderId={order.id}
            poStatus={order.status}
            totalCents={order.totalCents}
          />

          {/* Confirm Receipt */}
          {order.status === 'delivered' && (
            <Surface className="overflow-hidden">
              <div className="border-l-4 border-emerald-500 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon size={18} className="text-emerald-600" />
                  <h3 className="font-display text-base font-semibold">Confirm Receipt</h3>
                </div>
                <p className="text-xs text-ink-4 leading-relaxed">
                  Goods arrived in full and in good condition? Marking complete releases any held funds to the supplier.
                </p>
                <Button onClick={confirmReceipt} loading={confirming} className="w-full">
                  <CheckCircleIcon size={14} /> Yes — Confirm Receipt
                </Button>
              </div>
            </Surface>
          )}

          {/* Request Refund */}
          {(order.status === 'delivered' || order.status === 'completed') && (
            <Surface className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCardIcon size={16} className="text-ink-4" />
                <h3 className="font-display text-base font-semibold">Request a Refund</h3>
              </div>
              {!refundablePayment ? (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-ink-4">
                    Refunds are only available on confirmed payments. This order has no confirmed payment yet.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-ink-4 leading-relaxed">
                    Opens a refund for the most recent confirmed payment ({formatLKR(refundablePayment.amountCents)}).
                    Admin will review and notify you.
                  </p>
                  <Button
                    variant="danger"
                    onClick={() => setRefundOpen(true)}
                    className="w-full"
                    disabled={!refundablePayment}
                  >
                    Request Refund
                  </Button>
                </>
              )}
              {refundMsg && (
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-700">{refundMsg}</p>
                </div>
              )}
            </Surface>
          )}

          {/* Reorder */}
          {(order.status === 'delivered' || order.status === 'completed') && (
            <Surface className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCwIcon size={16} className="text-ink-4" />
                <h3 className="font-display text-base font-semibold">Reorder Items</h3>
              </div>
              <p className="text-xs text-ink-4 leading-relaxed">
                Creates a new order at today's prices. Each supplier on this order becomes its own new PO.
              </p>
              <Button
                variant="secondary"
                onClick={reorder}
                loading={reordering}
                className="w-full"
              >
                <RefreshCwIcon size={14} /> Reorder
              </Button>
              {reorderMsg && (
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-blue-700">{reorderMsg}</p>
                </div>
              )}
            </Surface>
          )}

          {/* Update Status */}
          {allowed.length > 0 && (
            <Surface className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ClockIcon size={16} className="text-ink-4" />
                <h3 className="font-display text-base font-semibold">Update Status</h3>
              </div>
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {allowed.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                onClick={transition}
                loading={loading}
                variant={to === 'cancelled' || to === 'disputed' ? 'danger' : 'primary'}
                className="w-full"
              >
                Apply Status Change
              </Button>
            </Surface>
          )}

          {/* Quick Info */}
          <div className="rounded-xl bg-slate-50 border border-ink/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-ink-4 font-semibold">
              <ShieldCheckIcon size={12} /> Order Information
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-ink-4">Status</span>
                <div className="mt-0.5 font-medium">{statusLabel(order.status)}</div>
              </div>
              <div>
                <span className="text-ink-4">Created</span>
                <div className="mt-0.5 font-medium">{formatDate(order.createdAt)}</div>
              </div>
              <div>
                <span className="text-ink-4">Items</span>
                <div className="mt-0.5 font-medium">{items.length}</div>
              </div>
              <div>
                <span className="text-ink-4">Events</span>
                <div className="mt-0.5 font-medium">{events.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Refund Modal ─────────────────────────────────── */}
      {refundOpen && refundablePayment && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
          onClick={() => !refundSubmitting && setRefundOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-ink/10 shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-ink/10 bg-rose-50/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-100">
                  <CreditCardIcon size={18} className="text-rose" />
                </div>
                <div>
                  <h2 id="refund-modal-title" className="font-display text-xl font-semibold">
                    Request a Refund
                  </h2>
                  <p className="text-xs text-ink-4 mt-0.5">Payment {refundablePayment.id.slice(0, 8)}</p>
                </div>
              </div>
              <button
                onClick={() => !refundSubmitting && setRefundOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink/5 transition-colors"
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-ink/5 p-4 text-center">
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4 font-semibold">Refund Amount</div>
                <div className="vyro-metric text-2xl mt-1">{formatLKR(refundablePayment.amountCents)}</div>
              </div>

              <p className="text-sm text-ink-3">
                Admin will review your request and notify you when funds are returned.
              </p>

              <div>
                <label className="block text-xs uppercase tracking-[0.14em] text-ink-4 font-semibold mb-2">
                  Reason for refund
                </label>
                <textarea
                  className="w-full min-h-[96px] rounded-xl border border-ink/10 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all resize-none"
                  maxLength={500}
                  placeholder="e.g. 12 of 50 units arrived damaged."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
                <div className="text-right text-[10px] text-ink-4 mt-1">{refundReason.length}/500</div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button variant="ghost" onClick={() => setRefundOpen(false)} disabled={refundSubmitting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={submitRefund}
                disabled={refundSubmitting || !refundReason.trim()}
              >
                Submit Refund Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
