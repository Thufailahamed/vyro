import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, StatusBadge } from '@/components/ui';
import { ProductImage, Surface } from '@/components/brand/Surface';
import {
  PackageIcon,
  TruckIcon,
  StoreIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  SparklesIcon,
  MapPinIcon,
  RefreshCwIcon,
  LayersIcon,
  CheckCircle2Icon,
  BanknoteIcon,
  UsersIcon,
  FileTextIcon,
  ChevronRightIcon,
  TargetIcon,
  ExternalLinkIcon,
  PlusIcon,
} from '@/components/icons';
import { formatCompactLKR, formatLKR, greetingForNow } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierLoadingState, SupplierErrorState } from './SupplierPageState';
import { HeroStatusPill } from './SupplierHero';
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';
import { StorefrontSettingsSection } from './StorefrontSettingsSection';
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
  slug?: string | null;
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

  // Hooks must run before any early return (React Rules of Hooks).
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

  const handleRefresh = () => {
    profileQuery.refetch();
    ordersQuery.refetch();
    paymentsQuery.refetch();
    offersQuery.refetch();
    customersQuery.refetch();
  };

  const isVerified = supplierDetails?.verificationStatus === 'verified';
  const facilityName = supplierName || supplierDetails?.name || 'Wholesale supplier facility';
  const pendingValueCents = pendingOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);

  const stages: PipelineStage[] = [
    {
      label: 'Listed',
      value: String(offerList.length),
      sub: offerList.length ? 'SKUs live' : 'Add your first SKU',
      to: '/supplier/products',
      icon: PackageIcon,
      state: offerList.length ? 'done' : 'idle',
    },
    {
      label: 'Incoming',
      value: String(pendingOrders.length),
      sub: pendingOrders.length ? 'Awaiting dispatch' : 'Queue clear',
      to: '/supplier/orders',
      icon: StoreIcon,
      state: pendingOrders.length ? 'active' : orderList.length ? 'done' : 'idle',
    },
    {
      label: 'In transit',
      value: String(inTransitOrders.length),
      sub: 'Consignments en route',
      to: '/supplier/deliveries',
      icon: TruckIcon,
      state: inTransitOrders.length ? 'done' : 'idle',
    },
    {
      label: 'Delivered',
      value: String(completedOrders.length),
      sub: 'GRN confirmed',
      to: '/supplier/orders',
      icon: CheckCircle2Icon,
      state: completedOrders.length ? 'done' : 'idle',
    },
    {
      label: 'Paid out',
      value: formatCompactLKR(revenueCents),
      sub: payList.length ? `${payList.length} payout${payList.length === 1 ? '' : 's'}` : 'Settles on GRN',
      to: '/supplier/payments',
      icon: BanknoteIcon,
      state: payList.length ? 'done' : 'idle',
    },
  ];

  const attention: Array<{ tone: 'amber' | 'rose' | 'volt'; title: string; body: string; to: string; cta: string }> = [];
  if (pendingOrders.length > 0)
    attention.push({
      tone: 'volt',
      title: `${pendingOrders.length} PO${pendingOrders.length === 1 ? '' : 's'} ready to stage`,
      body: `${formatCompactLKR(pendingValueCents)} waiting on your dispatch dock.`,
      to: '/supplier/orders',
      cta: 'Open dispatch console',
    });
  if (disputedOrders.length > 0)
    attention.push({
      tone: 'rose',
      title: `${disputedOrders.length} disputed order${disputedOrders.length === 1 ? '' : 's'}`,
      body: 'Respond promptly to protect your trust score.',
      to: '/supplier/orders',
      cta: 'Review disputes',
    });
  if (lowStockCount > 0)
    attention.push({
      tone: 'amber',
      title: `${lowStockCount} SKU${lowStockCount === 1 ? '' : 's'} low or out of stock`,
      body: outOfStockCount ? `${outOfStockCount} hidden from buyers until restocked.` : 'Restock to keep buyers ordering.',
      to: '/supplier/inventory',
      cta: 'Update stock',
    });

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* KYC Callout (when not verified) */}
      {supplierDetails?.verificationStatus !== 'verified' && (
        <KycCallout status={supplierDetails?.verificationStatus ?? 'pending'} />
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <Surface kind="ink" className="grain rounded-2xl shadow-soft-lg">
        <div className="pointer-events-none absolute -top-32 -right-16 size-96 rounded-full bg-volt/[0.12] blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-36 -left-20 size-80 rounded-full bg-copper/25 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#FAF7F0_1px,transparent_1px),linear-gradient(to_bottom,#FAF7F0_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
          aria-hidden
        />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:items-stretch">
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                <StoreIcon size={12} />
                Supplier hub
              </span>
              <HeroStatusPill
                tone={isVerified ? 'mint' : 'amber'}
                label={isVerified ? 'Verified wholesale hub' : 'Verification pending'}
              />
              {role && (
                <span className="rounded-full border border-paper/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">
                  {role}
                </span>
              )}
            </div>

            <p className="mt-6 text-[15px] text-paper/55">{greetingForNow()} 👋</p>
            <h1 className="vyro-display mt-1 text-3xl font-bold leading-[1.04] tracking-tight text-paper sm:text-[2.75rem] text-balance">
              {facilityName}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-paper/55">
              {supplierDetails?.district && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon size={13} className="text-volt" />
                  {supplierDetails.city ? `${supplierDetails.city}, ` : ''}
                  {supplierDetails.district}
                </span>
              )}
              {supplierDetails?.businessTypeName && (
                <span className="inline-flex items-center gap-1.5">
                  <LayersIcon size={13} />
                  {supplierDetails.businessTypeName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-mint animate-pulse" /> Live · refreshes every 30s
              </span>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-7">
              <Link
                to="/supplier/products/new"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-volt px-4 text-[13px] font-bold text-ink shadow-[0_8px_24px_-10px_rgba(198,220,74,0.7)] transition-colors hover:bg-volt-glow"
              >
                <PlusIcon size={14} />
                Add product
              </Link>
              <Link
                to={`/suppliers/${supplierDetails?.slug || supplierId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-paper/15 bg-paper/5 px-4 text-[13px] font-semibold text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
              >
                <StoreIcon size={14} className="text-volt" />
                View storefront
                <ExternalLinkIcon size={11} className="opacity-60" />
              </Link>
              <Link
                to="/supplier/leads"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-paper/15 bg-paper/5 px-4 text-[13px] font-semibold text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
                data-testid="dashboard-leads-link"
              >
                <TargetIcon size={14} />
                Leads
              </Link>
              <button
                type="button"
                onClick={handleRefresh}
                className="flex size-10 items-center justify-center rounded-xl border border-paper/15 bg-paper/5 text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
                title="Refresh operational feeds"
                aria-label="Refresh operational feeds"
              >
                <RefreshCwIcon size={14} className={profileQuery.isFetching ? 'animate-spin text-volt' : ''} />
              </button>
            </div>
          </div>

          {/* Dispatch focus panel */}
          <Link
            to="/supplier/orders"
            className="group flex flex-col justify-between rounded-xl border border-paper/10 bg-paper/[0.04] p-5 backdrop-blur-sm transition-colors hover:border-paper/20 hover:bg-paper/[0.06]"
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
              <span>Dispatch queue</span>
              <span className={cn('inline-flex items-center gap-1.5', pendingOrders.length ? 'text-volt' : 'text-mint')}>
                <span className={cn('size-1.5 rounded-full', pendingOrders.length ? 'bg-volt animate-pulse' : 'bg-mint')} />
                {pendingOrders.length ? 'Action needed' : 'All clear'}
              </span>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <span className="font-display text-6xl font-bold leading-none tracking-tight text-paper">
                {pendingOrders.length}
              </span>
              <span className="pb-1.5 text-[13px] leading-snug text-paper/55">
                purchase order{pendingOrders.length === 1 ? '' : 's'}
                <br />
                awaiting dispatch
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-paper/10 pt-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">Queue value</div>
                <div className="mt-1 font-mono text-lg font-semibold text-volt">{formatCompactLKR(pendingValueCents)}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">En route</div>
                <div className="mt-1 font-mono text-lg font-semibold text-paper">{inTransitOrders.length}</div>
              </div>
            </div>
            <span className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-paper text-[13px] font-semibold text-ink transition-colors group-hover:bg-volt">
              Open dispatch console
              <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </Surface>

      {/* ── KPI row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          to="/supplier/orders"
          label="Pipeline value"
          value={formatCompactLKR(pipelineValueCents)}
          sub={`${orderList.length} PO${orderList.length === 1 ? '' : 's'} this period`}
          icon={BanknoteIcon}
        />
        <KpiTile
          to="/supplier/payments"
          label="Settled revenue"
          value={formatCompactLKR(revenueCents)}
          sub={revenueCents === 0 ? 'Settles upon GRN' : `${payList.length} payment${payList.length === 1 ? '' : 's'}`}
          icon={ShieldCheckIcon}
          tone="mint"
        />
        <KpiTile
          to="/supplier/products"
          label="Active listings"
          value={String(offerList.length)}
          sub={lowStockCount > 0 ? `${lowStockCount} need restock` : `${activeOffers} in stock`}
          icon={PackageIcon}
          tone={lowStockCount > 0 ? 'amber' : 'ink'}
          meter={offerList.length ? (activeOffers / offerList.length) * 100 : undefined}
        />
        <KpiTile
          to="/supplier/customers"
          label="Commercial buyers"
          value={String(custList.length)}
          sub={topCustomers[0] ? `Top: ${topCustomers[0].name || 'buyer'}` : 'No buyers yet'}
          icon={UsersIcon}
        />
      </div>

      {/* ── Activation checklist (0 listings) ───────────── */}
      {offerList.length === 0 && (
        <section className="rounded-2xl border border-volt/40 bg-gradient-to-br from-volt/[0.12] via-paper to-paper p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-volt">
                <SparklesIcon size={20} />
              </span>
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt-deep">
                  Activation checklist
                </div>
                <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-ink">
                  Go live on Sri Lanka’s direct wholesale network
                </h2>
                <p className="mt-1 max-w-2xl text-[13px] text-ink-3">
                  Kitchens, supermarket chains and regional grocers search VYRO daily for mill-direct rates.
                </p>
              </div>
            </div>
            <Link
              to="/supplier/products/new"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-semibold text-paper transition-colors hover:bg-charcoal"
            >
              Publish first product <ArrowRightIcon size={13} />
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActivationStep n={1} title="List products" hint="Rice, tea, sugar, oil or packaging from the catalog." cta="Add products" to="/supplier/products/new" />
            <ActivationStep n={2} title="Set mill-gate rates" hint="Unit prices and volume tiers in LKR." cta="Configure pricing" to="/supplier/pricing" />
            <ActivationStep n={3} title="Depot inventory" hint="Stock status and dispatch turnaround." cta="Update stock" to="/supplier/inventory" />
            <ActivationStep n={4} title="Settlement bank" hint="Link a bank account for automated payouts." cta="Link payout account" to="/supplier/settings" />
          </div>
        </section>
      )}

      {/* ── Fulfilment pipeline ─────────────────────────── */}
      <section className="rounded-2xl border border-ink/[0.08] bg-paper p-5 shadow-[0_1px_2px_rgba(12,14,11,0.04)] sm:p-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-copper">Fulfilment pipeline</div>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-ink">Dock-to-payout lifecycle</h2>
          </div>
          <span className="font-mono text-[11px] text-ink-4">
            {pendingOrders.length} pending · {inTransitOrders.length} en route · {completedOrders.length} delivered
          </span>
        </header>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {stages.map((s, i) => (
            <PipelineStep key={s.label} stage={s} index={i} last={i === stages.length - 1} />
          ))}
        </ol>
      </section>

      {/* ── Orders + side rail ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-paper shadow-[0_1px_2px_rgba(12,14,11,0.04)] lg:col-span-8">
          <header className="flex flex-col gap-4 border-b border-ink/[0.06] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight text-ink">Incoming purchase orders</h2>
              <p className="mt-0.5 text-[12px] text-ink-4">Latest wholesale POs routed to your facility</p>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-ink/[0.04] p-1 [scrollbar-width:none]">
              {(
                [
                  { id: 'all', label: 'All', count: orderList.length },
                  { id: 'pending', label: 'Pending', count: pendingOrders.length },
                  { id: 'in_transit', label: 'Transit', count: inTransitOrders.length },
                  { id: 'completed', label: 'Delivered', count: completedOrders.length },
                ] as const
              ).map((t) => {
                const active = orderFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setOrderFilter(t.id)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-all',
                      active ? 'bg-paper text-ink shadow-sm ring-1 ring-ink/[0.06]' : 'text-ink-3 hover:text-ink',
                    )}
                  >
                    {t.label}
                    <span className={cn('font-mono text-[10px]', active ? 'text-ink-3' : 'text-ink-4')}>{t.count}</span>
                  </button>
                );
              })}
            </div>
          </header>

          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-4">
                <PackageIcon size={22} />
              </span>
              <h3 className="mt-4 text-[14px] font-semibold text-ink">
                {orderFilter === 'all' ? 'No purchase orders yet' : 'Nothing in this stage'}
              </h3>
              <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-4">
                {orderFilter === 'all'
                  ? 'When buyers order against your catalog, POs appear here with dispatch and GRN tracking.'
                  : 'Switch filters to view other stages.'}
              </p>
              {offerList.length === 0 && (
                <Link
                  to="/supplier/products/new"
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-4 text-[12px] font-semibold text-paper hover:bg-charcoal"
                >
                  <PlusIcon size={13} className="text-volt" /> Add wholesale product
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-ink/[0.06] bg-bone/40 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                    <th className="px-6 py-3 text-left font-medium">Purchase order</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Destination</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/[0.05]">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="group transition-colors hover:bg-bone/40">
                      <td className="px-6 py-3.5">
                        <Link to="/supplier/orders" className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-3">
                            <FileTextIcon size={15} />
                          </span>
                          <span>
                            <span className="block font-mono text-[12px] font-bold text-ink transition-colors group-hover:text-copper-deep">
                              {o.poNumber || o.id.slice(0, 12)}
                            </span>
                            <span className="text-[11px] text-ink-4">
                              {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {o.itemCount ? ` · ${o.itemCount} item${o.itemCount === 1 ? '' : 's'}` : ''}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-ink-2">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPinIcon size={12} className="text-ink-4" />
                          {o.deliveryCity
                            ? `${o.deliveryCity}${o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}`
                            : 'Dock pickup'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-[13px] font-semibold text-ink tabular-nums">
                        {formatLKR(o.totalCents ?? 0)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          to="/supplier/orders"
                          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink hover:text-paper"
                          aria-label="Manage order"
                        >
                          <ChevronRightIcon size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link
            to="/supplier/orders"
            className="flex items-center justify-between border-t border-ink/[0.06] bg-bone/30 px-6 py-3 text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink"
          >
            <span>
              {orderList.length} PO{orderList.length === 1 ? '' : 's'} total
            </span>
            <span className="inline-flex items-center gap-1">
              Dispatch console <ArrowRightIcon size={12} />
            </span>
          </Link>
        </section>

        {/* Side rail */}
        <div className="space-y-4 lg:col-span-4">
          {/* Needs attention */}
          <section className="rounded-2xl border border-ink/[0.08] bg-paper p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[15px] font-bold text-ink">Needs attention</h2>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold',
                  attention.length ? 'bg-amber/10 text-amber' : 'bg-mint/10 text-mint',
                )}
              >
                {attention.length || 'All clear'}
              </span>
            </div>
            {attention.length === 0 ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-mint/[0.07] p-3.5 text-[12px] text-ink-3">
                <CheckCircle2Icon size={18} className="shrink-0 text-mint" />
                Nothing waiting on you — stock is healthy and the queue is clear.
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {attention.map((a) => (
                  <li key={a.title}>
                    <Link
                      to={a.to}
                      className="group flex items-start gap-3 rounded-xl border border-ink/[0.06] p-3.5 transition-colors hover:border-ink/20 hover:bg-bone/40"
                    >
                      <span
                        className={cn(
                          'mt-1 size-2 shrink-0 rounded-full',
                          a.tone === 'rose' && 'bg-rose animate-pulse',
                          a.tone === 'amber' && 'bg-amber',
                          a.tone === 'volt' && 'bg-volt-deep',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink">{a.title}</span>
                        <span className="mt-0.5 block text-[12px] text-ink-4">{a.body}</span>
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-copper group-hover:text-copper-deep">
                          {a.cta} <ChevronRightIcon size={11} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Top buyers */}
          <RailCard title="Top buyers" sub="By settled LKR volume" to="/supplier/customers" linkLabel="All buyers">
            {topCustomers.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-ink-4">Buyers appear here as orders are placed.</p>
            ) : (
              <ul className="space-y-3">
                {topCustomers.map((c) => {
                  const max = topCustomers[0]?.totalCents ?? 1;
                  const pct = max > 0 ? Math.min(100, (c.totalCents / max) * 100) : 0;
                  const name = c.name || c.businessId.slice(0, 12);
                  return (
                    <li key={c.businessId}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-copper-soft/60 text-[11px] font-bold text-copper-deep">
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{name}</span>
                        <span className="shrink-0 font-mono text-[12px] font-semibold text-ink">{formatCompactLKR(c.totalCents)}</span>
                      </div>
                      <div className="ml-[2.375rem] mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                          <div className="h-full rounded-full bg-copper" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-ink-4">
                          {c.totalOrders} PO{c.totalOrders === 1 ? '' : 's'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </RailCard>

          {/* Top SKUs */}
          <RailCard title="Top SKUs" sub="By revenue generated" to="/supplier/products" linkLabel="Catalog">
            {topProducts.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-ink-4">Publish products to track top performers.</p>
            ) : (
              <ul className="space-y-1">
                {topProducts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg py-1.5">
                    <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-bone ring-1 ring-ink/[0.06]">
                      <ProductImage src={p.productImage} alt={p.productName ?? 'Product'} seed={p.productId ?? p.id} className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{p.productName || 'Unnamed product'}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-4">
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            p.availabilityStatus === 'out_of_stock' ? 'bg-rose' : p.availabilityStatus === 'low' ? 'bg-amber' : 'bg-mint',
                          )}
                        />
                        {p.unitsSold ?? 0} units
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] font-semibold text-ink">{formatCompactLKR(p.revenueCents ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </RailCard>
        </div>
      </div>

      {/* ── Modules ──────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {NAV_LINKS.map((l) => (
          <ActionCard key={l.to} {...l} />
        ))}
      </div>

      {/* Reviews */}
      <section className="rounded-2xl border border-ink/[0.08] bg-paper p-5 sm:p-6">
        <header className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-copper">Reputation</div>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-ink">Buyer reviews</h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">Verified orders only</span>
        </header>
        <SupplierReviewsPanel supplierId={supplierId} />
      </section>

      {/* Storefront section */}
      <StorefrontSettingsSection
        currentSlug={supplierDetails?.slug ?? null}
        supplierName={supplierName || supplierDetails?.name}
        supplierId={supplierId}
      />

      {/* Footer status bar */}
      <div className="flex flex-col items-center justify-between gap-2 border-t border-ink/[0.08] pt-4 text-[11px] text-ink-4 sm:flex-row">
        <span className="inline-flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-mint animate-pulse" />
          Secure supplier console · live sync
        </span>
        <span className="font-mono">
          {custList.length} buyer{custList.length === 1 ? '' : 's'} · {offerList.length} SKU{offerList.length === 1 ? '' : 's'} ·{' '}
          {orderList.length} PO{orderList.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

/* ---------- Local helpers ---------- */

const NAV_LINKS = [
  { to: '/supplier/products', title: 'Product catalog', hint: 'SKUs, packaging photos and listings.', icon: PackageIcon },
  { to: '/supplier/pricing', title: 'Pricing & MOQs', hint: 'Mill-gate rates and bulk discount tiers.', icon: SparklesIcon },
  { to: '/supplier/deliveries', title: 'Fleet & logistics', hint: 'Drivers, trucks and electronic GRNs.', icon: TruckIcon },
  { to: '/supplier/payments', title: 'Payouts & SVAT', hint: 'Settlements, tax invoices and bank accounts.', icon: ShieldCheckIcon },
];

type PipelineStage = {
  label: string;
  value: string;
  sub: string;
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  state: 'done' | 'active' | 'idle';
};

function PipelineStep({ stage, index, last }: { stage: PipelineStage; index: number; last: boolean }) {
  const Icon = stage.icon;
  const active = stage.state === 'active';
  return (
    <li className="relative">
      <Link
        to={stage.to}
        className={cn(
          'group block h-full rounded-xl border p-4 transition-all hover:-translate-y-0.5',
          active
            ? 'border-ink bg-ink text-paper shadow-[0_16px_32px_-20px_rgba(12,14,11,0.7)]'
            : 'border-ink/[0.08] bg-bone/40 hover:border-ink/20 hover:bg-paper',
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg',
              active
                ? 'bg-volt text-ink'
                : stage.state === 'done'
                  ? 'bg-mint/10 text-mint'
                  : 'bg-ink/[0.05] text-ink-4',
            )}
          >
            <Icon size={15} />
          </span>
          <span className={cn('font-mono text-[10px]', active ? 'text-paper/40' : 'text-ink-5')}>
            0{index + 1}
          </span>
        </div>
        <div
          className={cn(
            'mt-4 truncate font-display text-2xl font-bold leading-none tracking-tight tabular-nums',
            active ? 'text-paper' : stage.state === 'idle' ? 'text-ink-4' : 'text-ink',
          )}
        >
          {stage.value}
        </div>
        <div className={cn('mt-2 text-[12px] font-semibold', active ? 'text-paper' : 'text-ink-2')}>{stage.label}</div>
        <div className={cn('mt-0.5 truncate text-[11px]', active ? 'text-paper/55' : 'text-ink-4')}>{stage.sub}</div>
      </Link>
      {!last && (
        <span
          className="pointer-events-none absolute -right-[7px] top-1/2 z-10 hidden size-3 -translate-y-1/2 rotate-45 border-r border-t border-ink/15 bg-paper lg:block"
          aria-hidden
        />
      )}
    </li>
  );
}

function RailCard({
  title,
  sub,
  to,
  linkLabel,
  children,
}: {
  title: string;
  sub: string;
  to: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink/[0.08] bg-paper p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-bold text-ink">{title}</h2>
          <p className="mt-0.5 text-[11px] text-ink-4">{sub}</p>
        </div>
        <Link to={to} className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-ink-3 hover:text-ink">
          {linkLabel} <ChevronRightIcon size={12} />
        </Link>
      </div>
      {children}
    </section>
  );
}

function KycCallout({ status }: { status?: string }) {
  if (status === 'approved' || status === 'verified') return null;
  const isRejected = status === 'rejected';
  const isNeeds = status === 'needs_more_info';
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:p-5',
        isRejected
          ? 'border-rose/25 bg-rose/[0.07]'
          : isNeeds
          ? 'border-copper/25 bg-copper/[0.07]'
          : 'border-amber/25 bg-amber/[0.07]',
      )}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
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

function KpiTile({
  to,
  label,
  value,
  sub,
  icon: Icon,
  tone = 'ink',
  meter,
}: {
  to: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: 'ink' | 'mint' | 'amber';
  meter?: number | undefined;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl border border-ink/[0.08] bg-paper p-5 shadow-[0_1px_2px_rgba(12,14,11,0.04)] transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_16px_32px_-24px_rgba(12,14,11,0.5)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">{label}</span>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg transition-colors',
            tone === 'mint' && 'bg-mint/10 text-mint',
            tone === 'amber' && 'bg-amber/10 text-amber',
            tone === 'ink' && 'bg-ink/[0.05] text-ink-3 group-hover:bg-ink group-hover:text-volt',
          )}
        >
          <Icon size={15} />
        </span>
      </div>
      <div
        className={cn(
          'mt-4 truncate font-display text-[1.9rem] font-bold leading-none tracking-tight tabular-nums',
          tone === 'mint' ? 'text-mint' : tone === 'amber' ? 'text-amber' : 'text-ink',
        )}
      >
        {value}
      </div>
      {meter !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(meter, 100)}%` }} />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-ink-4">
        <span className="truncate">{sub}</span>
        <ChevronRightIcon size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
    </Link>
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
    <Link
      to={to}
      className="group block rounded-xl border border-ink/[0.08] bg-paper p-4 transition-all hover:-translate-y-0.5 hover:border-ink/25"
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt-deep">Step 0{n}</span>
      <h3 className="mt-1.5 text-[14px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-4">{hint}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-copper group-hover:text-copper-deep">
        {cta} <ArrowRightIcon size={12} />
      </span>
    </Link>
  );
}

function ActionCard({
  to,
  title,
  hint,
  icon: Icon,
}: {
  to: string;
  title: string;
  hint: string;
  icon: typeof PackageIcon;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3.5 rounded-2xl border border-ink/[0.08] bg-paper p-4 transition-all hover:-translate-y-0.5 hover:border-ink/20"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink/[0.05] text-ink-3 transition-colors group-hover:bg-ink group-hover:text-volt">
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-ink-4">{hint}</span>
      </span>
      <ChevronRightIcon size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}
