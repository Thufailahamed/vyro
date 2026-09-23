import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Clock, MapPin, Package, ShoppingCart, Sparkles, Star, Store, TrendingUp, Truck } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
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
import { formatLKR } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import { MonoTag, go } from '../orders/kit';
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

/** Product detail — image, price stats, ranked supplier offers with qty steppers. */
export function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const businessId = useBusinessId();
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

  const product = data?.product;
  const images = product?.images ?? [];
  const heroSrc = activeImage ?? product?.imageUrl ?? images[0]?.url;

  const header = (
    <ListHeader>
      <ScreenHeader back large={false} title={product?.name ?? 'Product'} />
      <Gutter style={{ gap: 14 }}>
        {product ? (
          <>
            {/* Hero image + thumbs */}
            <ProductImage src={heroSrc} seed={product.id} style={{ width: '100%', height: 260, borderRadius: radii['2xl'] }} />
            {images.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {images.map((img, i) => {
                  const on = (activeImage ?? product.imageUrl ?? images[0]?.url) === img.url;
                  return (
                    <Touchable key={img.id} onPress={() => setActiveImage(img.url)}>
                      <ProductImage
                        src={img.url}
                        seed={`${product.id}-${i}`}
                        style={{ width: 56, height: 56, borderRadius: radii.lg, borderWidth: on ? 2 : 0, borderColor: colors.ink, opacity: on ? 1 : 0.6 }}
                      />
                    </Touchable>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* Identity */}
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="overline" color="copper">
                  {product.unit}
                </Text>
                <Text variant="caption" color="ink4">
                  · Commercial wholesale
                </Text>
              </View>
              <Text variant="displayMd">{product.name}</Text>
              {product.brand ? (
                <Text variant="caption" color="ink4">
                  Brand: <Text variant="caption" weight="semibold" color="ink">{product.brand}</Text>
                </Text>
              ) : null}
              {product.description ? (
                <Text variant="bodySm" color="ink3">
                  {product.description}
                </Text>
              ) : null}
            </View>

            {/* Price stats */}
            {(data?.priceStats.count ?? 0) > 0 ? (
              <Card kind="bone" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <View>
                  <Text variant="overline" color="ink4">
                    Starting rate from
                  </Text>
                  <Text variant="metricSm">{formatLKR(data!.priceStats.min)}</Text>
                  <Text variant="caption" color="ink4">
                    {data!.priceStats.count} live supplier quote{data!.priceStats.count === 1 ? '' : 's'}
                  </Text>
                </View>
                <MonoTag label={`${offers.length} offers`} tone="volt" />
              </Card>
            ) : null}

            {/* Benchmarks */}
            {offers.length ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {bestPrice ? (
                  <BenchCard icon={Sparkles} label="Best price" value={formatLKR(bestPrice.offer.priceCents)} sub={bestPrice.supplier.name} onPress={() => setSortBy('price_asc')} />
                ) : null}
                {fastest ? (
                  <BenchCard icon={Clock} label="Fastest" value={`${fastest.offer.leadTimeDays}d lead`} sub={fastest.supplier.name} onPress={() => setSortBy('lead_asc')} />
                ) : null}
                <BenchCard
                  icon={TrendingUp}
                  label="Spread"
                  value={maxPrice > (bestPrice?.offer.priceCents ?? 0) ? `Save ${formatLKR(maxPrice - (bestPrice?.offer.priceCents ?? 0))}` : '—'}
                  sub="vs highest quote"
                />
              </View>
            ) : null}

            {/* Auth / business gates */}
            {!user ? (
              <Banner tone="info" title="Sign in to order" message="Unlock verified trade credit, automated POs and direct dispatch." action={{ label: 'Sign in', onPress: () => go('/login') }} />
            ) : !businessId ? (
              <Banner tone="warning" title="Business profile required" message="Register your business entity to issue purchase orders." action={{ label: 'Complete profile', onPress: () => go('/onboarding/business') }} />
            ) : null}

            {businessId ? (
              <Card kind="flat" onPress={() => go('/buyer/rfqs/new')} style={{ gap: 4 }}>
                <Text variant="overline" color="ink4">
                  Large quantity?
                </Text>
                <Text variant="body" weight="semibold">
                  Need 500kg+? Request a custom supplier quote →
                </Text>
              </Card>
            ) : null}

            <ChipRow options={SORTS} value={sortBy} onChange={setSortBy} />
          </>
        ) : null}
      </Gutter>
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

function BenchCard({ icon: Icon, label, value, sub, onPress }: { icon: typeof Clock; label: string; value: string; sub: string; onPress?: () => void }) {
  return (
    <Card onPress={onPress} padding={10} style={{ flex: 1, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon size={11} color={colors.copper} />
        <Text variant="overline" color="ink4" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="bodySm" weight="semibold" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" color="ink4" numberOfLines={1}>
        {sub}
      </Text>
    </Card>
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

  return (
    <Card kind={isBestPrice ? 'elevated' : 'flat'} style={{ gap: 10, borderLeftWidth: 3, borderLeftColor: isBestPrice ? colors.volt : 'transparent' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <MonoTag label={`Rank #${row.rank}`} tone="ink" />
        {isBestPrice ? <MonoTag label="Best price" tone="volt" /> : null}
        {isValue && !isBestPrice ? <MonoTag label="Best value" tone="copper" /> : null}
        {isFastest ? <MonoTag label="Fastest" tone="mint" /> : null}
        {row.supplier.verificationStatus === 'verified' ? <MonoTag label="Verified mill" tone="mint" /> : null}
      </View>

      <Touchable onPress={() => void openStorefront(row.supplier)} accessibilityLabel={`View ${row.supplier.name} storefront`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Store size={16} color={colors.copper} />
          <Text variant="h3" numberOfLines={1} style={{ flex: 1 }}>
            {row.supplier.name}
          </Text>
        </View>
      </Touchable>
      <StarsLine supplierId={row.supplier.id} />
      {row.ranking?.reasons?.length ? (
        <Text variant="caption" style={{ color: colors.copper }}>
          #{row.ranking.rank} · {row.ranking.reasons.join(' + ')}
        </Text>
      ) : null}
      {row.supplier.address ? (
        <Text variant="caption" color="ink4" numberOfLines={1}>
          {row.supplier.address}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MapPin size={12} color={colors.copper} />
          <Text variant="caption" color="ink3">
            {[row.supplier.city, row.supplier.district].filter(Boolean).join(', ') || 'Sri Lanka'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Truck size={12} color={colors.ink4} />
          <Text variant="caption" color="ink3">
            {leadLabel(row.offer.leadTimeDays)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Package size={12} color={colors.ink4} />
          <Text variant="caption" color="ink3">
            MOQ {row.offer.minOrderQty}
          </Text>
        </View>
        <StatusBadge status={row.offer.availabilityStatus} size="sm" label={avail.label} />
        {row.offer.trackInventory && row.offer.availableQty != null ? (
          <Text variant="caption" color="ink4">
            {row.offer.availableQty} avail.
          </Text>
        ) : null}
      </View>

      {savingsVsMax > 0 ? (
        <Text variant="caption" style={{ color: colors.mint }}>
          Save {formatLKR(savingsVsMax)} per {unit} vs highest quote
        </Text>
      ) : null}
      {tiers.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {tiers.map((t, i) => (
            <MonoTag key={i} label={`${t.minQty}+ · −${t.pct}%`} tone="copper" />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 10 }}>
        <View>
          <Text variant="overline" color="ink5">
            {formatLKR(row.offer.priceCents)} / {unit}
          </Text>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink }}>{formatLKR(subtotal)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Stepper value={selectedQty} min={row.offer.minOrderQty} onChange={onQty} size="sm" />
          <Button
            title={out ? 'Out' : 'Add'}
            icon={ShoppingCart}
            size="sm"
            loading={adding}
            disabled={out}
            onPress={canOrder ? onAdd : () => go('/onboarding/business')}
          />
        </View>
      </View>
    </Card>
  );
}

function StarsLine({ supplierId }: { supplierId: string }) {
  const { avg, count } = useSupplierReviewSummary(supplierId);
  if (avg == null) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Star size={12} color={colors.copper} fill={colors.copper} />
      <Text variant="caption" color="ink3">
        {avg.toFixed(1)} ({count} review{count === 1 ? '' : 's'})
      </Text>
    </View>
  );
}
