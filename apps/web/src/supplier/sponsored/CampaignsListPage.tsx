import React from 'react';
import { useCampaigns, useCancelCampaign } from '../../hooks/useSponsored';
import { useSupplierId } from '../useSupplierId';

export function CampaignsListPage() {
  const { supplierId } = useSupplierId();
  const campaigns = useCampaigns(supplierId);
  const cancel = useCancelCampaign(supplierId);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">My campaigns</h1>
      {campaigns.isLoading ? <div className="mt-4">Loading…</div> : null}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>ID</th><th>Slot</th><th>Status</th><th>Window</th><th>Notes</th><th></th></tr>
        </thead>
        <tbody>
          {campaigns.data?.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="py-2 font-mono text-xs">{c.id.slice(0, 8)}</td>
              <td>{c.slotId}</td>
              <td><StatusChip status={c.status} /></td>
              <td>{new Date(c.startsAt * 1000).toLocaleDateString()} – {new Date(c.endsAt * 1000).toLocaleDateString()}</td>
              <td className="text-xs text-gray-600">{c.adminNotes ?? ''}</td>
              <td>
                {!['live', 'expired', 'rejected', 'revoked', 'cancelled'].includes(c.status) ? (
                  <button
                    type="button"
                    className="rounded border border-red-300 px-2 py-0.5 text-red-700 text-xs disabled:opacity-50"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(c.id)}
                  >
                    Cancel
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
function StatusChip({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_approval: 'bg-gray-200 text-gray-800',
    pending_payment: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    live: 'bg-green-100 text-green-800',
    expired: 'bg-gray-100 text-gray-600',
    rejected: 'bg-red-100 text-red-800',
    revoked: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${colors[status] ?? 'bg-gray-100'}`}>{status.replace('_', ' ')}</span>;
}