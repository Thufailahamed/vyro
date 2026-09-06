import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { TruckIcon, SearchIcon, MapPinIcon, CheckCircle2Icon, ClockIcon, UserIcon } from '@/components/icons';
import { useSupplierId } from './useSupplierId';
import { DeliveryTransitionButtons } from './DeliveryTransitionButtons';
import { SupplierEmptyState, SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

type Delivery = {
  id: string;
  purchaseOrderId: string;
  status: string;
  estimatedAt: number | null;
  deliveredAt: number | null;
  driverName: string | null;
  driverPhone?: string | null;
};

type Status = 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
const STATUSES: (Status | 'all')[] = [
  'all',
  'pending',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'failed',
];

const TONE: Record<Status, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  assigned: 'warning',
  picked_up: 'warning',
  in_transit: 'warning',
  delivered: 'success',
  failed: 'danger',
};

const POLL_MS = 30_000;

function statusLabel(s: string) {
  return s.replace(/_/g, ' ');
}

export function SupplierDeliveriesPage() {
  const { supplierId } = useSupplierId();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const deliveries = useQuery({
    queryKey: ['supplier', supplierId, 'deliveries', status],
    queryFn: () =>
      api.get<{ items: Delivery[] }>(
        `/deliveries?supplierId=${supplierId}${status === 'all' ? '' : `&status=${status}`}`,
      ),
    retry: false,
    refetchInterval: POLL_MS,
  });
  const list = deliveries.data?.items ?? [];

  const filteredList = useMemo(() => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.purchaseOrderId.toLowerCase().includes(q) ||
        d.driverName?.toLowerCase().includes(q),
    );
  }, [list, searchQuery]);

  const inTransitCount = list.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status)).length;
  const deliveredCount = list.filter((d) => d.status === 'delivered').length;
  const pendingCount = list.filter((d) => d.status === 'pending').length;

  if (deliveries.isLoading) return <SupplierLoadingState label="Loading outbound shipments" />;
  if (deliveries.isError) {
    return (
      <SupplierErrorState
        message="Could not load deliveries."
        onRetry={() => void deliveries.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker="Logistics & Dispatch"
          title="Outbound Deliveries"
          sub="Fleet tracking, driver assignment, and proof-of-delivery sync."
        />
        <Link to="/supplier/orders">
          <Button variant="ghost" size="sm" className="gap-1">
            View All Purchase Orders →
          </Button>
        </Link>
      </header>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink/10 border border-ink/10 overflow-hidden">
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Pending Dispatch</div>
          <MetricNumber size="md" className="mt-1 text-amber">
            {pendingCount}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-0.5">Driver unassigned</div>
        </div>

        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Active in Transit</div>
          <MetricNumber size="md" className="mt-1 text-ink">
            {inTransitCount}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-0.5">En route to buyer docks</div>
        </div>

        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Delivered Shipments</div>
          <MetricNumber size="md" className="mt-1 text-emerald-800">
            {deliveredCount}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-0.5">Successfully received</div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 overflow-x-auto">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={
                'px-3 py-1.5 text-xs font-mono border transition-colors capitalize ' +
                (s === status
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-paper border-line text-ink-2 hover:bg-ink hover:text-paper')
              }
            >
              {s === 'all' ? 'All' : statusLabel(s)}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search delivery ID, PO#, driver…"
            className="pl-9 text-xs"
          />
        </div>
      </div>

      <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
        {list.length === 0 ? (
          <SupplierEmptyState
            icon={<TruckIcon size={24} className="text-copper" />}
            title="No shipments in this view"
            description="Shipments appear automatically when purchase orders move into fulfillment."
            action={
              <Link to="/supplier/orders">
                <Button size="sm" variant="secondary">
                  Open orders console →
                </Button>
              </Link>
            }
          />
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-ink-4 space-y-1">
            <p className="text-sm font-medium text-ink-3">No shipments match "{searchQuery}"</p>
            <p className="text-xs">Try clearing the search query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                <tr>
                  <th className="text-left px-5 py-3.5 font-medium">Delivery ID</th>
                  <th className="text-left px-4 py-3.5 font-medium">Purchase Order</th>
                  <th className="text-left px-4 py-3.5 font-medium">Status</th>
                  <th className="text-left px-4 py-3.5 font-medium">Driver Assigned</th>
                  <th className="text-right px-4 py-3.5 font-medium">ETA / Delivered</th>
                  <th className="text-right px-5 py-3.5 font-medium">Fulfillment Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredList.map((d) => (
                  <tr key={d.id} className="hover:bg-mist/30 transition-colors">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-ink">
                      {d.id.slice(0, 10)}…
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">
                      <Link
                        to={`/orders/${d.purchaseOrderId}`}
                        className="text-ink hover:text-copper underline decoration-ink/20"
                      >
                        {d.purchaseOrderId.slice(0, 12)}…
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={TONE[d.status as Status] ?? 'neutral'}>
                        {statusLabel(d.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      {d.driverName ? (
                        <div className="flex items-center gap-1.5 text-xs text-ink font-medium">
                          <UserIcon size={12} className="text-copper" />
                          <span>{d.driverName}</span>
                          {d.driverPhone && <span className="text-ink-4 font-mono">({d.driverPhone})</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-4 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-ink-3">
                      {d.deliveredAt ? (
                        <div className="flex items-center justify-end gap-1 text-emerald-800 font-medium">
                          <CheckCircle2Icon size={12} />
                          {new Date(d.deliveredAt).toLocaleDateString()}
                        </div>
                      ) : d.estimatedAt ? (
                        <div className="flex items-center justify-end gap-1">
                          <ClockIcon size={12} />
                          {new Date(d.estimatedAt).toLocaleString()}
                        </div>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <DeliveryTransitionButtons poId={d.purchaseOrderId} status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
