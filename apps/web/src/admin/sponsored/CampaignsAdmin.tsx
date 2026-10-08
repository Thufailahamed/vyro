import React from 'react';
import { useAdminCampaigns, useAdminRevoke, useAdminPin } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, EmptyBlock, StatusPill, TableCard, TableSkeleton, controlClass } from '../ui';
import { TargetIcon } from '@/components/icons';

const STATUSES = ['pending_approval', 'pending_payment', 'approved', 'live', 'expired', 'rejected', 'revoked', 'cancelled'];
const fmtDate = (s: number) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function CampaignsAdmin() {
  const [status, setStatus] = React.useState<string>('');
  const opts = status ? { status } : {};
  const campaigns = useAdminCampaigns(opts);
  const revoke = useAdminRevoke();
  const pin = useAdminPin();
  const rows = campaigns.data ?? [];
  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/sponsored', label: 'Sponsored listings' }}
        kicker="Sponsored · Inventory"
        title="Campaigns"
        description="Every sponsored campaign across suppliers. Pin to boost placement, or revoke a live campaign."
      />
      <TableCard
        title="All campaigns"
        description={`${rows.length} shown`}
        actions={
          <select className={controlClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        }
      >
        {campaigns.isLoading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyBlock icon={<TargetIcon size={20} />} title="No campaigns" description={status ? 'Nothing matches this status.' : 'Supplier campaigns will appear here.'} />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Window</th>
                <th>Pinned</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.id.slice(0, 8)}</td>
                  <td className="font-mono text-xs text-ink-3">{c.supplierId.slice(0, 8)}</td>
                  <td>
                    <StatusPill status={c.status} />
                  </td>
                  <td className="whitespace-nowrap text-ink-3">
                    {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}
                  </td>
                  <td>{c.pinned ? <span className="text-volt-deep" aria-label="Pinned">★</span> : <span className="text-ink-5">—</span>}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" disabled={pin.isPending} onClick={() => pin.mutate(c.id)}>
                        {c.pinned ? 'Unpin' : 'Pin'}
                      </Button>
                      {['approved', 'live'].includes(c.status) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-rose"
                          disabled={revoke.isPending}
                          onClick={() => {
                            const reason = window.prompt('Reason for revocation?');
                            if (reason) revoke.mutate({ id: c.id, reason });
                          }}
                        >
                          Revoke
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
    </AdminPage>
  );
}
