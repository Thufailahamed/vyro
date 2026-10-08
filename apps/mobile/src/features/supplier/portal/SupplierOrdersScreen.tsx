import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Calendar, ChevronRight, Copy, MapPin, Package, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatDate, formatCompactLKR, formatRs, humanize } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, radii, shadow } from '@/theme/tokens';
import {
  Card,
  ChipRow,
  InkHero,
  EmptyState,
  ErrorState,
  Gutter,
  ListHeader,
  ListScreen,
  SearchBar,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import { usePurchaseOrders, destination, NEXT, type Po } from '@/features/supplier/ops/api';
import { OrderActions } from '@/features/supplier/ops/OrderActions';
import { Enter } from '@/features/supplier/ops/kit';
import { PAYMENT_STATE_LABEL } from '@/lib/orderLifecycle';

type Filter = 'all' | 'pending' | 'transit' | 'done' | 'attention';

const OPTIONS: { value: Filter; label: string; dotColor?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending', dotColor: colors.amber },
  { value: 'transit', label: 'In transit', dotColor: colors.mint },
  { value: 'done', label: 'Delivered', dotColor: colors.ink4 },
  { value: 'attention', label: 'Attention', dotColor: colors.rose },
];

function bucket(status: string): Filter | null {
  const s = status.toLowerCase();
  if (['pending', 'confirmed', 'accepted', 'preparing', 'ready_for_pickup'].includes(s)) return 'pending';
  if (['dispatched', 'out_for_delivery', 'shipped'].includes(s)) return 'transit';
  if (['delivered', 'received', 'completed'].includes(s)) return 'done';
  if (['disputed', 'cancelled', 'rejected', 'failed'].includes(s)) return 'attention';
  return null;
}

/** One stage of the ink pipeline hero — tapping filters the list. */
function StageCell({ label, value, dot, active, onPress }: { label: string; value: number; dot: string; active?: boolean; onPress: () => void }) {
  return (
    <Touchable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      scaleTo={0.95}
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 4,
        borderRadius: radii.lg,
        borderCurve: 'continuous',
        backgroundColor: active ? 'rgba(198,220,74,0.16)' : 'rgba(250,247,240,0.06)',
        borderWidth: 1,
        borderColor: active ? 'rgba(198,220,74,0.45)' : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
        <Text variant="caption" color={active ? 'volt' : 'paperMuted'} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="h1" color="paper" tabular>
        {value}
      </Text>
    </Touchable>
  );
}

/** 4-step horizontal progress tracker on the order card. */
function OrderPipelineBar({ status }: { status: string }) {
  const s = status.toLowerCase();
  const isFailed = ['cancelled', 'rejected', 'failed', 'disputed'].includes(s);

  if (isFailed) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.rose }} />
        <Text variant="caption" color="rose">
          Order {humanize(s).toLowerCase()} · Depot fulfillment stopped
        </Text>
      </View>
    );
  }

  let activeStep = 1;
  let statusText = 'Awaiting your response';
  if (['accepted'].includes(s)) {
    activeStep = 2;
    statusText = 'Order accepted';
  } else if (['preparing', 'ready_for_pickup'].includes(s)) {
    activeStep = 3;
    statusText = 'Packing & preparing';
  } else if (['out_for_delivery', 'dispatched', 'shipped'].includes(s)) {
    activeStep = 3;
    statusText = 'In transit to buyer';
  } else if (['delivered', 'received', 'completed'].includes(s)) {
    activeStep = 4;
    statusText = 'Delivered to dock';
  }

  const steps = [1, 2, 3, 4];

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {steps.map((num) => {
          const isDone = activeStep >= num;
          const isCurrent = activeStep === num;
          return (
            <View
              key={num}
              style={{
                height: 5,
                flex: 1,
                borderRadius: 3,
                backgroundColor: isDone
                  ? isCurrent && num === 1
                    ? colors.amber
                    : colors.voltDeep
                  : colors.mist,
              }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" weight="semibold" color={activeStep === 1 ? 'copper' : 'ink3'}>
          {statusText}
        </Text>
        <Text variant="caption" color="ink5" tabular>
          {activeStep}/4
        </Text>
      </View>
    </View>
  );
}

/** Supplier order card: identity, logistics, progress, value and next action. */
function OrderCard({ item }: { item: Po }) {
  const toast = useToast();
  const isPending = item.status.toLowerCase() === 'pending';
  const hasActions = Boolean(NEXT[item.status]);

  const copyPoNumber = async () => {
    await Clipboard.setStringAsync(item.poNumber || item.id);
    haptic.tap();
    toast.success('PO number copied');
  };

  return (
    <Card
      kind="flat"
      onPress={() => router.push(`/supplier/order/${item.id}` as never)}
      padding={0}
      radius={radii['2xl']}
      style={[{ overflow: 'hidden' }, isPending ? { borderWidth: 1.5, borderColor: 'rgba(196,132,58,0.45)' } : null]}
    >
      <View style={{ padding: 16, gap: 14 }}>
        {/* Identity + value */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous', backgroundColor: isPending ? colors.amberSoft : colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Package size={19} color={isPending ? colors.amber : colors.volt} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="body" weight="semibold" numberOfLines={1} ellipsizeMode="middle" style={{ flexShrink: 1 }}>
                {item.poNumber || item.id.slice(0, 12)}
              </Text>
              <Touchable
                onPress={(e) => {
                  e.stopPropagation?.();
                  void copyPoNumber();
                }}
                hitSlop={8}
                scaleTo={0.88}
                accessibilityLabel="Copy purchase order number"
              >
                <Copy size={13} color={colors.ink5} />
              </Touchable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <StatusBadge status={item.status} size="sm" />
              {item.paymentState ? <StatusBadge status={item.paymentState} label={PAYMENT_STATE_LABEL[item.paymentState]} size="sm" /> : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text variant="h2" tabular numberOfLines={1}>
              {formatCompactLKR(item.totalCents)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <ShieldCheck size={11} color={colors.mint} strokeWidth={2.2} />
              <Text variant="caption" color="mint">
                Escrow
              </Text>
            </View>
          </View>
        </View>

        {/* Logistics */}
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MapPin size={14} color={colors.copper} strokeWidth={2} />
            <Text variant="bodySm" color="ink2" numberOfLines={1} style={{ flex: 1 }}>
              {destination(item)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} color={colors.ink5} strokeWidth={2} />
            <Text variant="bodySm" color="ink4" style={{ flex: 1 }} numberOfLines={1}>
              Ordered {formatDate(item.createdAt)}
              {item.deliveryPromisedAt ? (
                <Text variant="bodySm" weight="semibold" color="copper">
                  {'  ·  '}Due {formatDate(item.deliveryPromisedAt)}
                </Text>
              ) : null}
            </Text>
          </View>
          {item.notes ? (
            <Text variant="caption" color="ink4" numberOfLines={2} style={{ marginLeft: 22 }}>
              “{item.notes}”
            </Text>
          ) : null}
        </View>

        <OrderPipelineBar status={item.status} />
      </View>

      {/* Next action */}
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.pearl }}>
        {hasActions ? (
          <OrderActions poId={item.id} poNumber={item.poNumber} status={item.status} size="sm" full />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="bodySm" color="ink4">
              {item.status.toLowerCase() === 'delivered' ? 'Completed & settled' : 'Order finalised'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text variant="bodySm" weight="semibold" color="copper">
                Details
              </Text>
              <ChevronRight size={15} color={colors.copper} />
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}

export function SupplierOrdersScreen() {
  const supplierId = useSupplierId();
  const q = usePurchaseOrders(supplierId ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const all = useMemo(() => q.data?.orders ?? [], [q.data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: all.length, pending: 0, transit: 0, done: 0, attention: 0 };
    for (const o of all) {
      const b = bucket(o.status);
      if (b) c[b] += 1;
    }
    return c;
  }, [all]);

  const pipelineValue = useMemo(
    () => all.reduce((sum, o) => sum + (o.totalCents ?? 0), 0),
    [all]
  );

  const shown = useMemo(() => {
    let list = filter === 'all' ? all : all.filter((o) => bucket(o.status) === filter);
    const t = search.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (o) =>
          (o.poNumber ?? o.id).toLowerCase().includes(t) ||
          (o.deliveryCity ?? '').toLowerCase().includes(t) ||
          (o.deliveryDistrict ?? '').toLowerCase().includes(t) ||
          (o.deliveryAddress ?? '').toLowerCase().includes(t)
      );
    }
    return [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [all, filter, search]);

  const header = (
    <ListHeader>
      {/* Title bar */}
      <Gutter style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text variant="overline" color="copper">
            Supplier
          </Text>
          <Text variant="displayMd">Orders</Text>
        </View>
        <Touchable
          onPress={() => router.push('/supplier/returns' as never)}
          hapticOnPress
          scaleTo={0.95}
          accessibilityLabel="Returns"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radii.pill, backgroundColor: colors.paper, ...shadow.sm }}
        >
          <RotateCcw size={15} color={colors.ink2} strokeWidth={2.1} />
          <Text variant="bodySm" weight="semibold">
            Returns
          </Text>
        </Touchable>
      </Gutter>

      <Gutter style={{ gap: 12 }}>
        {/* Pipeline hero — each stage filters the list */}
        <InkHero style={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexShrink: 1, gap: 2 }}>
              <Text variant="caption" color="paperMuted">
                Order value · {all.length} PO{all.length === 1 ? '' : 's'}
              </Text>
              <Text variant="displayMd" color="paper" tabular numberOfLines={1} adjustsFontSizeToFit>
                {formatRs(pipelineValue)}
              </Text>
            </View>
            {counts.attention ? (
              <Touchable onPress={() => setFilter(filter === 'attention' ? 'all' : 'attention')} hapticOnPress style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(196,90,74,0.22)' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose }} />
                <Text variant="caption" weight="semibold" style={{ color: colors.roseSoft }}>
                  {counts.attention} need attention
                </Text>
              </Touchable>
            ) : null}
          </View>
          {all.length ? (
            <View style={{ flexDirection: 'row', gap: 3, height: 6, borderRadius: 3, overflow: 'hidden' }}>
              {(
                [
                  [counts.pending, colors.amber],
                  [counts.transit, colors.mint],
                  [counts.done, colors.paperFaint],
                  [counts.attention, colors.rose],
                ] as const
              ).map(([n, c], i) => (n ? <View key={i} style={{ flex: n, backgroundColor: c }} /> : null))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StageCell label="To accept" value={counts.pending} dot={colors.amber} active={filter === 'pending'} onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')} />
            <StageCell label="In transit" value={counts.transit} dot={colors.mint} active={filter === 'transit'} onPress={() => setFilter(filter === 'transit' ? 'all' : 'transit')} />
            <StageCell label="Delivered" value={counts.done} dot={colors.paperFaint} active={filter === 'done'} onPress={() => setFilter(filter === 'done' ? 'all' : 'done')} />
          </View>
        </InkHero>

        <SearchBar value={search} onChangeText={setSearch} placeholder="Search PO, city or address…" />
      </Gutter>

      <ChipRow<Filter>
        value={filter}
        onChange={setFilter}
        style={{ paddingHorizontal: 20 }}
        options={OPTIONS.map((o) => ({ ...o, count: counts[o.value] }))}
      />

      {search.trim() || filter !== 'all' ? (
        <Gutter style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="caption" color="ink4">
            Showing{' '}
            <Text variant="caption" weight="semibold" color="ink">
              {shown.length}
            </Text>{' '}
            of {all.length}
          </Text>
          <Touchable
            onPress={() => {
              setSearch('');
              setFilter('all');
            }}
            hitSlop={8}
          >
            <Text variant="caption" weight="semibold" color="copper">
              Reset
            </Text>
          </Touchable>
        </Gutter>
      ) : null}
    </ListHeader>
  );

  if (q.isLoading)
    return <ListScreen tabBar data={[]} renderItem={null} header={header} ListEmptyComponent={<SkeletonList rows={4} height={180} />} />;

  if (q.isError)
    return (
      <ListScreen
        tabBar
        data={[]}
        renderItem={null}
        header={header}
        onRefresh={() => q.refetch()}
        ListEmptyComponent={<ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      />
    );

  return (
    <ListScreen
      tabBar
      header={header}
      onRefresh={() => q.refetch()}
      data={shown}
      keyExtractor={(o) => o.id}
      renderItem={({ item, index }) => (
        <Enter i={index}>
          <OrderCard item={item} />
        </Enter>
      )}
      ListEmptyComponent={
        <EmptyState
          icon={Package}
          title={all.length ? 'No matching orders' : 'No purchase orders yet'}
          message={
            all.length
              ? 'Try adjusting your search query or switching active filters.'
              : 'When buyers place orders against your product inventory, they will appear here.'
          }
          action={
            all.length
              ? {
                  label: 'Clear search & filters',
                  onPress: () => {
                    setSearch('');
                    setFilter('all');
                  },
                }
              : undefined
          }
        />
      }
    />
  );
}
