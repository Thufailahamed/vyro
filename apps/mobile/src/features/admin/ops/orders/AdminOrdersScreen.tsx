import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDownUp, ArrowRight, Download, Globe2, MapPin, Package } from 'lucide-react-native';
import {
  Button,
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
  ScreenHeader,
  SearchBar,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { colors } from '@/theme/tokens';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDate, formatLKR, humanize, timeAgo } from '@/lib/format';

import { AdminHeaderActions, HeroMetric, Pill, Reveal, shareCsv, useDebounced } from '../kit';
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
      <ScreenHeader
        kicker="Operations · Fulfilment"
        title="Orders control"
        subtitle="Cross-tenant purchase orders, lifecycle audit and delivery tracking."
        right={
          <>
            <IconButton icon={Download} accessibilityLabel="Export CSV" variant="surface" onPress={exportCsv} />
            <AdminHeaderActions />
          </>
        }
      />
      <Gutter>
        <InkHero seed="admin-orders">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="overline" color="volt">
              Order registry
            </Text>
            <Pill label={`${metrics.counts.all ?? 0} tracked`} tone="ink" />
          </View>
          <Text variant="metric" color="paper" style={{ marginTop: 10 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatCompactLKR(metrics.total)}
          </Text>
          <Text variant="caption" color="paperMuted">
            Gross volume in scope{dir ? ` · ${humanize(dir)}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.paperLine }}>
            <HeroMetric label="Pending" value={String(metrics.pending)} tone={metrics.pending ? 'volt' : 'paper'} />
            <HeroMetric label="In flight" value={String(metrics.fulfil)} />
            <HeroMetric label="Delivered" value={String(metrics.delivered)} />
            <HeroMetric label="Holds" value={String(metrics.holds)} tone={metrics.holds ? 'rose' : 'paper'} />
          </View>
        </InkHero>
      </Gutter>
      <Gutter style={{ gap: 10 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="PO#, buyer, supplier, city…" />
      </Gutter>
      <ChipRow
        style={{ paddingHorizontal: 20 }}
        options={ORDER_STATUS_TABS.map((t) => ({ value: t.id as string, label: t.label, count: scope.data ? (metrics.counts[t.id] ?? 0) : undefined }))}
        value={status}
        onChange={setStatus}
      />
      <ChipRow style={{ paddingHorizontal: 20 }} options={DIRECTIONS} value={direction} onChange={setDirection} />
      <Gutter>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="overline" color="ink4">
            {list.isLoading ? 'Loading…' : `${orders.length} ${orders.length === 1 ? 'order' : 'orders'} · ${formatCompactLKR(filteredValue)}`}
          </Text>
          <Button title={SORTS.find((s) => s.value === sort)!.label} icon={ArrowDownUp} size="sm" variant="paper" onPress={() => setSortOpen(true)} />
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
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort orders">
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
    <Card onPress={() => router.push(`/admin/order/${o.id}` as never)} padding={16} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon={cross ? Globe2 : Package} tone={cross ? 'copper' : 'ink'} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={1}>
            {o.businessName ?? 'Direct buyer'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <ArrowRight size={12} color={colors.copper} strokeWidth={2} />
            <Text variant="bodySm" color="ink4" numberOfLines={1} style={{ flex: 1 }}>
              {o.supplierName ?? 'Direct supplier'}
              {o.supplierCity ? ` · ${o.supplierCity}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 15, letterSpacing: -0.3, color: colors.ink }} numberOfLines={1}>
            {formatLKR(o.totalCents ?? 0)}
          </Text>
          <StatusBadge status={o.status} size="sm" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Pill label={o.poNumber ?? o.id.slice(0, 8)} />
        {cross ? <Pill label={`${o.direction}${o.incoterms ? ` · ${o.incoterms}` : ''}`.toUpperCase()} tone={o.direction === 'export' ? 'volt' : 'copper'} icon={Globe2} /> : null}
        <View style={{ flex: 1 }} />
        <Text variant="caption" color="ink5">
          {o.currency ?? 'LKR'}
        </Text>
      </View>
      {!compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 10 }}>
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
