import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, Package, Plus } from 'lucide-react-native';
import { api , errorMessage } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { colors, radii } from '@/theme/tokens';
import { Button, Card, EmptyState, ErrorState, Kicker, ProductImage, Row, SearchBar, Text } from '@/ui';
import { productMeta, type CatalogProduct } from './api';
import { FadeInItem } from './components';

type CatalogHit = {
  product: CatalogProduct & { unit: string };
  bestOffer: { priceCents: number } | null;
  offerCount: number;
};

/** Step zero of the listing flow: find an existing SKU before creating one. */
export function CatalogPicker({
  listedByProductId,
  onSelect,
  onCreateNew,
}: {
  listedByProductId: Map<string, string>;
  onSelect: (productId: string) => void;
  onCreateNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const search = useQuery({
    queryKey: ['supplier-catalog-pick', debounced],
    queryFn: () =>
      api.get<{ hits: CatalogHit[] }>(debounced ? `/search/products?q=${encodeURIComponent(debounced)}&limit=24` : '/search/products?limit=24'),
    staleTime: 30_000,
  });
  const hits = search.data?.hits ?? [];

  return (
    <View style={{ gap: 14 }}>
      <Card kind="flat" padding={16} style={{ gap: 12 }}>
        <Row gap={12} align="flex-start">
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 12, color: colors.volt }}>1</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Kicker>Catalog</Kicker>
            <Text variant="h2">Find an existing product</Text>
            <Text variant="caption" color="ink4">
              If buyers already shop this SKU, add your mill-gate rate to it. Create a new product only when nothing matches.
            </Text>
          </View>
        </Row>
        <SearchBar value={query} onChangeText={setQuery} placeholder="White sugar, rice, tea, cement…" autoFocus />
      </Card>

      {search.isLoading || (search.isFetching && hits.length === 0) ? (
        <View style={{ paddingVertical: 28, alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.ink} />
          <Text variant="caption" color="ink4">
            Searching catalog…
          </Text>
        </View>
      ) : search.isError ? (
        <ErrorState message={errorMessage(search.error)} onRetry={() => search.refetch()} />
      ) : hits.length === 0 ? (
        <EmptyState
          icon={Package}
          title={debounced ? `No match for “${debounced}”` : 'No catalog products yet'}
          message="Create a new SKU so buyers can find this item."
          action={{ label: 'Create new product', onPress: onCreateNew }}
        />
      ) : (
        <View style={{ gap: 8 }}>
          {hits.map((hit, i) => {
            const p = hit.product;
            const listed = listedByProductId.has(p.id);
            return (
              <FadeInItem key={p.id} index={i}>
                <Card kind={listed ? 'bone' : 'flat'} padding={10} onPress={() => onSelect(p.id)}>
                  <Row gap={12}>
                    <ProductImage src={p.imageUrl} seed={p.id} style={{ width: 60, height: 60, borderRadius: radii.lg }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="semibold" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text variant="caption" color="ink4" numberOfLines={1}>
                        {productMeta(p)}
                      </Text>
                      <Text variant="caption" color="ink3" numberOfLines={1}>
                        {hit.offerCount > 0
                          ? `${hit.offerCount} live quote${hit.offerCount === 1 ? '' : 's'}${hit.bestOffer ? ` · from ${formatLKR(hit.bestOffer.priceCents)}` : ''}`
                          : 'No live quotes yet'}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 9,
                        height: 28,
                        borderRadius: radii.md,
                        justifyContent: 'center',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: listed ? colors.mintSoft : colors.ink,
                      }}
                    >
                      {listed ? <Check size={12} color={colors.mint} /> : null}
                      <Text variant="caption" weight="semibold" style={{ color: listed ? colors.mint : colors.volt }}>
                        {listed ? 'Edit rate' : 'Add rate'}
                      </Text>
                    </View>
                  </Row>
                </Card>
              </FadeInItem>
            );
          })}
          <Card kind="outline" padding={14} style={{ marginTop: 6, gap: 10 }}>
            <Text variant="bodySm" color="ink3">
              Can't find this SKU in the catalog?
            </Text>
            <Button title="Create new product" icon={Plus} variant="secondary" size="sm" onPress={onCreateNew} />
          </Card>
        </View>
      )}
    </View>
  );
}

/** Locked catalog product header shown when attaching a rate to an existing SKU. */
export function SelectedCatalogProduct({
  product,
  onChange,
}: {
  product: CatalogProduct & { unit: string };
  onChange: () => void;
}) {
  return (
    <Card kind="flat" padding={14}>
      <Row gap={12} align="flex-start">
        <ProductImage src={product.imageUrl} seed={product.id} style={{ width: 68, height: 68, borderRadius: radii.xl }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Kicker>Catalog product</Kicker>
          <Text variant="h2" numberOfLines={2}>
            {product.name}
          </Text>
          <Text variant="caption" color="ink3">
            {productMeta(product)}
          </Text>
          <Text variant="caption" color="ink4">
            Name, photos and category stay locked. Set only your wholesale terms.
          </Text>
        </View>
        <Button title="Change" variant="ghost" size="sm" onPress={onChange} />
      </Row>
    </Card>
  );
}
