import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';

type Delivery = {
  id: string;
  purchaseOrderId: string;
  status: string;
  estimatedAt: number | null;
  deliveredAt: number | null;
  driverName: string | null;
};

type Status = 'scheduled' | 'in_transit' | 'delivered' | 'failed';
const STATUSES: (Status | 'all')[] = ['all', 'scheduled', 'in_transit', 'delivered', 'failed'];

const TONE: Record<Status, 'neutral' | 'warning' | 'success' | 'danger'> = {
  scheduled: 'neutral',
  in_transit: 'warning',
  delivered: 'success',
  failed: 'danger',
};

import { useState } from 'react';

const POLL_MS = 30_000;

export function SupplierDeliveriesPage() {
  const { supplierId } = useSupplierId();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');

  const deliveries = useQuery({
    queryKey: ['supplier', supplierId, 'deliveries', status],
    queryFn: () =>
      api.get<{ items: Delivery[] }>(
        `/deliveries?supplierId=${supplierId}${status === 'all' ? '' : `&status=${status}`}`,
      ),
    retry: false,
    refetchInterval: POLL_MS,
  });
  const list = deliveries.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Logistics"
        title="Deliveries"
        sub="Outbound shipments, refreshing every 30s."
      />

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
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <Surface kind="elevated" className="overflow-hidden">
        {list.length === 0 ? (
          <p className="p-10 text-center text-sm text-ink-4">No deliveries match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
              <tr>
                <th className="text-left px-4 py-3 font-normal">Delivery</th>
                <th className="text-left px-4 py-3 font-normal">Order</th>
                <th className="text-left px-4 py-3 font-normal">Status</th>
                <th className="text-left px-4 py-3 font-normal">Driver</th>
                <th className="text-right px-4 py-3 font-normal">ETA</th>
                <th className="text-right px-4 py-3 font-normal">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">{d.id.slice(0, 10)}…</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-3">{d.purchaseOrderId.slice(0, 10)}…</td>
                  <td className="px-4 py-3">
                    <Badge variant={TONE[d.status as Status] ?? 'neutral'}>
                      {d.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{d.driverName ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-ink-3">
                    {d.estimatedAt ? new Date(d.estimatedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-3">
                    {d.deliveredAt ? new Date(d.deliveredAt).toLocaleString() : '—'}
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
