import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, PageHeader, PageSection, StatusDots, Input } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { CheckCircleIcon, XIcon, PackageIcon, SearchIcon, ArrowRightIcon, EyeIcon, ClockIcon, MapPinIcon } from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { useSupplierId } from '@/supplier/useSupplierId';
import { SupplierEmptyState, SupplierErrorState, SupplierLoadingState } from '@/supplier/SupplierPageState';

interface Order {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
  deliveryCity?: string;
  deliveryDistrict?: string;
  businessId?: string;
}

type OrderDetail = {
  order: Order;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    unit?: string;
  }>;
  events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    createdAt: number;
  }>;
};

const NEXT: Record<string, string | null> = {
  pending: 'accepted',
  accepted: 'preparing',
  preparing: 'ready_for_pickup',
  ready_for_pickup: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

const NEXT_LABEL: Record<string, string> = {
  accepted: 'Accept PO',
  preparing: 'Start Prep',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Dispatch Delivery',
  delivered: 'Confirm Delivered',
};

export function SupplierOrdersPage() {
  const { supplierId, supplierName } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'incoming' | 'fulfillment' | 'completed'>('all');
  const [activeDrawerPoId, setActiveDrawerPoId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?supplierId=${supplierId}`),
    enabled: !!supplierId,
    refetchInterval: 30_000,
  });

  const drawerQuery = useQuery({
    queryKey: ['purchase-order', activeDrawerPoId],
    queryFn: () => api.get<OrderDetail>(`/purchase-orders/${activeDrawerPoId}`),
    enabled: !!activeDrawerPoId,
  });

  async function transition(poId: string, to: string) {
    setBusyId(poId);
    try {
      await api.post(`/purchase-orders/${poId}/transition`, { to });
      toast.success(`Order advanced to ${to.replace(/_/g, ' ')}`);
      await qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'po'] });
      if (activeDrawerPoId === poId) {
        await qc.invalidateQueries({ queryKey: ['purchase-order', activeDrawerPoId] });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Transition failed');
    } finally {
      setBusyId(null);
    }
  }

  const orders = ordersQuery.data?.orders ?? [];

  const pending = useMemo(() => orders.filter((o) => o.status === 'pending'), [orders]);
  const inFulfillment = useMemo(
    () => orders.filter((o) => ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)),
    [orders],
  );
  const done = useMemo(
    () => orders.filter((o) => ['delivered', 'completed', 'rejected', 'cancelled'].includes(o.status)),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let base = orders;
    if (tab === 'incoming') base = pending;
    else if (tab === 'fulfillment') base = inFulfillment;
    else if (tab === 'completed') base = done;

    if (!searchQuery) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (o) =>
        o.poNumber.toLowerCase().includes(q) ||
        o.deliveryCity?.toLowerCase().includes(q) ||
        o.deliveryDistrict?.toLowerCase().includes(q),
    );
  }, [orders, tab, pending, inFulfillment, done, searchQuery]);

  const revenue = orders.reduce((a, b) => a + b.totalCents, 0);

  if (ordersQuery.isLoading) return <SupplierLoadingState label="Loading purchase order console" />;
  if (ordersQuery.isError) {
    return (
      <SupplierErrorState
        message="Could not load purchase orders."
        onRetry={() => void ordersQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker={supplierName}
          title="Purchase Orders Console"
          sub="Live fulfillment management · Auto-syncs every 30s."
        />
      </header>

      {/* Metric Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink/10 border border-ink/10 overflow-hidden">
        <div className="bg-ink text-paper p-6 relative overflow-hidden grain">
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.14em] text-volt font-semibold">Incoming Orders</div>
            <MetricNumber size="lg" className="mt-2 text-paper">
              {pending.length}
            </MetricNumber>
            <div className="text-xs text-paper/60 mt-1">Awaiting your acceptance</div>
          </div>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">In Fulfillment</div>
          <MetricNumber size="md" className="mt-2 text-ink">
            {inFulfillment.length}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-1">Preparing or out for delivery</div>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Total Order Book Value</div>
          <MetricNumber size="md" className="mt-2 text-ink-2">
            {formatCompactLKR(revenue)}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-1">{formatLKR(revenue)} across all POs</div>
        </div>
      </div>

      {/* Fulfillment Pipeline Banner */}
      <Surface kind="ink" className="p-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-paper/50 mb-3">
          Wholesale Fulfillment Pipeline
        </div>
        <FlowLine
          tone="paper"
          nodes={[
            { label: 'Incoming', state: pending.length ? 'active' : orders.length ? 'done' : 'idle' },
            {
              label: 'Accepted',
              state: inFulfillment.some((o) => o.status === 'accepted')
                ? 'active'
                : inFulfillment.length || done.length
                  ? 'done'
                  : 'idle',
            },
            {
              label: 'Preparing',
              state: inFulfillment.some((o) => ['preparing', 'ready_for_pickup'].includes(o.status))
                ? 'active'
                : done.length
                  ? 'done'
                  : 'idle',
            },
            {
              label: 'Dispatched',
              state: inFulfillment.some((o) => o.status === 'out_for_delivery')
                ? 'active'
                : done.some((o) => ['delivered', 'completed'].includes(o.status))
                  ? 'done'
                  : 'idle',
            },
          ]}
        />
      </Surface>

      {/* Filters and Tabs */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {[
              { id: 'all', label: 'All Orders', count: orders.length },
              { id: 'incoming', label: 'Incoming', count: pending.length },
              { id: 'fulfillment', label: 'In Fulfillment', count: inFulfillment.length },
              { id: 'completed', label: 'Completed', count: done.length },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors border ${
                  tab === t.id
                    ? 'bg-ink text-paper border-ink font-semibold'
                    : 'bg-paper text-ink-3 border-ink/10 hover:bg-mist/60'
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          <div className="relative max-w-xs">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PO#, city, district…"
              className="pl-9 text-xs"
            />
          </div>
        </div>

        {/* PO Table / Cards */}
        {filteredOrders.length === 0 ? (
          <Surface kind="elevated" className="overflow-hidden border border-ink/10 p-12 text-center text-ink-4">
            <PackageIcon size={32} className="mx-auto text-ink-4 mb-2" />
            <p className="text-sm font-medium text-ink-3">No purchase orders found</p>
            <p className="text-xs mt-1">
              {searchQuery ? 'Try clearing your search criteria.' : 'New orders will automatically appear here.'}
            </p>
          </Surface>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((o) => {
              const next = NEXT[o.status];
              const isPendingStatus = o.status === 'pending';

              return (
                <Surface
                  key={o.id}
                  kind="elevated"
                  className={`p-5 flex flex-col md:flex-row md:items-center gap-4 transition-shadow border border-ink/10 ${
                    isPendingStatus
                      ? 'shadow-[inset_4px_0_0_0_#C4843A] bg-amber-50/20'
                      : 'hover:shadow-soft-sm'
                  }`}
                >
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="vyro-metric text-base font-bold text-ink hover:text-copper transition-colors">
                        {o.poNumber}
                      </span>
                      <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-4">
                      <span className="flex items-center gap-1 text-ink-3">
                        <MapPinIcon size={12} className="text-copper" />
                        {o.deliveryCity
                          ? `${o.deliveryCity}${o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}`
                          : 'Commercial Dock Delivery'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <ClockIcon size={12} />
                        {new Date(o.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="text-[10px] uppercase font-mono tracking-wider text-ink-4">Total Amount</div>
                    <div className="vyro-metric text-base font-bold text-ink">{formatLKR(o.totalCents)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-line">
                    {isPendingStatus ? (
                      <>
                        <Button
                          size="sm"
                          variant="success"
                          loading={busyId === o.id}
                          onClick={() => void transition(o.id, 'accepted')}
                          className="gap-1 shadow-xs"
                        >
                          <CheckCircleIcon size={14} />
                          Accept PO
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === o.id}
                          onClick={() => void transition(o.id, 'rejected')}
                          title="Reject purchase order"
                        >
                          <XIcon size={14} />
                        </Button>
                      </>
                    ) : next ? (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busyId === o.id}
                        onClick={() => void transition(o.id, next)}
                        className="shadow-xs"
                      >
                        {NEXT_LABEL[next] ?? next}
                      </Button>
                    ) : null}

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveDrawerPoId(o.id)}
                      className="gap-1 text-xs"
                    >
                      <EyeIcon size={13} />
                      Quick View
                    </Button>

                    <Link to={`/orders/${o.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs">
                        Full Order →
                      </Button>
                    </Link>
                  </div>
                </Surface>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Order Detail Drawer */}
      {activeDrawerPoId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
          onClick={() => setActiveDrawerPoId(null)}
        >
          <div
            className="bg-paper border border-ink/20 rounded-md shadow-soft-xl max-w-2xl w-full p-6 space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {drawerQuery.isLoading ? (
              <p className="p-8 text-center text-sm text-ink-4">Loading order details…</p>
            ) : drawerQuery.data ? (
              <>
                <div className="flex items-start justify-between border-b border-line pb-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                      Purchase Order Specification
                    </div>
                    <h2 className="font-display text-xl font-bold text-ink mt-0.5">
                      {drawerQuery.data.order.poNumber}
                    </h2>
                    <div className="mt-1">
                      <StatusDots status={(drawerQuery.data.order.status as OrderStatus) ?? 'pending'} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDrawerPoId(null)}
                    className="p-1 text-ink-4 hover:text-ink transition-colors rounded"
                  >
                    <XIcon size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink">Ordered Line Items</div>
                  <div className="border border-line rounded overflow-hidden divide-y divide-line">
                    {drawerQuery.data.items.map((item) => (
                      <div key={item.id} className="p-3 flex items-center justify-between bg-paper hover:bg-mist/20 text-xs">
                        <div>
                          <div className="font-semibold text-ink">{item.productName}</div>
                          <div className="text-ink-4">
                            {item.quantity} {item.unit ?? 'units'} @ {formatLKR(item.unitPriceCents)}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-ink">{formatLKR(item.totalCents)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center p-3 bg-bone rounded border border-line">
                    <span className="text-xs font-bold text-ink">Order Net Total</span>
                    <span className="font-mono text-base font-bold text-ink">
                      {formatLKR(drawerQuery.data.order.totalCents)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-line">
                  <Link to={`/orders/${drawerQuery.data.order.id}`} className="text-xs text-copper hover:underline font-medium">
                    Open Full Order Page →
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => setActiveDrawerPoId(null)}>
                    Close
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
