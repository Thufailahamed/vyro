import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { ClockIcon, CheckCircleIcon } from './icons';

interface Order {
  id: string;
  poNumber: string;
  totalCents: number;
  createdAt: number;
}

interface Audit {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorUserId: string | null;
  createdAt: number;
  metadata: string | null;
}

export function DisputedPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputed'],
    queryFn: () => api.get<{ orders: Order[] }>('/admin/disputed'),
    retry: false,
  });

  const orders = data?.orders ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-ink/10">
        <div>
          <div className="vyro-kicker">Arbitration</div>
          <h1 className="mt-1 vyro-display text-3xl">Disputed orders</h1>
        </div>
        <span
          className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-medium border num-tabular self-start sm:self-auto ${
            orders.length > 0
              ? 'bg-rose/15 text-rose border-rose/30 animate-pulse'
              : 'bg-paper text-slate-500 border-slate-200'
          }`}
        >
          {orders.length} disputed
        </span>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-paper rounded-md border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-14 text-center bg-paper rounded-lg border border-dashed border-slate-200">
          <CheckCircleIcon size={32} className="mx-auto text-mint" />
          <h3 className="mt-3 font-semibold text-slate-950 text-base">No active disputes</h3>
          <p className="mt-1 text-sm text-slate-500">All buyer and supplier purchase orders are running smoothly.</p>
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
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-rose/5 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-950">{o.poNumber}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-950 num-tabular">
                    ₨ {(o.totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-500 num-tabular">
                    {new Date(o.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider bg-rose/15 text-rose border border-rose/30">
                      Under review
                    </span>
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

export function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get<{ logs: Audit[] }>('/admin/audit?limit=200'),
    retry: false,
  });

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-ink/10">
        <div>
          <div className="vyro-kicker">Ledger</div>
          <h1 className="mt-1 vyro-display text-3xl">System audit trail</h1>
        </div>
        <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-slate-200 text-slate-700 self-start sm:self-auto num-tabular">
          {logs.length} recent events
        </span>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-paper rounded-md border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="p-14 text-center bg-paper rounded-lg border border-dashed border-slate-200">
          <p className="text-sm font-semibold text-slate-950">No audit events recorded</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {logs.map((l) => (
            <li
              key={l.id}
              className="bg-paper border border-slate-200 rounded-md p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1 text-slate-500 font-mono text-[11px] shrink-0 num-tabular">
                  <ClockIcon size={13} className="text-slate-400" />
                  {new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="font-mono font-semibold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-violet/10 text-violet border border-violet/30">
                  {l.action}
                </span>
                <span className="text-sm text-slate-700">
                  {l.resourceType} <span className="font-mono text-xs text-slate-500">({l.resourceId.slice(0, 8)}…)</span>
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {l.actorUserId && (
                  <span>
                    actor <code className="text-slate-700 font-mono">{l.actorUserId.slice(0, 6)}…</code>
                  </span>
                )}
                <Link to={`/audit/${l.resourceId}`} className="font-semibold text-copper hover:text-ink">
                  Inspect →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
