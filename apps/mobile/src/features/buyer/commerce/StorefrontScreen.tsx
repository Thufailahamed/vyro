import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Award, CheckCircle2, Clock, MapPin, Package, ShieldCheck, ShoppingCart, Star, Store, Truck } from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  InkHero,
  ListHeader,
  ListScreen,
  ProductImage,
  ScreenHeader,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatLKR, timeAgo } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import { MonoTag, Section, go } from '../orders/kit';
import { availabilityLabel, leadLabel, productHref, useSupplierReviewSummary } from './data';
import { Pill } from './components/kit';
import { useAddToCart } from './useAddToCart';
import type { ReviewItem, StorefrontOffer, StorefrontResponse } from './types';

type ReviewSort = 'recent' | 'highest' | 'lowest';

/** Supplier storefront — identity, trust signals, published lots, reviews. */
export function StorefrontScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const businessId = useBusinessId();
  const { addToCart, pendingKey } = useAddToCart();
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [reviewsShown, setReviewsShown] = useState(5);

  const q = useQuery({
    queryKey: ['storefront', slug],
    queryFn: () => api.get<StorefrontResponse>(`/suppliers/by-slug/${encodeURIComponent(slug ?? '')}`),
    enabled: !!slug,
  });

  const supplier = q.data?.supplier;
  const reviewSummary = useSupplierReviewSummary(supplier?.id);

  const reviews = useQuery({
    queryKey: ['supplier-reviews', supplier?.id, sort],
    queryFn: () => api.get<{ reviews: ReviewItem[]; nextCursor?: string | null }>(`/suppliers/${supplier!.id}/reviews` + qs({ sort, limit: 10 })),
    enabled: !!supplier?.id,
  });

  const offers = q.data?.offers ?? [];
  const trust = q.data?.trustSignals;
  const sponsored = (q.data?.otherSuppliersSponsored ?? []).filter((s) => s.campaignId && s.productId).slice(0, 3);

  const header = (
    <ListHeader>
      <ScreenHeader back large={false} title={supplier?.name ?? 'Storefront'} />
      <Gutter style={{ gap: 14 }}>
        {supplier ? (
          <>
            <InkHero seed={supplier.id}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Store size={16} color={colors.volt} />
                    {supplier.businessTypeName ? (
                      <Text variant="overline" color="volt" numberOfLines={1}>
                        {supplier.businessTypeName}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="displayMd" color="paper" numberOfLines={2}>
                    {supplier.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} color={colors.paperMuted} />
                      <Text variant="caption" color="paperMuted">
                        {[supplier.city, supplier.district].filter(Boolean).join(', ') || 'Sri Lanka'}
                      </Text>
                    </View>
                    {supplier.ratingAvg != null ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Star size={12} color={colors.volt} fill={colors.volt} />
                        <Text variant="caption" color="paper">
                          {supplier.ratingAvg.toFixed(1)} ({supplier.ratingCount})
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {supplier.verificationStatus === 'verified' ? <ShieldCheck size={26} color={colors.volt} /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <MonoTag label={`${offers.length} lot${offers.length === 1 ? '' : 's'}`} tone="paper" />
                {supplier.memberSinceYear ? <MonoTag label={`Since ${supplier.memberSinceYear}`} tone="paper" /> : null}
                {supplier.trustSealed ? <MonoTag label="Trust sealed" tone="volt" /> : null}
              </View>
            </InkHero>

            {/* Trust signals */}
            {trust ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {trust.kyc ? <Badge icon={ShieldCheck} tone="success" label="KYC verified" /> : null}
                {trust.onTimePct != null ? <Badge icon={Truck} tone="info" label={`${Math.round(trust.onTimePct)}% on-time`} /> : null}
                {trust.disputeFree ? <Badge icon={CheckCircle2} tone="success" label="Dispute-free" /> : null}
                {trust.memberSinceYear ? <Badge icon={Award} tone="copper" label={`Member since ${trust.memberSinceYear}`} /> : null}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text variant="h2">Published lots</Text>
              <Text variant="caption" color="ink4">
                {offers.length} active SKU{offers.length === 1 ? '' : 's'}
              </Text>
            </View>
          </>
        ) : null}
      </Gutter>
    </ListHeader>
  );

  return (
    <ListScreen
      data={offers}
      keyExtractor={(o) => o.id}
      header={header}
      onRefresh={() => Promise.all([q.refetch(), reviewSummary.refetch(), reviews.refetch()])}
      ListEmptyComponent={
        q.isLoading ? (
          <SkeletonList rows={4} height={110} />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : (
          <EmptyState icon={Package} title="No published lots" message="This supplier hasn't listed active SKUs yet." action={{ label: 'Browse catalog', onPress: () => go('/buyer/catalog') }} />
        )
      }
      renderItem={({ item: o }) => (
        <OfferTile
          offer={o}
          adding={pendingKey === o.id}
          canOrder={!!businessId}
          onAdd={() =>
            addToCart({
              productId: o.productId,
              supplierProductId: o.id,
              quantity: o.minOrderQty ?? 1,
              productName: o.productName ?? undefined,
            })
          }
        />
      )}
      ListFooterComponent={
        supplier ? (
          <View style={{ gap: 14, marginTop: 8 }}>
            {/* Reviews */}
            <Section icon={Star} kicker="Commercial track record" title="Buyer reviews" sub={reviewSummary.count ? `${reviewSummary.avg?.toFixed(1) ?? '—'} / 5 · ${reviewSummary.count} verified purchase review${reviewSummary.count === 1 ? '' : 's'}` : 'No reviews yet'}>
              {reviewSummary.count ? (
                <View style={{ gap: 4 }}>
                  {([5, 4, 3, 2, 1] as const).map((star) => (
                    <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text variant="caption" color="ink4" style={{ width: 16 }}>
                        {star}★
                      </Text>
                      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.mist, overflow: 'hidden' }}>
                        <View style={{ height: 6, backgroundColor: colors.volt, width: `${reviewSummary.count ? (reviewSummary.distribution[star] / reviewSummary.count) * 100 : 0}%` }} />
                      </View>
                      <Text variant="caption" color="ink4" style={{ width: 24, textAlign: 'right' }}>
                        {reviewSummary.distribution[star]}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <ChipRow
                options={[
                  { value: 'recent' as const, label: 'Recent' },
                  { value: 'highest' as const, label: 'Highest' },
                  { value: 'lowest' as const, label: 'Lowest' },
                ]}
                value={sort}
                onChange={setSort}
              />
              {(reviews.data?.reviews ?? []).slice(0, reviewsShown).map((r) => (
                <View key={r.id} style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={12} color={s <= r.rating ? colors.copper : colors.ink6} fill={s <= r.rating ? colors.copper : 'transparent'} />
                      ))}
                    </View>
                    <Text variant="caption" color="ink5">
                      {timeAgo(r.createdAt)}
                    </Text>
                  </View>
                  {r.body ? <Text variant="bodySm" color="ink3">{r.body}</Text> : null}
                  {r.reply ? (
                    <View style={{ backgroundColor: colors.bone, borderRadius: radii.lg, padding: 10, gap: 2 }}>
                      <Text variant="caption" weight="semibold" color="copper">
                        Supplier response
                      </Text>
                      <Text variant="caption" color="ink3">
                        {r.reply.body}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ))}
              {(reviews.data?.reviews ?? []).length > reviewsShown ? (
                <Button title="Show more reviews" variant="ghost" size="sm" onPress={() => setReviewsShown((n) => n + 10)} />
              ) : null}
            </Section>

            {/* Safeguards */}
            <Card kind="bone" style={{ gap: 10 }}>
              <Text variant="overline" color="copper">
                Wholesale procurement guarantee
              </Text>
              {[
                'Payments held in escrow until delivery confirmation.',
                'Direct bulk RFQ negotiation and freight dispatch.',
                'Automated 3-way reconciliation with tax invoices.',
              ].map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                  <ShieldCheck size={14} color={colors.mint} />
                  <Text variant="caption" color="ink3" style={{ flex: 1 }}>
                    {t}
                  </Text>
                </View>
              ))}
            </Card>

            {/* Sponsored */}
            {sponsored.length ? (
              <Section kicker="Promoted" title="Sponsored products" icon={Award}>
                {sponsored.map((s) => (
                  <Touchable key={s.slotId} onPress={() => go(productHref(s.productId!))} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                    <Text variant="bodySm" weight="medium">
                      Sponsored product
                    </Text>
                    <Text variant="caption" color="ink4">
                      Slot #{s.position}
                    </Text>
                  </Touchable>
                ))}
              </Section>
            ) : null}
          </View>
        ) : null
      }
    />
  );
}

function OfferTile({ offer: o, adding, canOrder, onAdd }: { offer: StorefrontOffer; adding: boolean; canOrder: boolean; onAdd: () => void }) {
  const avail = availabilityLabel(o.availabilityStatus);
  return (
    <Card padding={0} style={{ overflow: 'hidden' }} onPress={() => go(productHref(o.productId))}>
      <View>
        <ProductImage src={o.productImage} seed={o.productId} style={{ width: '100%', height: 132 }} />
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          {o.brand ? <Pill label={o.brand} /> : <View />}
          {o.leadTimeDays != null ? <Pill icon={Clock} label={leadLabel(o.leadTimeDays, true)} tone="ink" /> : null}
        </View>
      </View>
      <View style={{ padding: 12, gap: 6 }}>
          <Text variant="body" weight="semibold" numberOfLines={2}>
            {o.productName ?? 'Product'}
          </Text>
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {[o.packSize, o.categoryName].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <StatusBadge status={o.availabilityStatus} size="sm" label={avail.label} />
            {o.minOrderQty ? (
              <Text variant="caption" color="ink4">
                MOQ {o.minOrderQty}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: colors.ink }}>
              {formatLKR(o.priceCents)}
              <Text variant="caption" color="ink4">
                {' '}
                / {o.unit ?? 'unit'}
              </Text>
            </Text>
            <Button title="Add" icon={ShoppingCart} size="sm" loading={adding} disabled={o.availabilityStatus === 'out_of_stock'} onPress={canOrder ? onAdd : () => go('/onboarding/business')} />
          </View>
        </View>
    </Card>
  );
}
