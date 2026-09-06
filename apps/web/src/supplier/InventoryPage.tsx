import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { PackageIcon, SearchIcon, CheckCircle2Icon, AlertTriangleIcon, XCircleIcon, Edit3Icon } from '@/components/icons';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierEmptyState, SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  minOrderQty: number;
  leadTimeDays: number;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
};
type Product = { id: string; name: string; brand?: string | null; unit?: string | null; imageUrl?: string | null };

const TONE = {
  in_stock: 'success' as const,
  low: 'warning' as const,
  out_of_stock: 'danger' as const,
};
const LABEL = { in_stock: 'In stock', low: 'Low stock', out_of_stock: 'Out of stock' };

const ORDER: Offer['availabilityStatus'][] = ['in_stock', 'low', 'out_of_stock'];

export function SupplierInventoryPage() {
  const { supplierId } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
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

  const nameMap = useMemo(
    () => new Map((catalog.data?.products ?? []).map((p) => [p.id, p])),
    [catalog.data],
  );
  const list = offers.data?.offers ?? [];

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Offer['availabilityStatus'] }) =>
      api.patch(`/supplier-products/${id}`, { availabilityStatus: status }),
    onSuccess: (_, variables) => {
      toast.success(`Updated stock to ${LABEL[variables.status]}`);
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
    },
  });

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

  const counts = list.reduce(
    (acc, o) => ({ ...acc, [o.availabilityStatus]: (acc[o.availabilityStatus] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  if (offers.isLoading) return <SupplierLoadingState label="Loading warehouse inventory" />;
  if (offers.isError) {
    return (
      <SupplierErrorState
        message="Could not load inventory."
        onRetry={() => void offers.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker="Depot Warehousing"
          title="Stock & Inventory Control"
          sub="Maintain real-time availability states across SKUs to prevent backorders."
        />
        <Link to="/supplier/products/new">
          <Button variant="primary">+ Add Product</Button>
        </Link>
      </header>

      {/* Stock Health Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink/10 border border-ink/10 overflow-hidden">
        <div className="bg-paper p-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-800 font-semibold">
              <CheckCircle2Icon size={14} />
              In Stock (Fulfillable)
            </div>
            <MetricNumber size="md" className="mt-1 text-ink">
              {counts.in_stock ?? 0}
            </MetricNumber>
          </div>
          <div className="text-xs text-ink-4">Ready for orders</div>
        </div>

        <div className="bg-paper p-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-amber font-semibold">
              <AlertTriangleIcon size={14} />
              Low Stock (Threshold)
            </div>
            <MetricNumber size="md" className="mt-1 text-ink">
              {counts.low ?? 0}
            </MetricNumber>
          </div>
          <div className="text-xs text-ink-4">Re-order warning</div>
        </div>

        <div className="bg-paper p-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-rose font-semibold">
              <XCircleIcon size={14} />
              Depleted / Out of Stock
            </div>
            <MetricNumber size="md" className="mt-1 text-ink">
              {counts.out_of_stock ?? 0}
            </MetricNumber>
          </div>
          <div className="text-xs text-ink-4">Hidden from checkout</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search inventory by item name, SKU…"
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
              {s === 'all' ? `All (${list.length})` : `${LABEL[s]} (${counts[s] ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
        {list.length === 0 ? (
          <SupplierEmptyState
            icon={<PackageIcon size={24} className="text-copper" />}
            title="No inventory yet"
            description="Add products to your catalog first, then update stock levels as goods move."
            action={
              <Link to="/supplier/products/new">
                <Button size="sm">+ Add product</Button>
              </Link>
            }
          />
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-ink-4 space-y-1">
            <p className="text-sm font-medium text-ink-3">No inventory items match your search.</p>
            <p className="text-xs">Try clearing the search query or adjusting your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                <tr>
                  <th className="text-left px-5 py-3.5 font-medium">Depot Commodity</th>
                  <th className="text-left px-4 py-3.5 font-medium">SKU</th>
                  <th className="text-left px-4 py-3.5 font-medium">Current Status</th>
                  <th className="text-right px-4 py-3.5 font-medium">MOQ & Lead</th>
                  <th className="text-right px-5 py-3.5 font-medium">Change Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredList.map((o) => {
                  const product = nameMap.get(o.productId);
                  return (
                    <tr key={o.id} className="hover:bg-mist/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {product?.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="size-9 rounded border border-ink/10 object-cover shrink-0"
                            />
                          ) : (
                            <div className="size-9 rounded border border-ink/10 bg-mist/60 flex items-center justify-center text-ink-4 shrink-0">
                              <PackageIcon size={14} />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-ink">{product?.name ?? '—'}</div>
                            <div className="text-xs text-ink-4">
                              {product?.brand && <span>{product.brand} · </span>}
                              <span className="uppercase text-[10px] font-mono">{product?.unit ?? 'units'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-ink-3">
                        {o.supplierSku ? (
                          <span className="bg-bone px-1.5 py-0.5 border border-ink/10 rounded">{o.supplierSku}</span>
                        ) : (
                          <span className="text-ink-4 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={TONE[o.availabilityStatus]}>{LABEL[o.availabilityStatus]}</Badge>
                      </td>
                      <td className="px-4 py-4 text-right text-xs text-ink-3">
                        <span className="font-mono">MOQ: {o.minOrderQty}</span> · <span>{o.leadTimeDays}d lead</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex rounded border border-line overflow-hidden shadow-xs">
                          {ORDER.map((s) => {
                            const isCurrent = s === o.availabilityStatus;
                            return (
                              <button
                                key={s}
                                type="button"
                                disabled={isCurrent || setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: o.id, status: s })}
                                className={
                                  'px-3 py-1.5 text-[11px] font-mono transition-colors ' +
                                  (isCurrent
                                    ? s === 'in_stock'
                                      ? 'bg-emerald-800 text-paper font-semibold cursor-default'
                                      : s === 'low'
                                        ? 'bg-amber text-paper font-semibold cursor-default'
                                        : 'bg-rose text-paper font-semibold cursor-default'
                                    : 'bg-paper text-ink-3 hover:bg-mist/70')
                                }
                              >
                                {LABEL[s]}
                              </button>
                            );
                          })}
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
    </div>
  );
}
