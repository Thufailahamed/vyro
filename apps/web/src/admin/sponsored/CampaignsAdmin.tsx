import React from 'react';
import { useAdminCampaigns, useAdminRevoke, useAdminPin } from '../../hooks/useSponsored';

const STATUSES = ['pending_approval', 'pending_payment', 'approved', 'live', 'expired', 'rejected', 'revoked', 'cancelled'];

export function CampaignsAdmin() {
  const [status, setStatus] = React.useState<string>('');
  const opts = status ? { status } : {};
  const campaigns = useAdminCampaigns(opts);
  const revoke = useAdminRevoke();
  const pin = useAdminPin();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <div className="mt-4 flex gap-2 text-sm">
        <select className="rounded border p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {campaigns.isLoading ? <div className="mt-4">Loading…</div> : null}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>ID</th><th>Supplier</th><th>Status</th><th>Window</th><th>Pinned</th><th></th></tr>
        </thead>
        <tbody>
          {campaigns.data?.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="py-2 font-mono text-xs">{c.id.slice(0, 8)}</td>
              <td>{c.supplierId.slice(0, 8)}</td>
              <td>{c.status}</td>
              <td>{new Date(c.startsAt * 1000).toLocaleDateString()} – {new Date(c.endsAt * 1000).toLocaleDateString()}</td>
              <td>{c.pinned ? '★' : ''}</td>
              <td className="flex gap-2">
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-xs disabled:opacity-50"
                  disabled={pin.isPending}
                  onClick={() => pin.mutate(c.id)}
                >
                  {c.pinned ? 'Unpin' : 'Pin'}
                </button>
                {['approved', 'live'].includes(c.status) ? (
                  <button
                    type="button"
                    className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 disabled:opacity-50"
                    disabled={revoke.isPending}
                    onClick={() => {
                      const reason = window.prompt('Reason for revocation?');
                      if (reason) revoke.mutate({ id: c.id, reason });
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}