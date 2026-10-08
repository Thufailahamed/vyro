import { useAdminCampaigns, useAdminApprove, useAdminReject } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, EmptyBlock, TableCard, TableSkeleton } from '../ui';
import { CheckCircleIcon } from '@/components/icons';

const fmtDate = (s: number) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ApprovalQueue() {
  const campaigns = useAdminCampaigns({ status: 'pending_approval' });
  const approve = useAdminApprove();
  const reject = useAdminReject();
  const rows = campaigns.data ?? [];
  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/sponsored', label: 'Sponsored listings' }}
        kicker="Sponsored · Review"
        title="Approval queue"
        description="Campaigns submitted by suppliers that need a decision before they can go live."
      />
      <TableCard title="Pending approval" description={`${rows.length} waiting`}>
        {campaigns.isLoading ? (
          <TableSkeleton cols={5} />
        ) : rows.length === 0 ? (
          <EmptyBlock icon={<CheckCircleIcon size={20} />} title="Queue is clear" description="New campaign submissions will appear here for review." />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Supplier</th>
                <th>Slot</th>
                <th>Window</th>
                <th className="text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.id.slice(0, 8)}</td>
                  <td className="font-mono text-xs text-ink-3">{c.supplierId.slice(0, 8)}</td>
                  <td>{c.slotId}</td>
                  <td className="whitespace-nowrap text-ink-3">
                    {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-rose"
                        disabled={reject.isPending}
                        onClick={() => {
                          const reason = window.prompt('Reason for rejection?');
                          if (reason) reject.mutate({ id: c.id, reason });
                        }}
                      >
                        Reject
                      </Button>
                      <Button size="sm" variant="primary" disabled={approve.isPending} onClick={() => approve.mutate({ id: c.id })}>
                        Approve
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </AdminPage>
  );
}
