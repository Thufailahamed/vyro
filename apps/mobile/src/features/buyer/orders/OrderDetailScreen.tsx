import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowRight,
  Ban,
  Banknote,
  CheckCheck,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Flag,
  Landmark,
  MessageSquare,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
} from 'lucide-react-native';
import {
  Badge,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  KeyValue,
  ListRow,
  QuickAction,
  QuickActions,
  Screen,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  Timeline,
  useToast,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatLKR, humanize } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { Bubble, InfoGrid, MonoTag, Section, copyToClipboard, go } from './kit';
import { buyerTransitions, invoiceTypeLabel, statusLabel } from './orderStatus';
import { OrderHero } from './components/OrderHero';
import { DeliveryCard, useDelivery } from './components/DeliveryCard';
import { BuyerReturnsSection } from './components/Returns';
import { PaymentBadge, PaymentSummaryRows, ReasonSheet } from '@/features/common/orderLifecycle';
import { deliveryEventStatus, lifecycleErrorMessage, requestedQty, type PaymentSummary } from '@/lib/orderLifecycle';
import { openStorefront } from '../commerce/data';
import { useReorderToCart } from './useReorder';
import type { InvoiceRow, OrderDetail, Payment, PoMessage, ReconciliationResult, WireInstructions } from './types';

export function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/purchase-orders/${id}`),
    enabled: !!id,
  });

  const supplierId = q.data?.order.supplierId;
  const supplier = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => api.get<{ supplier: { id: string; name: string; slug?: string | null } }>(`/suppliers/${supplierId}`),
    enabled: !!supplierId,
    staleTime: 60_000,
    retry: false,
  });

  const payments = useQuery({
    queryKey: ['payments', id],
    queryFn: () => api.get<{ payments: Payment[] }>(`/payments/by-po/${id}`),
    enabled: !!id,
  });

  const invoices = useQuery({
    queryKey: ['po-invoices', id],
    queryFn: () => api.get<{ invoices: InvoiceRow[] }>('/invoices' + qs({ poId: id })),
    enabled: !!id,
    retry: false,
  });

  const order = q.data?.order;
  const items = q.data?.items ?? [];
  const events = q.data?.events ?? [];
  const status = order?.status ?? 'pending';
  const lifecycle = q.data?.lifecycle;
  const delivery = useDelivery(id, !!order && (!!q.data?.delivery || ['out_for_delivery', 'delivered', 'completed'].includes(status)));

  const [exitSheet, setExitSheet] = useState<'cancelled' | 'disputed' | null>(null);
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Server-computed edges for this viewer; local rules only as a fallback.
  const allowed = useMemo(() => lifecycle?.allowedTransitions ?? buyerTransitions(status), [lifecycle, status]);
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const totalDiscount = items.reduce((sum, it) => {
    if (!it.discountPctSnapshot || it.discountPctSnapshot <= 0) return sum;
    return sum + Math.round(it.unitPriceCents * it.quantity * (it.discountPctSnapshot / 100));
  }, 0);

  const transition = useMutation({
    mutationFn: (v: { to: string; reason?: string }) => api.post(`/purchase-orders/${id}/transition`, { to: v.to, ...(v.reason ? { reason: v.reason } : {}) }),
    onSuccess: (_d, v) => {
      toast.success(v.to === 'completed' ? 'Receipt confirmed' : v.to === 'disputed' ? 'Dispute opened' : `Order ${statusLabel(v.to).toLowerCase()}`);
      setExitSheet(null);
      void Promise.all([q.refetch(), payments.refetch()]);
    },
    onError: (e) => toast.error('Could not update order', lifecycleErrorMessage(e)),
  });

  const reorder = useReorderToCart();

  const refundablePayment = useMemo(
    () =>
      (payments.data?.payments ?? [])
        .filter((p) => p.status === 'confirmed')
        .sort((a, b) => b.amountCents - a.amountCents)[0] ?? null,
    [payments.data],
  );

  if (q.isLoading) {
    return (
      <Screen scroll={false}>
        <SkeletonList rows={5} height={110} />
      </Screen>
    );
  }

  if (q.isError || !order) {
    return (
      <Screen>
        <View style={{ paddingTop: 60 }}>
          {q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              icon={FileText}
              title="Order not found"
              message="This purchase order may have been removed, or you may not have access."
              action={{ label: 'Back to orders', onPress: () => go('/buyer/orders', true) }}
            />
          )}
        </View>
      </Screen>
    );
  }

  const isTerminal = ['rejected', 'cancelled', 'disputed', 'failed'].includes(status);
  // Windows are evaluated as of the last fetch (pull to refresh re-checks); the API enforces them.
  const now = q.dataUpdatedAt;
  const canConfirm = allowed.includes('completed');
  const canCancel = allowed.includes('cancelled');
  const disputeEnds = lifecycle?.disputeWindowEndsAt ?? null;
  const canDispute = allowed.includes('disputed') && (disputeEnds == null || disputeEnds > now);
  const returnEnds = lifecycle?.returnWindowEndsAt ?? null;
  const canReturn = (lifecycle?.returnsEnabled ?? false) && ['delivered', 'completed'].includes(status) && returnEnds != null && returnEnds > now;
  const partial = order.originalTotalCents != null && order.originalTotalCents !== order.totalCents;
  const refresh = () => Promise.all([q.refetch(), payments.refetch(), invoices.refetch()]);

  return (
    <Screen
      onRefresh={refresh}
      footer={
        canConfirm ? (
          <Button
            title="Confirm receipt — release funds"
            icon={CheckCheck}
            size="lg"
            full
            loading={transition.isPending && transition.variables?.to === 'completed'}
            onPress={() => transition.mutate({ to: 'completed' })}
          />
        ) : undefined
      }
    >
      <OrderHero
        poNumber={order.poNumber}
        status={status}
        totalCents={order.totalCents}
        discountCents={totalDiscount}
        itemCount={items.length}
        units={totalQty}
        createdAt={order.createdAt}
        supplierName={supplier.data?.supplier?.name ?? null}
        eta={delivery.data?.delivery?.estimatedAt}
        onCopy={() => {
          void copyToClipboard(order.poNumber).then((ok) => ok && toast.success('PO number copied'));
        }}
        onSupplier={supplier.data?.supplier ? () => openStorefront(supplier.data!.supplier) : undefined}
      />

      <QuickActions style={{ paddingHorizontal: 4 }}>
        <QuickAction
          icon={Copy}
          label="Copy PO"
          onPress={() => {
            void copyToClipboard(order.poNumber).then((ok) => ok && toast.success('PO number copied'));
          }}
        />
        {supplier.data?.supplier ? <QuickAction icon={Store} label="Supplier" onPress={() => openStorefront(supplier.data!.supplier)} /> : null}
        {['delivered', 'completed', 'ready_for_pickup'].includes(status) ? (
          <QuickAction icon={RefreshCw} label="Reorder" tone="volt" onPress={() => reorder.mutate(order.id)} />
        ) : null}
        {order.rfqId ? <QuickAction icon={FileText} label="Linked RFQ" onPress={() => go(`/buyer/rfqs/${order.rfqId}`)} /> : null}
      </QuickActions>

      {order.rejectionReason ? <Banner tone="danger" title="Rejected" message={order.rejectionReason} /> : null}
      {order.cancelledReason ? (
        <Banner
          tone="warning"
          title={order.cancelledByRole === 'supplier' ? 'Cancelled by supplier' : order.autoAction ? 'Cancelled automatically' : 'Cancelled'}
          message={order.cancelledReason}
        />
      ) : null}
      {status === 'disputed' ? (
        <Banner tone="danger" title="Under dispute" message={`${order.disputeReason ? `“${order.disputeReason}” — ` : ''}VYRO ops will review and settle the payment.`} />
      ) : order.disputeOutcome ? (
        <Banner tone="info" title="Dispute resolved" message={`Outcome: ${humanize(order.disputeOutcome)}${order.disputeResolvedAt ? ` · ${formatDate(order.disputeResolvedAt)}` : ''}`} />
      ) : null}
      {partial ? (
        <Banner
          tone="warning"
          title="Partially fulfilled"
          message={`The supplier could only supply part of this order. Total reduced from ${formatLKR(order.originalTotalCents)} to ${formatLKR(order.totalCents)}; anything you already paid for the difference is refunded automatically.`}
        />
      ) : null}
      {status === 'delivered' && lifecycle?.autoCompleteAt ? (
        <Banner
          tone="info"
          title="Confirm or raise an issue"
          message={`This order completes automatically on ${formatDateTime(lifecycle.autoCompleteAt)} and funds are released to the supplier, unless you confirm receipt or open a dispute first.`}
        />
      ) : null}
      {status === 'pending' && lifecycle?.autoCancelAt ? (
        <Banner tone="info" message={`If the supplier doesn't respond by ${formatDateTime(lifecycle.autoCancelAt)}, this order is cancelled automatically.`} />
      ) : null}

      {/* ── Line items ─────────────────────────────────── */}
      <Section step={1} kicker="Items" title={`Line items (${items.length})`} sub={`${totalQty.toLocaleString()} units on this purchase order`} icon={Package}>
        {items.length === 0 ? (
          <Text variant="bodySm" color="ink4">
            No line items on this order.
          </Text>
        ) : (
          <View style={{ gap: 0 }}>
            {items.map((it, i) => (
              <View
                key={it.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.lineSoft,
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 13, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink3 }}>{String(i + 1).padStart(2, '0')}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={2}>
                    {it.productNameSnapshot}
                  </Text>
                  {(it.discountPctSnapshot ?? 0) > 0 ? <MonoTag label={`−${it.discountPctSnapshot}% volume`} tone="mint" /> : null}
                  {it.fulfilmentStatus === 'unavailable' ? (
                    <MonoTag label={`Unavailable · ordered ${requestedQty(it)}`} tone="rose" />
                  ) : requestedQty(it) !== it.quantity ? (
                    <MonoTag label={`Ordered ${requestedQty(it)} → ${it.quantity}`} tone="amber" />
                  ) : null}
                  {it.unavailableReason ? (
                    <Text variant="caption" color="ink4">
                      {it.unavailableReason}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink }}>{formatLKR(it.lineTotalCents)}</Text>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink5 }}>
                    {it.quantity} × {formatLKR(it.unitPriceCents)}
                  </Text>
                </View>
              </View>
            ))}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 14,
                marginTop: 6,
                borderRadius: radii.lg,
                borderCurve: 'continuous',
                backgroundColor: colors.pearl,
              }}
            >
              <Text variant="overline" color="ink4">
                {totalDiscount > 0 ? 'Subtotal after discounts' : 'Order total'}
              </Text>
              <Text variant="metricSm">{formatLKR(order.totalCents)}</Text>
            </View>
          </View>
        )}
      </Section>

      {/* ── 3-way reconciliation ───────────────────────── */}
      <ReconciliationCard
        orderId={order.id}
        poNumber={order.poNumber}
        poTotalCents={order.totalCents}
        orderStatus={status}
        onReleasePayment={canConfirm ? () => transition.mutate({ to: 'completed' }) : undefined}
      />

      {/* ── Delivery ───────────────────────────────────── */}
      <DeliveryCard order={order} delivery={delivery.data?.delivery ?? null} loading={delivery.isLoading} />

      {/* ── Invoices ───────────────────────────────────── */}
      {(invoices.data?.invoices ?? []).length > 0 ? (
        <Section kicker="Documents" title="Invoices" icon={FileText} sub="Receipts, tax invoices and credit notes issued for this order">
          <View>
            {(invoices.data?.invoices ?? []).map((inv, i, arr) => (
              <ListRow
                key={inv.id}
                title={inv.number}
                subtitle={`${invoiceTypeLabel(inv.type)} · ${formatDate(inv.issuedAt)}`}
                meta={inv.type === 'credit_note' ? `−${formatLKR(Math.abs(inv.totalCents))}` : formatLKR(inv.totalCents)}
                icon={FileText}
                last={i === arr.length - 1}
                onPress={() => go(`/buyer/order/${order.id}/invoice/${inv.id}`)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      {/* ── Payments ───────────────────────────────────── */}
      <PaymentCard
        order={order}
        summary={q.data?.paymentSummary ?? null}
        payments={payments.data?.payments ?? []}
        loading={payments.isLoading}
        onChanged={() => Promise.all([payments.refetch(), q.refetch()])}
      />

      {/* ── Wire instructions (cross-border) ───────────── */}
      {order.direction !== 'domestic' && order.paymentMethod === 'wire' ? <WireCard poId={order.id} enabled={!isTerminal} /> : null}

      {/* ── Order info ─────────────────────────────────── */}
      <Section kicker="Reference" title="Order information" icon={ShieldCheck}>
        <InfoGrid
          items={[
            { label: 'Status', value: statusLabel(status) },
            { label: 'Issued', value: formatDate(order.createdAt), mono: true },
            { label: 'Line items', value: String(items.length), mono: true },
            { label: 'Subtotal', value: formatLKR(order.subtotalCents), mono: true },
            { label: 'Direction', value: humanize(order.direction) },
            { label: 'Payment', value: order.paymentMethod === 'wire' ? 'Bank wire' : 'payments.lk' },
          ]}
        />
        {order.rfqId ? (
          <Button title="View linked RFQ" iconRight={ArrowRight} variant="ghost" size="sm" onPress={() => go(`/buyer/rfqs/${order.rfqId}`)} />
        ) : null}
      </Section>

      {/* ── Buyer actions ──────────────────────────────── */}
      {canCancel || canDispute || (allowed.includes('disputed') && disputeEnds != null) ? (
        <Section kicker="Actions" title="Something wrong?" icon={Clock} sub="Actions available for this order right now">
          {canCancel ? (
            <View style={{ gap: 6 }}>
              <Button title="Cancel order" icon={Ban} variant="danger" full onPress={() => setExitSheet('cancelled')} />
              <Text variant="caption" color="ink5">
                {status === 'pending' ? 'The supplier has not accepted yet.' : 'The supplier is notified; any payment is refunded.'}
              </Text>
            </View>
          ) : null}
          {canDispute ? (
            <View style={{ gap: 6 }}>
              <Button title="Open a dispute" icon={Flag} variant="secondary" full onPress={() => setExitSheet('disputed')} />
              <Text variant="caption" color="ink5">
                {disputeEnds ? `Available until ${formatDateTime(disputeEnds)}. ` : ''}Payment to the supplier is held while VYRO reviews.
              </Text>
            </View>
          ) : allowed.includes('disputed') && disputeEnds != null ? (
            <Text variant="bodySm" color="ink4">
              The dispute window closed on {formatDateTime(disputeEnds)}.
            </Text>
          ) : null}
        </Section>
      ) : null}

      <BuyerReturnsSection order={order} items={items} returns={q.data?.returns ?? []} canRequest={canReturn} windowEndsAt={returnEnds} />

      {['delivered', 'completed', 'ready_for_pickup'].includes(status) ? (
        <Section kicker="Again" title="Reorder" icon={RefreshCw} sub="Copy these lines into your cart at today's prices">
          <Button title="Add all to cart" icon={RefreshCw} variant="secondary" loading={reorder.isPending} onPress={() => reorder.mutate(order.id)} full />
        </Section>
      ) : null}

      {status === 'delivered' || status === 'completed' ? (
        <>
          <RateSupplierCard orderId={order.id} onWrite={() => setReviewOpen(true)} />
          <Section kicker="Escrow" title="Request a refund" icon={CreditCard} sub="Reviewed by the VYRO trust team within 1–2 business days">
            {refundablePayment ? (
              <>
                <Text variant="bodySm" color="ink4">
                  Opens a refund for the most recent confirmed payment of{' '}
                  <Text variant="bodySm" weight="semibold" color="ink">
                    {formatLKR(refundablePayment.amountCents)}
                  </Text>
                  .
                </Text>
                <Button title="Request refund" variant="danger" onPress={() => setRefundFor(refundablePayment)} />
              </>
            ) : (
              <Text variant="bodySm" color="ink4">
                Refunds are only available on confirmed payments. This order has no confirmed payment yet.
              </Text>
            )}
          </Section>
        </>
      ) : null}

      {/* ── Activity ───────────────────────────────────── */}
      <Section kicker="History" title="Activity timeline" icon={Clock} sub={`${events.length} event${events.length === 1 ? '' : 's'}`}>
        {events.length === 0 ? (
          <Text variant="bodySm" color="ink4">
            No events recorded yet.
          </Text>
        ) : (
          <Timeline
            steps={events.map((e) => ({
              label: deliveryEventStatus(e.metadata) ? `Delivery · ${statusLabel(deliveryEventStatus(e.metadata)!)}` : statusLabel(e.toStatus),
              hint: `${formatDateTime(e.createdAt)}${e.fromStatus ? ` · from ${statusLabel(e.fromStatus)}` : ''}${e.reason ? ` — “${e.reason}”` : ''}`,
              state: 'done' as const,
            }))}
          />
        )}
      </Section>

      {/* ── Messages ───────────────────────────────────── */}
      <MessagesCard orderId={order.id} userId={user?.userId} />

      <ReasonSheet
        visible={exitSheet === 'cancelled'}
        onClose={() => setExitSheet(null)}
        title={`Cancel ${order.poNumber}?`}
        message="The supplier is notified and the order closes. This can't be undone."
        confirmLabel="Cancel order"
        loading={transition.isPending}
        placeholder="e.g. Ordered the wrong pack size"
        onConfirm={(reason) => transition.mutate({ to: 'cancelled', reason })}
      />
      <ReasonSheet
        visible={exitSheet === 'disputed'}
        onClose={() => setExitSheet(null)}
        title="Open a dispute"
        message={`VYRO ops review the order and hold the supplier's payment until it's settled.${disputeEnds ? ` Window closes ${formatDateTime(disputeEnds)}.` : ''}`}
        confirmLabel="Open dispute"
        loading={transition.isPending}
        placeholder="e.g. 12 of 50 bags arrived torn and wet"
        onConfirm={(reason) => transition.mutate({ to: 'disputed', reason })}
      />
      <RefundSheet payment={refundFor} onClose={() => setRefundFor(null)} />
      <ReviewSheet orderId={order.id} visible={reviewOpen} onClose={() => setReviewOpen(false)} />
    </Screen>
  );
}

/* ------------------------------- payments ------------------------------- */

function PaymentCard({
  order,
  summary,
  payments,
  loading,
  onChanged,
}: {
  order: OrderDetail['order'];
  summary: PaymentSummary | null;
  payments: Payment[];
  loading: boolean;
  onChanged: () => unknown;
}) {
  const toast = useToast();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [useCardId, setUseCardId] = useState('');

  const cardsQ = useQuery({
    queryKey: ['saved-cards'],
    queryFn: () =>
      api.get<{ cards: Array<{ id: string; brand: string | null; last4: string | null; expiryMonth: number | null; expiryYear: number | null }> }>(
        `/payments/saved-cards?businessId=${order.businessId}`,
      ),
  });
  const savedCards = cardsQ.data?.cards ?? [];

  const confirmedTotal = payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amountCents, 0);
  const outstanding = summary ? summary.dueCents : order.totalCents - confirmedTotal;
  const offline = summary?.method === 'cod' || summary?.method === 'credit';
  const canPay = outstanding > 0 && !offline && order.status !== 'cancelled' && order.status !== 'rejected';
  const lastFailed = [...payments].reverse().find((p) => ['failed', 'cancelled', 'chargeback'].includes(p.status));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error('Payment failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function payOnline(paymentId?: string) {
    await run(async () => {
      let id = paymentId;
      if (!id) {
        const r = await api.post<{ id: string }>(`/payments`, {
          purchaseOrderId: order.id,
          method: 'online',
          notes: lastFailed ? `Retry after ${lastFailed.status}` : 'Pay online via payments.lk',
        });
        id = r.id;
      }
      const r = await api.post<{ redirectUrl?: string; isMock: boolean; status?: string }>(
        `/payments/${id}/checkout`,
        useCardId ? { useSavedCardId: useCardId } : {},
      );
      if (r.status === 'succeeded') {
        toast.success('Payment complete', 'Charged to your saved card.');
        onChanged();
        return;
      }
      if (r.isMock) toast.info('Staging payment simulator', 'No real money will move.');
      await WebBrowser.openBrowserAsync(r.redirectUrl!);
      onChanged();
    });
  }

  return (
    <Section
      kicker="Settlement"
      title={`Payment · ${formatLKR(order.totalCents)}`}
      icon={Banknote}
      sub={summary ? `${formatLKR(summary.paidCents)} paid · ${formatLKR(summary.dueCents)} due` : `${formatLKR(confirmedTotal)} confirmed`}
      right={<PaymentBadge summary={summary} />}
    >
      {summary && (summary.refundedCents > 0 || summary.pendingRefundCents > 0 || offline) ? <PaymentSummaryRows summary={summary} /> : null}
      {payments.length === 0 && !loading ? (
        <Text variant="bodySm" color="ink4">
          No payments recorded yet.
        </Text>
      ) : (
        <View style={{ gap: 10 }}>
          {payments.map((p) => (
            <View
              key={p.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status={p.status} size="sm" />
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13 }}>{formatLKR(p.amountCents)}</Text>
                  <Text variant="caption" color="ink5">
                    {humanize(p.method)}
                  </Text>
                </View>
                {p.transactionReference ? (
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink4 }}>ref: {p.transactionReference}</Text>
                ) : null}
              </View>
              {p.status === 'pending' && p.method === 'online' && canPay ? (
                <Button title="Pay" size="sm" loading={busy} onPress={() => payOnline(p.id)} />
              ) : null}
            </View>
          ))}
        </View>
      )}

      {canPay ? (
        <View style={{ gap: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 12 }}>
          {savedCards.length > 0 ? (
            <View style={{ gap: 6 }}>
              {savedCards.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setUseCardId(useCardId === c.id ? '' : c.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
                    borderRadius: radii.lg, borderCurve: 'continuous',
                    backgroundColor: useCardId === c.id ? colors.voltSoft : colors.pearl,
                  }}
                >
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13 }}>
                    {c.brand ?? 'Card'} ····{c.last4}
                  </Text>
                  <Text variant="caption" color="ink5" style={{ marginLeft: 'auto' }}>
                    {useCardId === c.id ? 'Selected' : 'Use'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Input value={ref} onChangeText={setRef} placeholder="Bank reference / transaction ID" autoCapitalize="none" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Mark paid (bank)"
              variant="secondary"
              style={{ flex: 1 }}
              loading={busy}
              onPress={() =>
                run(async () => {
                  await api.post(
                    `/payments`,
                    { purchaseOrderId: order.id, method: 'bank_transfer', transactionReference: ref || undefined, notes: 'Recorded from order detail' },
                    { idempotencyKey: true },
                  );
                  setRef('');
                  toast.success('Payment recorded', 'Pending supplier confirmation.');
                })
              }
            />
            <Button title="Pay online" icon={CreditCard} style={{ flex: 1 }} loading={busy} onPress={() => payOnline()} />
          </View>
          <Text variant="caption" color="ink5">
            Outstanding {formatLKR(outstanding)} · online checkout opens payments.lk in a browser; status updates from server confirmation.
          </Text>
        </View>
      ) : null}
    </Section>
  );
}

/* ----------------------------- wire transfer ---------------------------- */

function WireCard({ poId, enabled }: { poId: string; enabled: boolean }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const q = useQuery({
    queryKey: ['wire-instructions', poId],
    queryFn: () => api.post<WireInstructions>(`/purchase-orders/${poId}/wire-instructions`, {}),
    enabled: enabled && expanded,
    retry: false,
  });
  const d = q.data;

  const copy = (value: string, label: string) => {
    void copyToClipboard(value).then((ok) => ok && toast.success(`${label} copied`));
  };

  return (
    <Section kicker="Cross-border" title="Bank wire payment" icon={Landmark} sub="Initiate an international transfer, then reconcile here">
      {!expanded ? (
        <Button title="Initiate wire payment" icon={CreditCard} onPress={() => setExpanded(true)} full />
      ) : q.isLoading ? (
        <Text variant="bodySm" color="ink4">
          Generating beneficiary instructions…
        </Text>
      ) : q.isError ? (
        <Banner tone="danger" message={errorMessage(q.error)} action={{ label: 'Retry', onPress: () => q.refetch() }} />
      ) : d ? (
        <View style={{ gap: 12 }}>
          <View style={[{ backgroundColor: colors.ink, borderRadius: radii.xl, borderCurve: 'continuous', padding: 16, gap: 8 }, shadow.ink]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="overline" color="volt">
                Amount due (LKR)
              </Text>
              <IconButton icon={Copy} variant="glass" size={30} accessibilityLabel="Copy amount" onPress={() => copy(String(d.totalLkrCents / 100), 'Amount')} />
            </View>
            <Text variant="metricSm" color="volt">
              {formatLKR(d.totalLkrCents)}
            </Text>
            {d.equivalents.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 12, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.paperLine, paddingTop: 8 }}>
                {d.equivalents.map((eq) => (
                  <View key={eq.currency}>
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.paper }}>
                      {eq.currency} {(eq.amountCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.paperMuted }}>≈ {Number(eq.rateScaled) / 1e8}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <View style={{ paddingHorizontal: 14, paddingVertical: 2, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
            {(
              [
                ['Beneficiary', d.beneficiary.name],
                ['Bank', d.beneficiary.bankName],
                ['Account #', d.beneficiary.accountNumber],
                ['SWIFT / BIC', d.beneficiary.swiftBic],
                ['IBAN', d.beneficiary.iban],
                ['Intermediary', d.beneficiary.intermediaryName],
                ['Reference', d.beneficiary.reference],
                ['Memo', d.beneficiary.memo],
              ] as [string, string | undefined][]
            )
              .filter(([, v]) => !!v)
              .map(([label, v], i, arr) => <KeyValue key={label} label={label} value={v} mono last={i === arr.length - 1} />)}
          </View>
          <Banner tone="success" message={`Wire initiated ${formatDateTime(d.initiatedAt)}. Supplier notified — reconciliation within 1–2 business days.`} />
        </View>
      ) : null}
    </Section>
  );
}

/* ---------------------------- reconciliation ---------------------------- */

function ReconciliationCard({ orderId, poNumber, poTotalCents, orderStatus, onReleasePayment }: { orderId: string; poNumber: string; poTotalCents: number; orderStatus: string; onReleasePayment?: () => void }) {
  const toast = useToast();
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [claim, setClaim] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);

  const run = useMutation({
    mutationFn: () =>
      api.post<{ reconciliation: ReconciliationResult }>(`/purchase-orders/${orderId}/reconciliation`, {
        invoiceData: {
          invoiceNumber: `INV-${poNumber}`,
          totalCents: poTotalCents,
          items: [{ description: `Authorized wholesale line items (${poNumber})`, quantity: 1, unitPriceCents: poTotalCents, totalCents: poTotalCents }],
        },
      }),
    onSuccess: (r) => {
      setResult(r.reconciliation);
      if (r.reconciliation.draftClaimNote) setClaim(r.reconciliation.draftClaimNote);
      toast.success('3-way audit complete');
    },
    onError: (e) => toast.error('Audit failed', errorMessage(e)),
  });

  const submitClaim = useMutation({
    mutationFn: () =>
      api.post(`/purchase-orders/${orderId}/reconciliation/claim`, {
        claimMessage: claim.trim(),
        discrepancyCents: result?.netDifferenceCents ?? 0,
        affectedLineItems: (result?.lines ?? []).map((l) => l.poItemId ?? l.description),
      }),
    onSuccess: () => {
      toast.success('Discrepancy claim submitted to supplier');
      setClaimOpen(false);
    },
    onError: (e) => toast.error('Claim failed', errorMessage(e)),
  });

  return (
    <Section kind="elevated" kicker="Audit" title="3-way PO & invoice reconciliation" icon={FileText} sub="Cross-checks PO rates, dock delivery and vendor invoice">
      <Button title={run.isPending ? 'Auditing records…' : 'Run 3-way audit'} icon={Sparkles} variant="secondary" loading={run.isPending} onPress={() => run.mutate()} full />

      {result ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pillar label="PO authorized" value={formatLKR(result.poTotalCents)} />
            <Pillar label="Delivery" value={result.isDeliveryConfirmed ? 'Verified' : `Pending · ${statusLabel(orderStatus)}`} tone={result.isDeliveryConfirmed ? 'success' : 'warning'} />
            <Pillar label="Invoice" value={formatLKR(result.invoiceTotalCents)} tone={result.netDifferenceCents === 0 ? 'success' : 'danger'} />
          </View>
          <Banner
            tone={result.status === 'perfect_match' ? 'success' : result.status === 'discrepancy_detected' ? 'warning' : 'danger'}
            title={result.summary}
            message={`Confidence ${(result.matchConfidence * 100).toFixed(0)}% · recommended: ${result.recommendedAction.replace(/_/g, ' ')}`}
          />
          {result.lines.map((l, i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodySm" weight="medium" numberOfLines={2}>
                  {l.description}
                </Text>
                <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink4 }}>
                  PO {l.poQuantity ?? '—'} @ {l.poUnitPriceCents != null ? formatLKR(l.poUnitPriceCents) : '—'} · billed {l.billedQuantity ?? '—'} @{' '}
                  {l.billedUnitPriceCents != null ? formatLKR(l.billedUnitPriceCents) : '—'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Badge
                  label={l.status.replace(/_/g, ' ')}
                  size="sm"
                  tone={l.status === 'matched' ? 'success' : l.status === 'price_variance' ? 'danger' : 'warning'}
                />
                {l.varianceCents !== 0 ? (
                  <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.rose }}>{formatLKR(l.varianceCents)}</Text>
                ) : null}
              </View>
            </View>
          ))}
          {result.status === 'perfect_match' ? (
            onReleasePayment ? <Button title="Approve invoice & release escrow" icon={CheckCheck} onPress={onReleasePayment} full /> : null
          ) : (
            <>
              <Button title="File discrepancy claim" icon={FileText} variant="copper" onPress={() => setClaimOpen((v) => !v)} full />
              {claimOpen ? (
                <View style={{ gap: 10, borderRadius: radii.xl, borderCurve: 'continuous', padding: 14, backgroundColor: colors.amberSoft }}>
                  <Text variant="bodySm" weight="semibold">
                    Draft supplier claim
                  </Text>
                  <Input value={claim} onChangeText={setClaim} multiline placeholder="Describe the discrepancy…" />
                  <Button title="Submit claim to supplier" size="sm" variant="danger" loading={submitClaim.isPending} disabled={!claim.trim()} onPress={() => submitClaim.mutate()} />
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </Section>
  );
}

function Pillar({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'danger' }) {
  const fg = tone === 'success' ? colors.mint : tone === 'warning' ? colors.amber : tone === 'danger' ? colors.rose : colors.ink;
  return (
    <View style={{ flex: 1, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl, padding: 12, gap: 4 }}>
      <Text variant="overline" color="ink5">
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: fg }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------- messages ------------------------------- */

function MessagesCard({ orderId, userId }: { orderId: string; userId?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const focused = useIsFocused();

  const q = useQuery({
    queryKey: ['po-messages', orderId],
    queryFn: () => api.get<{ messages: PoMessage[] }>(`/purchase-orders/${orderId}/messages`),
    refetchInterval: focused ? 8000 : false,
  });
  const messages = q.data?.messages ?? [];

  const send = useMutation({
    mutationFn: (text: string) => api.post(`/purchase-orders/${orderId}/messages`, { body: text }),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['po-messages', orderId] });
      void api.post(`/purchase-orders/${orderId}/messages/read`, {}).catch(() => {});
    },
    onError: (e) => toast.error('Could not send', errorMessage(e)),
  });

  return (
    <Section kicker="Thread" title="Messages" icon={MessageSquare} sub="Direct line to the supplier on this PO">
      <View style={{ gap: 10 }}>
        {messages.length === 0 ? (
          <Text variant="bodySm" color="ink4">
            No messages yet. Start the conversation.
          </Text>
        ) : (
          messages.slice(-20).map((m) => (
            <Bubble key={m.id} mine={m.senderUserId === userId} meta={formatDateTime(m.createdAt)}>
              <Text variant="bodySm" color={m.senderUserId === userId ? 'paper' : 'ink'}>
                {m.body}
              </Text>
            </Bubble>
          ))
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 5,
          minHeight: 52,
          borderRadius: radii.pill,
          backgroundColor: colors.pearl,
        }}
      >
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Type a message…"
          placeholderTextColor={colors.ink5}
          selectionColor={colors.copper}
          onSubmitEditing={() => body.trim() && send.mutate(body.trim())}
          returnKeyType="send"
          style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink, paddingVertical: 10 }}
        />
        <IconButton
          icon={Send}
          accessibilityLabel="Send message"
          variant="volt"
          size={42}
          onPress={() => body.trim() && send.mutate(body.trim())}
          style={{ opacity: send.isPending || !body.trim() ? 0.4 : 1 }}
        />
      </View>
    </Section>
  );
}

/* --------------------------------- review -------------------------------- */

function RateSupplierCard({ orderId, onWrite }: { orderId: string; onWrite: () => void }) {
  const q = useQuery({
    queryKey: ['review-eligibility', orderId],
    queryFn: () => api.get<{ canReview?: boolean; reason?: string | null }>(`/orders/${orderId}/eligibility`),
    retry: false,
  });
  if (q.isLoading || !q.data?.canReview) return null;
  return (
    <Section kicker="Feedback" title="Rate this supplier" icon={Star} sub="Reviews help other buyers — and the supplier improve">
      <Button title="Write a review" icon={Star} variant="copper" onPress={onWrite} full />
    </Section>
  );
}

function ReviewSheet({ orderId, visible, onClose }: { orderId: string; visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post('/reviews', { orderId, rating, body }),
    onSuccess: () => {
      toast.success('Review submitted');
      setBody('');
      setRating(5);
      onClose();
    },
    onError: (e) => toast.error('Could not submit', errorMessage(e)),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Rate this supplier" subtitle="How did this order go?" scroll>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <View key={n} style={{ flex: 1 }}>
              <Button title={String(n)} variant={rating === n ? 'volt' : 'secondary'} onPress={() => setRating(n)} full />
            </View>
          ))}
        </View>
        <Input value={body} onChangeText={setBody} multiline placeholder="Delivery, quality, communication…" maxLength={2000} />
        <Text variant="caption" color="ink5" style={{ textAlign: 'right' }}>
          {body.length}/2000
        </Text>
        <Button title="Submit review" full size="lg" loading={submit.isPending} disabled={!body.trim()} onPress={() => submit.mutate()} />
      </View>
    </Sheet>
  );
}

/* --------------------------------- refund -------------------------------- */

function RefundSheet({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post(`/refunds/${payment?.id}/refund`, { reason: reason.trim() || 'Buyer requested refund' }),
    onSuccess: () => {
      toast.success('Refund requested', 'You will be notified when it completes.');
      setReason('');
      void qc.invalidateQueries({ queryKey: ['payments'] });
      onClose();
    },
    onError: (e) => toast.error('Refund failed', errorMessage(e)),
  });

  return (
    <ConfirmSheet
      visible={!!payment}
      onClose={onClose}
      onConfirm={() => submit.mutate()}
      title="Request a refund"
      message={payment ? `Refund of ${formatLKR(payment.amountCents)} — reviewed by the trust team in 1–2 business days.` : undefined}
      confirmLabel="Submit refund request"
      variant="danger"
      loading={submit.isPending}
    >
      <Input value={reason} onChangeText={setReason} multiline placeholder="e.g. 12 of 50 units arrived damaged." maxLength={500} />
    </ConfirmSheet>
  );
}
