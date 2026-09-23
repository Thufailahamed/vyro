import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Star } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  ProductImage,
  Screen,
  SearchBar,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Appear, go } from '@/features/admin/platform/kit';
import { LoadMore, Section } from '@/features/admin/ops/kit';
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
      <ChipRow<Tab> value={tab} onChange={setTab} options={[{ value: 'products', label: 'Products' }, { value: 'categories', label: 'Categories' }]} />

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
                  <Card kind="flat" padding={12} onPress={() => go(`/admin/catalog/product/${p.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <ProductImage src={null} seed={p.id} style={{ width: 52, height: 52, borderRadius: 10 }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="semibold" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text variant="caption" color="ink4" numberOfLines={1}>
                        {[p.brand, p.categoryName, p.unit].filter(Boolean).join(' · ') || formatDate(p.createdAt)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                        <StatusBadge status={p.active ? 'active' : 'inactive'} size="sm" />
                        {p.featured ? <StatusBadge status="featured" size="sm" /> : null}
                      </View>
                    </View>
                    <Button
                      title={p.featured ? 'Unfeat.' : 'Feature'}
                      size="sm"
                      variant={p.featured ? 'secondary' : 'volt'}
                      icon={p.featured ? undefined : Star}
                      loading={feature.isPending}
                      onPress={() => feature.mutate({ id: p.id, featured: !p.featured })}
                    />
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
            <Section kicker={`${(categories.data ?? []).length} categories`} title="Taxonomy">
              <View style={{ gap: 8 }}>
                {(categories.data ?? []).map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text variant="caption" color="ink4" numberOfLines={1}>
                      {humanize(c.slug)}
                    </Text>
                    <StatusBadge status={c.active ? 'active' : 'inactive'} size="sm" />
                  </View>
                ))}
              </View>
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}
