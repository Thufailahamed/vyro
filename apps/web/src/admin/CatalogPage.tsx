import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
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
  ArrowRightIcon,
  SparklesIcon,
  StoreIcon,
  XIcon,
} from '@/components/icons';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  CellStack,
  EmptyBlock,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
} from './ui';

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
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Commerce &amp; Supply</span>
            <span className="text-ink-5">/</span>
            <span>Catalog &amp; Taxonomy Registry</span>
          </>
        }
        title="Catalog Registry"
        description="Cross-platform product moderation, canonical classification, and category hierarchy."
      />

      <Tabs<Tab>
        items={[
          { key: 'products', label: 'Products', icon: <PackageIcon size={15} /> },
          { key: 'categories', label: 'Categories', icon: <StoreIcon size={15} />, count: categoriesCount },
          { key: 'types', label: 'Business types', icon: <SparklesIcon size={15} />, count: businessTypesCount },
        ]}
        value={tab}
        onChange={switchTab}
        ariaLabel="Catalog sections"
      />

      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'categories' ? <CategoryTreeEditor /> : null}
      {tab === 'types' ? <BusinessTypeEditor /> : null}
    </AdminPage>
  );
}

type FilterMode = 'all' | 'active' | 'inactive' | 'featured';

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

  const filtered = q.trim() !== '' || selectedCategory !== '' || filterMode !== 'all';
  const resetFilters = () => {
    setQ('');
    setSelectedCategory('');
    setFilterMode('all');
  };

  return (
    <div className="space-y-6">
      <StatGrid cols={4}>
        <StatCard label="Total products" value={metrics.total} sub="Loaded in registry" icon={<PackageIcon size={16} />} loading={query.isLoading} />
        <StatCard
          label="Active in store"
          value={metrics.activeCount}
          sub="Available for ordering"
          icon={<CheckCircleIcon size={16} />}
          tone={metrics.activeCount > 0 ? 'success' : 'neutral'}
          loading={query.isLoading}
        />
        <StatCard
          label="Featured showcase"
          value={metrics.featuredCount}
          sub="Highlighted items"
          icon={<SparklesIcon size={16} />}
          tone={metrics.featuredCount > 0 ? 'warning' : 'neutral'}
          loading={query.isLoading}
        />
        <StatCard
          label="Taxonomy categories"
          value={metrics.categoriesCount}
          sub="Classification nodes"
          icon={<StoreIcon size={16} />}
          loading={query.isLoading}
        />
      </StatGrid>

      <Tabs<FilterMode>
        items={[
          { key: 'all', label: 'All products' },
          { key: 'active', label: 'Active only' },
          { key: 'inactive', label: 'Inactive only' },
          { key: 'featured', label: 'Featured only' },
        ]}
        value={filterMode}
        onChange={setFilterMode}
        ariaLabel="Filter products"
      />

      <TableCard
        title="Product registry"
        toolbar={
          <Toolbar
            actions={
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={cn(controlClass, 'w-auto max-w-[220px]')}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            }
          >
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products by name or brand…"
                className={cn(controlClass, 'w-full pl-9 pr-8')}
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </div>
          </Toolbar>
        }
        footer={
          <>
            <span>
              Showing <strong className="text-ink">{productsList.length}</strong>{' '}
              {productsList.length === 1 ? 'product' : 'products'}
              {filtered ? ' · filters applied' : ''}
            </span>
            <span className="flex items-center gap-3">
              {filtered ? (
                <button type="button" onClick={resetFilters} className="font-semibold text-copper transition-colors hover:text-ink">
                  Reset filters
                </button>
              ) : null}
              {query.hasNextPage ? (
                <Button variant="secondary" size="sm" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
                  Load more products
                </Button>
              ) : null}
            </span>
          </>
        }
      >
        {query.isError ? (
          <Callout
            tone="danger"
            className="m-4 sm:m-6"
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
                ? 'No catalog items match the current search and filter criteria.'
                : 'There are currently no products cataloged in the system.'
            }
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset all filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product &amp; brand</th>
                <th>Category</th>
                <th>Unit &amp; pack</th>
                <th>Status</th>
                <th>Featured</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {productsList.map((p: ProductRow) => {
                const catName = categoryMap.get(p.categoryId) ?? p.categoryName ?? p.categoryId;
                const meta = [
                  p.brand ? `Brand: ${p.brand}` : undefined,
                  p.hsCode ? `HS ${p.hsCode}` : undefined,
                  p.countryOfOrigin ? `COO ${p.countryOfOrigin}` : undefined,
                  `ID: ${p.id.slice(0, 8)}`,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <tr key={p.id}>
                    <td>
                      <CellStack
                        primary={
                          <Link
                            to={`/admin/catalog/products/${p.id}`}
                            className="text-ink transition-colors hover:text-copper"
                          >
                            {p.name}
                          </Link>
                        }
                        secondary={<span className="font-mono">{meta}</span>}
                      />
                    </td>
                    <td>
                      <Pill tone="neutral">{catName}</Pill>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-ink-3">
                        {p.packSize ? `${p.packSize} · ` : ''}
                        {p.unit}
                      </span>
                    </td>
                    <td>
                      <Pill tone={p.active ? 'success' : 'neutral'} dot>
                        {p.active ? 'Active' : 'Inactive'}
                      </Pill>
                    </td>
                    <td>
                      {p.featured ? (
                        <Pill tone="brand" icon={<SparklesIcon size={11} />}>
                          Featured
                        </Pill>
                      ) : (
                        <span className="text-xs text-ink-4">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <ProductRowActions product={p} canModerate={Boolean(canModerate)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>
  );
}

function ProductRowActions({ product, canModerate }: { product: ProductRow; canModerate: boolean }) {
  const updateProduct = useUpdateProduct(product.id);
  const toggleFeatured = useToggleFeatured(product.id);

  const editLinkClass =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-colors hover:bg-ink hover:text-paper';
  const toggleClass =
    'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50';

  if (!canModerate) {
    return (
      <Link to={`/admin/catalog/products/${product.id}`} className={editLinkClass}>
        View
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
        className={cn(
          toggleClass,
          product.featured
            ? 'bg-volt-soft text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]'
            : 'text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] hover:text-ink hover:bg-bone',
        )}
      >
        <SparklesIcon size={12} />
        {product.featured ? 'Featured' : 'Feature'}
      </button>

      <button
        type="button"
        disabled={updateProduct.isPending}
        onClick={() => updateProduct.mutate({ active: !product.active, expectedUpdatedAt: product.updatedAt })}
        title={product.active ? 'Deactivate product' : 'Activate product'}
        className={cn(
          toggleClass,
          product.active
            ? 'text-rose shadow-[inset_0_0_0_1px_rgba(196,90,74,0.3)] hover:bg-rose/10'
            : 'text-mint shadow-[inset_0_0_0_1px_rgba(61,139,110,0.3)] hover:bg-mint/10',
        )}
      >
        {product.active ? 'Deactivate' : 'Activate'}
      </button>

      <Link to={`/admin/catalog/products/${product.id}`} className={editLinkClass}>
        Edit
        <ArrowRightIcon size={12} />
      </Link>
    </div>
  );
}
