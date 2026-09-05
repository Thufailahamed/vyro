import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { BarChart, TimeSeries } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';

type SupplierAnalytics = {
  range: '7d' | '30d' | '90d';
  metrics: {
    revenueCents: number;
    ordersCount: number;
    avgOrderValueCents: number;
    repeatCustomerRate: number;
    lowStockCount: number;
    avgLeadTimeDays: number;
  };
  revenueTrend: Array<{ day: string; cents: number }>;
  ordersByDay: Array<{ day: string; count: number }>;
  topProducts: Array<{ productId: string; name: string; revenueCents: number; units: number }>;
};

export function SupplierAnalyticsPage() {
  const { supplierId } = useSupplierId();

  const analytics = useQuery({
    queryKey: ['supplier', supplierId, 'analytics'],
    queryFn: () => api.get<SupplierAnalytics>(`/analytics/supplier?supplierId=${supplierId}&range=90d`),
    retry: false,
    refetchInterval: 30_000,
  });

  const data = analytics.data;
  const trendValues = data?.revenueTrend.map((p) => p.cents) ?? [];
  const trendLabels = data?.revenueTrend.map((p) => p.day.slice(5)) ?? [];
  const orderValues = data?.ordersByDay.map((p) => p.count) ?? [];
  const orderLabels = data?.ordersByDay.map((p) => p.day.slice(5)) ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Insight"
        title="Analytics"
        sub={`Revenue, conversion, and customer mix — last ${data?.range ?? '90d'}.`}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10">
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Revenue</div>
          <MetricNumber size="md" className="mt-2">
            {((data?.metrics.revenueCents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Orders</div>
          <MetricNumber size="md" className="mt-2">{data?.metrics.ordersCount ?? 0}</MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Avg order</div>
          <MetricNumber size="md" className="mt-2">
            {((data?.metrics.avgOrderValueCents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Repeat rate</div>
          <MetricNumber size="md" className="mt-2">
            {Math.round((data?.metrics.repeatCustomerRate ?? 0) * 100)}%
          </MetricNumber>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Surface kind="elevated" className="p-6">
          <h3 className="vyro-display text-sm mb-4">Revenue trend</h3>
          <TimeSeries values={trendValues} labels={trendLabels} height={160} />
        </Surface>
        <Surface kind="elevated" className="p-6">
          <h3 className="vyro-display text-sm mb-4">Orders per day</h3>
          <TimeSeries values={orderValues} labels={orderLabels} height={160} />
        </Surface>
      </div>

      <Surface kind="elevated" className="p-6">
        <h3 className="vyro-display text-sm mb-4">Top products</h3>
        {(data?.topProducts ?? []).length === 0 ? (
          <p className="text-sm text-ink-4">No product sales yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
              <tr>
                <th className="text-left py-2 font-normal">Product</th>
                <th className="text-right py-2 font-normal">Units</th>
                <th className="text-right py-2 font-normal">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topProducts ?? []).map((p) => (
                <tr key={p.productId} className="border-t border-line">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 text-right">{p.units}</td>
                  <td className="py-2 text-right font-mono text-xs">{(p.revenueCents / 100).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}
