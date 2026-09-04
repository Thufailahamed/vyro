import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

interface Order { id: string; poNumber: string; totalCents: number; createdAt: number }
interface Audit { id: string; action: string; resourceType: string; resourceId: string; actorUserId: string | null; createdAt: number; metadata: string | null }

export function DisputedPage() {
  const { data } = useQuery({
    queryKey: ['admin-disputed'],
    queryFn: () => api.get<{ orders: Order[] }>('/admin/disputed'),
    retry: false,
  });
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Disputed orders</h1>
      {data?.orders.length === 0 ? (
        <p className="text-sm text-muted">No disputed orders.</p>
      ) : (
        <table className="w-full text-sm bg-white border rounded">
          <thead className="bg-slate-50 text-left"><tr><th className="p-2">PO</th><th className="p-2">Total</th><th className="p-2">Opened</th></tr></thead>
          <tbody>
            {data?.orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2 font-mono">{o.poNumber}</td>
                <td className="p-2">LKR {(o.totalCents / 100).toFixed(2)}</td>
                <td className="p-2">{new Date(o.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AuditPage() {
  const { data } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get<{ logs: Audit[] }>('/admin/audit?limit=200'),
    retry: false,
  });
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Audit log</h1>
      {data?.logs.length === 0 ? (
        <p className="text-sm text-muted">No entries.</p>
      ) : (
        <div className="space-y-1">
          {data?.logs.map((l) => (
            <div key={l.id} className="bg-white border rounded p-2 text-sm flex items-center gap-3">
              <span className="text-muted text-xs">{new Date(l.createdAt).toLocaleString()}</span>
              <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">{l.action}</span>
              <span className="text-xs text-muted">{l.resourceType}/{l.resourceId.slice(0, 8)}…</span>
              <Link to={`/audit/${l.resourceId}`} className="text-xs text-brand-600">View</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
