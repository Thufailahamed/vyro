import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
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
} from './useAdminTrustSafety';

type Tab = 'reports' | 'kyc' | 'users';

export function TrustSafetyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'reports';
  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Trust & Safety" sub="Abuse reports, KYC review, user suspension" />
      <nav className="flex gap-2 border-b border-ink/10">
        <TabBtn active={tab === 'reports'} onClick={() => switchTab('reports')}>Reports</TabBtn>
        <TabBtn active={tab === 'kyc'} onClick={() => switchTab('kyc')}>KYC</TabBtn>
        <TabBtn active={tab === 'users'} onClick={() => switchTab('users')}>Users</TabBtn>
      </nav>
      {tab === 'reports' ? <ReportsTab /> : null}
      {tab === 'kyc' ? <KycTab /> : null}
      {tab === 'users' ? <UsersTab /> : null}
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

function ReportsTab() {
  const canRead = usePermission('abuse_report:read');
  const canResolve = usePermission('abuse_report:resolve');
  const canTakedown = usePermission('takedown:write');
  const reports = useAbuseReports({ status: 'open' });
  const claim = useClaimReport();
  const addNote = useAddReportNote();
  const resolve = useResolveReport();
  const takedown = useTakedown();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!canRead) return <ErrorBanner message="You need abuse_report:read permission" />;
  return (
    <Surface className="p-4">
      {reports.isError ? <ErrorBanner message={(reports.error as Error).message} /> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500">
            <th className="py-2">Report</th>
            <th>Target</th>
            <th>Reason</th>
            <th>Opened</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(reports.data ?? []).map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2 font-mono text-xs">{r.id}</td>
              <td className="font-mono text-xs">{r.targetType}:{r.targetId}</td>
              <td>{r.reason}</td>
              <td>{fmtTs(r.createdAt)}</td>
              <td>
                <input
                  className="border border-ink/20 rounded px-2 py-1 w-40"
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  placeholder="Note"
                />
              </td>
              <td className="space-x-1 text-right">
                {r.status === 'open' ? (
                  <Button size="sm" variant="ghost" onClick={() => claim.mutate(r.id)}>Claim</Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => notes[r.id] && addNote.mutate({ id: r.id, note: notes[r.id] })}
                  disabled={!notes[r.id]}
                >
                  Note
                </Button>
                {canResolve ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => resolve.mutate({ id: r.id, resolution: 'resolved', ...(notes[r.id] ? { notes: notes[r.id] } : {}) })}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, resolution: 'dismissed' })}>
                      Dismiss
                    </Button>
                  </>
                ) : null}
                {canTakedown ? (
                  <Button size="sm" variant="ghost" onClick={() => takedown.mutate(r.id)}>
                    Takedown
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
          {!reports.data?.length ? (
            <tr><td colSpan={6} className="py-4 text-center text-ink-500">No open reports</td></tr>
          ) : null}
        </tbody>
      </table>
    </Surface>
  );
}

function KycTab() {
  const canRead = usePermission('kyc:read');
  const canReview = usePermission('kyc:review');
  const list = useKycReviews({ status: 'pending' });
  const decision = useKycDecision();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!canRead) return <ErrorBanner message="You need kyc:read permission" />;
  return (
    <Surface className="p-4">
      {list.isError ? <ErrorBanner message={(list.error as Error).message} /> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500">
            <th className="py-2">Review</th>
            <th>User</th>
            <th>Created</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((k) => (
            <tr key={k.id} className="border-t border-ink/10">
              <td className="py-2 font-mono text-xs">{k.id}</td>
              <td className="font-mono text-xs">{k.userId}</td>
              <td>{fmtTs(k.createdAt)}</td>
              <td>
                <input
                  className="border border-ink/20 rounded px-2 py-1 w-40"
                  value={notes[k.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [k.id]: e.target.value })}
                  placeholder="Optional notes"
                />
              </td>
              <td className="space-x-1 text-right">
                {canReview ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => decision.mutate({ id: k.id, decision: 'approved' })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => decision.mutate({ id: k.id, decision: 'rejected', ...(notes[k.id] ? { notes: notes[k.id] } : {}) })}>Reject</Button>
                    <Button size="sm" variant="ghost" onClick={() => decision.mutate({ id: k.id, decision: 'needs_more_info', ...(notes[k.id] ? { notes: notes[k.id] } : {}) })}>Need info</Button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
          {!list.data?.length ? (
            <tr><td colSpan={5} className="py-4 text-center text-ink-500">No pending KYC</td></tr>
          ) : null}
        </tbody>
      </table>
    </Surface>
  );
}

function UsersTab() {
  const canSuspend = usePermission('user:suspend');
  const canUnsuspend = usePermission('user:unsuspend');
  const suspend = useSuspendUser();
  const unsuspend = useUnsuspendUser();
  const [userId, setUserId] = useState('');
  if (!canSuspend && !canUnsuspend) {
    return <ErrorBanner message="You need user:suspend permission" />;
  }
  return (
    <Surface className="p-4 space-y-4">
      <div className="flex gap-2 items-end">
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">User id</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="border border-ink/20 rounded px-2 py-1"
            placeholder="user-xxxx"
          />
        </label>
        {canSuspend ? (
          <Button variant="primary" onClick={() => suspend.mutate(userId)} disabled={!userId}>
            Suspend
          </Button>
        ) : null}
        {canUnsuspend ? (
          <Button variant="ghost" onClick={() => unsuspend.mutate(userId)} disabled={!userId}>
            Unsuspend
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-ink-500">
        Suspension terminates all sessions and writes an audit row.
      </p>
    </Surface>
  );
}
