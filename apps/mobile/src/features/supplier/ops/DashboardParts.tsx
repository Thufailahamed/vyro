import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { CheckCheck, Copy, ExternalLink, Inbox, Link2, Package, ShieldCheck, Sparkles, Star, ThumbsUp } from 'lucide-react-native';
import { api, qs } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { formatCompactLKR, formatDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Button, Card, IconTile, ProgressBar, Segmented, Skeleton, Text, Touchable } from '@/ui';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { go, Section } from './kit';

/* ------------------------------ Repeat offers ----------------------------- */

type RepeatOfferAnalytics = {
  triggeredCount: number;
  totalSavingsCents: number;
  byRetailer: { businessId: string; trailingSpendCents: number; triggeredAt: number }[];
};

export function useRepeatOffers(supplierId: string) {
  return useQuery({
    queryKey: ['supplier', supplierId, 'repeat-offers', 'analytics'],
    queryFn: () => api.get<RepeatOfferAnalytics>(`/supplier/repeat-offers/analytics${qs({ supplierId })}`),
    retry: false,
    refetchInterval: 60_000,
    enabled: !!supplierId,
  });
}

/** Web RepeatOfferTile — hidden when the endpoint is unavailable. */
export function RepeatOfferTile({ supplierId, dark }: { supplierId: string; dark?: boolean }) {
  const q = useRepeatOffers(supplierId);
  if (!q.data) return null;
  return (
    <Card kind={dark ? 'ink' : 'flat'} padding={16} style={{ flex: 1, minWidth: 140, gap: 12 }}>
      <IconTile icon={Sparkles} tone={dark ? 'glass' : 'success'} size={34} />
      <View style={{ gap: 3 }}>
        <Text variant="metricSm" color={dark ? 'paper' : 'ink'}>
          {q.data.triggeredCount}
        </Text>
        <Text variant="caption" weight="semibold" color={dark ? 'paperMuted' : 'ink3'} numberOfLines={1}>
          Repeat offers (30d)
        </Text>
        <Text variant="caption" color={dark ? 'paperFaint' : 'ink5'}>
          orders with discount · {formatCompactLKR(q.data.totalSavingsCents)} savings extended
        </Text>
      </View>
    </Card>
  );
}

/* --------------------------------- Reviews -------------------------------- */

type Distribution = Record<1 | 2 | 3 | 4 | 5, number>;
type ReviewSummary = { count?: number; avg?: number | null; distribution?: Distribution; lastReviewAt?: number | null };
type ReviewItem = {
  id: string;
  rating: number;
  body: string;
  createdAt: number;
  helpfulCount?: number;
  images?: { url: string }[];
  reply?: { body: string; createdAt: number } | null;
};
type ReviewSort = 'recent' | 'highest' | 'lowest';

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const n = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} color={i <= n ? colors.amber : colors.ink6} fill={i <= n ? colors.amber : 'transparent'} strokeWidth={1.6} />
      ))}
    </View>
  );
}

function HelpfulButton({ reviewId, initial }: { reviewId: string; initial: number }) {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(initial);
  const m = useMutation({
    mutationFn: () => (on ? api.del(`/reviews/${reviewId}/helpful`) : api.post(`/reviews/${reviewId}/helpful`)),
    onSuccess: () => {
      setCount((c) => c + (on ? -1 : 1));
      setOn(!on);
    },
  });
  return (
    <Touchable
      onPress={() => !m.isPending && m.mutate()}
      hapticOnPress
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        height: 30,
        borderRadius: radii.pill,
        backgroundColor: on ? colors.voltSoft : colors.paper,
        ...(on ? {} : shadow.sm),
        opacity: m.isPending ? 0.5 : 1,
      }}
    >
      <ThumbsUp size={12} color={on ? colors.voltDeep : colors.ink4} />
      <Text variant="caption" color={on ? 'voltDeep' : 'ink3'}>
        Helpful ({count})
      </Text>
    </Touchable>
  );
}

/** Buyer reviews & reputation — the web's SupplierReviewsPanel + ReviewList. */
export function ReviewsPanel({ supplierId }: { supplierId: string }) {
  const [sort, setSort] = useState<ReviewSort>('recent');
  const summary = useQuery({
    queryKey: ['supplier', supplierId, 'review-summary'],
    queryFn: () => api.get<ReviewSummary>(`/suppliers/${supplierId}/review-summary`),
    enabled: !!supplierId,
    retry: false,
  });
  const list = useInfiniteQuery({
    queryKey: ['supplier', supplierId, 'reviews', sort],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<{ reviews?: ReviewItem[]; nextCursor?: string | null }>(
        `/suppliers/${supplierId}/reviews${qs({ sort, limit: 10, cursor: pageParam })}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!supplierId,
    retry: false,
  });
  const s = summary.data;
  const count = s?.count ?? 0;
  const dist: Distribution = s?.distribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const items = (list.data?.pages ?? []).flatMap((p) => p.reviews ?? []);

  return (
    <Section icon={Star} kicker="Buyer reviews & reputation" title="Commercial reputation" sub="Verified commercial orders only">
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', padding: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="metric">{s?.avg != null ? s.avg.toFixed(1) : '—'}</Text>
            <Text variant="mono" color="ink4">
              / 5.0
            </Text>
          </View>
          <Stars value={s?.avg ?? 0} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <ShieldCheck size={13} color={colors.copper} />
            <Text variant="caption" color="ink3">
              {count > 0 ? `${count} verified ${count === 1 ? 'review' : 'reviews'}` : 'Zero buyer disputes on record'}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 5, opacity: count > 0 ? 1 : 0.4 }}>
          {([5, 4, 3, 2, 1] as const).map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.ink4, width: 14 }}>{k}★</Text>
              <ProgressBar value={dist[k] ?? 0} max={Math.max(1, count)} tone="warning" height={5} style={{ flex: 1 }} />
              <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink4, width: 20, textAlign: 'right' }}>{dist[k] ?? 0}</Text>
            </View>
          ))}
        </View>
      </View>

      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { value: 'recent', label: 'Most recent' },
          { value: 'highest', label: 'Highest' },
          { value: 'lowest', label: 'Lowest' },
        ]}
      />

      {list.isLoading ? (
        <View style={{ gap: 8 }}>
          <Skeleton height={70} radius={radii.xl} />
          <Skeleton height={70} radius={radii.xl} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ padding: 20, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.pearl, alignItems: 'center', gap: 6 }}>
          <IconTile icon={Star} tone="warning" size={44} style={{ marginBottom: 4 }} />
          <Text variant="h3">No reviews yet</Text>
          <Text variant="caption" color="ink4" align="center">
            When buyers accept deliveries and complete purchase orders, they're prompted to leave performance feedback.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((r) => (
            <View key={r.id} style={{ padding: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.pearl, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Stars value={r.rating} size={12} />
                <Text variant="mono" style={{ fontFamily: fonts.monoMedium }}>
                  {r.rating}/5
                </Text>
                <Text variant="caption" color="voltDeep">
                  VERIFIED BUYER
                </Text>
                <View style={{ flex: 1 }} />
                <Text variant="caption" color="ink4">
                  {formatDate(r.createdAt)}
                </Text>
              </View>
              <Text variant="bodySm">{r.body}</Text>
              {r.reply ? (
                <View style={{ padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.paper, gap: 3, borderLeftWidth: 3, borderLeftColor: colors.copper }}>
                  <Text variant="caption" color="copper" weight="semibold">
                    Official supplier response · {formatDate(r.reply.createdAt)}
                  </Text>
                  <Text variant="caption" color="ink3">
                    {r.reply.body}
                  </Text>
                </View>
              ) : null}
              <HelpfulButton reviewId={r.id} initial={r.helpfulCount ?? 0} />
            </View>
          ))}
          {list.hasNextPage ? (
            <Button title={list.isFetchingNextPage ? 'Loading…' : 'Load more reviews'} variant="secondary" size="sm" full onPress={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
          ) : null}
        </View>
      )}
    </Section>
  );
}

/* ------------------------------- Storefront ------------------------------- */

/** Public storefront link card (auto-assigns a slug like the web). */
export function StorefrontCard({ supplierId, supplierName, currentSlug }: { supplierId: string; supplierName?: string; currentSlug: string | null | undefined }) {
  const [autoSlug, setAutoSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (currentSlug || autoSlug || currentSlug === undefined) return;
    const clean =
      (supplierName || 'facility')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) || `supplier-${supplierId.slice(0, 8)}`;
    api
      .patch<{ slug?: string }>('/suppliers/me/slug', { slug: clean })
      .then((r) => r?.slug && setAutoSlug(r.slug))
      .catch(() => {});
  }, [currentSlug, autoSlug, supplierName, supplierId]);

  const slug = currentSlug || autoSlug || 'test';
  const url = `${WEB_URL}/suppliers/${slug}`;

  return (
    <Section icon={Package} kicker="Public commercial storefront" title="Your digital storefront" sub="Active · publicly accessible">
      <Text variant="bodySm" color="ink3">
        Buyers explore your verified credentials, live SKU pricing and send RFQs or purchase orders directly.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingRight: 14, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
        <IconTile icon={Link2} tone="ink" size={32} />
        <Text variant="mono" numberOfLines={1} style={{ flex: 1 }}>
          {url}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title={copied ? 'Link copied' : 'Copy link'}
          icon={copied ? CheckCheck : Copy}
          variant="secondary"
          size="sm"
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(url);
            haptic.success();
            setCopied(true);
            setTimeout(() => setCopied(false), 2200);
          }}
        />
        <Button title="Share" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => Share.share({ message: url, url })} />
        <Button title="View" icon={ExternalLink} size="sm" style={{ flex: 1 }} onPress={() => go(`/buyer/store/${slug}`)} />
      </View>
      <View style={{ gap: 10 }}>
        {(
          [
            [ShieldCheck, 'Verified credentials', 'Facility KYB status, city and trust seal.'],
            [Package, 'Live product catalog', 'All published SKUs with volume pricing tiers.'],
            [Inbox, 'Direct RFQ intake', 'Buyers submit quote requests straight to you.'],
          ] as const
        ).map(([Icon, t, h]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile icon={Icon} tone="paper" size={32} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="bodySm" weight="semibold">
                {t}
              </Text>
              <Text variant="caption" color="ink4">
                {h}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Section>
  );
}
