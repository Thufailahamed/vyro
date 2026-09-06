import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Input, Button, Badge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { StoreIcon, SearchIcon, Building2Icon, CalendarIcon, ArrowRightIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierEmptyState, SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

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

  const filtered = useMemo(() => {
    return q ? list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : list;
  }, [list, q]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => b.totalCents - a.totalCents);
  }, [filtered]);

  const totalSpendCents = list.reduce((acc, c) => acc + c.totalCents, 0);
  const avgSpendCents = list.length > 0 ? Math.round(totalSpendCents / list.length) : 0;

  if (customers.isLoading) return <SupplierLoadingState label="Loading commercial buyers" />;
  if (customers.isError) {
    return (
      <SupplierErrorState
        message="Could not load customers."
        onRetry={() => void customers.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker="Enterprise Accounts"
          title="Commercial Buyers"
          sub={`${list.length} business${list.length === 1 ? '' : 'es'} have placed wholesale purchase orders with your depot.`}
        />
        <Link to="/supplier/orders">
          <Button variant="ghost" size="sm" className="gap-1">
            Orders Console →
          </Button>
        </Link>
      </header>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink/10 border border-ink/10 overflow-hidden shadow-soft-sm">
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Total Accounts</div>
          <MetricNumber size="md" className="mt-1 text-ink">
            {list.length}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-0.5">Wholesale client base</div>
        </div>

        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Total Cumulative Bookings</div>
          <MetricNumber size="md" className="mt-1 text-emerald-800">
            {formatLKR(totalSpendCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-0.5">Across all client orders</div>
        </div>

        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Average Client Spend</div>
          <MetricNumber size="md" className="mt-1 text-ink">
            {formatLKR(avgSpendCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-0.5">Per verified business</div>
        </div>
      </div>

      {/* Search Input */}
      {list.length > 0 && (
        <div className="relative max-w-sm">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            placeholder="Search by business name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      )}

      <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
        {sorted.length === 0 ? (
          <SupplierEmptyState
            icon={<StoreIcon size={24} className="text-copper" />}
            title={q ? 'No matching buyers' : 'No commercial buyers yet'}
            description={
              q
                ? 'Try searching by a different trading name.'
                : 'Commercial retail and restaurant buyers appear here automatically after their first purchase order.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                <tr>
                  <th className="text-left px-5 py-3.5 font-medium">Business Account</th>
                  <th className="text-right px-4 py-3.5 font-medium">Total Orders</th>
                  <th className="text-right px-4 py-3.5 font-medium">Lifetime Revenue</th>
                  <th className="text-right px-4 py-3.5 font-medium">Most Recent Order</th>
                  <th className="text-right px-5 py-3.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((c) => (
                  <tr key={c.businessId} className="hover:bg-mist/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded bg-mist/60 border border-ink/10 flex items-center justify-center text-ink-3 shrink-0">
                          <Building2Icon size={16} />
                        </div>
                        <div>
                          <div className="font-semibold text-ink">{c.name}</div>
                          <div className="text-xs font-mono text-ink-4">
                            ID: {c.businessId.slice(0, 10)}…
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono text-xs bg-bone px-2 py-1 border border-ink/10 rounded">
                        {c.totalOrders} {c.totalOrders === 1 ? 'order' : 'orders'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right vyro-metric text-sm font-bold text-ink">
                      {formatLKR(c.totalCents)}
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-ink-3">
                      {c.lastOrderAt ? (
                        <span className="flex items-center justify-end gap-1 font-mono">
                          <CalendarIcon size={12} className="text-ink-4" />
                          {new Date(c.lastOrderAt).toLocaleDateString()}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/supplier/orders?buyer=${c.businessId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-copper transition-colors"
                      >
                        <span>View Orders</span>
                        <ArrowRightIcon size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
