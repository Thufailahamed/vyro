import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Layers, Package, Pencil, Percent, Plus, Store, Trash2, TrendingUp, Truck, Warehouse, Zap } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatLKR, formatRs } from '@/lib/format';
import { colors, radii, shadow } from '@/theme/tokens';
import {
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Gutter,
  IconButton,
  ListHeader,
  ListScreen,
  InkHero,
  ProductImage,
  ProgressRing,
  Row,
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
import { FadeInItem, HowItWorks, InkTip, MetaChip, QuickStartGrid, SkeletonCards, StockChip } from './components';
import { LearningCta } from '@/features/supplier/ops/kit';
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

  const cells: { value: Filter; label: string; count: number; dot?: string }[] = [
    { value: 'all', label: 'Listings', count: list.length },
    { value: 'in_stock', label: 'Ready', count: counts.in_stock, dot: colors.mint },
    { value: 'low', label: 'Low', count: counts.low, dot: colors.amber },
    { value: 'out_of_stock', label: 'Out', count: counts.out_of_stock, dot: colors.rose },
  ];

  const header = (
    <ListHeader>
      {/* Title bar */}
      <Gutter style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text variant="overline" color="copper">
            Supplier
          </Text>
          <Text variant="displayMd">Products</Text>
        </View>
        <Row gap={8}>
          <IconButton icon={Store} accessibilityLabel="Open marketplace" variant="surface" size={44} onPress={() => go('/buyer/catalog')} />
          <IconButton icon={Plus} accessibilityLabel="Add product" variant="ink" size={44} onPress={() => go('/supplier/products/new')} />
        </Row>
      </Gutter>

      <Gutter style={{ gap: 14 }}>
        <LearningCta variant="compact" />

        {list.length ? (
          <FadeInItem>
            {/* Catalog health — each cell filters the list */}
            <InkHero style={{ padding: 16, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <ProgressRing value={readyPct / 100} size={58} thickness={6} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h2" color="paper">
                    Catalog health
                  </Text>
                  <Text variant="caption" color="paperMuted" numberOfLines={2}>
                    Avg {formatRs(avgPrice)} per unit{tieredCount ? ` · ${tieredCount} with volume tiers` : ''}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {cells.map((c) => {
                  const on = filter === c.value;
                  return (
                    <Touchable
                      key={c.value}
                      onPress={() => setFilter(on && c.value !== 'all' ? 'all' : c.value)}
                      hapticOnPress
                      scaleTo={0.95}
                      accessibilityLabel={`${c.label} ${c.count}`}
                      accessibilityState={{ selected: on }}
                      style={{
                        flex: 1,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        gap: 3,
                        borderRadius: radii.lg,
                        borderCurve: 'continuous',
                        backgroundColor: on ? 'rgba(198,220,74,0.16)' : 'rgba(250,247,240,0.06)',
                        borderWidth: 1,
                        borderColor: on ? 'rgba(198,220,74,0.45)' : 'transparent',
                      }}
                    >
                      <Row gap={5}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot ?? colors.paper }} />
                        <Text variant="caption" color={on ? 'volt' : 'paperMuted'} numberOfLines={1}>
                          {c.label}
                        </Text>
                      </Row>
                      <Text variant="h1" color="paper" tabular>
                        {c.count}
                      </Text>
                    </Touchable>
                  );
                })}
              </View>
            </InkHero>
          </FadeInItem>
        ) : null}

        <Row gap={8}>
          {(
            [
              { icon: Percent, label: 'Pricing', to: '/supplier/pricing', badge: 0 },
              { icon: Warehouse, label: 'Inventory', to: '/supplier/inventory', badge: counts.low + counts.out_of_stock },
              { icon: TrendingUp, label: 'Analytics', to: '/supplier/analytics', badge: 0 },
            ] as const
          ).map((a) => (
            <Touchable
              key={a.to}
              onPress={() => go(a.to)}
              hapticOnPress
              scaleTo={0.95}
              accessibilityLabel={a.label}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 44, borderRadius: radii.pill, backgroundColor: colors.paper, ...shadow.sm }}
            >
              <a.icon size={15} color={colors.ink2} strokeWidth={2} />
              <Text variant="caption" weight="semibold" color="ink2">
                {a.label}
              </Text>
              {a.badge ? (
                <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.copper, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'Sans-Semi', fontSize: 10, lineHeight: 12, color: colors.paper }}>{a.badge}</Text>
                </View>
              ) : null}
            </Touchable>
          ))}
        </Row>

        {list.length ? <SearchBar value={q} onChangeText={setQ} placeholder="Search commodities, SKU, brand…" /> : null}
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
    <Card kind="flat" padding={0} radius={radii['2xl']} onPress={onEdit} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: 14, padding: 14, opacity: o.active ? 1 : 0.6 }}>
        <ProductImage src={p?.imageUrl} seed={o.productId} style={{ width: 80, height: 80, borderRadius: 18, borderCurve: 'continuous' }} label={p?.unit ?? undefined} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="body" weight="semibold" numberOfLines={2}>
            {p?.name ?? 'Standard commodity'}
          </Text>
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {[productMeta(p), o.supplierSku ? `SKU ${o.supplierSku}` : null].filter(Boolean).join(' · ') || 'Standard SKU'}
          </Text>
          <Row gap={4} align="flex-end" style={{ marginTop: 2 }}>
            <Text variant="h2" tabular>
              {formatLKR(o.priceCents)}
            </Text>
            <Text variant="caption" color="ink4" style={{ marginBottom: 2 }}>
              / {unit}
            </Text>
            {tiers ? (
              <View style={{ marginLeft: 4, marginBottom: 1 }}>
                <MetaChip icon={Layers} label="Tiered" tone="volt" />
              </View>
            ) : null}
          </Row>
          {low || out ? (
            <Text variant="caption" weight="semibold" style={{ color: out ? colors.rose : colors.amber }} numberOfLines={1}>
              {out ? 'Out of stock · hidden from checkout' : free !== null ? `Running low · ${free.toLocaleString()} ${unit} left` : 'Running low · restock soon'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 14, opacity: o.active ? 1 : 0.6 }}>
        <StockChip status={o.availabilityStatus} qty={free} />
        <MetaChip label={`MOQ ${o.minOrderQty}`} />
        <MetaChip icon={Clock} label={`${o.leadTimeDays}d`} />
        <MetaChip icon={Truck} label={o.deliveryAvailable !== false ? (o.deliveryRadiusKm ? `${o.deliveryRadiusKm} km` : 'Island-wide') : 'Pickup'} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.pearl, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
        {/* Visibility toggle */}
        <Touchable
          onPress={onToggleActive}
          hapticOnPress
          scaleTo={0.95}
          accessibilityLabel={o.active ? 'Hide listing' : 'Publish listing'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingLeft: 4, paddingRight: 12, borderRadius: 18, backgroundColor: colors.paper, ...shadow.sm }}
        >
          <View style={{ width: 34, height: 22, borderRadius: 11, padding: 2, backgroundColor: o.active ? colors.mint : colors.ink6, alignItems: o.active ? 'flex-end' : 'flex-start', marginLeft: 2 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.paper }} />
          </View>
          <Text variant="caption" weight="semibold" color={o.active ? 'ink' : 'ink4'}>
            {toggling ? '…' : o.active ? 'Live' : 'Hidden'}
          </Text>
        </Touchable>
        <View style={{ flex: 1 }} />
        <CardAction icon={Zap} label="Quick edit" onPress={onQuick} accent />
        <CardAction icon={Pencil} label="" onPress={onEdit} narrow a11y="Edit listing" />
        <CardAction icon={Trash2} label="" onPress={onDelete} danger narrow a11y="Delist" />
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
  a11y,
}: {
  icon: typeof Zap;
  label: string;
  onPress: () => void;
  accent?: boolean;
  danger?: boolean;
  narrow?: boolean;
  a11y?: string;
}) {
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      scaleTo={0.95}
      accessibilityLabel={a11y ?? label}
      style={{
        width: narrow ? 36 : undefined,
        paddingHorizontal: narrow ? 0 : 14,
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 18,
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
