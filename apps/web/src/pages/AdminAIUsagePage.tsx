import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, PageHeader } from '@/components/ui';

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

export function AdminAIUsagePage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ai/admin/usage?days=${days}`, { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 403) {
          setError('Admin only');
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<UsageResponse>;
      })
      .then((d) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader
        kicker="Admin"
        title="VYRO AI Usage"
        sub="Token spend, latency, failure rate, intent + provider breakdown. Gated to admins."
        actions={
          <div className="flex items-center gap-2 text-xs">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-full px-3 py-1.5 font-medium transition ${days === d ? 'bg-stone-900 text-white' : 'border border-stone-300 text-stone-700 hover:border-stone-900'}`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error === 'Admin only' ? (
            <span>
              You need admin access. <Link to="/dashboard" className="underline">Back to dashboard</Link>
            </span>
          ) : error}
        </div>
      )}

      {!error && data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Calls" value={data.totalRequests.toLocaleString()} />
            <Stat
              label="Tokens"
              value={(data.tokensIn + data.tokensOut).toLocaleString()}
            />
            <Stat label="Est. USD" value={`$${data.costEstimateUsd.toFixed(2)}`} />
            <Stat label="Failure rate" value={`${(data.failureRate * 100).toFixed(1)}%`} />
            <Stat label="Avg latency" value={`${data.avgLatencyMs}ms`} />
            <Stat label="p95 latency" value={`${data.p95LatencyMs ?? data.avgLatencyMs}ms`} />
            <Stat label="Failed calls" value={data.failedRequests.toLocaleString()} />
            <Stat label="Window" value={`${data.days}d`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="By intent">
              <Bars rows={data.byIntent} suffix="calls" />
            </Section>
            <Section title="By provider">
              <Bars rows={data.byProvider} suffix="calls" />
            </Section>
            {data.byError.length > 0 && (
              <Section title="By error code">
                <Bars rows={data.byError} suffix="calls" accent="rose" />
              </Section>
            )}
            {data.cost?.byDay && data.cost.byDay.length > 0 && (
              <Section title="Daily buckets">
                <table className="w-full text-xs text-stone-700">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-[10px] uppercase tracking-wider text-stone-500">
                      <th className="py-1">Day</th>
                      <th className="py-1 text-right">Calls</th>
                      <th className="py-1 text-right">Tokens in</th>
                      <th className="py-1 text-right">Tokens out</th>
                      <th className="py-1 text-right">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cost.byDay.map((d) => (
                      <tr key={d.day} className="border-b border-stone-100">
                        <td className="py-1 font-mono">{d.day}</td>
                        <td className="py-1 text-right font-mono">{d.calls}</td>
                        <td className="py-1 text-right font-mono">{d.tokensIn.toLocaleString()}</td>
                        <td className="py-1 text-right font-mono">{d.tokensOut.toLocaleString()}</td>
                        <td className="py-1 text-right font-mono">{d.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}
          </div>
        </>
      )}

      {loading && <div className="text-sm text-stone-500">Loading…</div>}

      <div>
        <Link to="/dashboard">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-stone-900">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Bars({ rows, suffix, accent }: { rows: Array<{ [k: string]: any }>; suffix: string; accent?: 'rose' }) {
  if (!rows.length) return <div className="text-sm text-stone-500">No data</div>;
  const max = Math.max(...rows.map((r) => Number(r.count ?? 0)), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => {
        const label = String(r.intent ?? r.provider ?? r.code ?? '—');
        const count = Number(r.count ?? 0);
        const pct = Math.round((count / max) * 100);
        return (
          <li key={i} className="flex items-center gap-3 text-xs">
            <span className="w-28 truncate text-stone-700">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full ${accent === 'rose' ? 'bg-rose-500' : 'bg-stone-900'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-16 text-right font-mono tabular-nums text-stone-700">{count} {suffix}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default AdminAIUsagePage;
