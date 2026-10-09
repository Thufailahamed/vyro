import { useMemo, useState } from 'react';
import type { SponsorCampaign } from '@vyro/validation';
import { useAdminCampaigns, useAdminRevoke, useAdminPin } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, Callout, EmptyBlock, Pill, StatusPill, TableCard, TableSkeleton, Toolbar, controlClass } from '../ui';
import { SearchIcon, SparklesIcon, TargetIcon } from '@/components/icons';
import { CAMPAIGN_STATUSES, ReasonDialog, SponsoredNav, WindowCell, fmtCount, labelize, shortId } from './sponsoredUi';

export function CampaignsAdmin() {
  const [status, setStatus] = useState<string>('');
  const [query, setQuery] = useState('');
  const [revoking, setRevoking] = useState<SponsorCampaign | null>(null);
  const opts = status ? { status } : {};
  const campaigns = useAdminCampaigns(opts);
  const revoke = useAdminRevoke();
  const pin = useAdminPin();
  const all = campaigns.data ?? [];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.supplierId.toLowerCase().includes(q) ||
        c.slotId.toLowerCase().includes(q) ||
        c.productId.toLowerCase().includes(q),
    );
  }, [all, query]);

  const error = revoke.error ?? pin.error;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sponsored · Inventory"
        title="Campaigns"
        description="Every sponsored campaign across suppliers. Pin to boost placement, or revoke a live campaign."
      />
      <SponsoredNav />

      {error && (
        <Callout tone="danger" title="That action didn't go through">
          {(error as Error).message || 'Try again in a moment.'}
        </Callout>
      )}

      <TableCard
        title="All campaigns"
        description={`${fmtCount(rows.length)} ${status || query ? 'matching' : 'in total'}`}
        toolbar={
          <Toolbar
            actions={
              <select className={controlClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option>
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            }
          >
            <label className="relative w-full max-w-xs">
              <span className="sr-only">Search campaigns</span>
              <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                className={`${controlClass} w-full pl-9`}
                placeholder="Search ID, supplier, slot or product"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </Toolbar>
        }
      >
        {campaigns.isLoading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyBlock
            icon={<TargetIcon size={20} />}
            title={all.length === 0 && !status ? 'No campaigns yet' : 'Nothing matches'}
            description={
              query || status
                ? 'Try a different status or clear the search.'
                : 'Supplier campaigns will appear here once they are submitted.'
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Placement</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const revocable = ['approved', 'live'].includes(c.status);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-ink">{shortId(c.id)}</span>
                        {c.pinned && (
                          <Pill tone="brand" icon={<SparklesIcon size={11} />} title="Pinned to the top of its placement">
                            Pinned
                          </Pill>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-ink-5">Product {shortId(c.productId)}</div>
                    </td>
                    <td className="font-mono text-xs text-ink-3">{shortId(c.supplierId)}</td>
                    <td>
                      <StatusPill status={c.status} />
                    </td>
                    <td>
                      <WindowCell startsAt={c.startsAt} endsAt={c.endsAt} />
                    </td>
                    <td className="font-mono text-xs text-ink-3">Slot {shortId(c.slotId)}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" disabled={pin.isPending} onClick={() => pin.mutate(c.id)}>
                          {c.pinned ? 'Unpin' : 'Pin'}
                        </Button>
                        {revocable && (
                          <Button size="sm" variant="ghost" className="text-rose hover:bg-rose/[0.07]" disabled={revoke.isPending} onClick={() => setRevoking(c)}>
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {revoking && (
        <ReasonDialog
          key={revoking.id}
          title="Revoke this campaign?"
          description={
            <>
              Campaign <span className="font-mono text-ink">{shortId(revoking.id)}</span> will be revoked. Record the reason.
            </>
          }
          confirmLabel="Revoke campaign"
          pending={revoke.isPending}
          onCancel={() => setRevoking(null)}
          onConfirm={(reason) => revoke.mutate({ id: revoking.id, reason }, { onSuccess: () => setRevoking(null) })}
        />
      )}
    </AdminPage>
  );
}
