import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Package } from 'lucide-react-native';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatLKR, humanize } from '@/lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  KeyValue,
  Screen,
  SkeletonList,
  StatusBadge,
  Text,
  Timeline,
} from '@/ui';
import { LIFECYCLE, destination } from '@/features/supplier/ops/api';
import { OrderActions } from '@/features/supplier/ops/OrderActions';
import { shareApiFile } from '@/features/supplier/ops/kit';
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

  return (
    <Screen
      back
      onRefresh={refresh}
      kicker="Operations"
      title={o.poNumber || 'Order'}
      subtitle={`${destination(o)} · ${formatDateTime(o.createdAt)}`}
    >
      <StatusBadge status={o.status} />
      <Card kind="flat">
        <KeyValue label="Total" value={formatLKR(o.totalCents)} mono emphasize last={false} />
        <KeyValue label="Delivery" value={o.deliveryAddress ?? destination(o)} />
        <KeyValue label="Notes" value={o.notes ?? '—'} last />
      </Card>

      <Card kind="flat" style={{ gap: 4 }}>
        <Text variant="h2">Items</Text>
        {d.items.length === 0 ? (
          <EmptyState compact title="No line items" message="The buyer order has no items." />
        ) : (
          d.items.map((it) => (
            <KeyValue
              key={it.id}
              label={`${it.productName ?? it.productNameSnapshot ?? 'Item'} × ${it.quantity}`}
              value={formatLKR(it.totalCents ?? it.lineTotalCents ?? (it.unitPriceCents ?? it.unitPriceCentsSnapshot ?? 0) * it.quantity)}
              mono
            />
          ))
        )}
      </Card>

      <Card kind="flat" style={{ gap: 12 }}>
        <Text variant="h2">Lifecycle</Text>
        <Timeline steps={steps} />
      </Card>

      {d.events.length ? (
        <Card kind="flat">
          <Text variant="h2">History</Text>
          {d.events.map((e) => (
            <KeyValue key={e.id} label={humanize(e.toStatus)} value={formatDateTime(e.createdAt)} mono />
          ))}
        </Card>
      ) : null}

      <OrderActions poId={o.id} poNumber={o.poNumber} status={o.status} size="md" full />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          title="Share invoice PDF"
          variant="secondary"
          size="sm"
          style={{ flex: 1 }}
          onPress={() => shareApiFile(`/purchase-orders/${o.id}/invoice`, `${o.poNumber ?? o.id}.pdf`, 'application/pdf').catch(() => {})}
        />
      </View>
    </Screen>
  );
}
