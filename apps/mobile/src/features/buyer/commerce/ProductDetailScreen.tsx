import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { BadgeCheck, ChevronRight, Clock, FileText, MapPin, Package, ShoppingCart, Sparkles, Star, TrendingDown, Truck, type LucideIcon } from 'lucide-react-native';
import {
  Avatar,
  Banner,
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  IconButton,
  IconTile,
  ListHeader,
  ListScreen,
  ProductImage,
  ScreenHeader,
  SkeletonList,
  StatusBadge,
  Stepper,
  Text,
  Touchable,
} from '@/ui';
import { errorMessage } from '@/lib/api';
import { useAuth, useBusinessId } from '@/lib/auth';
import { formatLKR, formatRs } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { MonoTag, go } from '../orders/kit';
import { useCartCount } from '../useCartCount';
import { availabilityLabel, leadLabel, openStorefront, useProductOffers, useSupplierReviewSummary } from './data';
import { useAddToCart } from './useAddToCart';
import type { OfferRow } from './types';

type SortMode = 'recommended' | 'price_asc' | 'lead_asc' | 'moq_asc';
const SORTS: { value: SortMode; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Lowest price' },
  { value: 'lead_asc', label: 'Fastest' },
  { value: 'moq_asc', label: 'Lowest MOQ' },
];

/** Product detail — gallery, price summary, insights, ranked supplier offers with qty steppers. */
export function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const businessId = useBusinessId();
  const cartCount = useCartCount();
  const q = useProductOffers(id);
  const { addToCart, pendingKey } = useAddToCart();
  const [sortBy, setSortBy] = useState<SortMode>('recommended');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const data = q.data;
  const offers = useMemo(() => {
    const list = [...(data?.offers ?? [])];
    if (sortBy === 'price_asc') list.sort((a, b) => a.offer.priceCents - b.offer.priceCents);
    else if (sortBy === 'lead_asc') list.sort((a, b) => a.offer.leadTimeDays - b.offer.leadTimeDays);
    else if (sortBy === 'moq_asc') list.sort((a, b) => a.offer.minOrderQty - b.offer.minOrderQty);
    return list;
  }, [data?.offers, sortBy]);

  const bestPrice = useMemo(() => [...(data?.offers ?? [])].sort((a, b) => a.offer.priceCents - b.offer.priceCents)[0], [data?.offers]);
  const fastest = useMemo(() => [...(data?.offers ?? [])].sort((a, b) => a.offer.leadTimeDays - b.offer.leadTimeDays)[0], [data?.offers]);
  const value = useMemo(
    () =>
      [...(data?.offers ?? [])].sort(
        (a, b) => a.offer.priceCents * Math.max(1, a.offer.leadTimeDays) - b.offer.priceCents * Math.max(1, b.offer.leadTimeDays),
      )[0],
    [data?.offers],
  );
  const maxPrice = Math.max(0, ...(data?.offers ?? []).map((o) => o.offer.priceCents));
  const spread = maxPrice - (bestPrice?.offer.priceCents ?? 0);

  const product = data?.product;
  const images = product?.images ?? [];
  const heroSrc = activeImage ?? product?.imageUrl ?? images[0]?.url;
  const quoteCount = data?.priceStats.count ?? 0;

  const header = (
    <ListHeader>
      <ScreenHeader
        back
        kicker={product ? [product.brand, `Per ${product.unit}`].filter(Boolean).join(' · ') : undefined}
        title={product?.name ?? 'Product'}
        right={<IconButton icon={ShoppingCart} variant="surface" badge={cartCount} accessibilityLabel="Cart" onPress={() => go('/buyer/cart')} />}
      />
      {product ? (
        <Gutter style={{ gap: 20, marginTop: -6 }}>
          {/* Gallery */}
          <View style={{ gap: 10 }}>
            <View style={[{ borderRadius: radii['3xl'], borderCurve: 'continuous' }, shadow.md]}>
              <ProductImage src={heroSrc} seed={product.id} style={{ width: '100%', aspectRatio: 1.12, borderRadius: radii['3xl'], borderCurve: 'continuous' }} />
              {quoteCount ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 14,
                    bottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: 'rgba(12,14,11,0.78)',
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt }} />
                  <Text variant="caption" weight="semibold" color="paper">
                    {quoteCount} live quote{quoteCount === 1 ? '' : 's'}
                  </Text>
                </View>
              ) : null}
            </View>
            {images.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} style={{ overflow: 'visible' }}>
                {images.map((img, i) => {
                  const on = heroSrc === img.url;
                  return (
                    <Touchable
                      key={img.id}
                      onPress={() => setActiveImage(img.url)}
                      scaleTo={0.94}
                      style={{ padding: 2, borderRadius: 16, borderCurve: 'continuous', borderWidth: 2, borderColor: on ? colors.ink : 'transparent' }}
                    >
                      <ProductImage src={img.url} seed={`${product.id}-${i}`} style={{ width: 54, height: 54, borderRadius: 12, borderCurve: 'continuous', opacity: on ? 1 : 0.6 }} />
                    </Touchable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>

          {/* Price summary */}
          {quoteCount > 0 ? (
            <View style={{ gap: 2 }}>
              <Text variant="bodySm" color="ink4">
                Best spot rate
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text variant="metric" numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
                  {formatLKR(data!.priceStats.min)}
                </Text>
                <Text variant="body" color="ink4">
                  / {product.unit}
                </Text>
              </View>
              {data!.priceStats.max > data!.priceStats.min ? (
                <Text variant="caption" color="ink5">
                  Quotes range up to {formatLKR(data!.priceStats.max)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {product.description ? (
            <Text variant="body" color="ink3">
              {product.description}
            </Text>
          ) : null}

          {/* Insights — one segmented card */}
          {offers.length ? (
            <Card padding={0} radius={radii['2xl']} style={{ flexDirection: 'row' }}>
              {bestPrice ? (
                <Insight icon={Sparkles} label="Best price" value={formatRs(bestPrice.offer.priceCents)} sub={bestPrice.supplier.name} onPress={() => setSortBy('price_asc')} />
              ) : null}
              <View style={DIVIDER} />
              {fastest ? (
                <Insight icon={Clock} label="Fastest" value={leadLabel(fastest.offer.leadTimeDays, true)} sub={fastest.supplier.name} onPress={() => setSortBy('lead_asc')} />
              ) : null}
              <View style={DIVIDER} />
              <Insight icon={TrendingDown} label="You save" value={spread > 0 ? formatRs(spread) : '—'} sub="vs highest quote" tint={spread > 0 ? colors.mint : undefined} />
            </Card>
          ) : null}

          {/* Auth / business gates */}
          {!user ? (
            <Banner tone="info" title="Sign in to order" message="Unlock verified trade credit, automated POs and direct dispatch." action={{ label: 'Sign in', onPress: () => go('/login') }} />
          ) : !businessId ? (
            <Banner tone="warning" title="Business profile required" message="Register your business entity to issue purchase orders." action={{ label: 'Complete profile', onPress: () => go('/onboarding/business') }} />
          ) : null}

          {businessId ? (
            <Touchable
              onPress={() => go('/buyer/rfqs/new')}
              hapticOnPress
              scaleTo={0.98}
              accessibilityLabel="Request a custom quote"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.copperSoft }}
            >
              <IconTile icon={FileText} tone="paper" size={38} style={{ backgroundColor: colors.paper }} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySm" weight="semibold">
                  Buying 500kg or more?
                </Text>
                <Text variant="caption" color="copperDeep">
                  Request a custom supplier quote
                </Text>
              </View>
              <ChevronRight size={18} color={colors.copperDeep} />
            </Touchable>
          ) : null}

          {/* Offers heading + sort */}
          <View style={{ gap: 12, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text variant="h1">Supplier offers</Text>
              {offers.length ? (
                <Text variant="bodySm" color="ink4">
                  {offers.length}
                </Text>
              ) : null}
            </View>
            <ChipRow options={SORTS} value={sortBy} onChange={setSortBy} />
          </View>
        </Gutter>
      ) : null}
    </ListHeader>
  );

  return (
    <ListScreen
      data={offers}
      keyExtractor={(o) => o.offer.id}
      header={header}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={
        q.isLoading ? (
          <SkeletonList rows={4} height={140} />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : (
          <EmptyState icon={Package} title="No active offers" message="No live supplier quotes for this product right now." action={{ label: 'Back to catalog', onPress: () => go('/buyer/catalog') }} />
        )
      }
      renderItem={({ item: row }) => (
        <OfferCard
          row={row}
          unit={product?.unit ?? 'unit'}
          isBestPrice={row.offer.id === bestPrice?.offer.id}
          isFastest={row.offer.id === fastest?.offer.id}
          isValue={row.offer.id === value?.offer.id}
          savingsVsMax={maxPrice - row.offer.priceCents}
          selectedQty={qty[row.offer.id] ?? row.offer.minOrderQty}
          onQty={(v) => setQty((p) => ({ ...p, [row.offer.id]: Math.max(row.offer.minOrderQty, v) }))}
          adding={pendingKey === row.offer.id}
          canOrder={!!businessId}
          onAdd={() =>
            addToCart({
              productId: product?.id ?? '',
              supplierProductId: row.offer.id,
              quantity: qty[row.offer.id] ?? row.offer.minOrderQty,
              productName: product?.name,
            })
          }
        />
      )}
    />
  );
}

const DIVIDER = { width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.lineSoft, marginVertical: 14 };

function Insight({ icon: Icon, label, value, sub, onPress, tint }: { icon: LucideIcon; label: string; value: string; sub: string; onPress?: () => void; tint?: string }) {
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon size={13} color={tint ?? colors.copper} strokeWidth={2} />
        <Text variant="caption" color="ink4" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="h2" numberOfLines={1} adjustsFontSizeToFit tabular style={tint ? { color: tint } : null}>
        {value}
      </Text>
      <Text variant="caption" color="ink5" numberOfLines={1}>
        {sub}
      </Text>
    </>
  );
  const style = { flex: 1, paddingHorizontal: 14, paddingVertical: 14, gap: 4 };
  return onPress ? (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.96} accessibilityLabel={label} style={style}>
      {body}
    </Touchable>
  ) : (
    <View style={style}>{body}</View>
  );
}

function OfferCard({
  row,
  unit,
  isBestPrice,
  isFastest,
  isValue,
  savingsVsMax,
  selectedQty,
  onQty,
  adding,
  canOrder,
  onAdd,
}: {
  row: OfferRow;
  unit: string;
  isBestPrice: boolean;
  isFastest: boolean;
  isValue: boolean;
  savingsVsMax: number;
  selectedQty: number;
  onQty: (v: number) => void;
  adding: boolean;
  canOrder: boolean;
  onAdd: () => void;
}) {
  const avail = availabilityLabel(row.offer.availabilityStatus);
  const tiers = [
    { minQty: row.offer.tier1MinQty, pct: row.offer.tier1DiscountPct },
    { minQty: row.offer.tier2MinQty, pct: row.offer.tier2DiscountPct },
    { minQty: row.offer.tier3MinQty, pct: row.offer.tier3DiscountPct },
  ].filter((t): t is { minQty: number; pct: number } => (t.minQty ?? 0) > 0 && (t.pct ?? 0) > 0);
  const subtotal = row.offer.priceCents * selectedQty;
  const out = row.offer.availabilityStatus === 'out_of_stock';
  const place = [...new Set([row.supplier.city, row.supplier.district].filter(Boolean))].join(', ') || 'Sri Lanka';
  const tags = [
    isBestPrice ? { label: 'Best price', tone: 'volt' as const } : null,
    isValue && !isBestPrice ? { label: 'Best value', tone: 'copper' as const } : null,
    isFastest ? { label: 'Fastest', tone: 'mint' as const } : null,
  ].filter(Boolean) as { label: string; tone: 'volt' | 'copper' | 'mint' }[];

  return (
    <Card kind={isBestPrice ? 'elevated' : 'flat'} padding={0} radius={radii['2xl']} style={isBestPrice ? { borderWidth: 1.5, borderColor: colors.volt } : null}>
      <View style={{ padding: 16, gap: 14 }}>
        {/* Supplier */}
        <Touchable onPress={() => void openStorefront(row.supplier)} accessibilityLabel={`View ${row.supplier.name} storefront`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={row.supplier.name} size={44} tone={isBestPrice ? 'volt' : 'ink'} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {row.supplier.name}
                </Text>
                {row.supplier.verificationStatus === 'verified' ? <BadgeCheck size={16} color={colors.mint} strokeWidth={2.2} accessibilityLabel="Verified supplier" /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <StarsLine supplierId={row.supplier.id} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 }}>
                  <MapPin size={11} color={colors.ink5} />
                  <Text variant="caption" color="ink4" numberOfLines={1}>
                    {place}
                  </Text>
                </View>
              </View>
            </View>
            <ChevronRight size={18} color={colors.ink5} />
          </View>
        </Touchable>

        {tags.length || row.ranking?.reasons?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {tags.map((t) => (
              <MonoTag key={t.label} label={t.label} tone={t.tone} />
            ))}
            {row.ranking?.reasons?.length ? (
              <Text variant="caption" color="copper" numberOfLines={1} style={{ flexShrink: 1 }}>
                {row.ranking.reasons.join(' · ')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Price + facts */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text numberOfLines={1}>
              <Text variant="metricSm">{formatLKR(row.offer.priceCents)}</Text>
              <Text variant="bodySm" color="ink4">
                {' '}
                / {unit}
              </Text>
            </Text>
            {savingsVsMax > 0 ? (
              <Text variant="caption" color="mint">
                Save {formatLKR(savingsVsMax)} vs highest quote
              </Text>
            ) : null}
          </View>
          <StatusBadge status={row.offer.availabilityStatus} size="sm" label={avail.label} />
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Fact icon={Truck} label={leadLabel(row.offer.leadTimeDays)} />
          <Fact icon={Package} label={`MOQ ${row.offer.minOrderQty}`} />
          {row.offer.trackInventory && row.offer.availableQty != null ? <Fact icon={Star} label={`${row.offer.availableQty} avail.`} /> : null}
        </View>

        {tiers.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tiers.map((t, i) => (
              <MonoTag key={i} label={`${t.minQty}+ · −${t.pct}%`} tone="copper" />
            ))}
          </View>
        ) : null}
      </View>

      {/* Order bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: colors.lineSoft,
          backgroundColor: colors.pearl,
          borderBottomLeftRadius: radii['2xl'],
          borderBottomRightRadius: radii['2xl'],
          borderCurve: 'continuous',
        }}
      >
        <Stepper value={selectedQty} min={row.offer.minOrderQty} onChange={onQty} size="sm" />
        <View style={{ flex: 1 }}>
          <Button
            title={out ? 'Out of stock' : `Add · ${formatRs(subtotal)}`}
            icon={out ? undefined : ShoppingCart}
            size="sm"
            full
            variant={isBestPrice ? 'primary' : 'secondary'}
            loading={adding}
            disabled={out}
            onPress={canOrder ? onAdd : () => go('/onboarding/business')}
          />
        </View>
      </View>
    </Card>
  );
}

function Fact({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radii.pill, backgroundColor: colors.pearl }}>
      <Icon size={12} color={colors.ink4} strokeWidth={2} />
      <Text variant="caption" color="ink3" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
    </View>
  );
}

function StarsLine({ supplierId }: { supplierId: string }) {
  const { avg, count } = useSupplierReviewSummary(supplierId);
  if (avg == null) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Star size={11} color={colors.amber} fill={colors.amber} />
      <Text variant="caption" color="ink3">
        {avg.toFixed(1)} ({count})
      </Text>
    </View>
  );
}
