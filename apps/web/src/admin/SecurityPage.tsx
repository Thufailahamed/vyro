import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button, Input, EmptyState } from '@/components/ui';
import {
  SearchIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  FileTextIcon,
  UserIcon,
} from '@/components/icons';
import { usePermission } from './lib/permissions';
import { RoleBadge } from './RoleBadge';
import {
  useAdminSessions,
  useRevokeSession,
  useCurrentImpersonation,
  useStartImpersonation,
  useEndImpersonation,
  useRequestDataExport,
  useDataExportStatus,
  useEnforce2fa,
  useUnenforce2fa,
  type AdminSessionRow,
  type DataExportRow,
} from './useAdminSecurity';

type Tab = 'sessions' | 'impersonate' | '2fa' | 'export';

export function SecurityPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'sessions';

  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  const sessionsQuery = useAdminSessions();
  const impersonationQuery = useCurrentImpersonation();

  const sessionCount = sessionsQuery.data?.length ?? 0;
  const isImpersonating = Boolean(impersonationQuery.data?.active);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Page Header */}
      <PageHeader
        kicker="Governance & Identity"
        title="Security & Access Control"
        sub="Manage active authenticated sessions, perform audit-logged operator impersonation, enforce 2FA, and process data export requests."
      />

      {/* Executive Security KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Active Sessions</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <ShieldCheckIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">{sessionCount}</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Authenticated platform tokens</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Impersonation</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isImpersonating ? 'bg-amber/15 text-amber' : 'bg-sand/60 text-ink'
              }`}
            >
              <UserIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold font-mono text-ink truncate">
              {isImpersonating ? 'Active Session' : 'None Active'}
            </div>
            <p className="text-[11px] text-ink-4 mt-0.5">Audited troubleshooting proxy</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">2FA Policy</span>
            <div className="w-8 h-8 rounded-lg bg-mint/15 flex items-center justify-center text-mint">
              <CheckCircleIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold font-mono text-ink">Enforced (Admins)</div>
            <p className="text-[11px] text-ink-4 mt-0.5">TOTP authenticator mandatory</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Privacy & GDPR</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <FileTextIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold font-mono text-ink">Art. 15 Ready</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Automated user data archive</p>
          </div>
        </div>
      </div>

      {/* Accessible High-Contrast Navigation Tabs */}
      <nav className="flex items-center gap-2 border-b border-ink/10">
        <button
          type="button"
          onClick={() => switchTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'sessions'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <ShieldCheckIcon size={16} />
          <span>Active Sessions</span>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-bone text-ink-3 border border-ink/10">
            {sessionCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => switchTab('impersonate')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'impersonate'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <UserIcon size={16} />
          <span>Impersonation</span>
          {isImpersonating && (
            <span className="w-2 h-2 rounded-full bg-amber animate-pulse" title="Active Impersonation" />
          )}
        </button>

        <button
          type="button"
          onClick={() => switchTab('2fa')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === '2fa'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <CheckCircleIcon size={16} />
          <span>2FA Enforcement</span>
        </button>

        <button
          type="button"
          onClick={() => switchTab('export')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'export'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <FileTextIcon size={16} />
          <span>Data Export (GDPR)</span>
        </button>
      </nav>

      {/* Tab Panels */}
      {tab === 'sessions' ? <SessionsTab /> : null}
      {tab === 'impersonate' ? <ImpersonationTab /> : null}
      {tab === '2fa' ? <TwoFactorTab /> : null}
      {tab === 'export' ? <ExportTab /> : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. SESSIONS TAB
// ----------------------------------------------------------------------
function SessionsTab() {
  const canRevoke = usePermission('session:revoke');
  const sessions = useAdminSessions();
  const revoke = useRevokeSession();

  const [search, setSearch] = useState('');
  const [sessionToRevoke, setSessionToRevoke] = useState<AdminSessionRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredSessions = useMemo(() => {
    const list = sessions.data ?? [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter(
      (s) =>
        s.id.toLowerCase().includes(term) ||
        (s.userEmail ?? '').toLowerCase().includes(term) ||
        s.userId.toLowerCase().includes(term) ||
        (s.ip ?? '').toLowerCase().includes(term)
    );
  }, [sessions.data, search]);

  if (!canRevoke) {
    return <ErrorBanner message="You need session:revoke permission to manage active sessions." />;
  }

  return (
    <div className="space-y-4">
      {sessions.isError ? <ErrorBanner message={(sessions.error as Error).message} /> : null}
      {revoke.isError ? <ErrorBanner message={(revoke.error as Error).message} /> : null}

      {/* Filter & Refresh Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-ink/10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <input
              type="text"
              placeholder="Search by email, user ID, or IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 bg-paper text-xs text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
            />
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-ink-4">
              <SearchIcon size={14} />
            </div>
          </div>
          <span className="text-xs font-mono text-ink-4">
            {filteredSessions.length} active session{filteredSessions.length === 1 ? '' : 's'}
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void sessions.refetch()}
          loading={sessions.isFetching}
        >
          Refresh List
        </Button>
      </div>

      {/* Sessions Table */}
      <Surface className="overflow-hidden border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                <th className="py-3 px-4">Session Token</th>
                <th className="py-3 px-4">User Account</th>
                <th className="py-3 px-4">Role Tier</th>
                <th className="py-3 px-4">Client Network & IP</th>
                <th className="py-3 px-4">Created & Expires</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 text-xs">
              {filteredSessions.map((s) => (
                <tr key={s.id} className="hover:bg-sand/20 transition-colors">
                  {/* Session ID */}
                  <td className="py-3.5 px-4 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-ink">{s.id.slice(0, 10)}…</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(s.id, s.id)}
                        className="text-[10px] text-ink-4 hover:text-ink underline"
                        title="Copy full session token"
                      >
                        {copiedId === s.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </td>

                  {/* User Account */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-ink text-volt text-xs font-bold flex items-center justify-center shrink-0">
                        {(s.userEmail?.[0] ?? 'U').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-ink truncate max-w-[180px]">
                          {s.userEmail ?? 'No email'}
                        </div>
                        <div className="font-mono text-[10px] text-ink-4 truncate max-w-[180px]">
                          ID: {s.userId.slice(0, 12)}…
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="py-3.5 px-4">
                    {s.userRole ? (
                      <RoleBadge role={s.userRole} compact />
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded bg-bone text-ink-3 border border-ink/10">
                        Standard User
                      </span>
                    )}
                  </td>

                  {/* IP & User Agent */}
                  <td className="py-3.5 px-4">
                    <div className="font-mono text-ink font-semibold">{s.ip ?? 'Internal'}</div>
                    <div className="text-[10px] text-ink-4 truncate max-w-[180px]" title={s.userAgent ?? ''}>
                      {s.userAgent ? s.userAgent.slice(0, 30) + '…' : 'Unknown Agent'}
                    </div>
                  </td>

                  {/* Created & Expires */}
                  <td className="py-3.5 px-4 font-mono">
                    <div className="text-ink">{formatDateTime(s.createdAt)}</div>
                    <div className="text-[10px] text-ink-4">
                      Expires: {formatDateTime(s.expiresAt)}
                    </div>
                  </td>

                  {/* Revoke Action */}
                  <td className="py-3.5 px-4 text-right">
                    {!s.revokedAt ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose hover:bg-rose/10"
                        onClick={() => setSessionToRevoke(s)}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-rose/15 text-rose border border-rose/30">
                        Revoked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredSessions.length && !sessions.isLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <EmptyState
                      icon={<ShieldCheckIcon size={24} />}
                      title="No Active Sessions Found"
                      description="No authenticated user or admin sessions match your search criteria."
                      action={
                        search ? (
                          <Button size="sm" variant="outline" onClick={() => setSearch('')}>
                            Clear Search
                          </Button>
                        ) : null
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Revoke Confirmation Modal */}
      {sessionToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-ink/20 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 flex items-center justify-center text-rose shrink-0">
                <AlertCircleIcon size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink">Revoke Active Session</h3>
                <p className="text-xs text-ink-4">Immediate token invalidation</p>
              </div>
            </div>

            <div className="p-3 bg-bone/50 rounded-xl border border-ink/10 space-y-1.5 text-xs font-mono">
              <div>
                <span className="text-ink-4">Session:</span> {sessionToRevoke.id}
              </div>
              <div>
                <span className="text-ink-4">Account:</span> {sessionToRevoke.userEmail ?? sessionToRevoke.userId}
              </div>
              <div>
                <span className="text-ink-4">IP Address:</span> {sessionToRevoke.ip ?? 'Unknown'}
              </div>
            </div>

            <p className="text-xs text-ink-3 leading-relaxed">
              Terminating this session will immediately disconnect the user and require them to re-authenticate with their credentials.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-ink/10">
              <Button variant="outline" size="sm" onClick={() => setSessionToRevoke(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  revoke.mutate(sessionToRevoke.id, {
                    onSuccess: () => setSessionToRevoke(null),
                  });
                }}
                loading={revoke.isPending}
              >
                Revoke Session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. IMPERSONATION TAB
// ----------------------------------------------------------------------
function ImpersonationTab() {
  const canStart = usePermission('impersonation:start');
  const canEnd = usePermission('impersonation:end');

  const current = useCurrentImpersonation();
  const start = useStartImpersonation();
  const end = useEndImpersonation();

  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');

  if (!canStart && !canEnd) {
    return <ErrorBanner message="You need impersonation permission to access this module." />;
  }

  const isImpersonating = Boolean(current.data?.active);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Security Advisory Callout */}
      <div className="p-4 bg-amber/10 border border-amber/30 text-ink rounded-2xl flex items-start gap-3">
        <AlertCircleIcon size={20} className="text-amber shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs leading-relaxed">
          <span className="font-bold block text-ink">Super-Admin Impersonation Governance</span>
          <p className="text-ink-3">
            Impersonation temporarily allows an administrator to view the application strictly from the perspective of another user for support and debugging. All operations executed during an impersonation session are logged to the immutable audit trail.
          </p>
        </div>
      </div>

      {current.isError ? <ErrorBanner message={(current.error as Error).message} /> : null}
      {start.isError ? <ErrorBanner message={(start.error as Error).message} /> : null}
      {end.isError ? <ErrorBanner message={(end.error as Error).message} /> : null}

      {/* Active Impersonation Card */}
      {isImpersonating && current.data?.active ? (
        <Surface className="p-6 bg-white border-2 border-amber/40 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber animate-ping" />
              <h3 className="text-sm font-bold text-ink">Active Impersonation Session</h3>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-amber/15 text-amber border border-amber/30">
              IN PROGRESS
            </span>
          </div>

          <div className="p-4 bg-sand/30 rounded-xl space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-ink-4">Target User ID:</span>
              <span className="font-bold text-ink">{current.data.active.targetUserId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-4">Started At:</span>
              <span className="text-ink">{formatDateTime(current.data.active.startedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-4">Operator Reason:</span>
              <span className="text-ink max-w-xs truncate">{current.data.active.reason}</span>
            </div>
          </div>

          {canEnd && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => end.mutate()}
              loading={end.isPending}
            >
              End Impersonation Session
            </Button>
          )}
        </Surface>
      ) : null}

      {/* Start Impersonation Form */}
      {canStart && !isImpersonating ? (
        <Surface className="p-6 bg-white border border-ink/10 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-ink">Start Impersonation Session</h3>
            <p className="text-xs text-ink-4 mt-0.5">
              Specify the target account UUID and a mandatory business justification.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                Target User ID (UUID)
              </label>
              <Input
                placeholder="e.g. 0192a83b-9a8f-7cc1-..."
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                Reason & Support Ticket Reference (min 5 chars)
              </label>
              <textarea
                placeholder="Provide ticket number or troubleshooting context..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full bg-paper p-3 text-xs border border-ink/20 rounded-xl focus:outline-none focus:border-ink leading-relaxed"
              />
            </div>

            <Button
              variant="primary"
              className="w-full"
              disabled={!target.trim() || reason.trim().length < 5}
              onClick={() => start.mutate({ targetUserId: target.trim(), reason: reason.trim() })}
              loading={start.isPending}
            >
              Start Impersonation
            </Button>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. 2FA ENFORCEMENT TAB
// ----------------------------------------------------------------------
function TwoFactorTab() {
  const canEnforce = usePermission('2fa:enforce');
  const enforce = useEnforce2fa();
  const unenforce = useUnenforce2fa();

  const [userId, setUserId] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!canEnforce) {
    return <ErrorBanner message="You need 2fa:enforce permission to manage multi-factor authentication." />;
  }

  const handleEnforce = () => {
    if (!userId.trim()) return;
    enforce.mutate(userId.trim(), {
      onSuccess: () => {
        setStatusMessage(`Successfully enforced 2FA on account ${userId.trim()}`);
      },
    });
  };

  const handleUnenforce = () => {
    if (!userId.trim()) return;
    unenforce.mutate(userId.trim(), {
      onSuccess: () => {
        setStatusMessage(`Successfully unenforced 2FA on account ${userId.trim()}`);
      },
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 2FA Policy Card */}
      <Surface className="p-6 bg-white border border-ink/10 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <span>Two-Factor Authentication (TOTP) Governance</span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-mint/15 text-mint border border-mint/30">
              Active Policy
            </span>
          </h3>
          <p className="text-xs text-ink-4 mt-1 leading-relaxed">
            Vyro requires two-factor authentication for all platform operators with administrative roles. Use this tool to enforce or reset 2FA requirements on specific user accounts.
          </p>
        </div>

        {enforce.isError ? <ErrorBanner message={(enforce.error as Error).message} /> : null}
        {unenforce.isError ? <ErrorBanner message={(unenforce.error as Error).message} /> : null}
        {statusMessage ? (
          <div className="p-3 bg-mint/10 border border-mint/30 text-mint text-xs rounded-xl flex items-center gap-2">
            <CheckCircleIcon size={16} />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Target User ID (UUID)
            </label>
            <Input
              placeholder="Enter User UUID to manage 2FA..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              disabled={!userId.trim()}
              onClick={handleEnforce}
              loading={enforce.isPending}
            >
              Enforce 2FA Requirement
            </Button>
            <Button
              variant="outline"
              disabled={!userId.trim()}
              onClick={handleUnenforce}
              loading={unenforce.isPending}
            >
              Unenforce 2FA
            </Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. DATA EXPORT (GDPR) TAB
// ----------------------------------------------------------------------
function ExportTab() {
  const canExport = usePermission('data_export:run');
  const request = useRequestDataExport();

  const [userId, setUserId] = useState('');
  const [exportId, setExportId] = useState<string | null>(null);
  const status = useDataExportStatus(exportId);

  if (!canExport) {
    return <ErrorBanner message="You need data_export:run permission to process compliance exports." />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Surface className="p-6 bg-white border border-ink/10 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-ink">GDPR Article 15 Data Subject Access Export</h3>
          <p className="text-xs text-ink-4 mt-1 leading-relaxed">
            Generate a full archive of user data including account credentials, transaction ledger, orders, reviews, addresses, and audit records.
          </p>
        </div>

        {request.isError ? <ErrorBanner message={(request.error as Error).message} /> : null}

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Target User ID (UUID)
            </label>
            <Input
              placeholder="Enter User UUID for data packaging..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>

          <Button
            variant="primary"
            disabled={!userId.trim()}
            onClick={() =>
              request.mutate(userId.trim(), {
                onSuccess: (d: DataExportRow) => setExportId(d.id),
              })
            }
            loading={request.isPending}
          >
            Generate Compliance Archive
          </Button>
        </div>

        {/* Live Export Status Card */}
        {exportId && (
          <div className="mt-4 p-4 bg-sand/30 rounded-xl border border-ink/10 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">Export Request</span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full ${
                  status.data?.status === 'ready'
                    ? 'bg-mint/15 text-mint border border-mint/30'
                    : status.data?.status === 'failed'
                    ? 'bg-rose/15 text-rose border border-rose/30'
                    : 'bg-amber/15 text-amber border border-amber/30'
                }`}
              >
                {status.data?.status ?? 'PACKAGING'}
              </span>
            </div>

            <div className="space-y-1 text-xs font-mono">
              <div className="text-ink-4">Export ID: {exportId}</div>
              {status.data?.expiresAt && (
                <div className="text-ink-4">
                  Archive Link Expires: {formatDateTime(status.data.expiresAt)}
                </div>
              )}
            </div>

            {status.data?.downloadUrl && (
              <div className="pt-2">
                <a
                  href={status.data.downloadUrl}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-volt text-xs font-bold rounded-lg hover:bg-charcoal transition-colors"
                >
                  <FileTextIcon size={14} />
                  <span>Download Complete Archive</span>
                </a>
              </div>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
}

// Helper formatter
function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  try {
    const d = new Date(ms);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return String(ms);
  }
}
