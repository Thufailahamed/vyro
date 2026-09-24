import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { Button, Input, Label, Select, Textarea } from '@/components/ui';
import { usePermission } from './lib/permissions';
import { api } from '@/lib/api';
import {
  useAbuseReports,
  useClaimReport,
  useAddReportNote,
  useResolveReport,
  useTakedown,
  useKycReviews,
  useKycDecision,
  useSuspendUser,
  useUnsuspendUser,
  type AbuseReportRow,
} from './useAdminTrustSafety';
import { DocumentViewer } from './DocumentViewer';
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  UserCheckIcon,
  SearchIcon,
  XIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  EyeIcon,
} from '@/components/icons';
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
  StatusPill,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
  type PillTone,
} from './ui';

type Tab = 'reports' | 'kyc' | 'users';

const linkBtnClass =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-paper px-4 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-colors hover:bg-ink hover:text-paper';

function formatTimestamp(t: number | null | undefined): string {
  if (!t) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(t).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(id: string): string {
  if (!id) return 'ID';
  const clean = id.replace(/^(usr_|user_|kyc_|rep_)/i, '');
  return clean.slice(0, 2).toUpperCase();
}

function reasonTone(reason: string): PillTone {
  if (reason === 'fraud') return 'danger';
  if (reason === 'harassment') return 'warning';
  if (reason === 'spam') return 'info';
  return 'neutral';
}

function kycTone(status: string): PillTone {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'needs_more_info') return 'info';
  return 'warning';
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-md">
      <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(controlClass, 'w-full pl-9 pr-8')}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
          title="Clear search"
          aria-label="Clear search"
        >
          <XIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}

function ModalShell({
  title,
  sub,
  icon,
  tone = 'neutral',
  onClose,
  children,
  wide,
}: {
  title: string;
  sub?: string | undefined;
  icon: React.ReactNode;
  tone?: 'neutral' | 'danger';
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={cn('vyro-surface w-full overflow-hidden', wide ? 'max-w-2xl' : 'max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-3 border-b border-ink/[0.07] px-5 py-4',
            tone === 'danger' ? 'bg-rose/[0.07]' : 'bg-bone/40',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                tone === 'danger' ? 'bg-rose/15 text-rose' : 'bg-copper/15 text-copper',
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">{title}</h3>
              {sub ? <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{sub}</p> : null}
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
        <div className={cn('p-5 sm:p-6', wide && 'max-h-[75vh] overflow-y-auto')}>{children}</div>
      </div>
    </div>
  );
}

export function TrustSafetyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'reports';

  const switchTab = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  // Live KPI counters
  const openReportsQuery = useAbuseReports({ status: 'open' });
  const pendingKycQuery = useKycReviews({ status: 'pending' });

  const openReportsCount = openReportsQuery.data?.length ?? 0;
  const pendingKycCount = pendingKycQuery.data?.length ?? 0;
  const kpisLoading = openReportsQuery.isLoading || pendingKycQuery.isLoading;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Governance &amp; Access</span>
            <span className="text-ink-4">/</span>
            <span>Trust, Safety &amp; Identity</span>
          </>
        }
        title="Trust & Safety"
        description="Incident triage, abuse report mediation, merchant identity verification (KYC), and platform account enforcement."
        actions={
          <>
            <Link to="/admin/users" className={linkBtnClass}>
              User accounts
              <ExternalLinkIcon size={14} />
            </Link>
            <Link to="/admin/audit" className={linkBtnClass}>
              Audit trail
              <ArrowRightIcon size={14} />
            </Link>
          </>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Open abuse reports"
          value={openReportsCount}
          sub="Community reports"
          icon={<AlertTriangleIcon size={16} />}
          tone={openReportsCount > 0 ? 'danger' : 'neutral'}
          status={
            openReportsCount > 0 ? (
              <Pill tone="danger" dot>
                Requires triage
              </Pill>
            ) : (
              <Pill tone="success" dot>
                Queue clear
              </Pill>
            )
          }
          loading={kpisLoading}
        />
        <StatCard
          label="Pending KYC reviews"
          value={pendingKycCount}
          sub="Identity verification"
          icon={<UserCheckIcon size={16} />}
          tone={pendingKycCount > 0 ? 'warning' : 'neutral'}
          status={
            pendingKycCount > 0 ? (
              <Pill tone="warning" dot>
                Awaiting review
              </Pill>
            ) : (
              <Pill tone="success" dot>
                All verified
              </Pill>
            )
          }
          loading={kpisLoading}
        />
        <StatCard
          label="Account enforcement"
          value="Active"
          sub="Automated session kill on suspension"
          icon={<ShieldCheckIcon size={16} />}
          status={
            <Pill tone="success" dot>
              Live
            </Pill>
          }
        />
        <StatCard
          label="Compliance & safety"
          value="Audited"
          sub="100% traceability · immutable logging"
          icon={<FileTextIcon size={16} />}
        />
      </StatGrid>

      <Tabs
        items={[
          { key: 'reports', label: 'Abuse reports', icon: <AlertTriangleIcon size={15} />, count: openReportsCount > 0 ? openReportsCount : undefined },
          { key: 'kyc', label: 'KYC verification', icon: <UserCheckIcon size={15} />, count: pendingKycCount > 0 ? pendingKycCount : undefined },
          { key: 'users', label: 'Account enforcement', icon: <ShieldCheckIcon size={15} /> },
        ]}
        value={tab}
        onChange={switchTab}
        ariaLabel="Trust & safety sections"
      />

      {tab === 'reports' && <ReportsTab />}
      {tab === 'kyc' && <KycTab />}
      {tab === 'users' && <UsersTab />}
    </AdminPage>
  );
}

/* ========================================================================= */
/* TAB 1: Abuse Reports                                                      */
/* ========================================================================= */

function ReportsTab() {
  const canRead = usePermission('abuse_report:read');
  const canResolve = usePermission('abuse_report:resolve');
  const canTakedown = usePermission('takedown:write');

  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [search, setSearch] = useState('');

  const reportsQuery = useAbuseReports({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const claim = useClaimReport();
  const addNote = useAddReportNote();
  const resolve = useResolveReport();
  const takedown = useTakedown();

  const [selectedReportForNotes, setSelectedReportForNotes] = useState<AbuseReportRow | null>(null);
  const [selectedReportForResolve, setSelectedReportForResolve] = useState<{
    report: AbuseReportRow;
    resolution: 'resolved' | 'dismissed';
  } | null>(null);
  const [reportNoteText, setReportNoteText] = useState('');
  const [resolveNoteText, setResolveNoteText] = useState('');
  const [takedownConfirm, setTakedownConfirm] = useState<AbuseReportRow | null>(null);

  const filteredReports = useMemo(() => {
    const list = reportsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.targetId.toLowerCase().includes(q) ||
        r.targetType.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        (r.details && r.details.toLowerCase().includes(q)) ||
        (r.resolutionNotes && r.resolutionNotes.toLowerCase().includes(q)),
    );
  }, [reportsQuery.data, search]);

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You require the <span className="font-mono text-xs">abuse_report:read</span> permission to inspect abuse
        reports.
      </Callout>
    );
  }

  return (
    <div className="space-y-4">
      <TableCard
        title="Abuse report queue"
        description="Community-submitted incident reports awaiting triage and moderation."
        toolbar={
          <Toolbar
            actions={
              <>
                <Tabs
                  items={[
                    { key: 'open', label: 'Open' },
                    { key: 'investigating', label: 'Investigating' },
                    { key: 'resolved', label: 'Resolved' },
                    { key: 'dismissed', label: 'Dismissed' },
                    { key: 'all', label: 'All reports' },
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  ariaLabel="Filter by status"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10"
                  onClick={() => void reportsQuery.refetch()}
                  loading={reportsQuery.isFetching}
                  icon={<RefreshCwIcon size={14} />}
                >
                  Refresh
                </Button>
              </>
            }
          >
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by report ID, target ID, reason, or details…"
            />
          </Toolbar>
        }
        footer={
          <span>
            Showing <strong className="text-ink">{filteredReports.length}</strong> of{' '}
            {(reportsQuery.data ?? []).length} {statusFilter === 'all' ? 'reports' : `${statusFilter} reports`}
            {search ? ' · filter applied' : ''}
          </span>
        }
      >
        {reportsQuery.isError ? (
          <div className="p-5 sm:p-6">
            <Callout
              tone="danger"
              title="Could not load abuse reports"
              action={
                <Button variant="secondary" size="sm" onClick={() => void reportsQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {(reportsQuery.error as Error).message}
            </Callout>
          </div>
        ) : reportsQuery.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filteredReports.length === 0 ? (
          <EmptyBlock
            icon={<CheckCircleIcon size={22} />}
            title="Incident queue clear"
            description={`No abuse reports currently match the "${statusFilter}" filter.`}
            action={
              statusFilter !== 'all' || search ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                >
                  View all reports
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Target entity</th>
                <th>Violation</th>
                <th>Status</th>
                <th>Opened</th>
                <th>
                  <span className="sr-only">Moderation actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <CellStack mono primary={r.id} secondary={r.assignedTo ? `Assigned: ${r.assignedTo}` : undefined} />
                  </td>
                  <td>
                    <CellStack
                      primary={
                        <span className="flex items-center gap-1.5">
                          <Pill tone="neutral" className="uppercase">{r.targetType}</Pill>
                          <span className="max-w-[140px] truncate font-mono text-xs" title={r.targetId}>
                            {r.targetId}
                          </span>
                        </span>
                      }
                      secondary={r.details ? r.details : undefined}
                    />
                  </td>
                  <td>
                    <CellStack
                      primary={
                        <Pill tone={reasonTone(r.reason)} className="uppercase">
                          {r.reason}
                        </Pill>
                      }
                      secondary={r.resolutionNotes ? `Note: ${r.resolutionNotes}` : undefined}
                    />
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>
                    <CellStack primary={formatTimestamp(r.createdAt)} />
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.status === 'open' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => claim.mutate(r.id)}
                          loading={claim.isPending && claim.variables === r.id}
                        >
                          Claim
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedReportForNotes(r);
                          setReportNoteText('');
                        }}
                      >
                        Add note
                      </Button>
                      {canResolve && r.status !== 'resolved' ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setSelectedReportForResolve({ report: r, resolution: 'resolved' });
                            setResolveNoteText('');
                          }}
                        >
                          Resolve
                        </Button>
                      ) : null}
                      {canResolve && r.status !== 'dismissed' && r.status !== 'resolved' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedReportForResolve({ report: r, resolution: 'dismissed' });
                            setResolveNoteText('');
                          }}
                        >
                          Dismiss
                        </Button>
                      ) : null}
                      {canTakedown ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose hover:bg-rose/10"
                          onClick={() => setTakedownConfirm(r)}
                        >
                          Takedown
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      {/* Add Note Modal */}
      {selectedReportForNotes ? (
        <ModalShell
          title="Add investigation note"
          sub={`${selectedReportForNotes.id} · ${selectedReportForNotes.targetType}:${selectedReportForNotes.targetId}`}
          icon={<FileTextIcon size={15} />}
          onClose={() => setSelectedReportForNotes(null)}
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="report-note">Internal moderation note</Label>
              <Textarea
                id="report-note"
                rows={3}
                value={reportNoteText}
                onChange={(e) => setReportNoteText(e.target.value)}
                placeholder="Enter internal moderation note or investigator observations…"
                disabled={addNote.isPending}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedReportForNotes(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={addNote.isPending}
                disabled={!reportNoteText.trim()}
                onClick={() => {
                  addNote.mutate(
                    { id: selectedReportForNotes.id, note: reportNoteText.trim() },
                    { onSuccess: () => setSelectedReportForNotes(null) },
                  );
                }}
              >
                Save note
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* Resolve / Dismiss Dialog */}
      {selectedReportForResolve ? (
        <ModalShell
          title={`${selectedReportForResolve.resolution === 'resolved' ? 'Resolve' : 'Dismiss'} abuse report`}
          sub={selectedReportForResolve.report.id}
          icon={<CheckCircleIcon size={15} />}
          onClose={() => setSelectedReportForResolve(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-3">
              Mark report <strong className="font-mono text-xs text-ink">{selectedReportForResolve.report.id}</strong>{' '}
              as <span className="font-semibold uppercase text-ink">{selectedReportForResolve.resolution}</span>.
            </p>
            <div>
              <Label htmlFor="resolve-note">Resolution notes</Label>
              <Textarea
                id="resolve-note"
                rows={3}
                value={resolveNoteText}
                onChange={(e) => setResolveNoteText(e.target.value)}
                placeholder="e.g. Content reviewed and verified compliant, merchant warned…"
                disabled={resolve.isPending}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedReportForResolve(null)}>
                Cancel
              </Button>
              <Button
                variant={selectedReportForResolve.resolution === 'resolved' ? 'primary' : 'secondary'}
                size="sm"
                loading={resolve.isPending}
                onClick={() => {
                  resolve.mutate(
                    {
                      id: selectedReportForResolve.report.id,
                      resolution: selectedReportForResolve.resolution,
                      notes: resolveNoteText.trim() || undefined,
                    },
                    { onSuccess: () => setSelectedReportForResolve(null) },
                  );
                }}
              >
                Confirm {selectedReportForResolve.resolution === 'resolved' ? 'resolution' : 'dismissal'}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* Takedown Confirmation Modal */}
      {takedownConfirm ? (
        <ModalShell
          title="Confirm entity takedown"
          sub={`${takedownConfirm.targetType}:${takedownConfirm.targetId}`}
          icon={<AlertTriangleIcon size={16} />}
          tone="danger"
          onClose={() => setTakedownConfirm(null)}
        >
          <div className="space-y-4">
            <Callout tone="danger" title="Destructive action">
              This will immediately remove or delist target{' '}
              <strong className="font-mono text-xs">
                {takedownConfirm.targetType}:{takedownConfirm.targetId}
              </strong>{' '}
              from the public store catalog and mark the abuse report resolved.
            </Callout>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setTakedownConfirm(null)} disabled={takedown.isPending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={takedown.isPending}
                onClick={() => {
                  takedown.mutate(takedownConfirm.id, {
                    onSuccess: () => setTakedownConfirm(null),
                  });
                }}
              >
                Confirm takedown
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

/* ========================================================================= */
/* TAB 2: KYC Reviews                                                        */
/* ========================================================================= */

function KycTab() {
  const canRead = usePermission('kyc:read');
  const canReview = usePermission('kyc:review');

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');

  const listQuery = useKycReviews({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const decision = useKycDecision();

  const detailQuery = useQuery({
    queryKey: ['kyc-detail', detailId],
    queryFn: async () => {
      const r = await api.get<{
        id: string;
        userId: string;
        status: string;
        documentsJson: string | null;
        notes: string | null;
        reviewedBy?: string | null;
        reviewedAt?: number | null;
        createdAt: number;
      }>(`/admin/kyc/${detailId}`);
      return r;
    },
    enabled: !!detailId,
  });

  const filteredKyc = useMemo(() => {
    const list = listQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (k) =>
        k.id.toLowerCase().includes(q) ||
        k.userId.toLowerCase().includes(q) ||
        (k.notes && k.notes.toLowerCase().includes(q)),
    );
  }, [listQuery.data, search]);

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You require the <span className="font-mono text-xs">kyc:read</span> permission to inspect KYC identity
        reviews.
      </Callout>
    );
  }

  return (
    <div className="space-y-4">
      <TableCard
        title="Identity verification queue"
        description="Merchant KYC dossiers awaiting compliance review."
        toolbar={
          <Toolbar
            actions={
              <>
                <Tabs
                  items={[
                    { key: 'pending', label: 'Pending' },
                    { key: 'approved', label: 'Approved' },
                    { key: 'rejected', label: 'Rejected' },
                    { key: 'needs_more_info', label: 'Needs info' },
                    { key: 'all', label: 'All reviews' },
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  ariaLabel="Filter by status"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10"
                  onClick={() => void listQuery.refetch()}
                  loading={listQuery.isFetching}
                  icon={<RefreshCwIcon size={14} />}
                >
                  Refresh
                </Button>
              </>
            }
          >
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search KYC dossiers by user ID or review ID…"
            />
          </Toolbar>
        }
        footer={
          <span>
            Showing <strong className="text-ink">{filteredKyc.length}</strong> of {(listQuery.data ?? []).length}{' '}
            dossiers
            {search ? ' · filter applied' : ''}
          </span>
        }
      >
        {listQuery.isError ? (
          <div className="p-5 sm:p-6">
            <Callout
              tone="danger"
              title="Could not load KYC reviews"
              action={
                <Button variant="secondary" size="sm" onClick={() => void listQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {(listQuery.error as Error).message}
            </Callout>
          </div>
        ) : listQuery.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filteredKyc.length === 0 ? (
          <EmptyBlock
            icon={<UserCheckIcon size={22} />}
            title="No KYC dossiers found"
            description={`There are currently no verification dossiers matching the "${statusFilter.replace(/_/g, ' ')}" status.`}
            action={
              statusFilter !== 'all' || search ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                >
                  View all KYC records
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Review</th>
                <th>Subject user</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Reviewer notes</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredKyc.map((k) => (
                <tr key={k.id}>
                  <td>
                    <CellStack mono primary={k.id} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-bold text-paper">
                        {getInitials(k.userId)}
                      </span>
                      <span className="max-w-[160px] truncate font-mono text-xs text-ink" title={k.userId}>
                        {k.userId}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Pill tone={kycTone(k.status)} dot>
                      {k.status.replace(/_/g, ' ')}
                    </Pill>
                  </td>
                  <td>
                    <CellStack primary={formatTimestamp(k.createdAt)} />
                  </td>
                  <td>
                    <span className="block max-w-xs truncate text-xs text-ink-4" title={k.notes || ''}>
                      {k.notes || '—'}
                    </span>
                  </td>
                  <td className="text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setDetailId(k.id);
                        setDecisionNotes('');
                      }}
                      icon={<EyeIcon size={13} />}
                    >
                      Review dossier
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      {/* KYC Dossier Modal */}
      {detailId ? (
        <ModalShell
          title="KYC identity dossier"
          sub={detailId}
          icon={<UserCheckIcon size={15} />}
          onClose={() => setDetailId(null)}
          wide
        >
          {detailQuery.isLoading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : detailQuery.isError ? (
            <Callout
              tone="danger"
              title="Could not load dossier"
              action={
                <Button variant="secondary" size="sm" onClick={() => void detailQuery.refetch()}>
                  Retry
                </Button>
              }
            >
              {(detailQuery.error as Error).message}
            </Callout>
          ) : detailQuery.data ? (
            <div className="space-y-5">
              <DetailList
                columns={2}
                items={[
                  { label: 'Review ID', value: <span className="font-mono text-xs">{detailQuery.data.id}</span> },
                  { label: 'Subject user', value: <span className="font-mono text-xs">{detailQuery.data.userId}</span> },
                  {
                    label: 'Status',
                    value: (
                      <Pill tone={kycTone(detailQuery.data.status)} dot>
                        {detailQuery.data.status.replace(/_/g, ' ')}
                      </Pill>
                    ),
                  },
                  { label: 'Submitted', value: formatTimestamp(detailQuery.data.createdAt) },
                ]}
              />

              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                  Submitted identity documents
                </h4>
                <DocumentViewer kycId={detailQuery.data.id} />
              </div>

              {detailQuery.data.notes ? (
                <div>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                    Existing reviewer notes
                  </h4>
                  <p className="rounded-lg bg-bone/60 p-3 text-xs leading-relaxed text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
                    {detailQuery.data.notes}
                  </p>
                </div>
              ) : null}

              {canReview ? (
                <div className="space-y-3 border-t border-ink/[0.07] pt-4">
                  <div>
                    <Label htmlFor="kyc-decision-notes">Reviewer decision notes (optional)</Label>
                    <Textarea
                      id="kyc-decision-notes"
                      rows={2}
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      placeholder="Add compliance notes explaining this decision…"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
                      Close
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={decision.isPending}
                      onClick={() => {
                        decision.mutate(
                          { id: detailQuery.data!.id, decision: 'needs_more_info', notes: decisionNotes.trim() || undefined },
                          { onSuccess: () => setDetailId(null) },
                        );
                      }}
                    >
                      Request more info
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={decision.isPending}
                      onClick={() => {
                        decision.mutate(
                          { id: detailQuery.data!.id, decision: 'rejected', notes: decisionNotes.trim() || undefined },
                          { onSuccess: () => setDetailId(null) },
                        );
                      }}
                    >
                      Reject identity
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      disabled={decision.isPending}
                      onClick={() => {
                        decision.mutate(
                          { id: detailQuery.data!.id, decision: 'approved', notes: decisionNotes.trim() || undefined },
                          { onSuccess: () => setDetailId(null) },
                        );
                      }}
                    >
                      Approve identity
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end border-t border-ink/[0.07] pt-4">
                  <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
                    Close
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}

/* ========================================================================= */
/* TAB 3: Account Enforcement                                                */
/* ========================================================================= */

function UsersTab() {
  const canSuspend = usePermission('user:suspend');
  const canUnsuspend = usePermission('user:unsuspend');
  const suspend = useSuspendUser();
  const unsuspend = useUnsuspendUser();

  const [userId, setUserId] = useState('');
  const [reasonCategory, setReasonCategory] = useState('terms');
  const [confirmModal, setConfirmModal] = useState<'suspend' | 'unsuspend' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!canSuspend && !canUnsuspend) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You require the <span className="font-mono text-xs">user:suspend</span> permission to execute account
        enforcement actions.
      </Callout>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Panel
        title="Account sanctions & suspension"
        description="Execute immediate administrative account suspension or reinstatement."
        icon={<ShieldCheckIcon size={16} />}
        className="lg:col-span-2"
      >
        <div className="space-y-4">
          {feedback ? (
            <Callout tone={feedback.type === 'success' ? 'success' : 'danger'}>{feedback.message}</Callout>
          ) : null}

          <div>
            <Label htmlFor="enforce-user-id">
              Target user ID <span className="text-rose">*</span>
            </Label>
            <Input
              id="enforce-user-id"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value.trim())}
              placeholder="e.g. usr_9f81a7b2… or user_…"
              className="font-mono"
            />
            <p className="mt-1.5 text-xs text-ink-4">
              Look up registered IDs in the{' '}
              <Link to="/admin/users" className="font-medium text-copper transition-colors hover:text-ink">
                Users directory
              </Link>
              .
            </p>
          </div>

          <div>
            <Label htmlFor="enforce-reason">Violation category</Label>
            <Select id="enforce-reason" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)}>
              <option value="terms">Terms of Service / Policy Violation</option>
              <option value="fraud">Suspected Fraud / Payment Dispute Abuse</option>
              <option value="counterfeit">Counterfeit, Expired, or Restricted Goods</option>
              <option value="harassment">Harassment / Abusive Communications</option>
              <option value="security">Account Compromise / Security Quarantine</option>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-ink/[0.07] pt-4">
            {canSuspend ? (
              <Button
                variant="danger"
                size="sm"
                disabled={!userId || suspend.isPending}
                onClick={() => setConfirmModal('suspend')}
              >
                Suspend account
              </Button>
            ) : null}
            {canUnsuspend ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={!userId || unsuspend.isPending}
                onClick={() => setConfirmModal('unsuspend')}
              >
                Unsuspend &amp; reinstate
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Card>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">Enforcement protocols</h3>
          <ul className="mt-3 space-y-3 text-xs text-ink-3">
            <li className="flex items-start gap-2">
              <AlertTriangleIcon size={15} className="mt-0.5 shrink-0 text-rose" />
              <span>
                <strong className="text-ink">Session invalidation:</strong> suspension immediately terminates all
                active browser sessions and API bearer tokens.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangleIcon size={15} className="mt-0.5 shrink-0 text-rose" />
              <span>
                <strong className="text-ink">Transaction freeze:</strong> prevents checkout, cart submissions, and
                payout disbursements.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="mt-0.5 shrink-0 text-mint" />
              <span>
                <strong className="text-ink">Audited signature:</strong> every action records operator identity, IP,
                and reason in the immutable audit log.
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">Related portals</h3>
          <div className="mt-3 space-y-2">
            {[
              { to: '/admin/users', label: 'Platform users directory', icon: <ExternalLinkIcon size={13} /> },
              { to: '/admin/audit', label: 'Audit activity stream', icon: <ArrowRightIcon size={13} /> },
              { to: '/admin/roles', label: 'Administrator roles', icon: <ArrowRightIcon size={13} /> },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center justify-between rounded-lg bg-ink/[0.04] px-3.5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/[0.08]"
              >
                <span>{l.label}</span>
                <span className="text-ink-4">{l.icon}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Confirmation Modal */}
      {confirmModal ? (
        <ModalShell
          title={`Confirm account ${confirmModal}`}
          sub={userId}
          icon={<AlertTriangleIcon size={16} />}
          tone={confirmModal === 'suspend' ? 'danger' : 'neutral'}
          onClose={() => setConfirmModal(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-3">
              Are you sure you want to {confirmModal} user account{' '}
              <strong className="font-mono text-xs text-ink">{userId}</strong>?
            </p>
            {confirmModal === 'suspend' ? (
              <Callout tone="danger" title="Security consequence">
                This terminates all active sessions immediately and locks platform login privileges.
              </Callout>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmModal(null)}
                disabled={suspend.isPending || unsuspend.isPending}
              >
                Cancel
              </Button>
              <Button
                variant={confirmModal === 'suspend' ? 'danger' : 'primary'}
                size="sm"
                loading={suspend.isPending || unsuspend.isPending}
                onClick={() => {
                  if (confirmModal === 'suspend') {
                    suspend.mutate(userId, {
                      onSuccess: () => {
                        setFeedback({ type: 'success', message: `User ${userId} has been suspended.` });
                        setConfirmModal(null);
                        setUserId('');
                      },
                      onError: (err: unknown) => {
                        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Suspension failed.' });
                        setConfirmModal(null);
                      },
                    });
                  } else {
                    unsuspend.mutate(userId, {
                      onSuccess: () => {
                        setFeedback({ type: 'success', message: `User ${userId} has been reinstated.` });
                        setConfirmModal(null);
                        setUserId('');
                      },
                      onError: (err: unknown) => {
                        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Reinstatement failed.' });
                        setConfirmModal(null);
                      },
                    });
                  }
                }}
              >
                Confirm {confirmModal === 'suspend' ? 'suspension' : 'reinstatement'}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
