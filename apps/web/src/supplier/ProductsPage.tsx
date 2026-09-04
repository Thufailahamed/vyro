import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';

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

type Product = { id: string; name: string; description: string | null };

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] }),
  });

  const nameMap = new Map((catalog.data?.products ?? []).map((p) => [p.id, p]));
  const list = offers.data?.offers ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <PageHeader
          kicker="Catalog"
          title="Products"
          sub={`${list.length} active offer${list.length === 1 ? '' : 's'}.`}
        />
        <Link to="/supplier/products/new">
          <Button variant="primary">+ Add product</Button>
        </Link>
      </header>

      <Surface kind="elevated" className="overflow-hidden">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-4 space-y-3">
            <p>No products yet.</p>
            <Link to="/supplier/products/new" className="text-volt underline">
              Add your first product
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper">
              <tr className="text-[11px] uppercase tracking-[0.14em]">
                <th className="text-left px-4 py-3 font-normal">Product</th>
                <th className="text-left px-4 py-3 font-normal">SKU</th>
                <th className="text-right px-4 py-3 font-normal">Price</th>
                <th className="text-right px-4 py-3 font-normal">Min Qty</th>
                <th className="text-right px-4 py-3 font-normal">Lead</th>
                <th className="text-left px-4 py-3 font-normal">Status</th>
                <th className="text-right px-4 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const p = nameMap.get(o.productId);
                return (
                  <tr key={o.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p?.name ?? '—'}</div>
                      {p?.description && (
                        <div className="text-xs text-ink-4 truncate max-w-xs">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{o.supplierSku ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{o.priceCents.toLocaleString()}¢</td>
                    <td className="px-4 py-3 text-right">{o.minOrderQty}</td>
                    <td className="px-4 py-3 text-right">{o.leadTimeDays}d</td>
                    <td className="px-4 py-3">
                      <Badge variant={AVAIL_TONE[o.availabilityStatus]}>
                        {AVAIL_LABEL[o.availabilityStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Link to={`/supplier/products/${o.id}/edit`} className="text-xs text-volt hover:underline">
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Delete this offer?')) del.mutate(o.id);
                          }}
                          className="text-xs text-rose hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}
