import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';

type Po = {
  id: string;
  status: string;
  totalCents: number;
  createdAt: number;
};
type Payment = { id: string; amountCents: number; status: string };
type Customer = { businessId: string; totalOrders: number; totalCents: number };
type Offer = { id: string; availabilityStatus: string };

const POLL_MS = 30_000;

export function SupplierDashboardPage() {
  const { supplierId, supplierName } = useSupplierId();
  const q = { retry: false, refetchInterval: POLL_MS };

  const orders = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Po[] }>(`/purchase-orders?supplierId=${supplierId}`),
    ...q,
  });
  const payments = useQuery({
    queryKey: ['supplier', supplierId, 'payments'],
    queryFn: () => api.get<{ items: Payment[] }>(`/payments?supplierId=${supplierId}`),
    ...q,
  });
  const customers = useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/suppliers/${supplierId}/customers`),
    ...q,
  });
  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    ...q,
  });

  const orderList = orders.data?.orders ?? [];
  const payList = payments.data?.items ?? [];
  const custList = customers.data?.items ?? [];
  const offerList = offers.data?.offers ?? [];

  const pending = orderList.filter((o) => o.status === 'pending' || o.status === 'confirmed').length;
  const inTransit = orderList.filter((o) => o.status === 'dispatched' || o.status === 'shipped').length;
  const revenueCents = payList
    .filter((p) => p.status === 'completed' || p.status === 'paid')
    .reduce((s, p) => s + (p.amountCents ?? 0), 0);
  const lowStock = offerList.filter((o) => o.availabilityStatus === 'low' || o.availabilityStatus === 'out_of_stock').length;

  const tiles = [
    { to: '/supplier/orders', label: 'Open orders', value: pending },
    { to: '/supplier/deliveries', label: 'In transit', value: inTransit },
    { to: '/supplier/payments', label: 'Revenue (¢)', value: revenueCents.toLocaleString() },
    { to: '/supplier/inventory', label: 'Low / out of stock', value: lowStock },
  ];

  const recent = [...orderList].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  return (
    <div className="space-y-8">
      <header className="bg-ink text-paper p-8">
        <PageHeader
          kicker={<span className="text-volt">Supplier</span>}
          title={supplierName}
          sub={<span className="text-paper/60">Live activity — refreshes every 30s.</span>}
        />
      </header>

      <Surface kind="ink" className="p-6">
        <FlowLine
          tone="paper"
          nodes={[
            { label: 'Catalog', state: 'done' },
            { label: 'Pricing', state: 'done' },
            { label: 'Inventory', state: offerList.length ? 'done' : 'idle' },
            { label: 'Orders', state: orderList.length ? 'active' : 'idle' },
            { label: 'Payout', state: payList.length ? 'active' : 'idle' },
          ]}
        />
      </Surface>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="bg-paper p-6 hover:bg-ink hover:text-paper transition-colors group">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4 group-hover:text-volt">{t.label}</div>
            <MetricNumber size="md" className="mt-2">{t.value}</MetricNumber>
          </Link>
        ))}
      </div>

      <Surface kind="elevated" className="p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="vyro-display text-lg">Recent orders</h2>
          <Link to="/supplier/orders" className="text-xs text-ink-4 hover:text-volt">View all →</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-4">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
              <tr>
                <th className="text-left py-2 font-normal">Order</th>
                <th className="text-left py-2 font-normal">Status</th>
                <th className="text-right py-2 font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="py-2 font-mono text-xs text-ink-2">{o.id.slice(0, 10)}…</td>
                  <td className="py-2">{o.status}</td>
                  <td className="py-2 text-right font-mono text-xs">{(o.totalCents ?? 0).toLocaleString()}¢</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <p className="text-xs text-ink-4 text-right">
        {custList.length} customer{custList.length === 1 ? '' : 's'} on file.
      </p>
    </div>
  );
}
