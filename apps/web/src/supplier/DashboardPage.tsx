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
  CheckCircle2Icon,
  AlertTriangleIcon,
  BanknoteIcon,
  UsersIcon,
  FileTextIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierLoadingState, SupplierErrorState } from './SupplierPageState';
import { cn } from '@vyro/ui';

type Po = {
  id: string;
  poNumber?: string;
  status: string;
  totalCents: number;
  createdAt: number;
  deliveryCity?: string;
  deliveryDistrict?: string;
  businessId?: string;
  itemCount?: number;
};

type Payment = { id: string; amountCents: number; status: string; createdAt?: number };
type Customer = { businessId: string; totalOrders: number; totalCents: number; name?: string };
type Offer = {
  id: string;
  availabilityStatus: string;
  minOrderQty: number;
  leadTimeDays: number;
  productId?: string;
  productName?: string;
  productImage?: string | null;
  unitsSold?: number;
  revenueCents?: number;
};

interface SupplierProfile {
  id: string;
  name: string;
  city?: string;
  district?: string;
  address?: string;
  description?: string;
  verificationStatus?: string;
  status?: string;
  businessTypeName?: string;
}

const POLL_MS = 30_000;

export function SupplierDashboardPage() {
  const { supplierId, supplierName, role } = useSupplierId();
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'in_transit' | 'completed'>('all');
  const q = { retry: 1, refetchInterval: POLL_MS };

  // 1. Supplier Profile
  const profileQuery = useQuery({
    queryKey: ['supplier', supplierId, 'profile'],
    queryFn: () => api.get<{ supplier: SupplierProfile }>(`/suppliers/${supplierId}`),
    ...q,
  });

  // 2. Orders
  const ordersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Po[] }>(`/purchase-orders?supplierId=${supplierId}`),
    ...q,
  });

  // 3. Payments
  const paymentsQuery = useQuery({
    queryKey: ['supplier', supplierId, 'payments'],
    queryFn: () => api.get<{ items: Payment[] }>(`/payments?supplierId=${supplierId}`),
    ...q,
  });

  // 4. Customers
  const customersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/suppliers/${supplierId}/customers`),
    ...q,
  });

  // 5. Offers / Catalog
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

  // Operational metrics
  const pendingOrders = orderList.filter((o) =>
    ['pending', 'confirmed', 'accepted', 'preparing', 'ready_for_pickup'].includes(o.status),
  );
  const inTransitOrders = orderList.filter((o) =>
    ['dispatched', 'out_for_delivery', 'shipped'].includes(o.status),
  );
  const completedOrders = orderList.filter((o) =>
    ['delivered', 'received', 'completed'].includes(o.status),
  );
  const disputedOrders = orderList.filter((o) => o.status === 'disputed');

  const revenueCents = payList
    .filter((p) => p.status === 'completed' || p.status === 'paid')
    .reduce((s, p) => s + (p.amountCents ?? 0), 0);

  const pipelineValueCents = orderList
    .filter((o) => !['cancelled', 'rejected', 'expired'].includes(o.status))
    .reduce((s, o) => s + (o.totalCents ?? 0), 0);

  const lowStockCount = offerList.filter(
    (o) => o.availabilityStatus === 'low' || o.availabilityStatus === 'out_of_stock',
  ).length;
  const outOfStockCount = offerList.filter((o) => o.availabilityStatus === 'out_of_stock').length;
  const activeOffers = offerList.filter((o) => o.availabilityStatus === 'in_stock').length;

  // Top customers (by total revenue)
  const topCustomers = useMemo(
    () => [...custList].sort((a, b) => (b.totalCents ?? 0) - (a.totalCents ?? 0)).slice(0, 5),
    [custList],
  );

  // Top products (revenue)
  const topProducts = useMemo(
    () => [...offerList].sort((a, b) => (b.revenueCents ?? 0) - (a.revenueCents ?? 0)).slice(0, 5),
    [offerList],
  );

  // Filtered orders queue
  const filteredOrders = useMemo(
    () =>
      orderList
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
        .slice(0, 8),
    [orderList, orderFilter],
  );

  const handleRefresh = () => {
    profileQuery.refetch();
    ordersQuery.refetch();
    paymentsQuery.refetch();
    offersQuery.refetch();
    customersQuery.refetch();
  };

  const isVerified = supplierDetails?.verificationStatus === 'verified';

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* KYC Callout (when not verified) */}
      {supplierDetails?.verificationStatus !== 'verified' && (
        <KycCallout status={supplierDetails?.verificationStatus ?? 'pending'} />
      )}

      {/* Industrial Hero Header */}
      <div className="bg-ink text-paper p-6 sm:p-8 relative overflow-hidden grain border border-paper/15 shadow-xl">
        <div className="absolute inset-0 opacity-25 pointer-events-none">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border',
                  isVerified
                    ? 'bg-mint/20 text-mint border-mint/30'
                    : 'bg-volt/20 text-volt border-volt/30',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full animate-pulse',
                    isVerified ? 'bg-mint' : 'bg-volt',
                  )}
                />
                {isVerified ? 'Verified Wholesale Hub' : 'Audited Facility Registered'}
              </span>
              <span className="text-[11px] font-mono text-paper/60 hidden sm:inline">
                Facility ID: <span className="text-paper/90">{supplierId.slice(0, 16)}</span>
              </span>
              <span className="text-[11px] font-mono text-paper/60 border-l border-paper/15 pl-2.5 hidden sm:inline">
                Role: <span className="capitalize text-volt font-semibold">{role}</span>
              </span>
            </div>

            <h1 className="vyro-display text-4xl sm:text-5xl text-paper leading-[0.95] tracking-tight">
              {supplierName || supplierDetails?.name || 'Wholesale Supplier Facility'}
            </h1>

            <div className="text-xs sm:text-sm text-paper/70 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {supplierDetails?.district && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon size={13} className="text-volt" />
                  {supplierDetails.city ? `${supplierDetails.city}, ` : ''}
                  {supplierDetails.district} Terminal
                </span>
              )}
              {supplierDetails?.businessTypeName && (
                <span className="inline-flex items-center gap-1.5 text-paper/50">
                  <LayersIcon size={13} />
                  {supplierDetails.businessTypeName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-paper/50">
                <ClockIcon size={13} /> Live sync · 30s
              </span>
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 text-paper/60 hover:text-volt transition-colors cursor-pointer"
                title="Refresh operational feeds"
              >
                <RefreshCwIcon
                  size={12}
                  className={profileQuery.isFetching ? 'animate-spin text-volt' : ''}
                />
                <span>Sync</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link to="/supplier/orders">
              <Button
                variant="secondary"
                size="sm"
                className="bg-paper/10 text-paper border-paper/20 hover:bg-paper/15 hover:border-volt/50 text-xs font-semibold"
              >
                <PackageIcon size={13} />
                <span>Dispatch Console</span>
                {pendingOrders.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-volt text-ink font-mono font-bold text-[10px]">
                    {pendingOrders.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/supplier/products/new">
              <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs py-2.5 px-5 shadow-[0_0_24px_-4px_rgba(198,220,74,0.55)]">
                + Add Wholesale Product
                <ArrowRightIcon size={14} />
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick stat strip in hero */}
        <div className="relative z-10 mt-6 pt-5 border-t border-paper/15 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <HeroStat
            label="Active Listings"
            value={String(offerList.length)}
            sub={lowStockCount > 0 ? `${lowStockCount} low / out` : `${activeOffers} in stock`}
            tone="volt"
          />
          <HeroStat
            label="Pipeline Value"
            value={formatCompactLKR(pipelineValueCents)}
            sub={`${orderList.length} POs this period`}
            tone="paper"
          />
          <HeroStat
            label="Pending Dispatch"
            value={String(pendingOrders.length)}
            sub={pendingOrders.length === 0 ? 'All clear' : 'Awaiting action'}
            tone={pendingOrders.length > 0 ? 'amber' : 'mint'}
          />
          <HeroStat
            label="Settled Revenue"
            value={formatCompactLKR(revenueCents)}
            sub={payList.length === 0 ? 'Awaiting payouts' : `${payList.length} payments`}
            tone="mint"
          />
        </div>
      </div>

      {/* Facility Activation Roadmap (when 0 listings) */}
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
            <ActivationStep
              n={1}
              title="List Products"
              hint="Select rice, tea, sugar, oil, or packaging from catalog."
              cta="Add Products"
              to="/supplier/products/new"
            />
            <ActivationStep
              n={2}
              title="Set Mill-Gate Rates"
              hint="Configure unit prices & volume tiers in LKR."
              cta="Configure Pricing"
              to="/supplier/pricing"
            />
            <ActivationStep
              n={3}
              title="Depot Inventory"
              hint="Set stock status & dispatch turnaround hours."
              cta="Update Stock"
              to="/supplier/inventory"
            />
            <ActivationStep
              n={4}
              title="Settlement Bank"
              hint="Link commercial bank account for automated payouts."
              cta="Link Payout Account"
              to="/supplier/settings"
            />
          </div>
        </Surface>
      )}

      {/* Operational Lifecycle Pipeline */}
      <Surface kind="ink" className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono text-volt uppercase tracking-wider font-bold">
              Facility Order Fulfillment Pipeline
            </div>
            <h2 className="font-display text-lg text-paper font-semibold mt-0.5">
              End-to-end dock-to-payout lifecycle
            </h2>
          </div>
          <div className="text-[11px] font-mono text-paper/60 hidden sm:block">
            {pendingOrders.length} pending · {inTransitOrders.length} en route · {completedOrders.length} delivered
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
        {/* Pipeline stage cards beneath flow line */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
          <PipelineStat
            label="Active SKUs"
            value={String(offerList.length)}
            tone={offerList.length > 0 ? 'mint' : 'amber'}
          />
          <PipelineStat
            label="Stock warnings"
            value={String(lowStockCount)}
            tone={lowStockCount > 0 ? 'rose' : 'mint'}
            sub={outOfStockCount > 0 ? `${outOfStockCount} out of stock` : 'All healthy'}
          />
          <PipelineStat
            label="In staging"
            value={String(pendingOrders.length)}
            tone={pendingOrders.length > 0 ? 'amber' : 'mint'}
          />
          <PipelineStat
            label="In transit"
            value={String(inTransitOrders.length)}
            tone={inTransitOrders.length > 0 ? 'copper' : 'paper'}
          />
          <PipelineStat
            label="Delivered"
            value={String(completedOrders.length)}
            tone={completedOrders.length > 0 ? 'volt' : 'paper'}
          />
        </div>
      </Surface>

      {/* 4 Executive KPI Tiles */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          to="/supplier/orders"
          label="Incoming POs"
          value={pendingOrders.length}
          sub={pendingOrders.length === 1 ? '1 awaiting dispatch' : `${pendingOrders.length} awaiting dispatch`}
          icon={<StoreIcon size={16} />}
          accent={pendingOrders.length > 0 ? 'copper' : 'ink'}
          footer={inTransitOrders.length > 0 ? `${inTransitOrders.length} en route` : 'No en-route'}
        />
        <KpiTile
          to="/supplier/deliveries"
          label="In Freight Transit"
          value={inTransitOrders.length}
          sub={inTransitOrders.length === 1 ? '1 consignment en route' : `${inTransitOrders.length} consignments en route`}
          icon={<TruckIcon size={16} />}
          accent="volt"
          footer="Live truck tracking"
        />
        <KpiTile
          to="/supplier/payments"
          label="Settled Revenue"
          value={revenueCents}
          isCurrency
          sub={revenueCents === 0 ? 'Settles upon GRN' : `${payList.length} payment${payList.length === 1 ? '' : 's'}`}
          icon={<ShieldCheckIcon size={16} />}
          accent="mint"
          footer="Automated bank payout"
        />
        <KpiTile
          to="/supplier/products"
          label="Active Listings"
          value={offerList.length}
          sub={lowStockCount > 0 ? `${lowStockCount} stock warnings` : 'All warehouse stock active'}
          icon={<PackageIcon size={16} />}
          accent="amber"
          footer={`${activeOffers} in stock`}
        />
      </div>

      {/* Two-column: Incoming orders table + Top customers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Incoming Purchase Orders */}
        <Surface kind="flat" className="lg:col-span-8 p-0 overflow-hidden border border-ink/10 shadow-sm">
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 bg-mist/20">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-lg bg-ink text-volt flex items-center justify-center shrink-0">
                <PackageIcon size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-lg text-ink font-semibold leading-tight">
                  Incoming Purchase Orders
                </h2>
                <p className="text-[11px] text-ink-4 mt-0.5">
                  Latest wholesale buyer POs routed to your facility
                </p>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-ink text-volt border border-ink shrink-0">
                {orderList.length} Total
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center border border-ink/15 bg-paper p-0.5 text-xs">
                {(
                  [
                    { id: 'all', label: `All (${orderList.length})` },
                    { id: 'pending', label: `Pending (${pendingOrders.length})` },
                    { id: 'in_transit', label: `In Transit (${inTransitOrders.length})` },
                    { id: 'completed', label: `Delivered (${completedOrders.length})` },
                  ] as const
                ).map((t) => {
                  const active = orderFilter === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setOrderFilter(t.id)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-medium transition-colors',
                        active ? 'bg-ink text-paper font-semibold' : 'text-ink-3 hover:text-ink',
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <Link
                to="/supplier/orders"
                className="text-xs text-copper font-semibold hover:underline inline-flex items-center gap-1 ml-1"
              >
                Dispatch Console
                <ChevronRightIcon size={12} />
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
              {offerList.length === 0 && (
                <div className="pt-2">
                  <Link to="/supplier/products/new">
                    <Button
                      size="sm"
                      className="bg-volt text-ink hover:bg-volt-glow text-xs uppercase font-bold tracking-wider"
                    >
                      + Add Wholesale Product
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 border-b border-ink/10 bg-bone/60">
                  <tr>
                    <th className="text-left px-6 py-3 font-bold">PO Number</th>
                    <th className="text-left px-6 py-3 font-bold">Status</th>
                    <th className="text-left px-6 py-3 font-bold">Destination Terminal</th>
                    <th className="text-right px-6 py-3 font-bold">Gross Amount</th>
                    <th className="text-right px-6 py-3 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-bone/40 transition-colors group">
                      <td className="px-6 py-4">
                        <Link
                          to="/supplier/orders"
                          className="font-mono text-xs font-bold text-ink group-hover:text-copper transition-colors"
                        >
                          {o.poNumber || o.id.slice(0, 12)}
                        </Link>
                        <div className="text-[10px] text-ink-4 mt-0.5">
                          {new Date(o.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-6 py-4 text-xs text-ink-2">
                        {o.deliveryCity ? (
                          <span>
                            {o.deliveryCity}
                            {o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}
                          </span>
                        ) : (
                          <span className="text-ink-4">Standard Commercial Dock</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm font-semibold text-ink">
                        {formatLKR(o.totalCents ?? 0)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to="/supplier/orders"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-copper transition-colors px-2.5 py-1 bg-bone border border-ink/10 hover:border-ink"
                        >
                          <span>Manage</span>
                          <ArrowRightIcon size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>

        {/* Right column: Top customers + alerts */}
        <div className="lg:col-span-4 space-y-4">
          {/* Top customers */}
          <Surface kind="flat" className="p-0 overflow-hidden border border-ink/10 shadow-sm">
            <div className="px-5 py-4 border-b border-ink/10 bg-mist/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-md bg-copper/10 text-copper flex items-center justify-center">
                  <UsersIcon size={15} />
                </div>
                <div>
                  <h2 className="font-display text-sm text-ink font-semibold leading-tight">
                    Top Commercial Buyers
                  </h2>
                  <p className="text-[10px] text-ink-4 mt-0.5">By settled LKR volume</p>
                </div>
              </div>
              <Link
                to="/supplier/customers"
                className="text-[10px] font-mono uppercase tracking-wider text-copper hover:underline inline-flex items-center gap-1"
              >
                All
                <ChevronRightIcon size={10} />
              </Link>
            </div>
            {topCustomers.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-4">
                No buyers yet. Active customers will appear here as orders are placed.
              </div>
            ) : (
              <ul className="divide-y divide-ink/5">
                {topCustomers.map((c, i) => {
                  const max = topCustomers[0]?.totalCents ?? 1;
                  const pct = max > 0 ? Math.min(100, (c.totalCents / max) * 100) : 0;
                  return (
                    <li key={c.businessId} className="px-5 py-3 hover:bg-bone/40 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-sm bg-ink text-volt flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-xs font-semibold text-ink-1 truncate">
                            {c.name || c.businessId.slice(0, 12)}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-ink-1 shrink-0">
                          {formatCompactLKR(c.totalCents)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-bone overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-copper to-volt"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-ink-4 shrink-0">
                          {c.totalOrders} PO{c.totalOrders === 1 ? '' : 's'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Surface>

          {/* Top products */}
          <Surface kind="flat" className="p-0 overflow-hidden border border-ink/10 shadow-sm">
            <div className="px-5 py-4 border-b border-ink/10 bg-mist/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-md bg-volt/15 text-volt-deep flex items-center justify-center">
                  <LayersIcon size={15} />
                </div>
                <div>
                  <h2 className="font-display text-sm text-ink font-semibold leading-tight">
                    Top Performing SKUs
                  </h2>
                  <p className="text-[10px] text-ink-4 mt-0.5">By revenue generated</p>
                </div>
              </div>
              <Link
                to="/supplier/products"
                className="text-[10px] font-mono uppercase tracking-wider text-copper hover:underline inline-flex items-center gap-1"
              >
                Catalog
                <ChevronRightIcon size={10} />
              </Link>
            </div>
            {topProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-4">
                Publish wholesale products to start tracking top performers.
              </div>
            ) : (
              <ul className="divide-y divide-ink/5">
                {topProducts.map((p, i) => (
                  <li key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-bone/40 transition-colors">
                    <span className="w-5 h-5 rounded-sm bg-ink text-volt flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-ink-1 truncate">
                        {p.productName || 'Unnamed product'}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-ink-4 mt-0.5">
                        <span className="font-mono">
                          {p.unitsSold ?? 0} units
                        </span>
                        <span>·</span>
                        <span
                          className={cn(
                            'font-mono font-semibold uppercase',
                            p.availabilityStatus === 'out_of_stock'
                              ? 'text-rose'
                              : p.availabilityStatus === 'low'
                              ? 'text-amber'
                              : 'text-mint',
                          )}
                        >
                          {p.availabilityStatus?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs font-semibold text-ink-1">
                        {formatCompactLKR(p.revenueCents ?? 0)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          {/* Operational alerts */}
          {(lowStockCount > 0 || disputedOrders.length > 0) && (
            <Surface kind="flat" className="p-0 overflow-hidden border border-amber/30 shadow-sm">
              <div className="px-5 py-4 border-b border-amber/20 bg-amber/5 flex items-center gap-2.5">
                <div className="size-8 rounded-md bg-amber/15 text-amber flex items-center justify-center">
                  <AlertTriangleIcon size={15} />
                </div>
                <div>
                  <h2 className="font-display text-sm text-ink font-semibold leading-tight">
                    Operational Alerts
                  </h2>
                  <p className="text-[10px] text-ink-4 mt-0.5">Action required to keep ops healthy</p>
                </div>
              </div>
              <ul className="divide-y divide-ink/5">
                {lowStockCount > 0 && (
                  <li className="px-5 py-3 flex items-start gap-3">
                    <span className="size-2 rounded-full bg-amber mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-ink-1">
                        {lowStockCount} SKU{lowStockCount === 1 ? '' : 's'} running low
                      </div>
                      <p className="text-[11px] text-ink-3 mt-0.5">
                        Update stock levels to keep commercial buyers ordering from your facility.
                      </p>
                      <Link
                        to="/supplier/inventory"
                        className="text-[11px] font-semibold text-copper hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        Update stock
                        <ChevronRightIcon size={10} />
                      </Link>
                    </div>
                  </li>
                )}
                {disputedOrders.length > 0 && (
                  <li className="px-5 py-3 flex items-start gap-3">
                    <span className="size-2 rounded-full bg-rose mt-1.5 shrink-0 animate-pulse" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-ink-1">
                        {disputedOrders.length} disputed order
                        {disputedOrders.length === 1 ? '' : 's'} need attention
                      </div>
                      <p className="text-[11px] text-ink-3 mt-0.5">
                        Review buyer-raised disputes and respond promptly to maintain your trust score.
                      </p>
                      <Link
                        to="/supplier/orders"
                        className="text-[11px] font-semibold text-copper hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        View disputes
                        <ChevronRightIcon size={10} />
                      </Link>
                    </div>
                  </li>
                )}
              </ul>
            </Surface>
          )}
        </div>
      </div>

      {/* Operational Quick Action Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="vyro-kicker text-copper">Operational Modules</div>
          <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider">
            {NAV_LINKS.length} modules
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {NAV_LINKS.map((l) => (
            <ActionCard key={l.to} {...l} />
          ))}
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-ink-4 pt-4 border-t border-ink/10 gap-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-volt inline-block animate-pulse" />
          <span>VYRO Wholesale Supplier Operations · Secure Commercial Console</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span>
            {custList.length} commercial {custList.length === 1 ? 'buyer' : 'buyers'} on record
          </span>
          <span className="text-ink-5">·</span>
          <span>
            {offerList.length} {offerList.length === 1 ? 'SKU' : 'SKUs'} published
          </span>
          <span className="text-ink-5">·</span>
          <span>
            {orderList.length} {orderList.length === 1 ? 'PO' : 'POs'} processed
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Local helpers ---------- */

const NAV_LINKS = [
  {
    to: '/supplier/products',
    title: 'Product Catalog',
    hint: 'Add staple commodities, manage wholesale SKUs, and upload high-res packaging photos.',
    cta: 'Manage Catalog',
    icon: PackageIcon,
    accent: 'copper' as const,
  },
  {
    to: '/supplier/pricing',
    title: 'Pricing & MOQs',
    hint: 'Configure mill-gate pricing, bulk discount brackets, and minimum order requirements.',
    cta: 'Configure Tiers',
    icon: SparklesIcon,
    accent: 'volt' as const,
  },
  {
    to: '/supplier/deliveries',
    title: 'Fleet & Logistics',
    hint: 'Assign delivery drivers, register truck license plates, and track electronic GRN receipts.',
    cta: 'Dispatch Staging',
    icon: TruckIcon,
    accent: 'copper' as const,
  },
  {
    to: '/supplier/payments',
    title: 'Payouts & SVAT',
    hint: 'Review completed order settlements, download digital tax invoices, and manage bank accounts.',
    cta: 'View Settlement',
    icon: ShieldCheckIcon,
    accent: 'volt' as const,
  },
];

function KycCallout({ status }: { status?: string }) {
  if (status === 'approved' || status === 'verified') return null;
  const isRejected = status === 'rejected';
  const isNeeds = status === 'needs_more_info';
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-l-4',
        isRejected
          ? 'bg-rose/10 border-l-rose border border-rose/30'
          : isNeeds
          ? 'bg-copper/10 border-l-copper border border-copper/30'
          : 'bg-amber/10 border-l-amber border border-amber/30',
      )}
    >
      <div
        className={cn(
          'size-10 flex items-center justify-center shrink-0',
          isRejected ? 'bg-rose text-paper' : isNeeds ? 'bg-copper text-paper' : 'bg-amber text-ink',
        )}
      >
        <ShieldCheckIcon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-[10px] font-mono uppercase tracking-wider font-bold',
            isRejected ? 'text-rose' : isNeeds ? 'text-copper' : 'text-amber',
          )}
        >
          {isRejected
            ? 'Verification rejected — resubmit required'
            : isNeeds
            ? 'More information needed'
            : 'Verification pending — finish KYC to unlock commercial payouts'}
        </div>
        <p className="text-xs text-ink-2 mt-0.5">
          {isRejected
            ? 'Admin reviewer flagged your KYC documents. Address the notes and resubmit to reactivate your facility.'
            : isNeeds
            ? 'Our admin team requested additional information. Complete the open tasks to resume verification.'
            : 'Submit your commercial business documents, settlement bank account, and depot photos to start receiving escrow-funded POs.'}
        </p>
      </div>
      <Link to="/supplier/verification" className="shrink-0">
        <Button
          size="sm"
          className={cn(
            'text-xs uppercase font-bold tracking-wider',
            isRejected
              ? 'bg-rose text-paper hover:bg-rose/90'
              : isNeeds
              ? 'bg-copper text-paper hover:bg-copper/90'
              : 'bg-amber text-ink hover:bg-amber/90',
          )}
        >
          {isRejected ? 'Resubmit KYC' : isNeeds ? 'Complete Tasks' : 'Complete Verification'}
          <ArrowRightIcon size={12} />
        </Button>
      </Link>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'volt' | 'mint' | 'amber' | 'paper';
}) {
  const toneClass = {
    volt: 'text-volt',
    mint: 'text-mint',
    amber: 'text-amber',
    paper: 'text-paper',
  }[tone];
  return (
    <div>
      <div className="text-[10px] font-mono text-paper/50 uppercase tracking-wider font-bold">
        {label}
      </div>
      <div className={cn('vyro-metric text-2xl sm:text-3xl font-bold mt-1', toneClass)}>
        {value}
      </div>
      <div className="text-[10px] text-paper/50 mt-0.5">{sub}</div>
    </div>
  );
}

function KpiTile({
  to,
  label,
  value,
  sub,
  icon,
  accent,
  footer,
  isCurrency,
}: {
  to: string;
  label: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;
  accent: 'volt' | 'mint' | 'amber' | 'rose' | 'copper' | 'ink';
  footer: string;
  isCurrency?: boolean;
}) {
  const accentText = {
    volt: 'text-volt-deep',
    mint: 'text-mint',
    amber: 'text-amber',
    rose: 'text-rose',
    copper: 'text-copper-deep',
    ink: 'text-ink',
  }[accent];
  const accentBg = {
    volt: 'bg-volt/15 text-volt-deep',
    mint: 'bg-mint/15 text-mint',
    amber: 'bg-amber/15 text-amber',
    rose: 'bg-rose/15 text-rose',
    copper: 'bg-copper/15 text-copper-deep',
    ink: 'bg-ink/10 text-ink',
  }[accent];
  const display = isCurrency && typeof value === 'number' ? formatCompactLKR(value) : value;
  return (
    <Link
      to={to}
      className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all group block shadow-sm hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 font-bold">
          {label}
        </div>
        <div className={cn('size-7 flex items-center justify-center', accentBg)}>{icon}</div>
      </div>
      <MetricNumber size="lg" className={cn('mt-2', accentText)}>
        {display}
      </MetricNumber>
      <div className="text-[11px] text-ink-3 mt-1">{sub}</div>
      <div className="mt-3 pt-3 border-t border-ink/10 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-ink-4">
        <span>{footer}</span>
        <ChevronRightIcon
          size={12}
          className="text-ink-4 group-hover:text-copper group-hover:translate-x-0.5 transition-all"
        />
      </div>
    </Link>
  );
}

function PipelineStat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: 'mint' | 'amber' | 'rose' | 'copper' | 'volt' | 'paper';
  sub?: string;
}) {
  const toneClass = {
    mint: 'text-mint',
    amber: 'text-amber',
    rose: 'text-rose',
    copper: 'text-copper',
    volt: 'text-volt',
    paper: 'text-paper',
  }[tone];
  return (
    <div className="p-3 bg-paper/[0.04] border border-paper/10">
      <div className="text-[9px] font-mono text-paper/50 uppercase tracking-wider font-bold">
        {label}
      </div>
      <div className={cn('vyro-metric text-xl font-bold mt-1', toneClass)}>{value}</div>
      {sub && <div className="text-[9px] text-paper/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function ActivationStep({
  n,
  title,
  hint,
  cta,
  to,
}: {
  n: number;
  title: string;
  hint: string;
  cta: string;
  to: string;
}) {
  return (
    <div className="p-4 bg-paper border border-ink/10 space-y-2 relative hover:border-ink/30 transition-colors">
      <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">
        Step {n}
      </span>
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <p className="text-[11px] text-ink-4 leading-relaxed">{hint}</p>
      <Link
        to={to}
        className="text-xs text-copper font-semibold block pt-1 hover:underline inline-flex items-center gap-1"
      >
        {cta} →
      </Link>
    </div>
  );
}

function ActionCard({
  to,
  title,
  hint,
  cta,
  icon: Icon,
  accent,
}: {
  to: string;
  title: string;
  hint: string;
  cta: string;
  icon: typeof PackageIcon;
  accent: 'volt' | 'copper' | 'mint' | 'amber';
}) {
  const accentText = {
    volt: 'text-volt-deep group-hover:text-volt-deep',
    copper: 'text-copper group-hover:text-copper-deep',
    mint: 'text-mint',
    amber: 'text-amber',
  }[accent];
  const accentBg = {
    volt: 'bg-volt/15 text-volt-deep',
    copper: 'bg-copper/15 text-copper-deep',
    mint: 'bg-mint/15 text-mint',
    amber: 'bg-amber/15 text-amber',
  }[accent];
  return (
    <Link
      to={to}
      className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn('size-8 flex items-center justify-center', accentBg)}>
            <Icon size={15} />
          </div>
          <div className={cn('font-display font-semibold text-sm text-ink', accentText, 'transition-colors')}>
            {title}
          </div>
        </div>
        <ChevronRightIcon
          size={14}
          className="text-ink-4 group-hover:text-copper group-hover:translate-x-0.5 transition-all"
        />
      </div>
      <p className="text-xs text-ink-3 leading-relaxed line-clamp-2">{hint}</p>
      <span className="text-xs text-copper font-semibold inline-flex items-center gap-1 pt-1">
        {cta} →
      </span>
    </Link>
  );
}
