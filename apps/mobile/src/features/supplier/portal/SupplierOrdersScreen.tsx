import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  MapPin,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatDate, formatLKR, formatCompactLKR, humanize } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, fonts, radii, shadow, type ColorName } from '@/theme/tokens';
import {
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  ListHeader,
  ListScreen,
  ScreenHeader,
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

/** Interactive quick-stat card used in the top operations deck. */
function StatCard({
  label,
  value,
  sub,
  active,
  onPress,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  active?: boolean;
  onPress: () => void;
  accent?: 'amber' | 'mint' | 'ink';
  icon?: LucideIcon;
}) {
  const bg = active ? colors.ink : colors.paper;
  const fg: ColorName = active ? 'paper' : 'ink';
  const border = active
    ? colors.ink
    : accent === 'amber'
      ? 'rgba(196,132,58,0.28)'
      : accent === 'mint'
        ? 'rgba(61,139,110,0.28)'
        : colors.lineSoft;

  return (
    <Touchable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      scaleTo={0.96}
      style={{
        flex: 1,
        minWidth: 100,
        backgroundColor: bg,
        borderRadius: radii.xl,
        padding: 12,
        gap: 6,
        borderWidth: 1,
        borderColor: border,
        ...shadow.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="overline" color={active ? 'paperMuted' : 'ink4'} numberOfLines={1}>
          {label}
        </Text>
        {Icon ? (
          <Icon
            size={13}
            color={
              active
                ? colors.volt
                : accent === 'amber'
                  ? colors.amber
                  : accent === 'mint'
                    ? colors.mint
                    : colors.copper
            }
          />
        ) : null}
      </View>
      <Text variant="metricSm" color={fg} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" color={active ? 'paperFaint' : 'ink5'} numberOfLines={1}>
        {sub}
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
  let statusText = '1. Awaiting response';
  if (['accepted'].includes(s)) {
    activeStep = 2;
    statusText = '2. Order accepted';
  } else if (['preparing', 'ready_for_pickup'].includes(s)) {
    activeStep = 3;
    statusText = '3. Packing & preparing';
  } else if (['out_for_delivery', 'dispatched', 'shipped'].includes(s)) {
    activeStep = 3;
    statusText = '3. In transit to buyer';
  } else if (['delivered', 'received', 'completed'].includes(s)) {
    activeStep = 4;
    statusText = '4. Delivered to dock';
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
                height: 4,
                flex: 1,
                borderRadius: 2,
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
        <Text variant="caption" color={activeStep === 1 ? 'copper' : 'ink4'}>
          {statusText}
        </Text>
        <Text variant="caption" color="ink5">
          Step {activeStep} of 4
        </Text>
      </View>
    </View>
  );
}

/** Upgraded B2B Order Card. */
function OrderCard({ item }: { item: Po }) {
  const toast = useToast();
  const isPending = item.status.toLowerCase() === 'pending';
  const hasActions = Boolean(NEXT[item.status]);

  const copyPoNumber = async () => {
    const textToCopy = item.poNumber || item.id;
    await Clipboard.setStringAsync(textToCopy);
    haptic.tap();
    toast.success('PO number copied to clipboard');
  };

  return (
    <Card
      kind="flat"
      onPress={() => router.push(`/supplier/order/${item.id}` as never)}
      padding={0}
      radius={radii['2xl']}
      style={{
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: isPending ? 'rgba(196,132,58,0.32)' : colors.lineSoft,
        overflow: 'hidden',
        ...shadow.sm,
      }}
    >
      {/* Top Urgent Alert Bar for Pending Orders */}
      {isPending ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.amberSoft,
            paddingHorizontal: 16,
            paddingVertical: 7,
          }}
        >
          <Sparkles size={13} color="#8F5A1E" />
          <Text
            style={{
              fontFamily: fonts.sansSemi,
              fontSize: 11,
              color: '#8F5A1E',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            Action Required · Awaiting depot response
          </Text>
        </View>
      ) : null}

      {/* Main Body */}
      <View style={{ padding: 16, gap: 14 }}>
        {/* Header: PO Number + Status Badge */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: radii.md,
                backgroundColor: isPending ? colors.amberSoft : colors.pearl,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: isPending ? 'rgba(196,132,58,0.2)' : colors.lineSoft,
              }}
            >
              <Package size={17} color={isPending ? colors.amber : colors.ink} strokeWidth={1.8} />
            </View>
            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="mono" weight="semibold" color="ink" style={{ fontSize: 13.5 }}>
                  {item.poNumber || item.id.slice(0, 12)}
                </Text>
                <Touchable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    void copyPoNumber();
                  }}
                  hitSlop={8}
                  accessibilityLabel="Copy purchase order number"
                >
                  <Copy size={13} color={colors.ink4} />
                </Touchable>
              </View>
              <Text variant="caption" color="ink5">
                Depot purchase order
              </Text>
            </View>
          </View>
          <StatusBadge status={item.status} size="sm" />
        </View>

        {/* Logistics Information Deck */}
        <View
          style={{
            backgroundColor: colors.pearl,
            borderRadius: radii.lg,
            padding: 12,
            gap: 8,
            borderWidth: 1,
            borderColor: colors.lineSoft,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MapPin size={14} color={colors.copper} strokeWidth={2} />
            <Text variant="bodySm" weight="medium" color="ink" numberOfLines={1} style={{ flex: 1 }}>
              {destination(item)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: colors.lineSoft,
              paddingTop: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} color={colors.ink4} />
              <Text variant="caption" color="ink4">
                Ordered {formatDate(item.createdAt)}
              </Text>
            </View>
            {item.deliveryPromisedAt ? (
              <Text variant="caption" color="copper" weight="medium">
                Due {formatDate(item.deliveryPromisedAt)}
              </Text>
            ) : (
              <Text variant="caption" color="ink5">
                Standard dock delivery
              </Text>
            )}
          </View>
          {item.notes ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 6 }}>
              <Text variant="caption" color="ink4" numberOfLines={2}>
                <Text variant="caption" weight="semibold" color="ink3">
                  Note:{' '}
                </Text>
                {item.notes}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Mini Fulfillment Pipeline */}
        <OrderPipelineBar status={item.status} />

        {/* Financial Readout & Escrow Protection */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 2 }}>
          <View style={{ gap: 2 }}>
            <Text variant="overline" color="ink4">
              TOTAL ORDER VALUE
            </Text>
            <Text variant="h1" color="ink">
              {formatLKR(item.totalCents)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radii.pill,
              backgroundColor: colors.pearl,
              borderWidth: 1,
              borderColor: colors.lineSoft,
            }}
          >
            <ShieldCheck size={12} color={colors.mint} strokeWidth={2} />
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: colors.ink3 }}>
              Escrow Secured
            </Text>
          </View>
        </View>
      </View>

      {/* Action Footer */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.lineSoft,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.pearl,
        }}
      >
        {hasActions ? (
          <OrderActions poId={item.id} poNumber={item.poNumber} status={item.status} size="sm" full />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="bodySm" color="ink4">
              {item.status.toLowerCase() === 'delivered' ? 'Completed & settled' : 'Order finalized'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text variant="bodySm" weight="semibold" color="copper">
                View details
              </Text>
              <ChevronRight size={14} color={colors.copper} />
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
      <ScreenHeader
        kicker="Operations Console"
        title="Orders"
        subtitle={`${all.length} purchase orders routed to your depot.`}
      />

      {/* Operational KPI Deck */}
      <Gutter style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatCard
            label="Pending"
            value={counts.pending}
            sub={counts.pending === 1 ? '1 needs action' : `${counts.pending} need action`}
            accent="amber"
            icon={Clock}
            active={filter === 'pending'}
            onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
          />
          <StatCard
            label="In Transit"
            value={counts.transit}
            sub={counts.transit === 1 ? '1 dispatched' : `${counts.transit} dispatched`}
            accent="mint"
            icon={Truck}
            active={filter === 'transit'}
            onPress={() => setFilter(filter === 'transit' ? 'all' : 'transit')}
          />
          <StatCard
            label="Depot Value"
            value={formatCompactLKR(pipelineValue)}
            sub={`${all.length} total orders`}
            accent="ink"
            icon={Package}
            active={filter === 'all' && !search}
            onPress={() => {
              setFilter('all');
              setSearch('');
            }}
          />
        </View>

        {/* Search Bar */}
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search PO number, city or address…"
        />

        {/* Filter Chips */}
        <ChipRow<Filter>
          value={filter}
          onChange={setFilter}
          options={OPTIONS.map((o) => ({
            ...o,
            count: counts[o.value],
          }))}
        />

        {/* Active Filter & Results indicator */}
        {search.trim() || filter !== 'all' ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 2,
              paddingHorizontal: 2,
            }}
          >
            <Text variant="caption" color="ink4">
              Showing{' '}
              <Text variant="caption" weight="semibold" color="ink">
                {shown.length}
              </Text>{' '}
              of {all.length} purchase orders
            </Text>
            <Touchable
              onPress={() => {
                setSearch('');
                setFilter('all');
              }}
              hitSlop={8}
            >
              <Text variant="caption" weight="semibold" color="copper">
                Reset filters
              </Text>
            </Touchable>
          </View>
        ) : null}
      </Gutter>
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
