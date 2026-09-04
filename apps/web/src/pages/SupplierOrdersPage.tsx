import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, EmptyState, StatusBadge, PageHeader, PageSection, StatusDots } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { StoreIcon, CheckCircleIcon, XIcon } from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';

interface Order {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
}

export function SupplierOrdersPage() {
  const { user } = useAuth();
  const supplierId = user?.supplierMemberships?.[0]?.supplierId;
  const supplierName = user?.supplierMemberships?.[0]?.supplierName;
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['supplier-orders', supplierId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?supplierId=${supplierId}`),
    enabled: !!supplierId,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function transition(poId: string, to: string) {
    setBusyId(poId);
    try {
      await api.post(`/purchase-orders/${poId}/transition`, { to });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  if (!user || !supplierId) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">Supplier access required</h2>
        <Link to="/onboarding/supplier" className="mt-4 inline-block">
          <Button>List as supplier</Button>
        </Link>
      </div>
    );
  }

  if (isLoading) return <div className="h-48 bg-mist animate-pulse" />;

  const orders = data?.orders ?? [];
  const pending = orders.filter((o) => o.status === 'pending');
  const active = orders.filter((o) => o.status !== 'pending');
  const revenue = orders.reduce((a, b) => a + b.totalCents, 0);

  return (
    <div className="space-y-8">
      <PageHeader kicker={supplierName} title="Supplier command." sub="Accept, prepare, dispatch." />

      <div className="grid md:grid-cols-3 gap-px bg-ink/10">
        <div className="bg-ink text-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-volt">Incoming</div>
          <MetricNumber size="lg" className="mt-2 text-paper">
            {pending.length}
          </MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Revenue on book</div>
          <MetricNumber size="md" className="mt-2">
            {formatCompactLKR(revenue)}
          </MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">All orders</div>
          <MetricNumber size="md" className="mt-2">
            {orders.length}
          </MetricNumber>
        </div>
      </div>

      <Surface kind="ink" className="p-6">
        <FlowLine
          tone="paper"
          nodes={[
            { label: 'Incoming', state: pending.length ? 'active' : 'done' },
            { label: 'Accepted', state: 'idle' },
            { label: 'Delivery', state: 'idle' },
            { label: 'Customers', state: 'idle' },
          ]}
        />
      </Surface>

      <PageSection eyebrow="Now" title="Awaiting acceptance">
        {pending.length === 0 ? (
          <EmptyState icon={<CheckCircleIcon size={20} />} title="All caught up." description="No pending purchase orders." />
        ) : (
          <div className="space-y-3">
            {pending.map((o) => (
              <Surface key={o.id} kind="elevated" className="p-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-[inset_3px_0_0_0_#C4843A]">
                <div className="flex-1 space-y-1">
                  <div className="vyro-metric">{o.poNumber}</div>
                  <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                </div>
                <MetricNumber size="sm">{formatLKR(o.totalCents)}</MetricNumber>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" loading={busyId === o.id} onClick={() => transition(o.id, 'accepted')}>
                    Accept
                  </Button>
                  <Button size="sm" variant="danger" disabled={busyId === o.id} onClick={() => transition(o.id, 'rejected')}>
                    <XIcon size={14} />
                  </Button>
                  <Link to={`/orders/${o.id}`}>
                    <Button variant="secondary" size="sm">
                      View
                    </Button>
                  </Link>
                </div>
              </Surface>
            ))}
          </div>
        )}
      </PageSection>

      <PageSection eyebrow="In motion" title="Fulfillment">
        {active.length === 0 ? (
          <p className="text-sm text-ink-4">No historical purchase orders yet.</p>
        ) : (
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {active.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center gap-4 py-4 hover:bg-paper/80">
                <span className="vyro-metric text-sm w-32">{o.poNumber}</span>
                <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                <span className="flex-1" />
                <span className="vyro-metric text-sm">{formatLKR(o.totalCents)}</span>
              </Link>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}

void StoreIcon;
