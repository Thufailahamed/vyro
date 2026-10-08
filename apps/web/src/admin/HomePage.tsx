import { useState, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatCompactLKR, formatLKR, greetingForNow } from '@/lib/format';
import { StoreIcon, Building2Icon, AlertCircleIcon, ShieldCheckIcon, MapPinIcon } from './icons';
import { PackageIcon, UsersIcon, ArrowRightIcon, CheckCircleIcon, TrendingUpIcon } from '@/components/icons';
import { CommandCenter, useCommandCenter } from './CommandCenter';
import { AdminPage, CardLink, Pill, Segmented, StatCard, StatGrid } from './ui';
import { useAdminAuth } from './Shell';

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

const RANGE_DAYS: Record<AdminAnalyticsRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Sorts the sparse day buckets and fills missing days with zero so the trend reads honestly. */
function densifyDays(days: Array<{ day: string; cents: number }>, range: AdminAnalyticsRange) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!days.every((d) => iso.test(d.day))) return [...days].sort((a, b) => a.day.localeCompare(b.day));
  const byDay = new Map(days.map((d) => [d.day, d.cents]));
  const out: Array<{ day: string; cents: number }> = [];
  const today = new Date();
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let i = RANGE_DAYS[range] - 1; i >= 0; i--) {
    const key = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day: key, cents: byDay.get(key) ?? 0 });
  }
  // Keep any buckets outside the generated window (e.g. timezone edge) rather than dropping volume.
  for (const d of days) if (!out.some((o) => o.day === d.day)) out.push(d);
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export function AdminHomePage() {
  const [range, setRange] = useState<AdminAnalyticsRange>('30d');
  const { user } = useAdminAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', range],
    queryFn: () => api.get<AdminAnalytics>(`/analytics/admin?range=${range}`),
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const commandCenterQuery = useCommandCenter();
  const recentEvents = commandCenterQuery.data?.recentEvents ?? [];
  const needs = commandCenterQuery.data?.needsAction;
  const openItems = needs ? needs.stuckPayments + needs.payoutFailures + needs.slaBreaches + needs.openDisputes : null;

  const m = data?.metrics;
  const disputeElevated = m ? m.disputeRate > DISPUTE_THRESHOLD : false;
  const firstName = (user?.name || '').trim().split(/\s+/)[0];

  const effectiveTakeRatePct = useMemo(() => {
    if (!m || m.gmvCents <= 0) return null;
    return `${((m.takeRateCents / m.gmvCents) * 100).toFixed(2)}%`;
  }, [m]);

  const days = useMemo(() => densifyDays(data?.gmvByDay ?? [], range), [data?.gmvByDay, range]);
  const chartStats = useMemo(() => {
    const active = days.filter((d) => d.cents > 0);
    const peak = active.reduce<{ day: string; cents: number } | null>((best, d) => (!best || d.cents > best.cents ? d : best), null);
    const total = active.reduce((sum, d) => sum + d.cents, 0);
    return { activeDays: active.length, peak, avg: days.length ? total / days.length : 0 };
  }, [days]);

  const tiles = [
    {
      to: '/admin/businesses',
      label: 'Active buyers',
      value: m ? m.activeBuyers.toLocaleString() : '—',
      sub: 'Verified purchasing entities',
      icon: <Building2Icon size={17} />,
    },
    {
      to: '/admin/suppliers',
      label: 'Active suppliers',
      value: m ? m.activeSuppliers.toLocaleString() : '—',
      sub: 'Verified mills & wholesale hubs',
      icon: <StoreIcon size={17} />,
    },
    {
      to: '/admin/users',
      label: 'New signups',
      value: m ? m.newSignups.toLocaleString() : '—',
      sub: `Accounts created, ${RANGE_LABEL[range]}`,
      icon: <UsersIcon size={17} />,
    },
    {
      to: '/admin/disputed',
      label: 'Dispute rate',
      value: m ? fmtPct(m.disputeRate) : '—',
      sub: m ? (disputeElevated ? 'Above the 2% baseline' : 'Within the 2% baseline') : 'Share of orders disputed',
      icon: <AlertCircleIcon size={17} />,
      status: m ? (disputeElevated ? ('alert' as const) : ('ok' as const)) : undefined,
    },
  ];

  const dateLine = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <AdminPage>
      {/* ── Hero + needs-action strip ── */}
      <header className="relative isolate overflow-hidden rounded-[22px] bg-ink text-paper grain shadow-[0_30px_60px_-30px_rgba(12,14,11,0.6),inset_0_0_0_1px_rgba(250,247,240,0.06)]">
        <div className="hairline-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-32 -z-10 size-[28rem] rounded-full bg-volt/[0.14] blur-[90px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 left-1/4 -z-10 size-[22rem] rounded-full bg-copper/[0.12] blur-[90px]"
          aria-hidden
        />

        <div className="relative p-6 sm:p-9">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-2 rounded-full bg-paper/[0.05] py-1 pl-2 pr-3 text-[11px] font-medium text-paper/60 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)]">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full rounded-full bg-volt opacity-70 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-volt" />
                  </span>
                  Live · refreshes every 60s
                </span>
                <span className="text-[11px] font-medium text-paper/40">{dateLine}</span>
              </div>
              <h1 className="mt-5 font-display text-[2.5rem] font-bold leading-[1.02] tracking-[-0.045em] text-paper text-balance sm:text-[3.25rem]">
                {greetingForNow()}
                {firstName ? (
                  <>
                    , <span className="bg-gradient-to-r from-volt-glow via-volt to-[#a9c23a] bg-clip-text text-transparent">{firstName}</span>
                  </>
                ) : null}
                .
              </h1>
              <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-paper/55 text-pretty">
                {openItems == null
                  ? "Businesses, suppliers, order clearing and disputes across Sri Lanka's 25 districts."
                  : openItems === 0
                    ? 'Nothing needs your attention right now — payments, payouts, dispatch and disputes are all clear.'
                    : `${openItems} item${openItems === 1 ? '' : 's'} across payments, payouts, dispatch and disputes need${openItems === 1 ? 's' : ''} your attention.`}
              </p>
            </div>

            <Segmented
              dark
              ariaLabel="Date range"
              value={range}
              onChange={setRange}
              items={(['7d', '30d', '90d'] as const).map((r) => ({ key: r, label: r.toUpperCase() }))}
              className="shrink-0 self-start"
            />
          </div>

          <div className="mt-9">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/40">Needs action</span>
              <span className="h-px flex-1 bg-gradient-to-r from-paper/10 to-transparent" aria-hidden />
              {openItems === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-mint">
                  <CheckCircleIcon size={12} />
                  All clear
                </span>
              ) : null}
            </div>
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
        <section className="vyro-surface overflow-hidden lg:col-span-2" aria-labelledby="gmv-heading">
          <div className="flex flex-wrap items-start justify-between gap-4 p-6 pb-0">
            <div>
              <h2 id="gmv-heading" className="flex items-center gap-2 font-sans text-[13px] font-medium tracking-normal text-ink-3">
                Gross merchandise value
                <Pill tone="neutral">{RANGE_LABEL[range]}</Pill>
              </h2>
              <div className="mt-3 vyro-metric text-[2.5rem] leading-none text-ink sm:text-[3rem]">
                {isLoading ? <span className="inline-block h-11 w-64 rounded-md bg-mist/60 animate-pulse" /> : m ? formatLKR(m.gmvCents) : '—'}
              </div>
              <p className="mt-2.5 text-xs text-ink-4">Invoiced purchasing volume across all suppliers</p>
            </div>
            <Link
              to="/admin/finance"
              className="admin-btn admin-btn-secondary admin-btn-sm group"
            >
              SVAT invoicing ledger
              <ArrowRightIcon size={12} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="px-6 pt-6">
            {isLoading ? (
              <div className="h-52 rounded-lg bg-mist/40 animate-pulse" />
            ) : days.some((d) => d.cents > 0) ? (
              <GmvAreaChart days={days} />
            ) : (
              <EmptyNote icon={<TrendingUpIcon size={18} />}>Daily volume will appear once orders clear in this window.</EmptyNote>
            )}
          </div>

          <dl className="mt-6 grid grid-cols-3 divide-x divide-ink/[0.06] border-t border-ink/[0.06] bg-bone/40">
            {[
              { label: 'Peak day', value: chartStats.peak ? formatCompactLKR(chartStats.peak.cents) : '—', sub: chartStats.peak ? formatDay(chartStats.peak.day) : 'No volume yet' },
              { label: 'Daily average', value: formatCompactLKR(chartStats.avg), sub: `Across ${days.length || RANGE_DAYS[range]} days` },
              { label: 'Trading days', value: `${chartStats.activeDays}`, sub: `of ${days.length || RANGE_DAYS[range]} with orders` },
            ].map((s) => (
              <div key={s.label} className="min-w-0 px-4 py-4 sm:px-6">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-5">{s.label}</dt>
                <dd className="mt-1.5 truncate vyro-metric text-lg leading-none text-ink">{isLoading ? '—' : s.value}</dd>
                <dd className="mt-1 truncate text-[11px] text-ink-4">{s.sub}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-4">
          <section className="relative overflow-hidden rounded-[14px] bg-gradient-to-br from-[#1b1e17] to-ink p-6 text-paper shadow-[0_20px_40px_-24px_rgba(12,14,11,0.6),inset_0_0_0_1px_rgba(250,247,240,0.06)]">
            <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-volt/20 blur-3xl" aria-hidden />
            <div className="relative flex items-center justify-between gap-2">
              <h2 className="font-sans text-[13px] font-medium tracking-normal text-paper/60">Platform revenue</h2>
              {effectiveTakeRatePct && (
                <span className="rounded-full bg-volt px-2 py-0.5 text-[11px] font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                  {effectiveTakeRatePct} take rate
                </span>
              )}
            </div>
            <div className="relative mt-4 vyro-metric text-[2rem] leading-none text-paper">{m ? formatLKR(m.takeRateCents) : '—'}</div>
            <p className="relative mt-2.5 text-xs text-paper/45">Net platform fees from escrow clearing, {RANGE_LABEL[range]}</p>
          </section>

          <section className="vyro-surface p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-sans text-[13px] font-medium tracking-normal text-ink-3">Fulfilment completion</h2>
              {m && <StatusChip status={m.completionRate > 0.8 ? 'ok' : 'warn'} okLabel="On track" warnLabel="Below 80%" />}
            </div>
            <div className="mt-4 flex items-center gap-5">
              <CompletionRing value={m?.completionRate ?? 0} />
              <div className="min-w-0">
                <div className="vyro-metric text-[2rem] leading-none text-ink">{m ? fmtPct(m.completionRate) : '—'}</div>
                <p className="mt-2 text-xs leading-relaxed text-ink-4">GRN sign-offs confirmed by receiving businesses. Target 80%.</p>
              </div>
            </div>
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
          barClass="from-copper-soft to-copper"
          rows={(data?.topCategories ?? []).map((c) => ({ key: c.categoryId, label: c.name, cents: c.cents }))}
          rowIcon={<PackageIcon size={14} />}
          empty="Category volume will populate as purchase orders clear."
        />
        <RankedPanel
          title="Top districts"
          linkTo="/admin/deliveries"
          linkLabel="Deliveries"
          loading={isLoading}
          barClass="from-volt-glow to-volt-deep"
          rows={(data?.topRegions ?? []).map((r) => ({ key: r.district, label: r.district, cents: r.cents }))}
          rowIcon={<MapPinIcon size={14} />}
          empty="District volume will populate as deliveries complete."
        />
      </div>

      {/* ── Shortcuts & activity ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="shortcuts-heading">
          <div className="mb-3 flex items-center gap-3">
            <h2 id="shortcuts-heading" className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-4">
              Manage
            </h2>
            <span className="h-px flex-1 bg-gradient-to-r from-ink/10 to-transparent" aria-hidden />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Shortcut to="/admin/suppliers" icon={<StoreIcon size={18} />} title="Suppliers" body="Verified millers, dispatch facilities and catalog listings." />
            <Shortcut to="/admin/businesses" icon={<Building2Icon size={18} />} title="Buyer businesses" body="Purchasing entities, restaurant chains and credit terms." />
            <Shortcut to="/admin/disputed" icon={<AlertCircleIcon size={18} />} title="Disputes" body="Receiving disputes, weight variances and driver sign-offs." />
            <Shortcut to="/admin/security" icon={<ShieldCheckIcon size={18} />} title="Security & audit" body="Audit logs, session revocations and access rights." />
          </div>
        </section>

        <section className="vyro-surface flex flex-col p-6" aria-labelledby="activity-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="activity-heading" className="font-sans text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
              Recent activity
            </h2>
            <CardLink to="/admin/activity">Audit log</CardLink>
          </div>

          {recentEvents.length > 0 ? (
            <ol className="mt-5">
              {recentEvents.slice(0, 6).map((evt, i, arr) => (
                <li key={evt.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                  {i < arr.length - 1 && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-gradient-to-b from-ink/15 to-ink/[0.04]" aria-hidden />}
                  <span
                    className={cn(
                      'relative mt-1 flex size-[15px] shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]',
                      i === 0 ? 'bg-volt-soft' : 'bg-paper',
                    )}
                    aria-hidden
                  >
                    <span className={cn('size-[5px] rounded-full', i === 0 ? 'bg-volt-deep' : 'bg-ink-5')} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{formatAction(evt.action)}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-4">
                      <span>{formatRelativeTime(evt.createdAt)}</span>
                      <span aria-hidden className="text-ink-6">•</span>
                      <span className="font-mono text-ink-5">{evt.id.slice(0, 8)}</span>
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
    <div className="flex h-full min-h-36 flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-ink/10 bg-bone/40 px-6 py-8 text-center">
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-paper text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">{icon}</span>
      <p className="max-w-xs text-xs leading-relaxed text-ink-4">{children}</p>
    </div>
  );
}

function CompletionRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 26;
  const c = 2 * Math.PI * r;
  const ok = pct > 0.8;
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-16 shrink-0 -rotate-90"
      role="progressbar"
      aria-label="Fulfilment completion"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(12,14,11,0.07)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(12,14,11,0.18)" strokeWidth="7" strokeDasharray={`1.2 ${c / 40 - 1.2}`} opacity="0.4" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={ok ? '#3D8B6E' : '#C4843A'}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        className="transition-[stroke-dasharray] duration-480 ease-vyro"
      />
    </svg>
  );
}

function GmvAreaChart({ days }: { days: Array<{ day: string; cents: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const max = Math.max(...days.map((d) => d.cents), 1);
  const n = days.length;
  const sparseLayout = n < 3 || days.filter((d) => d.cents > 0).length / n < 0.6;
  const x = (i: number) => (sparseLayout ? ((i + 0.5) / n) * W : n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 16) - 2;

  // Smooth monotone-ish path using cardinal-to-bezier with low tension.
  const pts = days.map((d, i) => [x(i), y(d.cents)] as const);
  let line = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    line += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const area = `${line} L ${pts[pts.length - 1]![0]} ${H} L ${pts[0]![0]} ${H} Z`;
  const hp = hover != null ? pts[hover] : null;
  // A smooth line implies continuity; when most days have no orders, columns read more honestly.
  const columns = sparseLayout;
  const colW = W / n;

  return (
    <figure>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[max, max / 2, 0].map((v, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={cn('h-px flex-1', i === 2 ? 'bg-ink/15' : 'border-t border-dashed border-ink/[0.08]')} />
              <span className="w-14 shrink-0 text-right text-[10px] text-ink-5 num-tabular">{formatCompactLKR(v)}</span>
            </div>
          ))}
        </div>

        <div
          className="relative mr-[4.25rem] h-52"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = (e.clientX - rect.left) / rect.width;
            setHover(Math.max(0, Math.min(n - 1, sparseLayout ? Math.floor(rel * n) : Math.round(rel * (n - 1)))));
          }}
          role="img"
          aria-label={`Daily GMV over ${n} days, peak ${formatLKR(max)}`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            <defs>
              <linearGradient id="gmv-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#C6DC4A" stopOpacity="0.45" />
                <stop offset="70%" stopColor="#C6DC4A" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#C6DC4A" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="gmv-col" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#1A1C18" />
                <stop offset="100%" stopColor="#3F433C" />
              </linearGradient>
            </defs>
            {columns ? (
              days.map((d, i) => {
                const h = d.cents > 0 ? Math.max(3, H - y(d.cents)) : 2;
                const w = Math.min(28, colW * 0.62);
                const dim = hover != null && hover !== i;
                return (
                  <rect
                    key={d.day}
                    x={i * colW + (colW - w) / 2}
                    y={H - h}
                    width={w}
                    height={h}
                    rx={Math.min(3, w / 2)}
                    fill={d.cents > 0 ? (hover === i ? '#C6DC4A' : 'url(#gmv-col)') : 'rgba(12,14,11,0.08)'}
                    opacity={dim ? 0.35 : 1}
                    className="transition-opacity duration-140"
                  />
                );
              })
            ) : (
              <>
                <path d={area} fill="url(#gmv-fill)" className="animate-fade-in" />
                <path d={line} fill="none" stroke="#0C0E0B" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </>
            )}
            {hp && !columns ? <line x1={hp[0]} x2={hp[0]} y1={0} y2={H} stroke="rgba(12,14,11,0.25)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {hp && hover != null ? (
            <>
              {!columns && <span
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-volt shadow-[0_0_0_3px_#0C0E0B,0_0_0_6px_rgba(198,220,74,0.35)]"
                style={{ left: `${(hp[0] / W) * 100}%`, top: `${(hp[1] / H) * 100}%` }}
              />}
              <div
                className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-paper shadow-[0_12px_28px_-8px_rgba(12,14,11,0.5)]"
                style={{
                  left: `clamp(56px, ${(hp[0] / W) * 100}%, calc(100% - 56px))`,
                  top: `calc(${(hp[1] / H) * 100}% - 3.75rem)`,
                }}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-paper/50">{formatDay(days[hover]!.day)}</div>
                <div className="mt-0.5 text-[13px] font-semibold num-tabular">{formatLKR(days[hover]!.cents)}</div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <figcaption className="mr-[4.25rem] mt-2.5 flex justify-between text-[10px] font-medium text-ink-5">
        <span>{formatDay(days[0]!.day)}</span>
        {n > 2 ? <span>{formatDay(days[Math.floor(n / 2)]!.day)}</span> : null}
        <span>{formatDay(days[n - 1]!.day)}</span>
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
        <h2 className="font-sans text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <CardLink to={linkTo}>{linkLabel}</CardLink>
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
                <span className="flex min-w-0 items-center gap-2.5 text-ink">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold num-tabular',
                      i === 0 ? 'bg-ink text-volt' : 'bg-bone text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="shrink-0 text-ink-4">{rowIcon}</span>
                  <span className="truncate text-[13px] font-medium">{r.label}</span>
                </span>
                <span className="shrink-0 text-[13px] num-tabular text-ink">
                  {formatCompactLKR(r.cents)}
                  <span className="ml-2 text-xs text-ink-4">{Math.round((r.cents / total) * 100)}%</span>
                </span>
              </div>
              <div className="mt-2 ml-[1.875rem] h-1.5 overflow-hidden rounded-full bg-ink/[0.05]">
                <div
                  className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-480 ease-vyro', barClass)}
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
      className="group vyro-surface flex items-start gap-4 p-5 transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_18px_36px_-20px_rgba(12,14,11,0.35)]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-b from-paper to-bone text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)] transition-all duration-240 group-hover:from-ink group-hover:to-charcoal group-hover:text-volt">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-sans text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
          <ArrowRightIcon size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-1 group-hover:text-ink" />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">{body}</p>
      </div>
    </Link>
  );
}
