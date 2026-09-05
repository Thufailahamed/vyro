import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, Button, ErrorBanner } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useAdminProducts,
  useAdminCategories,
  useAdminBusinessTypes,
  type ProductFilters,
  type ProductRow,
} from './useAdminCatalog';
import { CategoryTreeEditor } from './CategoryTreeEditor';
import { BusinessTypeEditor } from './BusinessTypeEditor';

type Tab = 'products' | 'categories' | 'types';

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'products';
  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Catalog" sub="Moderate products, categories, and types" />
      <nav className="flex gap-2 border-b border-ink/10">
        <TabButton active={tab === 'products'} onClick={() => switchTab('products')}>
          Products
        </TabButton>
        <TabButton active={tab === 'categories'} onClick={() => switchTab('categories')}>
          Categories
        </TabButton>
        <TabButton active={tab === 'types'} onClick={() => switchTab('types')}>
          Business types
        </TabButton>
      </nav>
      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'categories' ? <CategoryTreeEditor /> : null}
      {tab === 'types' ? <BusinessTypeEditor /> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active ? 'border-volt text-volt' : 'border-transparent text-ink-500 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function ProductsTab() {
  const canModerate = usePermission('product:moderate');
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState<boolean | undefined>(undefined);
  const filters: ProductFilters = {
    ...(q ? { q } : {}),
    ...(activeOnly !== undefined ? { active: activeOnly } : {}),
  };
  const query = useAdminProducts(filters);
  const err = query.error instanceof Error ? query.error.message : null;
  return (
    <>
      {err ? <ErrorBanner message={err} /> : null}
      <Surface>
        <div className="flex gap-2 mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <select
            value={activeOnly === undefined ? '' : activeOnly ? 'true' : 'false'}
            onChange={(e) =>
              setActiveOnly(e.target.value === '' ? undefined : e.target.value === 'true')
            }
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Active</th>
              <th className="text-left p-2">Featured</th>
              {canModerate ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {query.data?.pages.flatMap((p) => p.items).map((p: ProductRow) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">
                  <Link to={`/admin/catalog/products/${p.id}`} className="text-volt underline">
                    {p.name}
                  </Link>
                </td>
                <td className="p-2">{p.categoryId}</td>
                <td className="p-2">{p.active ? 'yes' : 'no'}</td>
                <td className="p-2">{p.featured ? '★' : '—'}</td>
                {canModerate ? <td /> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {query.hasNextPage ? (
          <div className="p-2">
            <Button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        ) : null}
      </Surface>
    </>
  );
}
