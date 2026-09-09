import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAdminOrder } from './useAdminOrders';

const OVERRIDE_STATUSES = ['confirmed', 'fulfilled', 'delivered', 'cancelled'] as const;

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useAdminOrder(id);
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof OVERRIDE_STATUSES)[number]>('cancelled');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const override = useMutation({
    mutationFn: (body: { status: string; reason: string; expectedUpdatedAt?: number | undefined }) =>
      api.post<{ ok: true }>(`/admin/orders/${id}/override`, body),
    onSuccess: () => {
      setError(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['admin-order', id] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Override failed');
    },
  });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Link to="/admin/orders" className="text-xs underline">← Back to orders</Link>
      {isLoading ? <p className="text-sm text-ink-4">Loading…</p> : null}
      {isError ? <p className="text-sm text-rose">Order not found.</p> : null}
      {data?.order ? (
        <>
          <h1 className="vyro-display text-2xl font-mono">{data.order.poNumber ?? data.order.id}</h1>
          <p className="text-sm">Status: <strong>{data.order.status}</strong></p>
          <form
            className="space-y-2 border border-ink/10 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              override.mutate({ status, reason, expectedUpdatedAt: data.order.updatedAt });
            }}
          >
            <h2 className="text-sm font-bold">Status override (audited)</h2>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="border px-2 py-1 text-sm">
              {OVERRIDE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (min 5 chars, required)"
              className="w-full border px-2 py-1 text-sm"
            />
            {error ? <p className="text-xs text-rose">{error}</p> : null}
            <button type="submit" disabled={override.isPending || reason.trim().length < 5} className="px-3 py-1 bg-ink text-paper text-sm disabled:opacity-50">
              {override.isPending ? 'Saving…' : 'Apply override'}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
