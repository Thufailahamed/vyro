import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Input } from '@/components/ui';
import { ClockIcon, CheckCircleIcon, ChevronDownIcon } from './icons';
import { DisputeResolutionPanel } from './DisputeResolutionPanel';

interface Order {
  id: string;
  poNumber: string;
  totalCents: number;
  createdAt: number;
}

export function DisputedPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputed'],
    queryFn: () => api.get<{ disputes: Order[] }>('/admin/disputes'),
    retry: false,
  });

  const orders = data?.disputes ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Arbitration"
        title="Disputed orders."
        actions={
          <span
            className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-medium border num-tabular self-start sm:self-auto ${
              orders.length > 0
                ? 'bg-rose/15 text-rose border-rose/30 animate-pulse'
                : 'bg-paper text-ink-3 border-ink/15'
            }`}
          >
            {orders.length} disputed
          </span>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-paper rounded-md border border-ink/15 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-14 text-center bg-paper rounded-lg border border-dashed border-ink/15">
          <CheckCircleIcon size={32} className="mx-auto text-mint" />
          <h3 className="mt-3 font-semibold text-ink text-base">No active disputes</h3>
          <p className="mt-1 text-sm text-ink-3">All buyer and supplier purchase orders are running smoothly.</p>
        </div>
      ) : (
        <div className="bg-paper border border-rose/30 rounded-lg overflow-hidden shadow-soft-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-rose/5 border-b border-rose/20 text-[10px] font-semibold uppercase tracking-wider text-rose">
              <tr>
                <th className="py-3 px-4">PO Number</th>
                <th className="py-3 px-4">Dispute value</th>
                <th className="py-3 px-4">Date opened</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-rose/5 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-ink">{o.poNumber}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-ink num-tabular">
                    ₨ {(o.totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-ink-3 num-tabular">
                    {new Date(o.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <DisputeResolutionPanel poId={o.id} onResolved={() => qc.invalidateQueries({ queryKey: ['admin-disputed'] })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
