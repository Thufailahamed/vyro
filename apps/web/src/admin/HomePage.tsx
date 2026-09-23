import { useState, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatCompactLKR, formatLKR, greetingForNow } from '@/lib/format';
import { StoreIcon, Building2Icon, AlertCircleIcon, ShieldCheckIcon, MapPinIcon } from './icons';
import { PackageIcon, UsersIcon, ArrowRightIcon, CheckCircleIcon, TrendingUpIcon } from '@/components/icons';
import { FlowCanvas } from '@/components/brand/FlowLine';
import { CommandCenter, useCommandCenter } from './CommandCenter';
import { AdminPage, Pill, StatCard, StatGrid } from './ui';

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

const RANGE_LABEL: Record<AdminAnalyticsRange, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
};

const DISPUTE_THRESHOLD = 0.02;

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

function formatDay(day: string) {
  const d = new Date(day);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

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
  const disputeElevated = m ? m.disputeRate > DISPUTE_THRESHOLD : false;

  const effectiveTakeRatePct = useMemo(() => {
    if (!m || m.gmvCents <= 0) return null;
    return `${((m.takeRateCents / m.gmvCents) * 100).toFixed(2)}%`;
  }, [m]);

  const tiles = [
    {
      to: '/admin/businesses',
      label: 'Active buyers',
      value: m ? m.activeBuyers.toLocaleString() : '—',
      sub: 'Verified purchasing entities',
      icon: <Building2Icon size={18} />,
    },
    {
      to: '/admin/suppliers',
      label: 'Active suppliers',
      value: m ? m.activeSuppliers.toLocaleString() : '—',
      sub: 'Verified mills & wholesale hubs',
      icon: <StoreIcon size={18} />,
    },
    {
      to: '/admin/users',
      label: 'New signups',
      value: m ? m.newSignups.toLocaleString() : '—',
      sub: `Accounts created, ${RANGE_LABEL[range]}`,
      icon: <UsersIcon size={18} />,
    },
    {
      to: '/admin/disputed',
      label: 'Dispute rate',
      value: m ? fmtPct(m.disputeRate) : '—',
      sub: m ? (disputeElevated ? 'Above the 2% baseline' : 'Within the 2% baseline') : 'Share of orders disputed',
      icon: <AlertCircleIcon size={18} />,
      status: m ? (disputeElevated ? ('alert' as const) : ('ok' as const)) : undefined,
    },
  ];

  return (
    <AdminPage>
      {/* ── Header + needs-action strip ── */}
      <header className="relative overflow-hidden rounded-2xl bg-ink text-paper grain shadow-3">
        <div className="absolute inset-0 opacity-40">
          <FlowCanvas tone="paper" density="hero" />
        </div>

        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="vyro-kicker text-volt">VYRO Control</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-volt/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-volt">
                  <span className="size-1.5 rounded-full bg-volt motion-safe:animate-pulse" />
                  Live · refreshes every 60s
                </span>
              </div>
              <h1 className="mt-3 vyro-display text-4xl sm:text-5xl text-paper">{greetingForNow()}.</h1>
              <p className="mt-3 max-w-xl text-sm text-paper/60">
                Businesses, suppliers, order clearing and disputes across Sri Lanka's 25 districts — at a glance.
              </p>
            </div>

            <div
              className="inline-flex shrink-0 self-start rounded-lg bg-paper/[0.06] p-1 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.1)] md:self-auto"
              role="group"
              aria-label="Date range"
            >
              {(['7d', '30d', '90d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={cn(
                    'rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200',
                    range === r ? 'bg-volt text-ink' : 'text-paper/60 hover:bg-paper/10 hover:text-paper',
                  )}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-paper/45">Needs action</div>
            <CommandCenter variant="dark" />
          </div>
        </div>
      </header>

      {/* ── KPI tiles ── */}
      <StatGrid>
        {tiles.map((t) => (
          <StatCard
            key={t.to}
            to={t.to}
            label={t.label}
            value={t.value}
            sub={t.sub}
            icon={t.icon}
            loading={isLoading}
            status={t.status && <StatusChip status={t.status} />}
          />
        ))}
      </StatGrid>

      {/* ── Economics ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="vyro-surface p-6 lg:col-span-2" aria-labelledby="gmv-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="gmv-heading" className="text-sm font-medium text-ink-3 font-sans tracking-normal">
                Gross merchandise value
              </h2>
              <div className="mt-2 vyro-metric text-4xl sm:text-5xl leading-none text-ink">
                {isLoading ? <span className="inline-block h-10 w-56 rounded-md bg-mist/60 animate-pulse" /> : m ? formatLKR(m.gmvCents) : '—'}
              </div>
              <p className="mt-2 text-xs text-ink-4">Invoiced purchasing volume, {RANGE_LABEL[range]}</p>
            </div>
            <Link
              to="/admin/finance"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] transition-colors hover:bg-ink hover:text-paper"
            >
              SVAT invoicing ledger
              <ArrowRightIcon size={12} />
            </Link>
          </div>

          <div className="mt-8">
            {isLoading ? (
              <div className="h-44 rounded-lg bg-mist/40 animate-pulse" />
            ) : data?.gmvByDay && data.gmvByDay.length > 0 ? (
              <DailyGmvChart days={data.gmvByDay} />
            ) : (
              <EmptyNote icon={<TrendingUpIcon size={18} />}>Daily volume will appear once orders clear in this window.</EmptyNote>
            )}
          </div>
        </section>

        <div className="grid gap-4">
          <section className="vyro-surface p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-ink-3 font-sans tracking-normal">Platform revenue</h2>
              {effectiveTakeRatePct && (
                <span className="rounded-md bg-volt-soft px-2 py-0.5 text-[11px] font-semibold text-ink">
                  {effectiveTakeRatePct} take rate
                </span>
              )}
            </div>
            <div className="mt-3 vyro-metric text-3xl leading-none text-ink">
              {m ? formatLKR(m.takeRateCents) : '—'}
            </div>
            <p className="mt-2 text-xs text-ink-4">Net platform fees from escrow clearing</p>
          </section>

          <section className="vyro-surface p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-ink-3 font-sans tracking-normal">Fulfilment completion</h2>
              {m && <StatusChip status={m.completionRate > 0.8 ? 'ok' : 'warn'} okLabel="On track" warnLabel="Below 80%" />}
            </div>
            <div className="mt-3 vyro-metric text-3xl leading-none text-ink">{m ? fmtPct(m.completionRate) : '—'}</div>
            <div
              className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-bone"
              role="progressbar"
              aria-label="Fulfilment completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((m?.completionRate ?? 0) * 100)}
            >
              <div
                className="h-full rounded-full bg-mint transition-[width] duration-480 ease-vyro"
                style={{ width: `${Math.min(100, Math.round((m?.completionRate ?? 0) * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-4">GRN sign-offs confirmed by receiving businesses</p>
          </section>
        </div>
      </div>

      {/* ── Categories & districts ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <RankedPanel
          title="Top product categories"
          linkTo="/admin/catalog"
          linkLabel="Catalog"
          loading={isLoading}
          barClass="bg-copper"
          rows={(data?.topCategories ?? []).map((c) => ({ key: c.categoryId, label: c.name, cents: c.cents }))}
          rowIcon={<PackageIcon size={14} />}
          empty="Category volume will populate as purchase orders clear."
        />
        <RankedPanel
          title="Top districts"
          linkTo="/admin/deliveries"
          linkLabel="Deliveries"
          loading={isLoading}
          barClass="bg-volt-deep"
          rows={(data?.topRegions ?? []).map((r) => ({ key: r.district, label: r.district, cents: r.cents }))}
          rowIcon={<MapPinIcon size={14} />}
          empty="District volume will populate as deliveries complete."
        />
      </div>

      {/* ── Shortcuts & activity ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="shortcuts-heading">
          <h2 id="shortcuts-heading" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4 font-sans">
            Manage
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Shortcut to="/admin/suppliers" icon={<StoreIcon size={18} />} title="Suppliers" body="Verified millers, dispatch facilities and catalog listings." />
            <Shortcut to="/admin/businesses" icon={<Building2Icon size={18} />} title="Buyer businesses" body="Purchasing entities, restaurant chains and credit terms." />
            <Shortcut to="/admin/disputed" icon={<AlertCircleIcon size={18} />} title="Disputes" body="Receiving disputes, weight variances and driver sign-offs." />
            <Shortcut to="/admin/security" icon={<ShieldCheckIcon size={18} />} title="Security & audit" body="Audit logs, session revocations and access rights." />
          </div>
        </section>

        <section className="vyro-surface flex flex-col p-6" aria-labelledby="activity-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="activity-heading" className="text-sm font-semibold text-ink font-sans tracking-normal">
              Recent activity
            </h2>
            <Link to="/admin/audit" className="inline-flex items-center gap-1 text-xs font-medium text-copper hover:text-ink transition-colors">
              Audit log
              <ArrowRightIcon size={12} />
            </Link>
          </div>

          {recentEvents.length > 0 ? (
            <ol className="mt-5 space-y-0">
              {recentEvents.slice(0, 6).map((evt, i, arr) => (
                <li key={evt.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < arr.length - 1 && <span className="absolute left-[3px] top-3 bottom-0 w-px bg-ink/10" aria-hidden />}
                  <span className="relative mt-1.5 size-[7px] shrink-0 rotate-45 bg-ink-4" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{formatAction(evt.action)}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-4">
                      <span>{formatRelativeTime(evt.createdAt)}</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{evt.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-5 flex-1">
              <EmptyNote icon={<ShieldCheckIcon size={18} />}>No admin activity recorded yet.</EmptyNote>
            </div>
          )}
        </section>
      </div>
    </AdminPage>
  );
}

function StatusChip({
  status,
  okLabel = 'Normal',
  warnLabel = 'Watch',
  alertLabel = 'Elevated',
}: {
  status: 'ok' | 'warn' | 'alert';
  okLabel?: string;
  warnLabel?: string;
  alertLabel?: string;
}) {
  const cfg = {
    ok: { tone: 'success' as const, icon: <CheckCircleIcon size={11} />, label: okLabel },
    warn: { tone: 'warning' as const, icon: <AlertCircleIcon size={11} />, label: warnLabel },
    alert: { tone: 'danger' as const, icon: <AlertCircleIcon size={11} />, label: alertLabel },
  }[status];
  return (
    <Pill tone={cfg.tone} icon={cfg.icon}>
      {cfg.label}
    </Pill>
  );
}

function EmptyNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-lg bg-bone/60 px-6 py-8 text-center">
      <span className="text-ink-4">{icon}</span>
      <p className="max-w-xs text-xs text-ink-4">{children}</p>
    </div>
  );
}

function DailyGmvChart({ days }: { days: Array<{ day: string; cents: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.cents), 1);
  const active = hover !== null ? days[hover] : null;

  return (
    <figure>
      <div className="relative">
        {/* Recessive grid: max and midpoint */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[max, max / 2, 0].map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-right text-[10px] text-ink-4 num-tabular">{formatCompactLKR(v)}</span>
              <span className={cn('h-px flex-1', i === 2 ? 'bg-ink/20' : 'bg-ink/[0.06]')} />
            </div>
          ))}
        </div>

        <div className="relative ml-[4.5rem] flex h-44 items-end gap-0.5" onMouseLeave={() => setHover(null)} role="img" aria-label={`Daily GMV over ${days.length} days, peak ${formatLKR(max)}`}>
          {days.map((d, i) => {
            const pct = Math.max(2, (d.cents / max) * 100);
            return (
              <div
                key={d.day}
                className="relative flex h-full flex-1 min-w-[3px] items-end cursor-default"
                onMouseEnter={() => setHover(i)}
              >
                <div
                  className={cn(
                    'w-full rounded-t-[4px] transition-colors duration-140',
                    hover === null || hover === i ? 'bg-ink' : 'bg-ink/25',
                  )}
                  style={{ height: `${pct}%` }}
                />
              </div>
            );
          })}

          {active && hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-paper shadow-3"
              style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
            >
              <div className="text-[10px] text-paper/60">{formatDay(active.day)}</div>
              <div className="text-xs font-semibold num-tabular">{formatLKR(active.cents)}</div>
            </div>
          )}
        </div>
      </div>

      <figcaption className="ml-[4.5rem] mt-2 flex justify-between text-[10px] text-ink-4">
        <span>{formatDay(days[0]!.day)}</span>
        <span>{days.length} days</span>
        <span>{formatDay(days[days.length - 1]!.day)}</span>
      </figcaption>

      <table className="sr-only">
        <caption>Daily GMV</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>GMV</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{formatDay(d.day)}</td>
              <td>{formatLKR(d.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function RankedPanel({
  title,
  linkTo,
  linkLabel,
  loading,
  rows,
  barClass,
  rowIcon,
  empty,
}: {
  title: string;
  linkTo: string;
  linkLabel: string;
  loading: boolean;
  rows: Array<{ key: string; label: string; cents: number }>;
  barClass: string;
  rowIcon: ReactNode;
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.cents), 1);
  const total = rows.reduce((sum, r) => sum + r.cents, 0) || 1;

  return (
    <section className="vyro-surface p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink font-sans tracking-normal">{title}</h2>
        <Link to={linkTo} className="inline-flex items-center gap-1 text-xs font-medium text-copper hover:text-ink transition-colors">
          {linkLabel}
          <ArrowRightIcon size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="mt-5 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 rounded-md bg-mist/50 animate-pulse" />
          ))}
        </div>
      ) : rows.length > 0 ? (
        <ol className="mt-5 space-y-4">
          {rows.map((r, i) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-ink">
                  <span className="w-4 shrink-0 text-[11px] text-ink-4 num-tabular">{i + 1}</span>
                  <span className="shrink-0 text-ink-4">{rowIcon}</span>
                  <span className="truncate font-medium">{r.label}</span>
                </span>
                <span className="shrink-0 num-tabular text-ink">
                  {formatCompactLKR(r.cents)}
                  <span className="ml-2 text-xs text-ink-4">{Math.round((r.cents / total) * 100)}%</span>
                </span>
              </div>
              <div className="mt-2 ml-6 h-1.5 overflow-hidden rounded-full bg-bone">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-480 ease-vyro', barClass)}
                  style={{ width: `${Math.max(2, (r.cents / max) * 100)}%` }}
                  title={formatLKR(r.cents)}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5">
          <EmptyNote icon={rowIcon}>{empty}</EmptyNote>
        </div>
      )}
    </section>
  );
}

function Shortcut({ to, icon, title, body }: { to: string; icon: ReactNode; title: string; body: string }) {
  return (
    <Link
      to={to}
      className="group vyro-surface flex items-start gap-4 p-5 transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-2"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-bone text-ink transition-colors group-hover:bg-ink group-hover:text-volt">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <ArrowRightIcon size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-1 group-hover:text-copper" />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">{body}</p>
      </div>
    </Link>
  );
}
