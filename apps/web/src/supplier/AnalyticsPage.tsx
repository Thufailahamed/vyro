import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { BarChart, TimeSeries } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';

type Po = { id: string; status: string; totalCents: number; createdAt: number };
type Payment = { id: string; amountCents: number; status: string; createdAt: number };
type Customer = { businessId: string; totalOrders: number; totalCents: number; name: string };

const MONTH = 30 * 24 * 60 * 60 * 1000;
const NOW = () => Date.now();

function bucket<T extends { createdAt: number }>(items: T[], windowMs: number, pick: (t: T) => number) {
  const buckets = new Map<number, number>();
  for (let i = 5; i >= 0; i--) {
    buckets.set(NOW() - i * windowMs, 0);
  }
  for (const it of items) {
    const k = Math.floor(it.createdAt / windowMs) * windowMs;
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + pick(it));
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
}

function fmtDay(t: number) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function SupplierAnalyticsPage() {
  const { supplierId } = useSupplierId();

  const orders = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Po[] }>(`/purchase-orders?supplierId=${supplierId}`),
    retry: false,
  });
  const payments = useQuery({
    queryKey: ['supplier', supplierId, 'payments'],
    queryFn: () => api.get<{ items: Payment[] }>(`/payments?supplierId=${supplierId}`),
    retry: false,
  });
  const customers = useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/suppliers/${supplierId}/customers`),
    retry: false,
  });

  const poList = orders.data?.orders ?? [];
  const payList = payments.data?.items ?? [];
  const custList = customers.data?.items ?? [];

  const revenueTotal = payList
    .filter((p) => p.status === 'completed' || p.status === 'paid')
    .reduce((s, p) => s + p.amountCents, 0);

  const orderVolume = poList.reduce((s, p) => s + p.totalCents, 0);
  const completedCount = poList.filter((p) => p.status === 'completed' || p.status === 'delivered').length;
  const completionRate = poList.length === 0 ? 0 : Math.round((completedCount / poList.length) * 100);

  const revenueSeries = bucket(payList, MONTH, (p) => p.amountCents);
  const orderSeries = bucket(poList, MONTH, () => 1);
  const revenueValues = revenueSeries.map(([, v]) => v);
  const orderValues = orderSeries.map(([, v]) => v);
  const monthLabels = revenueSeries.map(([t]) => fmtDay(t));

  const topCustomers = [...custList].sort((a, b) => b.totalCents - a.totalCents).slice(0, 5);
  const statusMix = poList.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const statusBars = Object.entries(statusMix).map(([label, value]) => ({ label, value }));

  return (
    <div className="space-y-8">
      <PageHeader kicker="Insight" title="Analytics" sub="Revenue, conversion, and customer mix." />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10">
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Revenue</div>
          <MetricNumber size="md" className="mt-2">{(revenueTotal / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Order volume</div>
          <MetricNumber size="md" className="mt-2">{(orderVolume / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Completion</div>
          <MetricNumber size="md" className="mt-2">{completionRate}%</MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Customers</div>
          <MetricNumber size="md" className="mt-2">{custList.length}</MetricNumber>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Surface kind="elevated" className="p-6">
          <h3 className="vyro-display text-sm mb-4">Revenue, last 6 mo</h3>
          <TimeSeries values={revenueValues} labels={monthLabels} height={160} />
        </Surface>
        <Surface kind="elevated" className="p-6">
          <h3 className="vyro-display text-sm mb-4">Orders, last 6 mo</h3>
          <TimeSeries values={orderValues} labels={monthLabels} height={160} />
        </Surface>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Surface kind="elevated" className="p-6">
          <h3 className="vyro-display text-sm mb-4">Order status mix</h3>
          {statusBars.length === 0 ? (
            <p className="text-sm text-ink-4">No orders yet.</p>
          ) : (
            <BarChart data={statusBars} />
          )}
        </Surface>
        <Surface kind="elevated" className="p-6">
          <h3 className="vyro-display text-sm mb-4">Top customers</h3>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-ink-4">No customers yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
                <tr>
                  <th className="text-left py-2 font-normal">Business</th>
                  <th className="text-right py-2 font-normal">Orders</th>
                  <th className="text-right py-2 font-normal">Spend</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c) => (
                  <tr key={c.businessId} className="border-t border-line">
                    <td className="py-2">{c.name}</td>
                    <td className="py-2 text-right">{c.totalOrders}</td>
                    <td className="py-2 text-right font-mono text-xs">{(c.totalCents / 100).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Surface>
      </div>
    </div>
  );
}
