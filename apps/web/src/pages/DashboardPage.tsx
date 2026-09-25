import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@vyro/ui';
import { usePageTitle } from '@/lib/usePageTitle';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { TimeSeries, Button, MetricStack, StatusDots, PageHeader, EmptyState } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import {
  PackageIcon,
  ShoppingCartIcon,
  TruckIcon,
  StoreIcon,
  Building2Icon,
  ShieldCheckIcon,
  CheckIcon,
  ArrowRightIcon,
  SparklesIcon,
  TrendingUpIcon,
  MapPinIcon,
  RefreshCwIcon,
} from '@/components/icons';
import { formatCompactLKR, formatLKR, greetingForNow } from '@/lib/format';
import { FlowLine, FlowCanvas } from '@/components/brand/FlowLine';
import { MetricNumber, ProductImage, Surface } from '@/components/brand/Surface';
import { PageHero, HeroStatusPill, heroActionClass } from '@/components/brand/PageHero';
import { FALLBACK_PRODUCT_IMAGE, resolveCatalogImage } from '@/lib/catalogImages';
import { dedupeSuppliers } from '@/lib/dedupeSuppliers';
import { useAddToCart } from '@/lib/useAddToCart';

interface OrderRow {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
  supplierName?: string;
  supplierId?: string;
  deliveryCity?: string;
  deliveryDistrict?: string;
}

interface SearchProduct {
  id: string;
  name: string;
  slug?: string;
  unit: string;
  brand: string | null;
  sku: string;
  imageUrl?: string | null;
  categoryId?: string;
}

interface SearchHit {
  product: SearchProduct;
  bestOffer: {
    id: string;
    priceCents: number;
    currency: string;
    leadTimeDays: number;
    minOrderQty: number;
    supplier: {
      id: string;
      name: string;
      district?: string;
      city?: string;
      verificationStatus?: string;
    };
  } | null;
  offerCount: number;
}

interface SupplierRecord {
  id: string;
  name: string;
  businessTypeId?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city: string;
  district: string;
  description: string | null;
  verificationStatus: string;
  status: string;
  activeListingsCount?: number;
}

interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  sortOrder?: number;
  active?: boolean | number;
}

interface CartItem {
  id: string;
  productId: string;
  supplierProductId: string;
  quantity: number;
  lineTotalCents: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SUPPLIER_PHOTOS: Record<string, string> = {
  'sup-colombo-wholesalers':
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
  'sup-lanka-mills':
    'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80',
  'sup-island-distributors':
    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
};

const DEFAULT_SUPPLIER_PHOTO =
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80';

export function DashboardPage() {
  usePageTitle('Command');
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const businessId = user?.memberships?.[0]?.businessId;
  const businessName = user?.memberships?.[0]?.businessName;
  const { addToCart, pendingKey } = useAddToCart();
  const [reordering, setReordering] = useState(false);

  // 1. Real Purchase Orders Query
  const { data: ordersData } = useQuery({
    queryKey: ['business-orders-dash', businessId],
    queryFn: () => api.get<{ orders: OrderRow[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  // 2. Real Monthly Spend Analytics Query
  const { data: spendData } = useQuery({
    queryKey: ['business-monthly-spend', businessId],
    queryFn: () =>
      api.get<{ buckets: { month: string; totalCents: number }[] }>(
        `/analytics/business/monthly-spend?months=12&businessId=${businessId}`
      ),
    enabled: !!businessId,
  });

  // 3. Real Active Cart & Draft PO Status
  const { data: cartData } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () =>
      api.get<{
        cart: { id: string };
        items: CartItem[];
        subtotalCents: number;
        totalCents: number;
        supplierCount: number;
      }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // 4. Real Catalog Products & Spot Pricing Query
  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ['dashboard-catalog-products'],
    queryFn: () => api.get<{ hits: SearchHit[]; nextCursor: string | null }>('/search/products?limit=24'),
    staleTime: 60 * 1000,
  });

  // 5. Real Categories Query
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: CategoryRecord[] }>('/categories'),
    staleTime: 5 * 60 * 1000,
  });

  // 6. Real Verified Suppliers Query
  const { data: suppliersData, isLoading: isSuppliersLoading } = useQuery({
    queryKey: ['dashboard-verified-suppliers'],
    queryFn: () => api.get<{ suppliers: SupplierRecord[] }>('/suppliers'),
    staleTime: 60 * 1000,
  });

  const orders = ordersData?.orders ?? [];
  const lastPo = useMemo(() => {
    const eligible = orders.filter((o) =>
      ['delivered', 'completed'].includes(o.status.toLowerCase()),
    );
    if (!eligible.length) return null;
    return eligible.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
  }, [orders]);

  async function repeatLastPo() {
    if (!lastPo) return;
    setReordering(true);
    try {
      await api.post(`/purchase-orders/${lastPo.id}/reorder`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['business-orders-dash'] }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]);
      toast.show(toast.success('Reorder placed', 'New order(s) are now in your orders list.'));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : 'Could not reorder — some items may no longer be available.';
      toast.show(toast.error(msg));
    } finally {
      setReordering(false);
    }
  }

  const stats = useMemo(() => {
    const inFlight = orders.filter((o) =>
      ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'dispatched'].includes(o.status)
    ).length;
    const completed = orders.filter((o) => ['completed', 'delivered'].includes(o.status)).length;
    const disputed = orders.filter((o) => o.status === 'disputed').length;
    const pending = orders.filter((o) => o.status === 'pending').length;
    const lifetimeCents = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((a, b) => a + b.totalCents, 0);
    return { total: orders.length, inFlight, completed, disputed, pending, lifetimeCents };
  }, [orders]);

  const monthlyBuckets = spendData?.buckets ?? [];
  const monthlyValues = monthlyBuckets.map((b) => b.totalCents);
  const monthlyLabels = monthlyBuckets.map((b) => {
    const [, mm] = b.month.split('-');
    return MONTH_LABELS[Number(mm) - 1] ?? b.month;
  });
  const recent = orders.slice(0, 6);

  const categories = categoriesData?.categories ?? [];
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  const [spotlightCategory, setSpotlightCategory] = useState<string>('all');
  const hits = productsData?.hits ?? [];
  const filteredHits = useMemo(() => {
    if (spotlightCategory === 'all') return hits;
    return hits.filter((h) => h.product.categoryId === spotlightCategory);
  }, [hits, spotlightCategory]);

  const suppliers = dedupeSuppliers(suppliersData?.suppliers ?? []);

  // Derived real logistics depot network from actual verified suppliers
  const depotNetwork = useMemo(() => {
    if (suppliers.length > 0) {
      return suppliers.map((s) => ({
        id: s.id,
        name: `${s.name} (${s.district})`,
        city: s.city,
        district: s.district,
        time: s.district.toLowerCase().includes('colombo') ? 'Same-day staged' : '24h - 48h dispatch',
        status: s.status === 'active' ? 'Active Dispatch' : 'Standby',
      }));
    }
    return [
      { id: '1', name: 'Kurunegala Grain Terminal', city: 'Kurunegala', district: 'Kurunegala', time: '24h dispatch', status: 'Active Dispatch' },
      { id: '2', name: 'Colombo Port Central Dock', city: 'Colombo', district: 'Colombo', time: 'Same-day staged', status: 'Active Dispatch' },
      { id: '3', name: 'Central Kandy Tea Estate', city: 'Kandy', district: 'Kandy', time: '48h freight', status: 'Active Dispatch' },
    ];
  }, [suppliers]);

  if (!user) {
    return (
      <div className="max-w-xl py-12">
        <div className="vyro-kicker">Command</div>
        <h2 className="mt-2 vyro-display text-4xl">Sign in to your command center.</h2>
        <p className="mt-3 text-ink-4">Procurement, orders and supplier movement live here.</p>
        <Link to="/login" className="mt-6 inline-block">
          <Button>Sign in</Button>
        </Link>
      </div>
    );
  }

  const hasSupplier = (user?.supplierMemberships?.length ?? 0) > 0;
  const supplier = user?.supplierMemberships?.[0];

  // If user has not yet registered or connected a purchasing business
  if (!businessId) {
    return (
      <div className="space-y-8 max-w-6xl">
        {/* Top Supplier Notice Banner if user is already a supplier */}
        {hasSupplier && (
          <div className="p-5 bg-ink text-paper border border-volt/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md rounded-xl">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-volt text-ink flex items-center justify-center font-bold shrink-0 rounded-lg">
                <StoreIcon size={20} />
              </div>
              <div>
                <div className="vyro-kicker text-volt">Active Supplier Facility</div>
                <h3 className="font-display text-lg text-paper font-semibold">
                  {supplier?.supplierName}
                </h3>
                <p className="text-xs text-paper/70">
                  Role: <span className="capitalize font-mono text-volt">{supplier?.role}</span> · Facility ID: {supplier?.supplierId}
                </p>
              </div>
            </div>
            <Link to="/supplier/orders">
              <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs">
                Open Supplier Dispatch Console →
              </Button>
            </Link>
          </div>
        )}

        {/* Page Header */}
        <PageHeader
          kicker="Command Center · Workspace Activation"
          title="Activate your commercial command center."
          sub={`Welcome, ${user.name || 'Operator'}. Connect a registered purchasing entity or list your wholesale facility to unlock live PO issuing, multi-supplier cart splitting, and real-time freight tracking.`}
          actions={
            <Link to="/search">
              <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-semibold">
                Explore Catalog First →
              </Button>
            </Link>
          }
        />

        {/* Executive Activation Banner */}
        <Surface kind="ink" className="p-8 sm:p-10 relative overflow-hidden grain">
          <div className="absolute inset-0 opacity-25 pointer-events-none">
            <FlowCanvas tone="paper" density="hero" />
          </div>
          <div className="relative z-10 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-paper/10 border border-paper/15 text-xs text-volt rounded-md">
                <span className="size-2 rounded-full bg-volt animate-pulse" />
                <span className="vyro-kicker text-volt">National B2B Operating Layer</span>
              </div>
              <h2 className="vyro-display text-3xl sm:text-4xl text-paper leading-tight">
                Sri Lanka's direct wholesale procurement network.
              </h2>
              <p className="text-sm text-paper/75 leading-relaxed max-w-xl">
                VYRO connects commercial kitchens, hotel chains, supermarket groups, and regional grocers directly to primary agricultural millers and authorized distributors across all 25 districts with zero hidden middleman markup.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {[
                  { label: 'Coverage', val: '25 Districts' },
                  { label: 'Broker Cut', val: '0% Direct' },
                  { label: 'Invoicing', val: 'SVAT Digital' },
                  { label: 'Setup Time', val: '< 2 Minutes' },
                ].map((s) => (
                  <div key={s.label} className="p-3 bg-paper/5 border border-paper/10 rounded-lg">
                    <span className="vyro-metric text-lg text-paper font-bold block">{s.val}</span>
                    <span className="text-[10px] text-paper/50 uppercase tracking-wider block mt-0.5">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative overflow-hidden border border-paper/20 group h-64 sm:h-72 shadow-2xl rounded-xl">
                <img
                  src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
                  alt="Audited wholesale distribution depot"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 p-3 bg-void/85 backdrop-blur-md border border-paper/15 space-y-1 rounded-lg">
                  <span className="text-[9px] font-mono text-volt uppercase tracking-wider block">Audited Mill Infrastructure</span>
                  <div className="text-xs font-display text-paper font-semibold">Direct Factory-to-Dock Freight</div>
                  <p className="text-[11px] text-paper/70 line-clamp-1">Kurunegala grain mills & Colombo central depots live on the network.</p>
                </div>
              </div>
            </div>
          </div>
        </Surface>

        {/* Dual-Track Workspace Setup Cards */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Card 1: Commercial Buyer */}
          <Surface kind="elevated" className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-ink/10">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-ink text-volt flex items-center justify-center rounded-lg">
                    <Building2Icon size={20} />
                  </div>
                  <div>
                    <div className="vyro-kicker text-volt-deep">Buyer Workspace Track</div>
                    <h3 className="font-display text-xl text-ink font-semibold">
                      Register Commercial Purchasing Entity
                    </h3>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-volt text-ink rounded-md">
                  Recommended
                </span>
              </div>

              <p className="text-xs text-ink-3 leading-relaxed">
                For restaurants, hotel resorts, catering kitchens, bakery chains, and retail supermarkets purchasing food commodities, beverage stocks, and packaging in bulk.
              </p>

              <div className="space-y-2.5 p-4 bg-paper/70 border border-ink/10 rounded-lg">
                <span className="text-[10px] font-mono text-copper uppercase tracking-wider block font-bold">
                  What you unlock upon registration:
                </span>
                <ul className="space-y-2 text-xs text-ink-2">
                  <li className="flex items-start gap-2">
                    <CheckIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
                    <span><strong>Mill-Gate Rates:</strong> Direct pricing on rice, sugar, tea, flour, and spices with zero broker margin.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
                    <span><strong>Automated PO Split:</strong> Order across multiple millers in one checkout; VYRO generates independent legally-binding POs.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
                    <span><strong>Dockside Goods Receipt (GRN):</strong> Live driver plate assignments and electronic sign-off upon pallet receiving.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-ink/10 space-y-3">
              <Link to="/onboarding/business" className="block">
                <Button className="w-full bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs py-3">
                  Register Your Business Now (2 min) →
                </Button>
              </Link>
              <div className="flex items-center justify-between text-[11px] text-ink-4">
                <span>Free registration · No subscription fee</span>
                <Link to="/how-it-works" className="text-ink hover:underline font-medium">
                  Learn procurement flow →
                </Link>
              </div>
            </div>
          </Surface>

          {/* Card 2: Wholesale Supplier */}
          <Surface kind="elevated" className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-ink/10">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-ink text-copper flex items-center justify-center rounded-lg">
                    <StoreIcon size={20} />
                  </div>
                  <div>
                    <div className="vyro-kicker text-copper">Supplier Workspace Track</div>
                    <h3 className="font-display text-xl text-ink font-semibold">
                      Register Wholesale Supplier Facility
                    </h3>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-mist text-ink border border-line rounded-md">
                  Suppliers
                </span>
              </div>

              <p className="text-xs text-ink-3 leading-relaxed">
                For rice millers, tea estates, certified food importers, commercial packaging factories, and authorized regional wholesale distribution hubs.
              </p>

              <div className="space-y-2.5 p-4 bg-paper/70 border border-ink/10 rounded-lg">
                <span className="text-[10px] font-mono text-copper uppercase tracking-wider block font-bold">
                  What your facility receives:
                </span>
                <ul className="space-y-2 text-xs text-ink-2">
                  <li className="flex items-start gap-2">
                    <CheckIcon size={14} className="text-copper shrink-0 mt-0.5" />
                    <span><strong>Direct Purchase Orders:</strong> Automated high-volume demand from verified hotels, restaurants, and retail networks.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={14} className="text-copper shrink-0 mt-0.5" />
                    <span><strong>Warehouse Dispatch Console:</strong> Instant digital staging manifests, driver vehicle assignments, and route logs.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon size={14} className="text-copper shrink-0 mt-0.5" />
                    <span><strong>Guaranteed Settlement:</strong> Protected payment milestones and contract terms with 0% platform commission.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-ink/10 space-y-3">
              <Link to="/onboarding/supplier" className="block">
                <Button variant="secondary" className="w-full text-ink hover:bg-ink hover:text-paper font-bold uppercase tracking-wider text-xs py-3">
                  List as Authorized Supplier Facility →
                </Button>
              </Link>
              <div className="flex items-center justify-between text-[11px] text-ink-4">
                <span>Direct mill onboarding · Island-wide dispatch</span>
                <Link to="/about" className="text-ink hover:underline font-medium">
                  About the network →
                </Link>
              </div>
            </div>
          </Surface>
        </div>

        {/* Live Catalog Spot Prices Preview (Live Endpoint Data) */}
        <Surface kind="flat" className="p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-ink/10">
            <div>
              <div className="vyro-kicker text-copper">Open Wholesale Catalog</div>
              <h3 className="font-display text-xl text-ink font-semibold mt-0.5">
                Live wholesale spot prices moving across Sri Lanka
              </h3>
            </div>
            <Link to="/search">
              <Button variant="outline" size="sm" className="text-xs uppercase tracking-wider font-semibold">
                Browse Full Catalog ({hits.length} Live Products) →
              </Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {hits.slice(0, 4).map((hit) => {
              const best = hit.bestOffer;
              const catName = categoryMap.get(hit.product.categoryId || '') || 'Wholesale';
              return (
                <Link
                  key={hit.product.id}
                  to={`/products/${hit.product.id}`}
                  className="group p-3 bg-paper border border-ink/10 hover:border-ink transition-all duration-200 block space-y-3 rounded-xl"
                >
                  <div className="relative h-32 overflow-hidden bg-mist rounded-lg">
                    <ProductImage
                      src={hit.product.imageUrl || FALLBACK_PRODUCT_IMAGE}
                      alt={hit.product.name}
                      seed={hit.product.id}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-ink/90 text-paper border border-paper/20 rounded-md">
                      {catName}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-display text-sm font-semibold text-ink group-hover:text-copper transition-colors truncate">
                      {hit.product.name}
                    </h4>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="vyro-metric font-bold text-base text-ink">
                        {best ? formatLKR(best.priceCents) : 'Quote only'}
                      </span>
                        <span className="text-xs text-ink-4">/ {hit.product.unit}</span>
                    </div>
                    <span className="text-[10px] text-ink-4 flex items-center gap-1 truncate mt-1">
                      <MapPinIcon size={11} className="shrink-0 text-copper" />
                      {best?.supplier?.district ? `${best.supplier.district} Depot` : 'Island-wide Depot'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Surface>
      </div>
    );
  }

  const cartItemsCount = cartData?.items?.length ?? 0;
  const cartTotalCents = cartData?.totalCents ?? 0;

  return (
    <div className="space-y-8">
      {/* Executive Command Header */}
      <PageHero
        icon={Building2Icon}
        kicker="Commercial Command Center"
        title={businessName}
        description={`${greetingForNow()}, ${user.name || 'Purchasing Director'} — issue POs, split carts across suppliers, and track freight to your receiving dock.`}
        status={<HeroStatusPill label="Verified · SVAT Ready" tone="mint" />}
        actions={
          <>
            <Link to="/cart" className={heroActionClass}>
              <ShoppingCartIcon size={13} />
              {cartItemsCount > 0 ? `Cart · ${formatLKR(cartTotalCents)}` : 'Cart'}
              {cartItemsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-md bg-volt text-ink font-mono font-bold text-[10px]">
                  {cartItemsCount}
                </span>
              )}
            </Link>
            {hasSupplier && (
              <Link to="/supplier" className={heroActionClass} title={supplier?.supplierId}>
                <StoreIcon size={13} />
                {supplier?.supplierName ?? 'Supplier console'}
              </Link>
            )}
            {lastPo && (
              <button
                type="button"
                className={heroActionClass}
                disabled={reordering}
                onClick={() => void repeatLastPo()}
              >
                <RefreshCwIcon size={13} className={reordering ? 'animate-spin' : ''} />
                Repeat last PO
              </button>
            )}
            <Link
              to="/search"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-volt px-3 text-xs font-bold text-ink uppercase tracking-wider transition-colors hover:bg-volt-glow"
            >
              Start Procurement
            </Link>
          </>
        }
        footer={
          <>
            <span>Escrow-protected settlement on dockside GRN</span>
            <span className="text-paper/40">
              {stats.total} PO{stats.total === 1 ? '' : 's'} · {stats.inFlight} in flight · {formatCompactLKR(stats.lifetimeCents)} lifetime
            </span>
          </>
        }
      />

      {/* Fast-Track First Purchase Order Hero (prominent when 0 orders on record) */}
      {stats.total === 0 && (
        <Surface kind="ink" className="p-6 sm:p-8 relative overflow-hidden grain shadow-xl">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <FlowCanvas tone="paper" density="hero" />
          </div>
          <div className="relative z-10 grid lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-paper/10 border border-paper/15 text-xs text-volt rounded-md">
                <SparklesIcon size={14} />
                <span className="vyro-kicker text-volt">Fast-Track First Purchase Order</span>
              </div>
              <h2 className="vyro-display text-2xl sm:text-3xl text-paper leading-tight">
                Source direct from verified Sri Lankan millers & distributors.
              </h2>
              <p className="text-xs sm:text-sm text-paper/75 leading-relaxed max-w-xl">
                Your commercial purchasing account for <strong className="text-paper">{businessName}</strong> is active. You can now issue legally-binding POs, order across multiple factories in a single checkout, and track road freight directly to your receiving dock.
              </p>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 pt-1">
                <div className="p-2 sm:p-3 bg-paper/5 border border-paper/10 space-y-1 rounded-lg">
                  <span className="text-[9px] sm:text-[10px] font-mono text-volt uppercase tracking-wider block">Step 1</span>
                  <div className="text-[11px] sm:text-xs font-display text-paper font-semibold leading-tight">Select Products</div>
                  <span className="text-[9px] sm:text-[10px] text-paper/50 block leading-tight">Mill-gate wholesale rates</span>
                </div>
                <div className="p-2 sm:p-3 bg-paper/5 border border-paper/10 space-y-1 rounded-lg">
                  <span className="text-[9px] sm:text-[10px] font-mono text-volt uppercase tracking-wider block">Step 2</span>
                  <div className="text-[11px] sm:text-xs font-display text-paper font-semibold leading-tight">Auto-Split PO</div>
                  <span className="text-[9px] sm:text-[10px] text-paper/50 block leading-tight">Automated vendor routing</span>
                </div>
                <div className="p-2 sm:p-3 bg-paper/5 border border-paper/10 space-y-1 rounded-lg">
                  <span className="text-[9px] sm:text-[10px] font-mono text-volt uppercase tracking-wider block">Step 3</span>
                  <div className="text-[11px] sm:text-xs font-display text-paper font-semibold leading-tight">Dock GRN Signoff</div>
                  <span className="text-[9px] sm:text-[10px] text-paper/50 block leading-tight">Pallet receipt on arrival</span>
                </div>
              </div>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Link to="/search">
                  <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs py-2.5">
                    Explore Wholesale Catalog
                  </Button>
                </Link>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-paper/60">
                  <SparklesIcon size={12} className="text-volt" />
                  {hits.length > 0
                    ? `${hits.length} commodit${hits.length === 1 ? 'y' : 'ies'} ready for immediate dispatch`
                    : 'No live commodities in stock — try the catalog'}
                </span>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="relative overflow-hidden border border-paper/20 group h-56 sm:h-64 shadow-2xl rounded-xl">
                <img
                  src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
                  alt="Wholesale Distribution Depot"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 p-3 bg-void/85 backdrop-blur-md border border-paper/15 space-y-1 rounded-lg">
                  <span className="text-[9px] font-mono text-volt uppercase tracking-wider block">Audited Logistics Network</span>
                  <div className="text-xs font-display text-paper font-semibold">Kurunegala, Colombo & Kandy Terminals</div>
                  <p className="text-[11px] text-paper/70">Average freight transit time: 24 to 48 hours island-wide.</p>
                </div>
              </div>
            </div>
          </div>
        </Surface>
      )}

      {/* Operational Metrics & Spend Row */}
      <div className="grid lg:grid-cols-12 gap-4">
        {/* Lifetime Spend Card (Real PO Aggregation) */}
        <Surface kind="ink" className="lg:col-span-7 p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-volt font-mono font-semibold">
                Lifetime Procurement Spend
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono text-paper/70 bg-paper/10 border border-paper/15 rounded-md">
                {stats.total} {stats.total === 1 ? 'PO' : 'POs'} on record
              </span>
            </div>
            <MetricNumber size="xl" className="mt-3 text-paper break-words">
              {formatCompactLKR(stats.lifetimeCents)}
            </MetricNumber>
            <p className="mt-2 text-paper/60 text-xs">
              {stats.total === 0
                ? 'Account active. Real spend analytics and purchase tracking will calibrate upon your first order.'
                : `${formatLKR(stats.lifetimeCents)} total gross volume cleared through VYRO.`}
            </p>
          </div>
          <div className="mt-6 pt-5 border-t border-paper/10">
            <div className="text-[10px] font-mono text-paper/50 uppercase tracking-wider mb-2">
              Procurement Cycle Pipeline
            </div>
            <FlowLine
              tone="paper"
              nodes={[
                { label: 'Catalog Selection', state: 'done' },
                { label: 'PO Approval', state: stats.inFlight > 0 ? 'active' : stats.total > 0 ? 'done' : 'idle' },
                { label: 'Freight Transit', state: stats.inFlight > 0 ? 'active' : 'idle' },
                { label: 'Dock GRN', state: stats.completed > 0 ? 'done' : 'idle' },
              ]}
            />
          </div>
        </Surface>

        {/* Operational Action Queue (Real Order Statuses) */}
        <Surface kind="floating" className="lg:col-span-5 p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/10">
              <div className="vyro-kicker">Operational Action Queue</div>
              <span className="text-[10px] font-mono text-ink-4">Live Sync</span>
            </div>
            <MetricStack
              className="mt-4"
              items={[
                { label: 'Awaiting supplier confirmation', value: String(stats.pending), accent: stats.pending > 0 ? 'amber' : 'ink' },
                { label: 'In freight transit', value: String(stats.inFlight), accent: 'volt' },
                { label: 'Quality or item disputes', value: String(stats.disputed), accent: stats.disputed > 0 ? 'rose' : 'ink' },
              ]}
            />
          </div>
          <div className="mt-6 pt-4 border-t border-ink/10 flex items-center justify-between">
            <Link to="/orders" className="text-xs font-semibold text-copper hover:underline flex items-center gap-1">
              Review all orders <ArrowRightIcon size={12} />
            </Link>
            <span className="text-[11px] text-ink-4 font-mono">
              Completed: {stats.completed}
            </span>
          </div>
        </Surface>

        {/* Real Monthly Spend Trajectory Chart */}
        <Surface kind="flat" className="lg:col-span-8 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-xl sm:text-2xl text-ink">Procurement Activity</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-mist text-ink border border-line rounded-md">
                  12-Month Trajectory
                </span>
              </div>
              <p className="text-xs text-ink-4 mt-1">Monthly wholesale purchasing volume & seasonal trend</p>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="text-[10px] font-mono text-ink-4 block uppercase tracking-wider">Trailing Spend</span>
              <span className="vyro-metric text-lg text-copper font-bold break-words">
                {formatCompactLKR(monthlyValues.reduce((a, b) => a + b, 0))}
              </span>
            </div>
          </div>
          {monthlyValues.some((v) => v > 0) ? (
            <TimeSeries values={monthlyValues} labels={monthlyLabels} tone="cyan" height={175} formatValue={(v: number) => formatLKR(v)} />
          ) : (
            <div className="border border-ink/10 bg-paper/60 p-5 space-y-4 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-volt/25 text-ink flex items-center justify-center font-bold shrink-0 rounded-lg">
                    <TrendingUpIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-ink">
                      Wholesale Market Benchmark · Sri Lanka
                    </h3>
                    <p className="text-xs text-ink-4">
                      Live volume curve will calibrate as you order. Current commodity market conditions:
                    </p>
                  </div>
                </div>
                <Link to="/search">
                  <Button size="sm" variant="secondary" className="text-xs font-semibold">
                    View Spot Prices
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                {[
                  { label: 'Active Catalog', val: `${hits.length} SKUs`, sub: 'Direct from millers' },
                  { label: 'Audited Hubs', val: `${suppliers.length} Depots`, sub: 'Kurunegala, CMB, Kandy' },
                  { label: 'Average Transit', val: '24h - 48h', sub: 'Island-wide freight' },
                  { label: 'SVAT Digital', val: '0% Net', sub: 'IRD-compliant tax invoices' },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 bg-paper border border-ink/10 rounded-lg">
                    <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider block">{stat.label}</span>
                    <span className="vyro-metric text-base font-bold text-ink block mt-0.5">{stat.val}</span>
                    <span className="text-[10px] text-ink-4 block">{stat.sub}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>

        {/* Wholesale Logistics & Depots Status (Real Suppliers) */}
        <Surface kind="flat" className="lg:col-span-4 p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/10">
              <div className="flex items-center gap-2">
                <TruckIcon size={16} className="text-copper" />
                <h3 className="font-display text-lg text-ink font-semibold">Depot Network</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-mint font-bold uppercase">
                <span className="size-1.5 rounded-full bg-mint animate-pulse" /> All Normal
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {depotNetwork.map((depot) => (
                <div
                  key={depot.id}
                  className="flex items-center gap-3 p-2.5 bg-paper/80 border border-ink/10 text-xs rounded-lg transition-colors hover:border-ink/25"
                >
                  <span className="size-8 shrink-0 rounded-md bg-ink/[0.05] text-ink-3 flex items-center justify-center">
                    <MapPinIcon size={14} />
                  </span>
                  <div className="truncate pr-2 flex-1 min-w-0">
                    <span className="font-semibold text-ink block truncate">{depot.name}</span>
                    <span className="text-[10px] text-ink-4">{depot.city} · {depot.time}</span>
                  </div>
                  <span
                    className={
                      depot.status === 'Active Dispatch'
                        ? 'inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-mint/15 text-mint border border-mint/30 shrink-0 rounded-md'
                        : 'inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-mist text-ink-3 border border-line shrink-0 rounded-md'
                    }
                  >
                    {depot.status === 'Active Dispatch' && <span className="size-1 rounded-full bg-mint" />}
                    {depot.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-ink/10">
            <Link to="/about" className="text-[11px] text-ink-3 hover:text-ink font-medium flex items-center justify-between">
              <span>View nationwide freight coverage map</span>
              <ArrowRightIcon size={12} />
            </Link>
          </div>
        </Surface>
      </div>

      {/* Live Wholesale Commodity Spotlight (Connected to Real Catalog Endpoint) */}
      <Surface kind="flat" className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-ink/10">
          <div className="min-w-0">
            <div className="vyro-kicker text-copper">Wholesale Commodity Spot Ticker</div>
            <h2 className="font-display text-xl sm:text-2xl text-ink font-semibold mt-0.5">
              Factory & Mill-Gate Pricing Available Now
            </h2>
            <p className="text-xs text-ink-4 mt-0.5">
              Current audited wholesale spot prices across key Sri Lankan commercial commodity categories.
            </p>
          </div>
          {/* Dynamic Category Tabs */}
          <div className="-mx-4 sm:mx-0 overflow-x-auto pb-1 scrollbar-hide">
            <div className="inline-flex items-center gap-1 p-1 mx-4 sm:mx-0 bg-ink/[0.05] rounded-full min-w-max">
              <button
                type="button"
                onClick={() => setSpotlightCategory('all')}
                className={`shrink-0 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-150 ${
                  spotlightCategory === 'all'
                    ? 'bg-paper text-ink shadow-sm'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                All Items ({hits.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSpotlightCategory(cat.id)}
                  className={`shrink-0 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-150 ${
                    spotlightCategory === cat.id
                      ? 'bg-paper text-ink shadow-sm'
                      : 'text-ink-4 hover:text-ink'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isProductsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-paper border border-ink/10 rounded-xl overflow-hidden animate-pulse">
                <div className="h-44 bg-mist" />
                <div className="p-4 space-y-2.5">
                  <div className="h-4 w-3/4 bg-mist rounded" />
                  <div className="h-3 w-1/2 bg-mist rounded" />
                  <div className="h-6 w-1/3 bg-mist rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredHits.length === 0 ? (
          <EmptyState
            icon={<PackageIcon size={24} />}
            title="No listings in this category"
            description="No active commodity listings match this filter right now."
            action={
              <Link to="/search">
                <Button variant="secondary" size="sm" className="text-xs">
                  Browse Full Catalog
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredHits.map((hit) => {
              const best = hit.bestOffer;
              const catName = categoryMap.get(hit.product.categoryId || '') || 'Wholesale';
              const adding = pendingKey === best?.id;
              return (
                <article
                  key={hit.product.id}
                  className="group bg-paper border border-ink/10 hover:border-ink transition-all duration-200 overflow-hidden rounded-xl shadow-sm hover:shadow-md flex flex-col"
                >
                  <Link to={`/products/${hit.product.id}`} className="relative h-44 overflow-hidden bg-mist block">
                    <ProductImage
                      src={resolveCatalogImage(hit.product.id, hit.product.imageUrl) || FALLBACK_PRODUCT_IMAGE}
                      alt={hit.product.name}
                      seed={hit.product.id}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity pointer-events-none" />
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-ink/90 text-paper border border-paper/20 backdrop-blur-sm rounded-md">
                      {catName}
                    </span>
                    <span className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 text-xs font-mono bg-paper/90 text-ink backdrop-blur-sm rounded-md">
                      {best ? `${best.minOrderQty} ${hit.product.unit} min` : 'Custom MOQ'}
                    </span>
                  </Link>

                  <div className="p-4 space-y-3 flex-1 flex flex-col">
                    <div>
                      <Link to={`/products/${hit.product.id}`}>
                        <h3 className="font-display text-base font-semibold text-ink group-hover:text-copper transition-colors truncate">
                          {hit.product.name}
                        </h3>
                      </Link>
                      <p className="text-[11px] text-ink-4 flex items-center gap-1 mt-0.5 truncate">
                        <StoreIcon size={12} className="text-copper shrink-0" />
                        <span className="truncate">
                          {best?.supplier?.name || (hit.offerCount > 0 ? `${hit.offerCount} verified suppliers` : 'Direct Factory')}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-baseline justify-between pt-2 border-t border-ink/10">
                      <div className="flex items-baseline gap-1">
                        <span className="vyro-metric font-bold text-xl text-ink">
                          {best ? formatLKR(best.priceCents) : 'Quote only'}
                        </span>
                        <span className="text-xs text-ink-4">/ {hit.product.unit}</span>
                      </div>
                      <span className="text-xs font-mono text-mint bg-mint/10 px-1.5 py-0.5 border border-mint/30 rounded-md">
                        {best ? `${best.leadTimeDays * 24}h dispatch` : 'Immediate'}
                      </span>
                    </div>

                    <div className="pt-2 mt-auto flex items-center gap-2">
                      <Link
                        to={`/products/${hit.product.id}`}
                        className="flex-1 text-[11px] font-bold text-ink flex items-center gap-0.5 hover:text-copper"
                      >
                        {best?.supplier?.district ? `${best.supplier.district} Depot` : 'Island-wide'}
                        <ArrowRightIcon size={12} />
                      </Link>
                      {best && (
                        <Button
                          type="button"
                          size="sm"
                          className="text-[11px] uppercase tracking-wider font-bold"
                          loading={adding}
                          onClick={() =>
                            addToCart({
                              productId: hit.product.id,
                              supplierProductId: best.id,
                              quantity: best.minOrderQty || 1,
                              productName: hit.product.name,
                            })
                          }
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="p-4 bg-mist/60 border border-line flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-ink text-volt flex items-center justify-center font-bold shrink-0 rounded-lg">
              <PackageIcon size={16} />
            </div>
            <p className="text-xs text-ink-2">
              Looking for custom grain specifications, private label tea packaging, or palletized bulk sugar?
            </p>
          </div>
          <Link to="/search">
            <Button variant="outline" size="sm" className="text-xs font-semibold whitespace-nowrap">
              Browse Full Catalog ({hits.length}+ Items) →
            </Button>
          </Link>
        </div>
      </Surface>

      {/* Verified Millers & Authorized Primary Distributors (Connected to Real /api/suppliers) */}
      <Surface kind="flat" className="p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-ink/10">
          <div className="min-w-0">
            <div className="vyro-kicker text-volt-deep">Audited Supplier Facilities</div>
            <h2 className="font-display text-xl sm:text-2xl text-ink font-semibold mt-0.5">
              Verified Millers & Authorized Primary Distributors
            </h2>
            <p className="text-xs text-ink-4 mt-0.5">
              Direct factory accounts verified with SVAT compliance and audited dispatch depots across Sri Lanka.
            </p>
          </div>
          <Link to="/search">
            <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-semibold">
              Filter by Supplier →
            </Button>
          </Link>
        </div>

        {isSuppliersLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-paper border border-ink/10 rounded-xl p-4 space-y-3 animate-pulse">
                <div className="h-36 bg-mist rounded-lg" />
                <div className="h-4 w-2/3 bg-mist rounded" />
                <div className="h-3 w-1/3 bg-mist rounded" />
              </div>
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState
            icon={<StoreIcon size={24} />}
            title="No supplier facilities"
            description="No verified supplier facilities are registered on the network yet."
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {suppliers.map((sup) => {
              const photo = SUPPLIER_PHOTOS[sup.id] || DEFAULT_SUPPLIER_PHOTO;
              return (
                <Link
                  key={sup.id}
                  to={`/search?q=${encodeURIComponent(sup.name)}`}
                  className="group p-4 bg-paper border border-ink/10 hover:border-ink transition-all duration-200 block space-y-3 rounded-xl shadow-sm hover:shadow-md"
                >
                  <div className="relative h-36 overflow-hidden bg-mist rounded-lg">
                    <img
                      src={photo}
                      alt={sup.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-ink text-volt border border-volt/20 rounded-md">
                      {sup.verificationStatus === 'verified' ? 'Verified Hub' : 'Audited Facility'}
                    </span>
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 text-[9px] font-mono font-bold bg-paper/90 text-ink backdrop-blur-sm rounded-md">
                      {sup.activeListingsCount ? `${sup.activeListingsCount} listings` : 'Primary Hub'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-display text-sm font-semibold text-ink group-hover:text-copper transition-colors truncate">
                      {sup.name}
                    </h3>
                    <span className="text-[11px] text-ink-4 flex items-center gap-1">
                      <MapPinIcon size={11} /> {sup.city}, {sup.district}
                    </span>
                    <p className="text-[11px] text-ink-3 line-clamp-2 pt-1 border-t border-ink/5">
                      {sup.description || 'Direct wholesale supply and logistics fulfillment facility.'}
                    </p>
                    <div className="pt-2 flex items-center justify-between text-[10px] font-mono text-ink-4">
                      <span>{sup.address || `${sup.city}, Sri Lanka`}</span>
                      <span className="text-copper font-bold group-hover:underline">View catalog →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Surface>

      {/* Recent Orders (Real Purchase Orders) */}
      {orders.length > 0 && (
        <Surface kind="flat" className="p-0 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 border-b border-ink/10">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h2 className="font-display text-base sm:text-xl text-ink">Recent Purchase Orders</h2>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-mist text-ink border border-line shrink-0 rounded-md">
                {orders.length} Total
              </span>
            </div>
            <Link to="/orders" className="text-xs text-copper font-semibold hover:underline whitespace-nowrap shrink-0">
              View all orders →
            </Link>
          </div>
          <ul>
            {recent.map((o) => (
              <li key={o.id} className="border-b border-ink/5 last:border-0">
                <Link to={`/orders/${o.id}`} className="block sm:flex sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-3.5 hover:bg-mist/60 transition-colors">
                  <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4 sm:flex-1 sm:min-w-0">
                    <span className="vyro-metric text-sm font-bold truncate min-w-0">{o.poNumber}</span>
                    <span className="sm:flex-1 sm:min-w-0">
                      <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                    </span>
                  </div>
                  <div className="mt-1.5 sm:mt-0 flex items-center justify-between gap-3 sm:gap-4">
                    <span className="text-[11px] sm:text-xs text-ink-4 truncate min-w-0 flex-1 sm:flex-initial sm:max-w-[12rem]">
                      {o.supplierName || 'Primary Supplier'}
                    </span>
                    <span className="vyro-metric text-sm font-semibold shrink-0">{formatCompactLKR(o.totalCents)}</span>
                    <ArrowRightIcon size={14} className="text-ink-4 shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      {/* Quick Actions & Operational Tool Bar */}
      <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          {
            to: '/search',
            icon: <PackageIcon size={18} />,
            tint: 'bg-copper/15 text-copper',
            title: 'Fast Replenishment',
            body: 'Quickly reorder weekly commodity baskets like Keeri Samba, Sugar, and Packaging with 1 click.',
            cta: 'Open order templates',
          },
          {
            to: '/orders',
            icon: <ShieldCheckIcon size={18} />,
            tint: 'bg-volt/30 text-volt-deep',
            title: 'SVAT Digital E-Invoicing',
            body: 'Generate and export IRD-compliant SVAT purchase order tax invoices for your accounting team.',
            cta: 'Manage tax invoices',
          },
          {
            to: '/profile',
            icon: <Building2Icon size={18} />,
            tint: 'bg-ink/[0.07] text-ink',
            title: 'Receiving Docks & Team',
            body: 'Update your commercial delivery address, dock receiving hours, and team member permissions.',
            cta: 'Entity settings',
          },
        ].map((a) => (
          <Link
            key={a.title}
            to={a.to}
            className="group p-4 sm:p-5 bg-paper border border-ink/10 space-y-3 rounded-xl transition-all hover:border-ink/30 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className={`size-9 rounded-lg flex items-center justify-center ${a.tint}`}>
                {a.icon}
              </span>
              <ArrowRightIcon
                size={15}
                className="text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-copper"
              />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm text-ink">{a.title}</h3>
              <p className="text-xs text-ink-3 mt-1 leading-relaxed">{a.body}</p>
            </div>
            <span className="text-xs text-copper font-semibold inline-block group-hover:underline">
              {a.cta} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
