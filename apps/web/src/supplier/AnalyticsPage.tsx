import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Surface } from '@/components/brand/Surface';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { RepeatOfferTile } from './RepeatOfferTile';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { HeroStatusPill } from './SupplierHero';
import {
  TrendingUpIcon,
  ShoppingCartIcon,
  ClockIcon,
  AlertCircleIcon,
  UsersIcon,
  RefreshCwIcon,
  PackageIcon,
  ArrowRightIcon,
  BanknoteIcon,
  SparklesIcon,
} from '@/components/icons';
import { cn, useToast } from '@vyro/ui';

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

const RANGES: { id: Range; label: string; long: string }[] = [
  { id: '7d', label: '7D', long: 'last 7 days' },
  { id: '30d', label: '30D', long: 'last 30 days' },
  { id: '90d', label: '90D', long: 'last 90 days' },
];

// Chart colours (validated ≥ 3:1 against paper). One hue per chart — no chart mixes them.
const REVENUE_HUE = '#7A8F22'; // volt-deep
const ORDERS_HUE = '#0C0E0B'; // ink

function formatDay(day: string) {
  const d = new Date(`${day.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-LK', { month: 'short', day: 'numeric' });
}

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
  const m = data?.metrics;
  const rangeMeta = RANGES.find((r) => r.id === range)!;
  const revenuePoints = (data?.revenueTrend ?? []).map((p) => ({ label: formatDay(p.day), value: p.cents }));
  const orderPoints = (data?.ordersByDay ?? []).map((p) => ({ label: formatDay(p.day), value: p.count }));
  const topProducts = data?.topProducts ?? [];
  const totalProductRev = topProducts.reduce((acc, p) => acc + p.revenueCents, 0);
  const totalUnits = topProducts.reduce((acc, p) => acc + p.units, 0);
  const totalOrders = m?.ordersCount ?? 0;
  const repeatPct = Math.round((m?.repeatCustomerRate ?? 0) * 100);
  const peakRevenue = revenuePoints.reduce((a, p) => (p.value > a.value ? p : a), { label: '—', value: 0 });

  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────── */}
      <Surface kind="ink" className="grain rounded-2xl shadow-soft-lg">
        <div className="pointer-events-none absolute -top-32 -right-16 size-96 rounded-full bg-volt/[0.12] blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-36 -left-20 size-80 rounded-full bg-copper/25 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#FAF7F0_1px,transparent_1px),linear-gradient(to_bottom,#FAF7F0_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
          aria-hidden
        />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                <TrendingUpIcon size={12} />
                Performance intelligence
              </span>
              {totalOrders > 0 ? (
                <HeroStatusPill label="Live order flow" tone="mint" />
              ) : (
                <HeroStatusPill label="Awaiting first orders" tone="amber" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={analytics.isFetching}
                className="flex size-9 items-center justify-center rounded-xl border border-paper/15 bg-paper/5 text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper disabled:opacity-50"
                title="Recalculate performance analytics"
                aria-label="Refresh analytics"
              >
                <RefreshCwIcon size={14} className={analytics.isFetching ? 'animate-spin' : ''} />
              </button>
              <div className="inline-flex items-center gap-0.5 rounded-xl border border-paper/10 bg-paper/[0.06] p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRange(r.id)}
                    aria-pressed={r.id === range}
                    className={cn(
                      'h-7 rounded-lg px-3 font-mono text-[11px] font-semibold transition-all',
                      r.id === range ? 'bg-volt text-ink shadow-sm' : 'text-paper/55 hover:text-paper',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-end">
            <div className="min-w-0">
              <h1 className="vyro-display text-3xl font-bold leading-[1.04] tracking-tight text-paper sm:text-[2.6rem]">
                Analytics &amp; demand insights
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-paper/60">
                Order flow, revenue velocity and product mix across Sri Lanka — recomputed on every
                settled purchase order.
              </p>
            </div>

            {/* Headline numbers */}
            <div className="rounded-xl border border-paper/10 bg-paper/[0.04] p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
                <span>Booked revenue · {rangeMeta.long}</span>
                <span>{totalOrders} order{totalOrders === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <div className="font-display text-4xl font-bold leading-none tracking-tight text-paper sm:text-5xl">
                    {formatLKR(m?.revenueCents ?? 0)}
                  </div>
                </div>
                <div className="flex gap-6">
                  <HeroFigure label="Avg order" value={formatCompactLKR(m?.avgOrderValueCents ?? 0)} />
                  <HeroFigure label="Peak day" value={peakRevenue.value > 0 ? peakRevenue.label : '—'} />
                </div>
              </div>
              <Sparkline values={revenuePoints.map((p) => p.value)} className="mt-4 h-10 w-full" />
            </div>
          </div>
        </div>
      </Surface>

      {/* ── KPI tiles ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          icon={ShoppingCartIcon}
          label="Fulfilled POs"
          value={String(totalOrders)}
          sub="Purchase orders in period"
        />
        <KpiTile
          icon={UsersIcon}
          label="Repeat buyers"
          value={`${repeatPct}%`}
          sub="Returning commercial buyers"
          meter={repeatPct}
          tone="mint"
        />
        <KpiTile
          icon={AlertCircleIcon}
          label="Depletion alerts"
          value={String(m?.lowStockCount ?? 0)}
          unit="SKUs"
          sub={m?.lowStockCount ? 'Need replenishment' : 'All stock healthy'}
          tone={m?.lowStockCount ? 'amber' : 'ink'}
          href={m?.lowStockCount ? '/supplier/inventory' : undefined}
        />
        <KpiTile
          icon={ClockIcon}
          label="Dispatch lead"
          value={String(m?.avgLeadTimeDays ?? 0)}
          unit="days"
          sub="Avg dock pickup turnaround"
        />
        <RepeatOfferTile supplierId={supplierId} />
      </div>

      {/* ── Trend charts ─────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ChartCard
          title="Revenue velocity"
          sub="Gross invoiced wholesale order value per day"
          badge={rangeMeta.label}
        >
          {revenuePoints.length === 0 || revenuePoints.every((p) => p.value === 0) ? (
            <ChartEmpty
              icon={TrendingUpIcon}
              title={`No revenue in the ${rangeMeta.long}`}
              body="Invoiced revenue plots here as purchase orders complete and funds release from escrow."
            />
          ) : (
            <AreaChart points={revenuePoints} color={REVENUE_HUE} format={formatLKR} formatAxis={formatCompactLKR} />
          )}
        </ChartCard>

        <ChartCard title="Order volume" sub="Purchase orders booked per day" badge="Daily POs">
          {orderPoints.length === 0 || orderPoints.every((p) => p.value === 0) ? (
            <ChartEmpty
              icon={ShoppingCartIcon}
              title={`No orders in the ${rangeMeta.long}`}
              body="Daily order counts chart here automatically as buyers check out."
            />
          ) : (
            <ColumnChart
              points={orderPoints}
              color={ORDERS_HUE}
              format={(v) => `${v} order${v === 1 ? '' : 's'}`}
            />
          )}
        </ChartCard>
      </div>

      {/* ── Product mix ──────────────────────────────────── */}
      <ChartCard
        title="Product mix"
        sub="Revenue, volume and share by SKU"
        badge={topProducts.length ? `${topProducts.length} SKUs` : undefined}
        action={
          <Link
            to="/supplier/products"
            className="hidden items-center gap-1 text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink sm:inline-flex"
          >
            Manage catalog <ArrowRightIcon size={12} />
          </Link>
        }
      >
        {topProducts.length === 0 ? (
          <ChartEmpty
            icon={PackageIcon}
            title="No product sales in this period"
            body="Publish staple commodities and configure volume tiers to grow your wholesale mix."
            cta={{ to: '/supplier/products', label: 'Manage product catalog' }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink/[0.08] font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                  <th className="w-10 pb-3 text-left font-medium">#</th>
                  <th className="pb-3 text-left font-medium">Product</th>
                  <th className="pb-3 text-right font-medium">Units</th>
                  <th className="pb-3 text-right font-medium">Revenue</th>
                  <th className="w-[32%] pb-3 pl-6 text-left font-medium">Share of revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.05]">
                {topProducts.map((p, i) => {
                  const share = totalProductRev > 0 ? (p.revenueCents / totalProductRev) * 100 : 0;
                  return (
                    <tr key={p.productId} className="group transition-colors hover:bg-bone/50">
                      <td className="py-3.5 font-mono text-xs text-ink-4">{String(i + 1).padStart(2, '0')}</td>
                      <td className="py-3.5 pr-4 font-semibold text-ink">{p.name}</td>
                      <td className="py-3.5 text-right font-mono text-xs text-ink-3 tabular-nums">{p.units.toLocaleString()}</td>
                      <td className="py-3.5 text-right font-mono text-[13px] font-semibold text-ink tabular-nums">
                        {formatLKR(p.revenueCents)}
                      </td>
                      <td className="py-3.5 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                            <div
                              className="h-full rounded-full transition-[width] duration-700"
                              style={{ width: `${Math.max(share, 2)}%`, backgroundColor: REVENUE_HUE }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-xs text-ink-3 tabular-nums">
                            {Math.round(share)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/[0.08] text-[13px]">
                  <td />
                  <td className="pt-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">Total</td>
                  <td className="pt-3.5 text-right font-mono text-xs text-ink-3 tabular-nums">{totalUnits.toLocaleString()}</td>
                  <td className="pt-3.5 text-right font-mono font-bold text-ink tabular-nums">{formatLKR(totalProductRev)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ChartCard>

      {/* ── Insight callout ──────────────────────────────── */}
      <Surface kind="ink" className="grain rounded-2xl">
        <div className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full bg-volt/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-3xl items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-volt text-ink">
              <SparklesIcon size={18} />
            </span>
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                Retention insight
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-paper/75">
                Wholesale retail and hospitality buyers on VYRO reorder on average every 7 to 14 days. Depots that keep
                stock available and dispatch within 48 hours win noticeably more repeat bookings.
              </p>
            </div>
          </div>
          <Link
            to="/supplier/orders"
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl bg-paper px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-volt sm:self-auto"
          >
            Orders console <ArrowRightIcon size={13} />
          </Link>
        </div>
      </Surface>
    </div>
  );
}

/* ---------- Building blocks ---------- */

function HeroFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-volt">{value}</div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  tone = 'ink',
  meter,
  href,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone?: 'ink' | 'mint' | 'amber';
  meter?: number;
  href?: string | undefined;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">{label}</span>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg',
            tone === 'mint' && 'bg-mint/10 text-mint',
            tone === 'amber' && 'bg-amber/10 text-amber',
            tone === 'ink' && 'bg-ink/[0.05] text-ink-3',
          )}
        >
          <Icon size={15} />
        </span>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span
          className={cn(
            'font-display text-[2rem] font-bold leading-none tracking-tight tabular-nums',
            tone === 'amber' ? 'text-amber' : 'text-ink',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-[13px] font-medium text-ink-4">{unit}</span>}
      </div>
      {meter !== undefined ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full rounded-full bg-mint transition-[width] duration-700" style={{ width: `${Math.min(meter, 100)}%` }} />
        </div>
      ) : null}
      <div className="mt-2 text-[12px] text-ink-4">{sub}</div>
    </>
  );
  const cls =
    'block rounded-2xl border border-ink/[0.08] bg-paper p-5 shadow-[0_1px_2px_rgba(12,14,11,0.04)] transition-all';
  return href ? (
    <Link to={href} className={cn(cls, 'hover:-translate-y-0.5 hover:border-ink/20')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ChartCard({
  title,
  sub,
  badge,
  action,
  children,
}: {
  title: string;
  sub: string;
  badge?: string | undefined;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink/[0.08] bg-paper p-5 shadow-[0_1px_2px_rgba(12,14,11,0.04)] sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-ink">{title}</h3>
          <p className="mt-0.5 text-[12px] text-ink-4">{sub}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {action}
          {badge && (
            <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              {badge}
            </span>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function ChartEmpty({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  cta?: { to: string; label: string };
}) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-ink/10 bg-bone/30 px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-paper text-ink-4 shadow-sm ring-1 ring-ink/[0.06]">
        <Icon size={18} />
      </span>
      <p className="mt-3 text-[13px] font-semibold text-ink-2">{title}</p>
      <p className="mt-1 max-w-xs text-[12px] text-ink-4">{body}</p>
      {cta && (
        <Link to={cta.to} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-copper hover:text-copper-deep">
          {cta.label} <ArrowRightIcon size={12} />
        </Link>
      )}
    </div>
  );
}

/* ---------- Charts ---------- */

type Point = { label: string; value: number };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

function Tooltip({ x, width, label, value }: { x: number; width: number; label: string; value: string }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-center shadow-lg"
      style={{ left }}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-paper/50">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-paper">{value}</div>
    </div>
  );
}

function AxisLabels({ points, x, height }: { points: Point[]; x: (i: number) => number; height: number }) {
  const n = points.length;
  const idx = n <= 1 ? [0] : n <= 4 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <>
      {idx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 6}
          textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
          className="fill-ink-4 font-mono text-[10px]"
        >
          {points[i]!.label}
        </text>
      ))}
    </>
  );
}

function GridLines({ width, max, y, format }: { width: number; max: number; y: (v: number) => number; format: (v: number) => string }) {
  return (
    <>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="currentColor"
            strokeOpacity={f === 0 ? 0.14 : 0.07}
            strokeDasharray={f === 0 ? undefined : '3 4'}
            className="text-ink"
          />
          <text x={PAD.left - 10} y={y(max * f) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">
            {format(max * f)}
          </text>
        </g>
      ))}
    </>
  );
}

function AreaChart({
  points,
  color,
  format,
  formatAxis,
  height = 220,
}: {
  points: Point[];
  color: string;
  format: (v: number) => string;
  formatAxis: (v: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const x = (i: number) => (n === 1 ? PAD.left + innerW / 2 : PAD.left + (i * innerW) / (n - 1));
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - v / max);
  const base = y(0);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(n - 1)},${base} L${x(0)},${base} Z`;
  const gid = 'rev-grad';

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="overflow-visible"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const mx = e.clientX - r.left;
            const i = n === 1 ? 0 : Math.round(((mx - PAD.left) / innerW) * (n - 1));
            setHover(Math.min(Math.max(i, 0), n - 1));
          }}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Revenue trend, ${n} days`}
        >
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <GridLines width={width} max={max} y={y} format={formatAxis} />
          {n > 1 ? (
            <>
              <path d={area} fill={`url(#${gid})`} />
              <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            <line x1={x(0)} x2={x(0)} y1={base} y2={y(points[0]!.value)} stroke={color} strokeWidth={2} strokeDasharray="3 3" />
          )}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} stroke="currentColor" strokeOpacity={0.2} className="text-ink" />
          )}
          {(hover !== null ? [hover] : [n - 1]).map((i) => (
            <circle key={i} cx={x(i)} cy={y(points[i]!.value)} r={5} fill={color} stroke="#FAF7F0" strokeWidth={2} />
          ))}
          <AxisLabels points={points} x={x} height={height} />
          {/* hit layer */}
          <rect x={PAD.left - 8} y={0} width={innerW + 16} height={height} fill="transparent" />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={x(hover)} width={width} label={points[hover]!.label} value={format(points[hover]!.value)} />
      )}
    </div>
  );
}

function ColumnChart({
  points,
  color,
  format,
  height = 220,
}: {
  points: Point[];
  color: string;
  format: (v: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const slot = innerW / n;
  const barW = Math.max(Math.min(slot - 2, 28), 2);
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - v / max);
  const base = y(0);

  const barPath = (i: number, v: number) => {
    const top = y(v);
    const h = base - top;
    if (h <= 0) return '';
    const left = x(i) - barW / 2;
    const r = Math.min(4, barW / 2, h);
    return `M${left},${base} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${base} Z`;
  };

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible" role="img" aria-label={`Orders per day, ${n} days`}>
          <GridLines width={width} max={max} y={y} format={(v) => String(Math.round(v))} />
          {points.map((p, i) => (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={base - PAD.top} fill="transparent" />
              <path
                d={barPath(i, p.value)}
                fill={color}
                fillOpacity={hover === null || hover === i ? 0.9 : 0.35}
                className="transition-[fill-opacity] duration-150"
              />
            </g>
          ))}
          <AxisLabels points={points} x={x} height={height} />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={x(hover)} width={width} label={points[hover]!.label} value={format(points[hover]!.value)} />
      )}
    </div>
  );
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const h = 40;
  const n = values.length;
  const max = Math.max(...values, 1);
  const pts =
    n > 1
      ? values.map((v, i) => `${(i / (n - 1)) * width},${h - 4 - (v / max) * (h - 8)}`)
      : [`0,${h - 4}`, `${width},${h - 4 - ((values[0] ?? 0) / max) * (h - 8)}`];
  return (
    <div ref={ref} className={className}>
      {width > 0 && (
        <svg width={width} height={h} aria-hidden>
          <defs>
            <linearGradient id="spark-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#C6DC4A" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#C6DC4A" stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon points={`0,${h} ${pts.join(' ')} ${width},${h}`} fill="url(#spark-grad)" />
          <polyline points={pts.join(' ')} fill="none" stroke="#C6DC4A" strokeWidth={1.75} strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
