import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import {
  StoreIcon,
  Building2Icon,
  AlertCircleIcon,
  FileTextIcon,
  ShieldCheckIcon,
} from './icons';
import {
  PackageIcon,
  SparklesIcon,
  TruckIcon,
  UsersIcon,
  TrendingUpIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  LayersIcon,
  ScaleIcon,
  RefreshCwIcon,
} from '@/components/icons';
import { StatusBadge, Surface, Button } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { CommandCenter } from './CommandCenter';
import { useAdminOrders } from './useAdminOrders';

type AdminAnalyticsRange = '7d' | '30d' | '90d';

type AdminAnalytics = {
  range: AdminAnalyticsRange;
  metrics: {
    gmvCents: number;
    takeRateCents: number;
    activeBuyers: number;
    activeSuppliers: number;
    newSignups: number;
    disputeRate: number;
    completionRate: number;
  };
  gmvByDay: Array<{ day: string; cents: number }>;
  topCategories: Array<{ categoryId: string; name: string; cents: number }>;
  topRegions: Array<{ district: string; cents: number }>;
};

export function AdminHomePage() {
  const [range, setRange] = useState<AdminAnalyticsRange>('30d');
  const [hoveredDay, setHoveredDay] = useState<{ day: string; cents: number } | null>(null);

  // Analytics query
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-analytics', range],
    queryFn: () => api.get<AdminAnalytics>(`/analytics/admin?range=${range}`),
    retry: false,
    refetchInterval: 60_000,
  });

  // Recent 5 orders query for live clearing stream
  const { data: recentOrdersData, isLoading: ordersLoading } = useAdminOrders({ limit: 5 });
  const recentOrders = recentOrdersData?.orders ?? [];

  const m = data?.metrics;
  const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

  // Daily GMV Volume calculations for bar chart
  const dailyVolume = useMemo(() => {
    const list = data?.gmvByDay ?? [];
    if (list.length === 0) return [];
    const maxCents = Math.max(...list.map((d) => d.cents), 1);
    return list.map((d) => ({
      ...d,
      heightPct: Math.max(8, Math.round((d.cents / maxCents) * 100)),
    }));
  }, [data?.gmvByDay]);

  const tiles = [
    {
      to: '/admin/businesses',
      label: 'Active Buyers',
      value: m ? m.activeBuyers : '—',
      sub: 'Verified purchasing entities',
      icon: <Building2Icon size={18} className="text-amber-600" />,
      tag: 'Commercial Demand',
    },
    {
      to: '/admin/suppliers',
      label: 'Active Suppliers',
      value: m ? m.activeSuppliers : '—',
      sub: 'Verified mills & wholesale hubs',
      icon: <StoreIcon size={18} className="text-emerald-600" />,
      tag: 'Wholesale Supply',
    },
    {
      to: '/admin/users',
      label: 'New Signups',
      value: m ? m.newSignups : '—',
      sub: 'Accounts in selected window',
      icon: <UsersIcon size={18} className="text-blue-600" />,
      tag: 'Platform Growth',
    },
    {
      to: '/admin/disputed',
      label: 'Dispute Rate',
      value: m ? fmtPct(m.disputeRate) : '—',
      sub: m && m.disputeRate > 0.02 ? 'Requires operational review' : 'Healthy operating baseline',
      icon: <AlertCircleIcon size={18} className={m && m.disputeRate > 0.02 ? 'text-rose' : 'text-emerald-600'} />,
      tag: m && m.disputeRate > 0.02 ? 'Attention Needed' : 'Normal Baseline',
      isWarning: m && m.disputeRate > 0.02,
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* ── 1. Executive Command Header ─────────────────── */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-8 text-white border border-slate-800 shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-widest uppercase text-emerald-400">
                Operations Command
              </span>
              <span className="text-slate-600 font-mono">/</span>
              <span className="text-xs font-mono text-slate-400">National Wholesale Clearinghouse</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300 uppercase tracking-wider font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Telemetry
              </span>
            </div>

            <h1 className="vyro-display text-3xl sm:text-4xl text-white font-bold tracking-tight">
              VYRO Control Deck
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Real-time platform governance across commercial buyers, certified wholesale suppliers, escrow settlement, and logistics dispatch across 25 Sri Lankan districts.
            </p>

            {/* Quick action jump tags */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
              <Link
                to="/admin/orders"
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                Orders Clearing →
              </Link>
              <Link
                to="/admin/suppliers"
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                Suppliers Directory →
              </Link>
              <Link
                to="/admin/catalog"
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                Category Registry →
              </Link>
              <Link
                to="/admin/finance"
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                Financial Settlement →
              </Link>
            </div>
          </div>

          {/* Time Range Filter Controls & Refresh */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono flex items-center gap-1.5 border border-slate-700 transition"
              title="Refresh telemetry"
            >
              <RefreshCwIcon size={12} className={isFetching ? 'animate-spin text-emerald-400' : ''} />
              <span>{isFetching ? 'Updating…' : 'Sync'}</span>
            </button>

            <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
              {(['7d', '30d', '90d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-xs font-mono font-semibold tracking-wider uppercase rounded-lg transition-all ${
                    range === r
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  Last {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. Operational Health & Alert Triage Strip ── */}
      <CommandCenter />

      {/* ── 3. Core Platform KPI Tiles ─────────────────── */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-5 h-32 border border-ink/10" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="bg-white border border-ink/10 rounded-xl p-5 hover:border-emerald-600 hover:shadow-md transition-all duration-150 flex flex-col justify-between space-y-3 group shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.14em] font-mono text-ink-4 group-hover:text-emerald-700 font-semibold transition-colors">
                  {t.label}
                </span>
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-ink/5 flex items-center justify-center shrink-0 group-hover:bg-emerald-50 transition-colors">
                  {t.icon}
                </div>
              </div>

              <div>
                <div className="text-3xl font-bold font-mono text-ink tracking-tight group-hover:text-emerald-950 transition-colors">
                  {t.value}
                </div>
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-ink/5 text-[11px] text-ink-4">
                  <span className="truncate">{t.sub}</span>
                  <span
                    className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded shrink-0 ${
                      t.isWarning
                        ? 'bg-rose/10 text-rose'
                        : 'bg-slate-100 text-ink-3'
                    }`}
                  >
                    {t.tag}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── 4. Financial Settlement Ledger & Daily Volume ─ */}
      <Surface className="p-6 sm:p-7 space-y-6 bg-white border border-ink/10 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-ink/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <div className="text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold">
                Financial Settlement Ledger
              </div>
            </div>
            <h3 className="font-display text-xl text-ink font-bold mt-1">
              Platform Economics (Last {range})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-lg">
              SVAT Invoicing Ledger
            </span>
            <Link to="/admin/finance">
              <Button size="sm" variant="outline">
                View Ledger Details →
              </Button>
            </Link>
          </div>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid sm:grid-cols-3 gap-5">
          <div className="p-5 rounded-xl bg-slate-50/70 border border-ink/10 space-y-1 hover:bg-slate-50 transition">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
              Gross Merchandise Value (GMV)
            </div>
            <div className="vyro-metric text-2xl sm:text-3xl font-bold text-ink mt-1">
              {m ? formatLKR(m.gmvCents) : '—'}
            </div>
            <p className="text-[11px] text-ink-4 pt-1">Total invoiced purchasing volume</p>
          </div>

          <div className="p-5 rounded-xl bg-emerald-50/40 border border-emerald-200/50 space-y-1 hover:bg-emerald-50/60 transition">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-800 font-bold">
                Platform Clearing Revenue
              </span>
              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                Active Take-Rate
              </span>
            </div>
            <div className="vyro-metric text-2xl sm:text-3xl font-bold text-emerald-700 mt-1">
              {m ? formatLKR(m.takeRateCents) : '—'}
            </div>
            <p className="text-[11px] text-emerald-700/80 pt-1">Calculated via active platform fee BPS</p>
          </div>

          <div className="p-5 rounded-xl bg-slate-50/70 border border-ink/10 space-y-1 hover:bg-slate-50 transition">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                Fulfillment Completion Rate
              </span>
              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-slate-200/70 text-ink-3">
                GRN Validated
              </span>
            </div>
            <div className="vyro-metric text-2xl sm:text-3xl font-bold text-mint mt-1">
              {m ? fmtPct(m.completionRate) : '—'}
            </div>
            <p className="text-[11px] text-ink-4 pt-1">Dockside GRN sign-offs completed</p>
          </div>
        </div>

        {/* Daily Volume Histogram / Bar Sparkline */}
        {dailyVolume.length > 0 && (
          <div className="pt-4 border-t border-ink/5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <TrendingUpIcon size={14} className="text-emerald-600" />
                <span className="font-mono text-ink-4 uppercase tracking-wider text-[10px] font-semibold">
                  Daily Purchasing Volume Trend ({dailyVolume.length} Active Days)
                </span>
              </div>
              {hoveredDay ? (
                <div className="font-mono text-xs">
                  <span className="text-ink-4">{hoveredDay.day}: </span>
                  <strong className="text-emerald-700">{formatLKR(hoveredDay.cents)}</strong>
                </div>
              ) : (
                <span className="text-[11px] text-ink-4 font-mono">Hover bar for daily amount</span>
              )}
            </div>

            <div className="h-24 w-full flex items-end gap-1.5 pt-4 bg-slate-50/50 rounded-xl p-3 border border-ink/5">
              {dailyVolume.map((item, idx) => (
                <div
                  key={item.day || idx}
                  onMouseEnter={() => setHoveredDay(item)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className="flex-1 min-w-[6px] max-w-[32px] h-full flex items-end group relative cursor-pointer"
                >
                  <div
                    style={{ height: `${item.heightPct}%` }}
                    className={`w-full rounded-t-sm transition-all duration-150 ${
                      hoveredDay?.day === item.day
                        ? 'bg-emerald-600 shadow-sm'
                        : 'bg-emerald-500/70 hover:bg-emerald-600'
                    }`}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-ink-4 px-1">
              <span>{dailyVolume[0]?.day}</span>
              <span>{dailyVolume[dailyVolume.length - 1]?.day}</span>
            </div>
          </div>
        )}
      </Surface>

      {/* ── 5. Market Distribution & Live Orders Grid ─── */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left: Commodity & District Breakdown */}
        <div className="lg:col-span-5 space-y-6">
          {/* Top Commodity Categories */}
          <Surface className="p-5 bg-white border border-ink/10 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-ink/5">
              <div className="flex items-center gap-2">
                <LayersIcon size={16} className="text-emerald-600" />
                <h4 className="font-display font-semibold text-ink text-sm">Commodity Distribution</h4>
              </div>
              <Link to="/admin/catalog" className="text-[11px] font-mono text-emerald-700 hover:underline">
                Catalog →
              </Link>
            </div>

            {data?.topCategories && data.topCategories.length > 0 ? (
              <div className="space-y-3">
                {data.topCategories.map((c) => {
                  const pct = m?.gmvCents ? Math.round((c.cents / m.gmvCents) * 100) : 0;
                  return (
                    <div key={c.categoryId} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink">{c.name}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-[11px] text-ink-4">({pct}%)</span>
                          <strong className="text-ink">{formatLKR(c.cents)}</strong>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.max(5, pct)}%` }}
                          className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-ink-4">
                <PackageIcon size={20} className="mx-auto mb-2 text-ink-4/60" />
                No commodity order volume recorded in this timeframe.
              </div>
            )}
          </Surface>

          {/* Regional District Coverage */}
          <Surface className="p-5 bg-white border border-ink/10 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-ink/5">
              <div className="flex items-center gap-2">
                <MapPinIcon size={16} className="text-blue-600" />
                <h4 className="font-display font-semibold text-ink text-sm">Active District Coverage</h4>
              </div>
              <span className="text-[10px] font-mono text-ink-4">25 Districts</span>
            </div>

            {data?.topRegions && data.topRegions.length > 0 ? (
              <div className="space-y-2.5">
                {data.topRegions.map((r) => (
                  <div
                    key={r.district}
                    className="p-2.5 rounded-lg bg-slate-50 border border-ink/5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className="font-medium text-ink">{r.district}</span>
                    </div>
                    <span className="vyro-metric font-semibold text-ink">{formatLKR(r.cents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-ink-4">
                <MapPinIcon size={20} className="mx-auto mb-2 text-ink-4/60" />
                Regional dispatch volume will populate as orders clear.
              </div>
            )}
          </Surface>
        </div>

        {/* Right: Live Clearinghouse Orders Stream */}
        <div className="lg:col-span-7 space-y-6">
          <Surface className="p-0 bg-white border border-ink/10 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <FileTextIcon size={14} />
                </div>
                <div>
                  <h4 className="font-display font-semibold text-ink text-sm">Recent Order Clearing</h4>
                  <p className="text-[11px] text-ink-4">Latest purchase orders registered on the platform</p>
                </div>
              </div>
              <Link to="/admin/orders">
                <Button size="sm" variant="ghost" className="text-xs font-mono">
                  View All Orders →
                </Button>
              </Link>
            </div>

            {ordersLoading ? (
              <div className="p-6 divide-y divide-ink/5 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-ink-4">
                <ClockIcon size={24} className="mx-auto mb-2 text-ink-4/60" />
                No recent purchase orders found in the clearinghouse.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-4">PO Number</th>
                      <th className="py-2.5 px-4">Buyer Entity</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            to={`/admin/orders/${o.id}`}
                            className="font-mono font-semibold text-ink hover:text-emerald-700 transition-colors"
                          >
                            {o.poNumber || o.id.slice(0, 10)}
                          </Link>
                          <div className="text-[10px] text-ink-4">
                            {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-ink truncate max-w-[150px]">
                            {o.businessName || 'Wholesale Buyer'}
                          </div>
                          <div className="text-[10px] text-ink-4 truncate max-w-[150px]">
                            {o.deliveryCity || o.deliveryDistrict || 'Sri Lanka'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={o.status as OrderStatus}>
                            {o.status.replace(/_/g, ' ')}
                          </StatusBadge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="vyro-metric font-semibold text-ink">
                            {formatLKR(o.totalCents ?? 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </div>
      </div>

      {/* ── 6. Operational Triage & Management Hub ─────── */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-ink/10">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold">
              Administration Operations
            </div>
            <h3 className="font-display text-lg text-ink font-bold mt-0.5">
              Control Center Dispatch & Triage
            </h3>
          </div>
          <span className="text-xs font-mono text-ink-4 hidden sm:block">
            Role-Based Access Controlled
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/admin/suppliers"
            className="p-5 bg-white border border-ink/10 rounded-xl hover:border-emerald-600 hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group shadow-2xs"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-800 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-colors">
                <StoreIcon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-emerald-700 transition-colors">
                Supplier Hubs
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Review verified millers, wholesale dispatch facilities, and catalog listings.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-emerald-700 group-hover:text-emerald-900">
              <span>Manage Suppliers</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/admin/businesses"
            className="p-5 bg-white border border-ink/10 rounded-xl hover:border-emerald-600 hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group shadow-2xs"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-800 group-hover:bg-amber-600 group-hover:text-white flex items-center justify-center transition-colors">
                <Building2Icon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-amber-700 transition-colors">
                Buyer Businesses
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Inspect registered purchasing entities, restaurant chains, and credit terms.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-amber-700 group-hover:text-amber-900">
              <span>Manage Buyers</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/admin/disputed"
            className="p-5 bg-white border border-ink/10 rounded-xl hover:border-emerald-600 hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group shadow-2xs"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white flex items-center justify-center transition-colors">
                <AlertCircleIcon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-rose-700 transition-colors">
                Dispute Escalations
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Triage dockside receiving disputes, weight variances, and driver sign-offs.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-rose-700 group-hover:text-rose-900">
              <span>Inspect Disputes</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/admin/security"
            className="p-5 bg-white border border-ink/10 rounded-xl hover:border-emerald-600 hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group shadow-2xs"
          >
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-800 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-colors">
                <ShieldCheckIcon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-blue-700 transition-colors">
                Security & Audit
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Review immutable audit logs, operator session revocations, and access rights.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-blue-700 group-hover:text-blue-900">
              <span>Platform Security</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
