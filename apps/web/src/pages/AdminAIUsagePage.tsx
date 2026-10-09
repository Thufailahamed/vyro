import { useEffect, useMemo, useState } from 'react';
import {
  ClockIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  SparklesIcon,
  FileTextIcon,
  RefreshCwIcon,
  CalendarIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';
import {
  AdminPage,
  AdminPageHeader,
  Button,
  Callout,
  EmptyBlock,
  Panel,
  Pill,
  Segmented,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
} from '@/admin/ui';

interface UsageRow {
  intent: string;
  count: number;
}

interface ProviderRow {
  provider: string;
  count: number;
}

interface ErrorRow {
  code: string;
  count: number;
}

interface DayBucket {
  day: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  errors: number;
}

interface UsageResponse {
  days: number;
  fromMs: number;
  toMs: number;
  totalRequests: number;
  failedRequests: number;
  failureRate: number;
  avgLatencyMs: number;
  p95LatencyMs?: number;
  tokensIn: number;
  tokensOut: number;
  costEstimateUsd: number;
  byIntent: UsageRow[];
  byProvider: ProviderRow[];
  byError: ErrorRow[];
  cost?: { byDay: DayBucket[]; byIntent: UsageRow[]; byProvider: ProviderRow[] };
}

const TIME_RANGES = [
  { days: 1, label: 'Last 24h', short: '1d' },
  { days: 7, label: 'Past 7 days', short: '7d' },
  { days: 30, label: 'Past 30 days', short: '30d' },
  { days: 90, label: 'Past quarter', short: '90d' },
] as const;

export function AdminAIUsagePage() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = (selectedDays: number) => {
    setLoading(true);
    setError(null);

    // Try primary /api/admin/ai/usage and fallback to /api/ai/admin/usage
    fetch(`/api/admin/ai/usage?days=${selectedDays}`, { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 404) {
          return fetch(`/api/ai/admin/usage?days=${selectedDays}`, { credentials: 'include' });
        }
        return res;
      })
      .then(async (r) => {
        if (r.status === 403) {
          setError('Administrative access required to view AI telemetry.');
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}: Failed to load AI usage metrics`);
        return r.json() as Promise<UsageResponse>;
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch((e: Error) => {
        setError(e.message || String(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(days);
  }, [days]);

  const totalTokens = useMemo(() => {
    if (!data) return 0;
    return (data.tokensIn ?? 0) + (data.tokensOut ?? 0);
  }, [data]);

  const dailyRows = data?.cost?.byDay ?? [];
  const ledgerTotals = useMemo(
    () =>
      dailyRows.reduce(
        (acc, d) => ({
          calls: acc.calls + d.calls,
          tokens: acc.tokens + d.tokensIn + d.tokensOut,
          errors: acc.errors + d.errors,
        }),
        { calls: 0, tokens: 0, errors: 0 },
      ),
    [dailyRows],
  );
  const maxDayTokens = Math.max(1, ...dailyRows.map((d) => d.tokensIn + d.tokensOut));

  const activeRange = TIME_RANGES.find((r) => r.days === days);
  const rangeLabel = activeRange?.label ?? `${days}d window`;
  const failureRatePct = data ? (data.failureRate * 100).toFixed(1) : '0.0';

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="AI platform & inference"
        title="AI telemetry & costs"
        description="Token consumption, inference latency, provider routing, error rates and model economics across every platform AI feature."
        actions={
          <>
            <Segmented
              ariaLabel="Telemetry time range"
              items={TIME_RANGES.map((r) => ({ key: String(r.days), label: r.short }))}
              value={String(days)}
              onChange={(k) => setDays(Number(k))}
            />
            <Button variant="secondary" size="md" onClick={() => fetchData(days)} disabled={loading} title="Refresh AI usage data">
              <RefreshCwIcon size={14} className={cn(loading && 'animate-spin')} />
              Refresh
            </Button>
          </>
        }
      />

      {error ? (
        <Callout
          tone="danger"
          title="Could not load AI telemetry"
          action={
            <Button variant="secondary" size="sm" onClick={() => fetchData(days)}>
              Retry
            </Button>
          }
        >
          {error}
        </Callout>
      ) : null}

      {loading && !data ? (
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-[22px] bg-ink/90" />
          <StatGrid cols={4}>
            {[0, 1, 2, 3].map((i) => (
              <StatCard key={i} label="" value="" loading />
            ))}
          </StatGrid>
          <div className="vyro-surface">
            <TableSkeleton rows={5} cols={3} />
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          {/* Hero: spend for the window, with a daily activity chart */}
          <section className="relative overflow-hidden rounded-[22px] bg-ink p-6 text-paper shadow-[0_24px_60px_-28px_rgba(12,14,11,0.7),inset_0_0_0_1px_rgba(250,247,240,0.06)] sm:p-8">
            <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-volt/20 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-32 left-1/4 size-72 rounded-full bg-copper/15 blur-3xl" aria-hidden />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/50">Estimated spend · {rangeLabel}</p>
                <p className="vyro-metric mt-3 text-[2.75rem] leading-none tracking-[-0.04em] sm:text-[3.5rem]">${data.costEstimateUsd.toFixed(2)}</p>
                <p className="mt-4 text-sm leading-relaxed text-paper/60">
                  {totalTokens.toLocaleString()} tokens across {data.totalRequests.toLocaleString()} calls.{' '}
                  {data.failedRequests === 0 ? 'No failed requests.' : `${data.failedRequests.toLocaleString()} failed (${failureRatePct}%).`}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-paper/[0.07] px-3 py-1 text-xs text-paper/75 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)]">
                    <ClockIcon size={12} /> p95 {(data.p95LatencyMs ?? data.avgLatencyMs).toLocaleString()} ms
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-paper/[0.07] px-3 py-1 text-xs text-paper/75 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)]">
                    Workers AI standard tier
                  </span>
                </div>
              </div>

              <DailyChart days={dailyRows} />
            </div>
          </section>

          <StatGrid cols={4}>
            <StatCard
              label="Total calls"
              value={data.totalRequests.toLocaleString()}
              sub={rangeLabel}
              icon={<SparklesIcon size={16} />}
              status={
                data.failedRequests === 0 ? (
                  <Pill tone="success" dot>
                    0 failed
                  </Pill>
                ) : (
                  <Pill tone="danger" dot>
                    {data.failedRequests} failed ({failureRatePct}%)
                  </Pill>
                )
              }
              tone={data.failedRequests > 0 ? 'danger' : 'neutral'}
            />
            <StatCard
              label="Tokens processed"
              value={totalTokens.toLocaleString()}
              sub={`In ${data.tokensIn.toLocaleString()} · Out ${data.tokensOut.toLocaleString()}`}
              icon={<FileTextIcon size={16} />}
            />
            <StatCard
              label="Estimated cost"
              value={`$${data.costEstimateUsd.toFixed(2)}`}
              sub="Workers AI standard tier pricing"
              icon={<TrendingUpIcon size={16} />}
              tone={data.costEstimateUsd > 0 ? 'warning' : 'neutral'}
            />
            <StatCard
              label="Average latency"
              value={`${data.avgLatencyMs.toLocaleString()} ms`}
              sub={`p95 ${(data.p95LatencyMs ?? data.avgLatencyMs).toLocaleString()} ms`}
              icon={<ClockIcon size={16} />}
            />
          </StatGrid>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel
              title="Invocations by intent"
              description="Which AI features are being called"
              icon={<SparklesIcon size={16} />}
              actions={<Pill tone="neutral">{data.byIntent.length} intents</Pill>}
            >
              <BarBreakdown rows={data.byIntent} labelKey="intent" total={data.totalRequests} suffix="calls" />
            </Panel>

            <Panel
              title="Model provider routing"
              description="Traffic split across inference providers"
              icon={<TrendingUpIcon size={16} />}
              actions={<Pill tone="neutral">{data.byProvider.length} providers</Pill>}
            >
              <BarBreakdown rows={data.byProvider} labelKey="provider" total={data.totalRequests} suffix="calls" />
            </Panel>
          </div>

          {data.byError.length > 0 ? (
            <Panel
              title="Errors by code"
              description="Failed requests grouped by the error they returned"
              icon={<AlertCircleIcon size={16} className="text-rose" />}
              actions={
                <Pill tone="danger" dot>
                  {data.failedRequests} total failures
                </Pill>
              }
            >
              <BarBreakdown rows={data.byError} labelKey="code" total={data.failedRequests} suffix="errors" accent="rose" />
            </Panel>
          ) : null}

          {dailyRows.length > 0 ? (
            <TableCard
              title="Daily ledger"
              description="Calls, tokens and errors for each UTC day in this window"
              actions={<Pill tone="neutral">UTC</Pill>}
              footer={
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                  <span>
                    <strong className="text-ink">{dailyRows.length}</strong> day{dailyRows.length === 1 ? '' : 's'} in window
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">
                    Total · {ledgerTotals.calls.toLocaleString()} calls · {ledgerTotals.tokens.toLocaleString()} tokens · {ledgerTotals.errors.toLocaleString()} errors
                  </span>
                </div>
              }
            >
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th className="text-right">Calls</th>
                    <th className="text-right">Tokens in</th>
                    <th className="text-right">Tokens out</th>
                    <th>Token volume</th>
                    <th className="text-right">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dailyRows].reverse().map((d) => {
                    const dayTokens = d.tokensIn + d.tokensOut;
                    return (
                      <tr key={d.day}>
                        <td>
                          <span className="font-mono text-xs font-semibold text-ink">{d.day}</span>
                        </td>
                        <td className="text-right font-mono text-xs font-semibold text-ink num-tabular">{d.calls.toLocaleString()}</td>
                        <td className="text-right font-mono text-xs text-ink-4 num-tabular">{d.tokensIn.toLocaleString()}</td>
                        <td className="text-right font-mono text-xs text-ink-4 num-tabular">{d.tokensOut.toLocaleString()}</td>
                        <td className="min-w-[10rem]">
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden>
                              <div className="h-full rounded-full bg-gradient-to-r from-volt-deep to-volt" style={{ width: `${Math.max(2, (dayTokens / maxDayTokens) * 100)}%` }} />
                            </div>
                            <span className="w-16 text-right font-mono text-[11px] text-ink-3 num-tabular">{dayTokens.toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="text-right">
                          {d.errors > 0 ? <Pill tone="danger">{d.errors}</Pill> : <span className="font-mono text-xs text-mint">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>
          ) : null}

          {data.totalRequests === 0 ? (
            <div className="vyro-surface">
              <EmptyBlock
                icon={<SparklesIcon size={22} />}
                title="No AI calls in this window"
                description={`No inference requests or token usage were logged in the ${rangeLabel.toLowerCase()}. Try a longer range.`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => setDays(90)}>
                    <CalendarIcon size={14} />
                    View past quarter
                  </Button>
                }
              />
            </div>
          ) : null}
        </>
      ) : null}
    </AdminPage>
  );
}

/** Daily calls as a column chart. Each column's height is relative to the busiest day. */
function DailyChart({ days }: { days: DayBucket[] }) {
  if (days.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-paper/[0.04] text-xs text-paper/45 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.06)]">
        No daily activity yet
      </div>
    );
  }
  const max = Math.max(1, ...days.map((d) => d.calls));
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label={`Daily calls, peak ${max}`}>
        {days.map((d) => {
          const h = Math.max(4, (d.calls / max) * 100);
          return (
            <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${d.calls} calls, ${d.errors} errors`}>
              <div
                className={cn(
                  'w-full rounded-t-[5px] transition-all duration-300 group-hover:opacity-100',
                  d.errors > 0 ? 'bg-gradient-to-t from-rose/70 to-rose' : 'bg-gradient-to-t from-volt-deep/60 to-volt',
                  'opacity-90',
                )}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-between font-mono text-[10px] text-paper/45">
        <span>{first?.day}</span>
        <span>{last?.day}</span>
      </div>
    </div>
  );
}

function BarBreakdown({
  rows,
  labelKey,
  total,
  suffix,
  accent,
}: {
  rows: Array<Record<string, any>>;
  labelKey: string;
  total: number;
  suffix: string;
  accent?: 'rose';
}) {
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-ink/[0.04] text-ink-4">
          <SparklesIcon size={16} />
        </span>
        <p className="text-xs text-ink-4">No telemetry data recorded in this window.</p>
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => Number(r.count ?? 0)), 1);

  return (
    <ul className="space-y-4">
      {rows.map((r, i) => {
        const label = String(r[labelKey] ?? '—');
        const count = Number(r.count ?? 0);
        const pctOfMax = Math.round((count / max) * 100);
        const pctOfTotal = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <li key={`${label}-${i}`} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-ink/[0.05] font-mono text-[10px] font-semibold text-ink-4 num-tabular">
                  {i + 1}
                </span>
                <span className="truncate font-mono text-xs font-semibold text-ink">{label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-ink-4">
                <span className="num-tabular">
                  {count.toLocaleString()} {suffix}
                </span>
                <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 font-semibold text-ink-3 num-tabular">{pctOfTotal}%</span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  accent === 'rose' ? 'bg-gradient-to-r from-rose/70 to-rose' : 'bg-gradient-to-r from-ink-3 to-ink',
                )}
                style={{ width: `${Math.max(pctOfMax, 3)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default AdminAIUsagePage;
