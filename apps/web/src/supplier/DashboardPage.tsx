import { useMemo } from 'react';
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
  CheckIcon,
} from '@/components/icons';
import { formatCompactLKR, formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';

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
type Offer = { id: string; availabilityStatus: string; minOrderQty: number; leadTimeDays: number };

interface SupplierProfile {
  id: string;
  name: string;
  city: string;
  district: string;
  address?: string;
  description?: string;
  verificationStatus: string;
  status: string;
}

const POLL_MS = 30_000;

export function SupplierDashboardPage() {
  const { supplierId, supplierName, role } = useSupplierId();
  const q = { retry: false, refetchInterval: POLL_MS };

  // 1. Supplier Profile Details Query
  const profileQuery = useQuery({
    queryKey: ['supplier', supplierId, 'profile'],
    queryFn: () => api.get<{ supplier: SupplierProfile }>(`/suppliers/${supplierId}`),
    ...q,
  });

  // 2. Orders Query
  const orders = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Po[] }>(`/purchase-orders?supplierId=${supplierId}`),
    ...q,
  });

  // 3. Payments Query
  const payments = useQuery({
    queryKey: ['supplier', supplierId, 'payments'],
    queryFn: () => api.get<{ items: Payment[] }>(`/payments?supplierId=${supplierId}`),
    ...q,
  });

  // 4. Customers Query
  const customers = useQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: () => api.get<{ items: Customer[] }>(`/suppliers/${supplierId}/customers`),
    ...q,
  });

  // 5. Active Offers Query
  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    ...q,
  });

  const supplierDetails = profileQuery.data?.supplier;
  const orderList = orders.data?.orders ?? [];
  const payList = payments.data?.items ?? [];
  const custList = customers.data?.items ?? [];
  const offerList = offers.data?.offers ?? [];

  const pending = orderList.filter((o) =>
    ['pending', 'confirmed', 'accepted', 'preparing', 'ready_for_pickup'].includes(o.status)
  ).length;
  const inTransit = orderList.filter((o) =>
    ['dispatched', 'out_for_delivery', 'shipped'].includes(o.status)
  ).length;
  const revenueCents = payList
    .filter((p) => p.status === 'completed' || p.status === 'paid')
    .reduce((s, p) => s + (p.amountCents ?? 0), 0);
  const lowStock = offerList.filter((o) =>
    o.availabilityStatus === 'low' || o.availabilityStatus === 'out_of_stock'
  ).length;

  const recent = useMemo(() => {
    return [...orderList].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  }, [orderList]);

  return (
    <div className="space-y-8">
      {/* Industrial Hero Header with High-Contrast White Text on Ink */}
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
              <span className="text-[11px] font-mono text-paper/50">
                Facility ID: {supplierId}
              </span>
              <span className="text-[11px] font-mono text-paper/60 border-l border-paper/15 pl-2.5">
                Role: <span className="capitalize text-volt">{role}</span>
              </span>
            </div>

            <h1 className="vyro-display text-3xl sm:text-4xl text-paper leading-tight">
              {supplierName || supplierDetails?.name || 'Wholesale Supplier Facility'}
            </h1>

            <p className="text-xs sm:text-sm text-paper/70 flex flex-wrap items-center gap-x-4 gap-y-1">
              {supplierDetails?.district && (
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon size={13} className="text-volt" />
                  {supplierDetails.city ? `${supplierDetails.city}, ` : ''}{supplierDetails.district} Terminal
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-paper/50">
                <ClockIcon size={13} /> Live operational sync · 30s auto-refresh
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link to="/supplier/orders">
              <Button variant="secondary" size="sm" className="text-xs font-semibold">
                Incoming Orders
                {pending > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-volt text-ink font-mono font-bold text-[10px] rounded-full">
                    {pending}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/supplier/products/new">
              <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs py-2 px-4">
                + Add Wholesale Product
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Facility Activation Roadmap (High-Priority Callout when 0 listings) */}
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
            <div className="p-4 bg-paper border border-ink/10 space-y-2 relative">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 1</span>
              <h3 className="font-display text-sm font-semibold text-ink">List Products</h3>
              <p className="text-[11px] text-ink-4">Select rice, tea, sugar, oil, or packaging from catalog.</p>
              <Link to="/supplier/products/new" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Add Products →
              </Link>
            </div>

            <div className="p-4 bg-paper border border-ink/10 space-y-2">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 2</span>
              <h3 className="font-display text-sm font-semibold text-ink">Set Mill-Gate Rates</h3>
              <p className="text-[11px] text-ink-4">Configure unit prices & volume tiers in LKR.</p>
              <Link to="/supplier/pricing" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Configure Pricing →
              </Link>
            </div>

            <div className="p-4 bg-paper border border-ink/10 space-y-2">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 3</span>
              <h3 className="font-display text-sm font-semibold text-ink">Depot Inventory</h3>
              <p className="text-[11px] text-ink-4">Set stock status & dispatch turnaround hours (24-48h).</p>
              <Link to="/supplier/inventory" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Update Stock →
              </Link>
            </div>

            <div className="p-4 bg-paper border border-ink/10 space-y-2">
              <span className="text-[10px] font-mono text-volt-deep uppercase tracking-wider font-bold">Step 4</span>
              <h3 className="font-display text-sm font-semibold text-ink">Settlement Bank</h3>
              <p className="text-[11px] text-ink-4">Link commercial bank account for automated payouts.</p>
              <Link to="/supplier/payments" className="text-xs text-copper font-semibold block pt-1 hover:underline">
                Link Payout Account →
              </Link>
            </div>
          </div>
        </Surface>
      )}

      {/* Operational Lifecycle Pipeline */}
      <Surface kind="ink" className="p-6">
        <div className="text-[10px] font-mono text-paper/50 uppercase tracking-wider mb-2">
          Facility Order Fulfillment Pipeline
        </div>
        <FlowLine
          tone="paper"
          nodes={[
            { label: 'Catalog Offering', state: offerList.length > 0 ? 'done' : 'idle' },
            { label: 'Mill-Gate Pricing', state: offerList.length > 0 ? 'done' : 'idle' },
            { label: 'Depot Staging', state: offerList.length > 0 ? 'done' : 'idle' },
            { label: 'Incoming POs', state: pending > 0 ? 'active' : orderList.length > 0 ? 'done' : 'idle' },
            { label: 'Dock GRN & Payout', state: payList.length > 0 ? 'done' : 'idle' },
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
            <span>Open Orders</span>
            <StoreIcon size={14} />
          </div>
          <MetricNumber size="lg" className={`mt-3 ${pending > 0 ? 'text-copper font-bold' : 'text-ink'}`}>
            {pending}
          </MetricNumber>
          <span className="text-[11px] text-ink-4 mt-1 block">
            {pending === 1 ? '1 PO awaiting staging' : `${pending} POs awaiting staging`}
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
            {inTransit}
          </MetricNumber>
          <span className="text-[11px] text-ink-4 mt-1 block">
            {inTransit === 1 ? '1 delivery en route' : `${inTransit} deliveries en route`}
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
            {revenueCents === 0 ? 'Calibrates on first delivery' : formatLKR(revenueCents)}
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
            {lowStock > 0 ? `${lowStock} low stock alert` : 'All inventory active'}
          </span>
        </Link>
      </div>

      {/* Recent Orders Queue */}
      <Surface kind="flat" className="p-0 overflow-hidden">
        <div className="px-6 py-5 flex items-center justify-between border-b border-ink/10">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl text-ink">Incoming Purchase Orders</h2>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-mist text-ink border border-line">
              {orderList.length} Total
            </span>
          </div>
          <Link to="/supplier/orders" className="text-xs text-copper font-semibold hover:underline">
            Open Dispatch Console →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="size-12 mx-auto bg-mist flex items-center justify-center text-ink-4">
              <PackageIcon size={24} />
            </div>
            <h3 className="font-display text-base text-ink font-semibold">No purchase orders received yet</h3>
            <p className="text-xs text-ink-4 max-w-md mx-auto">
              Once commercial buyers select your wholesale products and issue purchase orders, they will populate here with live dock delivery deadlines.
            </p>
            <Link to="/supplier/products/new" className="inline-block pt-2">
              <Button size="sm" className="text-xs uppercase font-bold tracking-wider">
                + Add Wholesale Product Quote
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4 border-b border-ink/5 bg-mist/30">
                <tr>
                  <th className="text-left px-6 py-3 font-normal">PO Number</th>
                  <th className="text-left px-6 py-3 font-normal">Status</th>
                  <th className="text-left px-6 py-3 font-normal">Destination</th>
                  <th className="text-right px-6 py-3 font-normal">Gross Amount</th>
                  <th className="text-right px-6 py-3 font-normal">Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-b border-ink/5 hover:bg-mist/40 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-xs font-bold text-ink">
                      {o.poNumber || o.id.slice(0, 12)}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-6 py-3.5 text-xs text-ink-3">
                      {o.deliveryCity ? `${o.deliveryCity}, ${o.deliveryDistrict ?? ''}` : 'Standard Commercial Dock'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs font-semibold text-ink">
                      {formatLKR(o.totalCents ?? 0)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link
                        to="/supplier/orders"
                        className="text-xs text-copper font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        Dispatch <ArrowRightIcon size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* Quick Action Navigation Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/supplier/products"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm">
            <PackageIcon size={16} className="text-copper" />
            <span>Product Catalog</span>
          </div>
          <p className="text-xs text-ink-3">
            Add staple commodities, manage wholesale SKUs, and upload high-res packaging photos.
          </p>
          <span className="text-xs text-copper font-semibold inline-block pt-1">
            Manage Catalog →
          </span>
        </Link>

        <Link
          to="/supplier/pricing"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm">
            <SparklesIcon size={16} className="text-volt-deep" />
            <span>Pricing & MOQs</span>
          </div>
          <p className="text-xs text-ink-3">
            Configure mill-gate pricing, bulk discount brackets, and minimum order requirements.
          </p>
          <span className="text-xs text-copper font-semibold inline-block pt-1">
            Configure Tiers →
          </span>
        </Link>

        <Link
          to="/supplier/deliveries"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm">
            <TruckIcon size={16} className="text-copper" />
            <span>Fleet & Logistics</span>
          </div>
          <p className="text-xs text-ink-3">
            Assign delivery drivers, register truck license plates, and track electronic GRN receipts.
          </p>
          <span className="text-xs text-copper font-semibold inline-block pt-1">
            Dispatch Staging →
          </span>
        </Link>

        <Link
          to="/supplier/payments"
          className="p-5 bg-paper border border-ink/10 hover:border-ink transition-all block space-y-2 shadow-sm"
        >
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm">
            <ShieldCheckIcon size={16} className="text-volt-deep" />
            <span>Payouts & SVAT</span>
          </div>
          <p className="text-xs text-ink-3">
            Review completed order settlements, download digital tax invoices, and manage bank accounts.
          </p>
          <span className="text-xs text-copper font-semibold inline-block pt-1">
            View Settlement →
          </span>
        </Link>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-4 pt-2 border-t border-ink/10">
        <span>VYRO Wholesale Supplier Operations · Secure Commercial Console</span>
        <span>{custList.length} commercial {custList.length === 1 ? 'buyer' : 'buyers'} on record</span>
      </div>
    </div>
  );
}
