import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Banknote, Boxes, Check, FileDown, History, MapPin, Package, Route } from 'lucide-react-native';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatLKR, humanize } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  IconTile,
  InkHero,
  KeyValue,
  Kicker,
  Screen,
  SkeletonList,
  StatusBadge,
  Text,
  Timeline,
} from '@/ui';
import { destination } from '@/features/supplier/ops/api';
import { OrderActions } from '@/features/supplier/ops/OrderActions';
import { TrackingSection } from '@/features/supplier/ops/DeliverySheets';
import { OrderReturnsSection } from '@/features/supplier/ops/SupplierReturns';
import { PaymentBadge, PaymentSummaryRows } from '@/features/common/orderLifecycle';
import { deliveryEventStatus, requestedQty } from '@/lib/orderLifecycle';
import { Enter, Section, shareApiFile } from '@/features/supplier/ops/kit';
import { usePoDetail } from './api';
import { SellerPayments } from '@/features/common/bankTransfer';

const STAGES = ['Placed', 'Accepted', 'On the way', 'Delivered'];
const TERMINAL = ['delivered', 'completed', 'received', 'cancelled', 'rejected', 'failed', 'disputed'];

function stageOf(status: string) {
  if (['delivered', 'completed', 'received'].includes(status)) return 3;
  if (['out_for_delivery', 'dispatched', 'shipped'].includes(status)) return 2;
  if (['accepted', 'preparing', 'ready_for_pickup'].includes(status)) return 1;
  return 0;
}

const STAGE_HINT = [
  'Waiting for you to accept this order',
  'Accepted — prepare and dispatch it',
  'On its way to the buyer',
  'Delivered to the buyer',
];

/** Four-stage progress track for the ink hero: dots and labels share columns so they always line up. */
function StageTrack({ status }: { status: string }) {
  const stopped = ['cancelled', 'rejected', 'failed', 'disputed'].includes(status);
  const at = stageOf(status);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        {STAGES.map((l, i) => {
          const done = !stopped && i <= at;
          const current = !stopped && i === at;
          return (
            <View key={l} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : !stopped && i <= at ? colors.volt : 'rgba(250,247,240,0.14)' }} />
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done ? colors.volt : 'rgba(250,247,240,0.08)',
                    borderWidth: current ? 4 : 0,
                    borderColor: 'rgba(198,220,74,0.28)',
                  }}
                >
                  {done && !current ? <Check size={12} color={colors.ink} strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1, height: 2, backgroundColor: i === STAGES.length - 1 ? 'transparent' : !stopped && i < at ? colors.volt : 'rgba(250,247,240,0.14)' }} />
              </View>
              <Text variant="caption" color={done ? 'paper' : 'paperFaint'} weight={current ? 'semibold' : 'regular'} style={{ fontSize: 11 }} numberOfLines={1}>
                {l}
              </Text>
            </View>
          );
        })}
      </View>
      {!stopped ? (
        <Text variant="caption" color="paperMuted" style={{ textAlign: 'center' }}>
          {STAGE_HINT[at]}
        </Text>
      ) : null}
    </View>
  );
}

/** Small glass stat inside the ink hero. */
function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: 'rgba(250,247,240,0.07)' }}>
      <Text variant="overline" color="paperFaint" style={{ fontSize: 9.5 }}>
        {label}
      </Text>
      <Text variant="bodySm" weight="semibold" color="paper" numberOfLines={1} tabular>
        {value}
      </Text>
    </View>
  );
}

export function SupplierOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = usePoDetail(typeof id === 'string' ? id : undefined);

  const refresh = () => q.refetch();

  if (q.isLoading)
    return (
      <Screen back kicker="Operations" title="Order">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Operations" title="Order" onRefresh={refresh}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );
  const d = q.data;
  if (!d)
    return (
      <Screen back kicker="Operations" title="Order">
        <EmptyState icon={Package} title="Order not found" message="This purchase order may have been removed." />
      </Screen>
    );

  const o = d.order;
  const units = d.items.reduce((s, it) => s + (it.quantity ?? 0), 0);
  const lc = d.lifecycle;
  const trackable = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status);
  const partial = o.originalTotalCents != null && o.originalTotalCents !== o.totalCents;
  const live = !TERMINAL.includes(o.status);
  const shareInvoice = () => shareApiFile(`/purchase-orders/${o.id}/invoice`, `${o.poNumber ?? o.id}.pdf`, 'application/pdf').catch(() => {});

  return (
    <Screen
      back
      onRefresh={refresh}
      kicker="Operations"
      title={o.poNumber || 'Order'}
      subtitle={`${destination(o)} · ${formatDateTime(o.createdAt)}`}
      right={live ? <IconButton icon={FileDown} variant="surface" size={44} accessibilityLabel="Share invoice PDF" onPress={shareInvoice} /> : undefined}
      footer={
        live ? (
          <OrderActions
            poId={o.id}
            poNumber={o.poNumber}
            status={o.status}
            size="md"
            full
            detail={{ items: d.items, totalCents: o.totalCents, lifecycle: lc, paymentSummary: d.paymentSummary, delivery: d.delivery }}
          />
        ) : (
          <Button title="Share invoice PDF" icon={FileDown} variant="secondary" size="md" full onPress={shareInvoice} />
        )
      }
    >
      <Enter>
        <InkHero seed={`po-${o.id}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile icon={Package} tone="glass" size={42} />
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
              <PaymentBadge summary={d.paymentSummary} />
              <StatusBadge status={o.status} />
            </View>
          </View>
          <View style={{ marginTop: 18, gap: 6 }}>
            <Kicker color="volt">Order value</Kicker>
            <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(o.totalCents)}
            </Text>
            {partial ? (
              <Text variant="caption" color="paperFaint" style={{ textDecorationLine: 'line-through' }}>
                {formatLKR(o.originalTotalCents)}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <HeroStat label="LINES" value={String(d.items.length)} />
            <HeroStat label="UNITS" value={String(units)} />
            <HeroStat label="DUE" value={o.deliveryPromisedAt ? formatDate(o.deliveryPromisedAt) : 'Not set'} />
          </View>
          <View style={{ marginTop: 20 }}>
            <StageTrack status={o.status} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: 'rgba(250,247,240,0.07)' }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(198,220,74,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={15} color={colors.volt} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="bodySm" weight="semibold" color="paper" numberOfLines={2}>
                {o.deliveryAddress ?? destination(o)}
              </Text>
              <Text variant="caption" color="paperFaint" numberOfLines={1}>
                {destination(o)}
                {o.deliveryPromisedAt ? ` · Due ${formatDate(o.deliveryPromisedAt)}` : ''}
              </Text>
            </View>
          </View>
        </InkHero>
      </Enter>

      {partial || o.rejectionReason || o.cancelledReason || o.disputeReason ? (
        <Enter i={1}>
          <View style={{ gap: 10 }}>
            {partial ? (
              <Banner tone="warning" title="Partially fulfilled" message={`Reduced from ${formatLKR(o.originalTotalCents)} to ${formatLKR(o.totalCents)}. Any paid difference was refunded to the buyer.`} />
            ) : null}
            {o.rejectionReason ? <Banner tone="danger" title="Rejected" message={o.rejectionReason} /> : null}
            {o.cancelledReason ? <Banner tone="warning" title={o.cancelledByRole ? `Cancelled by ${humanize(o.cancelledByRole)}` : 'Cancelled'} message={o.cancelledReason} /> : null}
            {o.disputeReason ? <Banner tone="danger" title={`Disputed${o.disputeOpenedBy ? ` by ${humanize(o.disputeOpenedBy)}` : ''}`} message={o.disputeReason} /> : null}
          </View>
        </Enter>
      ) : null}

      <Enter i={1}>
        <Section icon={Banknote} kicker="Settlement" title="Payment" right={d.paymentSummary ? <PaymentBadge summary={d.paymentSummary} /> : undefined}>
          <View style={{ marginTop: -8, gap: 12 }}>
            {d.paymentSummary ? <PaymentSummaryRows summary={d.paymentSummary} /> : null}
            <SellerPayments poId={o.id} totalCents={o.totalCents} orderStatus={o.status} onChanged={refresh} />
          </View>
        </Section>
      </Enter>

      <Enter i={1}>
        <Section icon={Route} kicker="Summary" title="Order details">
          <View style={{ marginTop: -8 }}>
            <KeyValue label="Purchase order" value={o.poNumber ?? o.id.slice(0, 12)} mono />
            <KeyValue label="Placed" value={formatDateTime(o.createdAt)} />
            {o.deliveryPromisedAt ? <KeyValue label="Delivery due" value={formatDate(o.deliveryPromisedAt)} /> : null}
            <KeyValue label="Buyer notes" value={o.notes ?? '—'} last />
          </View>
        </Section>
      </Enter>

      <Enter i={2}>
        <Section icon={Boxes} kicker="Line items" title="Items" sub={`${d.items.length} ${d.items.length === 1 ? 'product' : 'products'}`}>
          {d.items.length === 0 ? (
            <EmptyState compact title="No line items" message="The buyer order has no items." />
          ) : (
            <View style={{ marginTop: -6 }}>
              {d.items.map((it, i) => {
                const unit = it.unitPriceCents ?? it.unitPriceCentsSnapshot ?? 0;
                const total = it.totalCents ?? it.lineTotalCents ?? unit * it.quantity;
                return (
                  <View
                    key={it.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      borderBottomWidth: i === d.items.length - 1 ? 0 : StyleSheet.hairlineWidth * 2,
                      borderBottomColor: colors.lineSoft,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="mono" style={{ fontSize: 11.5 }}>
                        ×{it.quantity}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text variant="bodySm" weight="semibold" numberOfLines={2}>
                        {it.productName ?? it.productNameSnapshot ?? 'Item'}
                      </Text>
                      {unit ? (
                        <Text variant="caption" color="ink4">
                          {formatLKR(unit)} {it.unit ? `/ ${it.unit}` : 'each'}
                        </Text>
                      ) : null}
                      {requestedQty(it) !== it.quantity || it.fulfilmentStatus === 'unavailable' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text variant="caption" color="ink4">
                            Ordered {requestedQty(it)} → accepted {it.quantity}
                          </Text>
                          {it.fulfilmentStatus === 'unavailable' || it.fulfilmentStatus === 'reduced' ? (
                            <Badge label={humanize(it.fulfilmentStatus)} tone={it.fulfilmentStatus === 'unavailable' ? 'danger' : 'warning'} size="sm" />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    <Text variant="mono" style={{ fontFamily: fonts.monoMedium }}>
                      {formatLKR(total)}
                    </Text>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, padding: 14, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
                <Text variant="bodySm" weight="semibold" color="ink3">
                  Order total
                </Text>
                <Text variant="h3" tabular>
                  {formatLKR(o.totalCents)}
                </Text>
              </View>
            </View>
          )}
        </Section>
      </Enter>

      <Enter i={3}>
        <TrackingSection poId={o.id} delivery={d.delivery} editable={trackable} />
      </Enter>

      {d.returns?.length ? (
        <Enter i={3}>
          <OrderReturnsSection returns={d.returns} />
        </Enter>
      ) : null}

      {d.events.length ? (
        <Enter i={4}>
          <Section icon={History} kicker="Audit trail" title="History">
            <Timeline
              steps={d.events.map((e, i) => {
                const dlv = deliveryEventStatus(e.metadata);
                return {
                  label: dlv ? `Delivery · ${humanize(dlv)}` : humanize(e.toStatus),
                  hint: `${formatDateTime(e.createdAt)}${!dlv && e.reason ? ` · “${e.reason}”` : ''}`,
                  state: i === d.events.length - 1 ? 'active' : 'done',
                };
              })}
            />
          </Section>
        </Enter>
      ) : null}
    </Screen>
  );
}
