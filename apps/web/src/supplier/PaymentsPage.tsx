import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { PaymentConfirmButton } from './PaymentConfirmButton';

type Payment = {
  id: string;
  purchaseOrderId: string;
  amountCents: number;
  status: string;
  createdAt: number;
};

type StatusKey = 'all' | 'pending' | 'completed' | 'failed' | 'refunded';
const STATUSES: StatusKey[] = ['all', 'pending', 'completed', 'failed', 'refunded'];

const TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  completed: 'success',
  paid: 'success',
  failed: 'danger',
  refunded: 'neutral',
};

const POLL_MS = 30_000;

export function SupplierPaymentsPage() {
  const { supplierId } = useSupplierId();
  const [status, setStatus] = useState<StatusKey>('all');

  const payments = useQuery({
    queryKey: ['supplier', supplierId, 'payments', status],
    queryFn: () =>
      api.get<{ items: Payment[] }>(
        `/payments?supplierId=${supplierId}${status === 'all' ? '' : `&status=${status}`}`,
      ),
    retry: false,
    refetchInterval: POLL_MS,
  });
  const list = payments.data?.items ?? [];

  const totalCents = list.reduce((s, p) => s + p.amountCents, 0);
  const settledCents = list
    .filter((p) => p.status === 'completed' || p.status === 'paid')
    .reduce((s, p) => s + p.amountCents, 0);
  const pendingCents = list
    .filter((p) => p.status === 'pending')
    .reduce((s, p) => s + p.amountCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Finance"
        title="Payments"
        sub="Settlements and pending payouts, refreshing every 30s."
      />

      <div className="grid sm:grid-cols-3 gap-px bg-ink/10">
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Total</div>
          <MetricNumber size="md" className="mt-2">{(totalCents / 100).toLocaleString()}</MetricNumber>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Settled</div>
          <MetricNumber size="md" className="mt-2">{(settledCents / 100).toLocaleString()}</MetricNumber>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Pending</div>
          <MetricNumber size="md" className="mt-2">{(pendingCents / 100).toLocaleString()}</MetricNumber>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={
              'px-3 py-1.5 text-xs border rounded-xs transition-colors ' +
              (s === status
                ? 'bg-ink text-paper border-ink'
                : 'border-line text-ink-2 hover:bg-ink hover:text-paper')
            }
          >
            {s}
          </button>
        ))}
      </div>

      <Surface kind="elevated" className="overflow-hidden">
        {list.length === 0 ? (
          <p className="p-10 text-center text-sm text-ink-4">No payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
              <tr>
                <th className="text-left px-4 py-3 font-normal">Payment</th>
                <th className="text-left px-4 py-3 font-normal">Order</th>
                <th className="text-right px-4 py-3 font-normal">Amount</th>
                <th className="text-left px-4 py-3 font-normal">Status</th>
                <th className="text-right px-4 py-3 font-normal">Created</th>
                <th className="text-right px-4 py-3 font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">{p.id.slice(0, 10)}…</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-3">{p.purchaseOrderId.slice(0, 10)}…</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{(p.amountCents / 100).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge variant={TONE[p.status] ?? 'neutral'}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-3">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PaymentConfirmButton paymentId={p.id} status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}
