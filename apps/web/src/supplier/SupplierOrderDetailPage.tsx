import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderStatus } from '@vyro/shared';
import { api, ApiError } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, ErrorBanner, Input, Label, StatusBadge, Textarea, SuccessBanner, Badge } from '@/components/ui';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  PackageIcon,
  TruckIcon,
  XIcon,
  AlertCircleIcon,
  BanknoteIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
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
  statusLabel,
  type DeliveryInfo,
  type LifecycleOrderDetail,
  type LifecycleOrderItem,
} from '@/lib/orderLifecycle';
import { Modal, PaymentStateBadge, PaymentSummaryList, PodDialog, ReasonDialog } from '@/components/orders/LifecycleUi';
import { SupplierReturnsSection } from '@/components/orders/ReturnsPanels';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  preparing: 'Start preparing',
  ready_for_pickup: 'Mark ready for pickup',
  out_for_delivery: 'Dispatch',
  delivered: 'Mark delivered',
};

const ADVANCE_ORDER: OrderStatus[] = ['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

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
      await api.post(`/purchase-orders/${id}/transition`, { to, ...(reason ? { reason } : {}) });
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

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <Link
          to="/supplier/orders"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-ink-3 hover:text-ink"
        >
          <ArrowLeftIcon size={14} /> Back to orders
        </Link>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="inline-flex items-center gap-1 text-xs font-mono text-ink-3 hover:text-ink"
        >
          <RefreshCwIcon size={12} className={query.isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Header */}
      <Surface kind="elevated" className="p-6 border border-ink/10 rounded-lg">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
              Purchase order
            </div>
            <h1 className="vyro-display text-3xl font-bold text-ink">{order.poNumber}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={order.status} />
              <PaymentStateBadge state={paymentSummary?.state} />
              {order.originalTotalCents != null && <Badge variant="purple">Partially fulfilled</Badge>}
            </div>
            <div className="text-xs text-ink-4 font-mono">Placed {formatLifecycleDate(order.createdAt)}</div>
          </div>
          <div className="md:text-right">
            <div className="text-[10px] uppercase font-mono tracking-wider text-ink-4">Order total</div>
            <div className="vyro-metric text-2xl font-bold text-ink">{formatLKR(order.totalCents)}</div>
            {order.originalTotalCents != null && order.originalTotalCents !== order.totalCents && (
              <div className="text-xs font-mono text-ink-4 line-through">{formatLKR(order.originalTotalCents)}</div>
            )}
          </div>
        </div>

        {order.status === 'pending' && lifecycle?.autoCancelAt && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-md border border-amber/30 bg-amber/10 text-amber text-xs font-semibold">
            <ClockIcon size={14} />
            Auto-cancels {formatCountdown(lifecycle.autoCancelAt)} ({formatLifecycleDate(lifecycle.autoCancelAt)}) if
            not accepted.
          </div>
        )}
      </Surface>

      <ErrorBanner message={err} />
      {ok && <SuccessBanner message={ok} />}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Line items */}
          <Surface kind="elevated" className="p-5 border border-ink/10 rounded-lg space-y-3">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-ink flex items-center gap-2">
              <PackageIcon size={14} className="text-copper" /> Line items ({items.length})
            </h2>
            <ItemsTable items={items} />
          </Surface>

          {/* Delivery */}
          <Surface kind="elevated" className="p-5 border border-ink/10 rounded-lg space-y-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-ink flex items-center gap-2">
              <TruckIcon size={14} className="text-copper" /> Delivery
            </h2>
            <div className="flex items-start gap-3 text-sm">
              <MapPinIcon size={16} className="text-copper mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-ink">{order.deliveryAddress}</div>
                <div className="text-xs text-ink-3">
                  {order.deliveryCity}, {order.deliveryDistrict}
                </div>
                {order.notes && <p className="text-xs text-ink-3 mt-1 italic">“{order.notes}”</p>}
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
          </Surface>

          {/* Returns */}
          {(returns.length > 0 || lifecycle?.returnsEnabled) && ['delivered', 'completed', 'disputed'].includes(order.status) && (
            <Surface kind="elevated" className="p-5 border border-ink/10 rounded-lg space-y-3">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-ink flex items-center gap-2">
                <RefreshCwIcon size={14} className="text-copper" /> Returns ({returns.length})
              </h2>
              <SupplierReturnsSection returns={returns} onChanged={() => void refresh()} />
            </Surface>
          )}

          {/* Timeline */}
          <Surface kind="elevated" className="p-5 border border-ink/10 rounded-lg space-y-3">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-ink flex items-center gap-2">
              <ClockIcon size={14} className="text-copper" /> Timeline ({events.length})
            </h2>
            {events.length === 0 ? (
              <p className="text-xs text-ink-4">No events yet.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 text-xs">
                    <span className="size-2 rounded-full bg-ink/40 mt-1.5 shrink-0" />
                    <div className="flex-1 border-b border-ink/5 pb-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="flex items-center gap-2">
                          {eventKind(e) === 'delivery' && <Badge>Delivery</Badge>}
                          <span className="font-semibold text-ink">
                            {e.fromStatus ? `${statusLabel(e.fromStatus)} → ` : ''}
                            {statusLabel(e.toStatus)}
                          </span>
                        </span>
                        <span className="font-mono text-ink-4">{formatLifecycleDate(e.createdAt)}</span>
                      </div>
                      {e.reason && <p className="text-ink-3 mt-1 italic">“{e.reason}”</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Surface>

          <MessageThread purchaseOrderId={order.id} />
        </div>

        {/* Right column: actions + payment */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Surface kind="elevated" className="p-5 border border-ink/10 rounded-lg space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink">Actions</h3>
            {allowed.length === 0 && <p className="text-xs text-ink-4">No actions available for this order right now.</p>}

            {allowed.includes('accepted') && (
              <Button variant="success" className="w-full" onClick={() => setAcceptOpen(true)}>
                <CheckCircleIcon size={14} /> Accept
              </Button>
            )}
            {allowed.includes('rejected') && (
              <Button variant="danger" className="w-full" onClick={() => setReasonFor('rejected')}>
                <XIcon size={14} /> Reject
              </Button>
            )}

            {advances.map((to) => {
              const gated = to === 'out_for_delivery' && !dispatchOk;
              return (
                <div key={to} className="space-y-1">
                  <Button
                    variant="primary"
                    className="w-full"
                    loading={busyTo === to}
                    disabled={gated || (busyTo !== null && busyTo !== to)}
                    onClick={() => (to === 'delivered' ? setPodOpen(true) : void transition(to))}
                  >
                    {ADVANCE_LABEL[to] ?? statusLabel(to)}
                  </Button>
                  {gated && (
                    <p className="text-[11px] text-amber font-semibold flex items-center gap-1">
                      <AlertCircleIcon size={12} /> Awaiting payment
                      {paymentSummary?.dueCents ? ` · ${formatLKR(paymentSummary.dueCents)} due` : ''}
                    </p>
                  )}
                </div>
              );
            })}

            {allowed.includes('cancelled') && (
              <Button variant="ghost" className="w-full text-rose" onClick={() => setReasonFor('cancelled')}>
                Cancel order
              </Button>
            )}
          </Surface>

          {paymentSummary && (
            <Surface kind="elevated" className="p-5 border border-ink/10 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                  <BanknoteIcon size={14} className="text-copper" /> Payment
                </h3>
                <PaymentStateBadge state={paymentSummary.state} />
              </div>
              <PaymentSummaryList summary={paymentSummary} />
            </Surface>
          )}
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
              await api.post(`/purchase-orders/${order.id}/transition`, { to: 'delivered' });
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

/* ── Line items (requested → accepted) ── */

function ItemsTable({ items }: { items: LifecycleOrderItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 text-left border-b border-ink/10">
            <th className="py-2 font-bold">Product</th>
            <th className="py-2 font-bold text-center">Qty</th>
            <th className="py-2 font-bold text-right">Unit</th>
            <th className="py-2 font-bold text-right">Line total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {items.map((it) => {
            const requested = it.requestedQuantity ?? it.quantity;
            const changed = requested !== it.quantity || it.fulfilmentStatus === 'unavailable';
            return (
              <tr key={it.id}>
                <td className="py-3">
                  <div className="font-semibold text-ink">{it.productNameSnapshot}</div>
                  {it.fulfilmentStatus === 'unavailable' && (
                    <div className="text-[11px] text-rose">
                      Unavailable{it.unavailableReason ? ` — ${it.unavailableReason}` : ''}
                    </div>
                  )}
                  {it.fulfilmentStatus === 'reduced' && <div className="text-[11px] text-amber">Reduced quantity</div>}
                </td>
                <td className="py-3 text-center font-mono">
                  {changed ? (
                    <span>
                      <span className="line-through text-ink-4">{requested}</span> → <strong>{it.quantity}</strong>
                    </span>
                  ) : (
                    it.quantity
                  )}
                </td>
                <td className="py-3 text-right font-mono text-ink-3">{formatLKR(it.unitPriceCents)}</td>
                <td className="py-3 text-right font-mono font-bold text-ink">{formatLKR(it.lineTotalCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
      const res = await api.post<{ partial: boolean }>(`/purchase-orders/${poId}/accept`, {
        ...(payload.length ? { lines: payload } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
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
    <div className="p-4 rounded-md border border-line bg-bone/30 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">Tracking</span>
        {delivery?.status && <Badge>{statusLabel(delivery.status)}</Badge>}
      </div>
      <ErrorBanner message={err} />
      {editable ? (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="trk-carrier">Carrier</Label>
              <Input id="trk-carrier" value={carrier} maxLength={80} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. Own fleet / Domex" />
            </div>
            <div>
              <Label htmlFor="trk-number">Tracking number</Label>
              <Input id="trk-number" value={trackingNumber} maxLength={120} onChange={(e) => setTrackingNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="trk-url">Tracking URL</Label>
            <Input id="trk-url" type="url" value={trackingUrl} maxLength={500} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://" />
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => void save()} loading={busy}>
              Save tracking
            </Button>
            {saved && <span className="text-xs text-mint font-semibold">Saved</span>}
          </div>
        </>
      ) : (
        <dl className="grid sm:grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-ink-4">Carrier</dt>
            <dd className="text-ink font-semibold">{delivery?.carrier ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-4">Tracking number</dt>
            <dd className="text-ink font-mono">
              {delivery?.trackingUrl ? (
                <a href={delivery.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-copper hover:underline inline-flex items-center gap-1">
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
        <div className="pt-2 border-t border-line text-xs space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">Proof of delivery</div>
          {delivery.recipientName && <div>Received by <strong>{delivery.recipientName}</strong></div>}
          {delivery.podNote && <p className="text-ink-3 italic">“{delivery.podNote}”</p>}
          {delivery.hasPodPhoto && (
            <a href={podPhotoUrl(poId)} target="_blank" rel="noopener noreferrer">
              <img src={podPhotoUrl(poId)} alt="Proof of delivery" className="mt-1 max-h-40 rounded border border-line" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
