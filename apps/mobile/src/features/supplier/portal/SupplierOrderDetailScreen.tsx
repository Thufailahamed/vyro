import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Banknote, Boxes, FileDown, History, MapPin, Package, Route } from 'lucide-react-native';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatLKR, humanize } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  ErrorState,
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
import { LIFECYCLE, destination } from '@/features/supplier/ops/api';
import { OrderActions } from '@/features/supplier/ops/OrderActions';
import { TrackingSection } from '@/features/supplier/ops/DeliverySheets';
import { OrderReturnsSection } from '@/features/supplier/ops/SupplierReturns';
import { PaymentBadge, PaymentSummaryRows } from '@/features/common/orderLifecycle';
import { deliveryEventStatus, requestedQty } from '@/lib/orderLifecycle';
import { Enter, Section, shareApiFile } from '@/features/supplier/ops/kit';
import { usePoDetail } from './api';

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
  const idx = LIFECYCLE.indexOf(o.status as (typeof LIFECYCLE)[number]);
  const steps = LIFECYCLE.map((s, i) => ({
    label: humanize(s),
    state: (idx < 0 ? 'idle' : i < idx ? 'done' : i === idx ? 'active' : 'idle') as 'done' | 'active' | 'idle',
  }));
  const units = d.items.reduce((s, it) => s + (it.quantity ?? 0), 0);
  const lc = d.lifecycle;
  const trackable = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status);
  const partial = o.originalTotalCents != null && o.originalTotalCents !== o.totalCents;

  return (
    <Screen
      back
      onRefresh={refresh}
      kicker="Operations"
      title={o.poNumber || 'Order'}
      subtitle={`${destination(o)} · ${formatDateTime(o.createdAt)}`}
      footer={
        <>
          <OrderActions
            poId={o.id}
            poNumber={o.poNumber}
            status={o.status}
            size="md"
            full
            detail={{ items: d.items, totalCents: o.totalCents, lifecycle: lc, paymentSummary: d.paymentSummary, delivery: d.delivery }}
          />
          <Button
            title="Share invoice PDF"
            icon={FileDown}
            variant="secondary"
            size="md"
            full
            onPress={() => shareApiFile(`/purchase-orders/${o.id}/invoice`, `${o.poNumber ?? o.id}.pdf`, 'application/pdf').catch(() => {})}
          />
        </>
      }
    >
      <Enter>
        <InkHero seed={`po-${o.id}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <IconTile icon={Package} tone="glass" size={42} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <PaymentBadge summary={d.paymentSummary} />
              <StatusBadge status={o.status} />
            </View>
          </View>
          <View style={{ marginTop: 20, gap: 6 }}>
            <Kicker color="volt">Order value</Kicker>
            <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(o.totalCents)}
            </Text>
            <Text variant="caption" color="paperMuted">
              {d.items.length} {d.items.length === 1 ? 'line' : 'lines'} · {units} units
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: 'rgba(250,247,240,0.07)' }}>
            <MapPin size={15} color={colors.volt} strokeWidth={1.9} />
            <Text variant="bodySm" color="paper" numberOfLines={2} style={{ flex: 1 }}>
              {o.deliveryAddress ?? destination(o)}
            </Text>
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

      {d.paymentSummary ? (
        <Enter i={1}>
          <Section icon={Banknote} kicker="Settlement" title="Payment" right={<PaymentBadge summary={d.paymentSummary} />}>
            <View style={{ marginTop: -8 }}>
              <PaymentSummaryRows summary={d.paymentSummary} />
            </View>
          </Section>
        </Enter>
      ) : null}

      <Enter i={1}>
        <Section icon={Route} kicker="Summary" title="Order details">
          <View style={{ marginTop: -8 }}>
            <KeyValue label="Total" value={formatLKR(o.totalCents)} mono emphasize last={false} />
            <KeyValue label="Delivery" value={o.deliveryAddress ?? destination(o)} />
            <KeyValue label="Placed" value={formatDateTime(o.createdAt)} />
            <KeyValue label="Notes" value={o.notes ?? '—'} last />
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

      <Enter i={3}>
        <Section icon={Route} kicker="Fulfilment" title="Lifecycle">
          <Timeline steps={steps} />
        </Section>
      </Enter>

      {d.events.length ? (
        <Enter i={4}>
          <Section icon={History} kicker="Audit trail" title="History">
            <View style={{ marginTop: -8 }}>
              {d.events.map((e, i) => {
                const dlv = deliveryEventStatus(e.metadata);
                return (
                  <KeyValue
                    key={e.id}
                    label={dlv ? `Delivery · ${humanize(dlv)}` : `${humanize(e.toStatus)}${e.reason ? ` — “${e.reason}”` : ''}`}
                    value={formatDateTime(e.createdAt)}
                    mono
                    last={i === d.events.length - 1}
                  />
                );
              })}
            </View>
          </Section>
        </Enter>
      ) : null}
    </Screen>
  );
}
