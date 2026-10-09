import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn, Sparkline } from '@vyro/ui';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  UserCheckIcon,
  BanknoteIcon,
} from '@/components/icons';
import { usePermission } from './lib/permissions';
import { useHealthSnapshot, useCronJobs, useTriggerCron, type CronJobInfo } from './useAdminObservability';
import { relativeTime } from './registryUi';
import { NavCount, ObservabilityNav, fmtClock, humanizeCron, nextCronRun, untilLabel } from './observabilityUi';
import {
  AdminPage,
  AdminPageHeader,
  Button,
  Callout,
  CardLink,
  EmptyBlock,
  Pill,
  SectionLabel,
  Skeleton,
  TableCard,
  type PillTone,
} from './ui';

type Tab = 'health' | 'cron';

const LATENCY_WARN = 100;
const LATENCY_BAD = 250;
const REFRESH_MS = 30_000;

/** Re-renders every `ms` so relative labels and countdowns stay fresh. */
function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function ObservabilityPage() {
  const [params] = useSearchParams();
  const tab: Tab = params.get('tab') === 'cron' ? 'cron' : 'health';

  const snap = useHealthSnapshot();
  const cron = useCronJobs();
  const now = useNow(5_000);
  const fetching = snap.isFetching || cron.isFetching;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Infrastructure & reliability"
        title="Observability"
        description="Live platform health, operational backlogs and the scheduled Cloudflare Worker jobs that keep VYRO running."
        actions={
          <>
            {snap.dataUpdatedAt > 0 && (
              <span className="hidden items-center gap-2 text-xs text-ink-4 sm:inline-flex">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-mint" />
                </span>
                Updated {Math.max(0, Math.round((now - snap.dataUpdatedAt) / 1000))}s ago
              </span>
            )}
            <Button
              onClick={() => {
                void snap.refetch();
                void cron.refetch();
              }}
              disabled={fetching}
            >
              <RefreshCwIcon size={14} className={cn(fetching && 'animate-spin')} />
              Refresh
            </Button>
          </>
        }
      />

      <ObservabilityNav badges={{ cron: <NavCount n={cron.data?.jobs.length ?? 0} /> }} />

      {tab === 'health' ? <HealthTab /> : <CronTab />}
    </AdminPage>
  );
}

// ----------------------------------------------------------------------
// Health
// ----------------------------------------------------------------------

type Level = 'ok' | 'attention' | 'degraded';

function HealthTab() {
  const can = usePermission('health:read');
  const snap = useHealthSnapshot();
  const now = useNow(1_000);

  // Latency samples collected while the page is open (one per snapshot).
  const [samples, setSamples] = useState<number[]>([]);
  const capturedAt = snap.data?.capturedAt;
  const latencyNow = snap.data?.dbLatencyMs;
  useEffect(() => {
    if (latencyNow == null) return;
    setSamples((s) => [...s.slice(-29), latencyNow]);
  }, [capturedAt, latencyNow]);

  if (!can) {
    return <Callout tone="warning" title="Permission required">You need the health:read permission to view system health.</Callout>;
  }
  if (snap.isError) {
    return <Callout tone="danger" title="Couldn’t load the health snapshot">{(snap.error as Error).message}</Callout>;
  }

  const d = snap.data;
  if (!d) return <HealthSkeleton />;

  const latency = d.dbLatencyMs;
  const failed = d.failedWebhookDeliveries24h;
  const backlogs = [
    {
      key: 'abuse',
      label: 'Abuse reports',
      value: d.openAbuseReports,
      unit: 'open tickets',
      icon: <ShieldCheckIcon size={16} />,
      to: '/admin/trust-safety?tab=reports',
      cta: 'Review queue',
    },
    {
      key: 'kyc',
      label: 'KYC applications',
      value: d.pendingKyc,
      unit: 'awaiting review',
      icon: <UserCheckIcon size={16} />,
      to: '/admin/trust-safety?tab=kyc',
      cta: 'Inspect KYC',
    },
    {
      key: 'refunds',
      label: 'Refund requests',
      value: d.pendingRefunds,
      unit: 'pending claims',
      icon: <BanknoteIcon size={16} />,
      to: '/admin/disputed',
      cta: 'Open disputes',
    },
  ];
  const backlogTotal = backlogs.reduce((n, b) => n + b.value, 0);

  const issues: string[] = [];
  if (latency >= LATENCY_BAD) issues.push(`D1 latency is elevated at ${latency} ms`);
  if (failed > 0) issues.push(`${failed} webhook ${failed === 1 ? 'delivery' : 'deliveries'} failed in the last 24h`);
  const level: Level = issues.length ? 'degraded' : backlogTotal > 0 ? 'attention' : 'ok';

  const hero = {
    ok: { title: 'All systems operational', body: 'Database, webhook delivery and review queues are all within normal range.' },
    attention: {
      title: 'Systems healthy',
      body: `Infrastructure is within range. ${backlogTotal} ${backlogTotal === 1 ? 'item is' : 'items are'} waiting for an admin in the review queues.`,
    },
    degraded: { title: 'Degraded performance', body: `${issues.join(' · ')}.` },
  }[level];

  const nextRefresh = Math.max(0, Math.ceil((d.capturedAt + REFRESH_MS - now) / 1000));
  const latencyTone: PillTone = latency < LATENCY_WARN ? 'success' : latency < LATENCY_BAD ? 'info' : 'warning';

  return (
    <div className="space-y-7">
      {/* Status hero */}
      <section className="relative overflow-hidden rounded-[20px] bg-ink text-paper shadow-[0_30px_60px_-34px_rgba(12,14,11,0.8)]">
        <div
          className={cn(
            'pointer-events-none absolute -left-20 -top-28 size-80 rounded-full blur-3xl',
            level === 'degraded' ? 'bg-rose/25' : level === 'attention' ? 'bg-amber/20' : 'bg-volt/20',
          )}
          aria-hidden
        />
        <div className="relative grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-2xl text-ink',
                level === 'degraded' ? 'bg-rose text-paper' : level === 'attention' ? 'bg-amber' : 'bg-volt',
              )}
            >
              {level === 'degraded' ? <AlertTriangleIcon size={22} /> : <CheckCircleIcon size={22} />}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-paper">{hero.title}</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-paper/65 text-pretty">{hero.body}</p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-paper/[0.08] shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)]">
            <HeroVital label="D1 latency" value={latency} unit="ms" bad={latency >= LATENCY_BAD} />
            <HeroVital label="Failed hooks" value={failed} unit="24h" bad={failed > 0} />
            <HeroVital label="In review" value={backlogTotal} unit="items" />
          </dl>
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-paper/[0.08] px-6 py-3 text-xs text-paper/50 sm:px-7">
          <span>
            Snapshot <span className="font-mono text-paper/75 num-tabular">{fmtClock(d.capturedAt)}</span>
          </span>
          <span className="num-tabular">{nextRefresh > 0 ? `Next refresh in ${nextRefresh}s` : 'Refreshing…'}</span>
        </div>
      </section>

      {/* Infrastructure */}
      <div className="space-y-4">
        <SectionLabel>Infrastructure</SectionLabel>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            label="D1 response latency"
            icon={<TrendingUpIcon size={16} />}
            value={latency}
            unit="ms"
            pill={<Pill tone={latencyTone} dot>{latency < LATENCY_WARN ? 'Optimal' : latency < LATENCY_BAD ? 'Normal' : 'Elevated'}</Pill>}
            caption="SQLite read/write probe"
          >
            <div className="mt-4 space-y-2">
              {samples.length >= 2 ? (
                <Sparkline values={samples} width={320} height={36} tone={latency >= LATENCY_BAD ? 'amber' : 'mint'} className="h-9 w-full" />
              ) : (
                <div className="flex h-9 items-center text-[11px] text-ink-5">Collecting samples…</div>
              )}
              <LatencyScale ms={latency} />
            </div>
          </MetricCard>
          <MetricCard
            label="Pending webhooks"
            icon={<ClockIcon size={16} />}
            value={d.pendingWebhookDeliveries}
            unit="events"
            pill={
              <Pill tone={d.pendingWebhookDeliveries === 0 ? 'success' : 'warning'} dot>
                {d.pendingWebhookDeliveries === 0 ? 'Queue clear' : 'In flight'}
              </Pill>
            }
            caption="Awaiting dispatch"
            link={{ to: '/admin/platform?tab=webhooks', label: 'Webhooks' }}
          />
          <MetricCard
            label="Failed webhooks"
            icon={<AlertCircleIcon size={16} />}
            value={failed}
            unit="last 24h"
            danger={failed > 0}
            pill={<Pill tone={failed === 0 ? 'success' : 'danger'} dot>{failed === 0 ? 'No errors' : 'Failures'}</Pill>}
            caption="Timeouts and non-2xx responses"
            link={{ to: '/admin/platform?tab=webhooks', label: 'Deliveries' }}
          />
        </div>
      </div>

      {/* Backlogs */}
      <div className="space-y-4">
        <SectionLabel>Review queues</SectionLabel>
        <div className="grid gap-4 md:grid-cols-3">
          {backlogs.map((b) => (
            <Link
              key={b.key}
              to={b.to}
              className="vyro-surface group relative flex items-center gap-4 p-5 transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_18px_36px_-20px_rgba(12,14,11,0.35)]"
            >
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                  b.value > 0 ? 'bg-amber/[0.12] text-[#a86c28]' : 'bg-mint/[0.1] text-mint',
                )}
              >
                {b.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink-3">{b.label}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="vyro-metric text-2xl leading-none text-ink">{b.value}</span>
                  <span className="text-xs text-ink-4">{b.value === 0 ? 'all clear' : b.unit}</span>
                </div>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-ink-4 transition-colors group-hover:text-ink">
                <span className="hidden lg:inline">{b.cta}</span>
                <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent operations */}
      <TableCard
        title="Recent platform operations"
        description="Administrative writes and operational mutations from the last 24 hours."
        actions={<CardLink to="/admin/activity">Full audit log</CardLink>}
      >
        {d.recentErrors.length === 0 ? (
          <div className="border-t border-ink/[0.07]">
            <EmptyBlock icon={<FileTextIcon size={20} />} title="No recent operations" description="Nothing has been recorded in the last 24 hours." />
          </div>
        ) : (
          <ol className="border-t border-ink/[0.07]">
            {d.recentErrors.slice(0, 15).map((r, i) => (
              <li key={`${r.createdAt}-${i}`} className="relative flex items-start gap-4 px-5 py-3 sm:px-6">
                <span className="relative mt-1.5 flex flex-col items-center self-stretch" aria-hidden>
                  <span className="size-2 rounded-full bg-ink/25 ring-4 ring-paper" />
                  {i < Math.min(15, d.recentErrors.length) - 1 && <span className="mt-1 w-px flex-1 bg-ink/[0.08]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[12px] font-semibold text-ink">{r.action}</div>
                  {r.status && <div className="mt-0.5 truncate font-mono text-[11px] text-ink-4" title={r.status}>{r.status}</div>}
                </div>
                <time className="shrink-0 text-right text-xs text-ink-4 num-tabular" title={fmtClock(r.createdAt)}>
                  {relativeTime(r.createdAt, now)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </TableCard>
    </div>
  );
}

function HeroVital({ label, value, unit, bad }: { label: string; value: number; unit: string; bad?: boolean | undefined }) {
  return (
    <div className="bg-ink/60 px-5 py-4 text-center lg:min-w-[124px]">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-paper/45">{label}</dt>
      <dd className="mt-1.5 flex items-baseline justify-center gap-1">
        <span className={cn('vyro-metric text-[1.75rem] leading-none', bad ? 'text-rose' : 'text-paper')}>{value}</span>
        <span className="text-[11px] text-paper/45">{unit}</span>
      </dd>
    </div>
  );
}

/** 0–300ms scale with the optimal / normal / elevated bands and a marker. */
function LatencyScale({ ms }: { ms: number }) {
  const max = 300;
  const pos = Math.min(100, (ms / max) * 100);
  return (
    <div>
      <div className="relative flex h-1.5 gap-[2px] overflow-visible">
        <span className="h-full rounded-l-full bg-mint/50" style={{ width: `${(LATENCY_WARN / max) * 100}%` }} />
        <span className="h-full bg-copper/40" style={{ width: `${((LATENCY_BAD - LATENCY_WARN) / max) * 100}%` }} />
        <span className="h-full flex-1 rounded-r-full bg-amber/45" />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-paper transition-[left] duration-500"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-5 num-tabular">
        <span>0</span>
        <span>{LATENCY_WARN}</span>
        <span>{LATENCY_BAD}</span>
        <span>{max}+ ms</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  icon,
  value,
  unit,
  pill,
  caption,
  link,
  danger,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: number;
  unit: string;
  pill: ReactNode;
  caption: string;
  link?: { to: string; label: string } | undefined;
  danger?: boolean | undefined;
  children?: ReactNode;
}) {
  return (
    <section className="vyro-surface flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
          <span className="text-ink-4">{icon}</span>
          {label}
        </span>
        {pill}
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className={cn('vyro-metric text-[2.5rem] leading-none', danger ? 'text-rose' : 'text-ink')}>{value}</span>
        <span className="text-xs text-ink-4">{unit}</span>
      </div>
      {children}
      <div className="min-h-4 flex-1" aria-hidden />
      <div className="flex items-center justify-between gap-2 border-t border-ink/[0.07] pt-3 text-xs">
        <span className="truncate text-ink-4">{caption}</span>
        {link && <CardLink to={link.to}>{link.label}</CardLink>}
      </div>
    </section>
  );
}

function HealthSkeleton() {
  return (
    <div className="space-y-7">
      <Skeleton className="h-48 rounded-[20px]" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 rounded-[18px]" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Cron
// ----------------------------------------------------------------------

function CronTab() {
  const canRead = usePermission('cron:read');
  const canTrigger = usePermission('cron:trigger');
  const jobs = useCronJobs();
  const trigger = useTriggerCron();
  const now = useNow(30_000);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [ran, setRan] = useState<Record<string, number>>({});

  const rows = useMemo(
    () =>
      (jobs.data?.jobs ?? [])
        .map((j: CronJobInfo) => ({ ...j, next: nextCronRun(j.schedule, now) }))
        .sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity)),
    [jobs.data, now],
  );

  if (!canRead) {
    return <Callout tone="warning" title="Permission required">You need the cron:read permission to view scheduled jobs.</Callout>;
  }
  if (jobs.isError) {
    return <Callout tone="danger" title="Couldn’t load cron jobs">{(jobs.error as Error).message}</Callout>;
  }

  const upNext = rows[0];

  const run = (name: string) =>
    trigger.mutate(name, {
      onSuccess: () => setRan((r) => ({ ...r, [name]: Date.now() })),
      onSettled: () => setConfirming(null),
    });

  return (
    <div className="space-y-5">
      {trigger.isError && (
        <Callout tone="danger" title="Couldn’t trigger the job">
          {(trigger.error as Error).message}
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Scheduled jobs" value={jobs.isLoading ? '—' : String(rows.length)} sub="Registered in wrangler.toml" />
        <SummaryTile
          label="Up next"
          value={upNext?.next ? untilLabel(upNext.next, now) : '—'}
          sub={upNext ? upNext.name : 'No upcoming runs'}
          mono
        />
        <SummaryTile label="Timezone" value="UTC" sub="Cloudflare evaluates every trigger in UTC" />
      </div>

      <section className="vyro-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
          <div>
            <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">Worker cron triggers</h2>
            <p className="mt-0.5 text-xs text-ink-4">Sorted by next run. Manual runs execute immediately on the edge.</p>
          </div>
        </div>
        {jobs.isLoading ? (
          <div className="space-y-px border-t border-ink/[0.07]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="size-9 rounded-[10px]" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="border-t border-ink/[0.07]">
            <EmptyBlock icon={<ClockIcon size={20} />} title="No cron jobs" description="No cron triggers were found in the Worker configuration." />
          </div>
        ) : (
          <ul className="divide-y divide-ink/[0.06] border-t border-ink/[0.07]">
            {rows.map((j, i) => {
              const soon = j.next != null && j.next - now < 15 * 60_000;
              return (
                <li key={j.name} className="group flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <span
                      className={cn(
                        'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors',
                        i === 0 ? 'bg-ink text-volt' : 'bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]',
                      )}
                    >
                      <ClockIcon size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-ink">{j.name}</span>
                        {ran[j.name] && (
                          <Pill tone="success" dot>
                            Ran {relativeTime(ran[j.name]!, now)}
                          </Pill>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-4 text-pretty">{j.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 pl-[3.125rem] sm:pl-0">
                    <div className="min-w-[10rem]">
                      <div className="text-[13px] font-medium text-ink">{humanizeCron(j.schedule)}</div>
                      <code className="font-mono text-[11px] text-ink-5">{j.schedule}</code>
                    </div>
                    <div className="min-w-[7.5rem] text-right">
                      <div className={cn('text-[13px] font-semibold num-tabular', soon ? 'text-mint' : 'text-ink')}>
                        {j.next ? untilLabel(j.next, now) : '—'}
                      </div>
                      <div className="text-[11px] text-ink-5 num-tabular">{j.next ? fmtClock(j.next) : 'Unknown'}</div>
                    </div>
                    {canTrigger && (
                      <div className="flex w-[8.5rem] justify-end gap-1">
                        {confirming === j.name ? (
                          <>
                            <Button size="sm" variant="primary" disabled={trigger.isPending} onClick={() => run(j.name)}>
                              {trigger.isPending ? 'Running…' : 'Confirm'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={trigger.isPending}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => setConfirming(j.name)}>
                            Run now
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryTile({ label, value, sub, mono }: { label: string; value: string; sub: string; mono?: boolean | undefined }) {
  return (
    <div className="vyro-surface p-5">
      <div className="text-[13px] font-medium text-ink-3">{label}</div>
      <div className="mt-2 vyro-metric text-[1.75rem] leading-none text-ink">{value}</div>
      <div className={cn('mt-2 truncate text-xs text-ink-4', mono && 'font-mono')}>{sub}</div>
    </div>
  );
}
