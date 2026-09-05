import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
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
  return (
    <div className="space-y-6">
      <PageHeader title="Security" sub="Sessions, impersonation, 2FA enforcement, data export" />
      <nav className="flex gap-2 border-b border-ink/10">
        <TabBtn active={tab === 'sessions'} onClick={() => switchTab('sessions')}>Sessions</TabBtn>
        <TabBtn active={tab === 'impersonate'} onClick={() => switchTab('impersonate')}>Impersonation</TabBtn>
        <TabBtn active={tab === '2fa'} onClick={() => switchTab('2fa')}>2FA</TabBtn>
        <TabBtn active={tab === 'export'} onClick={() => switchTab('export')}>Data export</TabBtn>
      </nav>
      {tab === 'sessions' ? <SessionsTab /> : null}
      {tab === 'impersonate' ? <ImpersonationTab /> : null}
      {tab === '2fa' ? <TwoFactorTab /> : null}
      {tab === 'export' ? <ExportTab /> : null}
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

function SessionsTab() {
  const can = usePermission('session:revoke');
  const sessions = useAdminSessions();
  const revoke = useRevokeSession();
  if (!can) return <ErrorBanner message="You need session:revoke permission" />;
  return (
    <Surface className="p-4">
      {sessions.isError ? <ErrorBanner message={(sessions.error as Error).message} /> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500">
            <th className="py-2">Session</th>
            <th>User</th>
            <th>Role</th>
            <th>IP</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(sessions.data ?? []).map((s) => (
            <tr key={s.id} className="border-t border-ink/10">
              <td className="py-2 font-mono text-xs">{s.id.slice(0, 8)}…</td>
              <td className="font-mono text-xs">{s.userEmail}</td>
              <td>{s.userRole ?? 'user'}</td>
              <td className="font-mono text-xs">{s.ip ?? '—'}</td>
              <td>{fmtTs(s.createdAt)}</td>
              <td className="text-right">
                {!s.revokedAt ? (
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                    Revoke
                  </Button>
                ) : (
                  <span className="text-xs text-ink-500">revoked</span>
                )}
              </td>
            </tr>
          ))}
          {!sessions.data?.length ? (
            <tr><td colSpan={6} className="py-4 text-center text-ink-500">No active sessions</td></tr>
          ) : null}
        </tbody>
      </table>
    </Surface>
  );
}

function ImpersonationTab() {
  const canStart = usePermission('impersonation:start');
  const canEnd = usePermission('impersonation:end');
  const current = useCurrentImpersonation();
  const start = useStartImpersonation();
  const end = useEndImpersonation();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  if (!canStart && !canEnd) {
    return <ErrorBanner message="You need impersonation permission" />;
  }
  return (
    <Surface className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Current</h3>
        {current.data?.active ? (
          <div className="border border-ink/10 rounded p-3 text-sm">
            <div>Target: <span className="font-mono">{current.data.active.targetUserId}</span></div>
            <div>Started: {fmtTs(current.data.active.startedAt)}</div>
            <div className="mt-2">
              {canEnd ? (
                <Button variant="ghost" onClick={() => end.mutate()}>End impersonation</Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-500">No active impersonation.</p>
        )}
      </div>
      {canStart && !current.data?.active ? (
        <div>
          <h3 className="text-sm font-medium mb-2">Start impersonation</h3>
          <div className="space-y-2">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Target user id"
              className="w-full border border-ink/20 rounded px-2 py-1"
            />
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (min 5 chars)"
              className="w-full border border-ink/20 rounded px-2 py-1"
            />
            <Button
              variant="primary"
              disabled={!target || reason.length < 5}
              onClick={() => start.mutate({ targetUserId: target, reason })}
            >
              Start
            </Button>
          </div>
        </div>
      ) : null}
    </Surface>
  );
}

function TwoFactorTab() {
  const can = usePermission('2fa:enforce');
  const enforce = useEnforce2fa();
  const unenforce = useUnenforce2fa();
  const [userId, setUserId] = useState('');
  if (!can) return <ErrorBanner message="You need 2fa:enforce permission" />;
  return (
    <Surface className="p-4 space-y-4">
      <div className="flex gap-2 items-end">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User id"
          className="border border-ink/20 rounded px-2 py-1"
        />
        <Button variant="primary" onClick={() => enforce.mutate(userId)} disabled={!userId}>
          Enforce 2FA
        </Button>
        <Button variant="ghost" onClick={() => unenforce.mutate(userId)} disabled={!userId}>
          Unenforce
        </Button>
      </div>
    </Surface>
  );
}

function ExportTab() {
  const can = usePermission('data_export:run');
  const request = useRequestDataExport();
  const [userId, setUserId] = useState('');
  const [exportId, setExportId] = useState<string | null>(null);
  const status = useDataExportStatus(exportId);
  if (!can) return <ErrorBanner message="You need data_export:run permission" />;
  return (
    <Surface className="p-4 space-y-4">
      <div className="flex gap-2 items-end">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User id"
          className="border border-ink/20 rounded px-2 py-1"
        />
        <Button
          variant="primary"
          disabled={!userId}
          onClick={() => request.mutate(userId, { onSuccess: (d: any) => setExportId(d.id) })}
        >
          Request export
        </Button>
      </div>
      {exportId ? (
        <div className="text-sm">
          <div>Export id: <span className="font-mono">{exportId}</span></div>
          <div>Status: {status.data?.status ?? 'loading…'}</div>
          {status.data?.downloadUrl ? (
            <a href={status.data.downloadUrl} className="text-volt underline">Download</a>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}
