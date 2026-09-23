import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderTree, ShoppingBag, Star } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  ProductImage,
  Screen,
  SearchBar,
  Segmented,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Appear, go } from '@/features/admin/platform/kit';
import { LoadMore } from '@/features/admin/ops/kit';
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
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'products', label: 'Products' }, { value: 'categories', label: 'Categories' }]} />

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
            <View style={{ gap: 10 }}>
              {rows.map((p, i) => (
                <Appear key={p.id} i={i % 10}>
                  <Card kind="flat" padding={12} onPress={() => go(`/admin/catalog/product/${p.id}`)} style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <ProductImage src={null} seed={p.id} style={{ width: 64, height: 64, borderRadius: radii.lg }} />
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text variant="h3" numberOfLines={2}>
                          {p.name}
                        </Text>
                        <Text variant="caption" color="ink4" numberOfLines={1}>
                          {[p.brand, p.categoryName, p.unit].filter(Boolean).join(' · ') || formatDate(p.createdAt)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
                      <StatusBadge status={p.active ? 'active' : 'inactive'} size="sm" />
                      {p.featured ? <StatusBadge status="featured" size="sm" /> : null}
                      <View style={{ flex: 1 }} />
                      <Button
                        title={p.featured ? 'Unfeature' : 'Feature'}
                        size="sm"
                        variant={p.featured ? 'paper' : 'volt'}
                        icon={Star}
                        loading={feature.isPending}
                        onPress={() => feature.mutate({ id: p.id, featured: !p.featured })}
                      />
                    </View>
                  </Card>
                </Appear>
              ))}
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
