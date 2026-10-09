import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ThreeWayReconciliationResult } from '@vyro/ai';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError, apiBase } from '@/lib/api';
import { Button, ErrorBanner, SuccessBanner, Textarea, Input, Label } from '@/components/ui';
import { allowedTransitions, type OrderStatus as SharedOrderStatus } from '@vyro/shared';
import { formatLKR } from '@/lib/format';
import { remainingRefundableCents } from '@/lib/refundable';
import {
  formatLifecycleDate,
  invoiceTypeLabel,
  lifecycleErrorMessage,
  podPhotoUrl,
  type LifecycleOrderDetail,
  type LifecycleOrderFields,
} from '@/lib/orderLifecycle';
import { PaymentStateBadge, ReasonDialog } from '@/components/orders/LifecycleUi';
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
  SparklesIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  BanknoteIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  UserIcon,
  CopyIcon,
  CheckCheckIcon,
  CheckIcon,
  SettingsIcon,
} from '@/components/icons';
import { MessageThread } from '@/components/MessageThread';
import { PaymentPanel } from '@/components/payments/PaymentPanel';
import { WireInstructionsPanel } from '@/components/payments/WireInstructionsPanel';
import { ThreeWayReconciliationCard } from '@/components/reconciliation/ThreeWayReconciliationCard';
import { cn } from '@vyro/ui';
import { useToast } from '@vyro/ui';
import { ReviewPromptCard } from '@/reviews/ReviewPromptCard';
import { OrderItemThumb } from '@/components/orders/OrderItemThumb';
import { useReorderFromOrder } from '@/hooks/useReorderFromOrder';

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

function journeyState(
  status: string,
): Array<{ label: string; hint: string; state: 'done' | 'active' | 'idle' }> {
  const labels: Array<{ label: string; hint: string }> = [
    { label: 'Order', hint: 'Created' },
    { label: 'Supplier', hint: 'Acknowledged' },
    { label: 'Preparation', hint: 'Picking & packing' },
    { label: 'Delivery', hint: 'En route / pickup' },
    { label: 'Business', hint: 'Received & settled' },
  ];
  if (
    status === 'rejected' ||
    status === 'cancelled' ||
    status === 'disputed' ||
    status === 'failed'
  ) {
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

type ReturnLike = {
  rmaNumber: string;
  status: string;
  refundCents: number | null;
  requestedAt: number;
  decidedAt: number | null;
  receivedAt: number | null;
  refundedAt: number | null;
  items: Array<{
    quantity: number;
    approvedQuantity: number | null;
    receivedQuantity: number | null;
  }>;
};

const RETURN_PHASE: Record<
  string,
  { label: string; hint: string; tone: 'amber' | 'copper' | 'ink'; open: boolean }
> = {
  requested: {
    label: 'Return requested',
    hint: 'Return requested. Waiting for the supplier to approve it. Payment stays held meanwhile.',
    tone: 'amber',
    open: true,
  },
  approved: {
    label: 'Return approved',
    hint: 'Return approved. Send the goods back to the supplier — your refund is issued once they arrive.',
    tone: 'amber',
    open: true,
  },
  received: {
    label: 'Return received',
    hint: "The supplier has received the returned goods. VYRO is refunding you — you'll be notified once it's paid.",
    tone: 'copper',
    open: true,
  },
};

/**
 * The return that currently defines the order's state (latest non-rejected, non-cancelled RMA),
 * plus whether every delivered unit has been returned and refunded.
 */
function deriveReturnState(returns: ReturnLike[], orderedUnits: number) {
  const live = returns
    .filter((r) => r.status !== 'rejected' && r.status !== 'cancelled')
    .sort((a, b) => b.requestedAt - a.requestedAt);
  const current = live[0];
  if (!current) return null;
  const done = live.filter((r) => r.status === 'refunded' || r.status === 'closed');
  const returnedUnits = done.reduce(
    (n, r) =>
      n +
      r.items.reduce((m, it) => m + (it.receivedQuantity ?? it.approvedQuantity ?? it.quantity), 0),
    0,
  );
  const refundedCents = done.reduce((n, r) => n + (r.refundCents ?? 0), 0);
  const phase = RETURN_PHASE[current.status];
  if (phase) return { current, ...phase, full: false, refundedCents };
  const full = orderedUnits > 0 && returnedUnits >= orderedUnits;
  return {
    current,
    label: full ? 'Returned' : 'Partially returned',
    hint: full
      ? `Returned. ${refundedCents > 0 ? `${formatLKR(refundedCents)} has been refunded to you.` : 'The return is closed.'}`
      : `Partially returned — ${returnedUnits} of ${orderedUnits} units sent back${refundedCents > 0 ? `, ${formatLKR(refundedCents)} refunded` : ''}.`,
    tone: 'ink' as const,
    open: false,
    full,
    refundedCents,
  };
}

const STATUS_ICON_MAP: Record<
  string,
  { icon: React.ReactNode; tone: 'volt' | 'amber' | 'mint' | 'copper' | 'rose' | 'ink' }
> = {
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
  const reorder = useReorderFromOrder();
  const [err, setErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reasonFor, setReasonFor] = useState<'cancelled' | 'disputed' | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
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

  // Doc-intel v2 phase A: persisted auto-reconciliation for the card.
  const { data: autoRecon } = useQuery({
    queryKey: ['po-auto-recon', id],
    queryFn: () =>
      api.get<{
        status: string;
        payload: ThreeWayReconciliationResult | null;
        uploadId?: string;
        createdAt?: number;
      }>(`/documents/by-po/${id}/auto-reconciliation`),
    enabled: !!id,
    retry: false,
  });

  const refundablePayment = useMemo(() => {
    const confirmed = (paymentsData?.payments ?? [])
      .filter((p) => p.status === 'confirmed')
      .sort((a, b) => b.amountCents - a.amountCents);
    return confirmed[0] ?? null;
  }, [paymentsData]);

  const { data: refundsData } = useQuery({
    queryKey: ['payment-refunds', refundablePayment?.id],
    queryFn: () =>
      api.get<{ refunds: Array<{ amountCents: number; status: string }> }>(
        `/refunds/${refundablePayment!.id}/refunds`,
      ),
    enabled: refundOpen && !!refundablePayment,
  });
  const refundRemaining = useMemo(
    () =>
      refundablePayment
        ? remainingRefundableCents(refundablePayment.amountCents, refundsData?.refunds ?? [])
        : 0,
    [refundablePayment, refundsData],
  );
  const refundAmountCents = useMemo(
    () => (refundAmount.trim() === '' ? refundRemaining : Math.round(Number(refundAmount) * 100)),
    [refundAmount, refundRemaining],
  );

  /** Reason-carrying transitions (cancel / dispute). Throws so the dialog shows the error. */
  async function transitionWithReason(to: 'cancelled' | 'disputed', reason: string) {
    setErr('');
    setSuccessMsg('');
    await api.post(
      `/purchase-orders/${id}/transition`,
      { to, reason },
      { idempotencyKey: crypto.randomUUID() },
    );
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
      await api.post(
        `/purchase-orders/${id}/transition`,
        { to: 'completed' },
        { idempotencyKey: crypto.randomUUID() },
      );
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
    if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
      setRefundMsg('Enter a refund amount greater than zero.');
      return;
    }
    if (refundAmountCents > refundRemaining) {
      setRefundMsg(`Maximum refundable is ${formatLKR(refundRemaining)}.`);
      return;
    }
    setRefundSubmitting(true);
    try {
      await api.post(`/refunds/${refundablePayment.id}/refund`, {
        amountCents: refundAmountCents,
        reason: refundReason.trim() || 'Buyer requested refund',
      });
      setRefundMsg('Refund requested. You will be notified when it completes.');
      setRefundOpen(false);
      setRefundReason('');
      setRefundAmount('');
      void qc.invalidateQueries({ queryKey: ['payments', id] });
      void qc.invalidateQueries({ queryKey: ['payment-refunds', refundablePayment.id] });
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
  const partiallyFulfilled =
    order.originalTotalCents != null && order.originalTotalCents !== order.totalCents;
  const invoices = invoicesData?.invoices ?? [];
  const hasDeliveryInfo =
    !!delivery &&
    !!(
      delivery.carrier ||
      delivery.trackingNumber ||
      delivery.recipientName ||
      delivery.podNote ||
      delivery.hasPodPhoto
    );
  const isTerminal = ['rejected', 'cancelled', 'disputed', 'failed'].includes(order.status);
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const totalDiscount = items.reduce((sum, it) => {
    if (!it.discountPctSnapshot || it.discountPctSnapshot <= 0) return sum;
    const gross = it.unitPriceCents * it.quantity;
    return sum + Math.round(gross * (it.discountPctSnapshot / 100));
  }, 0);
  const returnState =
    order.status === 'delivered' || order.status === 'completed'
      ? deriveReturnState(returns, totalQty)
      : null;
  const statusTone = returnState?.tone ?? STATUS_ICON_MAP[order.status]?.tone ?? 'ink';
  const statusIcon = returnState ? (
    <RefreshCwIcon size={14} />
  ) : (
    STATUS_ICON_MAP[order.status]?.icon
  );
  const statusText = returnState?.label ?? statusLabel(order.status);
  const heroHint = returnState?.hint ?? NEXT_HINT[order.status] ?? 'Order in progress.';

  const copyPo = () => {
    navigator.clipboard?.writeText(order.poNumber).catch(() => {});
    toast.show(toast.success('PO number copied'));
  };

  const journey = journeyState(order.status);
  const activeStep = journey.find((n) => n.state === 'active');
  const grossCents = items.reduce((s, it) => s + it.unitPriceCents * it.quantity, 0);
  const linesCents = items.reduce((s, it) => s + it.lineTotalCents, 0);
  const feesCents = order.totalCents - linesCents;
  const latestEvent = events[events.length - 1];
  const showRefund = order.status === 'delivered' || order.status === 'completed';
  const showManage =
    canCancel || allowed.includes('disputed') || showRefund || REORDERABLE.has(order.status);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* ── Top bar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/orders"
          className="group inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3 transition-colors hover:text-ink-1"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-paper ring-1 ring-ink/10 transition-transform group-hover:-translate-x-0.5">
            <ArrowLeftIcon size={13} />
          </span>
          Purchase orders
        </Link>
        <button
          onClick={copyPo}
          className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 font-mono text-[11px] text-ink-3 ring-1 ring-ink/10 transition-colors hover:text-ink-1 hover:ring-ink/25"
          title="Copy PO number"
        >
          <span className="text-ink-4">ID</span>
          <span className="text-ink-1">{order.id.slice(0, 13)}…</span>
          <CopyIcon size={12} />
        </button>
      </div>

      {/* ── Hero: identity · journey · key facts ─────────── */}
      <section className="overflow-hidden rounded-3xl border border-ink/10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.04),0_30px_60px_-36px_rgba(0,0,0,0.45)]">
        <div className="relative p-6 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-copper/10 blur-3xl"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-mono font-bold uppercase tracking-wider ring-1',
                    TONE_CHIP[statusTone],
                  )}
                >
                  {statusIcon}
                  {statusText}
                </span>
                <PaymentStateBadge state={paymentSummary?.state} />
              </div>
              <h1 className="font-display text-[1.75rem] font-semibold leading-[1.05] tracking-tight text-ink break-all sm:text-[2.6rem]">
                {order.poNumber}
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-ink-3">{heroHint}</p>
            </div>
            <div className="shrink-0 lg:text-right">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-ink-4">
                Order total
              </div>
              <div className="mt-1.5 whitespace-nowrap font-mono text-3xl font-bold tabular-nums tracking-tight text-ink-1 sm:text-4xl">
                {formatLKR(order.totalCents)}
              </div>
              {totalDiscount > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 text-[11px] font-mono font-bold text-mint ring-1 ring-mint/25">
                  <SparklesIcon size={11} /> You saved {formatLKR(totalDiscount)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Journey */}
        <div className="relative overflow-hidden bg-ink px-6 py-6 text-paper sm:px-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-volt/10 blur-3xl"
          />
          <div className="relative mb-5 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-volt">
              Order journey
            </div>
            {latestEvent && (
              <div className="text-[11px] font-mono text-paper/50">
                Updated {formatDateTime(latestEvent.createdAt)}
              </div>
            )}
          </div>
          {isTerminal ? (
            <div className="relative flex items-center gap-3 rounded-xl bg-rose/15 px-4 py-3 ring-1 ring-rose/30">
              <AlertCircleIcon size={18} className="shrink-0 text-[#f0a597]" />
              <div className="text-sm">
                <span className="font-semibold">{statusLabel(order.status)}.</span>{' '}
                <span className="text-paper/70">{NEXT_HINT[order.status]}</span>
              </div>
            </div>
          ) : (
            <ol className="relative grid grid-cols-5">
              {journey.map((n, i) => (
                <li key={n.label} className="relative flex flex-col items-center text-center">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        'absolute right-1/2 top-[13px] h-0.5 w-full',
                        n.state === 'idle' ? 'bg-paper/10' : 'bg-volt',
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'relative z-[1] flex size-7 items-center justify-center rounded-full transition-all',
                      n.state === 'done' && 'bg-volt text-ink',
                      n.state === 'active' &&
                        'bg-ink text-volt ring-2 ring-volt shadow-[0_0_0_6px_rgba(198,220,74,0.15)]',
                      n.state === 'idle' && 'bg-paper/10 text-paper/40',
                    )}
                  >
                    {n.state === 'done' ? (
                      <CheckIcon size={14} />
                    ) : n.state === 'active' ? (
                      <span className="size-2 animate-pulse rounded-full bg-volt" />
                    ) : (
                      <span className="text-[10px] font-mono font-bold">{i + 1}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'mt-2.5 hidden text-xs font-semibold sm:block',
                      n.state === 'idle' ? 'text-paper/45' : 'text-paper',
                    )}
                  >
                    {n.label}
                  </span>
                  <span className="mt-0.5 hidden text-[10.5px] text-paper/45 sm:block">
                    {n.hint}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {returnState && (
            <div className="relative mt-6 rounded-xl bg-paper/[0.06] p-4 ring-1 ring-copper/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <RefreshCwIcon size={15} className="text-copper" />
                  <span className="font-semibold text-paper">{returnState.label}</span>
                  <span className="font-mono text-[11px] text-paper/50">
                    {returnState.current.rmaNumber}
                  </span>
                </div>
                {returnState.refundedCents > 0 && (
                  <span className="font-mono text-xs font-semibold text-volt">
                    {formatLKR(returnState.refundedCents)} refunded
                  </span>
                )}
              </div>
              <ol className="mt-4 grid grid-cols-4 gap-2">
                {(
                  [
                    ['Requested', returnState.current.requestedAt],
                    ['Approved', returnState.current.decidedAt],
                    ['Received', returnState.current.receivedAt],
                    ['Refunded', returnState.current.refundedAt],
                  ] as const
                ).map(([label, at]) => (
                  <li key={label} className="min-w-0">
                    <div className={cn('h-1 rounded-full', at ? 'bg-copper' : 'bg-paper/10')} />
                    <div
                      className={cn(
                        'mt-2 text-[11px] font-semibold',
                        at ? 'text-paper' : 'text-paper/40',
                      )}
                    >
                      {label}
                    </div>
                    <div className="hidden font-mono text-[10px] text-paper/45 sm:block">
                      {at ? formatDate(at) : '—'}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {!isTerminal && activeStep && (
            <p className="relative mt-4 text-center text-xs text-paper/70 sm:hidden">
              Step {journey.indexOf(activeStep) + 1} of {journey.length} ·{' '}
              <span className="font-semibold text-paper">{activeStep.label}</span> —{' '}
              {activeStep.hint}
            </p>
          )}
        </div>

        {/* Key facts */}
        <dl className="grid grid-cols-1 divide-y divide-ink/[0.07] border-t border-ink/[0.07] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <Fact
            icon={<CalendarIcon size={14} />}
            label="Issued"
            value={formatDate(order.createdAt)}
          />
          <Fact
            icon={<PackageIcon size={14} />}
            label="Items"
            value={`${items.length} line${items.length === 1 ? '' : 's'} · ${totalQty.toLocaleString()} units`}
          />
          <Fact
            icon={<MapPinIcon size={14} />}
            label="Deliver to"
            value={order.deliveryCity || '—'}
          />
          <Fact
            icon={<BanknoteIcon size={14} />}
            label="Paid"
            value={`${formatLKR(paymentSummary?.paidCents ?? 0)} of ${formatLKR(order.totalCents)}`}
          />
        </dl>
      </section>

      <ErrorBanner message={err} />
      {successMsg && <SuccessBanner message={successMsg} />}
      {partiallyFulfilled && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber/10 p-4 text-sm text-amber ring-1 ring-amber/25">
          <AlertCircleIcon size={18} className="mt-0.5 shrink-0" />
          <div className="font-medium">
            The supplier could fulfil part of this order. New total {formatLKR(order.totalCents)}{' '}
            (was {formatLKR(order.originalTotalCents ?? order.totalCents)}). Any overpayment is
            refunded automatically.
          </div>
        </div>
      )}

      {/* ── Main ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          {/* Line items */}
          <SectionCard
            eyebrow="Items"
            title="What you ordered"
            icon={<PackageIcon size={17} />}
            aside={<Chip tone="volt">{totalQty.toLocaleString()} units</Chip>}
            flush
          >
            {items.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-4">
                No line items on this order.
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,1fr)_90px_120px_130px] gap-4 border-b border-ink/[0.07] bg-ink/[0.02] px-6 py-2.5 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4 sm:grid">
                  <span>Product</span>
                  <span className="text-center">Qty</span>
                  <span className="text-right">Unit price</span>
                  <span className="text-right">Line total</span>
                </div>
                <ul className="divide-y divide-ink/[0.06]">
                  {items.map((it) => {
                    const changed =
                      it.requestedQuantity != null && it.requestedQuantity !== it.quantity;
                    return (
                      <li
                        key={it.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors hover:bg-bone/30 sm:grid-cols-[minmax(0,1fr)_90px_120px_130px]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {it.productId ? (
                            <Link
                              to={`/products/${it.productId}`}
                              aria-label={`View ${it.productNameSnapshot}`}
                              className="shrink-0 rounded-xl transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-volt"
                            >
                              <OrderItemThumb
                                productId={it.productId}
                                imageUrl={it.imageUrl}
                                name={it.productNameSnapshot}
                              />
                            </Link>
                          ) : (
                            <OrderItemThumb name={it.productNameSnapshot} />
                          )}
                          <div className="min-w-0">
                            {it.productId ? (
                              <Link
                                to={`/products/${it.productId}`}
                                className="group/name inline-flex max-w-full items-center gap-1 font-display text-[15px] font-semibold text-ink-1 transition-colors hover:text-copper"
                              >
                                <span className="truncate">{it.productNameSnapshot}</span>
                                <ArrowRightIcon
                                  size={12}
                                  className="shrink-0 opacity-0 transition-all group-hover/name:translate-x-0.5 group-hover/name:opacity-100"
                                />
                              </Link>
                            ) : (
                              <div className="truncate font-display text-[15px] font-semibold text-ink-1">
                                {it.productNameSnapshot}
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {(it.discountPctSnapshot ?? 0) > 0 && (
                                <span className="rounded-full bg-mint/10 px-2 py-0.5 text-[10px] font-mono font-bold text-mint ring-1 ring-mint/25">
                                  −{it.discountPctSnapshot}% volume
                                </span>
                              )}
                              <span className="text-[11px] text-ink-4 sm:hidden">
                                {it.quantity} × {formatLKR(it.unitPriceCents)}
                              </span>
                              {it.fulfilmentStatus === 'unavailable' && (
                                <span className="text-[10.5px] text-rose">
                                  Unavailable
                                  {it.unavailableReason ? ` — ${it.unavailableReason}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="hidden justify-center sm:flex">
                          {changed ? (
                            <span
                              className="inline-flex items-center gap-1 font-mono text-sm"
                              title="Requested → accepted"
                            >
                              <span className="text-ink-4 line-through">
                                {it.requestedQuantity}
                              </span>
                              <ArrowRightIcon size={10} className="text-ink-4" />
                              <span className="rounded-md bg-amber/10 px-2 py-0.5 font-semibold text-ink-1 ring-1 ring-amber/30">
                                {it.quantity}
                              </span>
                            </span>
                          ) : (
                            <span className="min-w-[2.5rem] rounded-md bg-bone px-2 py-0.5 text-center font-mono text-sm font-semibold text-ink-1 ring-1 ring-ink/[0.06]">
                              {it.quantity}
                            </span>
                          )}
                        </div>
                        <div className="hidden text-right font-mono text-sm text-ink-3 sm:block">
                          {formatLKR(it.unitPriceCents)}
                        </div>
                        <div className="whitespace-nowrap text-right font-mono text-sm font-bold text-ink-1">
                          {formatLKR(it.lineTotalCents)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex justify-end border-t border-ink/[0.07] bg-ink/[0.015] px-6 py-5">
                  <dl className="w-full max-w-xs space-y-2 text-sm">
                    <SummaryRow label="Items" value={formatLKR(grossCents)} />
                    {totalDiscount > 0 && (
                      <SummaryRow
                        label="Volume savings"
                        value={`−${formatLKR(totalDiscount)}`}
                        tone="mint"
                      />
                    )}
                    {feesCents > 0 && (
                      <SummaryRow label="Delivery & fees" value={formatLKR(feesCents)} />
                    )}
                    <div className="flex items-baseline justify-between border-t border-ink/10 pt-3">
                      <dt className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-ink-4">
                        Total
                      </dt>
                      <dd className="font-mono text-xl font-bold tabular-nums text-ink-1">
                        {formatLKR(order.totalCents)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </>
            )}
          </SectionCard>

          {/* 3-way reconciliation */}
          <ThreeWayReconciliationCard
            orderId={order.id}
            poNumber={order.poNumber}
            poTotalCents={order.totalCents}
            orderStatus={order.status}
            autoReconciliation={autoRecon ?? null}
            onReleasePayment={() => {
              void confirmReceipt();
            }}
          />

          {/* Delivery */}
          <SectionCard
            eyebrow="Logistics"
            title="Delivery"
            icon={<TruckIcon size={17} />}
            aside={
              delivery?.status ? (
                <Chip tone="copper">{statusLabel(delivery.status)}</Chip>
              ) : undefined
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <InfoTile
                icon={<MapPinIcon size={17} />}
                iconClass="bg-ink text-volt"
                label="Receiving dock"
                title={order.deliveryAddress}
                sub={`${order.deliveryCity}, ${order.deliveryDistrict}`}
              />
              <InfoTile
                icon={<ShieldCheckIcon size={17} />}
                iconClass="bg-copper/15 text-copper-deep"
                label="Settlement"
                title="Card or bank transfer · Vyro escrow"
                sub="Funds release to the supplier on delivery confirmation"
              />
            </div>
            {order.notes && (
              <div className="mt-3 flex items-start gap-3 rounded-xl bg-bone/40 p-4 ring-1 ring-ink/[0.06]">
                <FileTextIcon size={15} className="mt-0.5 shrink-0 text-copper" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
                    Delivery notes
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{order.notes}</p>
                </div>
              </div>
            )}
            {hasDeliveryInfo && delivery && (
              <div className="mt-3 space-y-4 rounded-xl p-4 ring-1 ring-ink/[0.08]">
                <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                  {delivery.carrier && <MiniFact label="Carrier" value={delivery.carrier} />}
                  {delivery.trackingNumber && (
                    <MiniFact
                      label="Tracking"
                      value={
                        delivery.trackingUrl ? (
                          <a
                            href={delivery.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-copper hover:underline"
                          >
                            {delivery.trackingNumber} <ExternalLinkIcon size={11} />
                          </a>
                        ) : (
                          delivery.trackingNumber
                        )
                      }
                      mono
                    />
                  )}
                  {delivery.recipientName && (
                    <MiniFact label="Received by" value={delivery.recipientName} />
                  )}
                  {delivery.deliveredAt && (
                    <MiniFact label="Delivered" value={formatDateTime(delivery.deliveredAt)} mono />
                  )}
                </dl>
                {delivery.podNote && (
                  <p className="border-l-2 border-copper/40 bg-bone/40 px-3 py-2 text-xs italic text-ink-2">
                    &ldquo;{delivery.podNote}&rdquo;
                  </p>
                )}
                {delivery.hasPodPhoto && (
                  <a
                    href={podPhotoUrl(order.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                  >
                    <img
                      src={podPhotoUrl(order.id)}
                      alt="Proof of delivery"
                      className="max-h-52 rounded-xl ring-1 ring-ink/10"
                    />
                  </a>
                )}
              </div>
            )}
          </SectionCard>

          {/* Returns */}
          {showReturns && (
            <SectionCard
              eyebrow="Returns"
              title="Returns"
              sub={
                canRequestReturn && lifecycle?.returnWindowEndsAt
                  ? `You can request a return until ${formatLifecycleDate(lifecycle.returnWindowEndsAt)}`
                  : 'Return requests raised on this order'
              }
              icon={<RefreshCwIcon size={17} />}
              aside={
                canRequestReturn ? (
                  <Button variant="secondary" size="sm" onClick={() => setReturnOpen(true)}>
                    <RefreshCwIcon size={13} /> Request return
                  </Button>
                ) : (
                  <Chip tone="copper">
                    {returns.length} RMA{returns.length === 1 ? '' : 's'}
                  </Chip>
                )
              }
            >
              <BuyerReturnsList returns={returns} onChanged={() => void refreshAll()} />
            </SectionCard>
          )}

          {/* Activity */}
          <SectionCard
            eyebrow="History"
            title="Activity"
            icon={<ClockIcon size={17} />}
            aside={
              <Chip tone="ink">
                {events.length} event{events.length === 1 ? '' : 's'}
              </Chip>
            }
          >
            {events.length === 0 ? (
              <div className="py-6 text-center text-sm text-ink-4">No events recorded yet.</div>
            ) : (
              <ol className="relative">
                {[...events].reverse().map((e, i, arr) => {
                  const tone = STATUS_ICON_MAP[e.toStatus]?.tone ?? 'ink';
                  const icon = STATUS_ICON_MAP[e.toStatus]?.icon ?? (
                    <span className="size-1.5 rounded-full bg-ink-4" />
                  );
                  const latest = i === 0;
                  return (
                    <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < arr.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute bottom-0 left-[15px] top-9 w-px bg-ink/10"
                        />
                      )}
                      <span
                        className={cn(
                          'relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-paper',
                          TONE_BG[tone],
                          !latest && 'opacity-80',
                        )}
                      >
                        {icon}
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'text-sm font-semibold',
                                latest ? 'text-ink-1' : 'text-ink-2',
                              )}
                            >
                              {statusLabel(e.toStatus)}
                            </span>
                            {latest && (
                              <span className="rounded-full bg-volt/25 px-1.5 py-px text-[9px] font-mono font-bold uppercase tracking-wider text-ink-1">
                                Latest
                              </span>
                            )}
                          </div>
                          <time className="font-mono text-[11px] text-ink-4">
                            {formatDateTime(e.createdAt)}
                          </time>
                        </div>
                        {e.fromStatus && (
                          <div className="mt-0.5 text-[11px] text-ink-4">
                            from {statusLabel(e.fromStatus)}
                          </div>
                        )}
                        {e.reason && (
                          <p className="mt-2 rounded-lg bg-bone/50 px-3 py-2 text-xs italic text-ink-2 ring-1 ring-ink/[0.05]">
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

          <MessageThread purchaseOrderId={order.id} />
        </div>

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="min-w-0 space-y-5 lg:col-span-4">
          {order.status === 'delivered' &&
            allowed.includes('completed') &&
            !returnState?.open &&
            !returnState?.full && (
              <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-mint to-[#2f6f57] p-5 text-paper shadow-[0_24px_48px_-28px_rgba(61,139,110,0.9)]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-paper/10 blur-2xl"
                />
                <div className="relative space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-paper/15">
                      <CheckCheckIcon size={17} />
                    </span>
                    <h3 className="font-display text-lg font-semibold">Goods arrived?</h3>
                  </div>
                  <p className="text-[13px] leading-relaxed text-paper/80">
                    Confirm receipt if everything arrived in full and in good condition. This
                    releases the held funds to the supplier.
                  </p>
                  <button
                    onClick={confirmReceipt}
                    disabled={confirming}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-paper px-4 py-3 text-sm font-semibold text-ink transition-transform hover:-translate-y-px disabled:opacity-60"
                  >
                    <CheckCheckIcon size={15} /> {confirming ? 'Confirming…' : 'Confirm receipt'}
                  </button>
                  {(canRequestReturn || canDispute) && (
                    <div className="space-y-2 border-t border-paper/15 pt-3">
                      <p className="text-[12px] font-semibold text-paper/85">
                        Something wrong — damaged, short or not what you ordered?
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {canRequestReturn && (
                          <button
                            type="button"
                            onClick={() => setReturnOpen(true)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-paper/30 bg-paper/10 px-3 py-2.5 text-[13px] font-semibold text-paper transition-colors hover:bg-paper/20"
                          >
                            <RefreshCwIcon size={13} /> Request return
                          </button>
                        )}
                        {canDispute && (
                          <button
                            type="button"
                            onClick={() => setReasonFor('disputed')}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-paper/30 bg-paper/10 px-3 py-2.5 text-[13px] font-semibold text-paper transition-colors hover:bg-paper/20"
                          >
                            <AlertCircleIcon size={13} /> Report a problem
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed text-paper/65">
                        Funds stay held while a return or dispute is open.
                      </p>
                    </div>
                  )}
                  {lifecycle?.autoCompleteAt && (
                    <p className="flex items-center gap-1.5 text-[11px] text-paper/70">
                      <ClockIcon size={11} /> Auto-completes{' '}
                      {formatLifecycleDate(lifecycle.autoCompleteAt)}
                      {returns.some((r) =>
                        ['requested', 'approved', 'received'].includes(r.status),
                      ) && ' (paused while a return is open)'}
                    </p>
                  )}
                </div>
              </section>
            )}

          {(order.status === 'delivered' || order.status === 'completed') && (
            <ReviewPromptCard orderId={order.id} />
          )}

          <PaymentPanel
            viewer="buyer"
            purchaseOrderId={order.id}
            poStatus={order.status}
            totalCents={order.totalCents}
            {...(order.businessId ? { businessId: order.businessId } : {})}
            {...(order.supplierId ? { supplierId: order.supplierId } : {})}
          />

          {order.direction !== 'domestic' && order.paymentMethod === 'wire' && (
            <WireInstructionsPanel purchaseOrderId={order.id} poStatus={order.status} />
          )}

          {invoices.length > 0 && (
            <SideCard title="Documents" icon={<FileTextIcon size={15} />}>
              <ul className="space-y-2">
                {invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center gap-3 rounded-xl p-2.5 ring-1 ring-ink/[0.07] transition-colors hover:bg-bone/40"
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg',
                        inv.type === 'credit_note'
                          ? 'bg-mint/15 text-mint'
                          : 'bg-ink/[0.06] text-ink-3',
                      )}
                    >
                      <FileTextIcon size={15} />
                    </span>
                    <Link to={`/orders/${order.id}/invoice/${inv.id}`} className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-semibold text-ink-1">
                        {inv.number}
                      </div>
                      <div className="text-[10.5px] text-ink-4">
                        {invoiceTypeLabel(inv.type)} · {inv.type === 'credit_note' ? '−' : ''}
                        {formatLKR(inv.totalCents)}
                      </div>
                    </Link>
                    <a
                      href={`${apiBase}/invoices/${encodeURIComponent(inv.number)}/pdf`}
                      className="rounded-lg px-2 py-1 text-[10.5px] font-semibold text-copper ring-1 ring-copper/30 transition-colors hover:bg-copper/10"
                    >
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            </SideCard>
          )}

          {showManage && (
            <SideCard title="Manage order" icon={<SettingsIcon size={15} />} flush>
              <div className="divide-y divide-ink/[0.06]">
                {REORDERABLE.has(order.status) && (
                  <ActionRow
                    icon={<RefreshCwIcon size={15} />}
                    title={reorder.isPending ? 'Adding to cart…' : 'Reorder these items'}
                    desc="Adds the same lines to your cart"
                    onClick={() => reorder.mutate(order.id)}
                    disabled={reorder.isPending}
                  />
                )}
                {showRefund && (
                  <ActionRow
                    icon={<CreditCardIcon size={15} />}
                    title="Request a refund"
                    desc={
                      refundablePayment
                        ? `On the confirmed payment of ${formatLKR(refundablePayment.amountCents)}`
                        : 'Available once a payment is confirmed'
                    }
                    onClick={() => setRefundOpen(true)}
                    disabled={!refundablePayment}
                  />
                )}
                {allowed.includes('disputed') && (
                  <ActionRow
                    icon={<AlertCircleIcon size={15} />}
                    title="Open a dispute"
                    desc={
                      canDispute
                        ? lifecycle?.disputeWindowEndsAt
                          ? `Available until ${formatLifecycleDate(lifecycle.disputeWindowEndsAt)}`
                          : 'Funds stay in escrow while we review'
                        : 'The dispute window has closed'
                    }
                    onClick={() => setReasonFor('disputed')}
                    disabled={!canDispute}
                  />
                )}
                {canCancel && (
                  <ActionRow
                    icon={<XIcon size={15} />}
                    title="Cancel order"
                    desc="Any captured payment is refunded automatically"
                    onClick={() => setReasonFor('cancelled')}
                    danger
                  />
                )}
              </div>
              {refundMsg && (
                <div className="mx-4 mb-4 rounded-lg bg-mint/10 p-3 text-xs font-semibold text-mint ring-1 ring-mint/25">
                  {refundMsg}
                </div>
              )}
            </SideCard>
          )}

          <div className="flex items-start gap-3 rounded-2xl bg-ink/[0.03] p-4 ring-1 ring-ink/[0.06]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-paper text-copper ring-1 ring-ink/[0.07]">
              <UserIcon size={15} />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink-1">Need help with this order?</div>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
                The Vyro trust team reviews disputes and refunds within 1–2 business days.
              </p>
              <Link
                to="/ask"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-copper hover:text-ink"
              >
                Ask Vyro Assistant <ChevronRightIcon size={11} />
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <ReasonDialog
        open={reasonFor !== null}
        title={reasonFor === 'disputed' ? 'Open a dispute' : 'Cancel this order'}
        subtitle={order.poNumber}
        description={
          reasonFor === 'disputed' ? (
            <>
              Tell the Vyro trust team what went wrong. Held funds stay in escrow until the dispute
              is resolved.
              {lifecycle?.disputeWindowEndsAt &&
                ` You can open a dispute until ${formatLifecycleDate(lifecycle.disputeWindowEndsAt)}.`}
            </>
          ) : (
            'The supplier is notified and any captured payment is refunded to you automatically.'
          )
        }
        confirmLabel={reasonFor === 'disputed' ? 'Open dispute' : 'Cancel order'}
        placeholder={
          reasonFor === 'disputed'
            ? 'e.g. 12 of 50 cartons arrived damaged'
            : 'e.g. Ordered by mistake'
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

      {/* ── Refund modal ─────────────────────────────────── */}
      {refundOpen && refundablePayment && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
          onClick={() => !refundSubmitting && setRefundOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl bg-paper shadow-2xl ring-1 ring-ink/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink/[0.07] p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-rose/10 text-rose">
                  <CreditCardIcon size={18} />
                </div>
                <div>
                  <h2
                    id="refund-modal-title"
                    className="font-display text-lg font-semibold text-ink-1"
                  >
                    Request a refund
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-4">
                    Up to{' '}
                    <span className="font-mono font-semibold text-ink-2">
                      {formatLKR(refundRemaining)}
                    </span>{' '}
                    refundable
                  </p>
                </div>
              </div>
              <button
                onClick={() => !refundSubmitting && setRefundOpen(false)}
                className="flex size-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ink/5"
                aria-label="Close"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">Amount (LKR)</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={(refundRemaining / 100).toFixed(2)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
                <p className="text-[11px] text-ink-4">
                  Leave blank to refund the full remaining amount.
                </p>
              </div>
              <div>
                <Label htmlFor="refund-reason">Reason</Label>
                <Textarea
                  id="refund-reason"
                  rows={4}
                  maxLength={500}
                  placeholder="e.g. 12 of 50 units arrived damaged."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="bg-paper"
                />
                <div className="mt-1 text-right font-mono text-[10px] text-ink-4">
                  {refundReason.length}/500
                </div>
              </div>
              <p className="flex items-start gap-2 rounded-xl bg-bone/50 p-3 text-xs leading-relaxed text-ink-3">
                <ShieldCheckIcon size={13} className="mt-0.5 shrink-0 text-copper" />
                The Vyro team reviews your request and notifies you. Escrow refunds settle within
                1–2 business days.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-ink/[0.07] bg-bone/30 p-5">
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
                Submit request <ArrowRightIcon size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Local building blocks ---------- */

const REORDERABLE = new Set(['completed', 'delivered', 'ready_for_pickup']);

const NEXT_HINT: Record<string, string> = {
  pending: 'Sent to the supplier. They will accept it or suggest changes shortly.',
  accepted: 'The supplier accepted your order and will start preparing it.',
  preparing: 'Your goods are being picked and packed.',
  ready_for_pickup: 'Packed and ready — waiting for dispatch or pickup.',
  out_for_delivery: 'On its way to your receiving dock.',
  delivered: 'Delivered. Confirm receipt to release payment to the supplier.',
  completed: 'Received and settled. Thanks for ordering through Vyro.',
  cancelled: 'This order was cancelled. Any captured payment is refunded automatically.',
  rejected: 'The supplier declined this order. No payment was taken.',
  disputed: 'The Vyro trust team is reviewing this order. Funds stay in escrow meanwhile.',
  failed: 'This order could not be completed.',
};

const TONE_CHIP: Record<string, string> = {
  volt: 'bg-volt/20 text-ink-1 ring-volt/40',
  amber: 'bg-amber/15 text-amber ring-amber/30',
  mint: 'bg-mint/15 text-mint ring-mint/30',
  copper: 'bg-copper/15 text-copper-deep ring-copper/30',
  rose: 'bg-rose/15 text-rose ring-rose/30',
  ink: 'bg-ink/[0.06] text-ink-3 ring-ink/15',
};

function SectionCard({
  eyebrow,
  title,
  sub,
  icon,
  aside,
  flush,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  icon: React.ReactNode;
  aside?: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-fade-in overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.03),0_16px_36px_-26px_rgba(0,0,0,0.3)]">
      <header className="flex items-center justify-between gap-4 border-b border-ink/[0.07] px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-volt">
            {icon}
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-copper">
              {eyebrow}
            </div>
            <h2 className="truncate font-display text-lg font-semibold tracking-tight text-ink-1">
              {title}
            </h2>
            {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      <div className={flush ? '' : 'p-6'}>{children}</div>
    </section>
  );
}

function SideCard({
  title,
  icon,
  flush,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.03),0_16px_36px_-26px_rgba(0,0,0,0.3)]">
      <header className="flex items-center gap-2 px-5 pb-1 pt-4 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-ink-4">
        <span className="text-copper">{icon}</span>
        {title}
      </header>
      <div className={flush ? 'pb-1' : 'px-5 pb-5 pt-2'}>{children}</div>
    </section>
  );
}

function Chip({ tone, children }: { tone: keyof typeof TONE_CHIP; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider ring-1',
        TONE_CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-6 py-3.5 sm:py-4 lg:px-6">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-[13px] font-semibold text-ink-1">{value}</dd>
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  iconClass,
  label,
  title,
  sub,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-bone/30 p-4 ring-1 ring-ink/[0.07]">
      <span
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', iconClass)}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
          {label}
        </div>
        <p className="mt-1 text-sm font-semibold text-ink-1">{title}</p>
        <p className="mt-0.5 text-xs text-ink-3">{sub}</p>
      </div>
    </div>
  );
}

function MiniFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-4">{label}</dt>
      <dd className={cn('mt-0.5 truncate font-semibold text-ink-1', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'mint' }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={cn(
          'font-mono tabular-nums',
          tone === 'mint' ? 'font-semibold text-mint' : 'text-ink-2',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  desc,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-bone/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          danger ? 'bg-rose/10 text-rose' : 'bg-ink/[0.05] text-ink-2',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn('block text-[13px] font-semibold', danger ? 'text-rose' : 'text-ink-1')}
        >
          {title}
        </span>
        <span className="block truncate text-[11px] text-ink-4">{desc}</span>
      </span>
      <ChevronRightIcon
        size={14}
        className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}
