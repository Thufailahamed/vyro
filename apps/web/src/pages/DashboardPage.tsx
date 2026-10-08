import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn, useToast } from '@vyro/ui';
import { usePageTitle } from '@/lib/usePageTitle';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { TimeSeries, Button, StatusDots, PageHeader, EmptyState } from '@/components/ui';
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
import { formatLKR, greetingForNow } from '@/lib/format';
import { FlowCanvas } from '@/components/brand/FlowLine';
import { ProductImage, Surface } from '@/components/brand/Surface';
import { Amount } from '@/components/brand/Amount';
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
  const trailingCents = monthlyValues.reduce((a, b) => a + b, 0);
  const lastMonthCents = monthlyValues.at(-1) ?? 0;
  const prevMonthCents = monthlyValues.at(-2) ?? 0;
  const monthDelta = prevMonthCents > 0 ? ((lastMonthCents - prevMonthCents) / prevMonthCents) * 100 : null;
  const peakIndex = monthlyValues.length ? monthlyValues.indexOf(Math.max(...monthlyValues)) : -1;
  const firstName = (user.name || 'there').split(' ')[0];

  const queue = [
    {
      label: 'Awaiting supplier confirmation',
      hint: 'Supplier has not accepted yet',
      value: stats.pending,
      tone: 'amber' as const,
      icon: <PackageIcon size={15} />,
    },
    {
      label: 'In freight transit',
      hint: 'Accepted, preparing or on the road',
      value: stats.inFlight,
      tone: 'volt' as const,
      icon: <TruckIcon size={15} />,
    },
    {
      label: 'Quality or item disputes',
      hint: 'Needs your response',
      value: stats.disputed,
      tone: 'rose' as const,
      icon: <ShieldCheckIcon size={15} />,
    },
  ];
  const queueTone = {
    amber: 'bg-amber/[0.12] text-amber',
    volt: 'bg-volt/20 text-volt-deep',
    rose: 'bg-rose/[0.12] text-rose',
  };

  const pipeline = [
    { label: 'Catalog', state: 'done' as const },
    { label: 'PO approval', state: stats.inFlight > 0 ? ('active' as const) : stats.total > 0 ? ('done' as const) : ('idle' as const) },
    { label: 'Freight', state: stats.inFlight > 0 ? ('active' as const) : ('idle' as const) },
    { label: 'Dock GRN', state: stats.completed > 0 ? ('done' as const) : ('idle' as const) },
  ];

  return (
    <div className="space-y-6">
      {/* Executive command header */}
      <section className="relative overflow-hidden rounded-[22px] bg-ink text-paper shadow-[0_30px_70px_-35px_rgba(12,14,11,0.65)]">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-6rem] size-[28rem] rounded-full bg-volt/[0.14] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-copper/20 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(250,247,240,1)_1px,transparent_1px),linear-gradient(90deg,rgba(250,247,240,1)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_65%)]"
        />

        <div className="relative px-6 pt-7 pb-6 sm:px-9 sm:pt-9">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-7">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-volt">
                  <Building2Icon size={13} />
                  Command center
                </span>
                <span className="h-3 w-px bg-paper/20" />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-2.5 py-1 text-[11px] font-medium text-[#8FD3B6]">
                  <span className="size-1.5 rounded-full bg-[#8FD3B6] animate-pulse" />
                  Verified · SVAT ready
                </span>
              </div>
              <h1 className="mt-4 font-display text-[30px] sm:text-[40px] leading-[1.05] font-bold tracking-[-0.035em] text-paper">
                {greetingForNow()}, {firstName}.
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-paper/55">
                <span className="text-paper/85 font-medium">{businessName}</span> — issue POs, split carts across
                suppliers and track freight to your receiving dock.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
              {hasSupplier && (
                <Link to="/supplier" className={heroGhostClass} title={supplier?.supplierId}>
                  <StoreIcon size={14} />
                  <span className="max-w-[10rem] truncate">{supplier?.supplierName ?? 'Supplier console'}</span>
                </Link>
              )}
              {lastPo && (
                <button
                  type="button"
                  className={heroGhostClass}
                  disabled={reordering}
                  onClick={() => void repeatLastPo()}
                >
                  <RefreshCwIcon size={14} className={reordering ? 'animate-spin' : ''} />
                  Repeat last PO
                </button>
              )}
              <Link to="/cart" className={heroGhostClass}>
                <ShoppingCartIcon size={14} />
                {cartItemsCount > 0 ? (
                  <>
                    <span className="tabular-nums">{formatLKR(cartTotalCents)}</span>
                    <span className="grid min-w-5 h-5 place-items-center rounded-full bg-volt px-1.5 text-[10px] font-bold text-ink">
                      {cartItemsCount}
                    </span>
                  </>
                ) : (
                  'Cart'
                )}
              </Link>
              <Link
                to="/search"
                className="group inline-flex h-11 items-center gap-2 rounded-xl bg-volt pl-4 pr-3.5 text-sm font-semibold text-ink shadow-[0_10px_30px_-10px_rgba(198,220,74,0.6)] transition-all hover:bg-volt-glow hover:-translate-y-px"
              >
                Start procurement
                <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-px bg-paper/[0.08] border-t border-paper/[0.08]">
          {[
            {
              label: 'Lifetime spend',
              value: <Amount cents={stats.lifetimeCents} tone="dark" decimals={false} />,
              sub: `${stats.total} PO${stats.total === 1 ? '' : 's'} on record`,
            },
            {
              label: 'In flight',
              value: <span className="tabular-nums">{stats.inFlight}</span>,
              sub: 'Open purchase orders',
              accent: stats.inFlight > 0,
            },
            {
              label: 'Completed',
              value: <span className="tabular-nums">{stats.completed}</span>,
              sub: 'Received at your dock',
            },
            {
              label: 'Active cart',
              value: <Amount cents={cartTotalCents} tone="dark" decimals={false} />,
              sub: cartItemsCount > 0 ? `${cartItemsCount} line${cartItemsCount === 1 ? '' : 's'} ready to split` : 'Nothing staged yet',
            },
          ].map((k) => (
            <div key={k.label} className="bg-ink/95 px-6 sm:px-9 py-5">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-paper/45">
                {k.accent && <span className="size-1.5 rounded-full bg-volt animate-pulse" />}
                {k.label}
              </div>
              <div className="mt-2 text-[26px] sm:text-[30px] leading-none font-semibold tracking-[-0.03em] text-paper">
                {k.value}
              </div>
              <div className="mt-2 text-[12px] text-paper/40">{k.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Fast-track first purchase order (only when 0 orders on record) */}
      {stats.total === 0 && (
        <Surface kind="elevated" className="rounded-2xl p-6 sm:p-8">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full bg-volt/20 px-3 py-1 text-[11px] font-semibold text-volt-deep">
                <SparklesIcon size={13} />
                Fast-track your first PO
              </span>
              <h2 className="font-display text-2xl sm:text-[28px] leading-tight tracking-[-0.03em] text-ink">
                Source direct from verified Sri Lankan millers & distributors.
              </h2>
              <p className="text-[14px] text-ink-3 leading-relaxed max-w-xl">
                Your purchasing account for <strong className="text-ink">{businessName}</strong> is active. Issue
                legally-binding POs, order across multiple factories in one checkout, and track freight to your dock.
              </p>
              <ol className="grid grid-cols-3 gap-3">
                {[
                  { t: 'Select products', d: 'Mill-gate rates' },
                  { t: 'Auto-split PO', d: 'Per-supplier routing' },
                  { t: 'Dock GRN', d: 'Sign off on arrival' },
                ].map((s, i) => (
                  <li key={s.t} className="rounded-xl bg-ink/[0.03] p-3.5 ring-1 ring-inset ring-ink/[0.06]">
                    <span className="grid size-6 place-items-center rounded-full bg-ink text-[11px] font-semibold text-volt">
                      {i + 1}
                    </span>
                    <div className="mt-2.5 text-[13px] font-semibold text-ink leading-tight">{s.t}</div>
                    <div className="mt-0.5 text-[11px] text-ink-4">{s.d}</div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <Link
                  to="/search"
                  className="group inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-paper transition-all hover:-translate-y-px"
                >
                  Explore wholesale catalog
                  <ArrowRightIcon size={15} className="text-volt transition-transform group-hover:translate-x-0.5" />
                </Link>
                <span className="text-[12px] text-ink-4">
                  {hits.length > 0
                    ? `${hits.length} commodit${hits.length === 1 ? 'y' : 'ies'} ready for dispatch`
                    : 'No live commodities in stock — try the catalog'}
                </span>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="relative h-60 sm:h-72 overflow-hidden rounded-2xl group">
                <img
                  src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
                  alt="Wholesale distribution depot"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/30 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-paper">
                  <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-volt">Audited logistics</div>
                  <div className="mt-1 text-sm font-semibold">Kurunegala, Colombo & Kandy terminals</div>
                  <div className="text-[12px] text-paper/65">24–48h freight transit island-wide</div>
                </div>
              </div>
            </div>
          </div>
        </Surface>
      )}

      {/* Spend + action queue */}
      <div className="grid lg:grid-cols-12 gap-5">
        <Surface className="lg:col-span-8 rounded-2xl p-0 flex flex-col">
          <div className="px-6 sm:px-7 pt-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <SectionEyebrow>Procurement activity · 12 months</SectionEyebrow>
              <div className="mt-3 flex items-end gap-3 flex-wrap">
                <span className="text-[34px] sm:text-[40px] leading-none font-semibold tracking-[-0.035em] text-ink">
                  <Amount cents={trailingCents} decimals={false} />
                </span>
                {monthDelta !== null && (
                  <span
                    className={cn(
                      'mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums',
                      monthDelta >= 0 ? 'bg-mint/[0.12] text-mint' : 'bg-rose/[0.12] text-rose',
                    )}
                  >
                    <TrendingUpIcon size={12} className={monthDelta < 0 ? '-scale-y-100' : ''} />
                    {monthDelta >= 0 ? '+' : ''}
                    {monthDelta.toFixed(0)}% MoM
                  </span>
                )}
              </div>
              <p className="mt-2 text-[13px] text-ink-4">Trailing wholesale purchasing volume</p>
            </div>
            {monthlyValues.some((v) => v > 0) && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right shrink-0">
                <dt className="text-[11px] text-ink-4">This month</dt>
                <dt className="text-[11px] text-ink-4">Peak</dt>
                <dd className="text-[15px] font-semibold text-ink">
                  <Amount cents={lastMonthCents} decimals={false} />
                </dd>
                <dd className="text-[15px] font-semibold text-ink">{monthlyLabels[peakIndex] ?? '—'}</dd>
              </dl>
            )}
          </div>
          <div className="px-4 sm:px-5 pb-5 pt-4 flex-1">
            {monthlyValues.some((v) => v > 0) ? (
              <TimeSeries values={monthlyValues} labels={monthlyLabels} tone="cyan" height={200} formatValue={(v: number) => formatLKR(v)} />
            ) : (
              <div className="mx-2 rounded-xl bg-ink/[0.025] ring-1 ring-inset ring-ink/[0.06] p-5 space-y-4">
                <p className="text-[13px] text-ink-3">
                  Your volume curve calibrates as you order. Current network conditions:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Active catalog', val: `${hits.length} SKUs` },
                    { label: 'Audited hubs', val: `${suppliers.length} depots` },
                    { label: 'Avg. transit', val: '24–48h' },
                    { label: 'SVAT digital', val: '0% net' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg bg-paper p-3 ring-1 ring-inset ring-ink/[0.06]">
                      <div className="text-[11px] text-ink-4">{stat.label}</div>
                      <div className="mt-1 text-[15px] font-semibold text-ink">{stat.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Surface>

        <Surface className="lg:col-span-4 rounded-2xl p-0 flex flex-col">
          <div className="px-6 pt-6 pb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-[17px] font-bold text-ink">Action queue</h2>
              <p className="text-[12px] text-ink-4 mt-0.5">What needs attention right now</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 text-[11px] font-medium text-mint">
              <span className="size-1.5 rounded-full bg-mint animate-pulse" />
              Live
            </span>
          </div>
          <ul className="px-3 flex-1">
            {queue.map((q) => (
              <li key={q.label}>
                <Link
                  to="/orders"
                  className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-ink/[0.035] transition-colors"
                >
                  <span
                    className={cn(
                      'size-9 rounded-xl flex items-center justify-center shrink-0',
                      q.value > 0 ? queueTone[q.tone] : 'bg-ink/[0.05] text-ink-4',
                    )}
                  >
                    {q.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink-1 truncate">{q.label}</div>
                    <div className="text-[11px] text-ink-4 truncate">{q.hint}</div>
                  </div>
                  <span
                    className={cn(
                      'text-[22px] font-semibold tabular-nums tracking-[-0.02em]',
                      q.value > 0 ? 'text-ink' : 'text-ink-5',
                    )}
                  >
                    {q.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mx-6 mt-2 rounded-xl bg-ink/[0.03] ring-1 ring-inset ring-ink/[0.06] px-4 py-3.5">
            <div className="text-[11px] font-medium text-ink-4 mb-3">Procurement pipeline</div>
            <ol className="flex items-center">
              {pipeline.map((p, i) => (
                <li key={p.label} className="flex flex-1 last:flex-none items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full ring-2',
                        p.state === 'done' && 'bg-ink ring-ink text-volt',
                        p.state === 'active' && 'bg-volt ring-volt/40 animate-pulse',
                        p.state === 'idle' && 'bg-paper ring-ink/15',
                      )}
                    >
                      {p.state === 'done' && <CheckIcon size={11} />}
                    </span>
                    <span className={cn('text-[10px] whitespace-nowrap', p.state === 'idle' ? 'text-ink-5' : 'text-ink-2 font-medium')}>
                      {p.label}
                    </span>
                  </div>
                  {i < pipeline.length - 1 && (
                    <span
                      className={cn(
                        'mx-1 mb-5 h-[2px] flex-1 rounded-full',
                        p.state === 'done' ? 'bg-ink' : 'bg-ink/10',
                      )}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div className="px-6 py-4 mt-auto flex items-center justify-between">
            <Link to="/orders" className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:text-copper transition-colors">
              Review all orders
              <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span className="text-[12px] text-ink-4 tabular-nums">{stats.completed} completed</span>
          </div>
        </Surface>
      </div>

      {/* Recent POs + depot network */}
      <div className="grid lg:grid-cols-12 gap-5">
        <Surface className="lg:col-span-8 rounded-2xl p-0 flex flex-col">
          <div className="px-6 sm:px-7 py-5 flex items-center justify-between gap-3 border-b border-ink/[0.08]">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-display text-[17px] font-bold text-ink">Recent purchase orders</h2>
              <span className="rounded-full bg-ink/[0.05] px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-ink-3">
                {orders.length}
              </span>
            </div>
            <Link to="/orders" className="group inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink transition-colors">
              View all
              <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="flex-1 grid place-items-center px-6 py-12 text-center">
              <div>
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-paper text-ink-3 shadow-[0_8px_20px_-12px_rgba(12,14,11,0.35),inset_0_0_0_1px_rgba(12,14,11,0.08)]">
                  <PackageIcon size={18} />
                </div>
                <div className="mt-4 font-display text-[15px] font-semibold text-ink">No purchase orders yet</div>
                <p className="mt-1 text-[13px] text-ink-4">Your POs will appear here as soon as you check out.</p>
              </div>
            </div>
          ) : (
            <ul className="p-2">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/orders/${o.id}`}
                    className="group grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 hover:bg-ink/[0.03] transition-colors"
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-ink/[0.05] text-ink-3 row-span-2 sm:row-span-1">
                      <PackageIcon size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="font-mono text-[13px] font-semibold text-ink truncate">{o.poNumber}</div>
                      <div className="text-[12px] text-ink-4 truncate">{o.supplierName || 'Primary supplier'}</div>
                    </div>
                    <div className="hidden sm:block min-w-0">
                      <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                    </div>
                    <span className="text-[14px] font-semibold text-ink text-right">
                      <Amount cents={o.totalCents} decimals={false} />
                    </span>
                    <ArrowRightIcon size={14} className="hidden sm:block text-ink-5 transition-all group-hover:text-ink group-hover:translate-x-0.5" />
                    <div className="sm:hidden col-span-2">
                      <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="lg:col-span-4 rounded-2xl p-0 flex flex-col">
          <div className="px-6 py-5 flex items-center justify-between border-b border-ink/[0.08]">
            <div>
              <h2 className="font-display text-[17px] font-bold text-ink">Depot network</h2>
              <p className="text-[12px] text-ink-4 mt-0.5">{depotNetwork.length} dispatch hubs</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 text-[11px] font-medium text-mint">
              <span className="size-1.5 rounded-full bg-mint animate-pulse" />
              All normal
            </span>
          </div>
          <ul className="p-2 flex-1">
            {depotNetwork.map((depot) => {
              const active = depot.status === 'Active Dispatch';
              return (
                <li key={depot.id} className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-ink/[0.03] transition-colors">
                  <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-ink/[0.05] text-ink-3">
                    <MapPinIcon size={15} />
                    <span
                      className={cn(
                        'absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-paper',
                        active ? 'bg-mint' : 'bg-ink-5',
                      )}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink-1 truncate">{depot.name}</div>
                    <div className="text-[11px] text-ink-4 truncate">
                      {depot.city} · {depot.time}
                    </div>
                  </div>
                  <span className={cn('text-[11px] font-medium shrink-0', active ? 'text-mint' : 'text-ink-4')}>
                    {active ? 'Active' : 'Standby'}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link
            to="/about"
            className="group mx-4 mb-4 flex items-center justify-between rounded-xl bg-ink/[0.03] px-4 py-3 text-[12px] font-medium text-ink-3 hover:text-ink hover:bg-ink/[0.05] transition-colors"
          >
            Nationwide freight coverage
            <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Surface>
      </div>

      {/* Commodity spotlight */}
      <section className="space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <SectionEyebrow>Mill-gate spot prices</SectionEyebrow>
            <h2 className="mt-2 font-display text-[24px] sm:text-[28px] leading-tight tracking-[-0.03em] text-ink">
              Available to order now
            </h2>
          </div>
          <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-hide">
            <div className="inline-flex items-center gap-0.5 p-1 mx-4 sm:mx-0 rounded-full bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)] min-w-max">
              {[{ id: 'all', name: `All · ${hits.length}` }, ...categories.map((c) => ({ id: c.id, name: c.name }))].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSpotlightCategory(cat.id)}
                  className={cn(
                    'shrink-0 h-8 px-3.5 text-[12px] font-medium rounded-full transition-all duration-200 cursor-pointer',
                    spotlightCategory === cat.id ? 'bg-ink text-paper shadow-sm' : 'text-ink-4 hover:text-ink hover:bg-ink/[0.04]',
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isProductsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="vyro-surface rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-mist" />
                <div className="p-4 space-y-2.5">
                  <div className="h-4 w-3/4 bg-mist rounded" />
                  <div className="h-6 w-1/3 bg-mist rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredHits.length === 0 ? (
          <Surface className="rounded-2xl">
            <EmptyState
              icon={<PackageIcon size={24} />}
              title="No listings in this category"
              description="No active commodity listings match this filter right now."
              action={
                <Link to="/search">
                  <Button variant="secondary" size="sm" className="text-xs">
                    Browse full catalog
                  </Button>
                </Link>
              }
            />
          </Surface>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredHits.slice(0, 8).map((hit) => {
              const best = hit.bestOffer;
              const catName = categoryMap.get(hit.product.categoryId || '') || 'Wholesale';
              const adding = pendingKey === best?.id;
              return (
                <article
                  key={hit.product.id}
                  className="group vyro-surface rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-24px_rgba(12,14,11,0.35),inset_0_0_0_1px_rgba(12,14,11,0.1)]"
                >
                  <Link to={`/products/${hit.product.id}`} className="relative block aspect-[4/3] overflow-hidden bg-mist">
                    <ProductImage
                      src={resolveCatalogImage(hit.product.id, hit.product.imageUrl) || FALLBACK_PRODUCT_IMAGE}
                      alt={hit.product.name}
                      seed={hit.product.id}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                    <span className="absolute top-3 left-3 rounded-full bg-paper/90 backdrop-blur px-2.5 py-1 text-[10px] font-semibold text-ink">
                      {catName}
                    </span>
                    <span className="absolute bottom-3 left-3 rounded-full bg-ink/70 backdrop-blur px-2.5 py-1 text-[10px] font-medium text-paper">
                      {best ? `${best.minOrderQty} ${hit.product.unit} MOQ` : 'Custom MOQ'}
                    </span>
                  </Link>

                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <div className="min-w-0">
                      <Link to={`/products/${hit.product.id}`}>
                        <h3 className="font-display text-[15px] font-semibold text-ink truncate group-hover:text-copper transition-colors">
                          {hit.product.name}
                        </h3>
                      </Link>
                      <p className="mt-0.5 text-[12px] text-ink-4 flex items-center gap-1 truncate">
                        <StoreIcon size={11} className="shrink-0" />
                        <span className="truncate">
                          {best?.supplier?.name || (hit.offerCount > 0 ? `${hit.offerCount} verified suppliers` : 'Direct factory')}
                        </span>
                      </p>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[19px] font-semibold tracking-[-0.02em] text-ink leading-none">
                          {best ? <Amount cents={best.priceCents} /> : 'Quote only'}
                        </div>
                        <div className="mt-1.5 text-[11px] text-ink-4">
                          per {hit.product.unit} · {best ? `${best.leadTimeDays * 24}h dispatch` : 'Immediate'}
                        </div>
                      </div>
                      {best && (
                        <button
                          type="button"
                          aria-label={`Add ${hit.product.name} to cart`}
                          disabled={adding}
                          onClick={() =>
                            addToCart({
                              productId: hit.product.id,
                              supplierProductId: best.id,
                              quantity: best.minOrderQty || 1,
                              productName: hit.product.name,
                            })
                          }
                          className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-volt transition-all hover:bg-volt hover:text-ink disabled:opacity-60 cursor-pointer"
                        >
                          {adding ? <RefreshCwIcon size={15} className="animate-spin" /> : <ShoppingCartIcon size={15} />}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl bg-ink/[0.03] ring-1 ring-inset ring-ink/[0.06] px-5 py-4">
          <p className="text-[13px] text-ink-3">
            Need custom grain specs, private-label tea packaging or palletized bulk sugar?
          </p>
          <Link
            to="/search"
            className="group inline-flex h-10 items-center gap-2 rounded-xl bg-paper px-4 text-[13px] font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] hover:bg-ink hover:text-paper transition-colors whitespace-nowrap"
          >
            Browse full catalog
            <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* Verified suppliers */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="min-w-0">
            <SectionEyebrow>Audited supplier facilities</SectionEyebrow>
            <h2 className="mt-2 font-display text-[24px] sm:text-[28px] leading-tight tracking-[-0.03em] text-ink">
              Verified millers & distributors
            </h2>
          </div>
          <Link to="/search" className="group inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink transition-colors">
            Filter by supplier
            <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {isSuppliersLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 vyro-surface rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          <Surface className="rounded-2xl">
            <EmptyState
              icon={<StoreIcon size={24} />}
              title="No supplier facilities"
              description="No verified supplier facilities are registered on the network yet."
            />
          </Surface>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((sup) => {
              const photo = SUPPLIER_PHOTOS[sup.id] || DEFAULT_SUPPLIER_PHOTO;
              const verified = sup.verificationStatus === 'verified';
              return (
                <Link
                  key={sup.id}
                  to={`/search?q=${encodeURIComponent(sup.name)}`}
                  className="group relative block h-72 overflow-hidden rounded-2xl bg-ink"
                >
                  <img
                    src={photo}
                    alt={sup.name}
                    className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void via-void/55 to-void/5" />
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/90 backdrop-blur px-2.5 py-1 text-[10px] font-semibold text-ink">
                      <ShieldCheckIcon size={11} className={verified ? 'text-mint' : 'text-ink-4'} />
                      {verified ? 'Verified hub' : 'Audited facility'}
                    </span>
                    {sup.activeListingsCount ? (
                      <span className="rounded-full bg-ink/60 backdrop-blur px-2.5 py-1 text-[10px] font-medium text-paper">
                        {sup.activeListingsCount} listings
                      </span>
                    ) : null}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-5 text-paper">
                    <div className="flex items-center gap-1 text-[11px] text-paper/60">
                      <MapPinIcon size={11} /> {sup.city}, {sup.district}
                    </div>
                    <h3 className="mt-1 font-display text-lg font-semibold leading-tight truncate">{sup.name}</h3>
                    <p className="mt-1.5 text-[12px] text-paper/65 line-clamp-2">
                      {sup.description || 'Direct wholesale supply and logistics fulfillment facility.'}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-volt">
                      View catalog
                      <ArrowRightIcon size={12} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          {
            to: '/search',
            icon: <PackageIcon size={17} />,
            tint: 'bg-copper/[0.12] text-copper-deep',
            title: 'Fast replenishment',
            body: 'Reorder weekly baskets — Keeri Samba, sugar, packaging — in one click.',
          },
          {
            to: '/orders',
            icon: <ShieldCheckIcon size={17} />,
            tint: 'bg-volt/25 text-volt-deep',
            title: 'SVAT e-invoicing',
            body: 'Export IRD-compliant SVAT tax invoices for your accounting team.',
          },
          {
            to: '/profile',
            icon: <Building2Icon size={17} />,
            tint: 'bg-ink text-volt',
            title: 'Receiving docks & team',
            body: 'Delivery address, dock hours and team member permissions.',
          },
        ].map((a) => (
          <Link
            key={a.title}
            to={a.to}
            className="group vyro-surface rounded-2xl p-5 flex items-start gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-24px_rgba(12,14,11,0.3),inset_0_0_0_1px_rgba(12,14,11,0.1)]"
          >
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', a.tint)}>{a.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-[15px] font-semibold text-ink">{a.title}</h3>
                <ArrowRightIcon size={14} className="text-ink-5 transition-all group-hover:text-ink group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-[13px] text-ink-4 leading-relaxed">{a.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const heroGhostClass =
  'inline-flex h-11 items-center gap-2 rounded-xl bg-paper/[0.06] px-4 text-[13px] font-medium text-paper/85 ring-1 ring-inset ring-paper/[0.12] backdrop-blur transition-colors hover:bg-paper/[0.12] hover:text-paper disabled:opacity-50 cursor-pointer';

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-4">{children}</div>;
}
