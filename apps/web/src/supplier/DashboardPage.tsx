import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, StatusBadge } from '@/components/ui';
import { FlowLine, FlowCanvas } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import {
  PackageIcon,
  TruckIcon,
  StoreIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  SparklesIcon,
  MapPinIcon,
  ClockIcon,
  RefreshCwIcon,
  LayersIcon,
} from '@/components/icons';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierLoadingState, SupplierErrorState } from './SupplierPageState';

type Po = {
  id: string;
  poNumber?: string;
  status: string;
  totalCents: number;
  createdAt: number;
  deliveryCity?: string;
  deliveryDistrict?: string;
  businessId?: string;
};

type Payment = { id: string; amountCents: number; status: string };
type Customer = { businessId: string; totalOrders: number; totalCents: number };
type Offer = { id: string; availabilityStatus: string; minOrderQty: number; leadTimeDays: number; productId?: string };

interface SupplierProfile {
  id: string;
  name: string;
  city?: string;
  district?: string;
  address?: string;
  description?: string;
  verificationStatus?: string;
  status?: string;
}

const POLL_MS = 30_000;

export function SupplierDashboardPage() {
  const { supplierId, supplierName, role } = useSupplierId();
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'in_transit' | 'completed'>('all');
  const q = { retry: 1, refetchInterval: POLL_MS };

  // 1. Supplier Profile Details Query
  const profileQuery = useQuery({
    queryKey: ['supplier', supplierId, 'profile'],
    queryFn: () => api.get<{ supplier: SupplierProfile }>(`/suppliers/${supplierId}`),
    ...q,
  });

  // 2. Orders Query
  const ordersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Po[] }>(`/purchase-orders?supplierId=${supplierId}`),
    ...q,
  });

  // 3. Payments Query
  const paymentsQuery = useQuery({
    queryKey: ['supplier', supplierId, 'payments'],
    queryFn: () => api.get<{ items: Payment[] }>(`/payments?supplierId=${supplierId}`),
    ...q,
  });

  // 4. Customers Query
  const customersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/suppliers/${supplierId}/customers`),
    ...q,
  });

  // 5. Active Offers Query
  const offersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    ...q,
  });

  const supplierDetails = profileQuery.data?.supplier;
  const orderList = ordersQuery.data?.orders ?? [];
  const payList = paymentsQuery.data?.items ?? [];
  const custList = customersQuery.data?.items ?? [];
  const offerList = offersQuery.data?.offers ?? [];

  const isInitialLoading = profileQuery.isLoading && !profileQuery.data;
  const isFatalError = profileQuery.isError && !profileQuery.data && ordersQuery.isError && !ordersQuery.data;

  if (isInitialLoading) {
    return <SupplierLoadingState label="Connecting to wholesale supplier console…" />;
  }

  if (isFatalError) {
    return (
      <SupplierErrorState
        message="Unable to load supplier facility data. Please verify your connection or click retry."
        onRetry={() => {
          profileQuery.refetch();
          ordersQuery.refetch();
          paymentsQuery.refetch();
          offersQuery.refetch();
        }}
      />
    );
  }

  // Key operational metrics
  const pendingOrders = orderList.filter((o) =>
    ['pending', 'confirmed', 'accepted', 'preparing', 'ready_for_pickup'].includes(o.status)
  );
  const inTransitOrders = orderList.filter((o) =>
    ['dispatched', 'out_for_delivery', 'shipped'].includes(o.status)
  );
  const completedOrders = orderList.filter((o) =>
    ['delivered', 'received', 'completed'].includes(o.status)
  );

  const revenueCents = payList
    .filter((p) => p.status === 'completed' || p.status === 'paid')
    .reduce((s, p) => s + (p.amountCents ?? 0), 0);

  const lowStockCount = offerList.filter(
    (o) => o.availabilityStatus === 'low' || o.availabilityStatus === 'out_of_stock'
  ).length;

  // Filtered orders queue
  const filteredOrders = orderList
    .filter((o) => {
      if (orderFilter === 'pending') {
        return ['pending', 'confirmed', 'accepted', 'preparing', 'ready_for_pickup'].includes(o.status);
      }
      if (orderFilter === 'in_transit') {
        return ['dispatched', 'out_for_delivery', 'shipped'].includes(o.status);
      }
      if (orderFilter === 'completed') {
        return ['delivered', 'received', 'completed'].includes(o.status);
      }
      return true;
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 8);

  const handleRefresh = () => {
    profileQuery.refetch();
    ordersQuery.refetch();
    paymentsQuery.refetch();
    offersQuery.refetch();
    customersQuery.refetch();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Industrial Hero Header with High-Contrast Text on Ink */}
      <div className="bg-ink text-paper p-6 sm:p-8 relative overflow-hidden grain border border-paper/15 shadow-xl">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-volt/20 text-volt text-[10px] font-mono font-bold uppercase tracking-wider border border-volt/30">
                <span className="size-1.5 rounded-full bg-volt animate-pulse" />
                {supplierDetails?.verificationStatus === 'verified'
                  ? 'Verified Wholesale Hub'
                  : 'Audited Facility Registered'}
              </span>
              <span className="text-[11px] font-mono text-paper/60">
                Facility ID: <span className="text-paper/90">{supplierId.slice(0, 16)}</span>
              </span>
              <span className="text-[11px] font-mono text-paper/60 border-l border-paper/15 pl-2.5">
                Role: <span className="capitalize text-volt font-semibold">{role}</span>
              </span>
            </div>

            <h1 className="vyro-display text-3xl sm:text-4xl text-paper leading-tight">
              {supplierName || supplierDetails?.name || 'Wholesale Supplier Facility'}
            </h1>

            <div className="text-xs sm:text-sm text-paper/70 flex flex-wrap items-center gap-x-4 gap-y-1">
              {supplierDetails?.district && (
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon size={13} className="text-volt" />
                  {supplierDetails.city ? `${supplierDetails.city}, ` : ''}{supplierDetails.district} Terminal
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-paper/50">
                <ClockIcon size={13} /> Live operational sync · 30s auto-refresh
              </span>
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-1 text-paper/60 hover:text-volt transition-colors cursor-pointer text-xs"
                title="Refresh operational feeds"
              >
                <RefreshCwIcon size={12} className={profileQuery.isFetching ? 'animate-spin text-volt' : ''} />
                <span>Sync</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link to="/supplier/orders">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs font-semibold border-paper/20 hover:border-volt/50 transition-colors"
              >
                <StoreIcon size={13} className="mr-1.5" />
                Incoming Orders
                {pendingOrders.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-volt text-ink font-mono font-bold text-[10px]">
                    {pendingOrders.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/supplier/quotes">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs font-semibold border-paper/20 hover:border-volt/50 transition-colors"
              >
                Quote Requests
              </Button>
            </Link>
            <Link to="/supplier/products/new">
              <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs py-2.5 px-5 shadow-[0_0_24px_-4px_rgba(198,220,74,0.55)] transition-shadow hover:shadow-[0_0_32px_-2px_rgba(198,220,74,0.7)]">
                + Add Wholesale Product →
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Facility Activation Roadmap (Callout when 0 listings) */}
      {offerList.length === 0 && (
        <Surface kind="elevated" className="p-6 sm:p-8 space-y-6 border-l-4 border-l-volt">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-volt/25 text-ink flex items-center justify-center font-bold shrink-0">
                <SparklesIcon size={20} />
              </div>
              <div>
                <div className="vyro-kicker text-volt-deep">Facility Activation Checklist</div>
                <h2 className="font-display text-xl text-ink font-semibold mt-0.5">
                  Get your facility live on Sri Lanka's direct wholesale network
                </h2>
              </div>
            </div>
            <Link to="/supplier/products/new">
              <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs whitespace-nowrap">
                Publish First Product →
              </Button>
            </Link>
          </div>

          <p className="text-xs text-ink-3 leading-relaxed max-w-3xl">
            Commercial kitchens, supermarket chains, and regional grocers search VYRO daily for mill-direct rates. Complete these steps to receive automated purchase orders directly to your dispatch dock.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div className="p-4 bg-paper border border-ink/10 space-y-2 relative hover:border-ink/30 transition-colors">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 1</span>
              <h3 className="font-display text-sm font-semibold text-ink">List Products</h3>
              <p className="text-[11px] text-ink-4">Select rice, tea, sugar, oil, or packaging from catalog.</p>
              <Link to="/supplier/products/new" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Add Products →
              </Link>
            </div>

            <div className="p-4 bg-paper border border-ink/10 space-y-2 hover:border-ink/30 transition-colors">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 2</span>
              <h3 className="font-display text-sm font-semibold text-ink">Set Mill-Gate Rates</h3>
              <p className="text-[11px] text-ink-4">Configure unit prices & volume tiers in LKR.</p>
              <Link to="/supplier/pricing" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Configure Pricing →
              </Link>
            </div>

            <div className="p-4 bg-paper border border-ink/10 space-y-2 hover:border-ink/30 transition-colors">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 3</span>
              <h3 className="font-display text-sm font-semibold text-ink">Depot Inventory</h3>
              <p className="text-[11px] text-ink-4">Set stock status & dispatch turnaround hours (24-48h).</p>
              <Link to="/supplier/inventory" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Update Stock →
              </Link>
            </div>

            <div className="p-4 bg-paper border border-ink/10 space-y-2 hover:border-ink/30 transition-colors">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 4</span>
              <h3 className="font-display text-sm font-semibold text-ink">Settlement Bank</h3>
              <p className="text-[11px] text-ink-4">Link commercial bank account for automated payouts.</p>
              <Link to="/supplier/settings" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Link Payout Account →
              </Link>
            </div>
          </div>
        </Surface>
      )}

      {/* Operational Lifecycle Pipeline */}
      <Surface kind="ink" className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono text-paper/60 uppercase tracking-wider">
            Facility Order Fulfillment Pipeline
          </div>
          <div className="text-[11px] font-mono text-paper/40">
            {pendingOrders.length} pending · {inTransitOrders.length} en route
          </div>
        </div>
        <FlowLine
          tone="paper"
          nodes={[
            {
              label: 'Catalog Offering',
              hint: offerList.length > 0 ? `${offerList.length} SKUs published` : 'Pending setup',
              state: offerList.length > 0 ? 'done' : 'idle',
            },
            {
              label: 'Mill-Gate Pricing',
              hint: offerList.length > 0 ? 'Live in LKR' : 'Awaiting rate card',
              state: offerList.length > 0 ? 'done' : 'idle',
            },
            {
              label: 'Depot Staging',
              hint: lowStockCount > 0 ? `${lowStockCount} stock warnings` : 'Depot active',
              state: offerList.length > 0 ? 'done' : 'idle',
            },
            {
              label: 'Incoming POs',
              hint: pendingOrders.length > 0 ? `${pendingOrders.length} require staging` : 'Queue clear',
              state: pendingOrders.length > 0 ? 'active' : orderList.length > 0 ? 'done' : 'idle',
            },
            {
              label: 'Dock GRN & Payout',
              hint: payList.length > 0 ? formatCompactLKR(revenueCents) : 'Automated bank payout',
              state: payList.length > 0 ? 'done' : 'idle',
            },
          ]}
        />
      </Surface>

      {/* 4 Executive KPI Tiles */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/supplier/orders"
          className="p-6 bg-paper border border-ink/10 hover:border-ink transition-all group block shadow-sm hover:shadow-md"
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-ink-4 group-hover:text-copper">
            <span>Incoming POs</span>
            <StoreIcon size={14} />
          </div>
          <MetricNumber size="lg" className={`mt-3 ${pendingOrders.length > 0 ? 'text-copper font-bold' : 'text-ink'}`}>
            {pendingOrders.length}
          </MetricNumber>
          <span className="text-[11px] text-ink-4 mt-1 block">
            {pendingOrders.length === 1 ? '1 PO awaiting dispatch staging' : `${pendingOrders.length} POs awaiting dispatch staging`}
          </span>
        </Link>

        <Link
          to="/supplier/deliveries"
          className="p-6 bg-paper border border-ink/10 hover:border-ink transition-all group block shadow-sm hover:shadow-md"
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-ink-4 group-hover:text-volt-deep">
            <span>In Freight Transit</span>
            <TruckIcon size={14} />
          </div>
          <MetricNumber size="lg" className="mt-3 text-ink">
            {inTransitOrders.length}
          </MetricNumber>
          <span className="text-[11px] text-ink-4 mt-1 block">
            {inTransitOrders.length === 1 ? '1 consignment en route' : `${inTransitOrders.length} consignments en route`}
          </span>
        </Link>

        <Link
          to="/supplier/payments"
          className="p-6 bg-paper border border-ink/10 hover:border-ink transition-all group block shadow-sm hover:shadow-md"
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-ink-4 group-hover:text-copper">
            <span>Settled Revenue</span>
            <ShieldCheckIcon size={14} />
          </div>
          <MetricNumber size="lg" className="mt-3 text-ink">
            {formatCompactLKR(revenueCents)}
          </MetricNumber>
          <span className="text-[11px] text-ink-4 mt-1 block">
            {revenueCents === 0 ? 'Settles upon GRN confirmation' : formatLKR(revenueCents)}
          </span>
        </Link>

        <Link
          to="/supplier/products"
          className="p-6 bg-paper border border-ink/10 hover:border-ink transition-all group block shadow-sm hover:shadow-md"
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-ink-4 group-hover:text-volt-deep">
            <span>Active Listings</span>
            <PackageIcon size={14} />
          </div>
          <MetricNumber size="lg" className="mt-3 text-ink">
            {offerList.length}
          </MetricNumber>
          <span className="text-[11px] text-ink-4 mt-1 block">
            {lowStockCount > 0 ? `${lowStockCount} stock warnings` : 'All warehouse stock active'}
          </span>
        </Link>
      </div>

      {/* Incoming Purchase Orders Queue */}
      <Surface kind="flat" className="p-0 overflow-hidden border border-ink/10 shadow-sm">
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 bg-mist/20">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl text-ink font-semibold">Incoming Purchase Orders</h2>
            <span className="px-2.5 py-0.5 text-[10px] font-mono bg-mist text-ink border border-line font-bold">
              {orderList.length} Total
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center border border-ink/15 bg-paper p-0.5 text-xs">
              <button
                onClick={() => setOrderFilter('all')}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  orderFilter === 'all' ? 'bg-ink text-paper font-semibold' : 'text-ink-3 hover:text-ink'
                }`}
              >
                All ({orderList.length})
              </button>
              <button
                onClick={() => setOrderFilter('pending')}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  orderFilter === 'pending' ? 'bg-ink text-paper font-semibold' : 'text-ink-3 hover:text-ink'
                }`}
              >
                Pending ({pendingOrders.length})
              </button>
              <button
                onClick={() => setOrderFilter('in_transit')}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  orderFilter === 'in_transit' ? 'bg-ink text-paper font-semibold' : 'text-ink-3 hover:text-ink'
                }`}
              >
                In Transit ({inTransitOrders.length})
              </button>
              <button
                onClick={() => setOrderFilter('completed')}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  orderFilter === 'completed' ? 'bg-ink text-paper font-semibold' : 'text-ink-3 hover:text-ink'
                }`}
              >
                Delivered ({completedOrders.length})
              </button>
            </div>

            <Link to="/supplier/orders" className="text-xs text-copper font-semibold hover:underline ml-2">
              Dispatch Console →
            </Link>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="size-14 mx-auto bg-mist flex items-center justify-center text-ink-4 border border-ink/10">
              <PackageIcon size={26} />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base text-ink font-semibold">
                {orderFilter === 'all'
                  ? 'No purchase orders in queue'
                  : `No orders currently matching "${orderFilter.replace('_', ' ')}"`}
              </h3>
              <p className="text-xs text-ink-4 max-w-md mx-auto leading-relaxed">
                {orderFilter === 'all'
                  ? 'When commercial buyers place wholesale purchase orders against your catalog items, they will appear here with instant dispatch and GRN tracking.'
                  : 'Try switching filters to view other operational stages.'}
              </p>
            </div>
            {offerList.length === 0 ? (
              <div className="pt-2">
                <Link to="/supplier/products/new">
                  <Button size="sm" className="bg-volt text-ink hover:bg-volt-glow text-xs uppercase font-bold tracking-wider">
                    + Add Wholesale Product Quote
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4 border-b border-ink/5 bg-mist/40">
                <tr>
                  <th className="text-left px-6 py-3.5 font-normal">PO Number</th>
                  <th className="text-left px-6 py-3.5 font-normal">Status</th>
                  <th className="text-left px-6 py-3.5 font-normal">Destination Terminal</th>
                  <th className="text-right px-6 py-3.5 font-normal">Gross Amount</th>
                  <th className="text-right px-6 py-3.5 font-normal">Operation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-mist/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs font-bold text-ink">
                      {o.poNumber || o.id.slice(0, 12)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-6 py-4 text-xs text-ink-3">
                      {o.deliveryCity ? `${o.deliveryCity}, ${o.deliveryDistrict ?? ''}` : 'Standard Commercial Dock'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs font-semibold text-ink">
                      {formatLKR(o.totalCents ?? 0)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to="/supplier/orders"
                        className="text-xs text-copper font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        Manage Dispatch <ArrowRightIcon size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* Operational Quick Action Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/supplier/products"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm group"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm group-hover:text-copper transition-colors">
            <PackageIcon size={16} className="text-copper" />
            <span>Product Catalog</span>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            Add staple commodities, manage wholesale SKUs, and upload high-res packaging photos.
          </p>
          <span className="text-xs text-copper font-semibold inline-flex items-center gap-1 pt-1">
            Manage Catalog <ArrowRightIcon size={12} />
          </span>
        </Link>

        <Link
          to="/supplier/pricing"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm group"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm group-hover:text-volt-deep transition-colors">
            <SparklesIcon size={16} className="text-volt-deep" />
            <span>Pricing & MOQs</span>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            Configure mill-gate pricing, bulk discount brackets, and minimum order requirements.
          </p>
          <span className="text-xs text-copper font-semibold inline-flex items-center gap-1 pt-1">
            Configure Tiers <ArrowRightIcon size={12} />
          </span>
        </Link>

        <Link
          to="/supplier/deliveries"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm group"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm group-hover:text-copper transition-colors">
            <TruckIcon size={16} className="text-copper" />
            <span>Fleet & Logistics</span>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            Assign delivery drivers, register truck license plates, and track electronic GRN receipts.
          </p>
          <span className="text-xs text-copper font-semibold inline-flex items-center gap-1 pt-1">
            Dispatch Staging <ArrowRightIcon size={12} />
          </span>
        </Link>

        <Link
          to="/supplier/payments"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm group"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm group-hover:text-volt-deep transition-colors">
            <ShieldCheckIcon size={16} className="text-volt-deep" />
            <span>Payouts & SVAT</span>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            Review completed order settlements, download digital tax invoices, and manage bank accounts.
          </p>
          <span className="text-xs text-copper font-semibold inline-flex items-center gap-1 pt-1">
            View Settlement <ArrowRightIcon size={12} />
          </span>
        </Link>
      </div>

      {/* Footer Status Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-ink-4 pt-4 border-t border-ink/10 gap-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-volt inline-block" />
          <span>VYRO Wholesale Supplier Operations · Secure Commercial Console</span>
        </div>
        <div className="font-mono text-[11px]">
          {custList.length} commercial {custList.length === 1 ? 'buyer account' : 'buyer accounts'} on record
        </div>
      </div>
    </div>
  );
}
