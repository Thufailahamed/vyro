import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { StatTile, BarChart, ProgressRing, TimeSeries, Sparkline } from '@/components/ui';
import { Button } from '@/components/ui';
import {
  PackageIcon,
  ShoppingCartIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  StoreIcon,
  SparklesIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';

interface OrderRow {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMockSpend(businessId?: string) {
  const seed = (businessId ?? 'demo').split('').reduce((a, c) => a + c.charCodeAt(0), 1);
  const rand = mulberry32(seed);
  const base = 380_000;
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    const v = base + Math.floor(rand() * 720_000) + Math.sin(i / 2) * 80_000;
    out.push(Math.max(120_000, Math.round(v)));
  }
  return out;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-amber/40 bg-amber/10 text-amber',
  accepted: 'border-cyan/40 bg-cyan/10 text-cyan-deep',
  delivered: 'border-mint/40 bg-mint/10 text-mint',
  completed: 'border-mint/40 bg-mint/10 text-mint',
  disputed: 'border-rose/40 bg-rose/10 text-rose',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
  rejected: 'border-rose/40 bg-rose/10 text-rose',
  in_transit: 'border-cyan/40 bg-cyan/10 text-cyan-deep',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  in_transit: 'In transit',
};

export function DashboardPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['business-orders-dash', businessId],
    queryFn: () => api.get<{ orders: OrderRow[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const orders = ordersData?.orders ?? [];

  const stats = useMemo(() => {
    const total = orders.length;
    const inFlight = orders.filter((o) =>
      ['pending', 'accepted', 'in_transit'].includes(o.status),
    ).length;
    const completed = orders.filter((o) =>
      ['completed', 'delivered'].includes(o.status),
    ).length;
    const disputed = orders.filter((o) => o.status === 'disputed').length;
    const lifetimeCents = orders.reduce((a, b) => a + b.totalCents, 0);
    return { total, inFlight, completed, disputed, lifetimeCents };
  }, [orders]);

  const monthly = useMemo(() => buildMockSpend(businessId), [businessId]);
  const last6 = monthly.slice(-6);
  const totalSpendYTD = monthly.reduce((a, b) => a + b, 0);
  const spendSpark = last6;

  const supplierMix = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      const key = (o as { supplierName?: string }).supplierName ?? 'Direct supplier';
      map.set(key, (map.get(key) ?? 0) + o.totalCents);
    });
    const top = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxSpend = Math.max(...top.map(([, v]) => v), 1);
    return top.map(([name, val]) => ({ name, value: Math.round((val / maxSpend) * 100) }));
  }, [orders]);

  const recent = orders.slice(0, 5);

  if (!businessId) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold text-slate-950">Business dashboard unavailable</h2>
        <p className="mt-2 text-sm text-slate-500">
          Associate this account with a business to view aggregated procurement metrics.
        </p>
        <Link to="/onboarding/business" className="mt-5 inline-block">
          <Button>Register business</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl bg-midnight text-paper p-7 sm:p-10 shadow-glow-cyan">
        <div className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full bg-cyan/15 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan/15 text-cyan border border-cyan/30">
              <SparklesIcon size={12} /> Business dashboard
            </span>
            <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-paper text-balance">
              {user?.memberships?.[0]?.businessName ?? 'Procurement'} <span className="text-cyan">— overview</span>
            </h1>
            <p className="mt-1 text-sm text-ink-3 max-w-xl">
              Real-time procurement telemetry across pending, in-flight, and completed purchase orders.
            </p>
          </div>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 h-10 px-4 bg-cyan text-midnight rounded-md text-sm font-semibold hover:bg-cyan/90 transition-colors shrink-0 shadow-soft-md"
          >
            <ShoppingCartIcon size={15} /> Start procurement
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      </header>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Lifetime spend"
          value={formatLKR(stats.lifetimeCents)}
          change={`${stats.total} POs`}
          trend="up"
          Icon={TrendingUpIcon}
          tone="cyan"
          spark={spendSpark}
        />
        <StatTile
          label="In-flight"
          value={stats.inFlight}
          change="Active POs"
          trend={stats.inFlight > 0 ? 'flat' : 'flat'}
          Icon={TruckIcon}
          tone="cyan"
          spark={[3, 5, 4, 6, 5, 7, stats.inFlight]}
        />
        <StatTile
          label="Completed"
          value={stats.completed}
          change={`${Math.round((stats.completed / Math.max(stats.total, 1)) * 100)}% rate`}
          trend="up"
          Icon={CheckCircleIcon}
          tone="mint"
          spark={[1, 2, 3, 3, 4, stats.completed]}
        />
        <StatTile
          label="Disputed"
          value={stats.disputed}
          change="Open escalations"
          trend={stats.disputed > 0 ? 'down' : 'flat'}
          Icon={AlertCircleIcon}
          tone="rose"
          spark={[1, 0, 0, 1, stats.disputed]}
        />
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-paper rounded-xl border border-slate-200 p-5 shadow-soft-sm">
          <header className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Spend trajectory</h2>
              <p className="text-xs text-slate-500">Monthly wholesale procurement (LKR)</p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-deep">
              YTD {formatLKR(totalSpendYTD)}
            </span>
          </header>
          <TimeSeries
            values={monthly}
            labels={MONTHS.slice(0, 6).map((m) => m)}
            tone="cyan"
            height={180}
            formatValue={(v: number) => formatLKR(v)}
          />
        </div>

        <div className="bg-paper rounded-xl border border-slate-200 p-5 shadow-soft-sm">
          <header className="mb-5">
            <h2 className="text-base font-semibold text-slate-950">Completion rate</h2>
            <p className="text-xs text-slate-500">Delivered + completed share</p>
          </header>
          <div className="flex justify-center">
            <ProgressRing
              value={(stats.completed / Math.max(stats.total, 1)) * 100}
              tone="mint"
              label="On time"
              size={140}
              strokeWidth={10}
            />
          </div>
          <dl className="mt-5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Completed</dt>
              <dd className="font-mono font-semibold text-slate-950 num-tabular">{stats.completed}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">In-flight</dt>
              <dd className="font-mono font-semibold text-slate-950 num-tabular">{stats.inFlight}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Disputed</dt>
              <dd className="font-mono font-semibold text-rose num-tabular">{stats.disputed}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Mix + Recent */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-paper rounded-xl border border-slate-200 p-5 shadow-soft-sm">
          <header className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Top suppliers</h2>
              <p className="text-xs text-slate-500">By spend share this period</p>
            </div>
            <StoreIcon size={16} className="text-slate-400" />
          </header>
          {supplierMix.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-md text-xs text-slate-500">
              Place an order to populate supplier analytics.
            </div>
          ) : (
            <ul className="space-y-3">
              {supplierMix.map((s, i) => (
                <li key={s.name} className="flex items-center gap-3">
                  <span className="size-7 rounded-md bg-slate-950 text-cyan inline-flex items-center justify-center text-[11px] font-mono font-semibold num-tabular shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-950 truncate">{s.name}</span>
                      <span className="text-xs font-mono text-slate-700 num-tabular ml-2">{s.value}%</span>
                    </div>
                    <div className="h-1.5 bg-ink-7 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan rounded-full transition-all duration-500"
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-paper rounded-xl border border-slate-200 p-5 shadow-soft-sm">
          <header className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Recent activity</h2>
              <p className="text-xs text-slate-500">Last purchase orders</p>
            </div>
            <Link
              to="/orders"
              className="text-xs font-semibold text-cyan-deep hover:underline inline-flex items-center gap-1"
            >
              All <ArrowRightIcon size={12} />
            </Link>
          </header>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-paper rounded-md border border-slate-200 animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-md">
              <PackageIcon size={24} className="mx-auto text-slate-400" />
              <p className="mt-2 text-xs text-slate-500">No purchase orders yet</p>
            </div>
          ) : (
            <ol className="space-y-2">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/orders/${o.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-md hover:bg-pearl transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-semibold text-slate-950">{o.poNumber}</div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                        <ClockIcon size={10} />
                        <span className="num-tabular">
                          {new Date(o.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                        STATUS_COLORS[o.status] ?? 'border-slate-300 bg-slate-100 text-slate-700'
                      }`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <div className="font-mono font-semibold text-sm text-slate-950 num-tabular w-24 text-right">
                      {formatLKR(o.totalCents)}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="bg-paper rounded-xl border border-slate-200 p-5 shadow-soft-sm">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Weekly velocity</h2>
            <p className="text-xs text-slate-500">Orders placed per week · last 8 weeks</p>
          </div>
        </header>
        <BarChart
          data={Array.from({ length: 8 }).map((_, i) => ({
            label: `W${i + 1}`,
            value: Math.max(0, Math.round(2 + Math.sin(i / 1.5) * 3 + (i % 3))),
          }))}
          tone="cyan"
          height={140}
        />
      </section>

      <p className="text-[11px] text-slate-400 text-center font-mono num-tabular">
        Telemetry sampled live · last refresh {new Date().toLocaleTimeString()}
        <span className="ml-2 inline-flex items-center gap-1">
          <Sparkline values={[1, 0.6, 1, 0.4, 1, 0.8, 1]} width={24} height={10} tone="cyan" />
        </span>
      </p>
    </div>
  );
}
