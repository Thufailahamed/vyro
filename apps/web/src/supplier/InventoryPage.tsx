import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
};
type Product = { id: string; name: string };

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
  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
  });
  const catalog = useQuery({
    queryKey: ['products', 'catalog'],
    queryFn: () => api.get<{ products: Product[] }>('/products?limit=500'),
  });
  const nameMap = new Map((catalog.data?.products ?? []).map((p) => [p.id, p]));
  const list = offers.data?.offers ?? [];

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Offer['availabilityStatus'] }) =>
      api.patch(`/supplier-products/${id}`, { availabilityStatus: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] }),
  });

  const counts = list.reduce(
    (acc, o) => ({ ...acc, [o.availabilityStatus]: (acc[o.availabilityStatus] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <PageHeader kicker="Stock" title="Inventory" sub="Availability by SKU." />

      <div className="grid sm:grid-cols-3 gap-px bg-ink/10">
        {ORDER.map((s) => (
          <div key={s} className="bg-paper p-5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">{LABEL[s]}</div>
            <div className="text-3xl vyro-display mt-1">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <Surface kind="elevated" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
            <tr>
              <th className="text-left px-4 py-3 font-normal">Product</th>
              <th className="text-left px-4 py-3 font-normal">SKU</th>
              <th className="text-left px-4 py-3 font-normal">Current</th>
              <th className="text-left px-4 py-3 font-normal">Set status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{nameMap.get(o.productId)?.name ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{o.supplierSku ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={TONE[o.availabilityStatus]}>{LABEL[o.availabilityStatus]}</Badge>
                </td>
                <td className="px-4 py-3 space-x-2">
                  {ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={s === o.availabilityStatus || setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: o.id, status: s })}
                      className={
                        'px-2 py-1 text-[11px] border rounded-xs transition-colors ' +
                        (s === o.availabilityStatus
                          ? 'border-ink text-ink-3 cursor-default'
                          : 'border-line text-ink-2 hover:bg-ink hover:text-paper')
                      }
                    >
                      {LABEL[s]}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}
