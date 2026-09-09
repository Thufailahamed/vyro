import { useEffect, useState, useMemo } from 'react';
import { PageHeader, Surface, ErrorBanner, Button, EmptyState } from '@/components/ui';
import {
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  SparklesIcon,
  FileTextIcon,
} from '@/components/icons';

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

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Top Header */}
      <PageHeader
        kicker="AI Platform & Inference"
        title="AI Telemetry & Costs"
        sub="Monitor token consumption, inference latency, provider routing, error rates, and model economics across platform AI features."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-ink/10 shadow-sm text-xs">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setDays(r.days)}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    days === r.days
                      ? 'bg-ink text-volt font-bold shadow-sm'
                      : 'text-ink-4 hover:text-ink'
                  }`}
                >
                  {r.short}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(days)}
              loading={loading}
              title="Refresh AI usage data"
            >
              Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorBanner message={error} />
      ) : null}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="py-16 text-center text-xs font-mono text-ink-4">
          Querying AI inference telemetry and usage logs...
        </div>
      )}

      {/* Main Content */}
      {data && (
        <>
          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Invocations */}
            <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Total Calls</span>
                <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
                  <SparklesIcon size={16} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono text-ink">
                  {data.totalRequests.toLocaleString()}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase rounded ${
                      data.failedRequests === 0
                        ? 'bg-mint/15 text-mint'
                        : 'bg-rose/15 text-rose'
                    }`}
                  >
                    {data.failedRequests === 0 ? '0 Failed' : `${data.failedRequests} Failed (${(data.failureRate * 100).toFixed(1)}%)`}
                  </span>
                </div>
              </div>
            </div>

            {/* Token Consumption */}
            <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Tokens Processed</span>
                <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
                  <FileTextIcon size={16} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono text-ink">
                  {totalTokens.toLocaleString()}
                </div>
                <p className="text-[11px] text-ink-4 mt-1 font-mono">
                  In: {data.tokensIn.toLocaleString()} &bull; Out: {data.tokensOut.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Estimated Spend */}
            <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Estimated Cost</span>
                <div className="w-8 h-8 rounded-lg bg-mint/15 flex items-center justify-center text-mint">
                  <TrendingUpIcon size={16} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono text-ink">
                  ${data.costEstimateUsd.toFixed(2)}
                </div>
                <p className="text-[11px] text-ink-4 mt-1">
                  Workers AI standard tier pricing
                </p>
              </div>
            </div>

            {/* Inference Latency */}
            <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Avg Latency</span>
                <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
                  <ClockIcon size={16} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono text-ink">
                  {data.avgLatencyMs} <span className="text-xs font-normal text-ink-4">ms</span>
                </div>
                <p className="text-[11px] text-ink-4 mt-1 font-mono">
                  p95: {data.p95LatencyMs ?? data.avgLatencyMs} ms
                </p>
              </div>
            </div>
          </div>

          {/* Breakdown Grids: Intent, Provider, Errors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* By Intent */}
            <Surface className="p-5 bg-white border border-ink/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-ink/10">
                <h3 className="text-sm font-bold text-ink">Invocations by Intent</h3>
                <span className="text-xs font-mono text-ink-4">{data.byIntent.length} intents</span>
              </div>
              <BarBreakdown rows={data.byIntent} labelKey="intent" total={data.totalRequests} suffix="calls" />
            </Surface>

            {/* By Provider */}
            <Surface className="p-5 bg-white border border-ink/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-ink/10">
                <h3 className="text-sm font-bold text-ink">Model Provider Routing</h3>
                <span className="text-xs font-mono text-ink-4">{data.byProvider.length} providers</span>
              </div>
              <BarBreakdown rows={data.byProvider} labelKey="provider" total={data.totalRequests} suffix="calls" />
            </Surface>
          </div>

          {/* Error Code Breakdown (if any) */}
          {data.byError.length > 0 && (
            <Surface className="p-5 bg-white border border-rose/30 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-rose/20">
                <div className="flex items-center gap-2">
                  <AlertCircleIcon size={18} className="text-rose" />
                  <h3 className="text-sm font-bold text-ink">Error & Anomaly Breakdown</h3>
                </div>
                <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-rose/15 text-rose">
                  {data.failedRequests} total failures
                </span>
              </div>
              <BarBreakdown rows={data.byError} labelKey="code" total={data.failedRequests} suffix="errors" accent="rose" />
            </Surface>
          )}

          {/* Daily Consumption Ledger */}
          {data.cost?.byDay && data.cost.byDay.length > 0 && (
            <Surface className="p-5 bg-white border border-ink/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-ink/10">
                <div>
                  <h3 className="text-sm font-bold text-ink">Daily Consumption & Token Ledger</h3>
                  <p className="text-xs text-ink-4 mt-0.5">Historical breakdown across calendar days</p>
                </div>
                <span className="text-xs font-mono text-ink-4">UTC Calendar</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                      <th className="py-2.5 px-3">Date (UTC)</th>
                      <th className="py-2.5 px-3 text-right">Invocations</th>
                      <th className="py-2.5 px-3 text-right">Tokens In</th>
                      <th className="py-2.5 px-3 text-right">Tokens Out</th>
                      <th className="py-2.5 px-3 text-right">Total Tokens</th>
                      <th className="py-2.5 px-3 text-right">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5 font-mono">
                    {data.cost.byDay.map((d) => (
                      <tr key={d.day} className="hover:bg-sand/20 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-ink">{d.day}</td>
                        <td className="py-2.5 px-3 text-right text-ink font-semibold">{d.calls.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-ink-4">{d.tokensIn.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-ink-4">{d.tokensOut.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-ink">
                          {(d.tokensIn + d.tokensOut).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {d.errors > 0 ? (
                            <span className="text-rose font-bold">{d.errors}</span>
                          ) : (
                            <span className="text-mint">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
          )}

          {/* Zero Data State */}
          {data.totalRequests === 0 && (
            <Surface className="p-12 text-center bg-white border border-ink/10">
              <EmptyState
                icon={<SparklesIcon size={28} />}
                title="No AI Invocations Recorded"
                description={`No AI inference requests or token consumption were logged in the past ${days} day(s).`}
              />
            </Surface>
          )}
        </>
      )}
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
  if (!rows.length) return <div className="text-xs text-ink-4 py-4 text-center">No telemetry data recorded.</div>;
  const max = Math.max(...rows.map((r) => Number(r.count ?? 0)), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const label = String(r[labelKey] ?? '—');
        const count = Number(r.count ?? 0);
        const pctOfMax = Math.round((count / max) * 100);
        const pctOfTotal = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <li key={i} className="space-y-1 text-xs">
            <div className="flex items-center justify-between font-mono">
              <span className="font-semibold text-ink truncate max-w-xs">{label}</span>
              <span className="text-ink-4">
                {count.toLocaleString()} {suffix} ({pctOfTotal}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-sand/60">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  accent === 'rose' ? 'bg-rose' : 'bg-ink'
                }`}
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
