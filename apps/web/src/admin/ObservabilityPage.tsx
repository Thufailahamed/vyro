import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { ErrorBanner, Button } from '@/components/ui';
import {
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  RefreshCwIcon,
} from '@/components/icons';
import { usePermission } from './lib/permissions';
import {
  useHealthSnapshot,
  useCronJobs,
  useTriggerCron,
  type CronJobInfo,
} from './useAdminObservability';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CardLink,
  EmptyBlock,
  Pill,
  Tabs,
  TableCard,
  type PillTone,
} from './ui';

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
    <AdminPage>
      <AdminPageHeader
        kicker="Infrastructure & reliability"
        title="System observability"
        description="Live telemetry, database latency, queue health and scheduled Cloudflare Worker cron jobs."
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCwIcon size={14} />}
            onClick={() => {
              void snap.refetch();
              void cron.refetch();
            }}
            loading={snap.isFetching || cron.isFetching}
          >
            Refresh snapshot
          </Button>
        }
      />

      <Tabs<Tab>
        ariaLabel="Observability sections"
        value={tab}
        onChange={switchTab}
        items={[
          {
            key: 'health',
            label: (
              <span className="inline-flex items-center gap-2">
                Health telemetry
                <span className="size-1.5 rounded-full bg-mint animate-pulse" title="Telemetry Live" aria-hidden />
              </span>
            ),
            icon: <TrendingUpIcon size={15} />,
          },
          { key: 'cron', label: 'Scheduled crons', icon: <ClockIcon size={15} />, count: cronCount },
        ]}
      />

      {tab === 'health' ? <HealthTab /> : null}
      {tab === 'cron' ? <CronTab /> : null}
    </AdminPage>
  );
}

/** Metric card with a status pill, unit, caption and a footer link. */
function TelemetryCard({
  label,
  value,
  unit,
  status,
  statusTone,
  valueTone,
  caption,
  link,
}: {
  label: ReactNode;
  value: ReactNode;
  unit: ReactNode;
  status: ReactNode;
  statusTone: PillTone;
  valueTone?: 'danger' | undefined;
  caption: ReactNode;
  link?: { to: string; label: string } | undefined;
}) {
  return (
    <Card padded={false} className="flex flex-col justify-between gap-5 p-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink-3">{label}</span>
          <Pill tone={statusTone} dot>
            {status}
          </Pill>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className={cn('vyro-metric text-3xl leading-none sm:text-4xl', valueTone === 'danger' ? 'text-rose' : 'text-ink')}>
            {value}
          </span>
          <span className="text-xs text-ink-4">{unit}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-ink/[0.07] pt-3 text-xs">
        <span className="truncate text-ink-4">{caption}</span>
        {link && <CardLink to={link.to}>{link.label}</CardLink>}
      </div>
    </Card>
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

  const latency = d?.dbLatencyMs ?? 0;
  const pendingWebhooks = d?.pendingWebhookDeliveries ?? 0;
  const failedWebhooks = d?.failedWebhookDeliveries24h ?? 0;
  const abuse = d?.openAbuseReports ?? 0;
  const kyc = d?.pendingKyc ?? 0;
  const refunds = d?.pendingRefunds ?? 0;

  return (
    <div className="space-y-6">
      {/* System status banner */}
      <Card
        padded={false}
        className={cn(
          'flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between',
          isHealthy
            ? 'bg-mint/[0.06] shadow-[inset_0_0_0_1px_rgba(61,139,110,0.22)]'
            : 'bg-amber/[0.07] shadow-[inset_0_0_0_1px_rgba(196,132,58,0.25)]',
        )}
      >
        <div className="flex items-center gap-3.5">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl text-paper',
              isHealthy ? 'bg-mint' : 'bg-amber',
            )}
          >
            {isHealthy ? <CheckCircleIcon size={20} /> : <AlertCircleIcon size={20} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-sans text-base font-semibold tracking-normal text-ink">
                {isHealthy ? 'All systems operational' : 'Performance advisory active'}
              </h2>
              <Pill tone={isHealthy ? 'success' : 'warning'} dot>
                Live edge relay
              </Pill>
            </div>
            <p className="mt-0.5 text-sm text-ink-3 text-pretty">
              Cloudflare D1 SQLite replica, Worker background queues, and API gateways are responding within normal parameters.
            </p>
          </div>
        </div>

        <div className="text-xs text-ink-4 sm:shrink-0 sm:text-right">
          <div>
            Snapshot <span className="font-mono text-ink-3 num-tabular">{fmtTs(d?.capturedAt)}</span>
          </div>
          <div className="mt-0.5">Auto-refresh every 30s</div>
        </div>
      </Card>

      {/* Telemetry cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TelemetryCard
          label="D1 response latency"
          value={d ? d.dbLatencyMs : '—'}
          unit="ms"
          status={latency < 100 ? 'Optimal' : latency < 250 ? 'Normal' : 'Elevated'}
          statusTone={latency < 100 ? 'success' : latency < 250 ? 'info' : 'warning'}
          caption="Distributed SQLite read/write probe"
        />
        <TelemetryCard
          label="Pending webhooks"
          value={d?.pendingWebhookDeliveries ?? '0'}
          unit="events"
          status={pendingWebhooks === 0 ? 'Clear queue' : 'In flight'}
          statusTone={pendingWebhooks === 0 ? 'success' : 'warning'}
          caption="Awaiting dispatch"
          link={{ to: '/admin/platform?tab=webhooks', label: 'Manage webhooks' }}
        />
        <TelemetryCard
          label="Failed webhooks (24h)"
          value={d?.failedWebhookDeliveries24h ?? '0'}
          unit="drops"
          status={failedWebhooks === 0 ? '0 errors' : 'Delivery failures'}
          statusTone={failedWebhooks === 0 ? 'success' : 'danger'}
          valueTone={failedWebhooks > 0 ? 'danger' : undefined}
          caption="HTTP timeout / non-2xx"
          link={{ to: '/admin/platform?tab=webhooks', label: 'View deliveries' }}
        />
        <TelemetryCard
          label="Open abuse reports"
          value={d?.openAbuseReports ?? '0'}
          unit="tickets"
          status={abuse === 0 ? 'Zero backlog' : 'Tickets open'}
          statusTone={abuse === 0 ? 'success' : 'warning'}
          caption="Trust & safety queue"
          link={{ to: '/admin/trust-safety?tab=reports', label: 'Review queue' }}
        />
        <TelemetryCard
          label="Pending KYC applications"
          value={d?.pendingKyc ?? '0'}
          unit="merchants"
          status={kyc === 0 ? 'Up to date' : 'Action required'}
          statusTone={kyc === 0 ? 'success' : 'warning'}
          caption="Identity dossiers"
          link={{ to: '/admin/trust-safety?tab=kyc', label: 'Inspect KYC' }}
        />
        <TelemetryCard
          label="Pending refund requests"
          value={d?.pendingRefunds ?? '0'}
          unit="claims"
          status={refunds === 0 ? 'Settled' : 'Awaiting review'}
          statusTone={refunds === 0 ? 'success' : 'warning'}
          caption="Disputes & escrow"
          link={{ to: '/admin/disputed', label: 'Disputes portal' }}
        />
      </div>

      {/* Recent platform operations */}
      <TableCard
        title="Recent platform operations (24h)"
        description="Recent administrative writes, configuration changes and operational mutations."
        actions={<CardLink to="/admin/activity">Open full audit activity</CardLink>}
      >
        <table className="admin-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Event payload / result</th>
              <th className="text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {(d?.recentErrors ?? []).slice(0, 15).map((r, i) => (
              <tr key={i}>
                <td>
                  <Pill tone="neutral" className="font-mono">
                    {r.action}
                  </Pill>
                </td>
                <td className="max-w-md font-mono text-xs text-ink-3">
                  {r.status ? <span className="block max-w-lg truncate">{r.status}</span> : <span className="text-ink-4">—</span>}
                </td>
                <td className="num whitespace-nowrap text-xs text-ink-3">{fmtTs(r.createdAt)}</td>
              </tr>
            ))}
            {!d?.recentErrors?.length && (
              <tr>
                <td colSpan={3} className="!p-0">
                  <EmptyBlock
                    icon={<ClockIcon size={20} />}
                    title="No recent operations"
                    description="No administrative mutations recorded in the last 24 hours."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>
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
      {trigger.isError ? <ErrorBanner message={(trigger.error as Error).message} /> : null}
      {triggerNotice ? <Callout tone="success">{triggerNotice}</Callout> : null}

      <TableCard
        title="Cloudflare Worker cron triggers"
        description={
          <>
            Scheduled jobs registered in <code className="rounded bg-bone px-1 py-0.5 font-mono">wrangler.toml</code>, run on
            Cloudflare&apos;s global network.
          </>
        }
        actions={
          <Pill tone="success" dot>
            Active triggers: {jobs.data?.jobs.length ?? 0}
          </Pill>
        }
      >
        <table className="admin-table">
          <thead>
            <tr>
              <th>Cron job</th>
              <th>Schedule</th>
              <th>Cadence</th>
              <th>Description</th>
              <th className="text-right">Manual trigger</th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data?.jobs ?? []).map((j: CronJobInfo) => (
              <tr key={j.name}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3">
                      <ClockIcon size={13} />
                    </span>
                    <span className="font-mono text-xs font-semibold text-ink">{j.name}</span>
                  </div>
                </td>
                <td>
                  <code className="whitespace-nowrap rounded-md bg-bone px-2 py-0.5 font-mono text-xs text-ink">{j.schedule}</code>
                </td>
                <td className="whitespace-nowrap text-ink-3">{humanizeSchedule(j.schedule)}</td>
                <td className="max-w-sm text-ink-3 text-pretty">{j.description}</td>
                <td className="text-right">
                  {canTrigger ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleTrigger(j.name)}
                      loading={trigger.isPending && trigger.variables === j.name}
                      title={`Manually execute ${j.name}`}
                    >
                      Run now
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!jobs.data?.jobs?.length && (
              <tr>
                <td colSpan={5} className="!p-0">
                  <EmptyBlock
                    icon={<ClockIcon size={20} />}
                    title="No cron jobs"
                    description="No cron jobs discovered in configuration."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>
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
