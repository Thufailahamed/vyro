import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, Banknote, ChevronDown, ChevronRight, FileText, Package, Plus, ShieldCheck, Sparkles, Store, TriangleAlert, Truck, type LucideIcon } from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatCompactLKR, formatDate, formatRs, humanize } from '@/lib/format';
import { Avatar, Button, Card, CountUp, ErrorState, IconTile, Pulse, QuickAction, QuickActions, Screen, SkeletonList, StatusBadge, Text, Touchable } from '@/ui';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { usePurchaseOrders, PENDING_SET, TRANSIT_SET, DONE_SET } from '@/features/supplier/ops/api';
import { useOffers } from '@/features/supplier/catalog/api';
import { Enter, NotificationsBell, RfqPill, StepStrip, VerificationBanner, LearningCta } from '@/features/supplier/ops/kit';
import { RepeatOfferTile, ReviewsPanel, StorefrontCard } from '@/features/supplier/ops/DashboardParts';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';
import { useSupplierPayments, useSupplierProfile, useSupplierRfqs, settledRevenue } from './api';

function go(path: string) {
  router.push(path as never);
}

/** Short money for tight cells: whole rupees under Rs. 1,000, compact above. */
function short(cents: number) {
  return Math.abs(cents) < 100_000 ? formatRs(cents) : formatCompactLKR(cents);
}

function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2, marginBottom: 12 }}>
      <View style={{ flexShrink: 1, gap: 1 }}>
        <Text variant="h2">{title}</Text>
        {sub ? (
          <Text variant="caption" color="ink4">
            {sub}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Touchable
          onPress={action.onPress}
          hapticOnPress
          scaleTo={0.95}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 12, paddingRight: 8, height: 30, borderRadius: radii.pill, backgroundColor: colors.paper, ...shadow.sm }}
        >
          <Text variant="caption" weight="semibold" color="ink2">
            {action.label}
          </Text>
          <ChevronRight size={14} color={colors.ink4} strokeWidth={2.2} />
        </Touchable>
      ) : null}
    </View>
  );
}

/** Inset-grouped row: tinted icon, title/subtitle, trailing slot, hairline divider. */
function Line({ icon: Icon, tint, tintBg, title, subtitle, trailing, onPress, last }: { icon: LucideIcon; tint: string; tintBg: string; title: string; subtitle?: string; trailing?: ReactNode; onPress: () => void; last: boolean }) {
  return (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.985} accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: 'continuous', backgroundColor: tintBg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={tint} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="ink4" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
      {!last ? <View style={{ position: 'absolute', left: 54, right: 0, bottom: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.lineSoft }} /> : null}
    </Touchable>
  );
}

function Empty({ icon: Icon, title, message }: { icon: LucideIcon; title: string; message: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 }}>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={colors.ink4} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodySm" weight="semibold">
          {title}
        </Text>
        <Text variant="caption" color="ink4">
          {message}
        </Text>
      </View>
    </View>
  );
}

const DAY = 86_400_000;

/** Last-7-days order value as slim bars — today in volt. */
function WeekBars({ orders }: { orders: { createdAt: number; totalCents?: number | null }[] }) {
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime() - 6 * DAY;
    const out = Array.from({ length: 7 }, (_, i) => ({ label: new Date(t0 + i * DAY).toLocaleDateString('en-GB', { weekday: 'narrow' }), v: 0 }));
    for (const o of orders) {
      const ms = o.createdAt < 10_000_000_000 ? o.createdAt * 1000 : o.createdAt;
      const i = Math.floor((ms - t0) / DAY);
      if (i >= 0 && i < 7) out[i].v += o.totalCents ?? 0;
    }
    return out;
  }, [orders]);
  const max = Math.max(...days.map((d) => d.v), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 64 }}>
      {days.map((d, i) => {
        const today = i === 6;
        return (
          <View key={i} style={{ alignItems: 'center', gap: 5 }}>
            <View style={{ height: 46, justifyContent: 'flex-end' }}>
              <View
                style={{
                  width: 9,
                  height: Math.max(4, (d.v / max) * 46),
                  borderRadius: 5,
                  backgroundColor: today ? colors.volt : d.v ? 'rgba(250,247,240,0.42)' : 'rgba(250,247,240,0.12)',
                }}
              />
            </View>
            <Text style={{ fontFamily: fonts.sansSemi, fontSize: 9.5, lineHeight: 12, color: today ? colors.volt : colors.paperFaint }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function HeroCell({ label, value, onPress, alert }: { label: string; value: string; onPress: () => void; alert?: boolean }) {
  return (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.96} accessibilityLabel={label} style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 15, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {alert ? <Pulse color={colors.amber} size={5} /> : null}
        <Text variant="caption" color="paperFaint" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="h3" color="paper" numberOfLines={1} adjustsFontSizeToFit tabular>
        {value}
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
  const recentQuotes = openRfqs.slice(0, 4);

  const loading = profile.isLoading && orders.isLoading && !profile.data && !orders.data;
  const fatal = profile.isError && orders.isError && payments.isError && !profile.data && !orders.data;

  const refresh = () => Promise.all([profile.refetch(), orders.refetch(), payments.refetch(), offers.refetch(), rfqs.refetch()]);

  if (loading) {
    return (
      <Screen tabBar title="Dashboard">
        <SkeletonList rows={6} />
      </Screen>
    );
  }
  if (fatal) {
    return (
      <Screen tabBar title="Dashboard" onRefresh={refresh}>
        <ErrorState message="Could not load supplier data." onRetry={() => refresh()} />
      </Screen>
    );
  }

  const supplier = profile.data?.supplier;
  const name = supplier?.name ?? 'Supplier facility';
  const verified = supplier?.verificationStatus === 'verified';
  const activeOffers = offerList.filter((o) => o.availabilityStatus === 'in_stock').length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const stages = [
    { label: 'Awaiting', list: pending, color: colors.amber },
    { label: 'In transit', list: transit, color: colors.copper },
    { label: 'Delivered', list: done, color: colors.mint },
  ];

  return (
    <Screen tabBar onRefresh={refresh} gap={0}>
      {/* App bar: identity (opens portal switcher) + notifications */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <PortalSwitcher
            current="supplier"
            trigger={({ open, orgName }) => (
              <Touchable onPress={open} hapticOnPress scaleTo={0.97} accessibilityLabel="Switch workspace" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ padding: 2, borderRadius: 26, borderWidth: 1.5, borderColor: verified ? colors.mint : colors.copper }}>
                  <Avatar name={orgName} size={42} tone="copper" />
                </View>
                <View style={{ flexShrink: 1, gap: 1 }}>
                  <Text variant="bodySm" color="ink4" numberOfLines={1}>
                    {greeting}
                    {supplier?.district ? ` · ${supplier.district}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {name}
                    </Text>
                    <ChevronDown size={16} color={colors.ink4} strokeWidth={2.2} />
                  </View>
                </View>
              </Touchable>
            )}
          />
        </View>
        <NotificationsBell />
      </View>

      <View style={{ gap: 10, marginBottom: 20 }}>
        <VerificationBanner />
        <LearningCta variant="compact" />
      </View>

      {/* Revenue card */}
      <Enter i={1}>
        <View style={[{ borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.ink, overflow: 'hidden' }, shadow.ink]}>
          <LinearGradient pointerEvents="none" colors={['#2F3524', '#171A13', colors.ink]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient pointerEvents="none" colors={['rgba(198,220,74,0.16)', 'rgba(198,220,74,0)']} start={{ x: 1, y: 0 }} end={{ x: 0.35, y: 0.6 }} style={StyleSheet.absoluteFill} />
          <Touchable onPress={() => go('/supplier/payments')} hapticOnPress scaleTo={0.985} accessibilityLabel="Settled revenue" style={{ padding: 22, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pulse color={orders.isFetching || payments.isFetching ? colors.amber : colors.volt} size={5} />
                <Text variant="bodySm" weight="medium" color="paperMuted">
                  Settled revenue
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: verified ? 'rgba(61,139,110,0.22)' : 'rgba(250,247,240,0.1)' }}>
                <ShieldCheck size={12} color={verified ? colors.mintSoft : colors.paperMuted} strokeWidth={2.2} />
                <Text variant="caption" weight="semibold" style={{ color: verified ? colors.mintSoft : colors.paperMuted }}>
                  {verified ? 'Verified' : 'Unverified'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flexShrink: 1, gap: 4 }}>
                <CountUp
                  value={revenue}
                  format={(n) => formatRs(n)}
                  style={{ fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 46, letterSpacing: -1.2, color: colors.paper }}
                />
                <Text variant="bodySm" color="paperFaint" numberOfLines={1}>
                  {payList.length} {payList.length === 1 ? 'payment' : 'payments'} · {orderList.length} {orderList.length === 1 ? 'order' : 'orders'}
                </Text>
              </View>
              <WeekBars orders={orderList} />
            </View>
          </Touchable>
          <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.paperLine }}>
            <HeroCell label="Pipeline" value={short(pipelineValue)} onPress={() => go('/supplier/analytics')} />
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.paperLine, marginVertical: 14 }} />
            <HeroCell label="To dispatch" value={String(pending.length)} alert={pending.length > 0} onPress={() => go('/supplier/orders')} />
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.paperLine, marginVertical: 14 }} />
            <HeroCell label="Listings" value={String(offerList.length)} alert={lowStock.length > 0} onPress={() => go('/supplier/inventory')} />
          </View>
        </View>
      </Enter>

      {/* Shortcuts */}
      <Enter i={2}>
        <QuickActions style={{ marginTop: 24 }}>
          <QuickAction icon={Plus} label="Product" tone="volt" onPress={() => go('/supplier/products/new')} />
          <QuickAction icon={Package} label="Dispatch" badge={pending.length} onPress={() => go('/supplier/orders')} />
          <QuickAction icon={FileText} label="Quotes" badge={openRfqs.length} onPress={() => go('/supplier/quotes')} />
          <QuickAction icon={Banknote} label="Payments" onPress={() => go('/supplier/payments')} />
        </QuickActions>
      </Enter>

      {/* Order pipeline */}
      {orderList.length ? (
        <Enter i={3} style={{ marginTop: 30 }}>
          <SectionTitle title="Order pipeline" action={{ label: 'Orders', onPress: () => go('/supplier/orders') }} />
          <Card padding={16} radius={radii['2xl']} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 3, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.mist }}>
              {stages.map((st) => (st.list.length ? <View key={st.label} style={{ flex: st.list.length, backgroundColor: st.color }} /> : null))}
            </View>
            <View style={{ flexDirection: 'row' }}>
              {stages.map((st, i) => (
                <Touchable key={st.label} onPress={() => go('/supplier/orders')} hapticOnPress scaleTo={0.96} style={{ flex: 1, gap: 2, paddingLeft: i ? 14 : 0, borderLeftWidth: i ? StyleSheet.hairlineWidth * 2 : 0, borderLeftColor: colors.lineSoft }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.list.length ? st.color : colors.ink6 }} />
                    <Text variant="caption" color="ink4" numberOfLines={1}>
                      {st.label}
                    </Text>
                  </View>
                  <Text variant="h1" color={st.list.length ? 'ink' : 'ink5'} tabular>
                    {st.list.length}
                  </Text>
                  <Text variant="caption" color="ink5" numberOfLines={1}>
                    {short(st.list.reduce((sum, o) => sum + (o.totalCents ?? 0), 0))}
                  </Text>
                </Touchable>
              ))}
            </View>
          </Card>
        </Enter>
      ) : null}

      {/* Activation checklist — first-run suppliers with no listings */}
      {offerList.length === 0 ? (
        <Enter i={4} style={{ marginTop: 30 }}>
          <SectionTitle title="Get your facility live" sub="Publish to start receiving purchase orders" />
          <Card padding={18} radius={radii['2xl']} style={{ gap: 16 }}>
            <StepStrip
              steps={[
                { title: 'List products', hint: 'Pick from the wholesale catalog or create a SKU.' },
                { title: 'Verify facility', hint: 'Complete KYC so buyers see your trust seal.' },
                { title: 'Set up payouts', hint: 'Add a bank account for settlements.' },
                { title: 'Go live', hint: 'Your storefront opens to commercial buyers.' },
              ]}
            />
            <Button title="Publish first product" icon={Store} variant="primary" full onPress={() => go('/supplier/products/new')} />
          </Card>
        </Enter>
      ) : null}

      {/* Pending orders */}
      <Enter i={5} style={{ marginTop: 30 }}>
        <SectionTitle title="To dispatch" sub={pending.length ? `${pending.length} awaiting action` : undefined} action={{ label: 'See all', onPress: () => go('/supplier/orders') }} />
        <Card padding={0} radius={radii['2xl']} style={{ paddingHorizontal: 14 }}>
          {orders.isError ? (
            <ErrorState message="Could not load orders." onRetry={() => orders.refetch()} />
          ) : pending.length === 0 ? (
            <Empty icon={Package} title="Queue clear" message="Incoming purchase orders will appear here." />
          ) : (
            pending.slice(0, 4).map((o, i) => (
              <Line
                key={o.id}
                icon={Package}
                tint={colors.volt}
                tintBg={colors.ink}
                title={o.poNumber || o.id.slice(0, 12)}
                subtitle={`${o.deliveryCity ?? 'Commercial dock'} · ${formatDate(o.createdAt)}`}
                trailing={
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Text variant="bodySm" weight="semibold" tabular>
                      {formatCompactLKR(o.totalCents)}
                    </Text>
                    <StatusBadge status={o.status} size="sm" />
                  </View>
                }
                onPress={() => go(`/supplier/order/${o.id}`)}
                last={i === Math.min(pending.length, 4) - 1}
              />
            ))
          )}
        </Card>
      </Enter>

      {/* Quote requests */}
      <Enter i={6} style={{ marginTop: 30 }}>
        <SectionTitle title="Quote requests" sub={openRfqs.length ? `${openRfqs.length} awaiting your quote` : undefined} action={{ label: 'All RFQs', onPress: () => go('/supplier/quotes') }} />
        <Card padding={0} radius={radii['2xl']} style={{ paddingHorizontal: 14 }}>
          {rfqs.isError ? (
            <ErrorState message="Could not load RFQs." onRetry={() => rfqs.refetch()} />
          ) : recentQuotes.length === 0 ? (
            <Empty icon={FileText} title="No open requests" message={rfqList.length ? `You're up to date · ${rfqList.length} past request${rfqList.length === 1 ? '' : 's'}` : 'Buyer RFQs routed to your depot appear here.'} />
          ) : (
            recentQuotes.map((r, i) => (
              <Line
                key={r.rfq.id}
                icon={FileText}
                tint={colors.copperDeep}
                tintBg={colors.copperSoft}
                title={r.rfq.title}
                subtitle={`${r.rfq.rfqNumber} · ${r.itemCount} item${r.itemCount === 1 ? '' : 's'}`}
                trailing={<RfqPill status={r.rfq.status} size="sm" />}
                onPress={() => go(`/supplier/quotes/${r.rfq.id}`)}
                last={i === recentQuotes.length - 1}
              />
            ))
          )}
        </Card>
      </Enter>

      {/* Low stock */}
      <Enter i={7} style={{ marginTop: 30 }}>
        <SectionTitle title="Stock alerts" sub={lowStock.length ? `${lowStock.length} listing${lowStock.length === 1 ? '' : 's'} below threshold` : undefined} action={{ label: 'Inventory', onPress: () => go('/supplier/inventory') }} />
        <Card padding={0} radius={radii['2xl']} style={{ paddingHorizontal: 14 }}>
          {lowStock.length === 0 ? (
            <Empty icon={Sparkles} title="Stock healthy" message={`${activeOffers} listing${activeOffers === 1 ? '' : 's'} in stock and above threshold.`} />
          ) : (
            lowStock.slice(0, 4).map((o, i) => {
              const out = o.availabilityStatus === 'out_of_stock';
              return (
                <Line
                  key={o.id}
                  icon={TriangleAlert}
                  tint={out ? colors.rose : colors.amber}
                  tintBg={out ? colors.roseSoft : colors.amberSoft}
                  title={productNames.get(o.productId) ?? 'Catalog listing'}
                  subtitle={o.availableQty != null ? `${o.availableQty} left · MOQ ${o.minOrderQty}` : `MOQ ${o.minOrderQty}`}
                  trailing={
                    <Text variant="caption" weight="semibold" style={{ color: out ? colors.rose : colors.amber }}>
                      {humanize(o.availabilityStatus)}
                    </Text>
                  }
                  onPress={() => go('/supplier/inventory')}
                  last={i === Math.min(lowStock.length, 4) - 1}
                />
              );
            })
          )}
        </Card>
      </Enter>

      <Enter i={8} style={{ marginTop: 30, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <RepeatOfferTile supplierId={sid} />
          <Card kind="flat" padding={16} radius={radii['2xl']} onPress={() => go('/supplier/analytics')} style={{ flex: 1, minWidth: 140, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <IconTile icon={Truck} tone="copper" size={34} />
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bone }}>
                <ArrowUpRight size={14} color={colors.ink4} strokeWidth={2} />
              </View>
            </View>
            <View style={{ gap: 3 }}>
              <Text variant="metricSm">{orderList.length ? `${Math.round((done.length / orderList.length) * 100)}%` : '—'}</Text>
              <Text variant="caption" weight="semibold" color="ink3" numberOfLines={1}>
                Fulfilment rate
              </Text>
              <Text variant="caption" color="ink5" numberOfLines={1}>
                {done.length} of {orderList.length} delivered
              </Text>
            </View>
          </Card>
        </View>
        <StorefrontCard supplierId={sid} currentSlug={supplier?.slug} supplierName={name} />
        <ReviewsPanel supplierId={sid} />
      </Enter>
    </Screen>
  );
}
