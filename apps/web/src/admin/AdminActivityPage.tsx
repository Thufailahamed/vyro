import { useState } from 'react';
import { PageHeader, Button, Surface, ErrorBanner } from '@/components/ui';
import { AuditFilters, emptyFilters, toApiFilters, type AuditFiltersState } from './AuditFilters';
import { useAdminAudit, auditCsvUrl } from './useAdminAudit';
import { usePermission } from './lib/permissions';

export function AdminActivityPage() {
  const [filters, setFilters] = useState<AuditFiltersState>(emptyFilters());
  const apiFilters = toApiFilters(filters);
  const q = useAdminAudit(apiFilters);
  const canExport = usePermission('audit:export');
  const errMsg = q.error instanceof Error ? q.error.message : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" subtitle="Every admin write">
        {canExport ? (
          <a href={auditCsvUrl(apiFilters)} download>
            <Button variant="secondary">Export CSV</Button>
          </a>
        ) : null}
      </PageHeader>
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
    </div>
  );
}
