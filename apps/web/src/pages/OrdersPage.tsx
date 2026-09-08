import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { StatusDots } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PackageIcon, SearchIcon, RefreshCwIcon } from '@/components/icons';
import { MetricNumber } from '@/components/brand/Surface';

interface Order {
  id: string;
  poNumber: string;
  supplierId: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: number;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed', label: 'Disputed' },
];

// Reorder only makes sense for orders that already reached a terminal-ish
// state (supplier received the goods and acknowledged them). Earlier statuses
// have nothing to repeat.
const REORDERABLE: ReadonlySet<string> = new Set([
  'delivered',
  'completed',
]);

export function OrdersPage() {
  usePageTitle('Orders');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const [filter, setFilter] = useState('all');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  async function reorder(o: Order) {
    setReorderError('');
    setReorderingId(o.id);
    try {
      await api.post(`/purchase-orders/${o.id}/reorder`);
      void qc.invalidateQueries({ queryKey: ['orders', businessId] });
    } catch (e) {
      setReorderError(
        e instanceof ApiError
          ? e.message
          : 'Could not reorder — some items may no longer be available.',
      );
    } finally {
      setReorderingId(null);
    }
  }

  if (!user) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">Sign in to view orders</h2>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in</Button>
        </Link>
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">No business registered</h2>
        <Link to="/onboarding/business" className="mt-4 inline-block">
          <Button>Register</Button>
        </Link>
      </div>
    );
  }

  if (isLoading) return <div className="h-48 bg-mist animate-pulse" />;

  const allOrders = data?.orders ?? [];
  const filteredOrders = filter === 'all' ? allOrders : allOrders.filter((o) => o.status.toLowerCase() === filter);

  return (
    <div className="space-y-8">
      <PageHeader kicker="Orders" title="Purchase orders." sub="Track each order from confirmation to delivery." />
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((tab) => {
          const count = tab.id === 'all' ? allOrders.length : allOrders.filter((o) => o.status.toLowerCase() === tab.id).length;
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`h-8 px-3 text-xs font-medium ${active ? 'bg-ink text-volt' : 'text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]'}`}
            >
              {tab.label} <span className="vyro-metric ml-1">{count}</span>
            </button>
          );
        })}
      </div>
      {reorderError && (
        <div
          role="alert"
          className="border border-red-300 bg-red-50 text-red-900 px-4 py-2 text-sm"
        >
          {reorderError}
        </div>
      )}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={<PackageIcon size={20} />}
          title={filter === 'all' ? 'No orders yet.' : `No ${filter} orders`}
          description={
            filter === 'all' ? 'Source from the catalog to issue your first purchase order.' : `Nothing currently ${filter}.`
          }
          action={
            <Link to="/search">
              <Button>
                <SearchIcon size={14} /> Catalog
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="divide-y divide-ink/10 border-y border-ink/10">
          {filteredOrders.map((o) => {
            const canReorder = REORDERABLE.has(o.status.toLowerCase());
            const isReordering = reorderingId === o.id;
            return (
              <div
                key={o.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 py-5 hover:bg-paper/80 px-1"
              >
                <Link
                  to={`/orders/${o.id}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0"
                >
                  <span className="vyro-metric text-sm w-36">{o.poNumber}</span>
                  <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                  <span className="text-xs text-ink-4 w-40 truncate" title={o.supplierId}>
                    {o.supplierId.slice(0, 8)}…
                  </span>
                  <span className="text-xs text-ink-4 flex-1">
                    {new Date(o.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <MetricNumber size="sm">{formatLKR(o.totalCents)}</MetricNumber>
                </Link>
                {canReorder && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isReordering}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void reorder(o);
                    }}
                    aria-label={`Reorder ${o.poNumber}`}
                  >
                    <RefreshCwIcon size={14} /> Reorder
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
