import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ProductHoverPreview, type ProductPreviewItem } from '@/components/products/ProductHoverPreview';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { SearchIcon, TruckIcon, PackageIcon, CheckCircleIcon, ArrowRightIcon, ClockIcon } from '@/components/icons';
import { FlowCanvas, FlowLine } from '@/components/brand/FlowLine';
import { BrandMark } from '@/components/brand/BrandMark';
import { ProductImage, Surface } from '@/components/brand/Surface';
import { cn } from '@vyro/ui';

const POPULAR = ['Rice', 'Sugar', 'Ceylon Tea', 'Coconut Oil', 'Wheat Flour', 'Cement', 'Packaging', 'Spices'];

const HERO_PROOF = {
  product: 'Samba Rice · 25 kg Bag',
  origin: 'Mill-Direct · Western Province Milling Hub',
  image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=80',
  offers: [
    { tag: 'Best price', value: 'Rs. 4,200', hint: 'Lanka Agro Mills' },
    { tag: 'Best value', value: 'Rs. 4,450', hint: 'Colombo Wholesalers' },
    { tag: 'Fastest', value: '24h dispatch', hint: '3 live offers' },
  ],
} as const;

const HERO_MOSAIC = [
  {
    name: 'Pure Ceylon BOPF Tea',
    query: 'tea',
    src: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80',
    alt: 'Ceylon tea leaves ready for wholesale distribution',
    badge: 'Estate Direct',
  },
  {
    name: 'Spices & Agri Commodities',
    query: 'spices',
    src: 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?auto=format&fit=crop&w=800&q=80',
    alt: 'Black peppercorns and cinnamon in bulk lots',
    badge: 'Grade 1 Export',
  },
  {
    name: 'Cold Pressed Coconut Oil',
    query: 'oil',
    src: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80',
    alt: 'Pure virgin coconut oil bottles wholesale',
    badge: 'Mill Packed',
  },
] as const;

const TRUST_STATS = [
  { metric: '25', label: 'Districts Covered', sub: 'Island-wide freight routing' },
  { metric: 'Rs. 100M+', label: 'Wholesale Throughput', sub: 'Active commercial trading volume' },
  { metric: '100%', label: 'Verified Suppliers', sub: 'Audited tax & depot identity' },
  { metric: '0%', label: 'Hidden Broker Markup', sub: 'Direct factory & mill prices' },
];

const FEATURED_PRODUCTS = [
  {
    id: 'p-samba-rice-25kg',
    name: 'Araliya Samba Rice 25kg',
    category: 'Staples & Grains',
    price: 'Rs. 4,200',
    unit: '/ 25kg bag',
    moq: 'Min. 5 bags',
    leadTime: '1-2 days',
    supplier: 'Lanka Agro Mills',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
    badge: 'Top Traded',
  },
  {
    id: 'p-tea-bulk-5kg',
    name: 'Dilmah Pure Ceylon BOPF Tea 5kg',
    category: 'Tea & Beverages',
    price: 'Rs. 9,500',
    unit: '/ 5kg bulk pack',
    moq: 'Min. 2 packs',
    leadTime: '2 days',
    supplier: 'Island Logistics & Distribution',
    image: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80',
    badge: 'HORECA Grade',
  },
  {
    id: 'p-sugar-50kg',
    name: 'Pelwatte Refined White Sugar 50kg',
    category: 'Sugar & Commodities',
    price: 'Rs. 12,800',
    unit: '/ 50kg commercial bag',
    moq: 'Min. 5 bags',
    leadTime: '1 day',
    supplier: 'Colombo Central Wholesalers',
    image: 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=600&q=80',
    badge: 'Industrial Grade',
  },
  {
    id: 'p-milk-1l',
    name: 'Fonterra Fresh Whole Milk 1L',
    category: 'Dairy Products',
    price: 'Rs. 520',
    unit: '/ carton (case of 12)',
    moq: 'Min. 12 units',
    leadTime: 'Same day',
    supplier: 'Island Logistics & Distribution',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
    badge: 'Cold Chain',
  },
  {
    id: 'p-oil-coconut-1l',
    name: 'Pure Virgin White Coconut Oil 1L',
    category: 'Staples & Grains',
    price: 'Rs. 860',
    unit: '/ 1L glass bottle',
    moq: 'Min. 12 bottles',
    leadTime: '1-2 days',
    supplier: 'Lanka Agro Mills',
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80',
    badge: 'Cold Pressed',
  },
  {
    id: 'p-flour-1kg',
    name: 'Commercial Wheat Flour 1kg',
    category: 'Staples & Grains',
    price: 'Rs. 210',
    unit: '/ 1kg pack',
    moq: 'Min. 50 packs',
    leadTime: '1 day',
    supplier: 'Colombo Central Wholesalers',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    badge: 'Bakery Batch',
  },
  {
    id: 'p-spices-pepper-500g',
    name: 'Ceylon Black Peppercorns 500g',
    category: 'Spices & Agri',
    price: 'Rs. 1,780',
    unit: '/ 500g pouch',
    moq: 'Min. 10 pouches',
    leadTime: '2 days',
    supplier: 'Island Logistics & Distribution',
    image: 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?auto=format&fit=crop&w=600&q=80',
    badge: 'Estate Direct',
  },
  {
    id: 'p-packaging-50pk',
    name: 'Corrugated Shipping Cartons 50pk',
    category: 'Packaging Materials',
    price: 'Rs. 4,800',
    unit: '/ bundle of 50',
    moq: 'Min. 2 bundles',
    leadTime: '1-2 days',
    supplier: 'Island Logistics & Distribution',
    image: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=600&q=80',
    badge: 'Heavy Duty',
  },
];

const CATEGORIES: Array<{
  name: string;
  query: string;
  detail: string;
  volume: string;
  imageUrl: string;
  count: string;
}> = [
  {
    name: 'Rice & Grains',
    query: 'rice',
    detail: 'Mill-direct white, samba, and keeri samba in 5kg to 50kg bags.',
    volume: 'Highest volume',
    count: '24+ Wholesale lines',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Ceylon Tea & Beverages',
    query: 'tea',
    detail: 'Single-origin BOPF, green tea, barista coffee & syrups.',
    volume: 'Export grade',
    count: '18+ Estate blends',
    imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Refined Sugar & Commodities',
    query: 'sugar',
    detail: 'Refined crystalline white sugar, brown sugar & molasses in commercial bags.',
    volume: 'Daily price lock',
    count: '12+ Bulk grades',
    imageUrl: 'https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Dairy & Cold Chain',
    query: 'dairy',
    detail: 'Pasteurized fresh milk, culinary cream, cheddar & butter lots.',
    volume: 'Chilled freight',
    count: '16+ Dairy lines',
    imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Cooking Oils & Fats',
    query: 'oil',
    detail: 'Virgin white coconut oil, pure sunflower oil & bulk palm olein.',
    volume: 'Factory direct',
    count: '10+ Oil packs',
    imageUrl: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Spices & Agri Produce',
    query: 'spices',
    detail: 'Ceylon cinnamon quills, whole black pepper, cardamoms & cloves.',
    volume: 'Estate verified',
    count: '30+ Agri lots',
    imageUrl: 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Packaging & Disposables',
    query: 'packaging',
    detail: 'Corrugated cartons, food containers, greaseproof wraps & strapping.',
    volume: 'Fast lead times',
    count: '25+ Box sizes',
    imageUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Cement & Building Supply',
    query: 'cement',
    detail: 'Portland cement, masonry mortars & site delivery schedules.',
    volume: 'Island-wide fleet',
    count: '8+ Construction lines',
    imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80',
  },
];

const BUSINESSES = [
  {
    name: 'Restaurants & Kitchens',
    note: 'Bulk cooking oil, rice sacks, spices, poultry & take-out packaging.',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    tag: 'F&B Operators',
  },
  {
    name: 'Hotels & Luxury Resorts',
    note: 'High-volume culinary inputs, premium Ceylon tea, dairy & housekeeping items.',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    tag: 'Hospitality',
  },
  {
    name: 'Retailers & Supermarkets',
    note: 'Direct mill rice, consumer sugar packs, FMCG restocks & wholesale lots.',
    image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80',
    tag: 'Grocery Stores',
  },
  {
    name: 'Commercial Bakeries',
    note: 'Hard wheat flour, 50kg sugar bags, yeast, margarine & pastry packaging.',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
    tag: 'Confectionery',
  },
  {
    name: 'Catering & Cloud Kitchens',
    note: 'Commercial meal lots, disposable trays, cooking gas & scheduled daily drops.',
    image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80',
    tag: 'Event Foodservice',
  },
  {
    name: 'Corporate Facilities & Offices',
    note: 'Pantry coffee & tea, sanitary supplies, paper products & water carboys.',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
    tag: 'Enterprises',
  },
];

const VERIFIED_SUPPLIERS = [
  {
    name: 'Colombo Central Wholesalers',
    category: 'Direct Importer & Grocery Wholesaler',
    location: '42 Old Moor Street, Colombo 11',
    coverage: 'Western & Southern Province 24h dispatch',
    productsCount: '150+ wholesale lines',
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Lanka Agro Mills & Processing',
    category: 'Primary Rice Miller & Grain Processor',
    location: '15 Industrial Zone, Kurunegala',
    coverage: 'Island-wide bulk deliveries',
    productsCount: '45+ mill-direct grain lines',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Island Logistics & Distribution',
    category: 'Authorized Estate & Beverage Depot',
    location: '88 Katugastota Road, Kandy',
    coverage: 'Central Province & Hill Country cold chain',
    productsCount: '80+ FMCG & tea lines',
    image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80',
  },
];

const JOURNEY = [
  {
    n: '01',
    t: 'Discover',
    b: 'Search the wholesale catalog by product, brand, or category — then open every live offer on a product.',
  },
  {
    n: '02',
    t: 'Compare',
    b: 'VYRO ranks suppliers by best price, best value, and fastest delivery. MOQ, lead time, and availability sit beside the number.',
  },
  {
    n: '03',
    t: 'Issue',
    b: 'One cart, many suppliers. Checkout splits the order into independent, binding purchase orders — each with its own journey.',
  },
  {
    n: '04',
    t: 'Move',
    b: 'Track Order → Supplier → Preparation → Delivery → Business. Every status change is written to the audit trail.',
  },
];

const FAQ = [
  {
    q: 'Can I search and compare prices without an account?',
    a: 'Yes. The VYRO wholesale catalog is completely open. You only register your business when you are ready to add items to cart and issue binding purchase orders.',
  },
  {
    q: 'What happens if I buy from multiple suppliers in one checkout?',
    a: 'Checkout automatically splits your single cart into separate, independent purchase orders. Each supplier receives their specific order with dedicated delivery windows and invoice trails.',
  },
  {
    q: 'How does VYRO verify suppliers?',
    a: 'Every supplier on the network submits registered business documents, warehouse physical address verification, and verified bank credentials before listing catalog items.',
  },
  {
    q: 'Are delivery logistics covered?',
    a: 'Yes. Every product listing displays real supplier lead times, dispatch locations, and available delivery options to your registered delivery address across 25 Sri Lankan districts.',
  },
];

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hoveredProduct, setHoveredProduct] = useState<ProductPreviewItem | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const productsSectionRef = useRef<HTMLDivElement | null>(null);

  const feed = useQuery({
    queryKey: ['home-feed'],
    queryFn: () =>
      api.get<{
        featuredProducts: Array<{ id: string; name: string; image: string | null; categoryName?: string }>;
        verifiedSuppliers: Array<{ id: string; name: string; description?: string | null }>;
        trustStats: { districtsCovered: number; lifetimeGmvCents: number; activeBusinesses: number; activeSuppliers: number };
      }>('/home/feed'),
  });

  const featuredProducts = (feed.data?.featuredProducts ?? []).slice(0, FEATURED_PRODUCTS.length);
  const verifiedSuppliers = feed.data?.verifiedSuppliers ?? [];
  const trustStats = feed.data?.trustStats;
  const renderedTrustStats = trustStats
    ? [
        { metric: String(trustStats.districtsCovered), label: 'Districts Covered', sub: 'Island-wide freight routing' },
        {
          metric: `Rs. ${(trustStats.lifetimeGmvCents / 100 / 1_000_000).toFixed(0)}M+`,
          label: 'Wholesale Throughput',
          sub: 'Active commercial trading volume',
        },
        {
          metric: `${trustStats.activeSuppliers > 0 ? '100%' : '0%'}`,
          label: 'Verified Suppliers',
          sub: 'Audited tax & depot identity',
        },
        { metric: '0%', label: 'Hidden Broker Markup', sub: 'Direct factory & mill prices' },
      ]
    : TRUST_STATS;

  function goSearch(term?: string) {
    const q = (term ?? query).trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    goSearch();
  }

  return (
    <div className="bg-bone">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden bg-void text-paper grain min-h-[calc(100dvh-4rem)] flex flex-col justify-center">
        <div className="absolute inset-0" aria-hidden>
          <FlowCanvas tone="paper" density="hero" className="absolute inset-0 opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-r from-void via-void/80 to-void/30" />
          <div className="absolute -left-24 top-[15%] size-[32rem] rounded-full bg-volt/[0.10] blur-[120px] pointer-events-none" />
          <div className="absolute right-0 bottom-0 size-[28rem] rounded-full bg-copper/[0.08] blur-[120px] pointer-events-none" />
        </div>

        <div className="relative max-w-stage mx-auto w-full px-5 sm:px-8 py-16 lg:py-20 grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left Column: Heading & Search */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-paper/10 border border-paper/15 text-xs text-volt mb-6">
              <span className="size-2 rounded-full bg-volt animate-pulse" />
              <span className="vyro-kicker text-volt">Sri Lanka's B2B Wholesale Operating Layer</span>
            </div>

            <h1 className="vyro-display text-[2.75rem] sm:text-6xl lg:text-[4.5rem] text-paper leading-[1.06] max-w-2xl text-balance">
              Everything a business <span className="text-volt">needs, connected.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base sm:text-lg text-paper/75 leading-relaxed">
              Source direct from verified mills, importers, and licensed distributors across Sri Lanka. Real-time LKR prices, multi-supplier split carts, and end-to-end delivery tracking.
            </p>

            {/* Search Input Box */}
            <form onSubmit={handleSearchSubmit} className="mt-8 max-w-xl">
              <label htmlFor="home-search" className="sr-only">
                Search the wholesale catalog
              </label>
              <div className="flex flex-col sm:flex-row bg-paper shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] focus-within:shadow-[0_0_0_2px_#C6DC4A,0_20px_50px_-20px_rgba(0,0,0,0.6)] transition-all">
                <div className="relative flex-1">
                  <SearchIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
                  <input
                    id="home-search"
                    name="q"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search rice, sugar, tea, oil, packaging, cement…"
                    autoComplete="off"
                    className="w-full h-14 bg-transparent pl-12 pr-4 text-ink placeholder:text-ink-4 text-sm sm:text-base focus:outline-none font-medium"
                  />
                </div>
                <Button type="submit" size="lg" className="m-1.5 sm:min-w-40 bg-ink text-paper hover:bg-ink-2">
                  Search Catalog →
                </Button>
              </div>
            </form>

            {/* Quick Keyword Pills */}
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-paper/40 mr-1">Popular:</span>
                {POPULAR.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => goSearch(term)}
                    className="px-2.5 py-1 text-[11px] font-mono text-paper/70 bg-paper/5 border border-paper/15 hover:border-volt hover:text-volt hover:bg-paper/10 transition-colors cursor-pointer"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Live marketplace counts (from /api/home/feed) */}
            {feed.data && (
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="px-3 py-1 text-xs font-mono text-volt bg-volt/10 border border-volt/30 rounded-full">
                  {feed.data.featuredProducts.length} live products
                </span>
                <span className="px-3 py-1 text-xs font-mono text-volt bg-volt/10 border border-volt/30 rounded-full">
                  {feed.data.verifiedSuppliers.length} verified suppliers
                </span>
              </div>
            )}

            {/* Value Props Bullet List */}
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-paper/65">
              {['Live unit prices in LKR', 'No middleman markups', '25 districts covered', 'Automated PO generation'].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="size-1.5 rotate-45 bg-volt shrink-0" aria-hidden />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Right Column: Hero Visual Showcase */}
          <div className="lg:col-span-5">
            <div className="grid grid-cols-2 gap-3 h-[32rem]">
              {/* Large Featured Product Tile */}
              <div className="relative col-span-2 row-span-2 overflow-hidden border border-paper/15 group">
                <img
                  src={HERO_PROOF.image}
                  alt={HERO_PROOF.product}
                  className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />

                {/* Floating Live Pricing Badge */}
                <div className="absolute top-4 right-4 bg-ink/90 backdrop-blur-md px-3 py-1 border border-volt/40 flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-full bg-volt animate-ping" />
                  <span className="font-mono text-volt font-bold">LIVE OFFERS</span>
                </div>

                {/* Overlay Details */}
                <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-void via-void/90 to-transparent">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-volt">Wholesale Benchmark</span>
                      <h2 className="font-display text-2xl sm:text-3xl text-paper mt-0.5">{HERO_PROOF.product}</h2>
                      <p className="text-xs text-paper/70 mt-1">{HERO_PROOF.origin}</p>
                    </div>
                    <Link
                      to="/search?q=rice"
                      className="px-3 py-1.5 bg-volt text-ink text-xs font-bold uppercase tracking-wider hover:bg-volt-glow transition-colors"
                    >
                      Compare →
                    </Link>
                  </div>

                  {/* 3 Offers live preview */}
                  <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-paper/15">
                    {HERO_PROOF.offers.map((o) => (
                      <div key={o.tag} className="bg-void/80 backdrop-blur-sm p-2 border border-paper/10">
                        <span className="text-[9px] uppercase tracking-wider text-paper/50 block">{o.tag}</span>
                        <span className="vyro-metric text-base text-paper font-bold block mt-0.5">{o.value}</span>
                        <span className="text-[10px] text-paper/60 truncate block">{o.hint}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Secondary Mini Image Tiles */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              {HERO_MOSAIC.map((item) => (
                <Link
                  key={item.name}
                  to={`/search?q=${item.query}`}
                  className="relative h-28 overflow-hidden border border-paper/15 group cursor-pointer"
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/30 to-transparent" />
                  <div className="absolute bottom-2 inset-x-2">
                    <span className="text-[9px] font-mono text-volt uppercase block truncate">{item.badge}</span>
                    <span className="text-xs font-display text-paper leading-tight block truncate group-hover:text-volt transition-colors">
                      {item.name}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. TRUST STATS TICKER */}
      <section className="bg-bone border-b border-ink/10 py-8">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
            {renderedTrustStats.map((s) => (
              <div key={s.label} className="border-l-2 border-volt pl-4">
                <div className="vyro-metric text-3xl sm:text-4xl text-ink font-bold">{s.metric}</div>
                <div className="font-display text-base text-ink mt-1 font-semibold">{s.label}</div>
                <div className="text-xs text-ink-4 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. FEATURED WHOLESALE LOTS (LIVE PRODUCTS SHOWCASE - EDITORIAL PARTICLES) */}
      <section
        ref={productsSectionRef}
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHoveredProduct(null)}
        className="relative bg-[#0C0E0B] text-paper border-y border-ink/40 py-24 sm:py-32 overflow-hidden"
      >
        {/* Ambient atmospheric gradients */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-volt/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-copper/5 rounded-full blur-3xl pointer-events-none" />

        {/* Floating cursor preview with particle assembly */}
        <div className="hidden lg:block">
          <ProductHoverPreview
            activeProduct={hoveredProduct}
            mousePos={mousePos}
            containerRef={productsSectionRef}
          />
        </div>

        <div className="max-w-stage mx-auto px-5 sm:px-8 relative z-10">
          {/* Section Header matching portfolio aesthetic */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-12 sm:pb-16 border-b border-paper/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-volt animate-pulse" />
                <span className="text-[11px] font-mono tracking-widest text-volt uppercase">
                  SELECTED COMMODITIES · MARKETPLACE BENCHMARK
                </span>
              </div>
              <h2 className="mt-4 vyro-display text-4xl sm:text-6xl text-paper tracking-tight">
                Things We Supply
              </h2>
              <p className="mt-3 text-sm sm:text-base text-ink-5 max-w-xl font-sans">
                From mill-direct grains to commercial estate tea, every wholesale lot is benchmarked with live transparent pricing and verified origin.
              </p>
            </div>
            <Link
              to="/search"
              className="group inline-flex items-center gap-2 text-xs sm:text-sm font-mono uppercase tracking-wider text-paper/80 hover:text-volt transition-colors py-2.5 px-5 border border-paper/20 hover:border-volt rounded-full backdrop-blur-sm self-start md:self-end"
            >
              <span>Browse full catalog</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>

          {/* Product Items List (Editorial Numbered Rows) */}
          <div className="divide-y divide-paper/10">
            {FEATURED_PRODUCTS.map((p, idx) => {
              const numStr = String(idx + 1).padStart(2, '0');
              const isHovered = hoveredProduct?.id === p.id;
              const isAnyHovered = hoveredProduct !== null;

              return (
                <Link
                  key={p.id}
                  to={`/products/${p.id}`}
                  onMouseEnter={() => setHoveredProduct(p)}
                  className={`group relative block py-8 sm:py-10 transition-all duration-300 ${
                    isAnyHovered
                      ? isHovered
                        ? 'opacity-100 translate-x-1 sm:translate-x-2'
                        : 'opacity-30'
                      : 'opacity-90 hover:opacity-100'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Number, Title & Metadata */}
                    <div className="flex items-start sm:items-center gap-5 sm:gap-8 flex-1 min-w-0">
                      <span className="text-xs sm:text-sm font-mono text-ink-5 shrink-0 group-hover:text-volt transition-colors pt-1 sm:pt-0">
                        {numStr}
                      </span>

                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <h3 className="vyro-display text-2xl sm:text-4xl text-paper group-hover:text-volt transition-colors truncate">
                            {p.name}
                          </h3>
                          {p.badge && (
                            <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-paper/10 text-paper/90 border border-paper/20 rounded group-hover:border-volt/40 group-hover:text-volt transition-colors shrink-0">
                              {p.badge}
                            </span>
                          )}
                        </div>

                        {/* Metadata Tagline */}
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] sm:text-xs font-mono text-ink-5 uppercase tracking-wider">
                          <span className="text-copper">{p.category}</span>
                          <span className="text-ink-5/50">•</span>
                          <span className="text-ink-4">{p.supplier}</span>
                          <span className="text-ink-5/50 hidden sm:inline">•</span>
                          <span className="text-volt/80 hidden sm:inline">{p.leadTime} dispatch</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Pricing, MOQ, and Arrow Indicator */}
                    <div className="flex items-center justify-between lg:justify-end gap-6 sm:gap-8 shrink-0 pt-2 lg:pt-0 border-t border-paper/5 lg:border-t-0">
                      <div className="text-left lg:text-right">
                        <div className="vyro-metric text-xl sm:text-2xl font-bold text-paper group-hover:text-volt transition-colors">
                          {p.price}
                        </div>
                        <div className="text-[11px] font-mono text-ink-5">
                          {p.unit} · <span className="text-paper/60">{p.moq}</span>
                        </div>
                      </div>

                      <div className="w-10 h-10 rounded-full border border-paper/20 group-hover:border-volt group-hover:bg-volt group-hover:text-ink text-paper/80 flex items-center justify-center transition-all duration-300">
                        <span className="transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-base">
                          ↗
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mobile inline preview (for touch devices) */}
                  <div className="mt-4 lg:hidden rounded-lg overflow-hidden border border-paper/15 relative h-40 bg-ink/60">
                    <img
                      src={p.image}
                      alt={p.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-transparent to-transparent flex items-end p-3">
                      <span className="text-xs font-mono text-paper">Tap to view lot specifications →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Section Footer stats banner */}
          <div className="mt-16 pt-8 border-t border-paper/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-ink-5">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-volt" />
              <span>Direct factory clearing prices updated every 4 hours</span>
            </div>
            <Link to="/search" className="text-copper hover:text-paper transition-colors underline underline-offset-4">
              View all 120+ wholesale product specifications →
            </Link>
          </div>
        </div>
      </section>

      {/* 4. WHO IT'S FOR (OPERATORS PHOTOGRAPHIC GRID) */}
      <section className="bg-paper border-y border-ink/10 py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-end mb-12">
            <div>
              <div className="vyro-kicker text-copper">Network Participants</div>
              <h2 className="mt-2 vyro-display text-3xl sm:text-5xl text-ink">Built for operators who buy weekly.</h2>
            </div>
            <p className="text-sm sm:text-base text-ink-3 leading-relaxed">
              From high-table dining establishments and 5-star coastal resorts to retail chains and commercial bakeries — VYRO connects operators directly to the primary supply source.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BUSINESSES.map((b) => (
              <Link
                key={b.name}
                to="/onboarding/business"
                className="group relative h-80 overflow-hidden border border-ink/15 hover:border-ink transition-all duration-300 flex flex-col justify-end p-6 cursor-pointer"
              >
                {/* Background Photo */}
                <img
                  src={b.image}
                  alt={b.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover group-hover:scale-108 transition-transform duration-700 brightness-[0.85] group-hover:brightness-95"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/60 to-transparent" />

                {/* Floating Content */}
                <div className="relative z-10">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-volt text-ink inline-block mb-3">
                    {b.tag}
                  </span>
                  <h3 className="font-display text-2xl text-paper group-hover:text-volt transition-colors">{b.name}</h3>
                  <p className="mt-2 text-xs text-paper/80 leading-relaxed line-clamp-2">{b.note}</p>
                  <div className="mt-4 pt-3 border-t border-paper/20 flex items-center justify-between text-xs text-paper font-semibold">
                    <span>Register business</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SECTORS CATALOG (WITH IMAGES) */}
      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <div className="vyro-kicker text-copper">Wholesale Lines</div>
            <h2 className="mt-2 vyro-display text-3xl sm:text-5xl text-ink">What moves through VYRO</h2>
            <p className="mt-2 text-sm text-ink-3 max-w-lg">
              Mill-direct grains, industrial commodities, export spices, and construction inputs.
            </p>
          </div>
          <Link to="/search" className="text-sm font-semibold text-copper hover:text-ink">
            Search all categories →
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.name}
              to={`/search?q=${encodeURIComponent(c.query)}`}
              className="group bg-paper border border-ink/15 hover:border-ink hover:shadow-md transition-all duration-240 overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="relative h-36 overflow-hidden bg-bone">
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute top-2 right-2 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-paper/90 backdrop-blur-sm border border-ink/10 text-ink">
                    {c.volume}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-display text-xl text-ink group-hover:text-copper transition-colors leading-snug">
                    {c.name}
                  </h3>
                  <p className="mt-1.5 text-xs text-ink-4 leading-relaxed line-clamp-2">{c.detail}</p>
                </div>
              </div>
              <div className="p-4 pt-0 flex items-center justify-between text-xs border-t border-ink/10 pt-3 mt-2 text-copper font-medium">
                <span>{c.count}</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 6. VERIFIED SUPPLIER DEPOTS SPOTLIGHT */}
      <section className="bg-paper border-t border-ink/10 py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-12">
            <div className="vyro-kicker text-copper">Verified Supply Base</div>
            <h2 className="mt-2 vyro-display text-3xl sm:text-5xl text-ink">Direct from primary depots and mills.</h2>
            <p className="mt-3 text-sm text-ink-3">
              Every supplier on VYRO operates physical warehouse facilities, audited stock inventories, and dedicated delivery dispatch fleets.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {VERIFIED_SUPPLIERS.map((s) => (
              <div
                key={s.name}
                className="bg-bone border border-ink/15 overflow-hidden flex flex-col justify-between hover:border-ink hover:shadow-lg transition-all duration-300"
              >
                <div>
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={s.image}
                      alt={s.name}
                      loading="lazy"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 right-3 px-2 py-1 bg-ink text-volt text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md">
                      <CheckCircleIcon size={12} />
                      Verified Facility
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-copper block">{s.category}</span>
                    <h3 className="font-display text-xl text-ink font-semibold">{s.name}</h3>

                    <div className="space-y-1.5 text-xs text-ink-3 pt-2 border-t border-ink/10">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-4">Location:</span>
                        <span className="font-medium text-ink">{s.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-4">Dispatch:</span>
                        <span className="text-ink-2">{s.coverage}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-4">Inventory:</span>
                        <span className="text-volt-dark font-semibold">{s.productsCount}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0">
                  <Link
                    to={`/search?q=${encodeURIComponent(s.name.split(' ')[0] || s.name)}`}
                    className="w-full h-10 border border-ink/20 hover:border-ink hover:bg-ink hover:text-paper transition-colors flex items-center justify-center text-xs font-semibold uppercase tracking-wider"
                  >
                    View Supplier Catalog →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. HOW IT WORKS (FOUR MOVEMENTS WITH VISUAL PROCESS) */}
      <section className="bg-bone border-t border-ink/10 py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <div className="vyro-kicker text-copper">How It Operates</div>
              <h2 className="vyro-display text-3xl sm:text-5xl text-ink text-balance">Four movements. One continuous flow.</h2>
              <p className="text-sm sm:text-base text-ink-3 leading-relaxed">
                Procurement in Sri Lanka shouldn't be scattered across WhatsApp screenshots, handwritten chits, and phone tag. VYRO gives your business an auditable digital trail from live quote to delivery signature.
              </p>

              <div className="pt-2">
                <FlowLine
                  nodes={[
                    { label: 'Discover', state: 'done' },
                    { label: 'Compare', state: 'active' },
                    { label: 'Issue', state: 'idle' },
                    { label: 'Move', state: 'idle' },
                  ]}
                />
              </div>

              <div className="pt-4 flex gap-4">
                <Link to={user ? '/search' : '/onboarding/business'}>
                  <Button>{user ? 'Enter Marketplace' : 'Register Your Business'}</Button>
                </Link>
                <Link to="/how-it-works">
                  <Button variant="secondary">Full Walkthrough →</Button>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {JOURNEY.map((s) => (
                  <div key={s.n} className="bg-paper p-6 border border-ink/15 shadow-sm space-y-3">
                    <span className="vyro-metric text-3xl text-copper font-bold">{s.n}</span>
                    <h3 className="font-display text-2xl text-ink">{s.t}</h3>
                    <p className="text-xs text-ink-3 leading-relaxed">{s.b}</p>
                  </div>
                ))}
              </div>

              {/* Live Dispatch Preview Bar */}
              <div className="bg-paper border border-ink/15 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-volt/20 flex items-center justify-center text-ink shrink-0">
                    <TruckIcon size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-copper block">Dispatch Journey</span>
                    <span className="text-xs font-semibold text-ink">PO #2026-0841 · Western Province Route Active</span>
                  </div>
                </div>
                <span className="px-3 py-1 bg-ink text-paper text-[11px] font-mono uppercase tracking-wider shrink-0">
                  Track in Real-Time
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FAQ SECTION */}
      <section className="bg-paper border-t border-ink/10 py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-12">
            <div className="vyro-kicker text-copper">Questions & Answers</div>
            <h2 className="mt-2 vyro-display text-3xl sm:text-5xl text-ink">Everything you need to know.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {FAQ.map((item) => (
              <div key={item.q} className="p-6 bg-bone border border-ink/15 space-y-3">
                <h3 className="font-display text-xl text-ink font-semibold">{item.q}</h3>
                <p className="text-sm text-ink-3 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. BOTTOM DUAL-AUDIENCE CTA WITH PHOTOGRAPHY */}
      <section className="bg-ink text-paper grain relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <FlowCanvas tone="paper" density="hero" />
        </div>

        <div className="relative max-w-stage mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-2 gap-8">
          {/* Buyer CTA Box */}
          <div className="relative overflow-hidden border border-paper/15 p-8 sm:p-10 flex flex-col justify-between group">
            <img
              src="https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=800&q=80"
              alt="Commercial procurement kitchen chef"
              className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-105 transition-all duration-700"
            />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <BrandMark size={24} tone="volt" />
                <span className="vyro-kicker text-volt">For Buying Businesses</span>
              </div>
              <h2 className="vyro-display text-3xl sm:text-4xl text-paper">Stop chasing quotes. Start procuring.</h2>
              <p className="text-sm text-paper/75 max-w-md">
                Register your business in under 2 minutes, browse live LKR prices, compare multiple suppliers, and issue binding POs.
              </p>
              <ul className="space-y-2 text-xs text-paper/70 pt-2">
                <li className="flex items-center gap-2">✓ Live supplier unit quotes updated daily</li>
                <li className="flex items-center gap-2">✓ Automated multi-supplier order splitting</li>
                <li className="flex items-center gap-2">✓ 25 Sri Lankan districts receiving delivery</li>
              </ul>
            </div>
            <div className="relative z-10 pt-8">
              <Link to={user ? '/search' : '/onboarding/business'}>
                <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs px-6 py-3">
                  {user ? 'Browse Live Catalog →' : 'Register Your Business →'}
                </Button>
              </Link>
            </div>
          </div>

          {/* Supplier CTA Box */}
          <div className="relative overflow-hidden border border-paper/15 p-8 sm:p-10 flex flex-col justify-between group">
            <img
              src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=80"
              alt="Wholesale warehouse manager"
              className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-105 transition-all duration-700"
            />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <BrandMark size={24} tone="paper" />
                <span className="vyro-kicker text-copper">For Wholesale Suppliers</span>
              </div>
              <h2 className="vyro-display text-3xl sm:text-4xl text-paper">Put your inventory in the flow.</h2>
              <p className="text-sm text-paper/75 max-w-md">
                Connect your mill, factory, or distribution depot directly to commercial buyers across Sri Lanka without middleman fees.
              </p>
              <ul className="space-y-2 text-xs text-paper/70 pt-2">
                <li className="flex items-center gap-2">✓ Incoming digital POs directly into your dashboard</li>
                <li className="flex items-center gap-2">✓ Set your own minimum order quantities & lead times</li>
                <li className="flex items-center gap-2">✓ Direct commercial buyer relationships</li>
              </ul>
            </div>
            <div className="relative z-10 pt-8">
              <Link to="/onboarding/supplier">
                <Button variant="secondary" className="text-paper border-paper/30 hover:bg-paper hover:text-ink font-bold uppercase tracking-wider text-xs px-6 py-3">
                  List as Authorized Supplier →
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

