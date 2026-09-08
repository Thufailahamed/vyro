import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { AlertCircleIcon, ShieldCheckIcon } from './icons';
import { CheckCircleIcon, ClockIcon, ArrowRightIcon } from '@/components/icons';
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
  const totalDisputedCents = orders.reduce((sum, o) => sum + o.totalCents, 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Page Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-rose">Arbitration</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Escrow Claims</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-rose/10 border border-rose/25 text-[10px] font-mono font-bold text-rose uppercase tracking-wider">
              <span className={`size-1.5 rounded-full ${orders.length > 0 ? 'bg-rose animate-ping' : 'bg-mint'}`} />
              {orders.length > 0 ? 'Action Required' : 'Ledger Balanced'}
            </span>
          </div>
        }
        title="Disputed Orders"
        sub="Mediate claims between verified buyers and suppliers regarding freight non-delivery, damaged agricultural goods, or short-shipped commercial orders."
        actions={
          <span
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold border shadow-sm ${
              orders.length > 0
                ? 'bg-rose/15 text-rose border-rose/30'
                : 'bg-paper text-ink-3 border-ink/15'
            }`}
          >
            <AlertCircleIcon size={14} className={orders.length > 0 ? 'text-rose' : 'text-ink-4'} />
            <span>{orders.length} Open Dispute{orders.length === 1 ? '' : 's'}</span>
          </span>
        }
      />

      {/* KPI Triage Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Disputed Purchase Orders
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink flex items-center gap-2">
            <span>{orders.length}</span>
            {orders.length > 0 && <span className="size-2 rounded-full bg-rose animate-pulse" />}
          </div>
          <div className="text-[10px] text-ink-4">Awaiting administrative ruling</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Gross Disputed Capital
          </div>
          <div className="vyro-metric text-2xl sm:text-3xl font-bold text-rose num-tabular">
            {formatLKR(totalDisputedCents)}
          </div>
          <div className="text-[10px] text-ink-4">Funds held in platform escrow</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Arbitration Target SLA
          </div>
          <div className="vyro-metric text-3xl font-bold text-mint">&lt; 24h</div>
          <div className="text-[10px] text-ink-4">Platform compliance guarantee</div>
        </div>
      </div>

      {/* Disputes Ledger or Healthy State */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-paper border border-ink/10 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center bg-paper border border-ink/15 shadow-sm space-y-3">
          <div className="size-14 bg-mint/10 border border-mint/20 text-mint mx-auto flex items-center justify-center">
            <CheckCircleIcon size={28} />
          </div>
          <h3 className="vyro-display text-2xl font-bold text-ink">Zero Active Disputes</h3>
          <p className="text-xs text-ink-4 max-w-md mx-auto leading-relaxed">
            All commercial buyer and wholesale supplier orders are clearing cleanly across all delivery routes and settlement schedules.
          </p>
        </div>
      ) : (
        <div className="bg-paper border border-ink/15 overflow-hidden shadow-sm">
          <div className="p-4 bg-rose/5 border-b border-rose/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircleIcon size={16} className="text-rose" />
              <span className="font-mono text-xs font-bold text-rose uppercase tracking-wider">
                Active Arbitration Ledger
              </span>
            </div>
            <span className="text-[10px] font-mono text-ink-4">
              Decisions trigger automated card refunds or vendor payouts
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/15 bg-bone/70 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  <th className="py-3 px-4">PO Reference</th>
                  <th className="py-3 px-4">Disputed Escrow Value</th>
                  <th className="py-3 px-4">Claim Inception</th>
                  <th className="py-3 px-4 text-right">Arbitration Ruling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-bone/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-ink text-sm">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-rose shrink-0" />
                        <span>{o.poNumber}</span>
                      </div>
                      <div className="text-[10px] text-ink-4 font-normal mt-0.5">
                        ID: {o.id}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-ink text-sm num-tabular">
                      {formatLKR(o.totalCents)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink-3 num-tabular">
                      {new Date(o.createdAt).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <DisputeResolutionPanel
                        poId={o.id}
                        onResolved={() => qc.invalidateQueries({ queryKey: ['admin-disputed'] })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
