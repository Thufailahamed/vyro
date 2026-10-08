import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronRight,
  FileText,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
} from 'lucide-react-native';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  IconTile,
  InkHero,
  Kicker,
  ListHeader,
  ListScreen,
  ProgressBar,
  Pulse,
  QuickAction,
  QuickActions,
  ScreenHeader,
  SearchBar,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useAuth, useBusinessId } from '@/lib/auth';
import { formatCompactLKR, formatDate, formatLKR } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { Enter, go } from './kit';
import { IN_FLIGHT, REORDER_TO_CART, REORDERABLE, STATUS_FILTERS, TERMINAL, journeyProgress, journeyStage } from './orderStatus';
import { ReorderSheet } from './components/ReorderSheet';
import type { OrderRow } from './types';
import { PAYMENT_STATE_LABEL } from '@/lib/orderLifecycle';

type Filter = (typeof STATUS_FILTERS)[number]['value'];

export function OrdersScreen() {
  const businessId = useBusinessId();
  const { business } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [reorderFor, setReorderFor] = useState<OrderRow | null>(null);

  const q = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => api.get<{ orders: OrderRow[] }>('/purchase-orders' + qs({ businessId })),
    enabled: !!businessId,
  });
  const cart = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: { id: string }[]; totalCents?: number }>('/cart' + qs({ businessId })),
    enabled: !!businessId,
    staleTime: 10_000,
  });

  const all = useMemo(() => q.data?.orders ?? [], [q.data]);
  const cartCount = cart.data?.items?.length ?? 0;

  const stats = useMemo(() => {
    const s = (o: OrderRow) => o.status.toLowerCase();
    return {
      total: all.length,
      inFlight: all.filter((o) => IN_FLIGHT.includes(s(o))).length,
      completed: all.filter((o) => ['completed', 'delivered'].includes(s(o))).length,
      disputed: all.filter((o) => s(o) === 'disputed').length,
      spend: all.filter((o) => s(o) !== 'cancelled').reduce((sum, o) => sum + (o.totalCents || 0), 0),
    };
  }, [all]);

  const options = useMemo(
    () =>
      STATUS_FILTERS.map((f) => ({
        value: f.value,
        label: f.label,
        count: f.value === 'all' ? all.length : all.filter((o) => o.status.toLowerCase() === f.value).length,
      })).filter((o) => o.value === 'all' || o.value === filter || o.count > 0),
    [all, filter],
  );

  const shown = useMemo(() => {
    let list = filter === 'all' ? all : all.filter((o) => o.status.toLowerCase() === filter);
    const t = search.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (o) =>
          o.poNumber.toLowerCase().includes(t) ||
          (o.supplierName ?? '').toLowerCase().includes(t) ||
          (o.deliveryCity ?? '').toLowerCase().includes(t) ||
          (o.deliveryDistrict ?? '').toLowerCase().includes(t),
      );
    }
    return list;
  }, [all, filter, search]);

  const refresh = () => Promise.all([q.refetch(), cart.refetch()]);

  const header = (
    <ListHeader>
      <ScreenHeader
        kicker={business?.businessName ? `Procurement · ${business.businessName}` : 'Procurement'}
        title="Purchase orders"
        subtitle="From supplier confirmation and dispatch to dockside receipt and settlement."
      />
      <Gutter style={{ gap: 16 }}>
        {all.length > 0 ? (
          <Enter i={0}>
            <InkHero seed={`orders-${businessId ?? ''}`} style={{ padding: 0 }}>
              <View style={{ padding: 20, paddingBottom: 18, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
                  <Kicker color="volt">Commercial volume</Kicker>
                  {stats.inFlight > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(198,220,74,0.12)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(198,220,74,0.28)', borderRadius: 999, paddingHorizontal: 10, height: 24 }}>
                      <Pulse size={6} />
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 1, color: colors.volt }}>LIVE</Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 2 }}>
                  {formatCompactLKR(stats.spend)}
                </Text>
                <Text variant="caption" color="paperMuted">
                  Across {stats.total} purchase order{stats.total === 1 ? '' : 's'} issued
                </Text>
              </View>
              <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.paperLine, backgroundColor: 'rgba(250,247,240,0.03)' }}>
                <HeroStat label="In flight" value={stats.inFlight} tone="volt" onPress={() => setFilter('out_for_delivery')} />
                <HeroStat label="Delivered" value={stats.completed} divider onPress={() => setFilter('delivered')} />
                <HeroStat label="Disputed" value={stats.disputed} divider tone={stats.disputed ? 'rose' : undefined} onPress={() => setFilter('disputed')} />
              </View>
            </InkHero>
          </Enter>
        ) : null}

        <Enter i={1}>
          <QuickActions style={{ paddingTop: 4 }}>
            <QuickAction icon={MessageCircle} label="Chat order" tone="volt" onPress={() => go('/buyer/order/conversational')} />
            <QuickAction icon={FileText} label="Quotes" onPress={() => go('/buyer/rfqs')} />
            <QuickAction icon={Sparkles} label="Ask AI" onPress={() => go('/buyer/ask')} />
            <QuickAction icon={RotateCcw} label="Returns" onPress={() => go('/buyer/returns')} />
          </QuickActions>
        </Enter>

        {cartCount > 0 ? (
          <Enter i={2}>
            <Card kind="volt" onPress={() => go('/buyer/cart')} padding={14} radius={radii['2xl']}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View>
                  <IconTile icon={ShoppingCart} tone="ink" size={48} />
                  <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.copper, borderWidth: 2, borderColor: colors.volt, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, color: colors.paper }}>{cartCount}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h3" numberOfLines={1}>
                    {cartCount} item{cartCount === 1 ? '' : 's'} in your cart
                  </Text>
                  <Text variant="caption" color="ink3" numberOfLines={1}>
                    {cart.data?.totalCents ? `${formatLKR(cart.data.totalCents)} · ` : ''}Ready to issue POs
                  </Text>
                </View>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowRight size={16} color={colors.volt} strokeWidth={2.2} />
                </View>
              </View>
            </Card>
          </Enter>
        ) : null}

        {all.length > 0 ? (
          <>
            <SearchBar value={search} onChangeText={setSearch} placeholder="PO number, supplier, city…" />
            <View style={{ marginHorizontal: -20 }}>
              <ChipRow options={options} value={filter} onChange={setFilter} style={{ paddingHorizontal: 20 }} />
            </View>
          </>
        ) : null}
      </Gutter>
    </ListHeader>
  );

  const empty = q.isLoading || !businessId ? (
    <SkeletonList rows={4} height={132} />
  ) : q.isError ? (
    <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
  ) : all.length === 0 ? (
    <FirstOrderEmpty />
  ) : (
    <EmptyState
      icon={Search}
      title="No orders match"
      message={search ? `Nothing matches “${search}” in this view.` : 'No orders with this status yet.'}
      action={{
        label: 'Reset filters',
        onPress: () => {
          setFilter('all');
          setSearch('');
        },
      }}
      compact
    />
  );

  return (
    <>
      <ListScreen
        tabBar
        data={q.isLoading ? [] : shown}
        keyExtractor={(o) => o.id}
        header={header}
        onRefresh={refresh}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => <OrderCard order={item} index={index} onReorder={() => setReorderFor(item)} />}
      />
      <ReorderSheet order={reorderFor} businessId={businessId} onClose={() => setReorderFor(null)} />
    </>
  );
}

function HeroStat({ label, value, tone, divider, onPress }: { label: string; value: number; tone?: 'volt' | 'rose'; divider?: boolean; onPress: () => void }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      style={{ flex: 1, gap: 4, paddingVertical: 14, paddingHorizontal: 20, borderLeftWidth: divider ? StyleSheet.hairlineWidth : 0, borderLeftColor: colors.paperLine }}
      scaleTo={0.95}
    >
      <Text variant="metricSm" style={{ color: tone === 'volt' ? colors.volt : tone === 'rose' ? colors.roseSoft : colors.paper }}>
        {value}
      </Text>
      <Text variant="overline" color="paperFaint" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 9.5, letterSpacing: 1.3 }}>
        {label}
      </Text>
    </Touchable>
  );
}


function OrderCard({ order: o, index, onReorder }: { order: OrderRow; index: number; onReorder: () => void }) {
  const status = o.status.toLowerCase();
  const terminal = TERMINAL.includes(status);
  const canReorder = REORDERABLE.has(status) || REORDER_TO_CART.has(status);
  const stage = journeyStage(status);
  const place =
    [...new Map([o.deliveryCity, o.deliveryDistrict].filter((v): v is string => !!v).map((v) => [v.toLowerCase(), v.charAt(0).toUpperCase() + v.slice(1)])).values()].join(', ') ||
    'Colombo depot';
  return (
    <Enter i={index}>
      <Card onPress={() => go(`/buyer/order/${o.id}`)} padding={16} radius={radii['2xl']} style={[{ gap: 16, backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineSoft }, shadow.card]}>
        {/* Supplier + PO number */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile icon={Store} tone={terminal ? 'paper' : 'ink'} size={48} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="h3" numberOfLines={1}>
              {o.supplierName ?? 'Wholesale supplier'}
            </Text>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, lineHeight: 15, color: colors.copperDeep, letterSpacing: 0.3 }} numberOfLines={1}>
              {o.poNumber}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.ink5} strokeWidth={2} />
        </View>

        {/* Status + journey */}
        <View style={{ gap: 10, backgroundColor: colors.pearl, borderRadius: radii.lg, borderCurve: 'continuous', padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <StatusBadge status={status} size="sm" />
            {o.paymentState && !terminal ? <StatusBadge status={o.paymentState} label={PAYMENT_STATE_LABEL[o.paymentState]} size="sm" /> : null}
            {!terminal ? (
              <Text style={{ marginLeft: 'auto', fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.4, color: colors.ink4 }}>
                {stage.step}/{stage.total}
              </Text>
            ) : null}
          </View>
          {!terminal ? (
            <View style={{ gap: 6 }}>
              <ProgressBar value={journeyProgress(status)} max={1} height={6} tone={status === 'completed' ? 'ink' : 'volt'} />
              <Text variant="caption" color="ink4" numberOfLines={1}>
                {stage.label}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Delivery + total */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ gap: 4, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} color={colors.ink4} strokeWidth={1.9} />
              <Text variant="caption" color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>
                {place}
              </Text>
            </View>
            <Text variant="caption" color="ink5">
              Issued {formatDate(o.createdAt)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 1 }}>
            <Text variant="overline" color="ink5" style={{ fontSize: 9.5 }}>
              PO total
            </Text>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 18, lineHeight: 22, letterSpacing: -0.6, color: colors.ink }} numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(o.totalCents)}
            </Text>
          </View>
        </View>

        {canReorder ? (
          <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 14 }}>
            <Button title="Reorder" icon={RefreshCw} size="sm" variant="secondary" onPress={onReorder} accessibilityLabel={`Reorder ${o.poNumber}`} style={{ flex: 1 }} />
            <Button title="Details" iconRight={ArrowRight} size="sm" variant="ghost" onPress={() => go(`/buyer/order/${o.id}`)} style={{ flex: 1 }} />
          </View>
        ) : null}
      </Card>
    </Enter>
  );
}

function FirstOrderEmpty() {
  const steps = [
    { n: '01', t: 'Multi-supplier split', d: 'Combine goods from many suppliers in one cart — VYRO splits it into separate, legal POs.' },
    { n: '02', t: 'Dispatch & tracking', d: 'Suppliers confirm dispatch with driver details and live transit milestones.' },
    { n: '03', t: 'Dockside receipt', d: 'Confirm receipt on delivery to lock the audit trail and release escrowed funds.' },
  ];
  return (
    <View style={{ gap: 14 }}>
      <EmptyState
        icon={Package}
        title="No purchase orders yet"
        message="Add products from verified suppliers to your cart. Checkout issues binding POs with live tracking."
        action={{ label: 'Browse catalog', onPress: () => go('/buyer/catalog') }}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Ask AI for my usual" icon={Sparkles} variant="secondary" size="sm" onPress={() => go('/buyer/ask')} style={{ flex: 1 }} />
        <Button title="Catalog" icon={LayoutGrid} variant="ghost" size="sm" onPress={() => go('/buyer/catalog')} />
      </View>
      <Kicker style={{ marginTop: 6 }}>Procurement automation</Kicker>
      {steps.map((s, i) => (
        <Enter key={s.n} i={i + 1}>
          <Card padding={14} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.volt }}>{s.n}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3">{s.t}</Text>
              <Text variant="caption" color="ink4">
                {s.d}
              </Text>
            </View>
          </Card>
        </Enter>
      ))}
    </View>
  );
}
