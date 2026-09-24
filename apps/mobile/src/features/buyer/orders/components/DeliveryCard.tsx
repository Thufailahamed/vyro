import { Linking, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Banknote, FileText, MapPin, Phone, Truck, UserRound } from 'lucide-react-native';
import { Button, IconTile, KeyValue, Skeleton, StatusBadge, Text, Timeline, type TimelineStep } from '@/ui';
import { PodPhoto } from '@/features/common/orderLifecycle';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { colors, radii, shadow } from '@/theme/tokens';
import { Section } from '../kit';
import type { Delivery, OrderDetail } from '../types';

const D_STEPS: { key: Delivery['status']; label: string }[] = [
  { key: 'pending', label: 'Awaiting dispatch' },
  { key: 'assigned', label: 'Driver assigned' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

function deliverySteps(d: Delivery): TimelineStep[] {
  const order = D_STEPS.map((s) => s.key);
  const at = d.status === 'failed' ? 0 : order.indexOf(d.status);
  const stamp: Partial<Record<Delivery['status'], number | null>> = {
    pending: d.createdAt,
    picked_up: d.pickedUpAt,
    delivered: d.deliveredAt,
    in_transit: d.status === 'in_transit' ? d.updatedAt : null,
    assigned: d.driverName ? d.updatedAt : null,
  };
  return D_STEPS.map((s, i) => ({
    label: s.label,
    hint: i <= at && stamp[s.key] ? formatDateTime(stamp[s.key]) : i === at + 1 && d.estimatedAt && s.key === 'delivered' ? `ETA ${formatDateTime(d.estimatedAt)}` : undefined,
    state: d.status === 'delivered' || i < at ? 'done' : i === at ? 'active' : 'idle',
  }));
}

export function useDelivery(poId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['delivery', poId],
    queryFn: () => api.get<{ delivery: Delivery | null }>(`/deliveries/${poId}`),
    enabled: !!poId && enabled,
    retry: false,
  });
}

const TILE = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 12,
  padding: 12,
  borderRadius: radii.xl,
  borderCurve: 'continuous' as const,
  backgroundColor: colors.pearl,
};

/** Logistics: receiving dock, settlement, notes and live delivery tracking. */
export function DeliveryCard({ order, delivery, loading }: { order: OrderDetail['order']; delivery: Delivery | null | undefined; loading: boolean }) {
  return (
    <Section step={2} kicker="Logistics" title="Delivery & tracking" sub="Receiving dock, driver and transit milestones">
      <View style={{ gap: 10 }}>
        <View style={TILE}>
          <IconTile icon={MapPin} tone="ink" size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="overline" color="ink5">
              Receiving dock
            </Text>
            <Text variant="bodySm" weight="semibold">
              {order.deliveryAddress}
            </Text>
            <Text variant="caption" color="ink4">
              {order.deliveryCity}, {order.deliveryDistrict}
            </Text>
          </View>
        </View>
        <View style={TILE}>
          <IconTile icon={Banknote} tone="copper" size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="overline" color="ink5">
              Settlement
            </Text>
            <Text variant="bodySm" weight="semibold">
              VYRO escrow · {order.paymentMethod === 'wire' ? 'bank wire' : 'payments.lk / bank transfer'}
            </Text>
            <Text variant="caption" color="ink4">
              Funds release on goods receipt or order completion
            </Text>
          </View>
        </View>
        {order.notes ? (
          <View style={[TILE, { backgroundColor: colors.copperSoft }]}>
            <IconTile icon={FileText} tone="paper" size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="overline" color="ink5">
                Delivery notes
              </Text>
              <Text variant="bodySm" color="ink3">
                {order.notes}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {loading ? (
        <Skeleton height={120} radius={radii.xl} />
      ) : delivery ? (
        <View style={{ gap: 14, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconTile icon={Truck} tone="paper" size={34} />
              <Text variant="h3">Shipment</Text>
            </View>
            <StatusBadge status={delivery.status} size="sm" />
          </View>
          {delivery.driverName || delivery.driverPhone ? (
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.ink }, shadow.ink]}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(198,220,74,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <UserRound size={17} color={colors.volt} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="overline" color="paperFaint">
                  Driver
                </Text>
                <Text variant="body" weight="semibold" color="paper">
                  {delivery.driverName ?? 'Assigned driver'}
                </Text>
              </View>
              {delivery.driverPhone ? (
                <Button title="Call" icon={Phone} variant="volt" size="sm" onPress={() => Linking.openURL(`tel:${delivery.driverPhone}`)} />
              ) : null}
            </View>
          ) : null}
          {delivery.carrier || delivery.trackingNumber ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 2, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
              {delivery.carrier ? <KeyValue label="Carrier" value={delivery.carrier} last={!delivery.trackingNumber} /> : null}
              {delivery.trackingNumber ? <KeyValue label="Tracking number" value={delivery.trackingNumber} mono last /> : null}
              {delivery.trackingUrl ? (
                <Button title="Track shipment" variant="ghost" size="sm" onPress={() => Linking.openURL(delivery.trackingUrl!)} />
              ) : null}
            </View>
          ) : null}
          {delivery.recipientName || delivery.podNote || delivery.hasPodPhoto ? (
            <View style={{ gap: 10, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.mintSoft }}>
              <Text variant="overline" color="ink5">
                Proof of delivery{delivery.podCapturedAt ? ` · ${formatDateTime(delivery.podCapturedAt)}` : ''}
              </Text>
              {delivery.recipientName ? (
                <Text variant="bodySm" weight="semibold">
                  Received by {delivery.recipientName}
                </Text>
              ) : null}
              {delivery.podNote ? (
                <Text variant="bodySm" color="ink3">
                  {delivery.podNote}
                </Text>
              ) : null}
              {delivery.hasPodPhoto ? <PodPhoto poId={delivery.purchaseOrderId ?? order.id} /> : null}
            </View>
          ) : null}
          {delivery.status === 'failed' ? (
            <Text variant="bodySm" color="rose">
              {delivery.failedReason ? `Delivery attempt failed: ${delivery.failedReason}. ` : 'Delivery attempt failed — '}the supplier will reschedule. Message them below.
            </Text>
          ) : (
            <Timeline steps={deliverySteps(delivery)} />
          )}
        </View>
      ) : null}
    </Section>
  );
}
