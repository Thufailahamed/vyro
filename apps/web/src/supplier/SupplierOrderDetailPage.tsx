import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderStatus } from '@vyro/shared';
import { api, ApiError } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, ErrorBanner, Input, Label, Textarea, SuccessBanner, Badge } from '@/components/ui';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  MapPinIcon,
  PackageIcon,
  TruckIcon,
  XIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  SparklesIcon,
  CalendarIcon,
} from '@/components/icons';
import { Surface } from '@/components/brand/Surface';
import { MessageThread } from '@/components/MessageThread';
import { useToast } from '@vyro/ui';
import { formatLKR } from '@/lib/format';
import {
  canDispatch,
  eventKind,
  formatCountdown,
  formatLifecycleDate,
  lifecycleErrorMessage,
  podPhotoUrl,
  poReturnState,
  returnStateMeta,
  statusLabel,
  type DeliveryInfo,
  type LifecycleOrderDetail,
  type LifecycleOrderEvent,
  type LifecycleOrderItem,
} from '@/lib/orderLifecycle';
import { Modal, PaymentStateBadge, PodDialog, ReasonDialog } from '@/components/orders/LifecycleUi';
import { OrderProgress } from '@/components/orders/OrderProgress';
import { OrderItemThumb } from '@/components/orders/OrderItemThumb';
import { PaymentPanel } from '@/components/payments/PaymentPanel';
import { SupplierReturnsSection } from '@/components/orders/ReturnsPanels';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  preparing: 'Start preparing',
  ready_for_pickup: 'Mark ready for pickup',
  out_for_delivery: 'Dispatch',
  delivered: 'Mark delivered',
};

const ADVANCE_HINT: Partial<Record<OrderStatus, string>> = {
  accepted: 'Review stock and confirm. You can reduce quantities or mark lines unavailable before accepting.',
  preparing: 'Begin picking and packing. The buyer sees the order is being prepared.',
  ready_for_pickup: 'Flag the consignment as packed and waiting for collection.',
  out_for_delivery: 'Hand over to your driver or carrier. Add tracking first so the buyer can follow along.',
  delivered: 'Capture proof of delivery to close out the shipment.',
};

/** Supplier-facing "next step" copy while an order has a return on it. */
const RETURN_NEXT: Record<string, { text: string; action?: string }> = {
  requested: { text: 'The buyer asked to return goods on this order. Review the reason and approve or reject it.', action: 'Review return' },
  approved: { text: 'Return approved. Mark the goods received once they are back at your depot — the refund is issued automatically.', action: 'Record receipt' },
  received: { text: 'Returned goods received. VYRO is refunding the buyer — nothing more for you to do.' },
  returned: { text: 'This order was fully returned and the buyer has been refunded. Nothing more to do.' },
  partially_returned: { text: 'Part of this order was returned and refunded. The rest stands as delivered.' },
};

const ADVANCE_ORDER: OrderStatus[] = ['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

/** Hero chip colour for the current order status (on ink). */
const HERO_STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber',
  accepted: 'bg-mint',
  preparing: 'bg-volt',
  ready_for_pickup: 'bg-volt',
  out_for_delivery: 'bg-copper',
  delivered: 'bg-mint',
  completed: 'bg-mint',
  rejected: 'bg-rose',
  cancelled: 'bg-rose',
  disputed: 'bg-rose',
};

export function SupplierOrderDetailPage() {
  const { id = '' } = useParams();
  usePageTitle(`Supplier order ${id.slice(0, 8)}`);
  const { supplierId } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();

  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busyTo, setBusyTo] = useState<OrderStatus | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [reasonFor, setReasonFor] = useState<'rejected' | 'cancelled' | null>(null);
  const [podOpen, setPodOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ['supplier-order', id],
    queryFn: () => api.get<LifecycleOrderDetail>(`/purchase-orders/${id}?as=supplier`),
    enabled: !!id,
  });

  async function refresh() {
    await query.refetch();
    void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'po'] });
  }

  async function transition(to: OrderStatus, reason?: string) {
    setErr('');
    setOk('');
    setBusyTo(to);
    try {
      await api.post(
        `/purchase-orders/${id}/transition`,
        { to, ...(reason ? { reason } : {}) },
        { idempotencyKey: crypto.randomUUID() },
      );
      await refresh();
      setOk(`Order moved to ${statusLabel(to)}.`);
      toast.show(toast.success(`Order moved to ${statusLabel(to)}`));
    } catch (e) {
      // Reason dialogs render the failure inline.
      if (reason) throw e;
      if (e instanceof ApiError && e.code === 'POD_REQUIRED') setPodOpen(true);
      if (e instanceof ApiError && e.code === 'PAYMENT_REQUIRED') {
        const due = (e.details as { dueCents?: number } | undefined)?.dueCents;
        setErr(`${lifecycleErrorMessage(e, 'Payment required')}${due ? ` Outstanding: ${formatLKR(due)}.` : ''}`);
        void query.refetch();
      } else {
        setErr(lifecycleErrorMessage(e, 'Could not update the order'));
      }
    } finally {
      setBusyTo(null);
    }
  }

  if (query.isLoading) return <SupplierLoadingState label="Loading purchase order" />;
  if (query.isError || !query.data) {
    return <SupplierErrorState message="Could not load this purchase order." onRetry={() => void query.refetch()} />;
  }

  const { order, items, events, paymentSummary, delivery, returns = [], lifecycle } = query.data;
  const allowed = lifecycle?.allowedTransitions ?? [];
  const dispatchOk = canDispatch(lifecycle, paymentSummary);
  const advances = ADVANCE_ORDER.filter((s) => allowed.includes(s));
  const showDelivery = !['pending', 'rejected', 'cancelled'].includes(order.status);
  const trackingEditable = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(order.status);
  const units = items.reduce((n, it) => n + it.quantity, 0);
  const retState = ['delivered', 'completed'].includes(order.status) ? poReturnState(returns, units) : null;
  const ret = returnStateMeta(retState);
  const liveReturns = returns.filter((r) => r.status !== 'rejected' && r.status !== 'cancelled');
  const retCurrent = liveReturns.length ? liveReturns.reduce((a, b) => (b.requestedAt > a.requestedAt ? b : a)) : null;
  const retRefundedCents = liveReturns
    .filter((r) => r.status === 'refunded' || r.status === 'closed')
    .reduce((n, r) => n + (r.refundCents ?? 0), 0);
  const scrollToReturns = () => document.getElementById('order-returns')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const nextStep: OrderStatus | undefined = allowed.includes('accepted') ? 'accepted' : advances[0];

  function copyPo() {
    void navigator.clipboard?.writeText(order.poNumber).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="max-w-6xl space-y-6 pb-12">
      {/* Hero */}
      <Surface kind="ink" className="grain rounded-2xl shadow-soft-lg">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-volt/[0.12] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-80 rounded-full bg-copper/[0.2] blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/supplier/orders"
              className="group inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-paper/50 transition-colors duration-200 hover:text-paper"
            >
              <ArrowLeftIcon size={13} className="transition-transform duration-200 ease-vyro group-hover:-translate-x-0.5" />
              All orders
            </Link>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-paper/15 bg-paper/[0.06] px-3 text-xs font-semibold text-paper/80 backdrop-blur-sm transition-all duration-200 ease-vyro hover:border-paper/30 hover:bg-paper/[0.12] hover:text-paper disabled:opacity-60"
            >
              <RefreshCwIcon size={12} className={query.isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-volt">
                <PackageIcon size={13} /> Purchase order
              </div>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="h-9 w-1 shrink-0 rounded-full bg-volt shadow-[0_0_18px_rgba(198,220,74,0.55)]"
                />
                <h1 className="vyro-display truncate text-3xl text-paper sm:text-4xl">{order.poNumber}</h1>
                <button
                  type="button"
                  onClick={copyPo}
                  title="Copy PO number"
                  aria-label="Copy PO number"
                  className="shrink-0 rounded-md p-1.5 text-paper/40 transition-colors duration-200 hover:bg-paper/10 hover:text-paper"
                >
                  {copied ? <CheckIcon size={14} className="text-volt" /> : <CopyIcon size={14} />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/[0.07] px-3 py-1 text-xs font-semibold text-paper">
                  <span
                    className={`size-1.5 rotate-45 ${ret ? (ret.dot === 'bg-ink-3' ? 'bg-paper/60' : ret.dot) : (HERO_STATUS_DOT[order.status] ?? 'bg-ink-5')}`}
                    aria-hidden
                  />
                  {ret?.label ?? statusLabel(order.status)}
                </span>
                <PaymentStateBadge state={paymentSummary?.state} />
                {order.originalTotalCents != null && <Badge variant="purple">Partially fulfilled</Badge>}
              </div>
            </div>

            <div className="shrink-0 md:text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">Order total</div>
              <div className="vyro-metric mt-1.5 text-4xl leading-none text-paper sm:text-5xl">{formatLKR(order.totalCents)}</div>
              {order.originalTotalCents != null && order.originalTotalCents !== order.totalCents && (
                <div className="mt-1 font-mono text-xs text-paper/40 line-through">{formatLKR(order.originalTotalCents)}</div>
              )}
              <div className="mt-2 font-mono text-[11px] text-paper/45">
                {items.length} line{items.length === 1 ? '' : 's'} · {units} unit{units === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-dashed border-paper/15 pt-6">
            <OrderProgress status={order.status} events={events} placedAt={order.createdAt} tone="dark" />
            {ret && retCurrent && (
              <div className="mt-6 rounded-xl bg-paper/[0.06] p-4 ring-1 ring-copper/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <RefreshCwIcon size={15} className="text-copper" />
                    <span className="font-semibold text-paper">{ret.label}</span>
                    <span className="font-mono text-[11px] text-paper/50">{retCurrent.rmaNumber}</span>
                  </div>
                  {retRefundedCents > 0 && (
                    <span className="font-mono text-xs font-semibold text-volt">{formatLKR(retRefundedCents)} refunded to buyer</span>
                  )}
                </div>
                <ol className="mt-4 grid grid-cols-4 gap-2">
                  {(
                    [
                      ['Requested', retCurrent.requestedAt],
                      ['Approved', retCurrent.decidedAt],
                      ['Received', retCurrent.receivedAt],
                      ['Refunded', retCurrent.refundedAt],
                    ] as const
                  ).map(([label, at]) => (
                    <li key={label} className="min-w-0">
                      <div className={`h-1 rounded-full ${at ? 'bg-copper' : 'bg-paper/10'}`} />
                      <div className={`mt-2 text-[11px] font-semibold ${at ? 'text-paper' : 'text-paper/40'}`}>{label}</div>
                      <div className="hidden font-mono text-[10px] text-paper/45 sm:block">
                        {at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-paper/45">
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon size={12} /> Placed {formatLifecycleDate(order.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon size={12} /> {order.deliveryCity}, {order.deliveryDistrict}
            </span>
          </div>
        </div>
      </Surface>

      {order.status === 'pending' && lifecycle?.autoCancelAt && (
        <div className="flex items-center gap-3 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber/15">
            <ClockIcon size={15} />
          </span>
          <span>
            <strong className="font-semibold">Auto-cancels {formatCountdown(lifecycle.autoCancelAt)}</strong>
            <span className="text-amber/80"> · {formatLifecycleDate(lifecycle.autoCancelAt)} if not accepted.</span>
          </span>
        </div>
      )}

      <ErrorBanner message={err} />
      {ok && <SuccessBanner message={ok} />}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Line items */}
          <Section icon={<PackageIcon size={15} />} title="Line items" meta={`${items.length} line${items.length === 1 ? '' : 's'}`} flush>
            <ItemsTable items={items} totalCents={order.totalCents} />
          </Section>

          {/* Delivery */}
          <Section icon={<TruckIcon size={15} />} title="Delivery" meta={delivery?.status ? statusLabel(delivery.status) : undefined}>
            <div className="flex items-start gap-4 rounded-xl border border-line bg-bone/50 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-copper/10 text-copper">
                <MapPinIcon size={18} />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">Deliver to</div>
                <div className="mt-1 text-[15px] font-semibold text-ink">{order.deliveryAddress}</div>
                <div className="text-sm text-ink-3">
                  {order.deliveryCity}, {order.deliveryDistrict}
                </div>
                {order.notes && (
                  <p className="mt-3 border-l-2 border-copper/40 pl-3 text-sm italic text-ink-3">“{order.notes}”</p>
                )}
              </div>
            </div>
            {showDelivery && (
              <TrackingCard
                poId={order.id}
                delivery={delivery ?? null}
                editable={trackingEditable}
                onSaved={() => void query.refetch()}
              />
            )}
          </Section>

          {/* Returns */}
          {(returns.length > 0 || lifecycle?.returnsEnabled) && ['delivered', 'completed', 'disputed'].includes(order.status) && (
            <Section id="order-returns" icon={<RefreshCwIcon size={15} />} title="Returns" meta={String(returns.length)}>
              <SupplierReturnsSection returns={returns} onChanged={() => void refresh()} />
            </Section>
          )}

          {/* Timeline */}
          <Section icon={<ClockIcon size={15} />} title="Activity" meta={`${events.length} event${events.length === 1 ? '' : 's'}`}>
            <Timeline events={events} />
          </Section>

          <MessageThread purchaseOrderId={order.id} />
        </div>

        {/* Right column: actions + payment */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Surface kind="elevated" className="rounded-2xl">
            <div aria-hidden className="h-1 w-full bg-gradient-to-r from-volt via-volt-glow to-copper/60" />
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink">Next step</h3>
                {(nextStep || retState === 'requested' || retState === 'approved') && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-volt-soft px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-volt-deep">
                    <SparklesIcon size={10} /> Your move
                  </span>
                )}
              </div>

              {retState && RETURN_NEXT[retState] ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl bg-copper/[0.08] p-4 ring-1 ring-copper/20">
                    <RefreshCwIcon size={16} className="mt-0.5 shrink-0 text-copper" />
                    <p className="text-sm leading-relaxed text-ink-2">{RETURN_NEXT[retState].text}</p>
                  </div>
                  {RETURN_NEXT[retState].action && (
                    <Button variant="primary" size="lg" className="w-full justify-center" onClick={scrollToReturns}>
                      {RETURN_NEXT[retState].action}
                    </Button>
                  )}
                </div>
              ) : allowed.length === 0 ? (
                <div className="flex items-start gap-3 rounded-xl bg-bone/60 p-4">
                  <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-mint" />
                  <p className="text-sm text-ink-3">Nothing to do right now. We'll notify you when this order needs you.</p>
                </div>
              ) : (
                nextStep && ADVANCE_HINT[nextStep] && <p className="text-sm leading-relaxed text-ink-3">{ADVANCE_HINT[nextStep]}</p>
              )}

              {allowed.includes('accepted') && (
                <Button variant="success" size="lg" className="w-full justify-center" onClick={() => setAcceptOpen(true)}>
                  <CheckCircleIcon size={16} /> Accept order
                </Button>
              )}

              {advances.map((to, i) => {
                const gated = to === 'out_for_delivery' && !dispatchOk;
                const primary = i === 0 && !allowed.includes('accepted');
                return (
                  <div key={to} className="space-y-2">
                    <Button
                      variant={primary ? 'primary' : 'secondary'}
                      size={primary ? 'lg' : 'md'}
                      className="w-full justify-center"
                      loading={busyTo === to}
                      disabled={gated || (busyTo !== null && busyTo !== to)}
                      onClick={() => (to === 'delivered' ? setPodOpen(true) : void transition(to))}
                    >
                      {ADVANCE_LABEL[to] ?? statusLabel(to)}
                    </Button>
                    {gated && (
                      <p className="flex items-center gap-1.5 rounded-lg bg-amber/10 px-3 py-2 text-xs font-semibold text-amber">
                        <AlertCircleIcon size={13} /> Awaiting payment
                        {paymentSummary?.dueCents ? ` · ${formatLKR(paymentSummary.dueCents)} due` : ''}
                      </p>
                    )}
                  </div>
                );
              })}

              {(allowed.includes('rejected') || allowed.includes('cancelled')) && (
                <div className="flex flex-col gap-1 border-t border-line pt-3">
                  {allowed.includes('rejected') && (
                    <button
                      type="button"
                      onClick={() => setReasonFor('rejected')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose transition-colors duration-200 hover:bg-rose/10"
                    >
                      <XIcon size={13} /> Reject order
                    </button>
                  )}
                  {allowed.includes('cancelled') && (
                    <button
                      type="button"
                      onClick={() => setReasonFor('cancelled')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-ink-4 transition-colors duration-200 hover:bg-rose/10 hover:text-rose"
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              )}
            </div>
          </Surface>

          <PaymentPanel
            viewer="supplier"
            purchaseOrderId={order.id}
            poStatus={order.status}
            totalCents={order.totalCents}
            {...(order.businessId ? { businessId: order.businessId } : {})}
            {...(order.supplierId ? { supplierId: order.supplierId } : {})}
            onChanged={() => void query.refetch()}
          />
        </div>
      </div>

      {acceptOpen && (
        <AcceptDialog
          poId={order.id}
          items={items}
          totalCents={order.totalCents}
          onClose={() => setAcceptOpen(false)}
          onAccepted={async (partial) => {
            await refresh();
            setOk(partial ? 'Order accepted with changes. The buyer has been notified.' : 'Order accepted.');
            toast.show(toast.success(partial ? 'Order partially accepted' : 'Order accepted'));
          }}
        />
      )}

      <ReasonDialog
        open={reasonFor !== null}
        title={reasonFor === 'rejected' ? 'Reject purchase order' : 'Cancel purchase order'}
        subtitle={order.poNumber}
        description={
          reasonFor === 'cancelled'
            ? 'The buyer is refunded automatically for any payment already captured.'
            : 'The buyer will see your reason.'
        }
        confirmLabel={reasonFor === 'rejected' ? 'Reject order' : 'Cancel order'}
        placeholder={reasonFor === 'rejected' ? 'e.g. Out of stock until next month' : 'e.g. Supplier stock-out after acceptance'}
        onClose={() => setReasonFor(null)}
        onSubmit={(reason) => transition(reasonFor!, reason)}
      />

      {podOpen && (
        <PodDialog
          open
          poId={order.id}
          delivery={delivery ?? null}
          onClose={() => setPodOpen(false)}
          onCaptured={async () => {
            setErr('');
            try {
              await api.post(
                `/purchase-orders/${order.id}/transition`,
                { to: 'delivered' },
                { idempotencyKey: crypto.randomUUID() },
              );
            } finally {
              await refresh();
            }
            setOk('Marked delivered.');
            toast.show(toast.success('Marked delivered'));
          }}
        />
      )}
    </div>
  );
}

/* ── Section shell ── */

function Section({
  id,
  icon,
  title,
  meta,
  flush = false,
  children,
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  meta?: string | undefined;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Surface kind="elevated" className="scroll-mt-6 rounded-2xl" {...(id ? { id } : {})}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          <span className="flex size-8 items-center justify-center rounded-lg bg-copper/10 text-copper">{icon}</span>
          {title}
        </h2>
        {meta && <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-4">{meta}</span>}
      </div>
      <div className={flush ? 'mt-4' : 'space-y-4 p-5 sm:px-6'}>{children}</div>
    </Surface>
  );
}

/* ── Line items (requested → accepted) ── */

function ItemsTable({ items, totalCents }: { items: LifecycleOrderItem[]; totalCents: number }) {
  const linesCents = items.reduce((s, it) => s + it.lineTotalCents, 0);
  const grossCents = items.reduce((s, it) => s + it.unitPriceCents * it.quantity, 0);
  const discountCents = Math.max(0, grossCents - linesCents);
  const adjustCents = totalCents - linesCents;

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_80px_130px_140px] gap-4 border-y border-line bg-bone/40 px-6 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-4 sm:grid">
        <span>Product</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Unit</span>
        <span className="text-right">Line total</span>
      </div>
      <ul className="divide-y divide-line-soft border-b border-line sm:border-t-0 border-t">
        {items.map((it) => {
          const requested = it.requestedQuantity ?? it.quantity;
          const changed = requested !== it.quantity || it.fulfilmentStatus === 'unavailable';
          const discount = it.discountPctSnapshot ?? 0;
          return (
            <li
              key={it.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors duration-200 hover:bg-bone/40 sm:grid-cols-[minmax(0,1fr)_80px_130px_140px] sm:px-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                <OrderItemThumb productId={it.productId} imageUrl={it.imageUrl} name={it.productNameSnapshot} className="size-10" />
                <div className="min-w-0">
                  {it.productId ? (
                    <Link
                      to={`/products/${it.productId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open the product page"
                      className="inline-flex max-w-full items-center gap-1 font-semibold text-ink transition-colors hover:text-copper"
                    >
                      <span className="truncate">{it.productNameSnapshot}</span>
                      <ExternalLinkIcon size={11} className="shrink-0 text-ink-4" />
                    </Link>
                  ) : (
                    <div className="truncate font-semibold text-ink">{it.productNameSnapshot}</div>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-mono text-ink-4 sm:hidden">
                      {it.quantity} × {formatLKR(it.unitPriceCents)}
                    </span>
                    {discount > 0 && (
                      <span className="rounded bg-volt-soft px-1.5 py-px font-mono font-bold text-volt-deep">−{discount}%</span>
                    )}
                    {it.fulfilmentStatus === 'unavailable' && (
                      <span className="text-rose">Unavailable{it.unavailableReason ? ` — ${it.unavailableReason}` : ''}</span>
                    )}
                    {it.fulfilmentStatus === 'reduced' && <span className="text-amber">Reduced quantity</span>}
                  </div>
                </div>
              </div>
              <div className="hidden text-center font-mono text-sm sm:block">
                {changed ? (
                  <span>
                    <span className="text-ink-4 line-through">{requested}</span> → <strong>{it.quantity}</strong>
                  </span>
                ) : (
                  <span className="inline-flex min-w-9 justify-center rounded-md bg-bone px-2 py-0.5 font-semibold text-ink">
                    {it.quantity}
                  </span>
                )}
              </div>
              <div className="hidden text-right font-mono text-sm text-ink-3 sm:block">{formatLKR(it.unitPriceCents)}</div>
              <div className="text-right font-mono text-sm font-bold text-ink">{formatLKR(it.lineTotalCents)}</div>
            </li>
          );
        })}
      </ul>
      <dl className="space-y-2 px-5 py-4 text-sm sm:px-6">
        {discountCents > 0 && (
          <>
            <div className="flex justify-between gap-3 text-ink-3">
              <dt>Gross</dt>
              <dd className="font-mono">{formatLKR(grossCents)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-volt-deep">
              <dt>Volume discount</dt>
              <dd className="font-mono">−{formatLKR(discountCents)}</dd>
            </div>
          </>
        )}
        {adjustCents !== 0 && (
          <div className="flex justify-between gap-3 text-ink-3">
            <dt>Adjustments</dt>
            <dd className="font-mono">{adjustCents > 0 ? '+' : '−'}{formatLKR(Math.abs(adjustCents))}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-line pt-3">
          <dt className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink">Order total</dt>
          <dd className="vyro-metric text-xl font-bold text-ink">{formatLKR(totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ── Activity timeline (newest first) ── */

function Timeline({ events }: { events: LifecycleOrderEvent[] }) {
  if (events.length === 0) {
    return <p className="rounded-xl bg-bone/50 p-4 text-sm text-ink-4">No activity yet.</p>;
  }
  const ordered = [...events].reverse();
  return (
    <ol className="relative">
      <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-ink/10" />
      {ordered.map((e, i) => {
        const latest = i === 0;
        const isDelivery = eventKind(e) === 'delivery';
        return (
          <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
            <span
              className={`relative z-10 mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full border ${
                latest ? 'border-ink bg-ink text-volt ring-4 ring-volt/25' : 'border-ink/15 bg-paper text-ink-4'
              }`}
            >
              {isDelivery ? <TruckIcon size={11} /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`font-semibold ${latest ? 'text-ink' : 'text-ink-2'}`}>{statusLabel(e.toStatus)}</span>
                  {e.fromStatus && <span className="font-mono text-[11px] text-ink-4">from {statusLabel(e.fromStatus)}</span>}
                  {isDelivery && <Badge>Delivery</Badge>}
                  {latest && (
                    <span className="rounded-full bg-volt-soft px-2 py-px font-mono text-[10px] font-bold uppercase tracking-wider text-volt-deep">
                      Latest
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-ink-4">{formatLifecycleDate(e.createdAt)}</span>
              </div>
              {e.reason && <p className="mt-1.5 rounded-lg bg-bone/60 px-3 py-2 text-xs italic text-ink-3">“{e.reason}”</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Accept (full or partial) ── */

type AcceptLine = { quantity: number; unavailable: boolean; reason: string };

export function AcceptDialog({
  poId,
  items,
  totalCents,
  onClose,
  onAccepted,
}: {
  poId: string;
  items: LifecycleOrderItem[];
  totalCents: number;
  onClose: () => void;
  onAccepted: (partial: boolean) => Promise<void> | void;
}) {
  const [lines, setLines] = useState<Record<string, AcceptLine>>(() =>
    Object.fromEntries(
      items.map((it) => [it.id, { quantity: it.requestedQuantity ?? it.quantity, unavailable: false, reason: '' }]),
    ),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reductionCents = items.reduce((sum, it) => {
    const requested = it.requestedQuantity ?? it.quantity;
    const line = lines[it.id];
    if (!line || requested <= 0) return sum;
    const keep = line.unavailable ? 0 : line.quantity;
    return sum + Math.round((it.lineTotalCents * (requested - keep)) / requested);
  }, 0);
  const newTotal = totalCents - reductionCents;
  const allUnavailable = items.every((it) => {
    const l = lines[it.id];
    return l && (l.unavailable || l.quantity === 0);
  });

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      type Line = { itemId: string; quantity: number } | { itemId: string; unavailable: true; reason?: string };
      const payload = items.flatMap((it): Line[] => {
        const requested = it.requestedQuantity ?? it.quantity;
        const l = lines[it.id];
        if (!l) return [];
        if (l.unavailable) {
          return [{ itemId: it.id, unavailable: true as const, ...(l.reason.trim() ? { reason: l.reason.trim() } : {}) }];
        }
        if (l.quantity < requested) return [{ itemId: it.id, quantity: l.quantity }];
        return [];
      });
      const res = await api.post<{ partial: boolean }>(
        `/purchase-orders/${poId}/accept`,
        {
          ...(payload.length ? { lines: payload } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      await onAccepted(!!res?.partial);
      onClose();
    } catch (e) {
      setErr(lifecycleErrorMessage(e, 'Could not accept the order'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title="Accept purchase order"
      subtitle="Reduce quantities or mark lines unavailable if you can't fulfil in full"
      icon={<CheckCircleIcon size={18} />}
      tone="mint"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="success" onClick={() => void submit()} loading={busy} disabled={allUnavailable}>
            {reductionCents > 0 ? `Accept · new total ${formatLKR(newTotal)}` : 'Accept in full'}
          </Button>
        </>
      }
    >
      <ErrorBanner message={err} />
      <div className="border border-ink/10 rounded-lg divide-y divide-ink/5">
        {items.map((it) => {
          const requested = it.requestedQuantity ?? it.quantity;
          const l = lines[it.id] ?? { quantity: requested, unavailable: false, reason: '' };
          const set = (patch: Partial<AcceptLine>) => setLines((s) => ({ ...s, [it.id]: { ...l, ...patch } }));
          return (
            <div key={it.id} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-1">{it.productNameSnapshot}</div>
                  <div className="text-[11px] text-ink-4 font-mono">
                    Ordered {requested} · {formatLKR(it.unitPriceCents)} each
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-ink-3">
                    <input
                      type="checkbox"
                      checked={l.unavailable}
                      onChange={(e) => set({ unavailable: e.target.checked })}
                      className="accent-rose"
                    />
                    Unavailable
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={requested}
                    disabled={l.unavailable}
                    value={l.unavailable ? 0 : l.quantity}
                    onChange={(e) => set({ quantity: Math.min(requested, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                    className="!w-24 text-right font-mono"
                    aria-label={`Accepted quantity for ${it.productNameSnapshot}`}
                  />
                </div>
              </div>
              {l.unavailable && (
                <Input
                  value={l.reason}
                  maxLength={300}
                  onChange={(e) => set({ reason: e.target.value })}
                  placeholder="Reason (optional), e.g. Discontinued"
                  className="text-xs"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between items-center p-3 bg-bone rounded-md border border-line text-sm">
        <span className="text-ink-3">New total</span>
        <span className="font-mono font-bold text-ink">
          {reductionCents > 0 && <span className="line-through text-ink-4 mr-2 font-normal">{formatLKR(totalCents)}</span>}
          {formatLKR(newTotal)}
        </span>
      </div>
      {allUnavailable && (
        <p className="text-xs text-rose font-semibold">Nothing left to accept — reject the order instead.</p>
      )}
      {reductionCents > 0 && (
        <div>
          <Label htmlFor="accept-note">Note to buyer (optional)</Label>
          <Textarea id="accept-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <p className="text-[11px] text-ink-4">
        Any amount already paid for removed quantities is refunded to the buyer automatically.
      </p>
    </Modal>
  );
}

/* ── Tracking details ── */

function TrackingCard({
  poId,
  delivery,
  editable,
  onSaved,
}: {
  poId: string;
  delivery: DeliveryInfo | null;
  editable: boolean;
  onSaved: () => void;
}) {
  const [carrier, setCarrier] = useState(delivery?.carrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(delivery?.trackingNumber ?? '');
  const [trackingUrl, setTrackingUrl] = useState(delivery?.trackingUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCarrier(delivery?.carrier ?? '');
    setTrackingNumber(delivery?.trackingNumber ?? '');
    setTrackingUrl(delivery?.trackingUrl ?? '');
  }, [delivery?.carrier, delivery?.trackingNumber, delivery?.trackingUrl]);

  const dirty =
    carrier !== (delivery?.carrier ?? '') ||
    trackingNumber !== (delivery?.trackingNumber ?? '') ||
    trackingUrl !== (delivery?.trackingUrl ?? '');

  async function save() {
    setBusy(true);
    setErr('');
    setSaved(false);
    try {
      await api.patch(`/deliveries/${poId}`, {
        carrier: carrier.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        trackingUrl: trackingUrl.trim() || null,
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.code === 'VALIDATION_ERROR'
          ? 'Check the tracking URL — it must be a full link (https://…).'
          : lifecycleErrorMessage(e, 'Could not save tracking details'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-bone/40 px-4 py-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Shipment tracking</span>
        {delivery?.status && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-3">
            <span className="size-1.5 rounded-full bg-amber" aria-hidden />
            {statusLabel(delivery.status)}
          </span>
        )}
      </div>
      <div className="space-y-4 p-4">
        <ErrorBanner message={err} />
        {editable ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="trk-carrier">Carrier</Label>
                <Input id="trk-carrier" value={carrier} maxLength={80} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. Own fleet / Domex" />
              </div>
              <div>
                <Label htmlFor="trk-number">Tracking number</Label>
                <Input id="trk-number" value={trackingNumber} maxLength={120} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="e.g. DMX-204913" className="font-mono" />
              </div>
            </div>
            <div>
              <Label htmlFor="trk-url">Tracking link</Label>
              <Input id="trk-url" type="url" value={trackingUrl} maxLength={500} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-ink-4">The buyer sees these details on their order page.</p>
              <div className="flex items-center gap-3">
                {saved && !dirty && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-mint">
                    <CheckIcon size={13} /> Saved
                  </span>
                )}
                <Button size="sm" variant="secondary" onClick={() => void save()} loading={busy} disabled={!dirty}>
                  Save tracking
                </Button>
              </div>
            </div>
          </>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-bone/50 p-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">Carrier</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{delivery?.carrier ?? '—'}</dd>
            </div>
            <div className="rounded-lg bg-bone/50 p-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">Tracking number</dt>
              <dd className="mt-1 font-mono text-sm text-ink">
                {delivery?.trackingUrl ? (
                  <a href={delivery.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-copper hover:underline">
                    {delivery.trackingNumber ?? 'Track'} <ExternalLinkIcon size={11} />
                  </a>
                ) : (
                  (delivery?.trackingNumber ?? '—')
                )}
              </dd>
            </div>
          </dl>
        )}
        {(delivery?.recipientName || delivery?.podNote || delivery?.hasPodPhoto) && (
          <div className="space-y-2 rounded-lg border border-mint/25 bg-mint/[0.06] p-3 text-sm">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-mint">
              <CheckCircleIcon size={12} /> Proof of delivery
            </div>
            {delivery.recipientName && (
              <div className="text-ink-3">
                Received by <strong className="text-ink">{delivery.recipientName}</strong>
              </div>
            )}
            {delivery.podNote && <p className="italic text-ink-3">“{delivery.podNote}”</p>}
            {delivery.hasPodPhoto && (
              <a href={podPhotoUrl(poId)} target="_blank" rel="noopener noreferrer" className="block">
                <img src={podPhotoUrl(poId)} alt="Proof of delivery" className="max-h-44 rounded-lg border border-line" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
