import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ProductHoverPreview, type ProductPreviewItem } from '@/components/products/ProductHoverPreview';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  TruckIcon,
  PackageIcon,
  CheckCircleIcon,
  CheckIcon,
  ArrowRightIcon,
  ClockIcon,
  PlusIcon,
  MinusIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import { FlowCanvas } from '@/components/brand/FlowLine';
import { BrandMark } from '@/components/brand/BrandMark';
import { SkylineSection } from '@/components/brand/SkylineSection';
import { CatalogSearch } from '@/components/CatalogSearch';
import { CATALOG_IMAGES } from '@/lib/catalogImages';
import { renderTrustStats } from '@/lib/trustStats';

const POPULAR = ['Rice', 'Sugar', 'Ceylon Tea', 'Coconut Oil', 'Wheat Flour', 'Cement', 'Packaging', 'Spices'];

const HERO_PROOF = {
  product: 'Samba Rice · 25 kg Bag',
  origin: 'Mill-Direct · Western Province Milling Hub',
  image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=80',
  offers: [
    { tag: 'Best price', supplier: 'Lanka Agro Mills', price: 'Rs. 4,200', lead: '48h', bar: 82 },
    { tag: 'Best value', supplier: 'Colombo Wholesalers', price: 'Rs. 4,450', lead: '36h', bar: 90 },
    { tag: 'Fastest', supplier: 'Island Logistics', price: 'Rs. 4,620', lead: '24h', bar: 100 },
  ],
} as const;

const HERO_PROMISES = ['Live LKR unit prices', 'No middleman markups', 'Automated split POs'];

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
    image: CATALOG_IMAGES.SUGAR,
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
    image: CATALOG_IMAGES.FLOUR,
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
    imageUrl: CATALOG_IMAGES.SUGAR,
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
        sponsored?: Array<{ slotId: string; campaignId: string | null; productId: string | null; surface: 'search'|'category'|'homepage'|'storefront'; position: number }>;
      }>('/home/feed'),
  });

  const renderedTrustStats = renderTrustStats(feed.data?.trustStats);

  function goSearch(term?: string) {
    const q = (term ?? query).trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  return (
    <div className="bg-bone">
      {/* 1. HERO SECTION */}
      <section className="relative isolate overflow-hidden bg-void text-paper grain min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] flex flex-col justify-center">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <FlowCanvas tone="paper" density="hero" className="absolute inset-0 opacity-30" />
          {/* Hairline grid, faded toward the edges */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(250,247,240,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(250,247,240,0.045)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_70%_60%_at_40%_40%,#000_30%,transparent_100%)]" />
          <div className="absolute -left-40 -top-40 size-[40rem] rounded-full bg-volt/[0.09] blur-[140px]" />
          <div className="absolute right-[-10rem] bottom-[-12rem] size-[36rem] rounded-full bg-copper/[0.10] blur-[140px]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-void to-transparent" />
        </div>

        <div className="relative max-w-stage mx-auto w-full px-5 sm:px-8 py-14 sm:py-20 lg:py-24 grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Heading & Search */}
          <div className="lg:col-span-7 min-w-0">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-paper/10 bg-paper/[0.04] py-1 pl-1 pr-3.5 backdrop-blur-md">
              <span className="rounded-full bg-volt px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">New</span>
              <span className="text-xs text-paper/70">Sri Lanka's B2B wholesale operating layer</span>
            </div>

            <h1 className="mt-7 vyro-display text-[2.05rem] min-[400px]:text-[2.4rem] sm:text-6xl lg:text-5xl xl:text-[4.6rem] text-paper leading-[0.98] tracking-[-0.045em] text-balance">
              Everything a business needs,{' '}
              <span className="relative whitespace-nowrap bg-gradient-to-r from-volt via-volt-glow to-volt bg-clip-text text-transparent">
                connected.
              </span>
            </h1>

            <p className="mt-7 max-w-lg text-base sm:text-lg text-paper/60 leading-relaxed text-pretty">
              Source direct from verified mills, importers and licensed distributors. Real-time LKR prices, multi-supplier carts and delivery tracking — in one place.
            </p>

            <div className="mt-9">
              <CatalogSearch
                variant="hero"
                inputId="home-search"
                value={query}
                onChange={setQuery}
                onSubmit={(term) => goSearch(term)}
                placeholder="Search rice, sugar, tea, cement…"
              />
            </div>

            {/* Quick Keyword Pills */}
            <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 max-w-xl">
              <span className="text-xs text-paper/40 mr-2">Trending</span>
              {POPULAR.slice(0, 6).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => goSearch(term)}
                  className="rounded-full px-3 py-1 text-xs text-paper/65 ring-1 ring-inset ring-paper/10 hover:ring-volt/50 hover:text-volt hover:bg-volt/[0.06] transition-colors duration-180"
                >
                  {term}
                </button>
              ))}
            </div>

            {/* Proof strip: live marketplace counts (from /api/home/feed) + promises */}
            <div className="mt-10 pt-8 border-t border-paper/10 flex flex-wrap items-center gap-x-8 gap-y-4">
              {feed.data && (
                <div className="flex items-center gap-6">
                  <div>
                    <div className="vyro-metric text-2xl text-paper">{feed.data.featuredProducts.length}</div>
                    <div className="text-[11px] text-paper/45 mt-0.5">Live products</div>
                  </div>
                  <div className="h-8 w-px bg-paper/10" aria-hidden />
                  <div>
                    <div className="vyro-metric text-2xl text-paper">{feed.data.verifiedSuppliers.length}</div>
                    <div className="text-[11px] text-paper/45 mt-0.5">Verified suppliers</div>
                  </div>
                  <div className="h-8 w-px bg-paper/10" aria-hidden />
                </div>
              )}
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-paper/60">
                {HERO_PROMISES.map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <CheckCircleIcon size={14} className="text-volt shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Column: live offer comparison card */}
          <div className="lg:col-span-5 min-w-0">
            <div className="relative">
              <div className="absolute -inset-px rounded-[1.4rem] bg-gradient-to-b from-paper/20 via-paper/5 to-transparent" aria-hidden />
              <div className="relative overflow-hidden rounded-[1.35rem] bg-ink/80 backdrop-blur-xl shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]">
                <div className="relative h-48 sm:h-56 overflow-hidden group">
                  <img
                    src={HERO_PROOF.image}
                    alt={HERO_PROOF.product}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-cinematic group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
                  <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-void/60 px-3 py-1 backdrop-blur-md ring-1 ring-paper/10">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-volt opacity-60 animate-ping" />
                      <span className="relative inline-flex size-2 rounded-full bg-volt" />
                    </span>
                    <span className="text-[11px] font-medium text-paper/90">3 live offers</span>
                  </div>
                  <div className="absolute inset-x-5 bottom-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-volt">Wholesale benchmark</p>
                    <h2 className="mt-1 font-display text-2xl sm:text-[1.75rem] font-bold tracking-tight text-paper truncate">
                      {HERO_PROOF.product}
                    </h2>
                    <p className="mt-0.5 text-xs text-paper/55 truncate">{HERO_PROOF.origin}</p>
                  </div>
                </div>

                <ul className="px-3 pt-2 pb-1">
                  {HERO_PROOF.offers.map((o, i) => {
                    const best = i === 0;
                    return (
                      <li
                        key={o.tag}
                        className={`flex items-center gap-3 rounded-xl px-3 py-3 ${best ? 'bg-volt/[0.08] ring-1 ring-inset ring-volt/25' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-paper truncate">{o.supplier}</span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-px text-[10px] font-semibold ${best ? 'bg-volt text-ink' : 'bg-paper/[0.07] text-paper/60'}`}
                            >
                              {o.tag}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-paper/[0.07]">
                              <div
                                className={`h-full rounded-full ${best ? 'bg-volt' : 'bg-paper/25'}`}
                                style={{ width: `${o.bar}%` }}
                              />
                            </div>
                            <span className="inline-flex items-center gap-1 text-[10px] text-paper/45 shrink-0">
                              <ClockIcon size={11} />
                              {o.lead}
                            </span>
                          </div>
                        </div>
                        <span className={`vyro-metric text-base sm:text-lg shrink-0 ${best ? 'text-volt' : 'text-paper/85'}`}>
                          {o.price}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex items-center justify-between gap-3 border-t border-paper/10 px-6 py-4 mt-2">
                  <span className="text-xs text-paper/45">Per 25 kg bag · MOQ 5 bags</span>
                  <Link
                    to="/search?q=rice"
                    className="group inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-xs font-semibold text-ink hover:bg-volt transition-colors duration-180"
                  >
                    Compare offers
                    <ArrowRightIcon size={13} className="transition-transform duration-180 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>

              {/* Floating dispatch toast */}
              <div className="hidden sm:flex absolute -top-6 right-6 xl:-right-8 items-center gap-3 rounded-2xl bg-paper px-4 py-3 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
                <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-volt">
                  <TruckIcon size={18} />
                </span>
                <div className="leading-tight">
                  <div className="text-xs font-semibold">PO #2026-0841 dispatched</div>
                  <div className="mt-0.5 text-[11px] text-ink-4">Colombo 11 → Kandy · ETA 24h</div>
                </div>
              </div>
            </div>

            {/* Secondary category tiles */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {HERO_MOSAIC.map((item) => (
                <Link
                  key={item.name}
                  to={`/search?q=${item.query}`}
                  className="group relative h-24 sm:h-28 overflow-hidden rounded-2xl ring-1 ring-inset ring-paper/10"
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-cinematic group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void/95 via-void/40 to-transparent" />
                  <div className="absolute bottom-2.5 inset-x-3">
                    <span className="block text-[9px] font-medium uppercase tracking-[0.14em] text-volt/90 truncate">{item.badge}</span>
                    <span className="mt-0.5 block text-xs font-medium text-paper leading-tight truncate group-hover:text-volt transition-colors">
                      {item.name}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. TRUST STATS */}
      <section className="relative bg-bone py-14 sm:py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 rounded-3xl bg-paper ring-1 ring-ink/[0.06] shadow-[0_24px_60px_-32px_rgba(12,14,11,0.25)] overflow-hidden">
            {renderedTrustStats.map((s, i) => (
              <div
                key={s.label}
                className={`relative p-6 sm:p-8 min-w-0 ${i % 2 === 1 ? 'border-l border-ink/[0.07]' : ''} ${i >= 2 ? 'border-t lg:border-t-0 border-ink/[0.07]' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
              >
                <div className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.04em] text-ink break-words leading-none">
                  {s.metric}
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="size-1.5 rounded-full bg-volt-deep shrink-0" aria-hidden />
                  {s.label}
                </div>
                <div className="mt-1 text-xs text-ink-4 leading-snug">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. FEATURED WHOLESALE LOTS (editorial list with cursor preview) */}
      <section
        ref={productsSectionRef}
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHoveredProduct(null)}
        className="relative isolate bg-ink text-paper py-20 sm:py-28 lg:py-32 overflow-hidden grain"
      >
        <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden>
          <div className="absolute -top-40 left-1/4 size-[36rem] rounded-full bg-volt/[0.06] blur-[140px]" />
          <div className="absolute -bottom-40 right-0 size-[32rem] rounded-full bg-copper/[0.07] blur-[140px]" />
        </div>

        <div className="hidden lg:block">
          <ProductHoverPreview activeProduct={hoveredProduct} mousePos={mousePos} containerRef={productsSectionRef} />
        </div>

        <div className="max-w-stage mx-auto px-5 sm:px-8 relative z-10">
          <SectionHeading
            tone="dark"
            eyebrow="Marketplace benchmark"
            title="Things we supply."
            body="From mill-direct grains to estate tea — every wholesale lot is benchmarked with live, transparent pricing and verified origin."
            action={{ to: '/search', label: 'Browse full catalog' }}
          />

          <div className="mt-12 sm:mt-16 border-t border-paper/10">
            {FEATURED_PRODUCTS.map((p, idx) => {
              const isHovered = hoveredProduct?.id === p.id;
              const isAnyHovered = hoveredProduct !== null;

              return (
                <Link
                  key={p.id}
                  to={`/products/${p.id}`}
                  onMouseEnter={() => setHoveredProduct(p)}
                  className={`group relative block border-b border-paper/10 py-6 sm:py-8 transition-[opacity,transform] duration-320 ease-cinematic ${
                    isAnyHovered ? (isHovered ? 'opacity-100 lg:translate-x-3' : 'opacity-35') : 'opacity-100'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-10">
                    <div className="flex items-start sm:items-center gap-5 sm:gap-8 flex-1 min-w-0">
                      <span className="vyro-metric text-xs text-paper/35 shrink-0 pt-1.5 sm:pt-0 group-hover:text-volt transition-colors">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <h3 className="font-display text-xl sm:text-3xl font-bold tracking-[-0.03em] text-paper group-hover:text-volt transition-colors">
                            {p.name}
                          </h3>
                          {p.badge && (
                            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-paper/70 ring-1 ring-inset ring-paper/15 group-hover:ring-volt/40 group-hover:text-volt transition-colors shrink-0">
                              {p.badge}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-paper/45">
                          <span className="text-copper">{p.category}</span>
                          <span aria-hidden>·</span>
                          <span>{p.supplier}</span>
                          <span className="hidden sm:inline" aria-hidden>·</span>
                          <span className="hidden sm:inline-flex items-center gap-1">
                            <ClockIcon size={12} />
                            {p.leadTime} dispatch
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between lg:justify-end gap-6 sm:gap-8 shrink-0 pl-10 sm:pl-14 lg:pl-0">
                      <div className="text-left lg:text-right">
                        <div className="vyro-metric text-xl sm:text-2xl text-paper group-hover:text-volt transition-colors">{p.price}</div>
                        <div className="mt-0.5 text-[11px] text-paper/40">
                          {p.unit} · {p.moq}
                        </div>
                      </div>
                      <span className="flex size-11 items-center justify-center rounded-full ring-1 ring-inset ring-paper/15 text-paper/70 transition-all duration-320 ease-cinematic group-hover:bg-volt group-hover:text-ink group-hover:ring-volt group-hover:-rotate-45">
                        <ArrowRightIcon size={16} />
                      </span>
                    </div>
                  </div>

                  {/* Touch devices: inline image instead of the cursor preview */}
                  <div className="mt-4 ml-10 sm:ml-14 lg:hidden relative h-36 overflow-hidden rounded-2xl ring-1 ring-inset ring-paper/10">
                    <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-paper/45">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-volt opacity-60 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-volt" />
              </span>
              Factory clearing prices refresh every 4 hours
            </div>
            <Link to="/search" className="inline-flex items-center gap-1.5 text-paper/70 hover:text-volt transition-colors">
              View all 120+ wholesale lots
              <ArrowRightIcon size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. WHO IT'S FOR (bento grid) */}
      <section className="bg-paper py-20 sm:py-28">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <SectionHeading
            eyebrow="Network participants"
            title="Built for operators who buy every week."
            body="From fine-dining kitchens and coastal resorts to retail chains and commercial bakeries — VYRO connects operators directly to the primary supply source."
          />

          <div className="mt-12 sm:mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[17rem] sm:auto-rows-[16rem]">
            {BUSINESSES.map((b, i) => {
              const feature = i === 0;
              return (
                <Link
                  key={b.name}
                  to="/onboarding/business"
                  className={`group relative isolate flex flex-col justify-end overflow-hidden rounded-3xl p-6 sm:p-7 ${
                    feature ? 'sm:col-span-2 lg:row-span-2' : ''
                  }`}
                >
                  <img
                    src={b.image}
                    alt={b.name}
                    loading="lazy"
                    className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[1200ms] ease-cinematic group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 -z-10 bg-gradient-to-t from-void/95 via-void/45 to-void/5" />
                  <span className="absolute top-5 left-5 rounded-full bg-paper/15 px-3 py-1 text-[11px] font-medium text-paper backdrop-blur-md ring-1 ring-inset ring-paper/20">
                    {b.tag}
                  </span>
                  <span className="absolute top-5 right-5 flex size-10 items-center justify-center rounded-full bg-paper text-ink opacity-0 -translate-y-1 transition-all duration-320 ease-cinematic group-hover:opacity-100 group-hover:translate-y-0">
                    <ArrowRightIcon size={16} className="-rotate-45" />
                  </span>
                  <h3 className={`font-display font-bold tracking-[-0.03em] text-paper ${feature ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}>
                    {b.name}
                  </h3>
                  <p className={`mt-2 text-paper/70 leading-relaxed ${feature ? 'text-sm sm:text-base max-w-md' : 'text-xs line-clamp-2'}`}>
                    {b.note}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. SECTORS CATALOG */}
      <section className="bg-bone py-20 sm:py-28">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <SectionHeading
            eyebrow="Wholesale lines"
            title="What moves through VYRO."
            body="Mill-direct grains, industrial commodities, export spices and construction inputs."
            action={{ to: '/search', label: 'All categories' }}
          />

          <div className="mt-12 sm:mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((c) => (
              <Link
                key={c.name}
                to={`/search?q=${encodeURIComponent(c.query)}`}
                className="group flex flex-col rounded-3xl bg-paper p-2 ring-1 ring-ink/[0.06] transition-all duration-320 ease-cinematic hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(12,14,11,0.3)]"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-mist">
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-cinematic group-hover:scale-105"
                  />
                  <span className="absolute top-3 left-3 rounded-full bg-paper/85 px-2.5 py-1 text-[10px] font-medium text-ink backdrop-blur-md">
                    {c.volume}
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-3 pt-4 pb-3">
                  <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-ink leading-snug">{c.name}</h3>
                  <p className="mt-1.5 text-xs text-ink-4 leading-relaxed line-clamp-2">{c.detail}</p>
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-3">{c.count}</span>
                    <span className="flex size-8 items-center justify-center rounded-full bg-bone text-ink transition-colors duration-240 group-hover:bg-ink group-hover:text-volt">
                      <ArrowRightIcon size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 6. VERIFIED SUPPLIERS */}
      <section className="bg-paper py-20 sm:py-28">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <SectionHeading
            eyebrow="Verified supply base"
            title="Direct from primary depots and mills."
            body="Every supplier on VYRO runs physical warehouses, audited stock and its own dispatch fleet."
          />

          <div className="mt-12 sm:mt-16 grid gap-5 md:grid-cols-3">
            {VERIFIED_SUPPLIERS.map((s) => (
              <div
                key={s.name}
                className="group flex flex-col rounded-3xl bg-bone/60 p-2 ring-1 ring-ink/[0.06] transition-all duration-320 ease-cinematic hover:bg-paper hover:shadow-[0_24px_50px_-24px_rgba(12,14,11,0.3)]"
              >
                <div className="relative h-52 overflow-hidden rounded-2xl">
                  <img
                    src={s.image}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-cinematic group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void/50 to-transparent" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-medium text-volt backdrop-blur-md">
                    <ShieldCheckIcon size={12} />
                    Verified facility
                  </span>
                </div>

                <div className="flex flex-1 flex-col px-4 pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-sm font-bold text-volt">
                      {s.name
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-ink truncate">{s.name}</h3>
                      <p className="text-xs text-copper truncate">{s.category}</p>
                    </div>
                  </div>

                  <dl className="mt-5 space-y-2.5 text-xs">
                    {[
                      { icon: <MapPinIcon size={14} />, label: 'Location', value: s.location },
                      { icon: <TruckIcon size={14} />, label: 'Dispatch', value: s.coverage },
                      { icon: <PackageIcon size={14} />, label: 'Inventory', value: s.productsCount },
                    ].map((row) => (
                      <div key={row.label} className="flex items-start gap-2.5">
                        <dt className="mt-px text-ink-4 shrink-0">
                          {row.icon}
                          <span className="sr-only">{row.label}</span>
                        </dt>
                        <dd className="text-ink-2">{row.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <Link
                    to={`/search?q=${encodeURIComponent(s.name.split(' ')[0] || s.name)}`}
                    className="mt-6 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-ink text-sm font-medium text-paper transition-colors duration-180 hover:bg-ink-2"
                  >
                    View supplier catalog
                    <ArrowRightIcon size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. HOW IT WORKS */}
      <section className="relative isolate overflow-hidden bg-void text-paper py-20 sm:py-28 grain">
        <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden>
          <FlowCanvas tone="paper" density="hero" className="absolute inset-0 opacity-20" />
          <div className="absolute left-1/2 top-0 -translate-x-1/2 size-[40rem] rounded-full bg-volt/[0.06] blur-[160px]" />
        </div>

        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <SectionHeading
            tone="dark"
            eyebrow="How it operates"
            title="Four movements. One continuous flow."
            body="Procurement shouldn't live in WhatsApp screenshots and handwritten chits. VYRO gives every order an auditable trail from live quote to delivery signature."
            action={{ to: '/how-it-works', label: 'Full walkthrough' }}
          />

          <ol className="relative mt-14 sm:mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <li role="presentation" className="hidden lg:block absolute top-[1.375rem] left-6 right-6 h-px bg-gradient-to-r from-volt/60 via-paper/15 to-paper/5" aria-hidden />
            {JOURNEY.map((s, i) => (
              <li key={s.n} className="relative">
                <span
                  className={`relative z-10 flex size-11 items-center justify-center rounded-full font-mono text-xs font-semibold ring-4 ring-void ${
                    i === 0 ? 'bg-volt text-ink' : 'bg-ink-2 text-paper/80 ring-offset-0'
                  }`}
                >
                  {s.n}
                </span>
                <div className="mt-5 rounded-2xl bg-paper/[0.03] p-6 ring-1 ring-inset ring-paper/10 transition-colors duration-240 hover:bg-paper/[0.06] hover:ring-paper/20 h-[calc(100%-4rem)]">
                  <h3 className="font-display text-2xl font-bold tracking-[-0.03em] text-paper">{s.t}</h3>
                  <p className="mt-3 text-sm text-paper/55 leading-relaxed">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Live dispatch preview */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-paper/[0.04] p-4 sm:p-5 ring-1 ring-inset ring-paper/10">
            <div className="flex items-center gap-4 min-w-0">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-volt text-ink">
                <TruckIcon size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-paper truncate">PO #2026-0841 · Western Province route</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {['Order', 'Supplier', 'Preparation', 'Delivery', 'Business'].map((step, i) => (
                    <span key={step} className="flex items-center gap-1.5">
                      <span className={`h-1 w-6 sm:w-10 rounded-full ${i < 3 ? 'bg-volt' : 'bg-paper/15'}`} title={step} />
                    </span>
                  ))}
                  <span className="ml-1.5 text-[11px] text-paper/45">Preparation</span>
                </div>
              </div>
            </div>
            <Link
              to={user ? '/search' : '/onboarding/business'}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-paper px-5 text-sm font-medium text-ink transition-colors duration-180 hover:bg-volt"
            >
              {user ? 'Enter marketplace' : 'Register your business'}
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </div>
      </section>

      <FaqSection signedIn={Boolean(user)} />

      {/* 9. DUAL-AUDIENCE CTA */}
      <section className="bg-bone pb-20 sm:pb-28">
        <div className="max-w-stage mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Buyers */}
          <div className="relative isolate overflow-hidden rounded-3xl bg-volt p-8 sm:p-10 lg:p-12 text-ink flex flex-col min-h-[26rem]">
            <div className="absolute -right-24 -bottom-24 -z-10 size-80 rounded-full bg-volt-glow blur-3xl" aria-hidden />
            <div className="absolute right-8 top-8 -z-10 opacity-15" aria-hidden>
              <BrandMark size={120} tone="ink" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">For buying businesses</span>
            <h2 className="mt-4 vyro-display text-4xl sm:text-5xl text-ink tracking-[-0.045em] text-balance max-w-md">
              Stop chasing quotes. Start procuring.
            </h2>
            <p className="mt-4 max-w-md text-sm sm:text-base text-ink/70 leading-relaxed">
              Register in under 2 minutes, compare live LKR prices across suppliers and issue binding POs.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-ink/80">
              {['Live supplier quotes updated daily', 'Automatic multi-supplier order splitting', 'Delivery to 25 districts'].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-ink text-volt shrink-0">
                    <CheckIcon size={12} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <Link
                to={user ? '/search' : '/onboarding/business'}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-sm font-semibold text-paper transition-colors duration-180 hover:bg-ink-2"
              >
                {user ? 'Browse live catalog' : 'Register your business'}
                <ArrowRightIcon size={15} />
              </Link>
            </div>
          </div>

          {/* Suppliers */}
          <div className="group relative isolate overflow-hidden rounded-3xl bg-ink p-8 sm:p-10 lg:p-12 text-paper flex flex-col min-h-[26rem]">
            <img
              src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80"
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30 transition-transform duration-[1500ms] ease-cinematic group-hover:scale-105"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-ink via-ink/85 to-ink/40" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-copper">For wholesale suppliers</span>
            <h2 className="mt-4 vyro-display text-4xl sm:text-5xl text-paper tracking-[-0.045em] text-balance max-w-md">
              Put your inventory in the flow.
            </h2>
            <p className="mt-4 max-w-md text-sm sm:text-base text-paper/65 leading-relaxed">
              Connect your mill, factory or depot directly to commercial buyers across Sri Lanka — no middleman fees.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-paper/75">
              {['Digital POs straight to your dashboard', 'Set your own MOQs and lead times', 'Direct buyer relationships'].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-paper/15 text-volt shrink-0">
                    <CheckIcon size={12} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <Link
                to="/onboarding/supplier"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-paper px-6 text-sm font-semibold text-ink transition-colors duration-180 hover:bg-volt"
              >
                List as a supplier
                <ArrowRightIcon size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 10. THE BLOCK: hover to light the whole skyline */}
      <SkylineSection />
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  action,
  tone = 'light',
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: { to: string; label: string };
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-12">
      <div className="max-w-3xl">
        <div className={`inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] ${dark ? 'text-paper/50' : 'text-ink-4'}`}>
          <span className={`size-1.5 rounded-full ${dark ? 'bg-volt' : 'bg-copper'}`} aria-hidden />
          {eyebrow}
        </div>
        <h2
          className={`mt-4 vyro-display text-[2.1rem] sm:text-5xl lg:text-6xl tracking-[-0.045em] leading-[1] text-balance ${dark ? 'text-paper' : 'text-ink'}`}
        >
          {title}
        </h2>
        {body && (
          <p className={`mt-5 max-w-xl text-base leading-relaxed text-pretty ${dark ? 'text-paper/55' : 'text-ink-3'}`}>{body}</p>
        )}
      </div>
      {action && (
        <Link
          to={action.to}
          className={`group inline-flex shrink-0 items-center gap-2 self-start lg:self-end rounded-full px-5 h-11 text-sm font-medium transition-colors duration-180 ${
            dark
              ? 'text-paper ring-1 ring-inset ring-paper/20 hover:bg-paper hover:text-ink'
              : 'text-ink ring-1 ring-inset ring-ink/15 hover:bg-ink hover:text-paper'
          }`}
        >
          {action.label}
          <ArrowRightIcon size={14} className="transition-transform duration-180 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

function FaqSection({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="bg-bone py-20 sm:py-28">
      <div className="mx-auto grid max-w-stage gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:items-start">
        <div className="lg:col-span-5 lg:sticky lg:top-28">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-4">
            <span className="size-1.5 rounded-full bg-copper" aria-hidden />
            Questions & answers
          </div>
          <h2 className="mt-4 vyro-display text-[2.1rem] sm:text-5xl tracking-[-0.045em] leading-[1] text-ink text-balance">
            Everything you need to know.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-3">
            The catalog is public. You only register when you're ready to issue a purchase order.
          </p>
          <Link
            to={signedIn ? '/search' : '/how-it-works'}
            className="group mt-8 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-ink ring-1 ring-inset ring-ink/15 transition-colors duration-180 hover:bg-ink hover:text-paper"
          >
            {signedIn ? 'Browse the catalog' : 'See how it works'}
            <ArrowRightIcon size={14} className="transition-transform duration-180 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="lg:col-span-7 space-y-3">
          {FAQ.map((item, idx) => {
            const expanded = open === idx;
            const panelId = `home-faq-${idx}`;
            return (
              <div
                key={item.q}
                className={`rounded-2xl bg-paper ring-1 transition-shadow duration-240 ${
                  expanded ? 'ring-ink/10 shadow-[0_20px_40px_-24px_rgba(12,14,11,0.25)]' : 'ring-ink/[0.06]'
                }`}
              >
                <h3>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? -1 : idx)}
                    className="flex w-full min-h-11 items-center gap-4 rounded-2xl px-5 py-5 text-left sm:px-6"
                  >
                    <span className="min-w-0 flex-1 font-display text-base font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-lg">
                      {item.q}
                    </span>
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-240 ${
                        expanded ? 'bg-ink text-volt' : 'bg-bone text-ink'
                      }`}
                      aria-hidden
                    >
                      {expanded ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  inert={!expanded}
                  className={`grid transition-[grid-template-rows] duration-320 ease-cinematic ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-prose px-5 pb-6 text-sm leading-relaxed text-ink-3 sm:px-6">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
