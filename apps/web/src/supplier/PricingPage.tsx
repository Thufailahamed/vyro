import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Input, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
};
type Product = { id: string; name: string };

export function SupplierPricingPage() {
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
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ priceCents: '', minOrderQty: '', leadTimeDays: '' });
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/supplier-products/${editing}`, {
        priceCents: Number(draft.priceCents),
        minOrderQty: Number(draft.minOrderQty),
        leadTimeDays: Number(draft.leadTimeDays),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      setEditing(null);
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Save failed'),
  });

  const startEdit = (o: Offer) => {
    setEditing(o.id);
    setDraft({
      priceCents: String(o.priceCents),
      minOrderQty: String(o.minOrderQty),
      leadTimeDays: String(o.leadTimeDays),
    });
    setErr(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Pricing"
        title="Pricing tiers"
        sub="Edit per-product base prices and minimum order quantities."
      />

      <Surface kind="elevated" className="p-4">
        <p className="text-xs text-ink-4">
          Volume-break and customer-specific rate negotiation is coming soon. For now, set the base price
          and minimum order quantity per product; suppliers can quote custom deals offline.
        </p>
      </Surface>

      <Surface kind="elevated" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
            <tr>
              <th className="text-left px-4 py-3 font-normal">Product</th>
              <th className="text-left px-4 py-3 font-normal">SKU</th>
              <th className="text-right px-4 py-3 font-normal">Base price</th>
              <th className="text-right px-4 py-3 font-normal">Min qty</th>
              <th className="text-right px-4 py-3 font-normal">Lead</th>
              <th className="text-right px-4 py-3 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="border-t border-line align-middle">
                <td className="px-4 py-3 font-medium">{nameMap.get(o.productId)?.name ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{o.supplierSku ?? '—'}</td>
                {editing === o.id ? (
                  <>
                    <td className="px-2 py-2">
                      <Input value={draft.priceCents} onChange={(e) => setDraft({ ...draft, priceCents: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <Input value={draft.minOrderQty} onChange={(e) => setDraft({ ...draft, minOrderQty: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <Input value={draft.leadTimeDays} onChange={(e) => setDraft({ ...draft, leadTimeDays: e.target.value })} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button variant="primary" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending ? 'Saving…' : 'Save'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {o.priceCents.toLocaleString()}¢
                      {o.priceCents > 100_000 && <Badge variant="warning" className="ml-2">High</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">{o.minOrderQty}</td>
                    <td className="px-4 py-3 text-right">{o.leadTimeDays}d</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(o)}>
                        Edit
                      </Button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>

      {err && <p className="text-sm text-rose">{err}</p>}
    </div>
  );
}
