import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, PageHeader, StatusDots, Input, Badge } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import {
  CheckCircleIcon,
  XIcon,
  PackageIcon,
  SearchIcon,
  ArrowRightIcon,
  EyeIcon,
  ClockIcon,
  MapPinIcon,
  RefreshCwIcon,
  TruckIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  StoreIcon,
} from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { useSupplierId } from '@/supplier/useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from '@/supplier/SupplierPageState';

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

type Offer = {
  id: string;
  productId: string;
  active: boolean;
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

  const offersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: !!supplierId,
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

  const handleRefresh = async () => {
    toast.info('Syncing orders with network…');
    await ordersQuery.refetch();
    toast.success('Orders up to date');
  };

  const orders = ordersQuery.data?.orders ?? [];
  const offers = offersQuery.data?.offers ?? [];

  const pending = useMemo(() => orders.filter((o) => o.status === 'pending'), [orders]);
  const inFulfillment = useMemo(
    () => orders.filter((o) => ['accepted', 'preparing', 'ready_for_pickup'].includes(o.status)),
    [orders],
  );
  const inTransit = useMemo(
    () => orders.filter((o) => o.status === 'out_for_delivery'),
    [orders],
  );
  const done = useMemo(
    () => orders.filter((o) => ['delivered', 'completed', 'rejected', 'cancelled'].includes(o.status)),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let base = orders;
    if (tab === 'incoming') base = pending;
    else if (tab === 'fulfillment') base = [...inFulfillment, ...inTransit];
    else if (tab === 'completed') base = done;

    if (!searchQuery) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (o) =>
        o.poNumber.toLowerCase().includes(q) ||
        o.deliveryCity?.toLowerCase().includes(q) ||
        o.deliveryDistrict?.toLowerCase().includes(q),
    );
  }, [orders, tab, pending, inFulfillment, inTransit, done, searchQuery]);

  const revenue = orders.reduce((a, b) => a + b.totalCents, 0);

  if (ordersQuery.isLoading) return <SupplierLoadingState label="Connecting to order console" />;
  if (ordersQuery.isError) {
    return (
      <SupplierErrorState
        message="Could not load purchase orders."
        onRetry={() => void ordersQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            {supplierName} / Fulfillment Desk
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Purchase Orders Console
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Accept commercial POs, manage preparation queues, and dispatch delivery freight.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-800/20 text-xs font-mono">
            <span className="size-2 rounded-full bg-emerald-600 animate-pulse" />
            Live Sync (30s)
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={ordersQuery.isFetching}
            className="text-xs gap-1.5"
            title="Refresh order queue"
          >
            <RefreshCwIcon size={14} className={ordersQuery.isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link to="/supplier/products/new">
            <Button variant="primary" size="sm" className="bg-volt text-ink hover:bg-volt-glow font-bold gap-1 shadow-soft-sm">
              + Publish Listing
            </Button>
          </Link>
        </div>
      </header>

      {/* Harmonious Executive KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden rounded-lg shadow-soft-sm">
        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <ShoppingCartIcon size={13} className="text-copper" />
              Incoming POs
            </span>
            {pending.length > 0 ? (
              <Badge variant="warning" className="text-[10px] font-mono">
                {pending.length} Action Req.
              </Badge>
            ) : (
              <span className="text-[10px] text-emerald-700 font-mono">Queue Clear</span>
            )}
          </div>
          <MetricNumber size="md" className="text-ink">
            {pending.length}
          </MetricNumber>
          <div className="text-xs text-ink-4">Awaiting acceptance</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <ClockIcon size={13} className="text-copper" />
              In Fulfillment
            </span>
            <span className="text-[10px] text-ink-4 font-mono">Preparing</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {inFulfillment.length}
          </MetricNumber>
          <div className="text-xs text-ink-4">Pack & stage at depot</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <TruckIcon size={13} className="text-copper" />
              Out for Delivery
            </span>
            <span className="text-[10px] text-ink-4 font-mono">In Transit</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {inTransit.length}
          </MetricNumber>
          <div className="text-xs text-ink-4">En route with driver</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <TrendingUpIcon size={13} className="text-copper" />
              Order Book Revenue
            </span>
            <span className="text-[10px] text-ink-4 font-mono">Total Net</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {formatCompactLKR(revenue)}
          </MetricNumber>
          <div className="text-xs font-mono text-ink-4 truncate">
            {formatLKR(revenue)}
          </div>
        </div>
      </div>

      {/* Fulfillment Pipeline Radar Card */}
      <Surface kind="elevated" className="p-6 border border-ink/10 shadow-soft-sm rounded-lg space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="text-xs font-mono uppercase tracking-wider font-bold text-ink flex items-center gap-2">
            <span className="size-2 rounded-full bg-volt" />
            Wholesale Fulfillment Stage Radar
          </div>
          <span className="text-xs text-ink-4 font-mono">
            {orders.length} Total Orders Logged
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`p-3.5 rounded border transition-colors ${
            pending.length > 0
              ? 'border-amber/40 bg-amber-50/50'
              : 'border-line bg-paper'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                1. Incoming
              </span>
              <span className={`size-2 rounded-full ${pending.length > 0 ? 'bg-amber animate-pulse' : 'bg-ink/20'}`} />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-ink">{pending.length}</div>
            <div className="text-[11px] text-ink-4 mt-0.5">Awaiting depot review</div>
          </div>

          <div className={`p-3.5 rounded border transition-colors ${
            orders.filter((o) => o.status === 'accepted').length > 0
              ? 'border-emerald-800/30 bg-emerald-50/40'
              : 'border-line bg-paper'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                2. Accepted
              </span>
              <span className={`size-2 rounded-full ${orders.filter((o) => o.status === 'accepted').length > 0 ? 'bg-emerald-600' : 'bg-ink/20'}`} />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-ink">
              {orders.filter((o) => o.status === 'accepted').length}
            </div>
            <div className="text-[11px] text-ink-4 mt-0.5">Confirmed & queued</div>
          </div>

          <div className={`p-3.5 rounded border transition-colors ${
            orders.filter((o) => ['preparing', 'ready_for_pickup'].includes(o.status)).length > 0
              ? 'border-volt-deep/30 bg-volt-soft/40'
              : 'border-line bg-paper'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                3. Preparing
              </span>
              <span className={`size-2 rounded-full ${orders.filter((o) => ['preparing', 'ready_for_pickup'].includes(o.status)).length > 0 ? 'bg-volt-deep' : 'bg-ink/20'}`} />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-ink">
              {orders.filter((o) => ['preparing', 'ready_for_pickup'].includes(o.status)).length}
            </div>
            <div className="text-[11px] text-ink-4 mt-0.5">Packaging & loading</div>
          </div>

          <div className={`p-3.5 rounded border transition-colors ${
            inTransit.length > 0
              ? 'border-copper/40 bg-copper-soft/30'
              : 'border-line bg-paper'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                4. Dispatched
              </span>
              <span className={`size-2 rounded-full ${inTransit.length > 0 ? 'bg-copper' : 'bg-ink/20'}`} />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-ink">{inTransit.length}</div>
            <div className="text-[11px] text-ink-4 mt-0.5">With freight carrier</div>
          </div>
        </div>
      </Surface>

      {/* Tabs & Search Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {[
              { id: 'all', label: 'All Orders', count: orders.length },
              { id: 'incoming', label: 'Incoming', count: pending.length },
              { id: 'fulfillment', label: 'In Fulfillment', count: inFulfillment.length + inTransit.length },
              { id: 'completed', label: 'Completed', count: done.length },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3.5 py-1.5 text-xs font-mono tracking-wider transition-colors border rounded ${
                  tab === t.id
                    ? 'bg-ink text-paper border-ink font-semibold shadow-xs'
                    : 'bg-paper text-ink-3 border-ink/10 hover:bg-mist/60'
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PO#, city, district…"
              className="pl-9 text-xs"
            />
          </div>
        </div>

        {/* PO Table or Order Readiness Center Empty State */}
        {filteredOrders.length === 0 ? (
          <Surface kind="elevated" className="overflow-hidden border border-ink/10 p-8 sm:p-12 text-center rounded-lg shadow-soft-sm">
            {searchQuery ? (
              <div className="space-y-2 py-4">
                <SearchIcon size={32} className="mx-auto text-ink-4 opacity-50" />
                <p className="text-sm font-semibold text-ink">No purchase orders matched your search</p>
                <p className="text-xs text-ink-4">Try clearing the search query or changing filter tabs.</p>
                <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="mt-2 text-xs">
                  Clear Search
                </Button>
              </div>
            ) : offers.length === 0 ? (
              /* Scenario A: No products listed yet */
              <div className="max-w-lg mx-auto space-y-4 py-4">
                <div className="size-14 rounded-full bg-amber-50 border border-amber/30 text-amber mx-auto flex items-center justify-center shadow-xs">
                  <PackageIcon size={24} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display text-lg font-bold text-ink">
                    Depot Catalog Is Not Published Yet
                  </h3>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Commercial retail and restaurant buyers cannot place purchase orders until you publish wholesale commodities with prices and minimum order quantities.
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-3">
                  <Link to="/supplier/products/new">
                    <Button variant="primary" className="bg-volt text-ink hover:bg-volt-glow font-bold gap-1.5">
                      + Publish Your First Product →
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              /* Scenario B: Products listed, depot active, waiting for incoming orders */
              <div className="max-w-xl mx-auto space-y-6 py-2">
                <div className="size-14 rounded-full bg-emerald-50 border border-emerald-800/20 text-emerald-800 mx-auto flex items-center justify-center shadow-xs">
                  <CheckCircleIcon size={24} />
                </div>
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100/60 text-emerald-900 font-mono text-[11px] font-semibold">
                    <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Depot Active & Listening
                  </div>
                  <h3 className="font-display text-lg font-bold text-ink">
                    Order Queue Is Currently Clear
                  </h3>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Your wholesale listings are live. When commercial buyers checkout on the Vyro network, purchase orders arrive here automatically with verified line items and escrow funding.
                  </p>
                </div>

                {/* 3-Step Lifecycle Infographic */}
                <div className="grid sm:grid-cols-3 gap-3 text-left pt-2">
                  <div className="p-3.5 bg-mist/20 border border-line rounded space-y-1">
                    <div className="text-[10px] font-mono text-copper font-bold uppercase">Step 1</div>
                    <div className="text-xs font-semibold text-ink">Buyer Places PO</div>
                    <p className="text-[11px] text-ink-4">Consignment quantities & dock address verified.</p>
                  </div>
                  <div className="p-3.5 bg-mist/20 border border-line rounded space-y-1">
                    <div className="text-[10px] font-mono text-copper font-bold uppercase">Step 2</div>
                    <div className="text-xs font-semibold text-ink">Accept & Stage</div>
                    <p className="text-[11px] text-ink-4">1-click order acceptance & warehouse prep.</p>
                  </div>
                  <div className="p-3.5 bg-mist/20 border border-line rounded space-y-1">
                    <div className="text-[10px] font-mono text-copper font-bold uppercase">Step 3</div>
                    <div className="text-xs font-semibold text-ink">Dispatch & Payout</div>
                    <p className="text-[11px] text-ink-4">Assign carrier driver & release funds to bank.</p>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap justify-center gap-3">
                  <Link to="/supplier/products">
                    <Button variant="secondary" size="sm">
                      Manage {offers.length} Published Product{offers.length === 1 ? '' : 's'}
                    </Button>
                  </Link>
                  <Link to="/search">
                    <Button variant="ghost" size="sm" className="gap-1 text-xs">
                      View Marketplace Storefront →
                    </Button>
                  </Link>
                </div>
              </div>
            )}
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
                  className={`p-5 flex flex-col md:flex-row md:items-center gap-4 transition-all rounded-lg border border-ink/10 ${
                    isPendingStatus
                      ? 'shadow-[inset_4px_0_0_0_#C4843A] bg-amber-50/25 border-amber/30'
                      : 'hover:shadow-soft-sm'
                  }`}
                >
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="vyro-metric text-base font-bold text-ink hover:text-copper transition-colors">
                        {o.poNumber}
                      </span>
                      <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                      {isPendingStatus && (
                        <Badge variant="warning" className="text-[10px] font-mono uppercase">
                          Action Required
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-4">
                      <span className="flex items-center gap-1 text-ink-3">
                        <MapPinIcon size={12} className="text-copper" />
                        {o.deliveryCity
                          ? `${o.deliveryCity}${o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}`
                          : 'Commercial Dock Delivery'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 font-mono">
                        <ClockIcon size={12} />
                        {new Date(o.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-left md:text-right shrink-0">
                    <div className="text-[10px] uppercase font-mono tracking-wider text-ink-4">Total Net</div>
                    <div className="vyro-metric text-base font-bold text-ink">{formatLKR(o.totalCents)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-line shrink-0">
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
                        Invoice →
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs text-left"
          onClick={() => setActiveDrawerPoId(null)}
        >
          <div
            className="bg-paper border border-ink/20 rounded-lg shadow-soft-xl max-w-2xl w-full p-6 sm:p-8 space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto"
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
                    <div className="mt-1.5">
                      <StatusDots status={(drawerQuery.data.order.status as OrderStatus) ?? 'pending'} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDrawerPoId(null)}
                    className="p-1.5 text-ink-4 hover:text-ink transition-colors rounded-md hover:bg-mist"
                  >
                    <XIcon size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink">Ordered Line Items</div>
                  <div className="border border-line rounded-md overflow-hidden divide-y divide-line">
                    {drawerQuery.data.items.map((item) => (
                      <div key={item.id} className="p-3.5 flex items-center justify-between bg-paper hover:bg-mist/20 text-xs">
                        <div>
                          <div className="font-semibold text-ink text-sm">{item.productName}</div>
                          <div className="text-ink-4 mt-0.5">
                            {item.quantity} {item.unit ?? 'units'} @ {formatLKR(item.unitPriceCents)}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-ink text-sm">{formatLKR(item.totalCents)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center p-4 bg-bone rounded-md border border-line">
                    <span className="text-xs font-bold text-ink">Order Net Total</span>
                    <span className="font-mono text-lg font-bold text-ink">
                      {formatLKR(drawerQuery.data.order.totalCents)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line">
                  <Link to={`/orders/${drawerQuery.data.order.id}`} className="text-xs text-copper hover:underline font-semibold flex items-center gap-1">
                    <span>Open Full Legal Order & Invoicing</span>
                    <ArrowRightIcon size={12} />
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
