import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn, useToast } from '@vyro/ui';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useAdminProducts,
  useAdminCategories,
  useAdminBusinessTypes,
  useUpdateProduct,
  useToggleFeatured,
  type ProductFilters,
  type ProductRow,
} from './useAdminCatalog';
import { CategoryTreeEditor } from './CategoryTreeEditor';
import { BusinessTypeEditor } from './BusinessTypeEditor';
import {
  SearchIcon,
  PackageIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  SparklesIcon,
  StoreIcon,
  XIcon,
  LayersIcon,
  UsersIcon,
} from '@/components/icons';
import { AdminPage, Callout, EmptyBlock, TableSkeleton, controlClass } from './ui';
import { MetricStrip, ProductThumb, Switch } from './catalogUi';

type Tab = 'products' | 'categories' | 'types';

const TAB_META: Record<Tab, { label: string; icon: ReactNode; blurb: string }> = {
  products: {
    label: 'Products',
    icon: <PackageIcon size={15} />,
    blurb: 'Moderate canonical products, toggle storefront visibility and curate the featured showcase.',
  },
  categories: {
    label: 'Categories',
    icon: <LayersIcon size={15} />,
    blurb: 'Shape the wholesale taxonomy sellers publish into and buyers browse by.',
  },
  types: {
    label: 'Business types',
    icon: <UsersIcon size={15} />,
    blurb: 'Buyer segments used for onboarding, pricing rules and recommendations.',
  },
};

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'products';

  const categoriesQuery = useAdminCategories();
  const businessTypesQuery = useAdminBusinessTypes();
  const counts: Partial<Record<Tab, number | undefined>> = {
    categories: categoriesQuery.data?.length,
    types: businessTypesQuery.data?.length,
  };

  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  return (
    <AdminPage>
      {/* Header band */}
      <header className="relative overflow-hidden rounded-[22px] bg-ink text-paper shadow-[0_30px_70px_-40px_rgba(12,14,11,0.7)]">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-5rem] size-[26rem] rounded-full bg-volt/[0.13] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 left-[-4rem] size-80 rounded-full bg-copper/20 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(250,247,240,1)_1px,transparent_1px),linear-gradient(90deg,rgba(250,247,240,1)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_65%)]"
        />
        <div className="relative px-6 pt-7 sm:px-9 sm:pt-9">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em]">
            <span className="text-paper/40">Commerce &amp; supply</span>
            <ChevronRightIcon size={11} className="text-paper/25" />
            <span className="text-volt">Catalog registry</span>
          </nav>
          <h1 className="mt-4 font-display text-[32px] sm:text-[40px] font-bold leading-[1.05] tracking-[-0.035em]">
            Catalog
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-paper/55">{TAB_META[tab].blurb}</p>
        </div>

        <div role="tablist" aria-label="Catalog sections" className="relative mt-7 flex gap-1 overflow-x-auto px-4 sm:px-7 scrollbar-none">
          {(Object.keys(TAB_META) as Tab[]).map((key) => {
            const active = key === tab;
            const count = counts[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                className={cn(
                  'relative inline-flex h-12 shrink-0 items-center gap-2 rounded-t-xl px-4 text-[13px] font-medium transition-colors cursor-pointer',
                  active ? 'bg-bone text-ink' : 'text-paper/55 hover:text-paper hover:bg-paper/[0.05]',
                )}
              >
                <span className={active ? 'text-ink' : 'text-paper/40'}>{TAB_META[key].icon}</span>
                {TAB_META[key].label}
                {count != null && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums',
                      active ? 'bg-ink text-paper' : 'bg-paper/10 text-paper/60',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'categories' ? <CategoryTreeEditor /> : null}
      {tab === 'types' ? <BusinessTypeEditor /> : null}
    </AdminPage>
  );
}

type FilterMode = 'all' | 'active' | 'inactive' | 'featured';

const FILTERS: Array<{ key: FilterMode; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'featured', label: 'Featured' },
];

function ProductsTab() {
  const canModerate = usePermission('product:moderate');
  const [q, setQ] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const categoriesQuery = useAdminCategories();
  const categories = categoriesQuery.data ?? [];

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
      map.set(c.slug, c.name);
    }
    return map;
  }, [categories]);

  const activeOnly = filterMode === 'active' ? true : filterMode === 'inactive' ? false : undefined;
  const featuredOnly = filterMode === 'featured' ? true : undefined;

  const filters: ProductFilters = {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(selectedCategory ? { categoryId: selectedCategory } : {}),
    ...(activeOnly !== undefined ? { active: activeOnly } : {}),
    ...(featuredOnly !== undefined ? { featured: featuredOnly } : {}),
  };

  const query = useAdminProducts(filters);

  const productsList = useMemo(() => {
    return query.data?.pages.flatMap((p) => p.items) ?? [];
  }, [query.data]);

  const metrics = useMemo(() => {
    let activeCount = 0;
    let featuredCount = 0;
    for (const p of productsList) {
      if (p.active) activeCount++;
      if (p.featured) featuredCount++;
    }
    return {
      total: productsList.length,
      activeCount,
      featuredCount,
      categoriesCount: categories.length,
    };
  }, [productsList, categories]);

  const filtered = q.trim() !== '' || selectedCategory !== '' || filterMode !== 'all';
  const resetFilters = () => {
    setQ('');
    setSelectedCategory('');
    setFilterMode('all');
  };
  const ratio = (n: number) => (metrics.total > 0 ? n / metrics.total : 0);

  return (
    <div className="space-y-5">
      <MetricStrip
        loading={query.isLoading}
        items={[
          {
            label: filtered ? 'Matching products' : 'Products loaded',
            value: metrics.total,
            sub: query.hasNextPage ? 'More available — load below' : 'In the registry',
            icon: <PackageIcon size={15} />,
          },
          {
            label: 'Active in store',
            value: metrics.activeCount,
            sub: `${Math.round(ratio(metrics.activeCount) * 100)}% available for ordering`,
            icon: <CheckCircleIcon size={15} />,
            tone: 'success',
            ratio: ratio(metrics.activeCount),
          },
          {
            label: 'Featured showcase',
            value: metrics.featuredCount,
            sub: metrics.featuredCount ? 'Highlighted on the storefront' : 'Nothing featured yet',
            icon: <SparklesIcon size={15} />,
            tone: 'brand',
            ratio: ratio(metrics.featuredCount),
          },
          {
            label: 'Categories',
            value: metrics.categoriesCount,
            sub: 'Classification nodes',
            icon: <StoreIcon size={15} />,
          },
        ]}
      />

      <section className="vyro-surface overflow-hidden rounded-2xl">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-ink/[0.07] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or brand…"
                aria-label="Search products"
                className={cn(controlClass, 'h-10 w-full rounded-xl pl-10 pr-9')}
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </div>
            <div role="tablist" aria-label="Filter products" className="inline-flex shrink-0 gap-0.5 rounded-xl bg-ink/[0.05] p-1">
              {FILTERS.map((f) => {
                const active = f.key === filterMode;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilterMode(f.key)}
                    className={cn(
                      'h-8 rounded-lg px-3 text-[12px] font-medium transition-all cursor-pointer',
                      active ? 'bg-paper text-ink shadow-pop' : 'text-ink-4 hover:text-ink',
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={cn(controlClass, 'h-10 w-full rounded-xl sm:w-auto sm:min-w-[200px]')}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {query.isError ? (
          <Callout
            tone="danger"
            className="m-4 sm:m-5"
            title="Couldn't load products"
            action={
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                Retry
              </Button>
            }
          >
            {query.error instanceof Error ? query.error.message : 'The catalog API did not respond.'}
          </Callout>
        ) : null}

        {query.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : productsList.length === 0 ? (
          <EmptyBlock
            icon={<PackageIcon size={22} />}
            title="No products found"
            description={
              filtered
                ? 'No catalog items match the current search and filters.'
                : 'There are currently no products cataloged in the system.'
            }
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4">
                  <th className="py-3 pl-5 pr-3 font-medium sm:pl-6">Product</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Pack</th>
                  <th className="px-3 py-3 font-medium">In store</th>
                  <th className="px-3 py-3 font-medium text-center">Featured</th>
                  <th className="py-3 pl-3 pr-5 sm:pr-6">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
                {productsList.map((p: ProductRow) => (
                  <ProductRowView
                    key={p.id}
                    product={p}
                    categoryName={categoryMap.get(p.categoryId) ?? p.categoryName ?? p.categoryId}
                    canModerate={Boolean(canModerate)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] bg-ink/[0.015] px-5 py-3 text-[12px] text-ink-4 sm:px-6">
          <span>
            Showing <strong className="font-semibold text-ink tabular-nums">{productsList.length}</strong>{' '}
            {productsList.length === 1 ? 'product' : 'products'}
            {filtered ? ' · filtered' : ''}
          </span>
          <span className="flex items-center gap-3">
            {filtered ? (
              <button type="button" onClick={resetFilters} className="font-semibold text-ink-3 transition-colors hover:text-ink cursor-pointer">
                Reset filters
              </button>
            ) : null}
            {query.hasNextPage ? (
              <Button variant="secondary" size="sm" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
                Load more
              </Button>
            ) : null}
          </span>
        </div>
      </section>
    </div>
  );
}

function ProductRowView({
  product: p,
  categoryName,
  canModerate,
}: {
  product: ProductRow;
  categoryName: string;
  canModerate: boolean;
}) {
  const toast = useToast();
  const updateProduct = useUpdateProduct(p.id);
  const toggleFeatured = useToggleFeatured(p.id);
  const onError = (e: unknown) =>
    toast.error('Update failed', e instanceof ApiError ? e.message : 'Please refresh and try again.');
  const href = `/admin/catalog/products/${p.id}`;
  const facts = [p.brand, p.hsCode ? `HS ${p.hsCode}` : null, p.countryOfOrigin].filter(Boolean).join(' · ');

  return (
    <tr className="group transition-colors hover:bg-ink/[0.02]">
      <td className="py-3.5 pl-5 pr-3 sm:pl-6">
        <Link to={href} className="flex min-w-[240px] items-center gap-3.5">
          <ProductThumb productId={p.id} imageUrl={p.imageUrl} name={p.name} seed={p.categoryId} muted={!p.active} />
          <div className="min-w-0">
            <div
              className={cn(
                'truncate text-[14px] font-semibold transition-colors group-hover:text-copper-deep',
                p.active ? 'text-ink' : 'text-ink-4',
              )}
            >
              {p.name}
            </div>
            <div className="mt-0.5 flex items-center gap-2 truncate text-[12px] text-ink-4">
              {facts && <span className="truncate">{facts}</span>}
              {facts && <span className="text-ink-5">·</span>}
              <span className="font-mono text-[11px] text-ink-5">{p.id.slice(0, 8)}</span>
            </div>
          </div>
        </Link>
      </td>
      <td className="px-3 py-3.5">
        <span className="inline-flex whitespace-nowrap rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11px] font-medium text-ink-2">
          {categoryName}
        </span>
      </td>
      <td className="px-3 py-3.5 whitespace-nowrap text-[13px] text-ink-3">
        {p.packSize ? <span className="font-medium text-ink-2">{p.packSize}</span> : null}
        {p.packSize ? <span className="text-ink-5"> / </span> : null}
        {p.unit}
      </td>
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-2.5">
          {canModerate ? (
            <Switch
              checked={p.active}
              disabled={updateProduct.isPending}
              label={p.active ? 'Deactivate product' : 'Activate product'}
              onChange={(next) =>
                updateProduct.mutate({ active: next, expectedUpdatedAt: p.updatedAt }, { onError })
              }
            />
          ) : null}
          <span className={cn('text-[12px] font-medium', p.active ? 'text-mint' : 'text-ink-4')}>
            {p.active ? 'Active' : 'Hidden'}
          </span>
        </div>
      </td>
      <td className="px-3 py-3.5 text-center">
        {canModerate ? (
          <button
            type="button"
            disabled={toggleFeatured.isPending}
            onClick={() => toggleFeatured.mutate(!p.featured, { onError })}
            aria-pressed={p.featured}
            title={p.featured ? 'Remove from featured showcase' : 'Add to featured showcase'}
            className={cn(
              'inline-grid size-8 place-items-center rounded-lg transition-all cursor-pointer disabled:opacity-50',
              p.featured
                ? 'bg-volt text-ink shadow-[0_6px_16px_-8px_rgba(122,143,34,0.8)]'
                : 'text-ink-5 hover:bg-ink/[0.05] hover:text-ink',
            )}
          >
            <SparklesIcon size={14} />
          </button>
        ) : p.featured ? (
          <SparklesIcon size={14} className="mx-auto text-volt-deep" />
        ) : (
          <span className="text-ink-5">—</span>
        )}
      </td>
      <td className="py-3.5 pl-3 pr-5 text-right sm:pr-6">
        <Link
          to={href}
          aria-label={`${canModerate ? 'Edit' : 'View'} ${p.name}`}
          className="inline-grid size-8 place-items-center rounded-lg text-ink-4 transition-all hover:bg-ink hover:text-paper"
        >
          <ChevronRightIcon size={15} />
        </Link>
      </td>
    </tr>
  );
}
