import { useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useHealthSnapshot,
  useCronJobs,
  useTriggerCron,
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
  return (
    <div className="space-y-6">
      <PageHeader title="Observability" sub="Health dashboard and cron management" />
      <nav className="flex gap-2 border-b border-ink/10">
        <TabBtn active={tab === 'health'} onClick={() => switchTab('health')}>Health</TabBtn>
        <TabBtn active={tab === 'cron'} onClick={() => switchTab('cron')}>Cron</TabBtn>
      </nav>
      <div className="text-xs">
        <a className="text-volt underline" href="/admin/observability/queues">Queues & Jobs →</a>
      </div>
      {tab === 'health' ? <HealthTab /> : null}
      {tab === 'cron' ? <CronTab /> : null}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active ? 'border-volt text-volt' : 'border-transparent text-ink-500 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

function HealthTab() {
  const can = usePermission('health:read');
  const snap = useHealthSnapshot();
  if (!can) return <ErrorBanner message="You need health:read permission" />;
  if (snap.isError) return <ErrorBanner message={(snap.error as Error).message} />;
  const d = snap.data;
  return (
    <div className="space-y-4">
      <div className="text-xs text-ink-500">Captured: {fmtTs(d?.capturedAt)}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metric label="DB latency" value={d ? `${d.dbLatencyMs} ms` : '—'} />
        <Metric label="Pending webhooks" value={d?.pendingWebhookDeliveries ?? '—'} warn={d ? d.pendingWebhookDeliveries > 5 : false} />
        <Metric label="Failed webhooks (24h)" value={d?.failedWebhookDeliveries24h ?? '—'} warn={d ? d.failedWebhookDeliveries24h > 0 : false} />
        <Metric label="Open abuse reports" value={d?.openAbuseReports ?? '—'} warn={d ? d.openAbuseReports > 0 : false} />
        <Metric label="Pending KYC" value={d?.pendingKyc ?? '—'} />
        <Metric label="Pending refunds" value={d?.pendingRefunds ?? '—'} />
      </div>
      <Surface className="p-4">
        <h3 className="text-sm font-medium mb-2">Recent audit (24h)</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500"><th className="py-2">Action</th><th>When</th></tr></thead>
          <tbody>
            {(d?.recentErrors ?? []).slice(0, 20).map((r, i) => (
              <tr key={i} className="border-t border-ink/10">
                <td className="py-2 font-mono text-xs">{r.action}</td>
                <td>{fmtTs(r.createdAt)}</td>
              </tr>
            ))}
            {!d?.recentErrors?.length ? (
              <tr><td colSpan={2} className="py-4 text-center text-ink-500">No recent activity</td></tr>
            ) : null}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <Surface className={`p-3 ${warn ? 'border-amber-400/40' : ''}`}>
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`text-2xl ${warn ? 'text-amber-600' : ''}`}>{value}</div>
    </Surface>
  );
}

function CronTab() {
  const canRead = usePermission('cron:read');
  const canTrigger = usePermission('cron:trigger');
  const jobs = useCronJobs();
  const trigger = useTriggerCron();
  if (!canRead) return <ErrorBanner message="You need cron:read permission" />;
  if (jobs.isError) return <ErrorBanner message={(jobs.error as Error).message} />;
  return (
    <Surface className="p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500">
            <th className="py-2">Job</th>
            <th>Schedule</th>
            <th>Description</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(jobs.data?.jobs ?? []).map((j) => (
            <tr key={j.name} className="border-t border-ink/10">
              <td className="py-2 font-mono text-xs">{j.name}</td>
              <td className="font-mono text-xs">{j.schedule}</td>
              <td className="text-xs">{j.description}</td>
              <td className="text-right">
                {canTrigger ? (
                  <Button size="sm" variant="ghost" onClick={() => trigger.mutate(j.name)}>
                    Trigger
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
          {!jobs.data?.jobs?.length ? (
            <tr><td colSpan={4} className="py-4 text-center text-ink-500">No cron jobs</td></tr>
          ) : null}
        </tbody>
      </table>
    </Surface>
  );
}
