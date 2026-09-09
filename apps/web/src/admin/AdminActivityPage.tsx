import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { PageHeader, Button, Surface, ErrorBanner, Input, EmptyState } from '@/components/ui';
import { SearchIcon, ClockIcon, CheckCircleIcon, ShieldCheckIcon, AlertCircleIcon, FileTextIcon } from '@/components/icons';
import { AuditFilters, emptyFilters, toApiFilters, type AuditFiltersState } from './AuditFilters';
import { useAdminAudit, auditCsvUrl, type AuditEntry } from './useAdminAudit';
import { usePermission } from './lib/permissions';
import { RoleBadge } from './RoleBadge';
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
  const qc = useQueryClient();
  const [filters, setFilters] = useState<AuditFiltersState>(emptyFilters());
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const apiFilters = toApiFilters(filters);
  const q = useAdminAudit(apiFilters);
  const canExport = usePermission('audit:export');
  const errMsg = q.error instanceof Error ? q.error.message : null;

  const entries = useMemo(() => {
    return q.data?.pages.flatMap((p) => p.entries) ?? [];
  }, [q.data]);

  // Executive KPI metrics calculated across loaded entries
  const metrics = useMemo(() => {
    const totalWrites = entries.length;
    const uniqueActors = new Set(entries.map((e) => e.actorEmail || e.actorId)).size;
    const highImpactCount = entries.filter((e) =>
      /suspend|takedown|revoke|delete|demote|role_changed|cancel|refund/i.test(e.action)
    ).length;
    return { totalWrites, uniqueActors, highImpactCount };
  }, [entries]);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Top Header */}
      <PageHeader
        kicker="Governance & Compliance"
        title="Activity Audit Trail"
        sub="Comprehensive, immutable record of every administrative write, access mutation, and operational event."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void qc.invalidateQueries({ queryKey: ['admin-audit'] })}
              loading={q.isFetching && !q.isFetchingNextPage}
              title="Refresh activity logs"
            >
              Refresh
            </Button>
            {canExport ? (
              <a href={auditCsvUrl(apiFilters)} download className="no-underline">
                <Button variant="secondary" size="sm">
                  Export CSV
                </Button>
              </a>
            ) : null}
          </div>
        }
      />

      {/* Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Events in View</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <FileTextIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">
              {metrics.totalWrites}
              {q.hasNextPage ? '+' : ''}
            </div>
            <p className="text-[11px] text-ink-4 mt-0.5">Matching current query</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Active Operators</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <ShieldCheckIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">{metrics.uniqueActors}</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Distinct admin actors</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">High-Impact Actions</span>
            <div className="w-8 h-8 rounded-lg bg-rose/10 flex items-center justify-center text-rose">
              <AlertCircleIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-rose">{metrics.highImpactCount}</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Suspensions, takedowns, demotions</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Audit Retention</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <ClockIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">365 Days</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Immutable D1 storage</p>
          </div>
        </div>
      </div>

      {/* Query & Filter Toolbar */}
      <AuditFilters value={filters} onChange={setFilters} />

      {errMsg ? <ErrorBanner message={errMsg} /> : null}

      {/* Activity Log Table Surface */}
      <Surface className="overflow-hidden border border-ink/10 bg-white">
        <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between bg-sand/20">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-ink">Recorded Operations</h2>
            <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-full bg-bone text-ink-3 border border-ink/10">
              {entries.length} loaded
            </span>
          </div>
          <span className="text-xs text-ink-4">Click any entry to inspect payload diff</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                <th className="py-3.5 px-4 font-semibold">Operator</th>
                <th className="py-3.5 px-4 font-semibold">Action</th>
                <th className="py-3.5 px-4 font-semibold">Target Entity</th>
                <th className="py-3.5 px-4 font-semibold">Network & Request</th>
                <th className="py-3.5 px-4 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 text-sm">
              {entries.map((e) => {
                const hasPayload = Boolean(e.before || e.after);
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedEntry(e)}
                    className="hover:bg-sand/30 transition-colors cursor-pointer group"
                  >
                    {/* Timestamp */}
                    <td className="py-3.5 px-4 align-top whitespace-nowrap">
                      <div className="font-mono text-xs font-semibold text-ink">
                        {formatDateTime(e.createdAt)}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-ink-4 font-mono">
                        <ClockIcon size={12} />
                        <span>{formatRelativeTime(e.createdAt)}</span>
                      </div>
                    </td>

                    {/* Operator */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-ink text-volt text-xs font-bold flex items-center justify-center shrink-0">
                          {(e.actorEmail?.[0] ?? 'A').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-ink truncate max-w-[180px]">
                            {e.actorEmail ?? e.actorId}
                          </div>
                          <div className="mt-0.5">
                            {e.actorRole ? (
                              <RoleBadge role={e.actorRole} compact />
                            ) : (
                              <span className="font-mono text-[10px] text-ink-4">ID: {e.actorId.slice(0, 8)}...</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 align-top">
                      <ActionBadge action={e.action} />
                    </td>

                    {/* Target */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded bg-bone text-ink-3 border border-ink/10">
                          {e.targetType}
                        </span>
                        <span
                          className="font-mono text-xs text-ink-3 hover:text-ink cursor-pointer"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            copyToClipboard(e.targetId, `target-${e.id}`);
                          }}
                          title="Click to copy target ID"
                        >
                          {e.targetId.length > 16 ? `${e.targetId.slice(0, 12)}…` : e.targetId}
                        </span>
                        {copiedId === `target-${e.id}` && (
                          <span className="text-[10px] text-mint font-semibold">Copied!</span>
                        )}
                      </div>
                    </td>

                    {/* Network & Request */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-mono text-xs text-ink-3">{e.ip ?? '—'}</div>
                      <div
                        className="font-mono text-[10px] text-ink-4 hover:text-ink cursor-pointer truncate max-w-[140px] mt-0.5"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          copyToClipboard(e.requestId, `req-${e.id}`);
                        }}
                        title={`Request ID: ${e.requestId} (click to copy)`}
                      >
                        req: {e.requestId.slice(0, 10)}…
                      </div>
                    </td>

                    {/* Details Action */}
                    <td className="py-3.5 px-4 align-top text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {hasPayload && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber/15 text-amber border border-amber/30">
                            Delta
                          </span>
                        )}
                        <span className="text-xs font-semibold text-ink group-hover:text-ink underline decoration-ink/30">
                          Inspect &rarr;
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {entries.length === 0 && !q.isLoading && (
          <div className="p-8">
            <EmptyState
              icon={<SearchIcon size={24} />}
              title="No Audit Records Found"
              description="No administrative operations matched the specified filter criteria and time window."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters(emptyFilters())}
                >
                  Reset All Filters
                </Button>
              }
            />
          </div>
        )}

        {/* Loading Spinner */}
        {q.isLoading && (
          <div className="py-16 text-center text-ink-4 text-xs font-mono">
            Loading activity log entries...
          </div>
        )}

        {/* Pagination Load More */}
        {q.hasNextPage ? (
          <div className="p-4 border-t border-ink/10 bg-sand/10 flex items-center justify-between">
            <span className="text-xs text-ink-4">
              Displaying {entries.length} recorded events
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              loading={q.isFetchingNextPage}
            >
              Load Older Activity
            </Button>
          </div>
        ) : null}
      </Surface>

      {/* Scheduled Exports Section */}
      {canExport ? <ExportSchedulesSection /> : null}

      {/* Interactive Audit Entry Inspector Modal */}
      {selectedEntry && (
        <AuditInspectorModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onCopy={copyToClipboard}
          copiedId={copiedId}
        />
      )}
    </div>
  );
}

// Action Pill with visual categorization
function ActionBadge({ action }: { action: string }) {
  const norm = action.toLowerCase();
  let badgeStyle = 'bg-sand/60 text-ink border-ink/15';
  let dotStyle = 'bg-ink/40';

  if (/suspend|takedown|delete|revoke|demote|cancel/.test(norm)) {
    badgeStyle = 'bg-rose/15 text-rose border-rose/30';
    dotStyle = 'bg-rose';
  } else if (/update|status|refund|decision|change/.test(norm)) {
    badgeStyle = 'bg-amber/15 text-amber border-amber/30';
    dotStyle = 'bg-amber';
  } else if (/create|invite|approve|promote|resolve/.test(norm)) {
    badgeStyle = 'bg-mint/15 text-mint border-mint/30';
    dotStyle = 'bg-mint';
  } else if (/export|read|view|config/.test(norm)) {
    badgeStyle = 'bg-sky-500/15 text-sky-700 border-sky-500/30';
    dotStyle = 'bg-sky-500';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono font-semibold rounded-md border ${badgeStyle}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
      <span>{action}</span>
    </span>
  );
}

// Interactive Modal for Inspecting Audit Payloads and Diffs
function AuditInspectorModal({
  entry,
  onClose,
  onCopy,
  copiedId,
}: {
  entry: AuditEntry;
  onClose: () => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
}) {
  const [viewMode, setViewMode] = useState<'diff' | 'raw'>('diff');

  const beforeObj = useMemo(() => {
    if (!entry.before) return null;
    try {
      return JSON.parse(entry.before) as Record<string, unknown>;
    } catch {
      return { raw: entry.before };
    }
  }, [entry.before]);

  const afterObj = useMemo(() => {
    if (!entry.after) return null;
    try {
      return JSON.parse(entry.after) as Record<string, unknown>;
    } catch {
      return { raw: entry.after };
    }
  }, [entry.after]);

  // Extract changed keys
  const diffKeys = useMemo(() => {
    const keys = new Set<string>();
    if (beforeObj && typeof beforeObj === 'object') {
      Object.keys(beforeObj).forEach((k) => keys.add(k));
    }
    if (afterObj && typeof afterObj === 'object') {
      Object.keys(afterObj).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }, [beforeObj, afterObj]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl border border-ink/20 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between bg-sand/20">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Audit Inspector</span>
              <ActionBadge action={entry.action} />
            </div>
            <h3 className="text-lg font-bold text-ink">Event: {entry.action}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-bone hover:bg-sand/60 flex items-center justify-center text-ink text-sm font-semibold transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-bone/50 rounded-xl border border-ink/10 text-xs">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-ink-4 block">Timestamp</span>
              <span className="font-mono font-semibold text-ink">{formatDateTime(entry.createdAt)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-ink-4 block">Operator</span>
              <span className="font-semibold text-ink truncate block" title={entry.actorEmail ?? entry.actorId}>
                {entry.actorEmail ?? entry.actorId}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-ink-4 block">Target Entity</span>
              <span className="font-mono font-semibold text-ink">
                {entry.targetType}: {entry.targetId.slice(0, 10)}…
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-ink-4 block">Client IP</span>
              <span className="font-mono font-semibold text-ink">{entry.ip ?? 'Internal'}</span>
            </div>
          </div>

          {/* Identifier Details */}
          <div className="p-3 bg-sand/20 rounded-xl border border-ink/10 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-4 font-medium">Event UUID:</span>
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-[11px] text-ink">{entry.id}</code>
                <button
                  type="button"
                  onClick={() => onCopy(entry.id, `modal-id-${entry.id}`)}
                  className="text-[11px] text-ink hover:underline font-medium"
                >
                  {copiedId === `modal-id-${entry.id}` ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-4 font-medium">Request ID:</span>
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-[11px] text-ink">{entry.requestId}</code>
                <button
                  type="button"
                  onClick={() => onCopy(entry.requestId, `modal-req-${entry.id}`)}
                  className="text-[11px] text-ink hover:underline font-medium"
                >
                  {copiedId === `modal-req-${entry.id}` ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          {/* Payload Changes & State Delta */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-ink">State Changes (Delta)</h4>
                {(beforeObj || afterObj) && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-mint/15 text-mint border border-mint/30 rounded">
                    Data Recorded
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 bg-bone p-1 rounded-lg border border-ink/10 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('diff')}
                  className={`px-2.5 py-0.5 rounded font-medium transition-all ${
                    viewMode === 'diff' ? 'bg-white shadow text-ink font-semibold' : 'text-ink-4 hover:text-ink'
                  }`}
                >
                  Visual Diff
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`px-2.5 py-0.5 rounded font-medium transition-all ${
                    viewMode === 'raw' ? 'bg-white shadow text-ink font-semibold' : 'text-ink-4 hover:text-ink'
                  }`}
                >
                  Raw JSON
                </button>
              </div>
            </div>

            {!beforeObj && !afterObj ? (
              <div className="p-8 text-center bg-bone/40 rounded-xl border border-ink/10 text-xs text-ink-4">
                No payload delta or state snapshot was recorded for this event.
              </div>
            ) : viewMode === 'diff' ? (
              <div className="space-y-2">
                {diffKeys.length === 0 ? (
                  <div className="p-4 text-center bg-bone/40 rounded-xl text-xs text-ink-4">
                    Payload is empty.
                  </div>
                ) : (
                  <div className="border border-ink/10 rounded-xl overflow-hidden divide-y divide-ink/10 text-xs font-mono">
                    <div className="grid grid-cols-3 bg-sand/30 font-sans font-semibold text-[11px] uppercase tracking-wider text-ink-3 p-2.5">
                      <div>Attribute</div>
                      <div>Previous (Before)</div>
                      <div>Current (After)</div>
                    </div>
                    {diffKeys.map((key) => {
                      const prevVal = beforeObj?.[key];
                      const nextVal = afterObj?.[key];
                      const isChanged = JSON.stringify(prevVal) !== JSON.stringify(nextVal);
                      return (
                        <div
                          key={key}
                          className={`grid grid-cols-3 p-2.5 items-center gap-2 ${
                            isChanged ? 'bg-amber/5' : 'bg-white'
                          }`}
                        >
                          <div className="font-bold text-ink truncate">{key}</div>
                          <div className="text-rose/90 break-all">
                            {prevVal !== undefined ? JSON.stringify(prevVal) : <span className="text-ink-4 italic">—</span>}
                          </div>
                          <div className="text-mint break-all font-semibold">
                            {nextVal !== undefined ? JSON.stringify(nextVal) : <span className="text-ink-4 italic">—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {beforeObj && (
                  <div>
                    <span className="text-xs font-semibold text-rose block mb-1">Before State</span>
                    <pre className="p-3 bg-charcoal text-paper rounded-xl text-xs font-mono overflow-x-auto">
                      {JSON.stringify(beforeObj, null, 2)}
                    </pre>
                  </div>
                )}
                {afterObj && (
                  <div>
                    <span className="text-xs font-semibold text-mint block mb-1">After State</span>
                    <pre className="p-3 bg-charcoal text-paper rounded-xl text-xs font-mono overflow-x-auto">
                      {JSON.stringify(afterObj, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-ink/10 bg-sand/10 flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// Scheduled Exports Management Center
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
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      await api.post('/admin/audit/exports', { email, frequency, format });
    },
    onSuccess: () => {
      setEmail('');
      setSuccessNotice(`Scheduled recurring ${frequency} export to ${email}`);
      setTimeout(() => setSuccessNotice(null), 4000);
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
    <Surface className="p-5 sm:p-6 space-y-5 border border-ink/10 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-ink/10">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <span>Automated Recurring Exports</span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-mint/15 text-mint border border-mint/30">
              {schedules.length} Active
            </span>
          </h3>
          <p className="text-xs text-ink-4 mt-0.5">
            Deliver scheduled activity snapshots directly to compliance, legal, or security inboxes.
          </p>
        </div>
      </div>

      {errMsg ? <ErrorBanner message={errMsg} /> : null}
      {createErr ? <ErrorBanner message={createErr} /> : null}
      {successNotice ? (
        <div className="p-3 bg-mint/10 border border-mint/30 text-mint text-xs rounded-xl flex items-center gap-2">
          <CheckCircleIcon size={16} />
          <span>{successNotice}</span>
        </div>
      ) : null}

      {/* Creation form */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 bg-sand/20 rounded-xl border border-ink/10">
        <div className="sm:col-span-5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
            Recipient Mailbox
          </label>
          <Input
            type="email"
            placeholder="compliance@vyro.lk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
            Frequency
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            className="w-full h-11 px-3 bg-paper text-sm text-ink rounded-lg shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B]"
          >
            <option value="daily">Daily (Midnight UTC)</option>
            <option value="weekly">Weekly (Monday)</option>
            <option value="monthly">Monthly (1st of Month)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
            Format
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
            className="w-full h-11 px-3 bg-paper text-sm text-ink rounded-lg shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B]"
          >
            <option value="csv">CSV (Spreadsheet)</option>
            <option value="json">JSON (Data)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Button
            className="w-full h-11"
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!email.includes('@')}
          >
            Schedule
          </Button>
        </div>
      </div>

      {/* Active schedules list */}
      {schedules.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-ink/15 rounded-xl text-xs text-ink-4">
          No automated export schedules configured. Create one above to receive recurring activity archives.
        </div>
      ) : (
        <div className="overflow-x-auto border border-ink/10 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                <th className="py-3 px-4">Recipient Mailbox</th>
                <th className="py-3 px-4">Delivery Cadence</th>
                <th className="py-3 px-4">Format</th>
                <th className="py-3 px-4">Next Scheduled Run</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-sand/20 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-ink">
                    {s.email}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded bg-bone text-ink border border-ink/10 capitalize">
                      <ClockIcon size={12} />
                      {s.frequency}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-sand/60 text-ink border border-ink/10">
                      {s.format}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-ink-3">
                    {s.nextRunAt ? new Date(s.nextRunAt).toISOString().slice(0, 10) : 'Pending'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancel.mutate(s.id)}
                      loading={cancel.isPending && cancel.variables === s.id}
                      aria-label={`Cancel schedule for ${s.email}`}
                      className="text-rose hover:bg-rose/10"
                    >
                      Cancel Schedule
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Surface>
  );
}

// Helper formatters
function formatDateTime(ms: number): string {
  try {
    const d = new Date(ms);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(ms);
  }
}

function formatRelativeTime(ms: number): string {
  try {
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    if (diffSec < 60) return '< 1m ago';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}
