import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import {
  Button,
  ErrorBanner,
  SuccessBanner,
  Textarea,
  Label,
  StatusBadge,
  Badge,
} from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { allowedTransitions, type OrderStatus as SharedOrderStatus } from '@vyro/shared';
import { formatLKR } from '@/lib/format';
import {
  formatLifecycleDate,
  invoiceTypeLabel,
  lifecycleErrorMessage,
  podPhotoUrl,
  type LifecycleOrderDetail,
  type LifecycleOrderFields,
} from '@/lib/orderLifecycle';
import {
  PaymentStateBadge,
  PaymentSummaryList,
  ReasonDialog,
} from '@/components/orders/LifecycleUi';
import { BuyerReturnsList, RequestReturnDialog } from '@/components/orders/ReturnsPanels';
import {
  ArrowLeftIcon,
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
  PlusIcon,
  MinusIcon,
  SparklesIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  BanknoteIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  UserIcon,
  CopyIcon,
  CheckCheckIcon,
} from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { MessageThread } from '@/components/MessageThread';
import { PaymentPanel } from '@/components/payments/PaymentPanel';
import { WireInstructionsPanel } from '@/components/payments/WireInstructionsPanel';
import { ThreeWayReconciliationCard } from '@/components/reconciliation/ThreeWayReconciliationCard';
import { cn } from '@vyro/ui';
import { useToast } from '@vyro/ui';
import { ReviewForm } from '@/reviews/ReviewForm';
import { useReviewEligibility } from '@/reviews/useReviewEligibility';
import { ReorderButton } from '@/components/ReorderButton';

type OrderDetail = LifecycleOrderDetail<
  LifecycleOrderFields & {
    direction: 'domestic' | 'export' | 'import';
    paymentMethod: 'payhere' | 'wire';
  }
>;

interface PoInvoice {
  id: string;
  number: string;
  type: string;
  totalCents: number;
  issuedAt: number;
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

const JOURNEY_LABEL_INDEX: Record<(typeof JOURNEY)[number], number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready_for_pickup: 3,
  out_for_delivery: 3,
  delivered: 4,
  completed: 4,
};

function journeyState(status: string): Array<{ label: string; hint: string; state: 'done' | 'active' | 'idle' }> {
  const labels: Array<{ label: string; hint: string }> = [
    { label: 'Order', hint: 'Created' },
    { label: 'Supplier', hint: 'Acknowledged' },
    { label: 'Preparation', hint: 'Picking & packing' },
    { label: 'Delivery', hint: 'En route / pickup' },
    { label: 'Business', hint: 'Received & settled' },
  ];
  if (status === 'rejected' || status === 'cancelled' || status === 'disputed' || status === 'failed') {
    return labels.map((node, i) => ({
      label: node.label,
      hint: node.hint,
      state: (i === 0 ? 'active' : 'idle') as 'done' | 'active' | 'idle',
    }));
  }
  const active = JOURNEY_LABEL_INDEX[status as (typeof JOURNEY)[number]] ?? 0;
  return labels.map((node, i) => ({
    label: node.label,
    hint: node.hint,
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

const STATUS_ICON_MAP: Record<string, { icon: React.ReactNode; tone: 'volt' | 'amber' | 'mint' | 'copper' | 'rose' | 'ink' }> = {
  pending: { icon: <ClockIcon size={14} />, tone: 'amber' },
  accepted: { icon: <CheckCircleIcon size={14} />, tone: 'volt' },
  preparing: { icon: <PackageIcon size={14} />, tone: 'volt' },
  ready_for_pickup: { icon: <PackageIcon size={14} />, tone: 'copper' },
  out_for_delivery: { icon: <TruckIcon size={14} />, tone: 'copper' },
  delivered: { icon: <CheckCircleIcon size={14} />, tone: 'mint' },
  completed: { icon: <ShieldCheckIcon size={14} />, tone: 'mint' },
  rejected: { icon: <AlertCircleIcon size={14} />, tone: 'rose' },
  cancelled: { icon: <XIcon size={14} />, tone: 'rose' },
  disputed: { icon: <AlertCircleIcon size={14} />, tone: 'rose' },
  failed: { icon: <AlertCircleIcon size={14} />, tone: 'rose' },
};

const TONE_BG: Record<string, string> = {
  volt: 'bg-volt/15 text-volt-deep',
  amber: 'bg-amber/15 text-amber',
  mint: 'bg-mint/15 text-mint',
  copper: 'bg-copper/15 text-copper-deep',
  rose: 'bg-rose/15 text-rose',
  ink: 'bg-ink/10 text-ink-3',
};

/* ── Component ──────────────────────────────────────────── */

export function OrderDetailPage() {
  const { id } = useParams();
  usePageTitle(`Order ${id?.slice(0, 8) ?? ''}`);
  const qc = useQueryClient();
  const toast = useToast();
  const [err, setErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reasonFor, setReasonFor] = useState<'cancelled' | 'disputed' | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');

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

  const { data: invoicesData } = useQuery({
    queryKey: ['po-invoices', id],
    queryFn: () => api.get<{ invoices: PoInvoice[] }>(`/invoices?poId=${id}`),
    enabled: !!id,
    retry: false,
  });

  const refundablePayment = useMemo(() => {
    const confirmed = (paymentsData?.payments ?? [])
      .filter((p) => p.status === 'confirmed')
      .sort((a, b) => b.amountCents - a.amountCents);
    return confirmed[0] ?? null;
  }, [paymentsData]);

  /** Reason-carrying transitions (cancel / dispute). Throws so the dialog shows the error. */
  async function transitionWithReason(to: 'cancelled' | 'disputed', reason: string) {
    setErr('');
    setSuccessMsg('');
    await api.post(`/purchase-orders/${id}/transition`, { to, reason });
    await refetch();
    void qc.invalidateQueries({ queryKey: ['payments', id] });
    setSuccessMsg(
      to === 'cancelled'
        ? 'Order cancelled. Any captured payment is refunded automatically.'
        : 'Dispute opened. The Vyro trust team will review it.',
    );
    toast.show(toast.success(to === 'cancelled' ? 'Order cancelled' : 'Dispute opened'));
  }

  async function refreshAll() {
    await refetch();
    void qc.invalidateQueries({ queryKey: ['po-invoices', id] });
  }

  async function confirmReceipt() {
    if (!data || data.order.status !== 'delivered') return;
    setErr('');
    setConfirming(true);
    try {
      await api.post(`/purchase-orders/${id}/transition`, { to: 'completed' });
      await refetch();
      void qc.invalidateQueries({ queryKey: ['payments', id] });
      setSuccessMsg('Receipt confirmed. Funds released to the supplier.');
      toast.show(toast.success('Receipt confirmed · funds released'));
    } catch (e) {
      setErr(lifecycleErrorMessage(e, 'Could not confirm receipt'));
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

  const allowed = useMemo<SharedOrderStatus[]>(() => {
    if (data?.lifecycle) return data.lifecycle.allowedTransitions;
    if (!data?.order?.status) return [];
    return allowedTransitions(data.order.status as SharedOrderStatus, 'business');
  }, [data?.lifecycle, data?.order?.status]);

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

  const { order, items, events, paymentSummary, delivery, returns = [], lifecycle } = data;
  const now = Date.now();
  const disputeWindowOpen = !lifecycle?.disputeWindowEndsAt || lifecycle.disputeWindowEndsAt > now;
  const canDispute = allowed.includes('disputed') && disputeWindowOpen;
  const canCancel = allowed.includes('cancelled');
  const canRequestReturn =
    (lifecycle?.returnsEnabled ?? false) &&
    (order.status === 'delivered' || order.status === 'completed') &&
    !!lifecycle?.returnWindowEndsAt &&
    lifecycle.returnWindowEndsAt > now;
  const showReturns = returns.length > 0 || canRequestReturn;
  const partiallyFulfilled = order.originalTotalCents != null && order.originalTotalCents !== order.totalCents;
  const invoices = invoicesData?.invoices ?? [];
  const hasDeliveryInfo =
    !!delivery &&
    !!(delivery.carrier || delivery.trackingNumber || delivery.recipientName || delivery.podNote || delivery.hasPodPhoto);
  const isTerminal = ['rejected', 'cancelled', 'disputed', 'failed'].includes(order.status);
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const totalDiscount = items.reduce((sum, it) => {
    if (!it.discountPctSnapshot || it.discountPctSnapshot <= 0) return sum;
    const gross = it.unitPriceCents * it.quantity;
    return sum + Math.round(gross * (it.discountPctSnapshot / 100));
  }, 0);
  const statusTone = STATUS_ICON_MAP[order.status]?.tone ?? 'ink';
  const statusIcon = STATUS_ICON_MAP[order.status]?.icon;

  const copyPo = () => {
    navigator.clipboard?.writeText(order.poNumber).catch(() => {});
    toast.show(toast.success('PO number copied'));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-1 transition-colors"
        >
          <ArrowLeftIcon size={14} /> Back to Orders
        </Link>
        <div className="flex items-center gap-2 text-[11px] font-mono text-ink-3">
          <span>Order ID</span>
          <span className="font-mono text-ink-1">{order.id.slice(0, 16)}</span>
          <button
            onClick={copyPo}
            className="inline-flex items-center gap-1 text-copper hover:text-ink transition-colors"
            title="Copy PO number"
          >
            <CopyIcon size={12} />
          </button>
        </div>
      </div>

      {/* ── Hero Header ─────────────────────────────────── */}
      <Surface className="p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-copper/10 text-copper-deep border border-copper/30">
                <span className="size-1.5 rounded-full bg-copper animate-pulse" />
                Purchase order
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border',
                  statusTone === 'mint' && 'bg-mint/15 text-mint border-mint/30',
                  statusTone === 'volt' && 'bg-volt/15 text-ink-1 border-volt/30',
                  statusTone === 'amber' && 'bg-amber/15 text-amber border-amber/30',
                  statusTone === 'rose' && 'bg-rose/15 text-rose border-rose/30',
                  statusTone === 'copper' && 'bg-copper/15 text-copper-deep border-copper/30',
                  statusTone === 'ink' && 'bg-ink/10 text-ink-3 border-ink/20',
                )}
              >
                {statusIcon}
                {statusLabel(order.status)}
              </span>
              <PaymentStateBadge state={paymentSummary?.state} />
            </div>
            <h1 className="vyro-display text-4xl sm:text-5xl text-balance text-ink leading-[0.95]">
              {order.poNumber}
            </h1>
            <div className="flex items-center gap-3 flex-wrap text-xs text-ink-3">
              <span className="inline-flex items-center gap-1.5 font-mono">
                <CalendarIcon size={12} className="text-copper" />
                Issued {formatDate(order.createdAt)}
              </span>
              <span className="text-ink-5">·</span>
              <span className="inline-flex items-center gap-1.5 font-mono">
                <PackageIcon size={12} className="text-copper" />
                {items.length} line{items.length === 1 ? '' : 's'} · {totalQty.toLocaleString()} units
              </span>
            </div>
          </div>

          {/* Right side: total + savings strip */}
          <div className="lg:text-right space-y-2 lg:min-w-[16rem]">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-4 font-bold">
              Order total
            </div>
            <MetricNumber className="text-ink-1">{formatLKR(order.totalCents)}</MetricNumber>
            {totalDiscount > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-bold text-mint bg-mint/10 border border-mint/30">
                <SparklesIcon size={11} />
                Volume savings: {formatLKR(totalDiscount)}
              </div>
            )}
          </div>
        </div>
      </Surface>

      {/* ── Journey Stepper ──────────────────────────────── */}
      <Surface kind="ink" className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-mono text-volt uppercase tracking-wider font-bold">
              Order journey
            </div>
            <h2 className="font-display text-lg text-paper font-semibold mt-0.5">
              End-to-end dispatch to settlement
            </h2>
          </div>
          {isTerminal && <Badge variant="danger">{statusLabel(order.status)}</Badge>}
        </div>
        <FlowLine tone="paper" nodes={journeyState(order.status)} />
      </Surface>

      <ErrorBanner message={err} />
      {successMsg && <SuccessBanner message={successMsg} />}
      {partiallyFulfilled && (
        <div className="flex items-start gap-3 bg-amber/10 text-amber text-sm p-4 rounded-xl">
          <AlertCircleIcon size={18} className="shrink-0 mt-0.5" />
          <div className="font-medium">
            Supplier could fulfil part of this order; new total {formatLKR(order.totalCents)} (was{' '}
            {formatLKR(order.originalTotalCents ?? order.totalCents)}). Any overpayment is refunded automatically.
          </div>
        </div>
      )}

      {/* ── Main 2-Column Layout ─────────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* ── Left Column: Order Details ──────────────── */}
        <div className="lg:col-span-8 space-y-5">
          {/* Line Items */}
          <SectionCard
            step={1}
            eyebrow="Items"
            title={`Line items (${items.length})`}
            sub="Wholesale products on this purchase order"
            countLabel={`${totalQty.toLocaleString()} units`}
            countTone="volt"
            icon={<PackageIcon size={16} />}
          >
            {items.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-4">
                No line items on this order.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 text-left border-b border-ink/10">
                      <th className="py-3 font-bold w-8">#</th>
                      <th className="py-3 font-bold">Product</th>
                      <th className="py-3 font-bold text-center">Qty</th>
                      <th className="py-3 font-bold text-right">Unit price</th>
                      <th className="py-3 font-bold text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {items.map((it, i) => (
                      <tr key={it.id} className="hover:bg-bone/40 transition-colors">
                        <td className="py-4 text-ink-4 text-xs font-mono">{i + 1}</td>
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-bone text-ink-2 shrink-0 border border-ink/5">
                              <PackageIcon size={16} className="text-ink-3" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-display font-semibold text-ink-1 text-sm leading-snug">
                                {it.productNameSnapshot}
                              </div>
                              {(it.discountPctSnapshot ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 text-[10px] font-mono font-bold text-mint bg-mint/10 border border-mint/30">
                                  −{it.discountPctSnapshot}% volume discount
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          {it.requestedQuantity != null && it.requestedQuantity !== it.quantity ? (
                            <span className="inline-flex items-center gap-1 font-mono text-sm" title="Requested → accepted">
                              <span className="line-through text-ink-4">{it.requestedQuantity}</span>
                              <ArrowRightIcon size={10} className="text-ink-4" />
                              <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-md bg-amber/10 font-semibold text-ink-1 border border-amber/30">
                                {it.quantity}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-md bg-bone font-mono text-sm font-semibold text-ink-1 border border-ink/5">
                              {it.quantity}
                            </span>
                          )}
                          {it.fulfilmentStatus === 'unavailable' && (
                            <div className="text-[10px] text-rose mt-1">
                              Unavailable{it.unavailableReason ? ` — ${it.unavailableReason}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-4 text-right font-mono text-sm text-ink-2">
                          {formatLKR(it.unitPriceCents)}
                        </td>
                        <td className="py-4 text-right font-mono text-sm font-bold text-ink-1">
                          {formatLKR(it.lineTotalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {totalDiscount > 0 && (
                      <tr className="border-t border-ink/5 bg-mint/[0.06]">
                        <td colSpan={4} className="py-2 px-2 text-right text-[11px] font-mono uppercase tracking-wider text-mint font-bold">
                          Volume savings applied
                        </td>
                        <td className="py-2 text-right font-mono text-sm font-bold text-mint">
                          −{formatLKR(totalDiscount)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t-2 border-ink/10 bg-bone/40">
                      <td colSpan={4} className="py-3 px-2 text-right text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                        {totalDiscount > 0 ? 'Subtotal after discounts' : 'Order total'}
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-mono text-lg font-bold text-ink-1">
                          {formatLKR(order.totalCents)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>

          {/* 3-Way PO & Invoice Reconciliation */}
          {order && (
            <ThreeWayReconciliationCard
              orderId={order.id}
              poNumber={order.poNumber}
              poTotalCents={order.totalCents}
              orderStatus={order.status}
              onReleasePayment={() => {
                void confirmReceipt();
              }}
            />
          )}

          {/* Delivery Details */}
          <SectionCard
            step={2}
            eyebrow="Logistics"
            title="Delivery details"
            sub="Receiving dock and special instructions"
            icon={<TruckIcon size={16} />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-ink/10 bg-bone/30 flex items-start gap-3">
                <div className="size-10 rounded-lg bg-ink text-volt flex items-center justify-center shrink-0">
                  <MapPinIcon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                    Receiving dock
                  </div>
                  <p className="text-sm font-semibold text-ink-1 mt-1">{order.deliveryAddress}</p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    {order.deliveryCity}, {order.deliveryDistrict}
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-ink/10 bg-bone/30 flex items-start gap-3">
                <div className="size-10 rounded-lg bg-copper/15 text-copper-deep flex items-center justify-center shrink-0">
                  <BanknoteIcon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                    Settlement
                  </div>
                  <p className="text-sm font-semibold text-ink-1 mt-1">
                    Vyro escrow · PayHere / bank wire
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    Funds release on GRN or order completion
                  </p>
                </div>
              </div>
            </div>
            {order.notes && (
              <div className="mt-4 p-4 rounded-xl border border-ink/10 bg-paper-subtle/30">
                <div className="flex items-start gap-3">
                  <FileTextIcon size={14} className="text-copper mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold mb-1">
                      Delivery notes
                    </div>
                    <p className="text-sm text-ink-2 leading-relaxed">{order.notes}</p>
                  </div>
                </div>
              </div>
            )}
            {hasDeliveryInfo && delivery && (
              <div className="mt-4 p-4 rounded-xl border border-ink/10 bg-bone/30 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                  Shipment{delivery.status ? ` · ${statusLabel(delivery.status)}` : ''}
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {delivery.carrier && (
                    <div>
                      <dt className="text-ink-4">Carrier</dt>
                      <dd className="mt-0.5 font-semibold text-ink-1">{delivery.carrier}</dd>
                    </div>
                  )}
                  {delivery.trackingNumber && (
                    <div>
                      <dt className="text-ink-4">Tracking number</dt>
                      <dd className="mt-0.5 font-mono font-semibold text-ink-1">
                        {delivery.trackingUrl ? (
                          <a
                            href={delivery.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-copper hover:underline inline-flex items-center gap-1"
                          >
                            {delivery.trackingNumber} <ExternalLinkIcon size={11} />
                          </a>
                        ) : (
                          delivery.trackingNumber
                        )}
                      </dd>
                    </div>
                  )}
                  {delivery.recipientName && (
                    <div>
                      <dt className="text-ink-4">Received by</dt>
                      <dd className="mt-0.5 font-semibold text-ink-1">{delivery.recipientName}</dd>
                    </div>
                  )}
                  {delivery.deliveredAt && (
                    <div>
                      <dt className="text-ink-4">Delivered</dt>
                      <dd className="mt-0.5 font-mono font-semibold text-ink-1">
                        {formatDateTime(delivery.deliveredAt)}
                      </dd>
                    </div>
                  )}
                </dl>
                {delivery.podNote && (
                  <p className="text-xs text-ink-2 italic bg-paper px-3 py-2 border-l-2 border-copper/40">
                    &ldquo;{delivery.podNote}&rdquo;
                  </p>
                )}
                {delivery.hasPodPhoto && (
                  <a href={podPhotoUrl(order.id)} target="_blank" rel="noopener noreferrer" className="inline-block">
                    <img
                      src={podPhotoUrl(order.id)}
                      alt="Proof of delivery"
                      className="max-h-48 rounded-lg border border-ink/10"
                    />
                  </a>
                )}
              </div>
            )}
          </SectionCard>

          {/* Returns */}
          {showReturns && (
            <SectionCard
              step={3}
              eyebrow="Returns"
              title="Returns"
              sub={
                canRequestReturn && lifecycle?.returnWindowEndsAt
                  ? `You can request a return until ${formatLifecycleDate(lifecycle.returnWindowEndsAt)}`
                  : 'Return requests raised on this order'
              }
              countLabel={`${returns.length} RMA${returns.length === 1 ? '' : 's'}`}
              countTone="copper"
              icon={<RefreshCwIcon size={16} />}
            >
              {canRequestReturn && (
                <Button variant="secondary" size="sm" onClick={() => setReturnOpen(true)}>
                  <RefreshCwIcon size={13} /> Request a return
                </Button>
              )}
              <BuyerReturnsList returns={returns} onChanged={() => void refreshAll()} />
            </SectionCard>
          )}

          {/* Activity Timeline */}
          <SectionCard
            step={showReturns ? 4 : 3}
            eyebrow="History"
            title="Activity timeline"
            sub="Status changes and system events for this purchase order"
            countLabel={`${events.length} event${events.length === 1 ? '' : 's'}`}
            countTone="ink"
            icon={<ClockIcon size={16} />}
          >
            {events.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-4">No events recorded yet.</div>
            ) : (
              <ol className="relative space-y-0">
                {events.map((e, i) => {
                  const tone = STATUS_ICON_MAP[e.toStatus]?.tone ?? 'ink';
                  const icon = STATUS_ICON_MAP[e.toStatus]?.icon ?? (
                    <span className="w-2 h-2 rounded-full bg-ink-4" />
                  );
                  return (
                    <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < events.length - 1 && (
                        <span className="absolute left-[11px] top-7 bottom-0 w-px bg-ink/10" />
                      )}
                      <div
                        className={cn(
                          'relative z-[1] flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 mt-0.5',
                          TONE_BG[tone],
                          'border-paper',
                        )}
                      >
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={e.toStatus as OrderStatus}>
                            {statusLabel(e.toStatus)}
                          </StatusBadge>
                          {e.fromStatus && (
                            <span className="text-[10px] text-ink-4 font-mono">
                              from {statusLabel(e.fromStatus)}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-3 mt-1 font-mono">
                          {formatDateTime(e.createdAt)}
                        </div>
                        {e.reason && (
                          <p className="text-xs text-ink-2 mt-1 italic bg-bone/40 px-3 py-2 border-l-2 border-copper/40">
                            &ldquo;{e.reason}&rdquo;
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>

          {/* Messages */}
          <div>
            <MessageThread purchaseOrderId={order.id} />
          </div>
        </div>

        {/* ── Right Column: Payment & Actions ─────────── */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Confirm Receipt — when delivered */}
          {order.status === 'delivered' && allowed.includes('completed') && (
            <Surface className="overflow-hidden">
              <div className="border-l-4 border-mint p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-mint/15 text-mint flex items-center justify-center">
                    <CheckCircleIcon size={16} />
                  </div>
                  <h3 className="font-display text-base font-semibold text-ink-1">Confirm receipt</h3>
                </div>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Goods arrived in full and in good condition? Marking complete releases any held
                  funds to the supplier.
                </p>
                <Button
                  onClick={confirmReceipt}
                  loading={confirming}
                  className="w-full bg-mint text-paper hover:bg-mint/90"
                >
                  <CheckCheckIcon size={14} /> Yes — Confirm receipt
                </Button>
                {lifecycle?.autoCompleteAt && (
                  <p className="text-[11px] text-ink-4 flex items-center gap-1.5">
                    <ClockIcon size={11} /> Auto-completes on {formatLifecycleDate(lifecycle.autoCompleteAt)}
                    {returns.some((r) => ['requested', 'approved', 'received'].includes(r.status)) &&
                      ' (paused while a return is open)'}
                  </p>
                )}
              </div>
            </Surface>
          )}

          {/* Rate supplier — once delivered */}
          {order.status === 'delivered' && <RateSupplierBlock orderId={order.id} />}

          {/* Payment position */}
          {paymentSummary && (
            <Surface className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                  <BanknoteIcon size={12} className="text-copper" /> Payment summary
                </div>
                <PaymentStateBadge state={paymentSummary.state} />
              </div>
              <PaymentSummaryList summary={paymentSummary} />
            </Surface>
          )}

          {/* Payment Panel */}
          <PaymentPanel
            purchaseOrderId={order.id}
            poStatus={order.status}
            totalCents={order.totalCents}
          />

          {/* Wire Instructions — cross-border orders only */}
          {order.direction !== 'domestic' && order.paymentMethod === 'wire' && (
            <WireInstructionsPanel purchaseOrderId={order.id} poStatus={order.status} />
          )}

          {/* Quick info grid */}
          <Surface className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
              <ShieldCheckIcon size={12} className="text-copper" /> Order information
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <dt className="text-ink-4">Status</dt>
                <dd className="mt-0.5 font-semibold text-ink-1">{statusLabel(order.status)}</dd>
              </div>
              <div>
                <dt className="text-ink-4">Issued</dt>
                <dd className="mt-0.5 font-mono font-semibold text-ink-1">
                  {formatDate(order.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-4">Line items</dt>
                <dd className="mt-0.5 font-mono font-semibold text-ink-1">{items.length}</dd>
              </div>
              <div>
                <dt className="text-ink-4">Total units</dt>
                <dd className="mt-0.5 font-mono font-semibold text-ink-1">
                  {totalQty.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-ink-4">Subtotal</dt>
                <dd className="mt-0.5 font-mono font-semibold text-ink-1">
                  {formatLKR(order.subtotalCents)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-4">Total</dt>
                <dd className="mt-0.5 font-mono font-bold text-ink-1">
                  {formatLKR(order.totalCents)}
                </dd>
              </div>
            </dl>
          </Surface>

          {/* Order actions (driven by lifecycle.allowedTransitions) */}
          {(canCancel || allowed.includes('disputed')) && (
            <Surface className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-ink/10 text-ink-2 flex items-center justify-center">
                  <ClockIcon size={16} />
                </div>
                <h3 className="font-display text-base font-semibold text-ink-1">Order actions</h3>
              </div>
              {canCancel && (
                <div className="space-y-1.5">
                  <Button variant="danger" className="w-full" onClick={() => setReasonFor('cancelled')}>
                    <XIcon size={14} /> Cancel order
                  </Button>
                  <p className="text-[10px] text-ink-4 leading-relaxed">
                    Any captured payment is refunded automatically.
                  </p>
                </div>
              )}
              {allowed.includes('disputed') &&
                (canDispute ? (
                  <div className="space-y-1.5">
                    <Button variant="secondary" className="w-full" onClick={() => setReasonFor('disputed')}>
                      <AlertCircleIcon size={14} /> Open dispute
                    </Button>
                    {lifecycle?.disputeWindowEndsAt && (
                      <p className="text-[10px] text-ink-4 leading-relaxed">
                        You can open a dispute until {formatLifecycleDate(lifecycle.disputeWindowEndsAt)}.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-ink-4">The dispute window for this order has closed.</p>
                ))}
            </Surface>
          )}

          {/* Invoices & credit notes */}
          {invoices.length > 0 && (
            <Surface className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                <FileTextIcon size={12} className="text-copper" /> Invoices
              </div>
              <ul className="divide-y divide-ink/5">
                {invoices.map((inv) => (
                  <li key={inv.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <Link
                      to={`/orders/${order.id}/invoice/${inv.id}`}
                      className="min-w-0 hover:text-copper transition-colors"
                    >
                      <div className="font-mono font-semibold text-ink-1 truncate">{inv.number}</div>
                      <div className={cn('text-[10px] uppercase tracking-wider', inv.type === 'credit_note' ? 'text-mint' : 'text-ink-4')}>
                        {invoiceTypeLabel(inv.type)}
                      </div>
                    </Link>
                    <span className="font-mono font-semibold text-ink-1 shrink-0">
                      {inv.type === 'credit_note' ? '−' : ''}
                      {formatLKR(inv.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </Surface>
          )}

          {/* Reorder */}
          <ReorderButton orderId={order.id} orderStatus={order.status} />

          {/* Request Refund */}
          {(order.status === 'delivered' || order.status === 'completed') && (
            <Surface className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-rose/15 text-rose flex items-center justify-center">
                  <CreditCardIcon size={16} />
                </div>
                <h3 className="font-display text-base font-semibold text-ink-1">
                  Request a refund
                </h3>
              </div>
              {!refundablePayment ? (
                <div className="rounded-lg bg-bone/40 p-3 border border-ink/5">
                  <p className="text-xs text-ink-3">
                    Refunds are only available on confirmed payments. This order has no confirmed
                    payment yet.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Opens a refund for the most recent confirmed payment (
                    <span className="font-mono font-semibold text-ink-1">
                      {formatLKR(refundablePayment.amountCents)}
                    </span>
                    ). Admin will review and notify you.
                  </p>
                  <Button
                    variant="danger"
                    onClick={() => setRefundOpen(true)}
                    className="w-full"
                    disabled={!refundablePayment}
                  >
                    Request refund
                  </Button>
                </>
              )}
              {refundMsg && (
                <div className="rounded-lg bg-mint/10 border border-mint/30 p-3">
                  <p className="text-xs text-mint font-semibold">{refundMsg}</p>
                </div>
              )}
            </Surface>
          )}

          {/* Help card */}
          <div className="p-4 bg-paper border border-ink/10 flex items-start gap-3">
            <div className="size-8 rounded-md bg-copper/10 text-copper flex items-center justify-center shrink-0">
              <UserIcon size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
                Need help?
              </div>
              <p className="text-xs text-ink-3 leading-relaxed mt-0.5">
                Disputes and refunds are reviewed by the Vyro trust team within 1–2 business days.
              </p>
              <Link
                to="/support"
                className="text-[11px] font-semibold text-copper hover:underline inline-flex items-center gap-1 mt-1"
              >
                Open a support ticket
                <ChevronRightIcon size={10} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <ReasonDialog
        open={reasonFor !== null}
        title={reasonFor === 'disputed' ? 'Open a dispute' : 'Cancel this order'}
        subtitle={order.poNumber}
        description={
          reasonFor === 'disputed' ? (
            <>
              Tell the Vyro trust team what went wrong. Held funds stay in escrow until the dispute is
              resolved.
              {lifecycle?.disputeWindowEndsAt &&
                ` You can open a dispute until ${formatLifecycleDate(lifecycle.disputeWindowEndsAt)}.`}
            </>
          ) : (
            'The supplier is notified and any captured payment is refunded to you automatically.'
          )
        }
        confirmLabel={reasonFor === 'disputed' ? 'Open dispute' : 'Cancel order'}
        placeholder={
          reasonFor === 'disputed' ? 'e.g. 12 of 50 cartons arrived damaged' : 'e.g. Ordered by mistake'
        }
        icon={reasonFor === 'disputed' ? <AlertCircleIcon size={18} /> : <XIcon size={18} />}
        onClose={() => setReasonFor(null)}
        onSubmit={(reason) => transitionWithReason(reasonFor!, reason)}
      />

      {returnOpen && (
        <RequestReturnDialog
          poId={order.id}
          items={items}
          returns={returns}
          onClose={() => setReturnOpen(false)}
          onCreated={() => {
            void refreshAll();
            setSuccessMsg('Return requested. The supplier will review it.');
          }}
        />
      )}

      {/* ── Refund Modal ─────────────────────────────────── */}
      {refundOpen && refundablePayment && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
          onClick={() => !refundSubmitting && setRefundOpen(false)}
        >
          <div
            className="bg-paper rounded-2xl border border-ink/10 shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-ink/10 bg-rose/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-10 rounded-xl bg-rose/15 text-rose">
                  <CreditCardIcon size={18} />
                </div>
                <div>
                  <h2 id="refund-modal-title" className="font-display text-lg font-semibold text-ink-1">
                    Request a refund
                  </h2>
                  <p className="text-[11px] text-ink-3 mt-0.5 font-mono">
                    Payment {refundablePayment.id.slice(0, 12)}…
                  </p>
                </div>
              </div>
              <button
                onClick={() => !refundSubmitting && setRefundOpen(false)}
                className="flex items-center justify-center size-8 rounded-full hover:bg-ink/5 transition-colors text-ink-3"
                aria-label="Close"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-ink text-paper p-4 text-center">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  Refund amount
                </div>
                <div className="font-mono text-3xl mt-1 text-volt">
                  {formatLKR(refundablePayment.amountCents)}
                </div>
              </div>

              <p className="text-xs text-ink-3 leading-relaxed">
                Admin will review your request and notify you when funds are returned. Vyro escrow
                refunds settle within 1–2 business days.
              </p>

              <div>
                <Label htmlFor="refund-reason">Reason for refund</Label>
                <Textarea
                  id="refund-reason"
                  rows={4}
                  maxLength={500}
                  placeholder="e.g. 12 of 50 units arrived damaged."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="bg-paper"
                />
                <div className="text-right text-[10px] text-ink-4 mt-1 font-mono">
                  {refundReason.length}/500
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-ink/10 bg-bone/30">
              <Button
                variant="ghost"
                onClick={() => setRefundOpen(false)}
                disabled={refundSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void submitRefund()}
                disabled={refundSubmitting || !refundReason.trim()}
                loading={refundSubmitting}
              >
                Submit refund request
                <ArrowRightIcon size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Rate-supplier block ---------- */

function RateSupplierBlock({ orderId }: { orderId: string }) {
  const eligibility = useReviewEligibility(orderId);
  const [open, setOpen] = useState(false);

  if (eligibility.isLoading) return null;
  if (!eligibility.canReview) return null;

  return (
    <Surface className="overflow-hidden">
      <div className="border-l-4 border-copper p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-base font-semibold text-ink-1">Rate this supplier</h3>
        </div>
        <p className="text-xs text-ink-3 leading-relaxed">
          Share how the delivery went. Reviews help other buyers and the supplier.
        </p>
        {open ? (
          <ReviewForm
            orderId={orderId}
            onSubmitted={() => {
              setOpen(false);
            }}
          />
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="px-3 py-1 rounded bg-copper text-paper text-sm"
          >
            Write a review
          </button>
        )}
      </div>
    </Surface>
  );
}

/* ---------- Local helpers ---------- */

function SectionCard({
  step,
  eyebrow,
  title,
  sub,
  countLabel,
  countTone,
  icon,
  children,
}: {
  step: number;
  eyebrow: string;
  title: string;
  sub?: string;
  countLabel?: string;
  countTone?: 'mint' | 'ink' | 'volt' | 'amber' | 'copper';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Surface className="p-6 rounded-2xl space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-ink text-volt font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
            {step}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 vyro-kicker text-copper">
              {icon && <span className="text-ink-3">{icon}</span>}
              {eyebrow}
            </div>
            <h2 className="mt-1 text-lg font-bold text-ink-1">{title}</h2>
            {sub && <p className="text-xs text-ink-3 mt-0.5 max-w-xl">{sub}</p>}
          </div>
        </div>
        {countLabel && (
          <span
            className={cn(
              'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border shrink-0',
              countTone === 'mint' && 'bg-mint/15 text-mint border-mint/30',
              countTone === 'ink' && 'bg-ink/10 text-ink-3 border-ink/20',
              countTone === 'volt' && 'bg-volt/15 text-ink-1 border-volt/30',
              countTone === 'amber' && 'bg-amber/15 text-amber border-amber/30',
              countTone === 'copper' && 'bg-copper/15 text-copper-deep border-copper/30',
              !countTone && 'bg-ink/10 text-ink-3 border-ink/20',
            )}
          >
            {countLabel}
          </span>
        )}
      </div>
      {children}
    </Surface>
  );
}
