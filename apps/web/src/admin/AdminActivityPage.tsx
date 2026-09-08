import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { PageHeader, Button, Surface, ErrorBanner, Input } from '@/components/ui';
import { AuditFilters, emptyFilters, toApiFilters, type AuditFiltersState } from './AuditFilters';
import { useAdminAudit, auditCsvUrl } from './useAdminAudit';
import { usePermission } from './lib/permissions';
import { api } from '@/lib/api';

interface ExportSchedule {
  id: string;
  requestedBy: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
  format: 'csv' | 'json';
  nextRunAt: number | null;
  cancelledAt: number | null;
  createdAt: number;
}

export function AdminActivityPage() {
  const [filters, setFilters] = useState<AuditFiltersState>(emptyFilters());
  const apiFilters = toApiFilters(filters);
  const q = useAdminAudit(apiFilters);
  const canExport = usePermission('audit:export');
  const errMsg = q.error instanceof Error ? q.error.message : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        sub="Every admin write"
        actions={
          canExport ? (
            <a href={auditCsvUrl(apiFilters)} download>
              <Button variant="secondary">Export CSV</Button>
            </a>
          ) : null
        }
      />
      <AuditFilters value={filters} onChange={setFilters} />
      {errMsg ? <ErrorBanner message={errMsg} /> : null}
      <Surface>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">When</th>
              <th className="text-left p-2">Actor</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Target</th>
              <th className="text-left p-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.pages
              .flatMap((p) => p.entries)
              .map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2">{new Date(e.createdAt).toISOString()}</td>
                  <td className="p-2">{e.actorEmail ?? e.actorId}</td>
                  <td className="p-2">{e.action}</td>
                  <td className="p-2">
                    {e.targetType}:{e.targetId}
                  </td>
                  <td className="p-2">{e.ip ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {q.hasNextPage ? (
          <div className="p-2">
            <Button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        ) : null}
      </Surface>
      {canExport ? <ExportSchedulesSection /> : null}
    </div>
  );
}

function ExportSchedulesSection() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['audit-export-schedules'],
    queryFn: async () => {
      const r = await api.get<{ schedules: ExportSchedule[] }>('/admin/audit/exports');
      return r.schedules;
    },
  });
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const create = useMutation({
    mutationFn: async () => {
      await api.post('/admin/audit/exports', { email, frequency, format });
    },
    onSuccess: () => {
      setEmail('');
      void qc.invalidateQueries({ queryKey: ['audit-export-schedules'] });
    },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/admin/audit/exports/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['audit-export-schedules'] }),
  });

  const errMsg = list.error instanceof Error ? list.error.message : null;
  const createErr = create.error instanceof Error ? create.error.message : null;
  const schedules = (list.data ?? []).filter((s) => !s.cancelledAt);

  return (
    <Surface className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Scheduled exports</h3>
        <p className="text-xs text-ink-500">
          Receive a recurring snapshot of admin activity in your inbox.
        </p>
      </div>
      {errMsg ? <ErrorBanner message={errMsg} /> : null}
      {createErr ? <ErrorBanner message={createErr} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-ink-500 gap-1 flex-1 min-w-48">
          Send to
          <Input
            type="email"
            placeholder="you@vyro.lk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs text-ink-500 gap-1">
          Frequency
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            className="h-11 px-3 bg-paper text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-ink-500 gap-1">
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
            className="h-11 px-3 bg-paper text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <Button
          onClick={() => create.mutate()}
          loading={create.isPending}
          disabled={!email.includes('@')}
        >
          Schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <p className="text-xs text-ink-500">No active schedules.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-500">
              <th className="p-2 font-medium">Email</th>
              <th className="p-2 font-medium">Frequency</th>
              <th className="p-2 font-medium">Format</th>
              <th className="p-2 font-medium">Next run</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-2 font-mono text-xs">{s.email}</td>
                <td className="p-2 capitalize">{s.frequency}</td>
                <td className="p-2 uppercase text-xs">{s.format}</td>
                <td className="p-2">
                  {s.nextRunAt
                    ? new Date(s.nextRunAt).toISOString().slice(0, 10)
                    : '—'}
                </td>
                <td className="p-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cancel.mutate(s.id)}
                    loading={cancel.isPending && cancel.variables === s.id}
                    aria-label={`Cancel schedule for ${s.email}`}
                  >
                    Cancel
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  );
}
