import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
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
  IconButton,
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
import { colors, fonts, radii } from '@/theme/tokens';
import { Enter, go } from './kit';
import { IN_FLIGHT, REORDER_TO_CART, REORDERABLE, STATUS_FILTERS, TERMINAL, journeyProgress } from './orderStatus';
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
        right={
          <>
            <IconButton icon={MessageCircle} variant="surface" accessibilityLabel="Conversational ordering" onPress={() => go('/buyer/order/conversational')} />
            <IconButton icon={FileText} variant="surface" accessibilityLabel="Requests for quotation" onPress={() => go('/buyer/rfqs')} />
            <IconButton icon={RotateCcw} variant="surface" accessibilityLabel="Returns" onPress={() => go('/buyer/returns')} />
          </>
        }
      />
      <Gutter style={{ gap: 14 }}>
        {all.length > 0 ? (
          <Enter i={0}>
            <InkHero seed={`orders-${businessId ?? ''}`}>
              <View style={{ gap: 18 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ gap: 6, flex: 1 }}>
                    <Kicker color="volt">Commercial volume</Kicker>
                    <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
                      {formatCompactLKR(stats.spend)}
                    </Text>
                    <Text variant="caption" color="paperMuted">
                      {stats.total} purchase order{stats.total === 1 ? '' : 's'} issued
                    </Text>
                  </View>
                  {stats.inFlight > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(198,220,74,0.14)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Pulse size={6} />
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: colors.volt }}>LIVE</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.paperLine, paddingTop: 14 }}>
                  <HeroStat label="In flight" value={stats.inFlight} tone="volt" onPress={() => setFilter('out_for_delivery')} />
                  <HeroStat label="Delivered" value={stats.completed} onPress={() => setFilter('delivered')} />
                  <HeroStat label="Disputed" value={stats.disputed} tone={stats.disputed ? 'rose' : undefined} onPress={() => setFilter('disputed')} />
                </View>
              </View>
            </InkHero>
          </Enter>
        ) : null}

        <Enter i={1}>
          <QuickActions style={{ paddingHorizontal: 8 }}>
            <QuickAction icon={MessageCircle} label="Chat to order" tone="volt" onPress={() => go('/buyer/order/conversational')} />
            <QuickAction icon={FileText} label="Bulk quotes" onPress={() => go('/buyer/rfqs')} />
            <QuickAction icon={Sparkles} label="Ask AI" onPress={() => go('/buyer/ask')} />
            <QuickAction icon={ShoppingCart} label="Cart" badge={cartCount} onPress={() => go('/buyer/cart')} />
          </QuickActions>
        </Enter>

        {cartCount > 0 ? (
          <Enter i={2}>
            <Card kind="volt" onPress={() => go('/buyer/cart')} padding={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon={ShoppingCart} tone="ink" size={44} />
                <View style={{ flex: 1 }}>
                  <Text variant="h3">
                    {cartCount} item{cartCount === 1 ? '' : 's'} waiting in your cart
                  </Text>
                  <Text variant="caption" color="ink3">
                    {cart.data?.totalCents ? `${formatLKR(cart.data.totalCents)} · ` : ''}Check out to issue supplier POs
                  </Text>
                </View>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(12,14,11,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowRight size={16} color={colors.ink} />
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

function HeroStat({ label, value, tone, onPress }: { label: string; value: number; tone?: 'volt' | 'rose'; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={{ flex: 1, gap: 2 }} scaleTo={0.95}>
      <Text variant="metricSm" style={{ color: tone === 'volt' ? colors.volt : tone === 'rose' ? colors.roseSoft : colors.paper }}>
        {value}
      </Text>
      <Text variant="overline" color="paperFaint">
        {label}
      </Text>
    </Touchable>
  );
}


function OrderCard({ order: o, index, onReorder }: { order: OrderRow; index: number; onReorder: () => void }) {
  const status = o.status.toLowerCase();
  const terminal = TERMINAL.includes(status);
  const canReorder = REORDERABLE.has(status) || REORDER_TO_CART.has(status);
  const place = o.deliveryCity ? `${o.deliveryCity}${o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}` : 'Colombo depot';
  return (
    <Enter i={index}>
      <Card onPress={() => go(`/buyer/order/${o.id}`)} padding={16} radius={radii['2xl']} style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon={Store} tone={terminal ? 'paper' : 'ink'} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3" numberOfLines={1}>
              {o.supplierName ?? 'Wholesale supplier'}
            </Text>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.copperDeep, letterSpacing: 0.3 }}>{o.poNumber}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <StatusBadge status={status} size="sm" />
            {o.paymentState && !terminal ? <StatusBadge status={o.paymentState} label={PAYMENT_STATE_LABEL[o.paymentState]} size="sm" /> : null}
          </View>
        </View>

        {!terminal ? (
          <ProgressBar value={journeyProgress(status)} max={1} height={6} tone={status === 'completed' ? 'ink' : 'volt'} />
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ gap: 3, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <MapPin size={12} color={colors.ink5} />
              <Text variant="caption" color="ink4" numberOfLines={1}>
                {place}
              </Text>
            </View>
            <Text variant="caption" color="ink5">
              Issued {formatDate(o.createdAt)}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 18, letterSpacing: -0.6, color: colors.ink }}>{formatLKR(o.totalCents)}</Text>
        </View>

        {canReorder ? (
          <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 12 }}>
            <Button title="Reorder" icon={RefreshCw} size="sm" variant="secondary" onPress={onReorder} accessibilityLabel={`Reorder ${o.poNumber}`} />
            <Button title="Details" iconRight={ArrowRight} size="sm" variant="ghost" onPress={() => go(`/buyer/order/${o.id}`)} />
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
        seed="orders-empty"
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
