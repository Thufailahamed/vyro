import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Input } from '@/components/ui';
import { ClockIcon, CheckCircleIcon, ChevronDownIcon } from './icons';
import { DisputeResolutionPanel } from './DisputeResolutionPanel';
import { AuditMetadataModal } from './AuditMetadataModal';
import { useAdminTable } from '@/lib/useAdminTable';

interface Order {
  id: string;
  poNumber: string;
  totalCents: number;
  createdAt: number;
}

interface Audit {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorUserId: string | null;
  actorEmail?: string | null;
  createdAt: number;
  metadata: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function DisputedPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputed'],
    queryFn: () => api.get<{ disputes: Order[] }>('/admin/disputes'),
    retry: false,
  });

  const orders = data?.disputes ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Arbitration"
        title="Disputed orders."
        actions={
          <span
            className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-medium border num-tabular self-start sm:self-auto ${
              orders.length > 0
                ? 'bg-rose/15 text-rose border-rose/30 animate-pulse'
                : 'bg-paper text-ink-3 border-ink/15'
            }`}
          >
            {orders.length} disputed
          </span>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-paper rounded-md border border-ink/15 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-14 text-center bg-paper rounded-lg border border-dashed border-ink/15">
          <CheckCircleIcon size={32} className="mx-auto text-mint" />
          <h3 className="mt-3 font-semibold text-ink text-base">No active disputes</h3>
          <p className="mt-1 text-sm text-ink-3">All buyer and supplier purchase orders are running smoothly.</p>
        </div>
      ) : (
        <div className="bg-paper border border-rose/30 rounded-lg overflow-hidden shadow-soft-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-rose/5 border-b border-rose/20 text-[10px] font-semibold uppercase tracking-wider text-rose">
              <tr>
                <th className="py-3 px-4">PO Number</th>
                <th className="py-3 px-4">Dispute value</th>
                <th className="py-3 px-4">Date opened</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-rose/5 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-ink">{o.poNumber}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-ink num-tabular">
                    ₨ {(o.totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-ink-3 num-tabular">
                    {new Date(o.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <DisputeResolutionPanel poId={o.id} onResolved={() => qc.invalidateQueries({ queryKey: ['admin-disputed'] })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AuditPage() {
  const table = useAdminTable<Audit>({
    endpoint: '/admin/audit',
    queryKey: ['admin-audit'],
    rowKey: 'logs',
  });
  const [inspecting, setInspecting] = useState<Audit | null>(null);

  const logs = table.rows;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Ledger"
        title="System audit trail."
        actions={
          <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-ink/15 text-ink-3 self-start sm:self-auto num-tabular">
            {logs.length} loaded{table.hasMore ? '+' : ''}
          </span>
        }
      />

      <div className="grid sm:grid-cols-3 gap-3">
        <Input
          placeholder="Action (e.g. supplier.freeze)"
          value={table.filter.action ?? ''}
          onChange={(e) => table.setFilter((f) => ({ ...f, action: e.target.value }))}
        />
        <Input
          placeholder="Resource type (e.g. purchase_order)"
          value={table.filter.resourceType ?? ''}
          onChange={(e) => table.setFilter((f) => ({ ...f, resourceType: e.target.value }))}
        />
        <Input
          placeholder="Actor user id"
          value={table.filter.actorUserId ?? ''}
          onChange={(e) => table.setFilter((f) => ({ ...f, actorUserId: e.target.value }))}
        />
      </div>

      {table.loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-paper rounded-md border border-ink/15 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="p-14 text-center bg-paper rounded-lg border border-dashed border-ink/15">
          <p className="text-sm font-semibold text-ink">No audit events recorded</p>
        </div>
      ) : (
        <>
          <ol className="space-y-2">
            {logs.map((l) => (
              <li
                key={l.id}
                className="bg-paper border border-ink/15 rounded-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-ink/25 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1 text-ink-3 font-mono text-[11px] shrink-0 num-tabular">
                    <ClockIcon size={13} className="text-ink-4" />
                    {new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="font-mono font-semibold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-violet/10 text-violet border border-violet/30">
                    {l.action}
                  </span>
                  <span className="text-sm text-ink-2">
                    {l.resourceType} <span className="font-mono text-xs text-ink-3">({l.resourceId.slice(0, 8)}…)</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-3">
                  {(l.actorEmail || l.actorUserId) && (
                    <span className="truncate max-w-[180px]" title={l.actorEmail ?? l.actorUserId ?? ''}>
                      actor <code className="text-ink-2 font-mono">{l.actorEmail ?? l.actorUserId?.slice(0, 6) + '…'}</code>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setInspecting(l)}
                    className="inline-flex items-center gap-1 font-semibold text-copper hover:text-ink"
                  >
                    Inspect <ChevronDownIcon size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {table.hasMore && (
            <div className="text-center">
              <button
                type="button"
                onClick={table.loadMore}
                disabled={table.fetchingMore}
                className="text-xs font-medium text-copper hover:text-ink disabled:opacity-50"
              >
                {table.fetchingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {inspecting && <AuditMetadataModal row={inspecting} onClose={() => setInspecting(null)} />}
    </div>
  );
}
