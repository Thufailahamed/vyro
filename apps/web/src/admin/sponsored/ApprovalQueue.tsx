import React from 'react';
import { useAdminCampaigns, useAdminApprove, useAdminReject } from '../../hooks/useSponsored';

export function ApprovalQueue() {
  const campaigns = useAdminCampaigns({ status: 'pending_approval' });
  const approve = useAdminApprove();
  const reject = useAdminReject();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Approval queue</h1>
      {campaigns.isLoading ? <div className="mt-4">Loading…</div> : null}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>ID</th><th>Supplier</th><th>Slot</th><th>Window</th><th></th></tr>
        </thead>
        <tbody>
          {campaigns.data?.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="py-2 font-mono text-xs">{c.id.slice(0, 8)}</td>
              <td>{c.supplierId.slice(0, 8)}</td>
              <td>{c.slotId}</td>
              <td>{new Date(c.startsAt * 1000).toLocaleDateString()} – {new Date(c.endsAt * 1000).toLocaleDateString()}</td>
              <td className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-green-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate({ id: c.id })}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded bg-red-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                  disabled={reject.isPending}
                  onClick={() => {
                    const reason = window.prompt('Reason for rejection?');
                    if (reason) reject.mutate({ id: c.id, reason });
                  }}
                >
                  Reject
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}