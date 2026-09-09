import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAdminDeliveries } from './useAdminDeliveries';

export function DeliveriesPage() {
  const { data, isLoading, isError, refetch } = useAdminDeliveries();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deliveries = data?.deliveries ?? [];

  const reassign = useMutation({
    mutationFn: (body: { id: string; assigneeId: string; reason: string }) =>
      api.post<{ ok: true }>(`/admin/deliveries/${body.id}/reassign`, { assigneeId: body.assigneeId, reason: body.reason }),
    onSuccess: () => {
      setError(null);
      setSelectedId(null);
      setAssigneeId('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['admin-deliveries'] });
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Reassign failed'),
  });

  const markLost = useMutation({
    mutationFn: (body: { id: string; reason: string }) =>
      api.post<{ ok: true }>(`/admin/deliveries/${body.id}/mark-lost`, { reason: body.reason }),
    onSuccess: () => {
      setError(null);
      setSelectedId(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['admin-deliveries'] });
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Mark-lost failed'),
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header>
        <p className="vyro-kicker">Operations</p>
        <h1 className="vyro-display text-2xl">Deliveries</h1>
      </header>
      {isLoading ? <p className="text-sm text-ink-4">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-rose">Failed to load. <button type="button" className="underline" onClick={() => refetch()}>Retry</button></p>
      ) : null}
      {!isLoading && !isError ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase text-ink-4">
              <th className="py-2">Delivery</th>
              <th className="py-2">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id} className="border-t border-ink/10">
                <td className="py-2 font-mono text-xs">{d.id}</td>
                <td className="py-2">{d.status}</td>
                <td className="py-2">
                  <button type="button" className="text-copper underline text-xs" onClick={() => { setSelectedId(d.id); setError(null); }}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
            {deliveries.length === 0 ? (
              <tr><td colSpan={3} className="py-6 text-center text-ink-4">No deliveries.</td></tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      {selectedId ? (
        <div className="border border-ink/10 p-4 space-y-2 max-w-xl">
          <h2 className="text-sm font-bold font-mono">{selectedId}</h2>
          <input value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} placeholder="Assignee ID (for reassign)" className="w-full border px-2 py-1 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (min 5 chars, required)" className="w-full border px-2 py-1 text-sm" />
          {error ? <p className="text-xs text-rose">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={reassign.isPending || assigneeId.trim() === '' || reason.trim().length < 5}
              onClick={() => reassign.mutate({ id: selectedId, assigneeId, reason })}
              className="px-3 py-1 bg-ink text-paper text-sm disabled:opacity-50"
            >
              Reassign
            </button>
            <button
              type="button"
              disabled={markLost.isPending || reason.trim().length < 5}
              onClick={() => markLost.mutate({ id: selectedId, reason })}
              className="px-3 py-1 border border-rose text-rose text-sm disabled:opacity-50"
            >
              Mark lost
            </button>
            <button type="button" onClick={() => setSelectedId(null)} className="px-3 py-1 text-sm underline">Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
