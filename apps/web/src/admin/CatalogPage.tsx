import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Surface, Button, ErrorBanner, EmptyState } from '@/components/ui';
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
  AlertCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  StoreIcon,
} from '@/components/icons';

type Tab = 'products' | 'categories' | 'types';

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'products';

  const categoriesQuery = useAdminCategories();
  const businessTypesQuery = useAdminBusinessTypes();
  const categoriesCount = categoriesQuery.data?.length;
  const businessTypesCount = businessTypesQuery.data?.length;

  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <p className="vyro-kicker flex items-center gap-1.5 text-ink-4">
            <span>COMMERCE & SUPPLY</span>
            <span>/</span>
            <span>CATALOG & TAXONOMY REGISTRY</span>
          </p>
          <h1 className="vyro-display text-3xl font-bold tracking-tight text-ink mt-0.5">
            Catalog Registry
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Cross-platform product moderation, canonical classification, and category hierarchy.
          </p>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-ink/10">
        <TabButton active={tab === 'products'} onClick={() => switchTab('products')}>
          <span className="flex items-center gap-1.5">
            <PackageIcon size={14} />
            <span>Products</span>
          </span>
        </TabButton>
        <TabButton active={tab === 'categories'} onClick={() => switchTab('categories')} count={categoriesCount}>
          <span className="flex items-center gap-1.5">
            <StoreIcon size={14} />
            <span>Categories</span>
          </span>
        </TabButton>
        <TabButton active={tab === 'types'} onClick={() => switchTab('types')} count={businessTypesCount}>
          <span className="flex items-center gap-1.5">
            <SparklesIcon size={14} />
            <span>Business types</span>
          </span>
        </TabButton>
      </div>

      {/* Tab Contents */}
      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'categories' ? <CategoryTreeEditor /> : null}
      {tab === 'types' ? <BusinessTypeEditor /> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-xs font-mono font-semibold transition-all border-b-2 -mb-px flex items-center gap-2 ${
        active
          ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
          : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
      }`}
    >
      {children}
      {count !== undefined && (
        <span
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
            active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-ink-4'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ProductsTab() {
  const canModerate = usePermission('product:moderate');
  const [q, setQ] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'inactive' | 'featured'>('all');

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
  const err = query.error instanceof Error ? query.error.message : null;

  const productsList = useMemo(() => {
    return query.data?.pages.flatMap((p) => p.items) ?? [];
  }, [query.data]);

  // Aggregate Metrics
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

  return (
    <div className="space-y-6">
      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Total Products</span>
            <PackageIcon size={16} className="text-ink-3" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.total}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Loaded in registry</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Active in Store</span>
            <CheckCircleIcon size={16} className="text-mint" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-mint tracking-tight">
            {metrics.activeCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Available for ordering</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Featured Showcase</span>
            <SparklesIcon size={16} className="text-copper" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-copper-deep tracking-tight">
            {metrics.featuredCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Highlighted items</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Taxonomy Categories</span>
            <StoreIcon size={16} className="text-ink-3" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.categoriesCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Classification nodes</div>
        </Surface>
      </div>

      {/* Filter Bar & Search */}
      <Surface className="p-3.5 border border-ink/10 bg-paper space-y-3">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Products' },
            { id: 'active', label: 'Active Only' },
            { id: 'inactive', label: 'Inactive Only' },
            { id: 'featured', label: 'Featured Only' },
          ].map((tab) => {
            const isActive = filterMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id as typeof filterMode)}
                className={`px-3 py-1.5 text-xs font-mono font-medium transition-all whitespace-nowrap border ${
                  isActive
                    ? 'bg-ink text-paper border-ink shadow-sm'
                    : 'bg-transparent text-ink-3 border-transparent hover:border-ink/15 hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-ink/5">
          {/* Keyword Search */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products by name or brand…"
              className="w-full h-9 pl-9 pr-8 text-xs bg-sand/30 border border-ink/15 focus:outline-none focus:border-ink focus:bg-paper transition"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink text-xs"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Dropdown & Counter */}
          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-ink-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-4 uppercase font-mono">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-9 px-2 text-xs font-mono bg-sand/30 border border-ink/15 focus:outline-none focus:border-ink bg-paper max-w-[200px]"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <span className="font-mono text-ink-4">
              <strong>{productsList.length}</strong> items
            </span>
          </div>
        </div>
      </Surface>

      {/* Error Banner */}
      {err && <ErrorBanner message={err} />}

      {/* Products Table */}
      <Surface className="border border-ink/10 bg-paper overflow-hidden shadow-sm">
        {query.isLoading ? (
          <div className="divide-y divide-ink/5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-ink/10 rounded w-1/3" />
                  <div className="h-3 bg-ink/5 rounded w-1/4" />
                </div>
                <div className="h-4 bg-ink/10 rounded w-1/6" />
                <div className="h-4 bg-ink/10 rounded w-1/6" />
                <div className="h-6 bg-ink/10 rounded w-16" />
              </div>
            ))}
          </div>
        ) : productsList.length === 0 ? (
          <EmptyState
            icon={<PackageIcon size={24} />}
            title="No products found"
            description={
              q || selectedCategory || filterMode !== 'all'
                ? 'No catalog items match your search and filter criteria.'
                : 'There are currently no products cataloged in the system.'
            }
            action={
              q || selectedCategory || filterMode !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    setSelectedCategory('');
                    setFilterMode('all');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold bg-ink text-paper hover:bg-ink-2 transition"
                >
                  Reset all filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-sand/30 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Product Name & Brand</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Unit & Pack</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Featured</th>
                  <th className="py-3 px-4 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {productsList.map((p: ProductRow) => {
                  const catName = categoryMap.get(p.categoryId) ?? p.categoryName ?? p.categoryId;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-sand/20 transition-colors group"
                    >
                      {/* Name & Brand */}
                      <td className="py-3.5 px-4">
                        <Link
                          to={`/admin/catalog/products/${p.id}`}
                          className="font-semibold text-ink text-sm hover:text-copper hover:underline transition-colors block"
                        >
                          {p.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-4">
                          {p.brand && <span>Brand: {p.brand}</span>}
                          {p.brand && <span>•</span>}
                          <span className="font-mono text-[10px]">ID: {p.id.slice(0, 8)}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium bg-sand/60 border border-ink/10 text-ink rounded">
                          {catName}
                        </span>
                      </td>

                      {/* Unit & Pack */}
                      <td className="py-3.5 px-4 font-mono text-ink-3">
                        {p.packSize ? `${p.packSize} • ` : ''}{p.unit}
                      </td>

                      {/* Active Status Badge */}
                      <td className="py-3.5 px-4">
                        {p.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-mint/15 text-mint border border-mint/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-mist text-ink-4 border border-line">
                            <span className="w-1.5 h-1.5 rounded-full bg-ink-4" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Featured Badge */}
                      <td className="py-3.5 px-4">
                        {p.featured ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold text-copper-deep bg-copper/15 border border-copper/25">
                            ★ Featured
                          </span>
                        ) : (
                          <span className="text-ink-4 text-xs font-mono">—</span>
                        )}
                      </td>

                      {/* Moderation Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <ProductRowActions product={p} canModerate={Boolean(canModerate)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Infinite Query Load More */}
        {query.hasNextPage ? (
          <div className="p-4 border-t border-ink/10 text-center bg-sand/10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="font-mono text-xs"
            >
              {query.isFetchingNextPage ? 'Loading more products…' : 'Load More Products ↓'}
            </Button>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}

function ProductRowActions({ product, canModerate }: { product: ProductRow; canModerate: boolean }) {
  const updateProduct = useUpdateProduct(product.id);
  const toggleFeatured = useToggleFeatured(product.id);

  if (!canModerate) {
    return (
      <Link
        to={`/admin/catalog/products/${product.id}`}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium border border-ink/15 bg-paper hover:bg-ink hover:text-paper transition"
      >
        <span>View</span>
        <ArrowRightIcon size={12} />
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        disabled={toggleFeatured.isPending}
        onClick={() => toggleFeatured.mutate(!product.featured)}
        title={product.featured ? 'Remove from featured showcase' : 'Add to featured showcase'}
        className={`px-2 py-1 text-[11px] font-mono border transition ${
          product.featured
            ? 'bg-amber/10 border-amber/30 text-amber hover:bg-amber/20'
            : 'border-ink/15 text-ink-3 hover:text-ink hover:bg-sand/30'
        }`}
      >
        {product.featured ? '★ Featured' : '☆ Feature'}
      </button>

      <button
        type="button"
        disabled={updateProduct.isPending}
        onClick={() => updateProduct.mutate({ active: !product.active, expectedUpdatedAt: product.updatedAt })}
        title={product.active ? 'Deactivate product' : 'Activate product'}
        className={`px-2 py-1 text-[11px] font-mono border transition ${
          product.active
            ? 'border-ink/15 text-rose hover:bg-rose/10 hover:border-rose/30'
            : 'bg-mint/10 border-mint/30 text-mint hover:bg-mint/20'
        }`}
      >
        {product.active ? 'Deactivate' : 'Activate'}
      </button>

      <Link
        to={`/admin/catalog/products/${product.id}`}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium bg-ink text-paper hover:bg-ink-2 transition"
      >
        <span>Edit</span>
        <ArrowRightIcon size={12} />
      </Link>
    </div>
  );
}

