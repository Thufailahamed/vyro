import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button, EmptyState } from '@/components/ui';
import {
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
  FileTextIcon,
} from '@/components/icons';
import { usePermission } from './lib/permissions';
import {
  useHealthSnapshot,
  useCronJobs,
  useTriggerCron,
  type CronJobInfo,
} from './useAdminObservability';

type Tab = 'health' | 'cron';

export function ObservabilityPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'health';

  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  const snap = useHealthSnapshot();
  const cron = useCronJobs();

  const cronCount = cron.data?.jobs.length ?? 0;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Top Header */}
      <PageHeader
        kicker="Infrastructure & Reliability"
        title="System Observability"
        sub="Real-time telemetry, database response latency, queue health, and automated Cloudflare Worker cron jobs."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void snap.refetch();
                void cron.refetch();
              }}
              loading={snap.isFetching || cron.isFetching}
            >
              Refresh Snapshot
            </Button>
          </div>
        }
      />

      {/* Accessible High-Contrast Navigation Tabs */}
      <nav className="flex items-center gap-2 border-b border-ink/10">
        <button
          type="button"
          onClick={() => switchTab('health')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'health'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <TrendingUpIcon size={16} />
          <span>Health Telemetry</span>
          <span className="w-2 h-2 rounded-full bg-mint animate-pulse" title="Telemetry Live" />
        </button>

        <button
          type="button"
          onClick={() => switchTab('cron')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'cron'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <ClockIcon size={16} />
          <span>Scheduled Crons</span>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-bone text-ink-3 border border-ink/10">
            {cronCount}
          </span>
        </button>
      </nav>

      {/* Tab Views */}
      {tab === 'health' ? <HealthTab /> : null}
      {tab === 'cron' ? <CronTab /> : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. HEALTH TAB
// ----------------------------------------------------------------------
function HealthTab() {
  const can = usePermission('health:read');
  const snap = useHealthSnapshot();

  if (!can) return <ErrorBanner message="You need health:read permission to view system health." />;
  if (snap.isError) return <ErrorBanner message={(snap.error as Error).message} />;

  const d = snap.data;

  // Compute operational status
  const isHealthy = d ? d.dbLatencyMs < 250 && d.failedWebhookDeliveries24h === 0 : true;

  return (
    <div className="space-y-6">
      {/* System Status Banner */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-sm ${
          isHealthy
            ? 'bg-mint/10 border-mint/30 text-ink'
            : 'bg-amber/10 border-amber/30 text-ink'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isHealthy ? 'bg-mint text-paper' : 'bg-amber text-paper'
            }`}
          >
            {isHealthy ? <CheckCircleIcon size={22} /> : <AlertCircleIcon size={22} />}
          </div>
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <span>{isHealthy ? 'All Systems Operational' : 'Performance Advisory Active'}</span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-white/80 border border-ink/10">
                Live Edge Relay
              </span>
            </h3>
            <p className="text-xs text-ink-4 mt-0.5">
              Cloudflare D1 SQLite replica, Worker background queues, and API gateways are responding within normal parameters.
            </p>
          </div>
        </div>

        <div className="text-right sm:shrink-0 text-xs font-mono text-ink-4">
          <div>Snapshot: {fmtTs(d?.capturedAt)}</div>
          <div className="text-[11px] text-ink-4/80 mt-0.5">Auto-refresh every 30s</div>
        </div>
      </div>

      {/* 6 Executive Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* DB Latency */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                D1 Response Latency
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  (d?.dbLatencyMs ?? 0) < 100
                    ? 'bg-mint/15 text-mint border-mint/30'
                    : (d?.dbLatencyMs ?? 0) < 250
                    ? 'bg-sky-500/15 text-sky-700 border-sky-500/30'
                    : 'bg-amber/15 text-amber border-amber/30'
                }`}
              >
                {(d?.dbLatencyMs ?? 0) < 100 ? 'Optimal' : (d?.dbLatencyMs ?? 0) < 250 ? 'Normal' : 'Elevated'}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-ink">{d ? d.dbLatencyMs : '—'}</span>
              <span className="text-sm font-mono text-ink-4">ms</span>
            </div>
          </div>
          <p className="text-[11px] text-ink-4 mt-3 pt-3 border-t border-ink/5">
            Distributed SQLite read/write probe
          </p>
        </Surface>

        {/* Pending Webhook Deliveries */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Pending Webhooks
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  (d?.pendingWebhookDeliveries ?? 0) === 0
                    ? 'bg-mint/15 text-mint border-mint/30'
                    : 'bg-amber/15 text-amber border-amber/30'
                }`}
              >
                {(d?.pendingWebhookDeliveries ?? 0) === 0 ? 'Clear Queue' : 'In Flight'}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-ink">
                {d?.pendingWebhookDeliveries ?? '0'}
              </span>
              <span className="text-xs font-mono text-ink-4">events</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-ink/5 flex items-center justify-between text-[11px]">
            <span className="text-ink-4">Awaiting dispatch</span>
            <Link to="/admin/platform?tab=webhooks" className="text-ink font-semibold hover:underline">
              Manage Webhooks &rarr;
            </Link>
          </div>
        </Surface>

        {/* Failed Webhooks 24h */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Failed Webhooks (24h)
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  (d?.failedWebhookDeliveries24h ?? 0) === 0
                    ? 'bg-mint/15 text-mint border-mint/30'
                    : 'bg-rose/15 text-rose border-rose/30'
                }`}
              >
                {(d?.failedWebhookDeliveries24h ?? 0) === 0 ? '0 Errors' : 'Delivery Failures'}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold font-mono ${
                  (d?.failedWebhookDeliveries24h ?? 0) > 0 ? 'text-rose' : 'text-ink'
                }`}
              >
                {d?.failedWebhookDeliveries24h ?? '0'}
              </span>
              <span className="text-xs font-mono text-ink-4">drops</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-ink/5 flex items-center justify-between text-[11px]">
            <span className="text-ink-4">HTTP timeout / non-2xx</span>
            <Link to="/admin/platform?tab=webhooks" className="text-ink font-semibold hover:underline">
              View Deliveries &rarr;
            </Link>
          </div>
        </Surface>

        {/* Open Abuse Reports */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Open Abuse Reports
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  (d?.openAbuseReports ?? 0) === 0
                    ? 'bg-mint/15 text-mint border-mint/30'
                    : 'bg-amber/15 text-amber border-amber/30'
                }`}
              >
                {(d?.openAbuseReports ?? 0) === 0 ? 'Zero Backlog' : 'Tickets Open'}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-ink">{d?.openAbuseReports ?? '0'}</span>
              <span className="text-xs font-mono text-ink-4">tickets</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-ink/5 flex items-center justify-between text-[11px]">
            <span className="text-ink-4">Trust & safety queue</span>
            <Link to="/admin/trust-safety?tab=reports" className="text-ink font-semibold hover:underline">
              Review Queue &rarr;
            </Link>
          </div>
        </Surface>

        {/* Pending KYC Reviews */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Pending KYC Applications
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  (d?.pendingKyc ?? 0) === 0
                    ? 'bg-mint/15 text-mint border-mint/30'
                    : 'bg-amber/15 text-amber border-amber/30'
                }`}
              >
                {(d?.pendingKyc ?? 0) === 0 ? 'Up to date' : 'Action Required'}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-ink">{d?.pendingKyc ?? '0'}</span>
              <span className="text-xs font-mono text-ink-4">merchants</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-ink/5 flex items-center justify-between text-[11px]">
            <span className="text-ink-4">Identity dossiers</span>
            <Link to="/admin/trust-safety?tab=kyc" className="text-ink font-semibold hover:underline">
              Inspect KYC &rarr;
            </Link>
          </div>
        </Surface>

        {/* Pending Refunds */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Pending Refund Requests
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  (d?.pendingRefunds ?? 0) === 0
                    ? 'bg-mint/15 text-mint border-mint/30'
                    : 'bg-amber/15 text-amber border-amber/30'
                }`}
              >
                {(d?.pendingRefunds ?? 0) === 0 ? 'Settled' : 'Awaiting Review'}
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-ink">{d?.pendingRefunds ?? '0'}</span>
              <span className="text-xs font-mono text-ink-4">claims</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-ink/5 flex items-center justify-between text-[11px]">
            <span className="text-ink-4">Disputes & escrow</span>
            <Link to="/admin/disputes" className="text-ink font-semibold hover:underline">
              Disputes Portal &rarr;
            </Link>
          </div>
        </Surface>
      </div>

      {/* Recent Platform Operations Audit Feed */}
      <Surface className="p-5 bg-white border border-ink/10 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-ink/10">
          <div>
            <h3 className="text-sm font-bold text-ink">Recent Platform Operations (24h Activity)</h3>
            <p className="text-xs text-ink-4">
              Real-time audit stream of recent administrative writes, configuration changes, and operational mutations.
            </p>
          </div>
          <Link
            to="/admin/activity"
            className="text-xs font-semibold text-ink underline hover:text-charcoal transition-colors self-start sm:self-auto"
          >
            Open Full Audit Activity &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Event Payload / Result</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 text-xs">
              {(d?.recentErrors ?? []).slice(0, 15).map((r, i) => (
                <tr key={i} className="hover:bg-sand/20 transition-colors">
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 font-mono font-semibold rounded bg-bone text-ink border border-ink/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-ink/50" />
                      {r.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-ink-4 truncate max-w-md">
                    {r.status ? (
                      <span className="truncate block max-w-lg">{r.status}</span>
                    ) : (
                      <span className="italic">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-ink-4 whitespace-nowrap">
                    {fmtTs(r.createdAt)}
                  </td>
                </tr>
              ))}
              {!d?.recentErrors?.length && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-xs text-ink-4">
                    No administrative mutations recorded in the last 24 hours.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. CRON TAB
// ----------------------------------------------------------------------
function CronTab() {
  const canRead = usePermission('cron:read');
  const canTrigger = usePermission('cron:trigger');
  const jobs = useCronJobs();
  const trigger = useTriggerCron();

  const [triggerNotice, setTriggerNotice] = useState<string | null>(null);

  if (!canRead) return <ErrorBanner message="You need cron:read permission to view scheduled jobs." />;
  if (jobs.isError) return <ErrorBanner message={(jobs.error as Error).message} />;

  const handleTrigger = (name: string) => {
    trigger.mutate(name, {
      onSuccess: () => {
        setTriggerNotice(`Successfully triggered cron job: ${name}`);
        setTimeout(() => setTriggerNotice(null), 4000);
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Informational Callout */}
      <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Cloudflare Edge Worker Cron Triggers</h3>
          <p className="text-xs text-ink-4 mt-0.5">
            Scheduled jobs registered in <code className="font-mono bg-bone px-1 py-0.5 rounded">wrangler.toml</code> executed on Cloudflare&apos;s global network.
          </p>
        </div>
        <span className="px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-mint/15 text-mint border border-mint/30 self-start sm:self-auto">
          Active Triggers: {jobs.data?.jobs.length ?? 0}
        </span>
      </div>

      {trigger.isError ? <ErrorBanner message={(trigger.error as Error).message} /> : null}
      {triggerNotice ? (
        <div className="p-3 bg-mint/10 border border-mint/30 text-mint text-xs rounded-xl flex items-center gap-2">
          <CheckCircleIcon size={16} />
          <span>{triggerNotice}</span>
        </div>
      ) : null}

      {/* Crons Table */}
      <Surface className="overflow-hidden border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                <th className="py-3 px-4">Worker Cron Job</th>
                <th className="py-3 px-4">Schedule Expression</th>
                <th className="py-3 px-4">Cadence</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Manual Trigger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 text-xs">
              {(jobs.data?.jobs ?? []).map((j: CronJobInfo) => (
                <tr key={j.name} className="hover:bg-sand/20 transition-colors">
                  {/* Name */}
                  <td className="py-3.5 px-4 font-mono font-bold text-ink">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
                        <ClockIcon size={12} />
                      </div>
                      <span>{j.name}</span>
                    </div>
                  </td>

                  {/* Schedule */}
                  <td className="py-3.5 px-4 font-mono">
                    <span className="px-2 py-0.5 rounded bg-sand/60 text-ink border border-ink/10 font-bold">
                      {j.schedule}
                    </span>
                  </td>

                  {/* Cadence */}
                  <td className="py-3.5 px-4 font-medium text-ink-3">
                    {humanizeSchedule(j.schedule)}
                  </td>

                  {/* Description */}
                  <td className="py-3.5 px-4 text-ink-4 max-w-sm leading-relaxed">
                    {j.description}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    {canTrigger ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleTrigger(j.name)}
                        loading={trigger.isPending && trigger.variables === j.name}
                        title={`Manually execute ${j.name}`}
                      >
                        Run Now
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!jobs.data?.jobs?.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-ink-4">
                    No cron jobs discovered in configuration.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}

// Helpers
function fmtTs(t: number | null | undefined): string {
  if (!t) return '—';
  try {
    const d = new Date(t);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(t);
  }
}

function humanizeSchedule(schedule: string): string {
  switch (schedule.trim()) {
    case '0 3 * * *':
      return 'Daily at 03:00 UTC';
    case '0 4 * * *':
      return 'Daily at 04:00 UTC';
    case '0 5 * * *':
      return 'Daily at 05:00 UTC';
    case '*/15 * * * *':
      return 'Every 15 minutes';
    case '0 * * * *':
      return 'Hourly at minute 0';
    default:
      return schedule;
  }
}
