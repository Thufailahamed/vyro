import { useState, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorBanner, Button, Input, Textarea } from '@/components/ui';
import {
  SearchIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ShieldCheckIcon,
  FileTextIcon,
  UserIcon,
} from '@/components/icons';
import { usePermission } from './lib/permissions';
import { RoleBadge } from './RoleBadge';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
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
  Toolbar,
  controlClass,
} from './ui';
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
    <AdminPage>
      <AdminPageHeader
        kicker="Governance & identity"
        title="Security & access control"
        description="Manage signed-in sessions, run audit-logged impersonation, enforce 2FA and process data export requests."
      />

      <StatGrid cols={4}>
        <StatCard
          label="Active sessions"
          value={sessionCount}
          sub="Signed-in platform tokens"
          icon={<ShieldCheckIcon size={18} />}
          loading={sessionsQuery.isLoading}
        />
        <StatCard
          label="Impersonation"
          value={<span className="text-2xl">{isImpersonating ? 'Active' : 'None'}</span>}
          status={isImpersonating ? <Pill tone="warning" dot>Active session</Pill> : <Pill>None active</Pill>}
          sub="Audited troubleshooting proxy"
          icon={<UserIcon size={18} />}
        />
        <StatCard
          label="2FA policy"
          value={<span className="text-2xl">Enforced</span>}
          status={<Pill tone="success" dot>Admins</Pill>}
          sub="TOTP authenticator mandatory"
          icon={<CheckCircleIcon size={18} />}
        />
        <StatCard
          label="Privacy & GDPR"
          value={<span className="text-2xl">Art. 15</span>}
          status={<Pill tone="success">Ready</Pill>}
          sub="Automated user data archive"
          icon={<FileTextIcon size={18} />}
        />
      </StatGrid>

      <Tabs<Tab>
        ariaLabel="Security sections"
        value={tab}
        onChange={switchTab}
        items={[
          { key: 'sessions', label: 'Active sessions', icon: <ShieldCheckIcon size={15} />, count: sessionCount },
          {
            key: 'impersonate',
            label: (
              <span className="inline-flex items-center gap-2">
                Impersonation
                {isImpersonating && (
                  <span className="size-2 rounded-full bg-amber animate-pulse" title="Active impersonation" />
                )}
              </span>
            ),
            icon: <UserIcon size={15} />,
          },
          { key: '2fa', label: '2FA enforcement', icon: <CheckCircleIcon size={15} /> },
          { key: 'export', label: 'Data export (GDPR)', icon: <FileTextIcon size={15} /> },
        ]}
      />

      {tab === 'sessions' ? <SessionsTab /> : null}
      {tab === 'impersonate' ? <ImpersonationTab /> : null}
      {tab === '2fa' ? <TwoFactorTab /> : null}
      {tab === 'export' ? <ExportTab /> : null}
    </AdminPage>
  );
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label {...(htmlFor ? { htmlFor } : {})} className="mb-1.5 block text-xs font-medium text-ink-3">
      {children}
    </label>
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

      <TableCard
        title="Active sessions"
        description={`${filteredSessions.length} active session${filteredSessions.length === 1 ? '' : 's'}`}
        actions={
          <Button size="sm" variant="outline" onClick={() => void sessions.refetch()} loading={sessions.isFetching}>
            Refresh list
          </Button>
        }
        toolbar={
          <Toolbar>
            <div className="relative w-full sm:w-80">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-4">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                placeholder="Search by email, user ID, or IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${controlClass} w-full pl-9`}
              />
            </div>
          </Toolbar>
        }
      >
        {sessions.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : !filteredSessions.length ? (
          <EmptyBlock
            icon={<ShieldCheckIcon size={22} />}
            title="No active sessions found"
            description="No user or admin sessions match your search."
            action={
              search ? (
                <Button size="sm" variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : null
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Session token</th>
                <th>User account</th>
                <th>Role</th>
                <th>Network & IP</th>
                <th>Created & expires</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-ink">{s.id.slice(0, 10)}…</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(s.id, s.id)}
                        className="text-xs font-medium text-copper transition-colors hover:text-ink"
                        title="Copy full session token"
                      >
                        {copiedId === s.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </td>

                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-volt">
                        {(s.userEmail?.[0] ?? 'U').toUpperCase()}
                      </div>
                      <div className="max-w-[200px] min-w-0">
                        <CellStack
                          primary={s.userEmail ?? 'No email'}
                          secondary={<span className="font-mono">ID: {s.userId.slice(0, 12)}…</span>}
                        />
                      </div>
                    </div>
                  </td>

                  <td>
                    {s.userRole ? <RoleBadge role={s.userRole} compact /> : <Pill>Standard user</Pill>}
                  </td>

                  <td>
                    <div className="max-w-[200px]" title={s.userAgent ?? ''}>
                      <CellStack
                        primary={<span className="font-mono text-xs">{s.ip ?? 'Internal'}</span>}
                        secondary={s.userAgent ? s.userAgent.slice(0, 30) + '…' : 'Unknown agent'}
                      />
                    </div>
                  </td>

                  <td>
                    <CellStack
                      primary={<span className="num-tabular">{formatDateTime(s.createdAt)}</span>}
                      secondary={<span className="num-tabular">Expires: {formatDateTime(s.expiresAt)}</span>}
                    />
                  </td>

                  <td className="num">
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
                      <Pill tone="danger" dot>
                        Revoked
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      {sessionToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-session-title"
            className="vyro-floating w-full max-w-md space-y-5 p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose/10 text-rose">
                <AlertCircleIcon size={20} />
              </span>
              <div>
                <h3 id="revoke-session-title" className="font-sans text-lg font-semibold text-ink">
                  Revoke active session
                </h3>
                <p className="mt-0.5 text-sm text-ink-4">The token is invalidated immediately.</p>
              </div>
            </div>

            <div className="rounded-xl bg-bone/60 p-4">
              <DetailList
                items={[
                  { label: 'Session', value: <span className="font-mono text-xs break-all">{sessionToRevoke.id}</span> },
                  { label: 'Account', value: sessionToRevoke.userEmail ?? sessionToRevoke.userId },
                  { label: 'IP address', value: <span className="font-mono text-xs">{sessionToRevoke.ip ?? 'Unknown'}</span> },
                ]}
              />
            </div>

            <p className="text-sm text-ink-3">
              Terminating this session will immediately disconnect the user and require them to sign in again.
            </p>

            <div className="flex justify-end gap-2">
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
                Revoke session
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
    <div className="max-w-2xl space-y-6">
      <Callout tone="warning" title="Impersonation is audited">
        Impersonation lets an administrator see the app from another user's perspective for support and debugging.
        Every action taken during an impersonation session is written to the immutable audit trail.
      </Callout>

      {current.isError ? <ErrorBanner message={(current.error as Error).message} /> : null}
      {start.isError ? <ErrorBanner message={(start.error as Error).message} /> : null}
      {end.isError ? <ErrorBanner message={(end.error as Error).message} /> : null}

      {isImpersonating && current.data?.active ? (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-amber animate-pulse" aria-hidden />
              Active impersonation session
            </span>
          }
          actions={
            <Pill tone="warning" dot>
              In progress
            </Pill>
          }
          className="shadow-[inset_0_0_0_1px_rgba(196,132,58,0.4)]"
          {...(canEnd
            ? {
                footer: (
                  <div className="flex justify-end">
                    <Button variant="danger" onClick={() => end.mutate()} loading={end.isPending}>
                      End impersonation session
                    </Button>
                  </div>
                ),
              }
            : {})}
        >
          <DetailList
            columns={2}
            items={[
              {
                label: 'Target user ID',
                value: <span className="font-mono text-xs break-all">{current.data.active.targetUserId}</span>,
              },
              { label: 'Started at', value: <span className="num-tabular">{formatDateTime(current.data.active.startedAt)}</span> },
              { label: 'Operator reason', value: current.data.active.reason },
            ]}
          />
        </Panel>
      ) : null}

      {canStart && !isImpersonating ? (
        <Panel
          title="Start impersonation session"
          description="Enter the target account UUID and a business justification."
          icon={<UserIcon size={16} />}
        >
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="imp-target">Target user ID (UUID)</FieldLabel>
              <Input
                id="imp-target"
                placeholder="e.g. 0192a83b-9a8f-7cc1-..."
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel htmlFor="imp-reason">Reason & support ticket reference (min 5 characters)</FieldLabel>
              <Textarea
                id="imp-reason"
                placeholder="Provide ticket number or troubleshooting context..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={!target.trim() || reason.trim().length < 5}
                onClick={() => start.mutate({ targetUserId: target.trim(), reason: reason.trim() })}
                loading={start.isPending}
              >
                Start impersonation
              </Button>
            </div>
          </div>
        </Panel>
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
    <div className="max-w-2xl space-y-6">
      <Panel
        title="Two-factor authentication (TOTP)"
        description="VYRO requires 2FA for every operator with an administrative role. Enforce or reset the requirement on a specific account."
        icon={<ShieldCheckIcon size={16} />}
        actions={
          <Pill tone="success" dot>
            Active policy
          </Pill>
        }
      >
        <div className="space-y-4">
          {enforce.isError ? <ErrorBanner message={(enforce.error as Error).message} /> : null}
          {unenforce.isError ? <ErrorBanner message={(unenforce.error as Error).message} /> : null}
          {statusMessage ? <Callout tone="success">{statusMessage}</Callout> : null}

          <div>
            <FieldLabel htmlFor="twofa-user">Target user ID (UUID)</FieldLabel>
            <Input
              id="twofa-user"
              placeholder="Enter User UUID to manage 2FA..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" disabled={!userId.trim()} onClick={handleUnenforce} loading={unenforce.isPending}>
              Unenforce 2FA
            </Button>
            <Button variant="primary" disabled={!userId.trim()} onClick={handleEnforce} loading={enforce.isPending}>
              Enforce 2FA requirement
            </Button>
          </div>
        </div>
      </Panel>
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
    <div className="max-w-2xl space-y-6">
      <Panel
        title="GDPR Article 15 data access export"
        description="Generate a full archive of a user's data: account, transaction ledger, orders, reviews, addresses and audit records."
        icon={<FileTextIcon size={16} />}
      >
        <div className="space-y-4">
          {request.isError ? <ErrorBanner message={(request.error as Error).message} /> : null}

          <div>
            <FieldLabel htmlFor="export-user">Target user ID (UUID)</FieldLabel>
            <Input
              id="export-user"
              placeholder="Enter User UUID for data packaging..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
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
              Generate compliance archive
            </Button>
          </div>

          {exportId && (
            <div className="space-y-4 rounded-xl bg-bone/60 p-4 animate-fade-in">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">Export request</span>
                <Pill
                  dot
                  tone={
                    status.data?.status === 'ready' ? 'success' : status.data?.status === 'failed' ? 'danger' : 'warning'
                  }
                  className="capitalize"
                >
                  {status.data?.status ?? 'Packaging'}
                </Pill>
              </div>

              <DetailList
                columns={2}
                items={[
                  { label: 'Export ID', value: <span className="font-mono text-xs break-all">{exportId}</span> },
                  ...(status.data?.expiresAt
                    ? [
                        {
                          label: 'Archive link expires',
                          value: <span className="num-tabular">{formatDateTime(status.data.expiresAt)}</span>,
                        },
                      ]
                    : []),
                ]}
              />

              {status.data?.downloadUrl && (
                <a
                  href={status.data.downloadUrl}
                  download
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-volt transition-colors hover:bg-charcoal"
                >
                  <FileTextIcon size={14} />
                  <span>Download complete archive</span>
                </a>
              )}
            </div>
          )}
        </div>
      </Panel>
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
