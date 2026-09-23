import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowRight,
  Banknote,
  CheckCheck,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Landmark,
  MessageSquare,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
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
  ListCard,
  ListRow,
  Screen,
  Select,
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
import { colors, fonts, radii } from '@/theme/tokens';
import { Bubble, InfoGrid, MonoTag, Section, copyToClipboard, go } from './kit';
import { buyerTransitions, statusLabel } from './orderStatus';
import { OrderHero } from './components/OrderHero';
import { DeliveryCard, useDelivery } from './components/DeliveryCard';
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
  const delivery = useDelivery(id, !!order && ['out_for_delivery', 'delivered', 'completed'].includes(status));

  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const allowed = useMemo(() => buyerTransitions(status), [status]);
  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const totalDiscount = items.reduce((sum, it) => {
    if (!it.discountPctSnapshot || it.discountPctSnapshot <= 0) return sum;
    return sum + Math.round(it.unitPriceCents * it.quantity * (it.discountPctSnapshot / 100));
  }, 0);

  const transition = useMutation({
    mutationFn: (target: string) => api.post(`/purchase-orders/${id}/transition`, { to: target, reason: reason.trim() || undefined }),
    onSuccess: (_d, target) => {
      toast.success(`Status updated to ${statusLabel(target)}`);
      setReason('');
      void q.refetch();
    },
    onError: (e) => toast.error('Could not update status', errorMessage(e)),
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
  const refresh = () => Promise.all([q.refetch(), payments.refetch(), invoices.refetch()]);

  return (
    <Screen
      onRefresh={refresh}
      footer={
        status === 'delivered' ? (
          <Button
            title="Confirm receipt — release funds"
            icon={CheckCheck}
            size="lg"
            full
            loading={transition.isPending}
            onPress={() => transition.mutate('completed')}
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

      {order.rejectionReason ? <Banner tone="danger" title="Rejected" message={order.rejectionReason} /> : null}
      {order.cancelledReason ? <Banner tone="warning" title="Cancelled" message={order.cancelledReason} /> : null}

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
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.lineSoft,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink4 }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={2}>
                    {it.productNameSnapshot}
                  </Text>
                  {(it.discountPctSnapshot ?? 0) > 0 ? <MonoTag label={`−${it.discountPctSnapshot}% volume`} tone="mint" /> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink }}>{formatLKR(it.lineTotalCents)}</Text>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink5 }}>
                    {it.quantity} × {formatLKR(it.unitPriceCents)}
                  </Text>
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1.5, borderTopColor: colors.lineStrong, paddingTop: 12, marginTop: 4 }}>
              <Text variant="overline" color="ink4">
                {totalDiscount > 0 ? 'Subtotal after discounts' : 'Order total'}
              </Text>
              <Text variant="metricSm">{formatLKR(order.totalCents)}</Text>
            </View>
          </View>
        )}
      </Section>

      {/* ── 3-way reconciliation ───────────────────────── */}
      <ReconciliationCard orderId={order.id} poNumber={order.poNumber} poTotalCents={order.totalCents} orderStatus={status} onReleasePayment={() => transition.mutate('completed')} />

      {/* ── Delivery ───────────────────────────────────── */}
      <DeliveryCard order={order} delivery={delivery.data?.delivery ?? null} loading={delivery.isLoading} />

      {/* ── Invoices ───────────────────────────────────── */}
      {(invoices.data?.invoices ?? []).length > 0 ? (
        <Section kicker="Documents" title="Invoices" icon={FileText} sub="Receipts and tax invoices issued for this order">
          <ListCard>
            {(invoices.data?.invoices ?? []).map((inv, i, arr) => (
              <ListRow
                key={inv.id}
                title={inv.number}
                subtitle={`${inv.type === 'tax_invoice' ? 'Tax invoice' : 'Receipt'} · ${formatDate(inv.issuedAt)}`}
                meta={formatLKR(inv.totalCents)}
                icon={FileText}
                last={i === arr.length - 1}
                onPress={() => go(`/buyer/order/${order.id}/invoice/${inv.id}`)}
              />
            ))}
          </ListCard>
        </Section>
      ) : null}

      {/* ── Payments ───────────────────────────────────── */}
      <PaymentCard order={order} payments={payments.data?.payments ?? []} loading={payments.isLoading} onChanged={() => payments.refetch()} />

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
            { label: 'Payment', value: order.paymentMethod === 'wire' ? 'Bank wire' : 'PayHere' },
          ]}
        />
        {order.rfqId ? (
          <Button title="View linked RFQ" iconRight={ArrowRight} variant="ghost" size="sm" onPress={() => go(`/buyer/rfqs/${order.rfqId}`)} />
        ) : null}
      </Section>

      {/* ── Buyer actions ──────────────────────────────── */}
      {allowed.length > 0 ? (
        <Section kicker="Actions" title="Update status" icon={Clock} sub="Allowed transitions for your role and this order's state">
          <Select
            value={to || allowed[0]}
            options={allowed.map((s) => ({ value: s, label: statusLabel(s) }))}
            onChange={setTo}
            title="Move to"
          />
          <Input value={reason} onChangeText={setReason} placeholder="Reason (optional) — e.g. driver arrived late" />
          <Button
            title="Apply status change"
            iconRight={ArrowRight}
            variant={to === 'cancelled' || to === 'disputed' ? 'danger' : 'primary'}
            loading={transition.isPending}
            onPress={() => transition.mutate(to || allowed[0])}
            full
          />
        </Section>
      ) : null}

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
              label: statusLabel(e.toStatus),
              hint: `${formatDateTime(e.createdAt)}${e.fromStatus ? ` · from ${statusLabel(e.fromStatus)}` : ''}${e.reason ? ` — “${e.reason}”` : ''}`,
              state: 'done' as const,
            }))}
          />
        )}
      </Section>

      {/* ── Messages ───────────────────────────────────── */}
      <MessagesCard orderId={order.id} userId={user?.userId} />

      <RefundSheet payment={refundFor} onClose={() => setRefundFor(null)} />
      <ReviewSheet orderId={order.id} visible={reviewOpen} onClose={() => setReviewOpen(false)} />
    </Screen>
  );
}

/* ------------------------------- payments ------------------------------- */

function PaymentCard({ order, payments, loading, onChanged }: { order: OrderDetail['order']; payments: Payment[]; loading: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  const confirmedTotal = payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amountCents, 0);
  const outstanding = order.totalCents - confirmedTotal;
  const canPay = outstanding > 0 && order.status !== 'cancelled' && order.status !== 'rejected';
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
          notes: lastFailed ? `Retry after ${lastFailed.status}` : 'Pay online via PayHere',
        });
        id = r.id;
      }
      const r = await api.post<{ redirectUrl: string; isMock: boolean }>(`/payments/${id}/checkout`);
      if (r.isMock) toast.info('Staging payment simulator', 'No real money will move.');
      await WebBrowser.openBrowserAsync(r.redirectUrl);
      onChanged();
    });
  }

  return (
    <Section kicker="Settlement" title={`Payment · ${formatLKR(order.totalCents)}`} icon={Banknote} sub={`${formatLKR(confirmedTotal)} confirmed`}>
      {payments.length === 0 && !loading ? (
        <Text variant="bodySm" color="ink4">
          No payments recorded yet.
        </Text>
      ) : (
        <View style={{ gap: 10 }}>
          {payments.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
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
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 12 }}>
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
            Outstanding {formatLKR(outstanding)} · online checkout opens PayHere in a browser; status updates from server confirmation.
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
          <View style={{ backgroundColor: colors.ink, borderRadius: radii.xl, padding: 14, gap: 8 }}>
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
              <View style={{ flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: colors.paperLine, paddingTop: 8 }}>
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
          <ListCard>
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
          </ListCard>
          <Banner tone="success" message={`Wire initiated ${formatDateTime(d.initiatedAt)}. Supplier notified — reconciliation within 1–2 business days.`} />
        </View>
      ) : null}
    </Section>
  );
}

/* ---------------------------- reconciliation ---------------------------- */

function ReconciliationCard({ orderId, poNumber, poTotalCents, orderStatus, onReleasePayment }: { orderId: string; poNumber: string; poTotalCents: number; orderStatus: string; onReleasePayment: () => void }) {
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
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.lineSoft }}>
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
            <Button title="Approve invoice & release escrow" icon={CheckCheck} onPress={onReleasePayment} full />
          ) : (
            <>
              <Button title="File discrepancy claim" icon={FileText} variant="copper" onPress={() => setClaimOpen((v) => !v)} full />
              {claimOpen ? (
                <View style={{ gap: 10, borderWidth: 1, borderColor: colors.amber, borderRadius: radii.xl, padding: 12, backgroundColor: colors.amberSoft }}>
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
    <View style={{ flex: 1, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.pearl, padding: 10, gap: 4 }}>
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

  const q = useQuery({
    queryKey: ['po-messages', orderId],
    queryFn: () => api.get<{ messages: PoMessage[] }>(`/purchase-orders/${orderId}/messages`),
    refetchInterval: 8000,
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
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Input value={body} onChangeText={setBody} placeholder="Type a message…" onSubmitEditing={() => body.trim() && send.mutate(body.trim())} returnKeyType="send" />
        </View>
        <IconButton icon={Send} accessibilityLabel="Send message" variant="ink" onPress={() => body.trim() && send.mutate(body.trim())} style={{ opacity: send.isPending || !body.trim() ? 0.4 : 1 }} />
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
