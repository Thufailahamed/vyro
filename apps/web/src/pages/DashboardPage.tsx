import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { TimeSeries, Button, MetricStack, StatusDots, PageHeader, Badge } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import {
  PackageIcon,
  ShoppingCartIcon,
  TruckIcon,
  AlertCircleIcon,
  StoreIcon,
  Building2Icon,
  ShieldCheckIcon,
  CheckIcon,
  ArrowRightIcon,
  SparklesIcon,
  TrendingUpIcon,
  MapPinIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@/components/icons';
import { formatCompactLKR, formatLKR, greetingForNow } from '@/lib/format';
import { FlowLine, FlowCanvas } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';

const SPOTLIGHT_COMMODITIES = [
  {
    id: 'spot-rice-1',
    name: 'Araliya Keeri Samba 25kg',
    category: 'Grains & Rice',
    categoryKey: 'rice',
    price: 'Rs. 4,200',
    unit: '/ bag (25kg)',
    depot: 'Kurunegala Mill Gate',
    supplier: 'Araliya Rice Mills',
    leadTime: '24-48h dispatch',
    minOrder: '5 bags min',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
    q: 'Rice',
  },
  {
    id: 'spot-rice-2',
    name: 'Brown Raw Nadu Rice 50kg',
    category: 'Grains & Rice',
    categoryKey: 'rice',
    price: 'Rs. 3,800',
    unit: '/ bag (50kg)',
    depot: 'Polonnaruwa Central Depot',
    supplier: 'Nadu Cooperative Mills',
    leadTime: '24h dispatch',
    minOrder: '10 bags min',
    image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=600&q=80',
    q: 'Rice',
  },
  {
    id: 'spot-tea-1',
    name: 'Pure Ceylon BOPF Tea 5kg',
    category: 'Beverages',
    categoryKey: 'tea',
    price: 'Rs. 9,500',
    unit: '/ bulk pack (5kg)',
    depot: 'Kandy Estate Dispatch',
    supplier: 'Highland Estates Ceylon',
    leadTime: 'Next day courier',
    minOrder: '2 packs min',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    q: 'Tea',
  },
  {
    id: 'spot-pkg-1',
    name: 'Double-Wall Heavy Cartons',
    category: 'Packaging',
    categoryKey: 'packaging',
    price: 'Rs. 450',
    unit: '/ unit (bundle 25)',
    depot: 'Western Freight Hub (Biyagama)',
    supplier: 'Apex Packaging Industries',
    leadTime: 'Same day dispatch',
    minOrder: '50 units min',
    image: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=600&q=80',
    q: 'Packaging',
  },
  {
    id: 'spot-oil-1',
    name: 'Commercial Palm Olein Cooking Oil 20L',
    category: 'Cooking Oils',
    categoryKey: 'oil',
    price: 'Rs. 8,600',
    unit: '/ can (20L drum)',
    depot: 'Colombo Port Bulk Terminal',
    supplier: 'Ceylon Oils & Fats Ltd',
    leadTime: '24h dispatch',
    minOrder: '2 drums min',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
    q: 'Oil',
  },
  {
    id: 'spot-sugar-1',
    name: 'Premium White Crystal Sugar 50kg',
    category: 'Commodities',
    categoryKey: 'sugar',
    price: 'Rs. 11,200',
    unit: '/ bag (50kg)',
    depot: 'Pelwatte Logistics Hub',
    supplier: 'Pelwatte Sugar Dist.',
    leadTime: '48h dispatch',
    minOrder: '5 bags min',
    image: 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=600&q=80',
    q: 'Sugar',
  },
];

const VERIFIED_SUPPLIERS = [
  {
    name: 'Araliya Agro Rice Millers',
    district: 'Kurunegala Mill Gate',
    specialty: 'Keeri Samba, Samba & White Raw Rice',
    score: '99.4% Fulfillment',
    rating: '4.9 ★',
    activeListings: '8 wholesale products',
    image: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80',
    q: 'Rice',
  },
  {
    name: 'Kandy Highland Tea Factory',
    district: 'Central Province Estate',
    specialty: 'Single-Origin BOPF & Wholesale Dust',
    score: '98.9% Fulfillment',
    rating: '4.8 ★',
    activeListings: '6 wholesale products',
    image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
    q: 'Tea',
  },
  {
    name: 'Apex Corrugated Packaging',
    district: 'Biyagama Export Zone',
    specialty: 'Heavy Duty 3-Ply & 5-Ply Shipping Boxes',
    score: '99.8% Fulfillment',
    rating: '5.0 ★',
    activeListings: '12 carton sizes',
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
    q: 'Packaging',
  },
  {
    name: 'Lanka Sugar Refining Hub',
    district: 'Pelwatte Distribution Depot',
    specialty: 'Bulk Refined White & Brown Cane Sugar',
    score: '98.2% Fulfillment',
    rating: '4.7 ★',
    activeListings: '4 bulk variants',
    image: 'https://images.unsplash.com/photo-1628102491629-778571d893a3?auto=format&fit=crop&w=600&q=80',
    q: 'Sugar',
  },
];

interface OrderRow {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
  supplierName?: string;
  supplierId?: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DashboardPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const businessName = user?.memberships?.[0]?.businessName;

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['business-orders-dash', businessId],
    queryFn: () => api.get<{ orders: OrderRow[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: spendData } = useQuery({
    queryKey: ['business-monthly-spend', businessId],
    queryFn: () =>
      api.get<{ buckets: { month: string; totalCents: number }[] }>(
        `/analytics/business/monthly-spend?months=12`
      ),
    enabled: !!businessId,
  });

  const orders = ordersData?.orders ?? [];
  const stats = useMemo(() => {
    const inFlight = orders.filter((o) => ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)).length;
    const completed = orders.filter((o) => o.status === 'completed').length;
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

  const [spotlightCategory, setSpotlightCategory] = useState<string>('all');
  const filteredSpotlight = useMemo(() => {
    if (spotlightCategory === 'all') return SPOTLIGHT_COMMODITIES;
    return SPOTLIGHT_COMMODITIES.filter((c) => c.categoryKey === spotlightCategory);
  }, [spotlightCategory]);

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

  if (!businessId) {
    return (
      <div className="space-y-8 max-w-6xl">
        {/* Top Supplier Notice Banner if user is already a supplier */}
        {hasSupplier && (
          <div className="p-5 bg-ink text-paper border border-volt/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-volt text-ink flex items-center justify-center font-bold shrink-0">
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
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-paper/10 border border-paper/15 text-xs text-volt">
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
                  <div key={s.label} className="p-3 bg-paper/5 border border-paper/10">
                    <span className="vyro-metric text-lg text-paper font-bold block">{s.val}</span>
                    <span className="text-[10px] text-paper/50 uppercase tracking-wider block mt-0.5">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative overflow-hidden border border-paper/20 group h-64 sm:h-72 shadow-2xl">
                <img
                  src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
                  alt="Audited wholesale distribution depot"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 p-3 bg-void/85 backdrop-blur-md border border-paper/15 space-y-1">
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
                  <div className="size-10 bg-ink text-volt flex items-center justify-center">
                    <Building2Icon size={20} />
                  </div>
                  <div>
                    <div className="vyro-kicker text-volt-deep">Buyer Workspace Track</div>
                    <h3 className="font-display text-xl text-ink font-semibold">
                      Register Commercial Purchasing Entity
                    </h3>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-volt text-ink">
                  Recommended
                </span>
              </div>

              <p className="text-xs text-ink-3 leading-relaxed">
                For restaurants, hotel resorts, catering kitchens, bakery chains, and retail supermarkets purchasing food commodities, beverage stocks, and packaging in bulk.
              </p>

              <div className="space-y-2.5 p-4 bg-paper/70 border border-ink/10">
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
                  <div className="size-10 bg-ink text-copper flex items-center justify-center">
                    <StoreIcon size={20} />
                  </div>
                  <div>
                    <div className="vyro-kicker text-copper">Supplier Workspace Track</div>
                    <h3 className="font-display text-xl text-ink font-semibold">
                      Register Wholesale Supplier Facility
                    </h3>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-mist text-ink border border-line">
                  Suppliers
                </span>
              </div>

              <p className="text-xs text-ink-3 leading-relaxed">
                For rice millers, tea estates, certified food importers, commercial packaging factories, and authorized regional wholesale distribution hubs.
              </p>

              <div className="space-y-2.5 p-4 bg-paper/70 border border-ink/10">
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

        {/* Live Catalog Spot Prices Preview */}
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
                Browse Full Catalog (12 Products) →
              </Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                name: 'Araliya Keeri Samba 25kg',
                category: 'Grains & Rice',
                price: 'Rs. 4,200',
                unit: '/ bag',
                depot: 'Kurunegala Mill Gate',
                image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
              },
              {
                name: 'Brown Raw Nadu Rice 50kg',
                category: 'Grains & Rice',
                price: 'Rs. 3,800',
                unit: '/ bag',
                depot: 'Polonnaruwa Central',
                image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=400&q=80',
              },
              {
                name: 'Pure Ceylon BOPF Tea 5kg',
                category: 'Beverages',
                price: 'Rs. 9,500',
                unit: '/ pack',
                depot: 'Kandy Estate Dispatch',
                image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80',
              },
              {
                name: 'Double-Wall Heavy Cartons',
                category: 'Packaging',
                price: 'Rs. 450',
                unit: '/ unit',
                depot: 'Western Freight Hub',
                image: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=400&q=80',
              },
            ].map((p) => (
              <Link
                key={p.name}
                to="/search"
                className="group p-3 bg-paper border border-ink/10 hover:border-ink transition-all duration-200 block space-y-3"
              >
                <div className="relative h-32 overflow-hidden bg-mist">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-ink/90 text-paper border border-paper/20">
                    {p.category}
                  </span>
                </div>
                <div>
                  <h4 className="font-display text-sm font-semibold text-ink group-hover:text-copper transition-colors truncate">
                    {p.name}
                  </h4>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="vyro-metric font-bold text-base text-ink">{p.price}</span>
                    <span className="text-[11px] text-ink-4">{p.unit}</span>
                  </div>
                  <span className="text-[10px] text-ink-4 block truncate mt-1">
                    📍 {p.depot}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Executive Command Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-ink/10">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-volt/25 text-ink text-[10px] font-mono font-bold uppercase tracking-wider border border-volt/40">
              <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Verified Purchasing Entity
            </span>
            <span className="text-[11px] font-mono text-ink-4">
              Workspace ID: {businessId}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
              <ShieldCheckIcon size={13} className="text-volt-deep" />
              SVAT Invoicing Ready
            </span>
          </div>
          <h1 className="vyro-display text-3xl sm:text-4xl lg:text-5xl text-ink leading-none">
            {businessName}
          </h1>
          <p className="text-xs sm:text-sm text-ink-3">
            {greetingForNow()}, <span className="font-semibold text-ink">{user.name || 'Purchasing Director'}</span>. Wholesale procurement console connected to 25 districts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link to="/cart">
            <Button variant="secondary" size="sm" className="text-xs font-semibold">
              <ShoppingCartIcon size={14} /> View Cart
            </Button>
          </Link>
          <Link to="/search">
            <Button variant="primary" size="sm" className="text-xs uppercase tracking-wider font-bold">
              Start Procurement
            </Button>
          </Link>
        </div>
      </header>

      {/* Fast-Track First Purchase Order Hero (prominent when 0 orders) */}
      {stats.total === 0 && (
        <Surface kind="ink" className="p-6 sm:p-8 relative overflow-hidden grain shadow-xl">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <FlowCanvas tone="paper" density="hero" />
          </div>
          <div className="relative z-10 grid lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-paper/10 border border-paper/15 text-xs text-volt">
                <SparklesIcon size={14} />
                <span className="vyro-kicker text-volt">Fast-Track First Purchase Order</span>
              </div>
              <h2 className="vyro-display text-2xl sm:text-3xl text-paper leading-tight">
                Source direct from verified Sri Lankan millers & distributors.
              </h2>
              <p className="text-xs sm:text-sm text-paper/75 leading-relaxed max-w-xl">
                Your commercial purchasing account for <strong className="text-paper">{businessName}</strong> is active. You can now issue legally-binding POs, order across multiple factories in a single checkout, and track road freight directly to your receiving dock.
              </p>
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="p-3 bg-paper/5 border border-paper/10 space-y-1">
                  <span className="text-[10px] font-mono text-volt uppercase tracking-wider">Step 1</span>
                  <div className="text-xs font-display text-paper font-semibold">Select Products</div>
                  <span className="text-[10px] text-paper/50 block">Mill-gate wholesale rates</span>
                </div>
                <div className="p-3 bg-paper/5 border border-paper/10 space-y-1">
                  <span className="text-[10px] font-mono text-volt uppercase tracking-wider">Step 2</span>
                  <div className="text-xs font-display text-paper font-semibold">Auto-Split PO</div>
                  <span className="text-[10px] text-paper/50 block">Automated vendor routing</span>
                </div>
                <div className="p-3 bg-paper/5 border border-paper/10 space-y-1">
                  <span className="text-[10px] font-mono text-volt uppercase tracking-wider">Step 3</span>
                  <div className="text-xs font-display text-paper font-semibold">Dock GRN Signoff</div>
                  <span className="text-[10px] text-paper/50 block">Pallet receipt on arrival</span>
                </div>
              </div>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Link to="/search">
                  <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs py-2.5">
                    Explore Wholesale Catalog
                  </Button>
                </Link>
                <span className="text-[11px] text-paper/60">
                  ⚡ Over 12 staple commodities ready for immediate dispatch
                </span>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="relative overflow-hidden border border-paper/20 group h-56 sm:h-64 shadow-2xl">
                <img
                  src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
                  alt="Wholesale Distribution Depot"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 p-3 bg-void/85 backdrop-blur-md border border-paper/15 space-y-1">
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
        {/* Lifetime Spend Card */}
        <Surface kind="ink" className="lg:col-span-7 p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-volt font-mono font-semibold">
                Lifetime Procurement Spend
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono text-paper/70 bg-paper/10 border border-paper/15">
                {stats.total} {stats.total === 1 ? 'PO' : 'POs'} on record
              </span>
            </div>
            <MetricNumber size="xl" className="mt-3 text-paper">
              {formatCompactLKR(stats.lifetimeCents)}
            </MetricNumber>
            <p className="mt-2 text-paper/60 text-xs">
              {stats.total === 0
                ? 'Account ready. Spend analytics will activate upon your first purchase order fulfillment.'
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
                { label: 'PO Approval', state: stats.inFlight ? 'active' : stats.total > 0 ? 'done' : 'idle' },
                { label: 'Freight Transit', state: stats.inFlight ? 'active' : 'idle' },
                { label: 'Dock GRN', state: stats.completed > 0 ? 'done' : 'idle' },
              ]}
            />
          </div>
        </Surface>

        {/* Pending Actions & Operational Signals */}
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

        {/* Procurement Activity Chart / Market Benchmark */}
        <Surface kind="flat" className="lg:col-span-8 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl text-ink">Procurement Activity</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-mist text-ink border border-line">
                  12-Month Trajectory
                </span>
              </div>
              <p className="text-xs text-ink-4 mt-1">Monthly wholesale purchasing volume & seasonal trend</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono text-ink-4 block uppercase tracking-wider">Trailing Spend</span>
              <span className="vyro-metric text-lg text-copper font-bold">
                {formatCompactLKR(monthlyValues.reduce((a, b) => a + b, 0))}
              </span>
            </div>
          </div>
          {monthlyValues.some((v) => v > 0) ? (
            <TimeSeries values={monthlyValues} labels={monthlyLabels} tone="cyan" height={175} formatValue={(v: number) => formatLKR(v)} />
          ) : (
            <div className="border border-ink/10 bg-paper/60 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-volt/25 text-ink flex items-center justify-center font-bold shrink-0">
                    <TrendingUpIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-ink">
                      Wholesale Market Benchmark · Sri Lanka
                    </h3>
                    <p className="text-xs text-ink-4">
                      Live volume curve will calibrate as you order. Current commodity price dynamics:
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
                  { label: 'Keeri Samba Index', val: '-2.4%', sub: 'Mill supply surplus' },
                  { label: 'Ceylon Tea Auction', val: '+1.1%', sub: 'BOPF export premium' },
                  { label: 'Road Freight Fuel', val: '0.0%', sub: 'Stable tariff rate' },
                  { label: 'SVAT Tax Advantage', val: '0% Net', sub: 'Input VAT exemption' },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 bg-paper border border-ink/10">
                    <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider block">{stat.label}</span>
                    <span className="vyro-metric text-base font-bold text-ink block mt-0.5">{stat.val}</span>
                    <span className="text-[10px] text-ink-4 block">{stat.sub}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>

        {/* Wholesale Logistics & Depots Status */}
        <Surface kind="flat" className="lg:col-span-4 p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink/10">
              <div className="flex items-center gap-2">
                <TruckIcon size={16} className="text-copper" />
                <h3 className="font-display text-lg text-ink font-semibold">Depot Network</h3>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 font-bold uppercase">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" /> All Normal
              </span>
            </div>

            <div className="mt-4 space-y-2.5">
              {[
                { name: 'Kurunegala Grain Terminal', status: 'Active Dispatch', time: '24h dispatch' },
                { name: 'Colombo Port Central Dock', status: 'Active Dispatch', time: 'Same-day staged' },
                { name: 'Central Kandy Tea Estate', status: 'Active Dispatch', time: '48h freight' },
                { name: 'Western Province Packaging', status: 'Active Dispatch', time: 'Same-day staged' },
              ].map((depot) => (
                <div key={depot.name} className="flex items-center justify-between p-2.5 bg-paper/80 border border-ink/10 text-xs">
                  <div>
                    <span className="font-semibold text-ink block">{depot.name}</span>
                    <span className="text-[10px] text-ink-4">{depot.time}</span>
                  </div>
                  <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-mist text-ink border border-line">
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

      {/* Live Wholesale Commodity Spotlight */}
      <Surface kind="flat" className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-ink/10">
          <div>
            <div className="vyro-kicker text-copper">Wholesale Commodity Spot Ticker</div>
            <h2 className="font-display text-2xl text-ink font-semibold mt-0.5">
              Factory & Mill-Gate Pricing Available Now
            </h2>
            <p className="text-xs text-ink-4 mt-0.5">
              Current audited wholesale spot prices across key Sri Lankan commercial commodity categories.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: 'All Items', key: 'all' },
              { label: '🌾 Rice & Grains', key: 'rice' },
              { label: '☕ Ceylon Tea', key: 'tea' },
              { label: '📦 Packaging', key: 'packaging' },
              { label: '🛢️ Cooking Oils', key: 'oil' },
              { label: '🧂 Sugar', key: 'sugar' },
            ].map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSpotlightCategory(cat.key)}
                className={`px-3 py-1.5 text-xs font-mono font-semibold transition-all duration-150 border ${
                  spotlightCategory === cat.key
                    ? 'bg-ink text-paper border-ink shadow-sm'
                    : 'bg-paper text-ink border-ink/15 hover:border-ink hover:bg-mist'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSpotlight.map((item) => (
            <Link
              key={item.id}
              to={`/search?q=${encodeURIComponent(item.q)}`}
              className="group bg-paper border border-ink/10 hover:border-ink transition-all duration-200 block overflow-hidden shadow-sm hover:shadow-md"
            >
              <div className="relative h-44 overflow-hidden bg-mist">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-ink/90 text-paper border border-paper/20 backdrop-blur-sm">
                  {item.category}
                </span>
                <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 text-[10px] font-mono bg-paper/90 text-ink backdrop-blur-sm">
                  {item.minOrder}
                </span>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-ink group-hover:text-copper transition-colors truncate">
                    {item.name}
                  </h3>
                  <p className="text-[11px] text-ink-4 flex items-center gap-1 mt-0.5">
                    <StoreIcon size={12} className="text-copper" /> {item.supplier}
                  </p>
                </div>

                <div className="flex items-baseline justify-between pt-2 border-t border-ink/10">
                  <div className="flex items-baseline gap-1">
                    <span className="vyro-metric font-bold text-xl text-ink">{item.price}</span>
                    <span className="text-[11px] text-ink-4">{item.unit}</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">
                    {item.leadTime}
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-between text-[11px] text-ink-3">
                  <span className="flex items-center gap-1">
                    <MapPinIcon size={12} className="text-ink-4" /> {item.depot}
                  </span>
                  <span className="font-bold text-ink group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                    Procure <ArrowRightIcon size={12} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="p-4 bg-mist/60 border border-line flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-ink text-volt flex items-center justify-center font-bold shrink-0">
              <PackageIcon size={16} />
            </div>
            <p className="text-xs text-ink-2">
              Looking for custom grain specifications, private label tea packaging, or palletized bulk sugar?
            </p>
          </div>
          <Link to="/search">
            <Button variant="outline" size="sm" className="text-xs font-semibold whitespace-nowrap">
              Browse Full Catalog (12+ Items) →
            </Button>
          </Link>
        </div>
      </Surface>

      {/* Verified Millers & Authorized Primary Distributors */}
      <Surface kind="flat" className="p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-ink/10">
          <div>
            <div className="vyro-kicker text-volt-deep">Audited Supplier Facilities</div>
            <h2 className="font-display text-2xl text-ink font-semibold mt-0.5">
              Verified Millers & Authorized Primary Distributors
            </h2>
            <p className="text-xs text-ink-4 mt-0.5">
              Direct factory accounts verified with SVAT compliance and audited dispatch depots.
            </p>
          </div>
          <Link to="/search">
            <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-semibold">
              Filter by Supplier →
            </Button>
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VERIFIED_SUPPLIERS.map((sup) => (
            <Link
              key={sup.name}
              to={`/search?q=${encodeURIComponent(sup.q)}`}
              className="group p-4 bg-paper border border-ink/10 hover:border-ink transition-all duration-200 block space-y-3 shadow-sm hover:shadow-md"
            >
              <div className="relative h-32 overflow-hidden bg-mist">
                <img
                  src={sup.image}
                  alt={sup.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <span className="absolute top-2 left-2 px-2 py-0.5 text-[9px] font-mono font-bold uppercase bg-ink text-volt border border-volt/20">
                  {sup.rating}
                </span>
                <span className="absolute bottom-2 right-2 px-2 py-0.5 text-[9px] font-mono font-bold bg-paper/90 text-ink backdrop-blur-sm">
                  {sup.score}
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="font-display text-sm font-semibold text-ink group-hover:text-copper transition-colors truncate">
                  {sup.name}
                </h3>
                <span className="text-[11px] text-ink-4 flex items-center gap-1">
                  <MapPinIcon size={11} /> {sup.district}
                </span>
                <p className="text-[11px] text-ink-3 line-clamp-1 pt-1 border-t border-ink/5">
                  {sup.specialty}
                </p>
                <div className="pt-2 flex items-center justify-between text-[10px] font-mono text-ink-4">
                  <span>{sup.activeListings}</span>
                  <span className="text-copper font-bold group-hover:underline">View catalog →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Surface>

      {/* Recent Orders (if any exist) */}
      {orders.length > 0 && (
        <Surface kind="flat" className="p-0 overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between border-b border-ink/10">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl text-ink">Recent Purchase Orders</h2>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-mist text-ink border border-line">
                {orders.length} Total
              </span>
            </div>
            <Link to="/orders" className="text-xs text-copper font-semibold hover:underline">
              View all orders →
            </Link>
          </div>
          <ul>
            {recent.map((o) => (
              <li key={o.id} className="border-b border-ink/5 last:border-0">
                <Link to={`/orders/${o.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-mist/60 transition-colors">
                  <span className="vyro-metric text-sm w-32 truncate font-bold">{o.poNumber}</span>
                  <span className="flex-1">
                    <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                  </span>
                  <span className="text-xs text-ink-4 hidden sm:inline">
                    {o.supplierName || 'Primary Supplier'}
                  </span>
                  <span className="vyro-metric text-sm font-semibold">{formatCompactLKR(o.totalCents)}</span>
                  <ArrowRightIcon size={14} className="text-ink-4" />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      {/* Quick Actions & Operational Tool Bar */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="p-5 bg-paper border border-ink/10 space-y-2">
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm">
            <PackageIcon size={16} className="text-copper" />
            <span>Fast Replenishment</span>
          </div>
          <p className="text-xs text-ink-3">
            Quickly reorder weekly commodity baskets like Keeri Samba, Sugar, and Packaging with 1 click.
          </p>
          <Link to="/search" className="text-xs text-copper font-semibold inline-block pt-1 hover:underline">
            Open Order Templates →
          </Link>
        </div>

        <div className="p-5 bg-paper border border-ink/10 space-y-2">
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm">
            <ShieldCheckIcon size={16} className="text-volt-deep" />
            <span>SVAT Digital E-Invoicing</span>
          </div>
          <p className="text-xs text-ink-3">
            Generate and export IRD-compliant SVAT purchase order tax invoices directly for your accounting team.
          </p>
          <Link to="/orders" className="text-xs text-copper font-semibold inline-block pt-1 hover:underline">
            Manage Tax Invoices →
          </Link>
        </div>

        <div className="p-5 bg-paper border border-ink/10 space-y-2">
          <div className="flex items-center gap-2 text-ink font-display font-semibold text-sm">
            <Building2Icon size={16} className="text-ink" />
            <span>Receiving Docks & Team</span>
          </div>
          <p className="text-xs text-ink-3">
            Update your commercial delivery address, dock receiving hours, and team member permissions.
          </p>
          <Link to="/profile" className="text-xs text-copper font-semibold inline-block pt-1 hover:underline">
            Entity Settings →
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: typeof TruckIcon;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-ink-3">
        <Icon size={14} />
        {label}
      </span>
      <span className={`vyro-metric text-xl ${danger && value > 0 ? 'text-rose' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

function SplitStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 border-b border-ink/10 last:border-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">{label}</div>
      <MetricNumber size="md" className="mt-1">
        {value}
      </MetricNumber>
    </div>
  );
}
