import { useState } from 'react';
import type { SponsorCampaign } from '@vyro/validation';
import { useAdminCampaigns, useAdminApprove, useAdminReject } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, Callout, EmptyBlock, Pill, StatCard, StatGrid, TableCard, TableSkeleton } from '../ui';
import { CheckCircleIcon, ClockIcon, LayersIcon } from '@/components/icons';
import { DAY, ReasonDialog, SponsoredNav, WindowCell, daysAgo, fmtDate, fmtCount, nowSec, shortId } from './sponsoredUi';

export function ApprovalQueue() {
  const campaigns = useAdminCampaigns({ status: 'pending_approval' });
  const approve = useAdminApprove();
  const reject = useAdminReject();
  const [rejecting, setRejecting] = useState<SponsorCampaign | null>(null);
  const rows = campaigns.data ?? [];
  const oldestAge = rows.length > 0 ? Math.max(...rows.map((c) => daysAgo(c.createdAt))) : 0;
  const earliestStart = rows.length > 0 ? Math.min(...rows.map((c) => c.startsAt)) : null;
  const error = approve.error ?? reject.error;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sponsored · Review"
        title="Approvals"
        description="Campaigns submitted by suppliers that need a decision before they can go live."
      />
      <SponsoredNav />

      <StatGrid cols={3}>
        <StatCard
          label="Waiting"
          value={fmtCount(rows.length)}
          sub="Need a go-live decision"
          icon={<ClockIcon size={17} />}
          tone={rows.length > 0 ? 'warning' : 'neutral'}
          loading={campaigns.isLoading}
        />
        <StatCard
          label="Oldest request"
          value={rows.length > 0 ? `${oldestAge}d` : '—'}
          sub={rows.length > 0 ? 'Since submission' : 'Nothing waiting'}
          icon={<CheckCircleIcon size={17} />}
          tone={oldestAge >= 3 ? 'danger' : 'neutral'}
          loading={campaigns.isLoading}
        />
        <StatCard
          label="Earliest start"
          value={earliestStart ? fmtDate(earliestStart) : '—'}
          sub={earliestStart && earliestStart < nowSec() + DAY ? 'Starts within a day' : 'Next scheduled go-live'}
          icon={<LayersIcon size={17} />}
          loading={campaigns.isLoading}
        />
      </StatGrid>

      {error && (
        <Callout tone="danger" title="That action didn't go through">
          {(error as Error).message || 'Try again in a moment.'}
        </Callout>
      )}

      <TableCard title="Pending approval" description={`${rows.length} ${rows.length === 1 ? 'campaign' : 'campaigns'} waiting, oldest first`}>
        {campaigns.isLoading ? (
          <TableSkeleton cols={5} />
        ) : rows.length === 0 ? (
          <EmptyBlock
            icon={<CheckCircleIcon size={20} />}
            title="The queue is clear"
            description="New campaign submissions from suppliers will appear here for a decision."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Supplier</th>
                <th>Schedule</th>
                <th>Submitted</th>
                <th className="text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => a.createdAt - b.createdAt)
                .map((c) => {
                  const age = daysAgo(c.createdAt);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="font-mono text-xs font-medium text-ink">{shortId(c.id)}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-ink-5">Slot {shortId(c.slotId)}</div>
                      </td>
                      <td className="font-mono text-xs text-ink-3">{shortId(c.supplierId)}</td>
                      <td>
                        <WindowCell startsAt={c.startsAt} endsAt={c.endsAt} />
                      </td>
                      <td>
                        <Pill tone={age >= 3 ? 'warning' : 'neutral'} dot>
                          {age === 0 ? 'Today' : `${age}d ago`}
                        </Pill>
                      </td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" disabled={approve.isPending || reject.isPending} onClick={() => setRejecting(c)}>
                            Reject
                          </Button>
                          <Button size="sm" variant="primary" disabled={approve.isPending || reject.isPending} onClick={() => approve.mutate({ id: c.id })}>
                            Approve
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </TableCard>

      {rejecting && (
        <ReasonDialog
          key={rejecting.id}
          title="Reject this campaign?"
          description={
            <>
              Campaign <span className="font-mono text-ink">{shortId(rejecting.id)}</span> will not go live. Record why it was rejected.
            </>
          }
          confirmLabel="Reject campaign"
          pending={reject.isPending}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => reject.mutate({ id: rejecting.id, reason }, { onSuccess: () => setRejecting(null) })}
        />
      )}
    </AdminPage>
  );
}
