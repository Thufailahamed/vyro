import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ArrowRight, Clock, SearchX, ShieldCheck, Sparkles, Store } from 'lucide-react-native';
import {
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
  SearchBar,
  Select,
  SkeletonList,
  Text,
  Touchable,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { go, leadLabel, productHref, useCategories } from './data';
import { AddButton, Pill, Price, SupplierStarsLine } from './components/kit';
import { useAddToCart } from './useAddToCart';
import type { SearchHit, SearchResponse } from './types';

type SortMode = 'price_asc' | 'price_desc' | 'lead_asc' | 'offers_desc' | 'name_asc';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'price_asc', label: 'Lowest spot rate' },
  { value: 'price_desc', label: 'Highest spot rate' },
  { value: 'lead_asc', label: 'Fastest dispatch' },
  { value: 'offers_desc', label: 'Most live offers' },
  { value: 'name_asc', label: 'Product name (A–Z)' },
];

/** Catalog tab — wholesale product search with category pills, sorting and quick add. */
export function CatalogScreen() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const [searchInput, setSearchInput] = useState(params.q ?? params.category ?? '');
  const [q, setQ] = useState(params.q ?? params.category ?? '');
  const [sortBy, setSortBy] = useState<SortMode>('price_asc');
  const [fastDispatch, setFastDispatch] = useState(false);
  const { addToCart, pendingKey } = useAddToCart();
  const categories = useCategories();

  // Debounce input → query (mirrors the web's 280 ms debounce)
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Sync when navigated with ?q= (e.g. from cart "Compare") — moved to
  // useEffect so we don't setState during render (mobile-005).
  const navKey = `${params.q ?? ''}|${params.category ?? ''}`;
  useEffect(() => {
    const next = params.q ?? params.category ?? '';
    if (next !== searchInput) setSearchInput(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const search = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<SearchResponse>('/search/products' + qs({ q })),
  });

  const hits = useMemo(() => {
    const list = [...(search.data?.hits ?? [])];
    const filtered = fastDispatch ? list.filter((h) => (h.bestOffer?.leadTimeDays ?? 99) <= 2) : list;
    filtered.sort((a, b) => {
      const pA = a.bestOffer?.priceCents ?? Number.MAX_SAFE_INTEGER;
      const pB = b.bestOffer?.priceCents ?? Number.MAX_SAFE_INTEGER;
      switch (sortBy) {
        case 'price_desc':
          return pB - pA;
        case 'lead_asc':
          return (a.bestOffer?.leadTimeDays ?? 99) - (b.bestOffer?.leadTimeDays ?? 99) || pA - pB;
        case 'offers_desc':
          return b.offerCount - a.offerCount || pA - pB;
        case 'name_asc':
          return a.product.name.localeCompare(b.product.name);
        default:
          return pA - pB;
      }
    });
    return filtered;
  }, [search.data, sortBy, fastDispatch]);

  const catOptions = useMemo(() => {
    const cats = (categories.data?.categories ?? []).filter((c) => c.active !== false && c.active !== 0);
    return [{ value: '', label: 'All lots' }, ...cats.map((c) => ({ value: c.name, label: c.name }))];
  }, [categories.data]);

  const header = (
    <ListHeader>
      <ScreenHeader
        kicker="Wholesale marketplace"
        title="Direct mill & wholesale catalog"
        subtitle="Live spot rates from audited Sri Lankan mills — zero broker markups."
        right={<Button title="Ask VYRO" icon={Sparkles} variant="primary" size="sm" onPress={() => go('/buyer/ask')} />}
      />
      <Gutter style={{ gap: 12 }}>
        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Rice, sugar, tea, cement, packaging, spices…"
        />
        <ChipRow options={catOptions} value={catOptions.some((o) => o.value === q) ? q : ''} onChange={(v) => setSearchInput(v)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Select value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} title="Sort results" />
          </View>
          <Touchable
            onPress={() => setFastDispatch((v) => !v)}
            accessibilityRole="button"
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 50,
                paddingHorizontal: 16,
                borderRadius: radii.pill,
                backgroundColor: fastDispatch ? colors.ink : colors.paper,
              },
              fastDispatch ? shadow.ink : shadow.card,
            ]}
          >
            <Clock size={14} color={fastDispatch ? colors.volt : colors.ink4} />
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: fastDispatch ? colors.volt : colors.ink3 }}>≤2d</Text>
          </Touchable>
        </View>
        <Text variant="caption" color="ink4">
          {search.isLoading
            ? 'Searching lots…'
            : `${hits.length} wholesale lot${hits.length === 1 ? '' : 's'}${q ? ` matching “${q}”` : ' across the island'}`}
        </Text>
      </Gutter>
    </ListHeader>
  );

  return (
    <ListScreen
      tabBar
      data={hits}
      keyExtractor={(h) => h.product.id}
      header={header}
      onRefresh={() => search.refetch()}
      ListEmptyComponent={
        search.isLoading ? (
          <SkeletonList rows={4} height={150} />
        ) : search.isError ? (
          <ErrorState message={errorMessage(search.error)} onRetry={() => search.refetch()} />
        ) : (
          <EmptyState
            icon={SearchX}
            title={q ? `No lots match “${q}”` : 'No live lots right now'}
            message={q ? 'Try a broader term, or post an RFQ and let suppliers quote you.' : 'Check back soon — mills publish new lots daily.'}
            action={q ? { label: 'Post an RFQ', onPress: () => go('/buyer/rfqs/new') } : { label: 'Browse suppliers', onPress: () => go('/buyer/ask') }}
          />
        )
      }
      renderItem={({ item: h }) => <HitCard hit={h} adding={pendingKey === h.bestOffer?.id} onAdd={() => h.bestOffer && addToCart({ productId: h.product.id, supplierProductId: h.bestOffer.id, quantity: h.bestOffer.minOrderQty || 1, productName: h.product.name })} />}
    />
  );
}

function HitCard({ hit: h, adding, onAdd }: { hit: SearchHit; adding: boolean; onAdd: () => void }) {
  const offer = h.bestOffer;
  return (
    <Card padding={6} radius={radii['2xl']} onPress={() => go(productHref(h.product.id))}>
      {/* Lot photo — fixed height so a missing image never becomes a slab */}
      <View>
        <ProductImage src={h.product.imageUrl} seed={h.product.id} style={{ width: '100%', height: 176, borderRadius: radii.xl, borderCurve: 'continuous' }} />
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          {h.product.brand ? <Pill tone="paper" label={h.product.brand} /> : <View />}
          {h.offerCount > 0 ? <Pill tone="volt" label={`${h.offerCount} offer${h.offerCount === 1 ? '' : 's'}`} /> : null}
        </View>
        {offer?.leadTimeDays !== undefined && offer?.leadTimeDays !== null ? (
          <Pill icon={Clock} label={leadLabel(offer.leadTimeDays, true)} tone="ink" style={{ position: 'absolute', left: 10, bottom: 10 }} />
        ) : null}
        {offer ? (
          <View style={[{ position: 'absolute', right: 10, bottom: 10, borderRadius: 24 }, shadow.md]}>
            <AddButton onPress={onAdd} loading={adding} size={46} />
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10, gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Text variant="overline" color="copper" numberOfLines={1}>
            {h.product.unit}
            {h.product.packSize ? ` · ${h.product.packSize}` : ''}
          </Text>
          <Text variant="h2" numberOfLines={2} style={{ fontSize: 17, lineHeight: 22 }}>
            {h.product.name}
          </Text>
          {offer ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Store size={12} color={colors.copper} />
              <Text variant="caption" color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>
                {offer.supplier.name}
              </Text>
              {offer.supplier.verificationStatus === 'verified' ? <ShieldCheck size={12} color={colors.voltDeep} /> : null}
              <SupplierStarsLine supplierId={offer.supplier.id} />
            </View>
          ) : null}
        </View>

        {offer ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: 12,
              borderRadius: radii.lg,
              borderCurve: 'continuous',
              backgroundColor: colors.pearl,
            }}
          >
            <View style={{ gap: 2, flex: 1 }}>
              <Text variant="overline" color="ink5">
                Best spot rate
              </Text>
              <Price cents={offer.priceCents} unit={h.product.unit} size="lg" />
            </View>
            <View style={{ paddingHorizontal: 10, height: 26, borderRadius: radii.pill, backgroundColor: colors.paper, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.ink3 }}>MOQ {offer.minOrderQty}</Text>
            </View>
          </View>
        ) : (
          <View style={{ padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.amberSoft }}>
            <Text variant="caption" color="amber">
              Awaiting next lot update
            </Text>
          </View>
        )}

        <Button title="Compare offers" variant="secondary" size="sm" full iconRight={ArrowRight} onPress={() => go(productHref(h.product.id))} />
      </View>
    </Card>
  );
}
