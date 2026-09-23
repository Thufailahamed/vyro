import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, formatLKR, humanize, timeAgo } from '@/lib/format';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Field,
  KeyValue,
  Screen,
  SearchBar,
  Select,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { AdminHeaderActions, ReasonSheet } from '@/features/admin/ops/kit';
import { Appear, go } from '@/features/admin/platform/kit';
import { useDebounced } from '@/features/admin/ops/kit/hooks';

interface AdminDelivery {
  id: string;
  purchaseOrderId: string;
  status: string;
  driverName?: string | null;
  driverPhone?: string | null;
  poNumber?: string | null;
  orderStatus?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  totalCents?: number | null;
  businessName?: string | null;
  supplierName?: string | null;
  estimatedAt?: number | null;
  createdAt?: number;
}

const STATUSES = ['all', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'] as const;

/** Mirrors web DeliveriesPage (GET /admin/deliveries). */
export function DeliveriesScreen() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);
  const toast = useToast();
  const qc = useQueryClient();
  const [target, setTarget] = useState<AdminDelivery | null>(null);
  const [lost, setLost] = useState<AdminDelivery | null>(null);
  const [nextStatus, setNextStatus] = useState('in_transit');

  const q = useQuery({
    queryKey: ['admin-deliveries', status, debounced],
    queryFn: () =>
      api.get<{ deliveries: AdminDelivery[] }>(
        '/admin/deliveries' + qs({ status: status === 'all' ? undefined : status, q: debounced || undefined, limit: 100 }),
      ),
  });
  const rows = q.data?.deliveries ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-deliveries'] });
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
  };

  return (
    <Screen
      back
      kicker="Operations"
      title="Deliveries"
      subtitle="Dispatch, tracking and proof of delivery."
      right={<AdminHeaderActions />}
      onRefresh={() => q.refetch()}
    >
      <SearchBar value={search} onChangeText={setSearch} placeholder="PO#, driver, city…" />
      <ChipRow
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({ value: s, label: s === 'all' ? 'All' : humanize(s) }))}
      />
      {q.isLoading ? (
        <SkeletonList rows={5} height={120} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Truck} title="No deliveries" message="Nothing matches this filter." />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((d, i) => (
            <Appear key={d.id} i={i % 10}>
              <Card kind="flat" padding={14} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="mono" style={{ flex: 1 }} numberOfLines={1}>
                    {d.poNumber ?? d.purchaseOrderId.slice(0, 10)}
                  </Text>
                  <StatusBadge status={d.status} size="sm" />
                </View>
                <Text variant="bodySm" color="ink3" numberOfLines={1}>
                  {d.businessName ?? 'Buyer'} → {d.supplierName ?? 'Supplier'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="caption" color="ink4" style={{ flex: 1 }} numberOfLines={1}>
                    {[d.deliveryCity, d.deliveryDistrict].filter(Boolean).join(', ') || 'No destination'}
                    {d.driverName ? ` · ${d.driverName}` : ''}
                    {d.createdAt ? ` · ${timeAgo(d.createdAt)}` : ''}
                  </Text>
                  {d.totalCents != null ? <Text variant="mono">{formatLKR(d.totalCents)}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Order" size="sm" variant="ghost" onPress={() => go(`/admin/order/${d.purchaseOrderId}`)} />
                  <View style={{ flex: 1 }} />
                  <Button title="Advance" size="sm" variant="secondary" onPress={() => { setTarget(d); setNextStatus('in_transit'); }} />
                  <Button title="Lost" size="sm" variant="danger" onPress={() => setLost(d)} />
                </View>
              </Card>
            </Appear>
          ))}
        </View>
      )}

      <Sheet
        visible={!!target}
        onClose={() => setTarget(null)}
        title="Advance delivery"
        subtitle={target ? `${target.poNumber ?? target.id.slice(0, 8)} · currently ${humanize(target.status)}` : undefined}
        footer={
          <Button
            title="Update status"
            full
            size="lg"
            onPress={() => {
              if (!target) return;
              api
                .post(`/admin/deliveries/${target.id}/update-status`, { status: nextStatus })
                .then(() => {
                  toast.success('Delivery updated', `Now ${humanize(nextStatus)}.`);
                  setTarget(null);
                  invalidate();
                })
                .catch((e: unknown) => toast.error('Update failed', errorMessage(e)));
            }}
          />
        }
      >
        <Field label="New status">
          <Select
            value={nextStatus}
            onChange={setNextStatus}
            title="Delivery status"
            options={['assigned', 'picked_up', 'in_transit', 'delivered', 'failed'].map((s) => ({ value: s, label: humanize(s) }))}
          />
        </Field>
        {target?.estimatedAt ? <KeyValue label="ETA" value={formatDateTime(target.estimatedAt)} last /> : null}
      </Sheet>

      <ReasonSheet
        visible={!!lost}
        onClose={() => setLost(null)}
        onConfirm={(reason) => {
          if (!lost) return;
          api
            .post(`/admin/deliveries/${lost.id}/mark-lost`, { reason })
            .then(() => {
              toast.success('Marked lost', 'The order is flagged for claims.');
              setLost(null);
              invalidate();
            })
            .catch((e: unknown) => toast.error('Action failed', errorMessage(e)));
        }}
        title="Mark delivery lost?"
        message="Flags the consignment for claims and notifies both parties."
        confirmLabel="Mark lost"
        minLength={5}
      />
    </Screen>
  );
}
