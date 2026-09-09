import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Surface, ErrorBanner, SuccessBanner, Button, EmptyState } from '@/components/ui';
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
  type KycReviewRow,
} from './useAdminTrustSafety';
import { DocumentViewer } from './DocumentViewer';
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  UserCheckIcon,
  UsersIcon,
  SearchIcon,
  XIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  EyeIcon,
} from '@/components/icons';

type Tab = 'reports' | 'kyc' | 'users';

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

export function TrustSafetyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'reports';

  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  // Live KPI counters
  const openReportsQuery = useAbuseReports({ status: 'open' });
  const pendingKycQuery = useKycReviews({ status: 'pending' });

  const openReportsCount = openReportsQuery.data?.length ?? 0;
  const pendingKycCount = pendingKycQuery.data?.length ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink/60 mb-1">
            <span>Governance & Access</span>
            <span>/</span>
            <span className="text-copper font-bold">Trust, Safety & Identity</span>
          </div>
          <h1 className="vyro-display text-3xl md:text-4xl text-ink tracking-tight">Trust & Safety</h1>
          <p className="text-sm text-ink-500 mt-1 max-w-2xl">
            Incident triage, abuse report mediation, merchant identity verification (KYC), and platform account enforcement.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Link
            to="/admin/users"
            className="vyro-btn vyro-btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-medium"
          >
            User Accounts
            <ExternalLinkIcon size={13} />
          </Link>
          <Link
            to="/admin/audit"
            className="vyro-btn vyro-btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-medium"
          >
            Audit Trail
            <ArrowRightIcon size={13} />
          </Link>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Open Abuse Reports */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Open Abuse Reports
            </span>
            <div
              className={`p-2 rounded-md ${
                openReportsCount > 0 ? 'bg-rose/10 text-rose' : 'bg-mint/10 text-mint'
              }`}
            >
              <AlertTriangleIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {openReportsCount}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              {openReportsCount > 0 ? (
                <span className="font-semibold text-rose">• Requires Triage</span>
              ) : (
                <span className="font-semibold text-mint">• Queue Clear</span>
              )}
              <span>• Community reports</span>
            </div>
          </div>
        </Surface>

        {/* Pending KYC Dossiers */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Pending KYC Reviews
            </span>
            <div
              className={`p-2 rounded-md ${
                pendingKycCount > 0 ? 'bg-amber/10 text-amber' : 'bg-sand/30 text-ink'
              }`}
            >
              <UserCheckIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {pendingKycCount}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              {pendingKycCount > 0 ? (
                <span className="font-semibold text-amber">• Awaiting Review</span>
              ) : (
                <span className="font-semibold text-mint">• All Verified</span>
              )}
              <span>• Identity verification</span>
            </div>
          </div>
        </Surface>

        {/* Enforcement Engine */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Account Enforcement
            </span>
            <div className="p-2 rounded-md bg-sand/30 text-ink">
              <ShieldCheckIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              Active
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span className="font-semibold text-mint">• Automated session kill</span>
              <span>On suspension</span>
            </div>
          </div>
        </Surface>

        {/* Audit Verification */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Compliance & Safety
            </span>
            <div className="p-2 rounded-md bg-sand/30 text-ink">
              <FileTextIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              Audited
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span className="font-semibold text-mint">• 100% Traceability</span>
              <span>Immutable logging</span>
            </div>
          </div>
        </Surface>
      </section>

      {/* Modern High-Contrast Navigation Tabs */}
      <nav className="flex items-center gap-1 border-b border-ink/15 overflow-x-auto pt-2">
        <TabButton
          active={tab === 'reports'}
          onClick={() => switchTab('reports')}
          icon={<AlertTriangleIcon size={15} />}
          badge={openReportsCount > 0 ? openReportsCount : undefined}
          badgeColor="danger"
        >
          Abuse Reports
        </TabButton>
        <TabButton
          active={tab === 'kyc'}
          onClick={() => switchTab('kyc')}
          icon={<UserCheckIcon size={15} />}
          badge={pendingKycCount > 0 ? pendingKycCount : undefined}
          badgeColor="danger"
        >
          KYC Verification
        </TabButton>
        <TabButton
          active={tab === 'users'}
          onClick={() => switchTab('users')}
          icon={<ShieldCheckIcon size={15} />}
        >
          Account Enforcement
        </TabButton>
      </nav>

      {/* Tab Panels */}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'kyc' && <KycTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  badge,
  badgeColor = 'default',
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  badge?: number | undefined;
  badgeColor?: 'default' | 'danger' | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap ${
        active
          ? 'bg-sand/30 border-ink text-ink font-semibold shadow-sm'
          : 'border-transparent text-ink-500 hover:text-ink hover:bg-sand/10'
      }`}
    >
      {icon}
      <span>{children}</span>
      {badge !== undefined && (
        <span
          className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded-full ${
            badgeColor === 'danger' ? 'bg-rose text-paper' : 'bg-ink/10 text-ink'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
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
    return <ErrorBanner message="You require the 'abuse_report:read' permission to inspect abuse reports." />;
  }

  return (
    <div className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-paper p-3 rounded-lg border border-ink/10">
        <div className="relative flex-1 max-w-md">
          <SearchIcon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by report ID, target ID, reason, or details…"
            className="w-full pl-9 pr-8 py-1.5 text-sm bg-paper border border-ink/20 rounded focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'open', label: 'Open' },
            { id: 'investigating', label: 'Investigating' },
            { id: 'resolved', label: 'Resolved' },
            { id: 'dismissed', label: 'Dismissed' },
            { id: 'all', label: 'All Reports' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(s.id)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition whitespace-nowrap ${
                statusFilter === s.id
                  ? 'bg-ink text-paper'
                  : 'bg-sand/30 text-ink hover:bg-sand/60'
              }`}
            >
              {s.label}
            </button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => reportsQuery.refetch()}
            loading={reportsQuery.isFetching}
            icon={<RefreshCwIcon size={13} />}
            className="h-7 text-xs ml-1"
          >
            Refresh
          </Button>
        </div>
      </div>

      {reportsQuery.isError && (
        <ErrorBanner message={(reportsQuery.error as Error).message} />
      )}

      {/* Main Table */}
      {reportsQuery.isLoading ? (
        <Surface className="p-8 text-center space-y-3">
          <div className="animate-spin w-6 h-6 border-2 border-ink border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-ink-500 font-mono">Loading incident reports…</p>
        </Surface>
      ) : filteredReports.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2Icon size={24} />}
          title="Incident Queue Clear"
          description={`No abuse reports currently match the "${statusFilter}" filter.`}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="text-xs"
            >
              View All Reports
            </Button>
          }
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-sand/20 border-b border-ink/10 text-xs font-mono uppercase tracking-wider text-ink-500">
                  <th className="py-3 px-4">Report ID</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4">Violation Category</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Opened Timeline</th>
                  <th className="py-3 px-4 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filteredReports.map((r) => {
                  const reasonColor =
                    r.reason === 'fraud'
                      ? 'bg-rose/15 text-rose border-rose/30'
                      : r.reason === 'harassment'
                        ? 'bg-amber/15 text-amber border-amber/30'
                        : r.reason === 'spam'
                          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                          : 'bg-sand/40 text-ink border-ink/20';

                  const statusColor =
                    r.status === 'open'
                      ? 'text-amber bg-amber/10 border-amber/30'
                      : r.status === 'investigating'
                        ? 'text-sky-700 bg-sky-500/10 border-sky-500/30'
                        : r.status === 'resolved'
                          ? 'text-mint bg-mint/10 border-mint/30'
                          : 'text-ink-4 bg-ink/5 border-ink/10';

                  return (
                    <tr key={r.id} className="hover:bg-sand/10 transition">
                      {/* Report ID */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-ink">
                          {r.id}
                        </span>
                        {r.assignedTo && (
                          <div className="text-[11px] font-mono text-ink-4 mt-0.5">
                            Assigned: {r.assignedTo}
                          </div>
                        )}
                      </td>

                      {/* Target */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-ink/5 border border-ink/15 rounded text-ink">
                            {r.targetType}
                          </span>
                          <span className="font-mono text-xs text-ink truncate max-w-[140px]" title={r.targetId}>
                            {r.targetId}
                          </span>
                        </div>
                        {r.details && (
                          <div className="text-xs text-ink-500 mt-1 line-clamp-1 max-w-xs" title={r.details}>
                            {r.details}
                          </div>
                        )}
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wider border rounded ${reasonColor}`}>
                          {r.reason}
                        </span>
                        {r.resolutionNotes && (
                          <div className="text-[11px] text-ink-4 mt-1 italic line-clamp-1">
                            Note: {r.resolutionNotes}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-semibold border rounded capitalize ${statusColor}`}>
                          {r.status === 'open' && <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />}
                          {r.status === 'resolved' && <span className="w-1.5 h-1.5 rounded-full bg-mint" />}
                          {r.status}
                        </span>
                      </td>

                      {/* Opened Timeline */}
                      <td className="py-3 px-4 text-xs text-ink-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <ClockIcon size={13} className="text-ink-4 shrink-0" />
                          <span>{formatTimestamp(r.createdAt)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {r.status === 'open' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => claim.mutate(r.id)}
                              loading={claim.isPending && claim.variables === r.id}
                              className="h-7 text-xs px-2"
                            >
                              Claim
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedReportForNotes(r);
                              setReportNoteText('');
                            }}
                            className="h-7 text-xs px-2"
                          >
                            Add Note
                          </Button>

                          {canResolve && r.status !== 'resolved' && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                setSelectedReportForResolve({ report: r, resolution: 'resolved' });
                                setResolveNoteText('');
                              }}
                              className="h-7 text-xs px-2.5"
                            >
                              Resolve
                            </Button>
                          )}

                          {canResolve && r.status !== 'dismissed' && r.status !== 'resolved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedReportForResolve({ report: r, resolution: 'dismissed' });
                                setResolveNoteText('');
                              }}
                              className="h-7 text-xs px-2 text-ink-500"
                            >
                              Dismiss
                            </Button>
                          )}

                          {canTakedown && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setTakedownConfirm(r)}
                              className="h-7 text-xs px-2"
                            >
                              Takedown
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* Add Note Modal */}
      {selectedReportForNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-md rounded-xl shadow-2xl border border-ink/20 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-bold text-ink text-base">Add Investigation Note</h3>
              <button
                type="button"
                onClick={() => setSelectedReportForNotes(null)}
                className="text-ink-4 hover:text-ink p-1 rounded"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="text-xs text-ink-500">
              Report <strong className="font-mono text-ink">{selectedReportForNotes.id}</strong> ({selectedReportForNotes.targetType}:{selectedReportForNotes.targetId})
            </div>
            <textarea
              rows={3}
              value={reportNoteText}
              onChange={(e) => setReportNoteText(e.target.value)}
              placeholder="Enter internal moderation note or investigator observations…"
              className="w-full p-2.5 text-sm bg-paper border border-ink/20 rounded focus:border-ink focus:outline-none text-ink"
              disabled={addNote.isPending}
            />
            <div className="flex justify-end gap-2">
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
                Save Note
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve / Dismiss Dialog */}
      {selectedReportForResolve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-md rounded-xl shadow-2xl border border-ink/20 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-bold text-ink text-base capitalize">
                {selectedReportForResolve.resolution} Abuse Report
              </h3>
              <button
                type="button"
                onClick={() => setSelectedReportForResolve(null)}
                className="text-ink-4 hover:text-ink p-1 rounded"
              >
                <XIcon size={16} />
              </button>
            </div>

            <p className="text-xs text-ink-500">
              Mark report <strong className="font-mono text-ink">{selectedReportForResolve.report.id}</strong> as{' '}
              <span className="font-semibold text-ink uppercase">{selectedReportForResolve.resolution}</span>.
            </p>

            <textarea
              rows={3}
              value={resolveNoteText}
              onChange={(e) => setResolveNoteText(e.target.value)}
              placeholder="Resolution notes (e.g. Content reviewed and verified compliant, merchant warned)…"
              className="w-full p-2.5 text-sm bg-paper border border-ink/20 rounded focus:border-ink focus:outline-none text-ink"
              disabled={resolve.isPending}
            />

            <div className="flex justify-end gap-2">
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
                Confirm {selectedReportForResolve.resolution === 'resolved' ? 'Resolution' : 'Dismissal'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Takedown Confirmation Modal */}
      {takedownConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-md rounded-xl shadow-2xl border border-ink/20 p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose">
              <AlertTriangleIcon size={20} />
              <h3 className="font-bold text-base">Confirm Entity Takedown</h3>
            </div>

            <div className="p-3 bg-rose/10 border border-rose/20 rounded-md text-xs text-rose space-y-1">
              <p className="font-semibold">Destructive Action</p>
              <p>
                This will immediately remove or delist target{' '}
                <strong className="font-mono">{takedownConfirm.targetType}:{takedownConfirm.targetId}</strong> from public store catalog and mark the abuse report resolved.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
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
                Confirm Takedown
              </Button>
            </div>
          </div>
        </div>
      )}
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
    return <ErrorBanner message="You require the 'kyc:read' permission to inspect KYC identity reviews." />;
  }

  return (
    <div className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-paper p-3 rounded-lg border border-ink/10">
        <div className="relative flex-1 max-w-md">
          <SearchIcon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search KYC dossiers by User ID or Review ID…"
            className="w-full pl-9 pr-8 py-1.5 text-sm bg-paper border border-ink/20 rounded focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' },
            { id: 'needs_more_info', label: 'Needs Info' },
            { id: 'all', label: 'All Reviews' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(s.id)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition whitespace-nowrap ${
                statusFilter === s.id
                  ? 'bg-ink text-paper'
                  : 'bg-sand/30 text-ink hover:bg-sand/60'
              }`}
            >
              {s.label}
            </button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => listQuery.refetch()}
            loading={listQuery.isFetching}
            icon={<RefreshCwIcon size={13} />}
            className="h-7 text-xs ml-1"
          >
            Refresh
          </Button>
        </div>
      </div>

      {listQuery.isError && (
        <ErrorBanner message={(listQuery.error as Error).message} />
      )}

      {/* Main Table */}
      {listQuery.isLoading ? (
        <Surface className="p-8 text-center space-y-3">
          <div className="animate-spin w-6 h-6 border-2 border-ink border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-ink-500 font-mono">Loading identity verification records…</p>
        </Surface>
      ) : filteredKyc.length === 0 ? (
        <EmptyState
          icon={<UserCheckIcon size={24} />}
          title="No KYC Dossiers Found"
          description={`There are currently no verification dossiers matching the "${statusFilter}" status.`}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="text-xs"
            >
              View All KYC Records
            </Button>
          }
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-sand/20 border-b border-ink/10 text-xs font-mono uppercase tracking-wider text-ink-500">
                  <th className="py-3 px-4">Review ID</th>
                  <th className="py-3 px-4">Subject User</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submitted Timeline</th>
                  <th className="py-3 px-4">Reviewer Notes</th>
                  <th className="py-3 px-4 text-right">Dossier Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filteredKyc.map((k) => {
                  const statusColor =
                    k.status === 'pending'
                      ? 'text-amber bg-amber/10 border-amber/30'
                      : k.status === 'approved'
                        ? 'text-mint bg-mint/10 border-mint/30'
                        : k.status === 'rejected'
                          ? 'text-rose bg-rose/10 border-rose/30'
                          : 'text-copper bg-copper/10 border-copper/30';

                  return (
                    <tr key={k.id} className="hover:bg-sand/10 transition">
                      {/* ID */}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-ink">
                        {k.id}
                      </td>

                      {/* User */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-ink text-paper font-mono font-bold text-xs flex items-center justify-center shrink-0">
                            {getInitials(k.userId)}
                          </div>
                          <span className="font-mono text-xs text-ink truncate max-w-[160px]" title={k.userId}>
                            {k.userId}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-semibold border rounded capitalize ${statusColor}`}>
                          {k.status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />}
                          {k.status === 'approved' && <span className="w-1.5 h-1.5 rounded-full bg-mint" />}
                          {k.status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Timeline */}
                      <td className="py-3 px-4 text-xs text-ink-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <ClockIcon size={13} className="text-ink-4 shrink-0" />
                          <span>{formatTimestamp(k.createdAt)}</span>
                        </div>
                      </td>

                      {/* Notes */}
                      <td className="py-3 px-4 text-xs text-ink-500 max-w-xs truncate" title={k.notes || ''}>
                        {k.notes || <span className="text-ink-4">—</span>}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setDetailId(k.id);
                            setDecisionNotes('');
                          }}
                          className="h-8 text-xs font-medium"
                          icon={<EyeIcon size={13} />}
                        >
                          Review Dossier
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* KYC Dossier Modal */}
      {detailId && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setDetailId(null)}
        >
          <div
            className="bg-paper border border-ink/20 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <div className="flex items-center gap-2">
                <UserCheckIcon size={20} className="text-copper" />
                <h3 className="font-bold text-ink text-base">KYC Identity Dossier</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="text-ink-4 hover:text-ink p-1 rounded"
              >
                <XIcon size={18} />
              </button>
            </div>

            {detailQuery.isLoading ? (
              <div className="py-8 text-center space-y-2">
                <div className="animate-spin w-6 h-6 border-2 border-ink border-t-transparent rounded-full mx-auto" />
                <p className="text-xs text-ink-500 font-mono">Loading dossier documents…</p>
              </div>
            ) : detailQuery.isError ? (
              <ErrorBanner message={(detailQuery.error as Error).message} />
            ) : detailQuery.data ? (
              <div className="space-y-4">
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-sand/20 rounded-lg border border-ink/10 text-xs">
                  <div>
                    <span className="text-ink-500 block">Review ID:</span>
                    <strong className="font-mono text-ink truncate block">{detailQuery.data.id}</strong>
                  </div>
                  <div>
                    <span className="text-ink-500 block">Subject User:</span>
                    <strong className="font-mono text-ink truncate block">{detailQuery.data.userId}</strong>
                  </div>
                  <div>
                    <span className="text-ink-500 block">Status:</span>
                    <strong className="capitalize text-ink">{detailQuery.data.status.replace(/_/g, ' ')}</strong>
                  </div>
                  <div>
                    <span className="text-ink-500 block">Submitted:</span>
                    <strong className="text-ink">{formatTimestamp(detailQuery.data.createdAt)}</strong>
                  </div>
                </div>

                {/* Documents Display */}
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-wider text-ink font-semibold mb-1.5">
                    Submitted Identity Documents
                  </h4>
                  <DocumentViewer kycId={detailQuery.data.id} />
                </div>

                {/* Existing Notes */}
                {detailQuery.data.notes && (
                  <div>
                    <h4 className="text-xs font-mono uppercase tracking-wider text-ink font-semibold mb-1">
                      Existing Reviewer Notes
                    </h4>
                    <p className="p-2.5 bg-sand/20 rounded text-xs text-ink-500">
                      {detailQuery.data.notes}
                    </p>
                  </div>
                )}

                {/* Reviewer Decision Controls */}
                {canReview && (
                  <div className="space-y-3 pt-3 border-t border-ink/10">
                    <label className="block text-xs font-semibold text-ink">
                      Reviewer Decision Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      placeholder="Add compliance notes explaining this decision…"
                      className="w-full p-2 text-xs bg-paper border border-ink/20 rounded text-ink focus:border-ink focus:outline-none"
                    />

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailId(null)}
                      >
                        Close
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={decision.isPending}
                        onClick={() => {
                          decision.mutate(
                            {
                              id: detailQuery.data!.id,
                              decision: 'needs_more_info',
                              notes: decisionNotes.trim() || undefined,
                            },
                            { onSuccess: () => setDetailId(null) },
                          );
                        }}
                      >
                        Request More Info
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        disabled={decision.isPending}
                        onClick={() => {
                          decision.mutate(
                            {
                              id: detailQuery.data!.id,
                              decision: 'rejected',
                              notes: decisionNotes.trim() || undefined,
                            },
                            { onSuccess: () => setDetailId(null) },
                          );
                        }}
                      >
                        Reject Identity
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        disabled={decision.isPending}
                        onClick={() => {
                          decision.mutate(
                            {
                              id: detailQuery.data!.id,
                              decision: 'approved',
                              notes: decisionNotes.trim() || undefined,
                            },
                            { onSuccess: () => setDetailId(null) },
                          );
                        }}
                        className="bg-mint text-ink font-bold hover:bg-mint/90"
                      >
                        Approve Identity
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
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
    return <ErrorBanner message="You require 'user:suspend' permission to execute account enforcement actions." />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Enforcement Form */}
      <Surface className="p-6 lg:col-span-2 space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheckIcon size={20} className="text-rose" />
            <h2 className="text-lg font-bold text-ink">Account Sanctions & Suspension</h2>
          </div>
          <p className="text-xs text-ink-500 mt-1">
            Execute immediate administrative account suspension or reinstatement.
          </p>
        </div>

        {feedback && (
          feedback.type === 'success' ? (
            <SuccessBanner message={feedback.message} />
          ) : (
            <ErrorBanner message={feedback.message} />
          )
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Target User ID <span className="text-rose">*</span>
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value.trim())}
              placeholder="e.g. usr_9f81a7b2... or user_..."
              className="w-full px-3 py-2 text-sm font-mono bg-paper border border-ink/20 rounded-md focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
            />
            <p className="text-[11px] text-ink-4 mt-1">
              Lookup registered IDs in the <Link to="/admin/users" className="underline hover:text-ink">Users Directory</Link>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Violation Category
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-paper border border-ink/20 rounded-md focus:border-ink focus:outline-none text-ink font-medium"
            >
              <option value="terms">Terms of Service / Policy Violation</option>
              <option value="fraud">Suspected Fraud / Payment Dispute Abuse</option>
              <option value="counterfeit">Counterfeit, Expired, or Restricted Goods</option>
              <option value="harassment">Harassment / Abusive Communications</option>
              <option value="security">Account Compromise / Security Quarantine</option>
            </select>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            {canSuspend && (
              <Button
                variant="danger"
                size="md"
                disabled={!userId || suspend.isPending}
                onClick={() => setConfirmModal('suspend')}
                className="text-xs font-medium"
              >
                Suspend Account
              </Button>
            )}

            {canUnsuspend && (
              <Button
                variant="secondary"
                size="md"
                disabled={!userId || unsuspend.isPending}
                onClick={() => setConfirmModal('unsuspend')}
                className="text-xs font-medium"
              >
                Unsuspend & Reinstate
              </Button>
            )}
          </div>
        </div>
      </Surface>

      {/* Enforcement Safeguards & Rules */}
      <div className="space-y-4">
        <Surface className="p-5 space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
            Enforcement Protocols
          </h3>
          <ul className="text-xs text-ink-500 space-y-2.5">
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="text-rose shrink-0 mt-0.5" />
              <span>
                <strong className="text-ink">Session Invalidation:</strong> Suspension immediately terminates all active browser sessions and API bearer tokens.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="text-rose shrink-0 mt-0.5" />
              <span>
                <strong className="text-ink">Transaction Freeze:</strong> Prevents checkout, cart submissions, and payout disbursements.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="text-mint shrink-0 mt-0.5" />
              <span>
                <strong className="text-ink">Audited Signature:</strong> Every action records operator identity, IP, and reason in the immutable audit log.
              </span>
            </li>
          </ul>
        </Surface>

        <Surface className="p-5 space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
            Related Portals
          </h3>
          <div className="space-y-2 text-xs">
            <Link
              to="/admin/users"
              className="flex items-center justify-between p-2.5 rounded bg-sand/20 hover:bg-sand/40 transition font-medium text-ink"
            >
              <span>Platform Users Directory</span>
              <ExternalLinkIcon size={14} className="text-ink-4" />
            </Link>
            <Link
              to="/admin/audit"
              className="flex items-center justify-between p-2.5 rounded bg-sand/20 hover:bg-sand/40 transition font-medium text-ink"
            >
              <span>Audit Activity Stream</span>
              <ArrowRightIcon size={14} className="text-ink-4" />
            </Link>
            <Link
              to="/admin/roles"
              className="flex items-center justify-between p-2.5 rounded bg-sand/20 hover:bg-sand/40 transition font-medium text-ink"
            >
              <span>Administrator Roles</span>
              <ArrowRightIcon size={14} className="text-ink-4" />
            </Link>
          </div>
        </Surface>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-md rounded-xl shadow-2xl border border-ink/20 p-6 space-y-4">
            <div className="flex items-center gap-2 text-ink">
              <AlertTriangleIcon size={20} className={confirmModal === 'suspend' ? 'text-rose' : 'text-mint'} />
              <h3 className="font-bold text-base capitalize">
                Confirm Account {confirmModal}
              </h3>
            </div>

            <p className="text-xs text-ink-500 leading-relaxed">
              Are you sure you want to {confirmModal} user account <strong className="font-mono text-ink">{userId}</strong>?
            </p>

            {confirmModal === 'suspend' && (
              <div className="p-3 bg-rose/10 border border-rose/20 rounded-md text-xs text-rose space-y-1">
                <p className="font-semibold">Security Consequence</p>
                <p>
                  This terminates all active sessions immediately and locks platform login privileges.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
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
                Confirm {confirmModal === 'suspend' ? 'Suspension' : 'Reinstatement'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
