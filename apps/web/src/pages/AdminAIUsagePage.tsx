import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui';
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
  Callout,
  Card,
  EmptyBlock,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
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
  { days: 7, label: 'Past 7 Days', short: '7d' },
  { days: 30, label: 'Past 30 Days', short: '30d' },
  { days: 90, label: 'Past Quarter', short: '90d' },
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

  const activeRange = TIME_RANGES.find((r) => r.days === days);

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="AI Platform & Inference"
        title="AI Telemetry & Costs"
        description="Monitor token consumption, inference latency, provider routing, error rates, and model economics across platform AI features."
        actions={
          <>
            <Tabs
              items={TIME_RANGES.map((r) => ({ key: String(r.days), label: r.short }))}
              value={String(days)}
              onChange={(k) => setDays(Number(k))}
              ariaLabel="Telemetry time range"
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-10"
              onClick={() => fetchData(days)}
              loading={loading}
              icon={<RefreshCwIcon size={14} />}
              title="Refresh AI usage data"
            >
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

      {/* Loading Skeleton */}
      {loading && !data ? (
        <div className="space-y-6">
          <StatGrid cols={4}>
            {[0, 1, 2, 3].map((i) => (
              <StatCard key={i} label="" value="" loading />
            ))}
          </StatGrid>
          <Card>
            <TableSkeleton rows={5} cols={3} />
          </Card>
        </div>
      ) : null}

      {/* Main Content */}
      {data ? (
        <>
          <StatGrid cols={4}>
            <StatCard
              label="Total calls"
              value={data.totalRequests.toLocaleString()}
              sub={activeRange ? activeRange.label : `${days}d window`}
              icon={<SparklesIcon size={16} />}
              status={
                data.failedRequests === 0 ? (
                  <Pill tone="success" dot>
                    0 failed
                  </Pill>
                ) : (
                  <Pill tone="danger" dot>
                    {data.failedRequests} failed ({(data.failureRate * 100).toFixed(1)}%)
                  </Pill>
                )
              }
              tone={data.failedRequests > 0 ? 'danger' : 'neutral'}
            />
            <StatCard
              label="Tokens processed"
              value={totalTokens.toLocaleString()}
              sub={`In: ${data.tokensIn.toLocaleString()} · Out: ${data.tokensOut.toLocaleString()}`}
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
              label="Avg latency"
              value={`${data.avgLatencyMs.toLocaleString()} ms`}
              sub={`p95: ${(data.p95LatencyMs ?? data.avgLatencyMs).toLocaleString()} ms`}
              icon={<ClockIcon size={16} />}
            />
          </StatGrid>

          {/* Breakdown Grids: Intent, Provider */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel
              title="Invocations by intent"
              description="AI feature call distribution"
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

          {/* Error Code Breakdown (if any) */}
          {data.byError.length > 0 ? (
            <Panel
              title="Error & anomaly breakdown"
              description="Failures grouped by error code"
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

          {/* Daily Consumption Ledger */}
          {data.cost?.byDay && data.cost.byDay.length > 0 ? (
            <TableCard
              title="Daily consumption & token ledger"
              description="Historical breakdown across calendar days."
              actions={<Pill tone="neutral">UTC calendar</Pill>}
              footer={
                <span>
                  <strong className="text-ink">{data.cost.byDay.length}</strong> day(s) in window
                </span>
              }
            >
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th className="text-right">Invocations</th>
                    <th className="text-right">Tokens in</th>
                    <th className="text-right">Tokens out</th>
                    <th className="text-right">Total tokens</th>
                    <th className="text-right">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cost.byDay.map((d) => (
                    <tr key={d.day}>
                      <td>
                        <span className="font-mono text-xs font-semibold text-ink">{d.day}</span>
                      </td>
                      <td className="text-right font-mono text-xs font-semibold text-ink">
                        {d.calls.toLocaleString()}
                      </td>
                      <td className="text-right font-mono text-xs text-ink-4">{d.tokensIn.toLocaleString()}</td>
                      <td className="text-right font-mono text-xs text-ink-4">{d.tokensOut.toLocaleString()}</td>
                      <td className="text-right font-mono text-xs font-bold text-ink">
                        {(d.tokensIn + d.tokensOut).toLocaleString()}
                      </td>
                      <td className="text-right">
                        {d.errors > 0 ? (
                          <Pill tone="danger">{d.errors}</Pill>
                        ) : (
                          <span className="font-mono text-xs text-mint">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          ) : null}

          {/* Zero Data State */}
          {data.totalRequests === 0 ? (
            <Card>
              <EmptyBlock
                icon={<SparklesIcon size={22} />}
                title="No AI invocations recorded"
                description={`No AI inference requests or token consumption were logged in the past ${days} day(s).`}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<CalendarIcon size={14} />}
                    onClick={() => setDays(90)}
                  >
                    View past quarter
                  </Button>
                }
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </AdminPage>
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
    return <p className="py-4 text-center text-xs text-ink-4">No telemetry data recorded.</p>;
  }
  const max = Math.max(...rows.map((r) => Number(r.count ?? 0)), 1);

  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const label = String(r[labelKey] ?? '—');
        const count = Number(r.count ?? 0);
        const pctOfMax = Math.round((count / max) * 100);
        const pctOfTotal = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <li key={i} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="max-w-[60%] truncate font-mono text-xs font-semibold text-ink">{label}</span>
              <span className="shrink-0 font-mono text-[11px] text-ink-4">
                {count.toLocaleString()} {suffix} · {pctOfTotal}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  accent === 'rose' ? 'bg-rose' : 'bg-ink',
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
