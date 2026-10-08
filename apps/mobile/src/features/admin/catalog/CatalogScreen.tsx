import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderTree, ShoppingBag, Star } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import {
  Card,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  ProductImage,
  Screen,
  SearchBar,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import { Appear, go } from '@/features/admin/platform/kit';
import { LoadMore, TileTabs } from '@/features/admin/ops/kit';
import { useDebounced } from '@/features/admin/ops/kit/hooks';

interface ProductRow {
  id: string;
  name: string;
  categoryName?: string | null;
  brand: string | null;
  unit: string;
  active: boolean;
  featured: boolean;
  createdAt: number;
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

type Tab = 'products' | 'categories';

/** Mirrors web CatalogPage (GET /admin/products, /admin/categories). */
export function CatalogScreen() {
  const [tab, setTab] = useState<Tab>('products');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);
  const toast = useToast();
  const qc = useQueryClient();

  const products = useInfiniteQuery({
    queryKey: ['admin-products', { q: debounced }],
    queryFn: ({ pageParam }) =>
      api.get<{ items: ProductRow[]; nextCursor: string | null }>(
        '/admin/products' + qs({ q: debounced || undefined, cursor: (pageParam as string | undefined) ?? undefined, limit: 30 }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: tab === 'products',
  });
  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<CategoryRow[]>('/admin/categories'),
    enabled: tab === 'categories',
  });
  const feature = useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) => api.post(`/admin/products/${id}/feature`, { featured }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success('Catalog updated');
    },
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });

  const rows = (products.data?.pages ?? []).flatMap((p) => p.items ?? []);

  return (
    <Screen
      back
      kicker="Catalog"
      title="Marketplace"
      subtitle="Products, categories and merchandising."
      onRefresh={() => (tab === 'products' ? products.refetch() : categories.refetch())}
    >
      <TileTabs<Tab>
        value={tab}
        onChange={setTab}
        columns={2}
        options={[
          { value: 'products', label: 'Products', hint: 'Listings & features', icon: ShoppingBag },
          { value: 'categories', label: 'Categories', hint: 'Taxonomy', icon: FolderTree },
        ]}
      />

      {tab === 'products' ? (
        <>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search products…" />
          {products.isLoading ? (
            <SkeletonList rows={6} height={92} />
          ) : products.isError ? (
            <ErrorState message={errorMessage(products.error)} onRetry={() => products.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No products" message="Try a different search." />
          ) : (
            <View style={{ gap: 12 }}>
              <Text variant="caption" weight="semibold" color="ink4" style={{ marginLeft: 4 }}>
                {rows.length}
                {products.hasNextPage ? '+' : ''} products · {rows.filter((p) => p.featured).length} featured · {rows.filter((p) => !p.active).length} inactive
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {rows.map((p, i) => (
                  <Appear key={p.id} i={i % 10} style={{ width: '47.5%', flexGrow: 1 }}>
                    <Card kind="flat" padding={8} onPress={() => go(`/admin/catalog/product/${p.id}`)} style={{ gap: 10 }}>
                      <Animated.View sharedTransitionTag={`admin-product-${p.id}`} style={{ aspectRatio: 1, borderRadius: radii.lg, overflow: 'hidden', opacity: p.active ? 1 : 0.55 }}>
                        <ProductImage src={null} seed={p.id} style={{ flex: 1 }} />
                      </Animated.View>
                      <Touchable
                        onPress={() => feature.mutate({ id: p.id, featured: !p.featured })}
                        hapticOnPress
                        scaleTo={0.88}
                        accessibilityLabel={p.featured ? 'Unfeature product' : 'Feature product'}
                        style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: p.featured ? colors.volt : 'rgba(255,253,249,0.92)' }}
                      >
                        {feature.isPending && feature.variables?.id === p.id ? (
                          <ActivityIndicator size="small" color={colors.ink} />
                        ) : (
                          <Star size={15} color={colors.ink} fill={p.featured ? colors.ink : 'transparent'} strokeWidth={2} />
                        )}
                      </Touchable>
                      <View style={{ gap: 4, paddingHorizontal: 4, paddingBottom: 4 }}>
                        <Text variant="bodySm" weight="semibold" numberOfLines={2} style={{ minHeight: 38 }}>
                          {p.name}
                        </Text>
                        <Text variant="caption" color="ink5" numberOfLines={1}>
                          {[p.brand, p.categoryName].filter(Boolean).join(' · ') || p.unit || formatDate(p.createdAt)}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                          <StatusBadge status={p.active ? 'active' : 'inactive'} size="sm" />
                        </View>
                      </View>
                    </Card>
                  </Appear>
                ))}
              </View>
              <LoadMore hasMore={!!products.hasNextPage} loading={products.isFetchingNextPage} onPress={() => products.fetchNextPage()} />
              {products.isFetchingNextPage ? <ActivityIndicator color={colors.ink} /> : null}
            </View>
          )}
        </>
      ) : (
        <>
          {categories.isLoading ? (
            <SkeletonList rows={5} height={64} />
          ) : categories.isError ? (
            <ErrorState message={errorMessage(categories.error)} onRetry={() => categories.refetch()} />
          ) : (categories.data ?? []).length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No categories" message="Categories appear here once created." />
          ) : (
            <View style={{ gap: 8 }}>
              <Text variant="overline" color="ink4" style={{ marginLeft: 6 }}>
                Taxonomy · {(categories.data ?? []).length} categories
              </Text>
              <ListCard>
                {(categories.data ?? []).map((c, i, arr) => (
                  <ListRow
                    key={c.id}
                    title={c.name}
                    subtitle={humanize(c.slug)}
                    icon={FolderTree}
                    iconTone={c.active ? 'copper' : 'paper'}
                    trailing={<StatusBadge status={c.active ? 'active' : 'inactive'} size="sm" />}
                    last={i === arr.length - 1}
                  />
                ))}
              </ListCard>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
