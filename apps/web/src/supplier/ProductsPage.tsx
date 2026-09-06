import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Badge, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { PackageIcon, SearchIcon, Trash2Icon, Edit3Icon, AlertTriangleIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierEmptyState, SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  brand?: string | null;
  unit?: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
};

const AVAIL_TONE: Record<Offer['availabilityStatus'], 'success' | 'warning' | 'danger'> = {
  in_stock: 'success',
  low: 'warning',
  out_of_stock: 'danger',
};

const AVAIL_LABEL: Record<Offer['availabilityStatus'], string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out_of_stock: 'Out of stock',
};

export function SupplierProductsPage() {
  const { supplierId } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<Offer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Offer['availabilityStatus']>('all');

  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
  });
  const catalog = useQuery({
    queryKey: ['products', 'catalog'],
    queryFn: () => api.get<{ products: Product[] }>('/products?limit=500'),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/supplier-products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      toast.success('Listing deleted successfully');
      setPendingDelete(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to delete offer'),
  });

  const nameMap = useMemo(
    () => new Map((catalog.data?.products ?? []).map((p) => [p.id, p])),
    [catalog.data],
  );
  const list = offers.data?.offers ?? [];

  const filteredList = useMemo(() => {
    return list.filter((o) => {
      const p = nameMap.get(o.productId);
      const matchesSearch =
        !searchQuery ||
        p?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.supplierSku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p?.brand?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || o.availabilityStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [list, nameMap, searchQuery, statusFilter]);

  const inStockCount = list.filter((o) => o.availabilityStatus === 'in_stock').length;
  const lowStockCount = list.filter((o) => o.availabilityStatus === 'low').length;
  const avgPrice = list.length > 0 ? Math.round(list.reduce((acc, o) => acc + o.priceCents, 0) / list.length) : 0;

  if (offers.isLoading) return <SupplierLoadingState label="Loading catalog listings" />;
  if (offers.isError) {
    return (
      <SupplierErrorState message="Could not load products." onRetry={() => void offers.refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker="Depot Catalog"
          title="Product Listings"
          sub={`${list.length} wholesale product${list.length === 1 ? '' : 's'} published to buyers.`}
        />
        <Link to="/supplier/products/new">
          <Button variant="primary" className="shadow-soft-sm hover:brightness-105">
            + Add Product
          </Button>
        </Link>
      </header>

      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden">
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Total Published</div>
          <MetricNumber size="sm" className="mt-1">
            {list.length}
          </MetricNumber>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">In Stock</div>
          <MetricNumber size="sm" className="mt-1 text-emerald-700">
            {inStockCount}
          </MetricNumber>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Low / Depleted</div>
          <MetricNumber size="sm" className="mt-1 text-amber">
            {lowStockCount + (list.length - inStockCount - lowStockCount)}
          </MetricNumber>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Avg Rate / Unit</div>
          <MetricNumber size="sm" className="mt-1 text-ink-2">
            {formatLKR(avgPrice)}
          </MetricNumber>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, brand, or SKU…"
            className="pl-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['all', 'in_stock', 'low', 'out_of_stock'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors border ${
                statusFilter === s
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-paper text-ink-3 border-ink/10 hover:bg-mist/60'
              }`}
            >
              {s === 'all' ? 'All' : AVAIL_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
        {list.length === 0 ? (
          <SupplierEmptyState
            icon={<PackageIcon size={24} className="text-copper" />}
            title="No wholesale listings yet"
            description="Publish staple commodities, packaging, or bulk goods from the catalog to accept purchase orders."
            action={
              <Link to="/supplier/products/new">
                <Button size="sm">+ Add your first product</Button>
              </Link>
            }
          />
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-ink-4 space-y-2">
            <p className="text-sm font-medium text-ink-3">No products match your search or filter.</p>
            <p className="text-xs">Try clearing the search query or adjusting your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink text-paper">
                <tr className="text-[11px] uppercase tracking-[0.14em]">
                  <th className="text-left px-5 py-3.5 font-medium">Product / Brand</th>
                  <th className="text-left px-4 py-3.5 font-medium">SKU</th>
                  <th className="text-right px-4 py-3.5 font-medium">Base Price</th>
                  <th className="text-right px-4 py-3.5 font-medium">MOQ</th>
                  <th className="text-right px-4 py-3.5 font-medium">Lead Time</th>
                  <th className="text-left px-4 py-3.5 font-medium">Availability</th>
                  <th className="text-right px-5 py-3.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredList.map((o) => {
                  const p = nameMap.get(o.productId);
                  return (
                    <tr key={o.id} className="hover:bg-mist/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {p?.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="size-10 rounded border border-ink/10 object-cover shrink-0 bg-bone"
                            />
                          ) : (
                            <div className="size-10 rounded border border-ink/10 bg-mist/60 flex items-center justify-center text-ink-4 shrink-0">
                              <PackageIcon size={16} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-ink truncate hover:text-copper transition-colors">
                              {p?.name ?? '—'}
                            </div>
                            <div className="text-xs text-ink-4 flex items-center gap-2 mt-0.5">
                              {p?.brand && <span className="font-medium text-ink-3">{p.brand}</span>}
                              {p?.packSize && <span>· {p.packSize}</span>}
                              {p?.unit && <span className="uppercase text-[10px] bg-ink/5 px-1.5 py-0.5 rounded">{p.unit}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-ink-3">
                        {o.supplierSku ? (
                          <span className="bg-bone px-1.5 py-0.5 border border-ink/10 rounded">{o.supplierSku}</span>
                        ) : (
                          <span className="text-ink-4 italic">None</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="vyro-metric text-sm font-semibold text-ink">{formatLKR(o.priceCents)}</span>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-ink-2">
                        {o.minOrderQty}{' '}
                        <span className="text-[11px] text-ink-4 lowercase">{p?.unit ?? 'units'}</span>
                      </td>
                      <td className="px-4 py-4 text-right text-ink-2">
                        <span className="font-mono text-xs">{o.leadTimeDays}d</span>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={AVAIL_TONE[o.availabilityStatus]}>
                          {AVAIL_LABEL[o.availabilityStatus]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <Link
                            to={`/supplier/products/${o.id}/edit`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-ink/20 bg-paper text-ink hover:bg-ink hover:text-paper transition-colors rounded shadow-xs"
                          >
                            <Edit3Icon size={12} />
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(o)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-rose hover:bg-rose/10 transition-colors rounded"
                            title="Delete offer"
                          >
                            <Trash2Icon size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-offer-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
          onClick={() => !del.isPending && setPendingDelete(null)}
        >
          <div
            className="bg-paper border border-ink/20 rounded-md shadow-soft-xl max-w-md w-full p-6 space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-full bg-rose/10 flex items-center justify-center text-rose shrink-0">
                <AlertTriangleIcon size={20} />
              </div>
              <div>
                <h2 id="del-offer-title" className="font-display text-lg font-bold text-ink">
                  Remove product listing?
                </h2>
                <p className="mt-1 text-sm text-ink-3">
                  <strong className="text-ink">
                    {nameMap.get(pendingDelete.productId)?.name ?? 'This listing'}
                  </strong>{' '}
                  at {formatLKR(pendingDelete.priceCents)} will be delisted from buyer order forms.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-line">
              <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={del.isPending}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => del.mutate(pendingDelete.id)} loading={del.isPending}>
                Delist product
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
