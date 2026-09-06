import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { TimeSeries, BarChart } from '@vyro/ui';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { TrendingUpIcon, ShoppingCartIcon, ClockIcon, AlertCircleIcon, UsersIcon } from '@/components/icons';

type Range = '7d' | '30d' | '90d';

type SupplierAnalytics = {
  range: Range;
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

const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '90d', label: 'Last 90 Days' },
];

export function SupplierAnalyticsPage() {
  const { supplierId } = useSupplierId();
  const [range, setRange] = useState<Range>('90d');

  const analytics = useQuery({
    queryKey: ['supplier', supplierId, 'analytics', range],
    queryFn: () =>
      api.get<SupplierAnalytics>(`/analytics/supplier?supplierId=${supplierId}&range=${range}`),
    retry: false,
    refetchInterval: 30_000,
  });

  if (analytics.isLoading) return <SupplierLoadingState label="Computing supplier analytics" />;
  if (analytics.isError) {
    return (
      <SupplierErrorState
        message="Could not load analytics."
        onRetry={() => void analytics.refetch()}
      />
    );
  }

  const data = analytics.data;
  const trendValues = data?.revenueTrend.map((p) => p.cents) ?? [];
  const trendLabels = data?.revenueTrend.map((p) => p.day.slice(5)) ?? [];
  const orderValues = data?.ordersByDay.map((p) => p.count) ?? [];
  const orderLabels = data?.ordersByDay.map((p) => p.day.slice(5)) ?? [];
  const topBarData = (data?.topProducts ?? []).slice(0, 6).map((p) => ({
    label: p.name.length > 14 ? `${p.name.slice(0, 12)}…` : p.name,
    value: p.revenueCents,
  }));

  const totalProductRev = (data?.topProducts ?? []).reduce((acc, p) => acc + p.revenueCents, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker="Performance Intelligence"
          title="Analytics & Demand Insights"
          sub={`Commercial order flow, revenue velocity, and product sales mix.`}
        />
        <div className="flex gap-1 border border-ink/10 p-1 bg-paper rounded shadow-xs">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={
                'px-3 py-1.5 text-xs font-mono tracking-wider transition-colors rounded ' +
                (r.id === range ? 'bg-ink text-paper font-semibold' : 'text-ink-3 hover:text-ink')
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Matrix */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden shadow-soft-sm">
        <div className="bg-ink text-paper p-6 relative overflow-hidden grain">
          <div className="absolute inset-0 opacity-25 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(198,220,74,0.3),transparent_60%)]" />
          <div className="relative">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-volt font-bold flex items-center gap-1.5">
              <TrendingUpIcon size={13} />
              Booked Revenue
            </div>
            <MetricNumber size="md" className="mt-2 text-paper">
              {formatCompactLKR(data?.metrics.revenueCents ?? 0)}
            </MetricNumber>
            <div className="text-xs font-mono text-paper/50 mt-1">
              {formatLKR(data?.metrics.revenueCents ?? 0)}
            </div>
          </div>
        </div>

        <div className="bg-paper p-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <ShoppingCartIcon size={13} />
            Total POs Fulfilled
          </div>
          <MetricNumber size="md" className="mt-2 text-ink">
            {data?.metrics.ordersCount ?? 0}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-1">Purchase orders in period</div>
        </div>

        <div className="bg-paper p-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">
            Average Order Value (AOV)
          </div>
          <MetricNumber size="md" className="mt-2 text-ink">
            {formatCompactLKR(data?.metrics.avgOrderValueCents ?? 0)}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-1 font-mono">
            {formatLKR(data?.metrics.avgOrderValueCents ?? 0)} / order
          </div>
        </div>

        <div className="bg-paper p-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <UsersIcon size={13} />
            Repeat Buyer Rate
          </div>
          <MetricNumber size="md" className="mt-2 text-ink">
            {Math.round((data?.metrics.repeatCustomerRate ?? 0) * 100)}%
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-1">Returning commercial buyers</div>
        </div>
      </div>

      {/* Secondary Operational Metrics */}
      <div className="grid sm:grid-cols-2 gap-px bg-ink/10 border border-ink/10 overflow-hidden">
        <div className="bg-paper p-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <AlertCircleIcon size={13} className="text-amber" />
              Low Stock Depletion Alerts
            </div>
            <MetricNumber size="sm" className="mt-1 text-ink">
              {data?.metrics.lowStockCount ?? 0} SKUs
            </MetricNumber>
          </div>
          <span className="text-xs text-ink-4">Require replenishment</span>
        </div>

        <div className="bg-paper p-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <ClockIcon size={13} className="text-copper" />
              Average Dispatch Lead Time
            </div>
            <MetricNumber size="sm" className="mt-1 text-ink">
              {data?.metrics.avgLeadTimeDays ?? 0}
              <span className="text-sm font-sans font-normal text-ink-4 ml-1">days turnaround</span>
            </MetricNumber>
          </div>
          <span className="text-xs text-ink-4">From PO to dock pickup</span>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Surface kind="elevated" className="p-6 border border-ink/10 shadow-soft-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="vyro-display text-base font-semibold text-ink">Revenue Velocity</h3>
            <span className="text-xs font-mono text-ink-4 uppercase">{range} trend</span>
          </div>
          {trendValues.length === 0 ? (
            <p className="text-sm text-ink-4 py-12 text-center">No revenue recorded in this window.</p>
          ) : (
            <TimeSeries values={trendValues} labels={trendLabels} height={170} />
          )}
        </Surface>

        <Surface kind="elevated" className="p-6 border border-ink/10 shadow-soft-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="vyro-display text-base font-semibold text-ink">Order Volume Distribution</h3>
            <span className="text-xs font-mono text-ink-4 uppercase">Daily POs</span>
          </div>
          {orderValues.length === 0 ? (
            <p className="text-sm text-ink-4 py-12 text-center">No purchase orders in this window.</p>
          ) : (
            <TimeSeries values={orderValues} labels={orderLabels} height={170} />
          )}
        </Surface>
      </div>

      {/* Product Revenue Breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Surface kind="elevated" className="p-6 border border-ink/10 shadow-soft-sm">
          <h3 className="vyro-display text-base font-semibold text-ink mb-4">Top Products by Revenue</h3>
          {topBarData.length === 0 ? (
            <p className="text-sm text-ink-4 py-8">No product sales data in this period.</p>
          ) : (
            <BarChart
              data={topBarData}
              height={190}
              tone="amber"
              formatValue={(v) => formatCompactLKR(v)}
            />
          )}
        </Surface>

        <Surface kind="elevated" className="p-6 overflow-hidden border border-ink/10 shadow-soft-sm">
          <h3 className="vyro-display text-base font-semibold text-ink mb-4">SKU Performance Breakdown</h3>
          {(data?.topProducts ?? []).length === 0 ? (
            <p className="text-sm text-ink-4 py-8">No product sales yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-mist/30 text-[11px] uppercase tracking-[0.14em] text-ink-4">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium">Commodity</th>
                    <th className="text-right py-2.5 px-3 font-medium">Units Sold</th>
                    <th className="text-right py-2.5 px-3 font-medium">Revenue (LKR)</th>
                    <th className="text-right py-2.5 px-3 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(data?.topProducts ?? []).map((p) => {
                    const sharePct = totalProductRev > 0 ? Math.round((p.revenueCents / totalProductRev) * 100) : 0;
                    return (
                      <tr key={p.productId} className="hover:bg-mist/20 transition-colors">
                        <td className="py-3 px-3 font-semibold text-ink">{p.name}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs">{p.units}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs font-bold text-ink">
                          {formatLKR(p.revenueCents)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="font-mono text-xs text-ink-3">{sharePct}%</span>
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
    </div>
  );
}
