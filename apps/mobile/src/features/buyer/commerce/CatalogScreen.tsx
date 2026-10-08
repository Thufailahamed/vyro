import { useEffect, useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Check, Clock, SearchX, ShieldCheck, SlidersHorizontal, Sparkles, Zap } from 'lucide-react-native';
import {
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  ListHeader,
  ListRow,
  ListSection,
  ListScreen,
  ProductImage,
  SearchBar,
  Sheet,
  SkeletonList,
  Text,
  Touchable,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { GUTTER, colors, shadow } from '@/theme/tokens';
import { go, leadLabel, productHref, useCategories } from './data';
import { AddButton, Pill, Price, SupplierStarsLine } from './components/kit';
import { Enter } from '../orders/kit';
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
  const navKey = `${params.q ?? ''}|${params.category ?? ''}`;
  return <CatalogInner key={navKey} initialQuery={params.q ?? params.category ?? ''} />;
}

function CatalogInner({ initialQuery }: { initialQuery: string }) {
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<SortMode>('price_asc');
  const [fastDispatch, setFastDispatch] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { addToCart, pendingKey } = useAddToCart();
  const categories = useCategories();

  // Debounce input → query (mirrors the web's 280 ms debounce)
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 280);
    return () => clearTimeout(t);
  }, [searchInput]);

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

  const { width } = useWindowDimensions();
  const cardWidth = (width - GUTTER * 2 - 12) / 2;
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';
  const filtered = sortBy !== 'price_asc' || fastDispatch;

  const header = (
    <ListHeader>
      {/* Title bar */}
      <Gutter style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text variant="displayMd">Catalog</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mint }} />
            <Text variant="bodySm" color="ink4" numberOfLines={1}>
              Live spot rates · mill-direct
            </Text>
          </View>
        </View>
        <Touchable
          onPress={() => go('/buyer/ask')}
          hapticOnPress
          scaleTo={0.94}
          accessibilityLabel="Ask VYRO"
          style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 12, paddingRight: 14, borderRadius: 20, backgroundColor: colors.ink }, shadow.ink]}
        >
          <Sparkles size={15} color={colors.volt} strokeWidth={2} />
          <Text variant="bodySm" weight="semibold" color="paper">
            Ask VYRO
          </Text>
        </Touchable>
      </Gutter>

      {/* Search + filter */}
      <Gutter style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <SearchBar value={searchInput} onChangeText={setSearchInput} placeholder="Search rice, sugar, tea…" style={{ flex: 1 }} />
        <Touchable
          onPress={() => setFiltersOpen(true)}
          hapticOnPress
          scaleTo={0.92}
          accessibilityLabel="Sort and filter"
          style={[
            { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: filtered ? colors.ink : colors.paper },
            filtered ? shadow.ink : shadow.card,
          ]}
        >
          <SlidersHorizontal size={19} color={filtered ? colors.volt : colors.ink} strokeWidth={2} />
          {filtered ? (
            <View style={{ position: 'absolute', top: 11, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.volt, borderWidth: 1.5, borderColor: colors.ink }} />
          ) : null}
        </Touchable>
      </Gutter>

      {/* Categories — bleed to the screen edges */}
      <ChipRow
        options={catOptions}
        value={catOptions.some((o) => o.value === q) ? q : ''}
        onChange={(v) => setSearchInput(v)}
        style={{ paddingHorizontal: GUTTER }}
      />

      {/* Result meta */}
      <Gutter style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text variant="bodySm" color="ink4" numberOfLines={1} style={{ flexShrink: 1 }}>
          {search.isLoading ? (
            'Searching lots…'
          ) : (
            <>
              <Text variant="bodySm" weight="semibold">
                {hits.length} lot{hits.length === 1 ? '' : 's'}
              </Text>
              {q ? ` for “${q}”` : ' across the island'}
            </>
          )}
        </Text>
        <Touchable onPress={() => setFiltersOpen(true)} hapticOnPress accessibilityLabel="Change sort" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {fastDispatch ? <Zap size={12} color={colors.copper} fill={colors.copper} /> : null}
          <Text variant="bodySm" weight="semibold" color="copper">
            {sortLabel}
          </Text>
        </Touchable>
      </Gutter>
    </ListHeader>
  );

  return (
    <>
      <ListScreen
        tabBar
        data={hits}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        keyExtractor={(h) => h.product.id}
        header={header}
        onRefresh={() => search.refetch()}
        ListEmptyComponent={
          search.isLoading ? (
            <SkeletonList rows={3} height={220} />
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
        renderItem={({ item: h, index }) => (
          <Enter i={index} style={{ width: cardWidth }}>
            <HitCard
              hit={h}
              adding={pendingKey === h.bestOffer?.id}
              onAdd={() =>
                h.bestOffer && addToCart({ productId: h.product.id, supplierProductId: h.bestOffer.id, quantity: h.bestOffer.minOrderQty || 1, productName: h.product.name })
              }
            />
          </Enter>
        )}
      />

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Sort & filter" scroll>
        <View style={{ gap: 22 }}>
          <ListSection label="Sort by">
            {SORT_OPTIONS.map((o, i) => (
              <ListRow
                key={o.value}
                title={o.label}
                chevron={false}
                last={i === SORT_OPTIONS.length - 1}
                trailing={sortBy === o.value ? <Check size={18} color={colors.ink} strokeWidth={2.4} /> : undefined}
                onPress={() => {
                  setSortBy(o.value);
                  setFiltersOpen(false);
                }}
              />
            ))}
          </ListSection>
          <ListSection label="Dispatch">
            <ListRow
              icon={Clock}
              iconTone={fastDispatch ? 'volt' : 'paper'}
              title="Ships within 2 days"
              subtitle="Only show lots with fast dispatch"
              chevron={false}
              last
              trailing={<Toggle on={fastDispatch} />}
              onPress={() => setFastDispatch((v) => !v)}
            />
          </ListSection>
        </View>
      </Sheet>
    </>
  );
}

/** Minimal iOS-style switch glyph (row handles the press). */
function Toggle({ on }: { on: boolean }) {
  return (
    <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: on ? colors.ink : colors.ink6, alignItems: on ? 'flex-end' : 'flex-start' }}>
      <View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? colors.volt : colors.paper }, shadow.sm]} />
    </View>
  );
}

/** Grid product card: photo with overlays, name, supplier, price. */
function HitCard({ hit: h, adding, onAdd }: { hit: SearchHit; adding: boolean; onAdd: () => void }) {
  const offer = h.bestOffer;
  const meta = [h.product.brand, h.product.packSize].filter(Boolean).join(' · ');
  return (
    <Card padding={5} radius={22} onPress={() => go(productHref(h.product.id))} style={{ flex: 1 }}>
      <View>
        <ProductImage src={h.product.imageUrl} seed={h.product.id} style={{ width: '100%', aspectRatio: 1, borderRadius: 18, borderCurve: 'continuous' }} />
        {offer?.leadTimeDays !== undefined && offer?.leadTimeDays !== null ? (
          <Pill icon={Clock} label={leadLabel(offer.leadTimeDays, true)} tone="ink" style={{ position: 'absolute', left: 8, top: 8 }} />
        ) : null}
        {h.offerCount > 1 ? <Pill tone="volt" label={`${h.offerCount} offers`} style={{ position: 'absolute', right: 8, top: 8 }} /> : null}
        {offer ? (
          <View style={{ position: 'absolute', right: 8, bottom: 8 }}>
            <AddButton onPress={onAdd} loading={adding} size={38} />
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 7, paddingTop: 10, paddingBottom: 8, gap: 3, flex: 1 }}>
        {meta ? (
          <Text variant="caption" color="copper" numberOfLines={1} style={{ fontSize: 11 }}>
            {meta}
          </Text>
        ) : null}
        <Text variant="body" weight="semibold" numberOfLines={2} style={{ fontSize: 14.5, lineHeight: 19, minHeight: 38 }}>
          {h.product.name}
        </Text>
        {offer ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="caption" color="ink4" numberOfLines={1} style={{ flexShrink: 1 }}>
              {offer.supplier.name}
            </Text>
            {offer.supplier.verificationStatus === 'verified' ? <ShieldCheck size={11} color={colors.voltDeep} /> : null}
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {offer ? (
          <View style={{ marginTop: 8, gap: 4 }}>
            <Price cents={offer.priceCents} unit={h.product.unit} size="md" />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <Text variant="caption" color="ink5" numberOfLines={1}>
                MOQ {offer.minOrderQty}
              </Text>
              <SupplierStarsLine supplierId={offer.supplier.id} />
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.amberSoft, alignSelf: 'flex-start' }}>
            <Text variant="caption" color="amber">
              Awaiting next lot
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}
