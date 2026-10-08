import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, Download, Globe2, MapPin, Package, SlidersHorizontal, X } from 'lucide-react-native';
import {
  Avatar,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  IconButton,
  IconTile,
  InkHero,
  ListHeader,
  ListScreen,
  RadioCards,
  SearchBar,
  Segmented,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import { colors, radii, shadow } from '@/theme/tokens';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDate, formatLKR, humanize, timeAgo } from '@/lib/format';

import { AdminTabHeader, HeroPipeline, Pill, Reveal, shareCsv, useDebounced } from '../kit';
import { ORDER_STATUS_TABS, useAdminOrders, type AdminOrder, type OrderDirection } from './api';

type SortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';
const SORTS: { value: SortOption; label: string; description: string }[] = [
  { value: 'newest', label: 'Newest first', description: 'Most recently placed on top' },
  { value: 'oldest', label: 'Oldest first', description: 'Longest-running orders on top' },
  { value: 'amount-high', label: 'Highest amount', description: 'Largest purchase orders first' },
  { value: 'amount-low', label: 'Lowest amount', description: 'Smallest purchase orders first' },
];

const DIRECTIONS: { value: 'all' | OrderDirection; label: string }[] = [
  { value: 'all', label: 'All routes' },
  { value: 'domestic', label: 'Domestic' },
  { value: 'export', label: 'Export' },
  { value: 'import', label: 'Import' },
];

const FULFILMENT = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'];

export function AdminOrdersScreen() {
  const toast = useToast();
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const [direction, setDirection] = useState<'all' | OrderDirection>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [sortOpen, setSortOpen] = useState(false);

  const dir = direction === 'all' ? undefined : direction;
  const list = useAdminOrders({ status, q, direction: dir, limit: 100 });
  // Unfiltered-by-status query powers chip counts + hero metrics.
  const scope = useAdminOrders({ status: 'all', q, direction: dir, limit: 100 });

  const orders = useMemo(() => {
    const l = [...(list.data?.orders ?? [])];
    l.sort((a, b) => {
      if (sort === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (sort === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      if (sort === 'amount-high') return (b.totalCents ?? 0) - (a.totalCents ?? 0);
      return (a.totalCents ?? 0) - (b.totalCents ?? 0);
    });
    return l;
  }, [list.data, sort]);

  const metrics = useMemo(() => {
    const all = scope.data?.orders ?? [];
    const counts: Record<string, number> = { all: all.length };
    let total = 0;
    let fulfil = 0;
    let delivered = 0;
    let holds = 0;
    for (const o of all) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
      total += o.totalCents ?? 0;
      if (FULFILMENT.includes(o.status)) fulfil++;
      if (o.status === 'delivered' || o.status === 'completed') delivered++;
      if (['disputed', 'cancelled', 'rejected'].includes(o.status)) holds++;
    }
    return { counts, total, fulfil, delivered, holds, pending: counts.pending ?? 0 };
  }, [scope.data]);

  const filteredValue = useMemo(() => orders.reduce((s, o) => s + (o.totalCents ?? 0), 0), [orders]);

  const exportCsv = async () => {
    if (!orders.length) return;
    try {
      await shareCsv(
        `vyro_orders_${Date.now()}.csv`,
        ['PO Number', 'Date', 'Status', 'Buyer', 'Supplier', 'Destination City', 'Amount (LKR)'],
        orders.map((o) => [o.poNumber ?? o.id, formatDate(o.createdAt), o.status, o.businessName ?? 'Unknown', o.supplierName ?? 'Unknown', o.deliveryCity ?? '', (o.totalCents ?? 0) / 100]),
      );
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    }
  };

  const filtersActive = status !== 'all' || !!search || direction !== 'all';

  const header = (
    <ListHeader>
      <AdminTabHeader
        kicker="Operations · Fulfilment"
        title="Orders"
        extra={<IconButton icon={Download} accessibilityLabel="Export CSV" variant="surface" onPress={exportCsv} />}
      />
      <Gutter>
        <InkHero seed="admin-orders" style={{ padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <IconTile icon={Package} tone="glass" size={30} />
              <Text variant="overline" color="paperMuted">
                Gross volume{dir ? ` · ${humanize(dir)}` : ''}
              </Text>
            </View>
            <Pill label={`${metrics.counts.all ?? 0} tracked`} tone="ink" />
          </View>
          <Text style={{ fontFamily: 'Display-Black', fontSize: 40, lineHeight: 46, letterSpacing: -1.6, color: colors.paper, marginTop: 16 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatCompactLKR(metrics.total)}
          </Text>
          <Text variant="bodySm" color="paperMuted" style={{ marginTop: 2 }}>
            Purchase orders across every tenant
          </Text>
          <HeroPipeline
            segments={[
              { label: 'Pending', value: metrics.pending, color: colors.volt },
              { label: 'In flight', value: metrics.fulfil, color: colors.copper },
              { label: 'Delivered', value: metrics.delivered, color: colors.mint },
              { label: 'Holds', value: metrics.holds, color: colors.rose },
            ]}
          />
        </InkHero>
      </Gutter>
      <Gutter style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="PO#, buyer, supplier, city…" />
        </View>
        <Touchable
          onPress={() => setSortOpen(true)}
          hapticOnPress
          scaleTo={0.94}
          accessibilityLabel="Sort and filter"
          style={[{ width: 48, height: 48, borderRadius: 16, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: direction !== 'all' || sort !== 'newest' ? colors.ink : colors.paper }, shadow.sm]}
        >
          <SlidersHorizontal size={19} color={direction !== 'all' || sort !== 'newest' ? colors.volt : colors.ink} strokeWidth={1.9} />
        </Touchable>
      </Gutter>
      <ChipRow
        style={{ paddingHorizontal: 20 }}
        options={ORDER_STATUS_TABS.map((t) => ({ value: t.id as string, label: t.label, count: scope.data ? (metrics.counts[t.id] ?? 0) : undefined }))}
        value={status}
        onChange={setStatus}
      />
      <Gutter>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="caption" weight="semibold" color="ink4" style={{ flex: 1 }}>
            {list.isLoading ? 'Loading…' : `${orders.length} ${orders.length === 1 ? 'order' : 'orders'} · ${formatCompactLKR(filteredValue)}`}
          </Text>
          {direction !== 'all' ? (
            <Touchable onPress={() => setDirection('all')} hapticOnPress style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingLeft: 10, paddingRight: 7, borderRadius: radii.pill, backgroundColor: colors.copperSoft }}>
              <Text variant="caption" weight="semibold" color="copperDeep">
                {humanize(direction)}
              </Text>
              <X size={12} color={colors.copperDeep} strokeWidth={2.4} />
            </Touchable>
          ) : null}
          <Touchable onPress={() => setSortOpen(true)} hapticOnPress style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: colors.mist }}>
            <ArrowDown size={12} color={colors.ink3} strokeWidth={2.2} />
            <Text variant="caption" weight="semibold" color="ink3">
              {SORTS.find((x) => x.value === sort)!.label}
            </Text>
          </Touchable>
        </View>
      </Gutter>
    </ListHeader>
  );

  return (
    <>
      <ListScreen
        tabBar
        header={header}
        data={list.isLoading || list.isError ? [] : orders}
        keyExtractor={(o) => o.id}
        onRefresh={() => Promise.all([list.refetch(), scope.refetch()])}
        renderItem={({ item, index }) => (
          <Reveal index={index}>
            <OrderCard order={item} />
          </Reveal>
        )}
        ListEmptyComponent={
          list.isLoading ? (
            <SkeletonList rows={6} height={112} />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState
              icon={Package}
              title="No orders found"
              message={filtersActive ? 'Nothing matches these filters.' : 'No purchase orders are registered yet.'}
              action={
                filtersActive
                  ? {
                      label: 'Reset filters',
                      onPress: () => {
                        setStatus('all');
                        setSearch('');
                        setDirection('all');
                      },
                    }
                  : undefined
              }
            />
          )
        }
      />
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort & filter" subtitle="Narrow the registry by trade route and order.">
        <Text variant="overline" color="ink4" style={{ marginBottom: 8, marginLeft: 4 }}>
          Trade route
        </Text>
        <Segmented options={DIRECTIONS.map((d) => ({ value: d.value, label: d.value === 'all' ? 'All' : d.label }))} value={direction} onChange={setDirection} style={{ marginBottom: 20 }} />
        <Text variant="overline" color="ink4" style={{ marginBottom: 8, marginLeft: 4 }}>
          Sort by
        </Text>
        <RadioCards
          options={SORTS}
          value={sort}
          onChange={(v) => {
            setSort(v);
            setSortOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

export function OrderCard({ order: o, compact }: { order: AdminOrder; compact?: boolean }) {
  const cross = o.direction && o.direction !== 'domestic';
  return (
    <Card onPress={() => router.push(`/admin/order/${o.id}` as never)} padding={0}>
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="mono" style={{ fontFamily: 'Sans-Semi', fontSize: 12, color: colors.ink3, letterSpacing: 0.2 }} numberOfLines={1}>
            {o.poNumber ?? `#${o.id.slice(0, 8)}`}
          </Text>
          {cross ? <Pill label={`${o.direction}${o.incoterms ? ` · ${o.incoterms}` : ''}`.toUpperCase()} tone={o.direction === 'export' ? 'volt' : 'copper'} icon={Globe2} /> : null}
          <View style={{ flex: 1 }} />
          <StatusBadge status={o.status} size="sm" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44 }}>
            <Avatar name={o.businessName ?? 'Buyer'} size={36} tone="ink" />
            <View style={{ position: 'absolute', right: 0, bottom: 0, borderRadius: 14, borderWidth: 2, borderColor: colors.paper }}>
              <Avatar name={o.supplierName ?? 'Supplier'} size={24} tone="copper" />
            </View>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3" numberOfLines={1}>
              {o.businessName ?? 'Direct buyer'}
            </Text>
            <Text variant="bodySm" color="ink4" numberOfLines={1}>
              from {o.supplierName ?? 'direct supplier'}
              {o.supplierCity ? ` · ${o.supplierCity}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: 'Display-Bold', fontSize: 17, lineHeight: 22, letterSpacing: -0.4, color: colors.ink }} numberOfLines={1}>
              {formatLKR(o.totalCents ?? 0)}
            </Text>
            <Text variant="caption" color="ink5" style={{ fontSize: 11 }}>
              {o.currency ?? 'LKR'}
            </Text>
          </View>
        </View>
      </View>
      {!compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.pearl, borderBottomLeftRadius: radii.xl, borderBottomRightRadius: radii.xl, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
          <MapPin size={12} color={colors.ink5} />
          <Text variant="caption" color="ink4" numberOfLines={1} style={{ flex: 1 }}>
            {[o.deliveryCity, o.deliveryDistrict].filter(Boolean).join(', ') || 'No destination'}
          </Text>
          <Text variant="caption" color="ink5">
            {formatDate(o.createdAt)} · {timeAgo(o.createdAt)}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
