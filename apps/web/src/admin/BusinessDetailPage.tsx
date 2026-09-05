import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { BusinessSuspendButton } from './BusinessSuspendButton';

type Detail = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  orderCount: number;
  recentOrders: Array<{ id: string; status: string; totalCents: number; createdAt: number }>;
};

export function BusinessDetailPage() {
  const { id = '' } = useParams();
  const detail = useQuery({
    queryKey: ['admin-business', id],
    queryFn: () => api.get<{ business: Detail }>(`/admin/businesses/${id}`),
    retry: false,
  });

  if (detail.isError) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Admin</p>
        <h1 className="vyro-display text-2xl">Business not found</h1>
        <Link to="/admin/businesses" className="text-volt underline text-sm">
          ← Back to businesses
        </Link>
      </div>
    );
  }
  if (!detail.data) return <p className="text-sm text-ink-4">Loading…</p>;

  const b = detail.data.business;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Business</p>
          <h1 className="vyro-display text-2xl">{b.name}</h1>
          <p className="text-sm text-ink-4">Status: {b.status}</p>
        </div>
        <BusinessSuspendButton businessId={b.id} status={b.status} />
      </header>

      <div className="grid sm:grid-cols-3 gap-px bg-ink/10">
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Members</div>
          <div className="text-2xl vyro-display mt-1">{b.members.length}</div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Active orders</div>
          <div className="text-2xl vyro-display mt-1">{b.orderCount}</div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Recent (last 20)</div>
          <div className="text-2xl vyro-display mt-1">{b.recentOrders.length}</div>
        </div>
      </div>

      <Surface kind="elevated" className="p-6 space-y-4">
        <h2 className="vyro-display text-lg">Members</h2>
        {b.members.length === 0 ? (
          <p className="text-sm text-ink-4">No members on file.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
              <tr>
                <th className="text-left py-2 font-normal">Email</th>
                <th className="text-left py-2 font-normal">Role</th>
              </tr>
            </thead>
            <tbody>
              {b.members.map((m) => (
                <tr key={m.userId} className="border-t border-line">
                  <td className="py-2 font-mono text-xs">{m.email ?? '—'}</td>
                  <td className="py-2"><Badge variant="neutral">{m.role}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Surface kind="elevated" className="p-6 space-y-4">
        <h2 className="vyro-display text-lg">Recent orders</h2>
        {b.recentOrders.length === 0 ? (
          <p className="text-sm text-ink-4">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
              <tr>
                <th className="text-left py-2 font-normal">Order</th>
                <th className="text-left py-2 font-normal">Status</th>
                <th className="text-right py-2 font-normal">Total</th>
                <th className="text-right py-2 font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {b.recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="py-2 font-mono text-xs">{o.id.slice(0, 12)}…</td>
                  <td className="py-2"><Badge variant="neutral">{o.status}</Badge></td>
                  <td className="py-2 text-right font-mono text-xs">{(o.totalCents / 100).toLocaleString()}</td>
                  <td className="py-2 text-right text-ink-3">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <p className="text-xs text-ink-4">
        Created {new Date(b.createdAt).toLocaleString()} · ID <span className="font-mono">{b.id}</span>
      </p>

      <Link to="/admin/businesses" className="text-xs text-ink-4 hover:text-volt">
        ← Back to businesses
      </Link>
    </div>
  );
}
