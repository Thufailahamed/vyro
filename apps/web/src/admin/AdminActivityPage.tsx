import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { Button, Input, Label, Select } from '@/components/ui';
import {
  SearchIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  FileTextIcon,
  RefreshCwIcon,
  DownloadIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
  CalendarIcon,
  ArrowRightIcon,
} from '@/components/icons';
import { AuditFilters, emptyFilters, toApiFilters, type AuditFiltersState } from './AuditFilters';
import { useAdminAudit, auditCsvUrl, type AuditEntry } from './useAdminAudit';
import { usePermission } from './lib/permissions';
import { RoleBadge } from './RoleBadge';
import { api } from '@/lib/api';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CellStack,
  DetailList,
  EmptyBlock,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
  type PillTone,
} from './ui';

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

const HIGH_IMPACT_RE = /suspend|takedown|revoke|delete|demote|role_changed|cancel|refund/i;

function actionTone(action: string): PillTone {
  const norm = action.toLowerCase();
  if (/suspend|takedown|delete|revoke|demote|cancel/.test(norm)) return 'danger';
  if (/update|status|refund|decision|change/.test(norm)) return 'warning';
  if (/create|invite|approve|promote|resolve/.test(norm)) return 'success';
  if (/export|read|view|config/.test(norm)) return 'info';
  return 'neutral';
}

function CopyChip({ text, id, copiedId, onCopy }: { text: string; id: string; copiedId: string | null; onCopy: (t: string, i: string) => void }) {
  const copied = copiedId === id;
  return (
    <button
      type="button"
      onClick={(evt) => {
        evt.stopPropagation();
        onCopy(text, id);
      }}
      title={`Copy ${text}`}
      className="inline-flex items-center gap-1 rounded-md bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-ink-3 transition-colors hover:bg-ink/[0.08] hover:text-ink"
    >
      {copied ? <CheckIcon size={11} className="text-mint" /> : <CopyIcon size={11} className="text-ink-4" />}
      <span className={copied ? 'text-mint font-semibold' : undefined}>{copied ? 'Copied' : text.length > 18 ? `${text.slice(0, 14)}…` : text}</span>
    </button>
  );
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
    const highImpactCount = entries.filter((e) => HIGH_IMPACT_RE.test(e.action)).length;
    return { totalWrites, uniqueActors, highImpactCount };
  }, [entries]);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Governance & Compliance"
        title="Activity Audit Trail"
        description="Comprehensive, immutable record of every administrative write, access mutation, and operational event."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="h-10"
              onClick={() => void qc.invalidateQueries({ queryKey: ['admin-audit'] })}
              loading={q.isFetching && !q.isFetchingNextPage}
              icon={<RefreshCwIcon size={14} />}
              title="Refresh activity logs"
            >
              Refresh
            </Button>
            {canExport ? (
              <a href={auditCsvUrl(apiFilters)} download className="no-underline">
                <Button variant="primary" size="sm" className="h-10" icon={<DownloadIcon size={14} />}>
                  Export CSV
                </Button>
              </a>
            ) : null}
          </>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Events in view"
          value={`${metrics.totalWrites}${q.hasNextPage ? '+' : ''}`}
          sub="Matching current query"
          icon={<FileTextIcon size={16} />}
          loading={q.isLoading}
        />
        <StatCard
          label="Active operators"
          value={metrics.uniqueActors}
          sub="Distinct admin actors"
          icon={<ShieldCheckIcon size={16} />}
          loading={q.isLoading}
        />
        <StatCard
          label="High-impact actions"
          value={metrics.highImpactCount}
          sub="Suspensions, takedowns, demotions"
          icon={<AlertCircleIcon size={16} />}
          tone={metrics.highImpactCount > 0 ? 'danger' : 'neutral'}
          status={
            metrics.highImpactCount > 0 ? (
              <Pill tone="danger" dot>
                Review advised
              </Pill>
            ) : undefined
          }
          loading={q.isLoading}
        />
        <StatCard
          label="Audit retention"
          value="365 days"
          sub="Immutable D1 storage"
          icon={<CalendarIcon size={16} />}
        />
      </StatGrid>

      <AuditFilters value={filters} onChange={setFilters} />

      {errMsg ? (
        <Callout
          tone="danger"
          title="Could not load audit trail"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void qc.invalidateQueries({ queryKey: ['admin-audit'] })}
            >
              Retry
            </Button>
          }
        >
          {errMsg}
        </Callout>
      ) : null}

      <TableCard
        title="Recorded operations"
        description="Click any entry to inspect its payload diff."
        actions={<Pill tone="neutral">{entries.length} loaded</Pill>}
        footer={
          <>
            <span>
              Displaying <strong className="text-ink">{entries.length}</strong> recorded events
              {q.hasNextPage ? ' · older activity available' : ''}
            </span>
            {q.hasNextPage ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void q.fetchNextPage()}
                loading={q.isFetchingNextPage}
              >
                Load older activity
              </Button>
            ) : null}
          </>
        }
      >
        {q.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : entries.length === 0 ? (
          <EmptyBlock
            icon={<SearchIcon size={22} />}
            title="No audit records found"
            description="No administrative operations matched the specified filter criteria and time window."
            action={
              <Button variant="secondary" size="sm" onClick={() => setFilters(emptyFilters())}>
                Reset all filters
              </Button>
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operator</th>
                <th>Action</th>
                <th>Target entity</th>
                <th>Network &amp; request</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const hasPayload = Boolean(e.before || e.after);
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedEntry(e)}
                    className="group cursor-pointer"
                  >
                    <td>
                      <CellStack
                        mono
                        primary={formatDateTime(e.createdAt)}
                        secondary={formatRelativeTime(e.createdAt)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-volt">
                          {(e.actorEmail?.[0] ?? 'A').toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="max-w-[180px] truncate text-xs font-medium text-ink">
                            {e.actorEmail ?? e.actorId}
                          </div>
                          <div className="mt-0.5">
                            {e.actorRole ? (
                              <RoleBadge role={e.actorRole} compact />
                            ) : (
                              <span className="font-mono text-[10px] text-ink-4">ID: {e.actorId.slice(0, 8)}…</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Pill tone={actionTone(e.action)} dot className="font-mono">
                        {e.action}
                      </Pill>
                    </td>
                    <td>
                      <CellStack
                        primary={
                          <Pill tone="neutral" className="uppercase">
                            {e.targetType}
                          </Pill>
                        }
                        secondary={
                          <CopyChip
                            text={e.targetId}
                            id={`target-${e.id}`}
                            copiedId={copiedId}
                            onCopy={copyToClipboard}
                          />
                        }
                      />
                    </td>
                    <td>
                      <CellStack
                        mono
                        primary={e.ip ?? '—'}
                        secondary={
                          <CopyChip
                            text={`req: ${e.requestId}`}
                            id={`req-${e.id}`}
                            copiedId={copiedId}
                            onCopy={copyToClipboard}
                          />
                        }
                      />
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {hasPayload ? (
                          <Pill tone="warning" className="uppercase">
                            Delta
                          </Pill>
                        ) : null}
                        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-3 transition-colors group-hover:bg-ink group-hover:text-paper">
                          Inspect
                          <ArrowRightIcon size={13} />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {/* Scheduled Exports Section */}
      {canExport ? <ExportSchedulesSection /> : null}

      {/* Interactive Audit Entry Inspector Modal */}
      {selectedEntry ? (
        <AuditInspectorModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onCopy={copyToClipboard}
          copiedId={copiedId}
        />
      ) : null}
    </AdminPage>
  );
}

// Action Pill with visual categorization
function ActionBadge({ action }: { action: string }) {
  return (
    <Pill tone={actionTone(action)} dot className="font-mono">
      {action}
    </Pill>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="vyro-surface flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-bone/40 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-copper/15 text-copper">
              <FileTextIcon size={15} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-ink">Event: {entry.action}</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">Audit inspector · {entry.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-5 overflow-y-auto p-5 sm:p-6">
          <DetailList
            columns={2}
            items={[
              { label: 'Timestamp', value: <span className="font-mono text-xs">{formatDateTime(entry.createdAt)}</span> },
              { label: 'Operator', value: entry.actorEmail ?? entry.actorId },
              {
                label: 'Target entity',
                value: (
                  <span className="font-mono text-xs">
                    {entry.targetType}: {entry.targetId.slice(0, 10)}…
                  </span>
                ),
              },
              { label: 'Client IP', value: <span className="font-mono text-xs">{entry.ip ?? 'Internal'}</span> },
            ]}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg bg-ink/[0.04] px-3.5 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">Event UUID</span>
              <CopyChip text={entry.id} id={`modal-id-${entry.id}`} copiedId={copiedId} onCopy={onCopy} />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-ink/[0.04] px-3.5 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">Request ID</span>
              <CopyChip text={entry.requestId} id={`modal-req-${entry.id}`} copiedId={copiedId} onCopy={onCopy} />
            </div>
          </div>

          {/* Payload Changes & State Delta */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-ink">State changes (delta)</h4>
                {beforeObj || afterObj ? (
                  <Pill tone="success" dot>
                    Data recorded
                  </Pill>
                ) : null}
              </div>
              <Tabs
                items={[
                  { key: 'diff', label: 'Visual diff' },
                  { key: 'raw', label: 'Raw JSON' },
                ]}
                value={viewMode}
                onChange={(k) => setViewMode(k as 'diff' | 'raw')}
                ariaLabel="Payload view mode"
              />
            </div>

            {!beforeObj && !afterObj ? (
              <EmptyBlock
                title="No payload recorded"
                description="No delta or state snapshot was captured for this event."
              />
            ) : viewMode === 'diff' ? (
              diffKeys.length === 0 ? (
                <EmptyBlock title="Empty payload" description="The recorded payload contains no attributes." />
              ) : (
                <div className="overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
                  <div className="grid grid-cols-3 gap-2 bg-ink/[0.05] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                    <div>Attribute</div>
                    <div>Before</div>
                    <div>After</div>
                  </div>
                  <div className="divide-y divide-ink/[0.06]">
                    {diffKeys.map((key) => {
                      const prevVal = beforeObj?.[key];
                      const nextVal = afterObj?.[key];
                      const isChanged = JSON.stringify(prevVal) !== JSON.stringify(nextVal);
                      return (
                        <div
                          key={key}
                          className={cn(
                            'grid grid-cols-3 items-center gap-2 px-3 py-2 font-mono text-xs',
                            isChanged ? 'bg-amber/[0.06]' : undefined,
                          )}
                        >
                          <div className="truncate font-sans font-semibold text-ink">{key}</div>
                          <div className="break-all text-rose/90">
                            {prevVal !== undefined ? JSON.stringify(prevVal) : <span className="italic text-ink-4">—</span>}
                          </div>
                          <div className="break-all font-semibold text-mint">
                            {nextVal !== undefined ? JSON.stringify(nextVal) : <span className="italic text-ink-4">—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3">
                {beforeObj ? (
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-rose">Before state</span>
                    <pre className="overflow-x-auto rounded-lg bg-charcoal p-3 font-mono text-xs text-paper">
                      {JSON.stringify(beforeObj, null, 2)}
                    </pre>
                  </div>
                ) : null}
                {afterObj ? (
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-mint">After state</span>
                    <pre className="overflow-x-auto rounded-lg bg-charcoal p-3 font-mono text-xs text-paper">
                      {JSON.stringify(afterObj, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-ink/[0.07] px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
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
    <Panel
      title="Automated recurring exports"
      description="Deliver scheduled activity snapshots directly to compliance, legal, or security inboxes."
      icon={<DownloadIcon size={16} />}
      actions={
        schedules.length > 0 ? (
          <Pill tone="success" dot>
            {schedules.length} active
          </Pill>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {errMsg ? <Callout tone="danger">{errMsg}</Callout> : null}
        {createErr ? <Callout tone="danger">{createErr}</Callout> : null}
        {successNotice ? (
          <Callout tone="success">{successNotice}</Callout>
        ) : null}

        {/* Creation form */}
        <div className="grid grid-cols-1 items-end gap-4 rounded-lg bg-ink/[0.03] p-4 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <Label htmlFor="export-email">Recipient mailbox</Label>
            <Input
              id="export-email"
              type="email"
              placeholder="compliance@vyro.lk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="export-frequency">Frequency</Label>
            <Select
              id="export-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            >
              <option value="daily">Daily (midnight UTC)</option>
              <option value="weekly">Weekly (Monday)</option>
              <option value="monthly">Monthly (1st of month)</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="export-format">Format</Label>
            <Select id="export-format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              <option value="csv">CSV (spreadsheet)</option>
              <option value="json">JSON (data)</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Button
              className="w-full"
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!email.includes('@')}
            >
              Schedule
            </Button>
          </div>
        </div>

        {/* Active schedules list */}
        {list.isLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : schedules.length === 0 ? (
          <EmptyBlock
            icon={<CalendarIcon size={22} />}
            title="No export schedules"
            description="Create one above to receive recurring activity archives."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Recipient mailbox</th>
                  <th>Delivery cadence</th>
                  <th>Format</th>
                  <th>Next scheduled run</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-mono text-xs font-semibold text-ink">{s.email}</span>
                    </td>
                    <td>
                      <Pill tone="neutral" className="capitalize">
                        {s.frequency}
                      </Pill>
                    </td>
                    <td>
                      <Pill tone="info" className="font-mono uppercase">
                        {s.format}
                      </Pill>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-ink-3">
                        {s.nextRunAt ? new Date(s.nextRunAt).toISOString().slice(0, 10) : 'Pending'}
                      </span>
                    </td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancel.mutate(s.id)}
                        loading={cancel.isPending && cancel.variables === s.id}
                        aria-label={`Cancel schedule for ${s.email}`}
                        className="text-rose hover:bg-rose/10"
                      >
                        Cancel schedule
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
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
