import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import {
  AlertCircleIcon,
  FileTextIcon,
  ClockIcon,
  CheckCircleIcon,
} from './icons';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
            <AlertCircleIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Disputed Purchase Orders</h1>
            <p className="text-xs text-slate-500">Active escalation disputes requiring platform arbitration</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
          orders.length > 0 ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-slate-100 text-slate-700'
        }`}>
          {orders.length} Disputed
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/90 shadow-soft-sm text-slate-500 space-y-2">
          <CheckCircleIcon size={32} className="mx-auto text-emerald-500" />
          <h3 className="font-bold text-slate-800 text-base">No active disputes</h3>
          <p className="text-xs text-slate-500">All buyer and supplier purchase orders are running smoothly.</p>
        </div>
      ) : (
        <div className="bg-white border border-rose-200 rounded-2xl overflow-hidden shadow-soft-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-rose-50/50 border-b border-rose-200 text-xs font-semibold uppercase tracking-wider text-rose-800">
              <tr>
                <th className="py-3 px-4">PO Number</th>
                <th className="py-3 px-4">Dispute Value (LKR)</th>
                <th className="py-3 px-4">Date Opened</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{o.poNumber}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    ₨ {(o.totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-500">
                    {new Date(o.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">
                      Under Review
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <FileTextIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">System Audit Trail</h1>
            <p className="text-xs text-slate-500">Immutable, chronological transaction and transition logs</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-auto">
          {logs.length} Recent Events
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/90 shadow-soft-sm text-slate-500">
          <p className="text-sm font-semibold text-slate-800">No audit events recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => (
            <div
              key={l.id}
              className="bg-white border border-slate-200/90 rounded-xl p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-soft-sm hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-slate-600 font-mono text-[11px] shrink-0">
                  <ClockIcon size={13} className="text-slate-400" />
                  {new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                  {l.action}
                </span>
                <span className="text-slate-600 font-medium">
                  {l.resourceType} <span className="font-mono text-slate-600">({l.resourceId.slice(0, 8)}...)</span>
                </span>
              </div>

              <div className="flex items-center gap-3 text-slate-600 text-[11px]">
                {l.actorUserId && (
                  <span>Actor: <code className="text-slate-700">{l.actorUserId.slice(0, 6)}...</code></span>
                )}
                <Link to={`/audit/${l.resourceId}`} className="font-semibold text-brand-700 hover:underline">
                  Inspect →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
