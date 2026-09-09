import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminOrders } from './useAdminOrders';

const STATUSES = ['all', 'confirmed', 'fulfilled', 'delivered', 'disputed', 'cancelled'];

export function OrdersPage() {
  const [status, setStatus] = useState('all');
  const { data, isLoading, isError, refetch } = useAdminOrders(status === 'all' ? undefined : status);
  const orders = data?.orders ?? [];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="vyro-kicker">Operations</p>
          <h1 className="vyro-display text-2xl">Orders</h1>
        </div>
        <div className="flex items-center gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 text-xs font-mono uppercase ${status === s ? 'bg-ink text-paper' : 'text-ink-4 hover:underline'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>
      {isLoading ? <p className="text-sm text-ink-4">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-rose">
          Failed to load. <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </p>
      ) : null}
      {!isLoading && !isError ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase text-ink-4">
              <th className="py-2">Order</th>
              <th className="py-2">Status</th>
              <th className="py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-ink/10">
                <td className="py-2 font-mono text-xs">{o.poNumber ?? o.id}</td>
                <td className="py-2">{o.status}</td>
                <td className="py-2">
                  <Link to={`/admin/orders/${o.id}`} className="text-copper underline">Open →</Link>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr><td colSpan={3} className="py-6 text-center text-ink-4">No orders.</td></tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
