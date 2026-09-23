import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Banknote,
  ChartColumn,
  FileText,
  Package,
  PackageOpen,
  Plus,
  Sparkles,
  Store,
  TriangleAlert,
  Truck,
  Warehouse,
} from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCompactLKR, formatDate, formatLKR, humanize } from '@/lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconTile,
  InkHero,
  Kicker,
  ListRow,
  Pulse,
  QuickAction,
  QuickActions,
  Screen,
  SkeletonList,
  Stat,
  StatGrid,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { usePurchaseOrders, PENDING_SET, TRANSIT_SET, DONE_SET } from '@/features/supplier/ops/api';
import { useOffers } from '@/features/supplier/catalog/api';
import { Enter, LivePill, NotificationsBell, RfqPill, Section, StepStrip, VerificationBanner, LearningCta } from '@/features/supplier/ops/kit';
import { RepeatOfferTile, ReviewsPanel, StorefrontCard } from '@/features/supplier/ops/DashboardParts';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';
import { useSupplierPayments, useSupplierProfile, useSupplierRfqs, settledRevenue } from './api';

function go(path: string) {
  router.push(path as never);
}

/** Fulfilment stage column — equal width, no horizontal scroll. */
function StageCell({ label, count, amount, color, onPress }: { label: string; count: number; amount: string; color: string; onPress: () => void }) {
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      scaleTo={0.96}
      style={[
        { flex: 1, minWidth: 0, padding: 12, gap: 6, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: count ? colors.paper : colors.pearl },
        count ? shadow.sm : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {count ? <Pulse color={color} size={6} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink6 }} />}
        <Text variant="overline" color="ink4" numberOfLines={1} style={{ flex: 1, fontSize: 9.5, letterSpacing: 0.9 }}>
          {label}
        </Text>
      </View>
      <Text variant="metricSm" color={count ? 'ink' : 'ink5'}>
        {count}
      </Text>
      <Text variant="caption" color="ink4" numberOfLines={1}>
        {amount}
      </Text>
    </Touchable>
  );
}

export function SupplierDashboardScreen() {
  const supplierId = useSupplierId();
  const sid = supplierId ?? '';
  const profile = useSupplierProfile(supplierId);
  const orders = usePurchaseOrders(sid);
  const payments = useSupplierPayments(supplierId);
  const offers = useOffers(sid);
  const rfqs = useSupplierRfqs(supplierId);
  const catalog = useQuery({
    queryKey: ['catalog-names'],
    queryFn: () => api.get<{ hits: { product: { id: string; name: string; unit?: string | null } }[] }>('/search/products?limit=200'),
    staleTime: 5 * 60_000,
  });

  const orderList = useMemo(() => orders.data?.orders ?? [], [orders.data]);
  const payList = payments.data?.items ?? [];
  const offerList = useMemo(() => offers.data?.offers ?? [], [offers.data]);
  const rfqList = useMemo(() => rfqs.data?.rfqs ?? [], [rfqs.data]);

  const productNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of catalog.data?.hits ?? []) map.set(h.product.id, h.product.name);
    return map;
  }, [catalog.data]);

  const pending = useMemo(() => orderList.filter((o) => PENDING_SET.includes(o.status)), [orderList]);
  const transit = useMemo(() => orderList.filter((o) => TRANSIT_SET.includes(o.status)), [orderList]);
  const done = useMemo(() => orderList.filter((o) => DONE_SET.includes(o.status)), [orderList]);
  const lowStock = useMemo(
    () => offerList.filter((o) => o.availabilityStatus === 'low' || o.availabilityStatus === 'out_of_stock'),
    [offerList],
  );
  const openRfqs = useMemo(() => rfqList.filter((r) => (r.myQuotes ?? 0) === 0 && !['closed', 'expired', 'cancelled', 'awarded'].includes(r.rfq.status)), [rfqList]);
  const pipelineValue = useMemo(() => orderList.reduce((s, o) => s + (o.totalCents ?? 0), 0), [orderList]);
  const revenue = settledRevenue(payList);
  const recentQuotes = openRfqs.length ? openRfqs.slice(0, 4) : rfqList.slice(0, 4);

  const loading = profile.isLoading && orders.isLoading && !profile.data && !orders.data;
  const fatal = profile.isError && orders.isError && payments.isError && !profile.data && !orders.data;

  const refresh = () => Promise.all([profile.refetch(), orders.refetch(), payments.refetch(), offers.refetch(), rfqs.refetch()]);

  if (loading) {
    return (
      <Screen tabBar kicker="Supplier" title="Dashboard">
        <SkeletonList rows={6} />
      </Screen>
    );
  }
  if (fatal) {
    return (
      <Screen tabBar kicker="Supplier" title="Dashboard" onRefresh={refresh}>
        <ErrorState message="Could not load supplier data." onRetry={() => refresh()} />
      </Screen>
    );
  }

  const supplier = profile.data?.supplier;
  const name = supplier?.name ?? 'Supplier facility';
  const verified = supplier?.verificationStatus === 'verified';
  const activeOffers = offerList.filter((o) => o.availabilityStatus === 'in_stock').length;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const stages = [
    { label: 'Awaiting', list: pending, color: colors.amber },
    { label: 'In transit', list: transit, color: colors.copper },
    { label: 'Delivered', list: done, color: colors.mint },
  ];

  return (
    <Screen
      tabBar
      onRefresh={refresh}
      kicker="Supplier console"
      title={name}
      subtitle={supplier?.district ? `${supplier.district} depot · ${today}` : today}
      right={
        <>
          <NotificationsBell />
          <PortalSwitcher current="supplier" />
        </>
      }
    >
      <VerificationBanner />
      <LearningCta />

      {/* Facility hero — status, settled revenue and the main shortcuts */}
      <Enter i={2}>
        <InkHero seed={`supplier-${sid}`} style={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                height: 26,
                flexShrink: 1,
                borderRadius: radii.pill,
                backgroundColor: verified ? 'rgba(61,139,110,0.2)' : 'rgba(198,220,74,0.14)',
              }}
            >
              <Pulse color={verified ? colors.mint : colors.volt} size={5} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 0.6, color: verified ? colors.mintSoft : colors.volt }}>
                {verified ? 'VERIFIED HUB' : 'FACILITY REGISTERED'}
              </Text>
            </View>
            <LivePill dark label="Live · 30s" fetching={orders.isFetching || payments.isFetching} />
          </View>

          <View style={{ marginTop: 22, gap: 6 }}>
            <Kicker color="volt">Settled revenue</Kicker>
            <Text variant="metric" color="paper" adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 40, lineHeight: 44 }}>
              {formatCompactLKR(revenue)}
            </Text>
            <Text variant="caption" color="paperMuted">
              {payList.length} {payList.length === 1 ? 'payment' : 'payments'} · {orderList.length} purchase {orderList.length === 1 ? 'order' : 'orders'} on record
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: colors.paperLine, marginVertical: 20 }} />

          <QuickActions>
            <QuickAction icon={Plus} label="Product" tone="volt" onPress={() => go('/supplier/products/new')} />
            <QuickAction icon={Package} label="Dispatch" tone="glass" badge={pending.length} onPress={() => go('/supplier/orders')} />
            <QuickAction icon={FileText} label="Quotes" tone="glass" badge={openRfqs.length} onPress={() => go('/supplier/quotes')} />
            <QuickAction icon={Banknote} label="Payments" tone="glass" onPress={() => go('/supplier/payments')} />
          </QuickActions>
        </InkHero>
      </Enter>

      {/* Key figures */}
      <Enter i={3}>
        <StatGrid>
          <Stat
            icon={Warehouse}
            label="Listings"
            value={offerList.length}
            hint={lowStock.length ? `${lowStock.length} low / out` : `${activeOffers} in stock`}
            accent
            onPress={() => go('/supplier/inventory')}
          />
          <Stat icon={ChartColumn} label="Pipeline" value={formatCompactLKR(pipelineValue)} hint={`${orderList.length} ${orderList.length === 1 ? 'PO' : 'POs'} · analytics`} onPress={() => go('/supplier/analytics')} />
          <Stat icon={PackageOpen} label="Dispatch" value={pending.length} hint={pending.length ? 'Needs action' : 'All clear'} onPress={() => go('/supplier/orders')} />
          <Stat icon={Truck} label="In transit" value={transit.length} hint="Track deliveries" onPress={() => go('/supplier/deliveries')} />
        </StatGrid>
      </Enter>

      {/* Order pipeline */}
      {orderList.length ? (
        <Enter i={4}>
          <Section icon={Truck} kicker="Fulfilment flow" title="Order pipeline" action={{ label: 'Orders', onPress: () => go('/supplier/orders') }}>
            <View style={{ flexDirection: 'row', gap: 3, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.mist }}>
              {stages.map((s) => (s.list.length ? <View key={s.label} style={{ flex: s.list.length, backgroundColor: s.color }} /> : null))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {stages.map((s) => (
                <StageCell
                  key={s.label}
                  label={s.label}
                  count={s.list.length}
                  amount={formatCompactLKR(s.list.reduce((sum, o) => sum + (o.totalCents ?? 0), 0))}
                  color={s.color}
                  onPress={() => go('/supplier/orders')}
                />
              ))}
            </View>
          </Section>
        </Enter>
      ) : null}

      {/* Activation checklist — first-run suppliers with no listings */}
      {offerList.length === 0 ? (
        <Enter i={5}>
          <Section icon={Sparkles} kicker="Facility activation checklist" title="Get your facility live" sub="Buyers search VYRO daily for mill-direct rates — publish to start receiving purchase orders." kind="elevated">
            <StepStrip
              steps={[
                { title: 'List products', hint: 'Pick from the wholesale catalog or create a SKU.' },
                { title: 'Verify facility', hint: 'Complete KYC so buyers see your trust seal.' },
                { title: 'Set up payouts', hint: 'Add a bank account for settlements.' },
                { title: 'Go live', hint: 'Your storefront opens to commercial buyers.' },
              ]}
            />
            <Button title="Publish first product" icon={Store} variant="primary" full onPress={() => go('/supplier/products/new')} />
          </Section>
        </Enter>
      ) : null}

      {/* Pending orders */}
      <Enter i={6}>
        <Section icon={Package} kicker="Dispatch" title="Pending orders" sub={pending.length ? `${pending.length} awaiting action` : undefined} action={{ label: 'View all', onPress: () => go('/supplier/orders') }}>
          {orders.isError ? (
            <ErrorState message="Could not load orders." onRetry={() => orders.refetch()} />
          ) : pending.length === 0 ? (
            <EmptyState compact title="Queue clear" message="Incoming purchase orders will appear here." />
          ) : (
            <View style={{ marginTop: -8, marginBottom: -10 }}>
              {pending.slice(0, 4).map((o, i) => (
                <ListRow
                  key={o.id}
                  icon={Package}
                  iconTone="paper"
                  title={o.poNumber || o.id.slice(0, 12)}
                  subtitle={`${humanize(o.status)} · ${o.deliveryCity ?? 'Commercial dock'}`}
                  meta={`${formatLKR(o.totalCents)} · ${formatDate(o.createdAt)}`}
                  trailing={<StatusBadge status={o.status} size="sm" />}
                  onPress={() => go(`/supplier/order/${o.id}`)}
                  last={i === Math.min(pending.length, 4) - 1}
                />
              ))}
            </View>
          )}
        </Section>
      </Enter>

      {/* Quote requests */}
      <Enter i={7}>
        <Section icon={FileText} kicker="Leads" title="Quote requests" sub={openRfqs.length ? `${openRfqs.length} awaiting your quote` : undefined} action={{ label: 'All RFQs', onPress: () => go('/supplier/quotes') }}>
          {rfqs.isError ? (
            <ErrorState message="Could not load RFQs." onRetry={() => rfqs.refetch()} />
          ) : recentQuotes.length === 0 ? (
            <EmptyState compact icon={FileText} title="No quote requests" message="Buyer RFQs routed to your depot appear here." />
          ) : (
            <View style={{ marginTop: -8, marginBottom: -10 }}>
              {recentQuotes.map((r, i) => (
                <ListRow
                  key={r.rfq.id}
                  icon={FileText}
                  iconTone="copper"
                  title={r.rfq.title}
                  subtitle={`${r.rfq.rfqNumber} · ${r.itemCount} items`}
                  trailing={<RfqPill status={r.rfq.status} size="sm" />}
                  onPress={() => go(`/supplier/quotes/${r.rfq.id}`)}
                  last={i === recentQuotes.length - 1}
                />
              ))}
            </View>
          )}
        </Section>
      </Enter>

      {/* Low stock */}
      <Enter i={8}>
        <Section icon={TriangleAlert} kicker="Inventory" title="Low stock" sub={lowStock.length ? `${lowStock.length} listing${lowStock.length === 1 ? '' : 's'} below threshold` : 'All listings healthy'} action={{ label: 'Restock', onPress: () => go('/supplier/inventory') }}>
          {lowStock.length === 0 ? (
            <EmptyState compact icon={Warehouse} title="Stock healthy" message="All depot allocations are above threshold." />
          ) : (
            <View style={{ marginTop: -8, marginBottom: -10 }}>
              {lowStock.slice(0, 4).map((o, i) => (
                <ListRow
                  key={o.id}
                  icon={TriangleAlert}
                  iconTone={o.availabilityStatus === 'out_of_stock' ? 'danger' : 'copper'}
                  title={productNames.get(o.productId) ?? 'Catalog listing'}
                  subtitle={o.availabilityStatus.replace(/_/g, ' ')}
                  meta={o.availableQty != null ? `${o.availableQty} left · MOQ ${o.minOrderQty}` : `MOQ ${o.minOrderQty}`}
                  onPress={() => go('/supplier/inventory')}
                  last={i === Math.min(lowStock.length, 4) - 1}
                />
              ))}
            </View>
          )}
        </Section>
      </Enter>

      <Enter i={9}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <RepeatOfferTile supplierId={sid} />
          <Card kind="flat" padding={16} onPress={() => go('/supplier/leads')} style={{ flex: 1, minWidth: 140, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <IconTile icon={FileText} tone="copper" size={34} />
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bone }}>
                <ArrowUpRight size={14} color={colors.ink4} strokeWidth={2} />
              </View>
            </View>
            <View style={{ gap: 3 }}>
              <Text variant="metricSm">{openRfqs.length}</Text>
              <Text variant="caption" weight="semibold" color="ink3" numberOfLines={1}>
                Open RFQs
              </Text>
              <Text variant="caption" color="ink5">
                Quote fast to win the order
              </Text>
            </View>
          </Card>
        </View>
      </Enter>

      <Enter i={10}>
        <StorefrontCard supplierId={sid} currentSlug={supplier?.slug} supplierName={name} />
      </Enter>
      <Enter i={10}>
        <ReviewsPanel supplierId={sid} />
      </Enter>
    </Screen>
  );
}
