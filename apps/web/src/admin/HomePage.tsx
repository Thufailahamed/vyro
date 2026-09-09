import { useState } from 'react';
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
} from '@/components/icons';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { CommandCenter } from './CommandCenter';

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

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', range],
    queryFn: () => api.get<AdminAnalytics>(`/analytics/admin?range=${range}`),
    retry: false,
    refetchInterval: 60_000,
  });

  const m = data?.metrics;
  const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

  const tiles = [
    {
      to: '/admin/businesses',
      label: 'Active Buyers',
      value: m ? m.activeBuyers : '—',
      sub: 'Verified purchasing entities',
      icon: <Building2Icon size={18} className="text-copper" />,
    },
    {
      to: '/admin/suppliers',
      label: 'Active Suppliers',
      value: m ? m.activeSuppliers : '—',
      sub: 'Verified mills & wholesale hubs',
      icon: <StoreIcon size={18} className="text-volt" />,
    },
    {
      to: '/admin/users',
      label: 'New Signups',
      value: m ? m.newSignups : '—',
      sub: 'Accounts in selected window',
      icon: <UsersIcon size={18} className="text-mint" />,
    },
    {
      to: '/admin/disputed',
      label: 'Dispute Rate',
      value: m ? fmtPct(m.disputeRate) : '—',
      sub: m && m.disputeRate > 0.02 ? 'Attention required' : 'Healthy operating baseline',
      icon: <AlertCircleIcon size={18} className={m && m.disputeRate > 0.02 ? 'text-rose' : 'text-mint'} />,
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Command Header */}
      <header className="p-6 sm:p-8 bg-ink text-paper border-b border-paper/10 relative overflow-hidden grain">
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
      </header>

      <CommandCenter />

      {/* KPI Metric Tiles */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-paper p-6 h-28 border border-ink/10 animate-pulse" />
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
                <div className="size-8 bg-bone border border-ink/10 flex items-center justify-center shrink-0 group-hover:bg-ink group-hover:text-paper transition-colors">
                  {t.icon}
                </div>
              </div>

              <div>
                <MetricNumber size="lg" className="text-ink font-bold">
                  {t.value}
                </MetricNumber>
                <div className="text-[10px] text-ink-4 mt-1 truncate">{t.sub}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Platform Financials & Take Rate Panel */}
      <Surface kind="elevated" className="p-6 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink/10">
          <div>
            <div className="vyro-kicker text-copper">Financial Settlement Ledger</div>
            <h3 className="font-display text-xl text-ink font-bold mt-0.5">
              Platform Economics (Last {range})
            </h3>
          </div>
          <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider font-bold bg-bone text-ink-3 border border-ink/10">
            SVAT Invoicing Ledger
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          <div className="p-5 bg-bone/50 border border-ink/10 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
              Gross Merchandise Value (GMV)
            </div>
            <div className="vyro-metric text-3xl font-bold text-ink mt-1">
              {m ? formatLKR(m.gmvCents) : '—'}
            </div>
            <p className="text-[10px] text-ink-4 pt-1">Total invoiced purchasing volume</p>
          </div>

          <div className="p-5 bg-bone/50 border border-ink/10 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
              Platform Clearing Revenue
            </div>
            <div className="vyro-metric text-3xl font-bold text-volt-deep mt-1">
              {m ? formatLKR(m.takeRateCents) : '—'}
            </div>
            <p className="text-[10px] text-ink-4 pt-1">Calculated via active platform fee BPS</p>
          </div>

          <div className="p-5 bg-bone/50 border border-ink/10 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
              Fulfillment Completion Rate
            </div>
            <div className="vyro-metric text-3xl font-bold text-mint mt-1">
              {m ? fmtPct(m.completionRate) : '—'}
            </div>
            <p className="text-[10px] text-ink-4 pt-1">Dockside GRN sign-offs confirmed</p>
          </div>
        </div>
      </Surface>

      {/* Operational Triage & Management Hub */}
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
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors">
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
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors">
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
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors">
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
              <div className="size-8 bg-bone text-ink group-hover:bg-ink group-hover:text-volt flex items-center justify-center transition-colors">
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

      {/* Regional & Category Intelligence (If data exists) */}
      {data?.topCategories && data.topCategories.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-6">
          <Surface kind="elevated" className="p-6 space-y-4">
            <div className="vyro-kicker text-copper">Commodity Volume</div>
            <h4 className="font-display font-semibold text-ink text-base">Top Product Categories</h4>
            <div className="divide-y divide-ink/10">
              {data.topCategories.map((c) => (
                <div key={c.categoryId} className="py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="vyro-metric font-bold text-ink">{formatLKR(c.cents)}</span>
                </div>
              ))}
            </div>
          </Surface>

          {data.topRegions && data.topRegions.length > 0 && (
            <Surface kind="elevated" className="p-6 space-y-4">
              <div className="vyro-kicker text-copper">Logistics Coverage</div>
              <h4 className="font-display font-semibold text-ink text-base">Top Active Districts</h4>
              <div className="divide-y divide-ink/10">
                {data.topRegions.map((r) => (
                  <div key={r.district} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">📍 {r.district}</span>
                    <span className="vyro-metric font-bold text-ink">{formatLKR(r.cents)}</span>
                  </div>
                ))}
              </div>
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}
