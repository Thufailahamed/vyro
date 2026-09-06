import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { TimeSeries, BarChart } from '@vyro/ui';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import {
  TrendingUpIcon,
  ShoppingCartIcon,
  ClockIcon,
  AlertCircleIcon,
  UsersIcon,
  RefreshCwIcon,
  PackageIcon,
  ArrowRightIcon,
  PercentIcon,
  BanknoteIcon,
} from '@/components/icons';
import { useToast } from '@vyro/ui';

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
  const toast = useToast();

  const analytics = useQuery({
    queryKey: ['supplier', supplierId, 'analytics', range],
    queryFn: () =>
      api.get<SupplierAnalytics>(`/analytics/supplier?supplierId=${supplierId}&range=${range}`),
    retry: false,
    refetchInterval: 30_000,
  });

  const handleRefresh = async () => {
    toast.info('Recalculating performance analytics…');
    await analytics.refetch();
    toast.success('Analytics metrics synchronized');
  };

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
  const totalOrders = data?.metrics.ordersCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            Performance Intelligence · Demand Forecasting
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Analytics & Demand Insights
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Commercial order flow, revenue velocity, and product sales mix across Sri Lanka.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Badge
            variant="neutral"
            className="gap-1.5 font-mono text-xs bg-paper border border-ink/10 shadow-xs py-1.5 px-3"
          >
            {totalOrders > 0 ? (
              <>
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-ink">Live Order Flow</span>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-amber" />
                <span className="font-semibold text-ink">Awaiting First Orders</span>
              </>
            )}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={analytics.isFetching}
            className="text-xs gap-1.5"
            title="Recalculate performance analytics"
          >
            <RefreshCwIcon size={14} className={analytics.isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Time Range Selector */}
          <div className="flex gap-1 border border-ink/10 p-1 bg-paper rounded-md shadow-xs">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors rounded ${
                  r.id === range
                    ? 'bg-ink text-paper font-semibold shadow-xs'
                    : 'text-ink-3 hover:text-ink hover:bg-mist/60'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Unified 6-Card Executive Performance Matrix */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-ink/10 border border-ink/10 overflow-hidden rounded-lg shadow-soft-sm">
        <div className="bg-paper p-5 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <TrendingUpIcon size={13} className="text-copper" />
            Booked Revenue
          </div>
          <MetricNumber size="md" className="text-ink">
            {formatCompactLKR(data?.metrics.revenueCents ?? 0)}
          </MetricNumber>
          <div className="text-xs font-mono text-ink-4 truncate">
            {formatLKR(data?.metrics.revenueCents ?? 0)}
          </div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <ShoppingCartIcon size={13} className="text-copper" />
            Fulfilled POs
          </div>
          <MetricNumber size="md" className="text-ink">
            {data?.metrics.ordersCount ?? 0}
          </MetricNumber>
          <div className="text-xs text-ink-4">Purchase orders in period</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <BanknoteIcon size={13} className="text-copper" />
            Average Order (AOV)
          </div>
          <MetricNumber size="md" className="text-ink">
            {formatCompactLKR(data?.metrics.avgOrderValueCents ?? 0)}
          </MetricNumber>
          <div className="text-xs text-ink-4 font-mono">
            {formatLKR(data?.metrics.avgOrderValueCents ?? 0)} / PO
          </div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <UsersIcon size={13} className="text-copper" />
            Repeat Buyer Rate
          </div>
          <MetricNumber size="md" className="text-emerald-800">
            {Math.round((data?.metrics.repeatCustomerRate ?? 0) * 100)}%
          </MetricNumber>
          <div className="text-xs text-ink-4">Returning commercial buyers</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <AlertCircleIcon size={13} className="text-amber" />
            Depletion Alerts
          </div>
          <MetricNumber size="md" className={data?.metrics.lowStockCount ? 'text-amber' : 'text-ink-4'}>
            {data?.metrics.lowStockCount ?? 0} SKUs
          </MetricNumber>
          <div className="text-xs text-ink-4">Require replenishment</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
            <ClockIcon size={13} className="text-copper" />
            Dispatch Lead Time
          </div>
          <MetricNumber size="md" className="text-ink">
            {data?.metrics.avgLeadTimeDays ?? 0}d
          </MetricNumber>
          <div className="text-xs text-ink-4">Average dock pickup turnaround</div>
        </div>
      </div>

      {/* Trajectory Charts Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Surface kind="elevated" className="p-6 border border-ink/10 rounded-lg shadow-soft-sm bg-paper">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="vyro-display text-base font-semibold text-ink">Revenue Velocity</h3>
              <p className="text-xs text-ink-4">Gross invoiced wholesale order value over time.</p>
            </div>
            <span className="text-xs font-mono text-ink-4 uppercase bg-mist/60 px-2 py-0.5 rounded border border-ink/10">
              {range} trend
            </span>
          </div>
          {trendValues.length === 0 || trendValues.every((v) => v === 0) ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <div className="size-10 rounded-full bg-mist/60 border border-ink/10 flex items-center justify-center text-ink-4">
                <TrendingUpIcon size={18} />
              </div>
              <p className="text-xs font-medium text-ink-3">No revenue recorded in this {range} window.</p>
              <p className="text-[11px] text-ink-4 max-w-xs">
                Invoiced revenue plots here as purchase orders complete and funds disburse from escrow.
              </p>
            </div>
          ) : (
            <TimeSeries values={trendValues} labels={trendLabels} height={180} />
          )}
        </Surface>

        <Surface kind="elevated" className="p-6 border border-ink/10 rounded-lg shadow-soft-sm bg-paper">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="vyro-display text-base font-semibold text-ink">Order Volume Distribution</h3>
              <p className="text-xs text-ink-4">Number of purchase orders booked by enterprise clients.</p>
            </div>
            <span className="text-xs font-mono text-ink-4 uppercase bg-mist/60 px-2 py-0.5 rounded border border-ink/10">
              Daily POs
            </span>
          </div>
          {orderValues.length === 0 || orderValues.every((v) => v === 0) ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <div className="size-10 rounded-full bg-mist/60 border border-ink/10 flex items-center justify-center text-ink-4">
                <ShoppingCartIcon size={18} />
              </div>
              <p className="text-xs font-medium text-ink-3">No purchase orders recorded in this {range} window.</p>
              <p className="text-[11px] text-ink-4 max-w-xs">
                Daily procurement counts will chart here automatically as buyers submit checkout requests.
              </p>
            </div>
          ) : (
            <TimeSeries values={orderValues} labels={orderLabels} height={180} />
          )}
        </Surface>
      </div>

      {/* Product Revenue & SKU Breakdown Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Surface kind="elevated" className="p-6 border border-ink/10 rounded-lg shadow-soft-sm bg-paper">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="vyro-display text-base font-semibold text-ink">Top Products by Revenue</h3>
              <p className="text-xs text-ink-4">Highest grossing commodities in your depot catalog.</p>
            </div>
            <span className="text-xs font-mono text-ink-4">Ranked by LKR</span>
          </div>
          {topBarData.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-2">
              <PackageIcon size={24} className="text-ink-4 opacity-50" />
              <p className="text-xs font-medium text-ink-3">No product sales data in this period.</p>
              <p className="text-[11px] text-ink-4 max-w-xs">
                Publish standard commodities and configure volume tiers to accelerate your wholesale sales mix.
              </p>
              <Link to="/supplier/products" className="text-xs font-semibold text-copper hover:underline mt-2">
                Manage product catalog →
              </Link>
            </div>
          ) : (
            <BarChart
              data={topBarData}
              height={190}
              tone="amber"
              formatValue={(v) => formatCompactLKR(v)}
            />
          )}
        </Surface>

        <Surface kind="elevated" className="p-6 overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm bg-paper">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="vyro-display text-base font-semibold text-ink">SKU Performance Breakdown</h3>
              <p className="text-xs text-ink-4">Volume units, total bookings, and revenue share.</p>
            </div>
            <span className="text-xs font-mono text-ink-4">Share %</span>
          </div>
          {(data?.topProducts ?? []).length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-2">
              <PercentIcon size={24} className="text-ink-4 opacity-50" />
              <p className="text-xs font-medium text-ink-3">No product sales breakdown available yet.</p>
              <p className="text-[11px] text-ink-4 max-w-xs">
                As buyers purchase from your rate cards, detailed volume shares will appear here.
              </p>
              <Link to="/supplier/pricing" className="text-xs font-semibold text-copper hover:underline mt-2">
                Review mill-gate rates →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-mist/40 text-[11px] uppercase tracking-[0.14em] text-ink-4">
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

      {/* Commercial Strategy Callout Banner */}
      <Surface kind="ink" className="p-5 rounded-lg relative overflow-hidden grain shadow-soft-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 max-w-3xl">
            <TrendingUpIcon size={20} className="text-volt shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-volt font-semibold">
                Procurement Velocity & Buyer Retention Intelligence
              </div>
              <p className="text-xs text-paper/75 leading-relaxed">
                Wholesale retail and hospitality buyers on VYRO reorder on average every 7 to 14 days. Depots that maintain
                consistent stock availability and 48-hour dispatch lead times achieve a 62% higher repeat booking rate.
              </p>
            </div>
          </div>
          <Link to="/supplier/orders" className="shrink-0">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs font-semibold">
              <span>Orders Console</span>
              <ArrowRightIcon size={12} />
            </Button>
          </Link>
        </div>
      </Surface>
    </div>
  );
}
