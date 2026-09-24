import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Package,
  Pencil,
  Percent,
  Plus,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Warehouse,
  Zap,
} from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatLKR, formatRs } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import {
  Card,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Gutter,
  IconButton,
  InkHero,
  Kicker,
  ListHeader,
  ListScreen,
  ProductImage,
  QuickAction,
  QuickActions,
  Row,
  ScreenHeader,
  SearchBar,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import {
  go,
  hasTiers,
  isRunningLow,
  matchesSearch,
  offersKey,
  productMeta,
  useCatalog,
  useOffers,
  type Availability,
  type CatalogProduct,
  type Offer,
} from './api';
import { FadeInItem, HowItWorks, InkTip, MetaChip, QuickStartGrid, SkeletonCards, StockChip, TrainingBanner } from './components';
import { QuickEditSheet } from './QuickEditSheet';

type Filter = 'all' | Availability;

export function SupplierProductsScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const offers = useOffers(supplierId);
  const catalog = useCatalog();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Offer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Offer | null>(null);

  const nameMap = useMemo(() => new Map((catalog.data?.products ?? []).map((p) => [p.id, p])), [catalog.data]);
  const list = useMemo(() => offers.data?.offers ?? [], [offers.data]);

  const counts = useMemo(() => {
    const c = { in_stock: 0, low: 0, out_of_stock: 0 };
    for (const o of list) c[o.availabilityStatus] += 1;
    return c;
  }, [list]);
  const avgPrice = list.length ? Math.round(list.reduce((a, o) => a + o.priceCents, 0) / list.length) : 0;
  const readyPct = list.length ? Math.round((counts.in_stock / list.length) * 100) : 0;
  const tieredCount = useMemo(() => list.filter((o) => hasTiers(o)).length, [list]);

  const filtered = useMemo(
    () => list.filter((o) => matchesSearch(o, nameMap.get(o.productId), q) && (filter === 'all' || o.availabilityStatus === filter)),
    [list, nameMap, q, filter],
  );

  const unlisted = useMemo(() => {
    const listed = new Set(list.map((o) => o.productId));
    return (catalog.data?.products ?? []).filter((p) => !listed.has(p.id)).slice(0, 6);
  }, [catalog.data, list]);

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/supplier-products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
      toast.success('Listing delisted');
      setPendingDelete(null);
    },
    onError: (e) => toast.error('Could not delist', errorMessage(e)),
  });

  const toggleActive = useMutation({
    mutationFn: (o: Offer) => api.patch(`/supplier-products/${o.id}`, { active: !o.active }),
    onSuccess: (_d, o) => {
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
      toast.success(o.active ? 'Listing hidden' : 'Listing is live');
    },
    onError: (e) => toast.error('Could not update listing', errorMessage(e)),
  });

  const refresh = () => Promise.all([offers.refetch(), catalog.refetch()]);

  const header = (
    <ListHeader>
      <ScreenHeader
        kicker="Depot catalog"
        title="Products"
        subtitle={
          list.length
            ? `${list.length} wholesale ${list.length === 1 ? 'commodity' : 'commodities'} published to buyers.`
            : 'Publish commodities or custom depot items to receive purchase orders.'
        }
        right={
          <>
            <IconButton icon={Store} accessibilityLabel="Open marketplace" variant="surface" onPress={() => go('/buyer/catalog')} />
            <IconButton icon={Plus} accessibilityLabel="Add product" variant="ink" onPress={() => go('/supplier/products/new')} />
          </>
        }
      />
      <Gutter style={{ gap: 14 }}>
        <TrainingBanner />
        <FadeInItem>
          <InkHero seed={`products-${supplierId ?? ''}`}>
            <Row justify="space-between" align="flex-start">
              <View style={{ gap: 4, flex: 1 }}>
                <Kicker color="volt">{list.length ? 'Catalog active' : 'Awaiting listings'}</Kicker>
                <Text variant="metric" color="paper">
                  {list.length}
                </Text>
                <Text variant="caption" color="paperMuted">
                  Published wholesale offers
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3, paddingTop: 20 }}>
                <Text variant="overline" color="paperFaint">
                  Avg mill-gate rate
                </Text>
                <Text variant="metricSm" color="volt" adjustsFontSizeToFit numberOfLines={1}>
                  {formatRs(avgPrice)}
                </Text>
                {tieredCount > 0 ? (
                  <Text variant="caption" color="paperFaint">
                    {tieredCount} tiered
                  </Text>
                ) : null}
              </View>
            </Row>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
              <HeroStat label="Ready" value={`${counts.in_stock}`} hint={list.length ? `${readyPct}% live` : 'None yet'} tone="mint" />
              <HeroStat label="Low" value={`${counts.low}`} hint={counts.low ? 'Restock soon' : 'None'} tone="amber" />
              <HeroStat label="Out" value={`${counts.out_of_stock}`} hint={counts.out_of_stock ? 'Suppressed' : 'None'} tone="rose" />
            </View>
            <View style={{ height: 1, backgroundColor: colors.paperLine, marginVertical: 18 }} />
            <QuickActions>
              <QuickAction icon={Plus} label="Add" tone="volt" onPress={() => go('/supplier/products/new')} />
              <QuickAction icon={Percent} label="Pricing" tone="glass" onPress={() => go('/supplier/pricing')} />
              <QuickAction icon={Warehouse} label="Inventory" tone="glass" badge={counts.low + counts.out_of_stock} onPress={() => go('/supplier/inventory')} />
              <QuickAction icon={TrendingUp} label="Analytics" tone="glass" onPress={() => go('/supplier/analytics')} />
            </QuickActions>
          </InkHero>
        </FadeInItem>

        {list.length ? (
          <>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search commodities, SKU, brand…" />
            <ChipRow<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: list.length },
                { value: 'in_stock', label: 'In stock', count: counts.in_stock },
                { value: 'low', label: 'Low stock', count: counts.low },
                { value: 'out_of_stock', label: 'Out of stock', count: counts.out_of_stock },
              ]}
            />
          </>
        ) : null}
      </Gutter>
    </ListHeader>
  );

  if (offers.isLoading) {
    return (
      <ListScreen tabBar data={[]} renderItem={null} header={header} ListEmptyComponent={<SkeletonCards />} />
    );
  }
  if (offers.isError) {
    return (
      <ListScreen
        tabBar
        data={[]}
        renderItem={null}
        header={header}
        onRefresh={refresh}
        ListEmptyComponent={<ErrorState message={errorMessage(offers.error, 'Could not load product listings.')} onRetry={() => offers.refetch()} />}
      />
    );
  }

  return (
    <>
      <ListScreen<Offer>
        tabBar
        header={header}
        onRefresh={refresh}
        data={filtered}
        keyExtractor={(o) => o.id}
        renderItem={({ item, index }) => (
          <FadeInItem index={index}>
            <OfferCard
              offer={item}
              product={nameMap.get(item.productId)}
              onEdit={() => go(`/supplier/products/${item.id}/edit`)}
              onQuick={() => setEditing(item)}
              onDelete={() => setPendingDelete(item)}
              onToggleActive={() => toggleActive.mutate(item)}
              toggling={toggleActive.isPending && toggleActive.variables?.id === item.id}
            />
          </FadeInItem>
        )}
        ListEmptyComponent={
          list.length === 0 ? (
            <View style={{ gap: 18 }}>
              <EmptyState
                icon={Package}
                title="Launch your depot catalog"
                message="Publish staple commodities, oils, packaging or bulk goods to accept purchase orders from verified buyers."
                action={{ label: 'Add first product', onPress: () => go('/supplier/products/new') }}
              />
              <HowItWorks
                title="How depot publishing works"
                steps={[
                  { title: 'Select a standard SKU', body: 'Pick a verified commodity standard or add your own brand and packaging.' },
                  { title: 'Set mill-gate rates & MOQ', body: 'Base price per unit, minimum order, lead time and tiered volume discounts.' },
                  { title: 'Receive escrow POs', body: 'Buyers order against your rates. Funds are held in escrow and released on delivery.' },
                ]}
              />
              <QuickStartGrid
                title="Quick start"
                hint="Tap a commodity to open a pre-filled listing."
                products={unlisted}
                cta="List this"
              />
            </View>
          ) : (
            <EmptyState
              compact
              icon={Package}
              title="No matches"
              message="Try a different search or clear the availability filter."
              action={{
                label: 'Reset filters',
                onPress: () => {
                  setQ('');
                  setFilter('all');
                },
              }}
            />
          )
        }
        ListFooterComponent={
          list.length ? (
            <View style={{ marginTop: 8 }}>
              <InkTip
                icon={TrendingUp}
                kicker="Procurement intelligence"
                text="Buyers filter by dispatch readiness and MOQ. Lead times under 48h plus volume tiers drive a 44% higher repeat-order rate."
              />
            </View>
          ) : null
        }
      />

      <QuickEditSheet offer={editing} product={editing ? nameMap.get(editing.productId) : undefined} supplierId={supplierId} onClose={() => setEditing(null)} />

      <ConfirmSheet
        visible={!!pendingDelete}
        onClose={() => !del.isPending && setPendingDelete(null)}
        onConfirm={() => pendingDelete && del.mutate(pendingDelete.id)}
        loading={del.isPending}
        variant="danger"
        confirmLabel="Delist product"
        title="Remove this listing?"
        message={
          pendingDelete
            ? `${nameMap.get(pendingDelete.productId)?.name ?? 'This listing'} at ${formatLKR(pendingDelete.priceCents)} will be removed from buyer order forms.`
            : undefined
        }
      />
    </>
  );
}

function HeroStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'mint' | 'amber' | 'rose' }) {
  const dot = tone === 'mint' ? colors.mint : tone === 'amber' ? colors.amber : colors.rose;
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: 'rgba(250,247,240,0.07)', gap: 4, minHeight: 78 }}>
      <Row gap={5} align="center">
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
        <Text variant="overline" color="paperMuted" style={{ fontSize: 9 }} numberOfLines={1}>
          {label}
        </Text>
      </Row>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 20, color: colors.paper }}>{value}</Text>
      <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.paperFaint }} numberOfLines={2}>
        {hint}
      </Text>
    </View>
  );
}

function OfferCard({
  offer: o,
  product: p,
  onEdit,
  onQuick,
  onDelete,
  onToggleActive,
  toggling,
}: {
  offer: Offer;
  product?: CatalogProduct;
  onEdit: () => void;
  onQuick: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  toggling: boolean;
}) {
  const unit = p?.unit ?? 'unit';
  const low = isRunningLow(o);
  const out = o.availabilityStatus === 'out_of_stock';
  const tiers = hasTiers(o);
  const free = o.trackInventory ? (o.availableQty ?? o.stockQty ?? 0) : null;
  return (
    <Card kind="flat" padding={0} onPress={onEdit} style={{ overflow: 'hidden', opacity: o.active ? 1 : 0.72 }}>
      {low || out ? (
        <Row
          gap={6}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: out ? colors.roseSoft : colors.amberSoft,
          }}
        >
          <AlertTriangle size={12} color={out ? colors.rose : colors.amber} />
          <Text variant="caption" style={{ color: out ? colors.rose : colors.copperDeep, flex: 1 }} numberOfLines={1}>
            {out
              ? 'Out of stock — checkout suppressed'
              : free !== null
                ? `Running low · ${free.toLocaleString()} ${unit} free`
                : 'Low stock — replenish depot allocation'}
          </Text>
        </Row>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 14, padding: 14 }}>
        <View style={{ borderRadius: radii.xl, borderCurve: 'continuous', overflow: 'hidden', ...shadow.sm }}>
          <ProductImage src={p?.imageUrl} seed={o.productId} style={{ width: 96, height: 96, borderRadius: radii.xl }} label={p?.unit ?? undefined} />
          {!o.active ? (
            <View style={{ position: 'absolute', top: 7, left: 7, backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontFamily: fonts.sansSemi, fontSize: 9.5, color: colors.paper, letterSpacing: 0.6 }}>HIDDEN</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ gap: 1 }}>
            <Text variant="h3" numberOfLines={2}>
              {p?.name ?? 'Standard commodity'}
            </Text>
            <Text variant="caption" color="ink4" numberOfLines={1}>
              {[productMeta(p), o.supplierSku ? `SKU ${o.supplierSku}` : null].filter(Boolean).join(' · ') || 'Standard SKU'}
            </Text>
          </View>
          <Row gap={4} align="flex-end">
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 18, letterSpacing: -0.6, color: colors.ink }}>{formatLKR(o.priceCents)}</Text>
            <Text variant="caption" color="ink4" style={{ marginBottom: 2 }}>
              / {unit}
            </Text>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            <StockChip status={o.availabilityStatus} qty={free} />
            <MetaChip label={`MOQ ${o.minOrderQty}`} />
            <MetaChip icon={Clock} label={`${o.leadTimeDays}d`} />
            <MetaChip
              icon={Truck}
              label={o.deliveryAvailable !== false ? (o.deliveryRadiusKm ? `${o.deliveryRadiusKm} km` : 'Island-wide') : 'Pickup'}
            />
            {tiers ? <MetaChip icon={Layers} label="Tiers" tone="volt" /> : null}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: colors.pearl, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
        <CardAction icon={Zap} label="Quick edit" onPress={onQuick} accent />
        <CardAction icon={o.active ? EyeOff : Eye} label={toggling ? '…' : o.active ? 'Hide' : 'Publish'} onPress={onToggleActive} />
        <CardAction icon={Pencil} label="Edit" onPress={onEdit} />
        <CardAction icon={Trash2} label="" onPress={onDelete} danger narrow />
      </View>
    </Card>
  );
}

function CardAction({
  icon: Icon,
  label,
  onPress,
  accent,
  danger,
  narrow,
}: {
  icon: typeof Zap;
  label: string;
  onPress: () => void;
  accent?: boolean;
  danger?: boolean;
  narrow?: boolean;
}) {
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      scaleTo={0.95}
      accessibilityLabel={label || 'Delist'}
      style={{
        flex: narrow ? 0 : 1,
        width: narrow ? 38 : undefined,
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: radii.pill,
        backgroundColor: accent ? colors.ink : danger ? colors.roseSoft : colors.paper,
        ...(accent || danger ? {} : shadow.sm),
      }}
    >
      <Icon size={15} color={danger ? colors.rose : accent ? colors.volt : colors.ink3} strokeWidth={1.9} />
      {label ? (
        <Text variant="caption" weight="semibold" color={accent ? 'paper' : 'ink2'}>
          {label}
        </Text>
      ) : null}
    </Touchable>
  );
}
