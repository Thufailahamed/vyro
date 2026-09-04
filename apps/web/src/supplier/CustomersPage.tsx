import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Input } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { useState } from 'react';

type Customer = {
  businessId: string;
  name: string;
  totalOrders: number;
  totalCents: number;
  lastOrderAt: number;
};

export function SupplierCustomersPage() {
  const { supplierId } = useSupplierId();
  const customers = useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/suppliers/${supplierId}/customers`),
    retry: false,
  });
  const list = customers.data?.items ?? [];
  const [q, setQ] = useState('');

  const filtered = q
    ? list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    : list;
  const sorted = [...filtered].sort((a, b) => b.totalCents - a.totalCents);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Buyers"
        title="Customers"
        sub={`${list.length} business${list.length === 1 ? '' : 'es'} have ordered from you.`}
      />

      <div className="max-w-sm">
        <Input placeholder="Search by business name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Surface kind="elevated" className="overflow-hidden">
        {sorted.length === 0 ? (
          <p className="p-10 text-center text-sm text-ink-4">No customers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
              <tr>
                <th className="text-left px-4 py-3 font-normal">Business</th>
                <th className="text-right px-4 py-3 font-normal">Orders</th>
                <th className="text-right px-4 py-3 font-normal">Lifetime spend</th>
                <th className="text-right px-4 py-3 font-normal">Last order</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.businessId} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-right">{c.totalOrders}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{(c.totalCents / 100).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-ink-3">
                    {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}
