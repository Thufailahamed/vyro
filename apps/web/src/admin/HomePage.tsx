import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
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
  ExternalLinkIcon,
  CheckCircleIcon,
  ClockIcon,
  ScaleIcon,
} from '@/components/icons';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { CommandCenter, useCommandCenter } from './CommandCenter';

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

function formatRelativeTime(ts: number) {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatAction(action: string) {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AdminHomePage() {
  const [range, setRange] = useState<AdminAnalyticsRange>('30d');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', range],
    queryFn: () => api.get<AdminAnalytics>(`/analytics/admin?range=${range}`),
    retry: false,
    refetchInterval: 60_000,
  });

  const commandCenterQuery = useCommandCenter();
  const recentEvents = commandCenterQuery.data?.recentEvents ?? [];

  const m = data?.metrics;
  const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

  // Calculate effective take rate percentage
  const effectiveTakeRatePct = useMemo(() => {
    if (!m || m.gmvCents <= 0) return '2.50%';
    const pct = ((m.takeRateCents / m.gmvCents) * 100).toFixed(2);
    return `${pct}%`;
  }, [m]);

  const tiles = [
    {
      to: '/admin/businesses',
      label: 'Active Buyers',
      value: m ? m.activeBuyers : '—',
      sub: 'Verified purchasing entities',
      badge: 'Commercial Entities',
      icon: <Building2Icon size={18} className="text-copper" />,
    },
    {
      to: '/admin/suppliers',
      label: 'Active Suppliers',
      value: m ? m.activeSuppliers : '—',
      sub: 'Verified mills & wholesale hubs',
      badge: 'Mills & Hubs',
      icon: <StoreIcon size={18} className="text-volt-deep" />,
    },
    {
      to: '/admin/users',
      label: 'New Signups',
      value: m ? m.newSignups : '—',
      sub: 'Accounts in selected window',
      badge: `Window: ${range.toUpperCase()}`,
      icon: <UsersIcon size={18} className="text-mint" />,
    },
    {
      to: '/admin/disputed',
      label: 'Dispute Rate',
      value: m ? fmtPct(m.disputeRate) : '—',
      sub: m && m.disputeRate > 0.02 ? 'Attention required' : 'Healthy operating baseline',
      badge: m && m.disputeRate > 0.02 ? 'Elevated (>2%)' : 'Normal (<2%)',
      isAlert: m ? m.disputeRate > 0.02 : false,
      icon: (
        <AlertCircleIcon
          size={18}
          className={m && m.disputeRate > 0.02 ? 'text-rose' : 'text-mint'}
        />
      ),
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* ── Executive Command Header & Attached Live Telemetry Rail ── */}
      <header className="bg-ink text-paper border border-paper/10 relative overflow-hidden grain shadow-lg">
        <div className="p-6 sm:p-8">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="vyro-kicker text-volt">Operations Command</span>
                <span className="text-paper/40">/</span>
                <span className="text-[11px] font-mono text-paper/70">National Clearinghouse</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/10 border border-volt/25 text-[10px] font-mono text-volt uppercase tracking-wider font-bold">
                  <span className="size-1.5 rounded-full bg-volt animate-pulse" />
                  Live Telemetry
                </span>
                <span className="text-[10px] font-mono text-paper/40 hidden sm:inline">
                  • Synced 60s
                </span>
              </div>
              <h1 className="vyro-display text-3xl sm:text-4xl text-paper font-bold tracking-tight">
                VYRO Control
              </h1>
              <p className="text-xs sm:text-sm text-paper/70 max-w-2xl leading-relaxed">
                Platform administration across verified commercial businesses, wholesale suppliers, order clearing, and dispute resolutions across 25 Sri Lankan districts.
              </p>
            </div>

            {/* Time Range Filter */}
            <div className="flex items-center gap-1 bg-paper/5 border border-paper/15 p-1 shrink-0 self-start md:self-auto shadow-sm">
              {(['7d', '30d', '90d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                    range === r
                      ? 'bg-volt text-ink font-bold shadow-sm'
                      : 'text-paper/60 hover:text-paper hover:bg-paper/10'
                  }`}
                >
                  Last {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Integrated Real-Time Telemetry Bar */}
        <div className="border-t border-paper/10 bg-paper/[0.04] p-4 sm:px-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-paper/50 font-semibold">
              Live Operations Queue Health
            </span>
            <span className="text-[10px] font-mono text-paper/40">Real-time Triage Deck</span>
          </div>
          <CommandCenter variant="dark" />
        </div>
      </header>

      {/* ── KPI Metric Tiles ── */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-paper p-6 h-32 border border-ink/10 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="bg-paper border border-ink/15 p-5 hover:border-ink hover:shadow-md transition-all duration-150 flex flex-col justify-between space-y-3 group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-ink-4 group-hover:text-copper font-semibold">
                  {t.label}
                </span>
                <div className="size-8 bg-bone border border-ink/10 flex items-center justify-center shrink-0 group-hover:bg-ink group-hover:text-paper transition-colors shadow-2xs">
                  {t.icon}
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <MetricNumber size="lg" className="text-ink font-bold">
                    {t.value}
                  </MetricNumber>
                  <span
                    className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                      t.isAlert
                        ? 'bg-rose/10 text-rose border-rose/25'
                        : 'bg-bone text-ink-4 border-ink/10'
                    }`}
                  >
                    {t.badge}
                  </span>
                </div>
                <div className="text-[11px] text-ink-4 mt-1 truncate">{t.sub}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Platform Financials & Take Rate Panel ── */}
      <Surface kind="elevated" className="p-6 sm:p-7 space-y-6 border border-ink/15 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-ink/10">
          <div>
            <div className="vyro-kicker text-copper">Financial Settlement Ledger</div>
            <h3 className="font-display text-xl text-ink font-bold mt-0.5">
              Platform Economics (Last {range})
            </h3>
          </div>
          <Link
            to="/admin/finance"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider font-bold bg-bone hover:bg-ink hover:text-paper text-ink-3 border border-ink/10 transition-colors shadow-2xs"
          >
            <span>SVAT Invoicing Ledger</span>
            <ArrowRightIcon size={12} />
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {/* GMV */}
          <div className="p-5 bg-bone/50 border border-ink/10 space-y-1.5 flex flex-col justify-between hover:border-ink/25 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                  Gross Merchandise Value (GMV)
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-ink/5 text-ink-4">
                  LKR Settled
                </span>
              </div>
              <div className="vyro-metric text-2xl sm:text-3xl font-bold text-ink mt-2">
                {m ? formatLKR(m.gmvCents) : '—'}
              </div>
            </div>
            <p className="text-[11px] text-ink-4 pt-2 border-t border-ink/5">
              Total invoiced purchasing volume across marketplace
            </p>
          </div>

          {/* Platform Revenue */}
          <div className="p-5 bg-bone/50 border border-ink/10 space-y-1.5 flex flex-col justify-between hover:border-ink/25 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                  Platform Clearing Revenue
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-volt/20 text-ink font-bold">
                  {effectiveTakeRatePct} BPS
                </span>
              </div>
              <div className="vyro-metric text-2xl sm:text-3xl font-bold text-volt-deep mt-2">
                {m ? formatLKR(m.takeRateCents) : '—'}
              </div>
            </div>
            <p className="text-[11px] text-ink-4 pt-2 border-t border-ink/5">
              Net platform fees calculated via active escrow clearing rules
            </p>
          </div>

          {/* Completion Rate */}
          <div className="p-5 bg-bone/50 border border-ink/10 space-y-1.5 flex flex-col justify-between hover:border-ink/25 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                  Fulfillment Completion Rate
                </span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                    m && m.completionRate > 0.8
                      ? 'bg-mint/15 text-mint'
                      : 'bg-amber/15 text-amber'
                  }`}
                >
                  {m && m.completionRate > 0.8 ? 'Optimal' : 'In Transit'}
                </span>
              </div>
              <div className="vyro-metric text-2xl sm:text-3xl font-bold text-mint mt-2">
                {m ? fmtPct(m.completionRate) : '—'}
              </div>
            </div>
            <div>
              {/* Mini progress bar */}
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden my-1">
                <div
                  className="bg-mint h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((m?.completionRate ?? 0) * 100))}%` }}
                />
              </div>
              <p className="text-[11px] text-ink-4 pt-1">
                Dockside GRN sign-offs confirmed by receiving businesses
              </p>
            </div>
          </div>
        </div>

        {/* Daily GMV Volume Distribution (if data exists) */}
        {data?.gmvByDay && data.gmvByDay.length > 0 && (
          <div className="pt-4 border-t border-ink/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                Daily Transaction Clearing Activity
              </span>
              <span className="text-[10px] font-mono text-ink-4">
                {data.gmvByDay.length} Active Settlement Days
              </span>
            </div>
            <div className="flex items-end gap-1.5 h-16 pt-2 pb-1 overflow-x-auto">
              {(() => {
                const maxCents = Math.max(...data.gmvByDay.map((d) => d.cents), 1);
                return data.gmvByDay.map((d) => {
                  const pct = Math.max(8, Math.round((d.cents / maxCents) * 100));
                  return (
                    <div
                      key={d.day}
                      className="flex-1 min-w-[20px] flex flex-col items-center gap-1 group relative"
                    >
                      <div
                        className="w-full bg-ink/75 group-hover:bg-emerald-600 transition-colors rounded-xs"
                        style={{ height: `${pct}%` }}
                      />
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-ink text-paper text-[9px] font-mono px-1.5 py-0.5 whitespace-nowrap z-20 pointer-events-none shadow-sm">
                        {d.day}: {formatLKR(d.cents)}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </Surface>

      {/* ── Regional & Commodity Intelligence ── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Product Categories */}
        <Surface kind="elevated" className="p-6 space-y-4 border border-ink/15 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-ink/10">
            <div>
              <div className="vyro-kicker text-copper">Commodity Volume</div>
              <h4 className="font-display font-semibold text-ink text-base">Top Product Categories</h4>
            </div>
            <Link
              to="/admin/catalog"
              className="text-[11px] font-mono text-copper hover:text-ink transition-colors flex items-center gap-1"
            >
              <span>Catalog</span>
              <ArrowRightIcon size={11} />
            </Link>
          </div>

          {data?.topCategories && data.topCategories.length > 0 ? (
            <div className="divide-y divide-ink/10">
              {data.topCategories.map((c) => {
                const maxCatCents = Math.max(...data.topCategories.map((x) => x.cents), 1);
                const sharePct = Math.round((c.cents / maxCatCents) * 100);
                return (
                  <div key={c.categoryId} className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ink flex items-center gap-2">
                        <PackageIcon size={14} className="text-ink-4" />
                        {c.name}
                      </span>
                      <span className="vyro-metric font-bold text-ink">{formatLKR(c.cents)}</span>
                    </div>
                    <div className="w-full bg-bone h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-copper h-full rounded-full transition-all duration-500"
                        style={{ width: `${sharePct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-ink-4 space-y-1">
              <PackageIcon size={20} className="mx-auto text-ink-4/60 mb-2" />
              <p>Commodity category volume will populate as purchase orders clear.</p>
            </div>
          )}
        </Surface>

        {/* Logistics & Regional Coverage */}
        <Surface kind="elevated" className="p-6 space-y-4 border border-ink/15 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-ink/10">
            <div>
              <div className="vyro-kicker text-copper">Logistics Coverage</div>
              <h4 className="font-display font-semibold text-ink text-base">District Clearing Hubs</h4>
            </div>
            <Link
              to="/admin/deliveries"
              className="text-[11px] font-mono text-copper hover:text-ink transition-colors flex items-center gap-1"
            >
              <span>Deliveries</span>
              <ArrowRightIcon size={11} />
            </Link>
          </div>

          {data?.topRegions && data.topRegions.length > 0 ? (
            <div className="divide-y divide-ink/10">
              {data.topRegions.map((r) => {
                const maxRegCents = Math.max(...data.topRegions.map((x) => x.cents), 1);
                const sharePct = Math.round((r.cents / maxRegCents) * 100);
                return (
                  <div key={r.district} className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ink flex items-center gap-1.5">
                        <span className="text-xs">📍</span>
                        {r.district}
                      </span>
                      <span className="vyro-metric font-bold text-ink">{formatLKR(r.cents)}</span>
                    </div>
                    <div className="w-full bg-bone h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${sharePct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 space-y-3">
              <div className="p-4 bg-bone/40 border border-ink/10 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-ink">
                  <span className="flex items-center gap-1.5">
                    <TruckIcon size={14} className="text-copper" />
                    <span>25 Sri Lankan Districts Monitored</span>
                  </span>
                  <span className="font-mono text-[10px] text-mint uppercase font-bold">
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-ink-4 leading-relaxed">
                  Provincial routes in Western (Colombo, Gampaha), Central (Kandy), Southern (Galle), and North Western (Kurunegala) provinces.
                </p>
              </div>
            </div>
          )}
        </Surface>
      </div>

      {/* ── Operational Triage & Management Hub ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-ink/10">
          <div>
            <div className="vyro-kicker text-copper">Administration Operations</div>
            <h3 className="font-display text-lg sm:text-xl text-ink font-bold mt-0.5">
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
            className="p-5 bg-paper border border-ink/15 hover:border-ink hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group"
          >
            <div className="space-y-2">
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors shadow-2xs">
                <StoreIcon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-copper transition-colors">
                Supplier Hubs
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Review verified millers, wholesale dispatch facilities, and catalog listings.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-copper group-hover:text-ink">
              <span>Manage Suppliers</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/admin/businesses"
            className="p-5 bg-paper border border-ink/15 hover:border-ink hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group"
          >
            <div className="space-y-2">
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors shadow-2xs">
                <Building2Icon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-copper transition-colors">
                Buyer Businesses
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Inspect registered purchasing entities, restaurant chains, and credit terms.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-copper group-hover:text-ink">
              <span>Manage Buyers</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/admin/disputed"
            className="p-5 bg-paper border border-ink/15 hover:border-ink hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group"
          >
            <div className="space-y-2">
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors shadow-2xs">
                <AlertCircleIcon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-copper transition-colors">
                Dispute Escalations
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Triage dockside receiving disputes, weight variances, and driver sign-offs.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-copper group-hover:text-ink">
              <span>Inspect Disputes</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/admin/security"
            className="p-5 bg-paper border border-ink/15 hover:border-ink hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-3 group"
          >
            <div className="space-y-2">
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors shadow-2xs">
                <ShieldCheckIcon size={18} />
              </div>
              <h4 className="font-display font-semibold text-base text-ink group-hover:text-copper transition-colors">
                Security & Audit
              </h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Review immutable audit logs, operator session revocations, and access rights.
              </p>
            </div>
            <div className="pt-2 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-copper group-hover:text-ink">
              <span>Platform Security</span>
              <ArrowRightIcon size={13} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </div>

      {/* ── Live Operational Event Stream ── */}
      {recentEvents.length > 0 && (
        <Surface kind="elevated" className="p-6 border border-ink/15 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-ink/10">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-600 animate-pulse" />
              <h4 className="font-display font-semibold text-ink text-sm sm:text-base">
                Live Administrative Activity Feed
              </h4>
            </div>
            <Link
              to="/admin/audit"
              className="text-[11px] font-mono text-copper hover:text-ink transition-colors flex items-center gap-1"
            >
              <span>View Audit Logs</span>
              <ArrowRightIcon size={11} />
            </Link>
          </div>

          <div className="divide-y divide-ink/5">
            {recentEvents.slice(0, 5).map((evt) => (
              <div key={evt.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-ink-4" />
                  <span className="font-mono font-semibold text-ink">
                    {formatAction(evt.action)}
                  </span>
                  <span className="font-mono text-[10px] text-ink-4 hidden sm:inline">
                    ID: {evt.id.slice(0, 8)}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-ink-4">
                  {formatRelativeTime(evt.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </Surface>
      )}
    </div>
  );
}
