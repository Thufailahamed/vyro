import { useState, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, PageSection } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useToast } from '@vyro/ui';
import {
  ArrowLeftIcon,
  ShoppingCartIcon,
  TruckIcon,
  ClockIcon,
  ShieldCheckIcon,
  MapPinIcon,
  PackageIcon,
  TrendingUpIcon,
  LayoutGridIcon,
  FileTextIcon,
  PlusIcon,
  MinusIcon,
  SparklesIcon,
} from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, ProductImage, Surface } from '@/components/brand/Surface';

function availabilityLabel(status: string | undefined): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  switch (status) {
    case 'in_stock':
      return { label: 'In stock', tone: 'good' };
    case 'low':
      return { label: 'Low stock', tone: 'warn' };
    case 'out_of_stock':
      return { label: 'Out of stock', tone: 'bad' };
    case 'pre_order':
      return { label: 'Pre-order', tone: 'neutral' };
    default:
      return { label: status ?? 'Unknown', tone: 'neutral' };
  }
}

const toneClass: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'text-mint border-mint/40 bg-mint/5',
  warn: 'text-amber border-amber/40 bg-amber/5',
  bad: 'text-rose border-rose/40 bg-rose/5',
  neutral: 'text-ink-3 border-line bg-paper',
};

interface Offer {
  offer: {
    id: string;
    priceCents: number;
    minOrderQty: number;
    leadTimeDays: number;
    availabilityStatus: string;
    deliveryAvailable?: boolean | number;
    tier1MinQty?: number;
    tier1DiscountPct?: number;
    tier2MinQty?: number;
    tier2DiscountPct?: number;
    tier3MinQty?: number;
    tier3DiscountPct?: number;
    trackInventory?: boolean;
    availableQty?: number | null;
    lowStockThreshold?: number;
  };
  supplier: {
    id: string;
    name: string;
    city?: string;
    district?: string;
    verificationStatus?: string;
    address?: string;
  };
}

export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qty, setQty] = useState<{ [k: string]: number }>({});
  const [err, setErr] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recommended' | 'price_asc' | 'lead_asc' | 'moq_asc'>('recommended');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () =>
      api.get<{
        product: {
          id: string;
          name: string;
          unit: string;
          brand?: string | null;
          description?: string | null;
          imageUrl?: string | null;
          images?: Array<{ id: string; url: string; altText?: string | null }>;
        };
        offers: Array<{ rank: number; offer: Offer['offer']; supplier: Offer['supplier'] }>;
        priceStats: { count: number; min: number; max: number };
      }>(`/search/products/${id}/offers`),
  });

  const qc = useQueryClient();
  const toast = useToast();

  usePageTitle(data?.product?.name ?? 'Product');
  async function add(businessId: string, offerId: string, q: number) {
    setErr('');
    setSubmittingId(offerId);
    const quantity = Math.max(1, Math.round(Number(q) || 1));
    try {
      await api.post('/cart/items', { businessId, supplierProductId: offerId, quantity });
      await qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Added to cart');
      navigate('/cart');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to add item to cart';
      setErr(msg);
      toast.error(msg);
    } finally {
      setSubmittingId(null);
    }
  }

  const businessId = user?.memberships?.[0]?.businessId;

  // Best Price / Fastest / Best Value computations
  const fastestOffer = useMemo(() => {
    if (!data?.offers?.length) return null;
    return [...data.offers].sort((a, b) => a.offer.leadTimeDays - b.offer.leadTimeDays)[0];
  }, [data?.offers]);

  const bestPriceOffer = useMemo(() => {
    if (!data?.offers?.length) return null;
    return [...data.offers].sort((a, b) => a.offer.priceCents - b.offer.priceCents)[0];
  }, [data?.offers]);

  const valueOffer = useMemo(() => {
    if (!data?.offers?.length) return null;
    return [...data.offers].sort((a, b) => {
      const scoreA = a.offer.priceCents * Math.max(1, a.offer.leadTimeDays);
      const scoreB = b.offer.priceCents * Math.max(1, b.offer.leadTimeDays);
      return scoreA - scoreB;
    })[0];
  }, [data?.offers]);

  const fastestId = fastestOffer?.offer?.id;
  const bestPriceId = bestPriceOffer?.offer?.id;
  const valueId = valueOffer?.offer?.id;

  // Sorted offers based on user preference
  const sortedOffers = useMemo(() => {
    if (!data?.offers) return [];
    const list = [...data.offers];
    if (sortBy === 'price_asc') {
      return list.sort((a, b) => a.offer.priceCents - b.offer.priceCents);
    }
    if (sortBy === 'lead_asc') {
      return list.sort((a, b) => a.offer.leadTimeDays - b.offer.leadTimeDays);
    }
    if (sortBy === 'moq_asc') {
      return list.sort((a, b) => a.offer.minOrderQty - b.offer.minOrderQty);
    }
    return list; // 'recommended' uses API ranking
  }, [data?.offers, sortBy]);

  const maxPriceCents = useMemo(() => {
    if (!data?.offers?.length) return 0;
    return Math.max(...data.offers.map((o) => o.offer.priceCents));
  }, [data?.offers]);

  function handleQtyChange(offerId: string, val: number, min: number) {
    const safeVal = Math.max(min, isNaN(val) ? min : val);
    setQty((prev) => ({ ...prev, [offerId]: safeVal }));
  }

  function handleQtyStep(offerId: string, delta: number, min: number) {
    const current = qty[offerId] ?? min;
    const next = Math.max(min, current + delta);
    setQty((prev) => ({ ...prev, [offerId]: next }));
  }

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;
  if (!data) {
    return (
      <div className="py-16">
        <h2 className="vyro-display text-3xl">Product not found</h2>
        <Link to="/search" className="mt-4 inline-block text-copper">
          ← Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link to="/search" className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink transition-colors">
        <ArrowLeftIcon size={14} /> Wholesale Catalog
      </Link>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
        <div className="space-y-3">
          <ProductImage
            src={activeImage || data.product.imageUrl || data.product.images?.[0]?.url}
            alt={data.product.name}
            seed={data.product.id}
            className="h-80 sm:h-96 w-full shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)] bg-bone"
          />
          {data.product.images && data.product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.product.images.map((img) => {
                const isSelected = (activeImage || data.product.imageUrl || data.product.images?.[0]?.url) === img.url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveImage(img.url)}
                    className={`relative shrink-0 w-16 h-16 overflow-hidden border-2 transition-all ${
                      isSelected ? 'border-ink shadow-sm scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img.url} alt={img.altText || data.product.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="vyro-kicker">{data.product.unit}</span>
              <span className="text-xs text-ink-4">•</span>
              <span className="text-xs uppercase tracking-wider text-ink-3 font-mono">Commercial Wholesale</span>
            </div>
            <h1 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance">{data.product.name}</h1>
            {data.product.brand && (
              <div className="mt-1 text-xs uppercase tracking-[0.14em] text-copper font-medium">
                Brand: <span className="font-semibold text-ink">{data.product.brand}</span>
              </div>
            )}
            {data.product.description && (
              <p className="mt-3 text-sm text-ink-3 leading-relaxed">
                {data.product.description}
              </p>
            )}
          </div>

          {data.priceStats.count > 0 && (
            <div className="p-4 bg-bone border border-line flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Starting rate from</div>
                <MetricNumber size="md" className="text-ink mt-0.5">{formatLKR(data.priceStats.min)}</MetricNumber>
                <p className="mt-1 text-xs text-ink-4">{data.priceStats.count} live supplier quotes verified</p>
              </div>
              <a
                href="#supplier-comparison"
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider bg-ink text-volt px-3.5 py-2 hover:bg-charcoal transition-colors"
              >
                Compare Offers ({data.offers.length}) ↓
              </a>
            </div>
          )}

          <div className="pt-2">
            <FlowLine
              nodes={[
                { label: 'Product Specs', state: 'done' },
                { label: `Compare ${data.offers.length} Quotes`, state: 'active' },
                { label: 'Cart & PO', state: 'idle' },
              ]}
            />
          </div>
        </div>
      </div>

      <ErrorBanner message={err} />

      {!user && (
        <Surface className="p-5 flex items-center justify-between gap-4 border-l-4 border-l-copper">
          <div>
            <p className="text-sm font-medium text-ink">Sign in to place wholesale orders with certified mills.</p>
            <p className="text-xs text-ink-4 mt-0.5">Unlock verified trade credit, automated purchase orders, and direct vendor dispatch.</p>
          </div>
          <Link to="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </Surface>
      )}
      {user && !businessId && (
        <Surface className="p-5 flex items-center justify-between gap-4 border-l-4 border-l-amber">
          <div>
            <p className="text-sm font-medium text-ink">Register your business entity to issue purchase orders.</p>
            <p className="text-xs text-ink-4 mt-0.5">Required for wholesale tax compliance and warehouse dock delivery.</p>
          </div>
          <Link to="/onboarding/business">
            <Button size="sm">Complete profile</Button>
          </Link>
        </Surface>
      )}

      {/* SUPPLIER COMPARISON ENGINE */}
      <section id="supplier-comparison" className="space-y-6 pt-2">
        <ErrorBanner message={err} />
        <PageSection
          eyebrow="Offers"
          title="Supplier comparison"
          actions={<span className="text-xs text-ink-4 font-mono">Algorithmic quote ranking • Real-time inventory status</span>}
        >
          {/* Quick Decision Benchmark Header */}
          {data.offers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {/* Benchmark 1: Best Price */}
              {bestPriceOffer && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSortBy('price_asc')}
                  className={`p-4 border transition-all cursor-pointer text-left ${
                    sortBy === 'price_asc'
                      ? 'border-ink bg-paper shadow-sm ring-1 ring-ink'
                      : 'border-line bg-paper/60 hover:bg-paper hover:border-ink/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-ink text-volt">
                      <SparklesIcon size={10} /> Best Unit Price
                    </span>
                    <span className="text-[10px] text-ink-4 font-mono">Rank #1</span>
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <MetricNumber size="sm" className="text-ink">
                      {formatLKR(bestPriceOffer.offer.priceCents)}
                    </MetricNumber>
                    <span className="text-xs text-ink-4">/ {data.product.unit}</span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-ink truncate">{bestPriceOffer.supplier.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-4">
                    <span>MOQ {bestPriceOffer.offer.minOrderQty} {data.product.unit}</span>
                    <span>•</span>
                    <span>{bestPriceOffer.offer.leadTimeDays}d lead</span>
                  </div>
                </div>
              )}

              {/* Benchmark 2: Fastest Delivery */}
              {fastestOffer && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSortBy('lead_asc')}
                  className={`p-4 border transition-all cursor-pointer text-left ${
                    sortBy === 'lead_asc'
                      ? 'border-ink bg-paper shadow-sm ring-1 ring-ink'
                      : 'border-line bg-paper/60 hover:bg-paper hover:border-ink/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-mint/15 text-mint border border-mint/30">
                      <ClockIcon size={10} /> Fastest Dispatch
                    </span>
                    <span className="text-[10px] text-ink-4 font-mono">Speed Leader</span>
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <span className="text-xl font-display font-semibold text-ink">
                      {fastestOffer.offer.leadTimeDays} {fastestOffer.offer.leadTimeDays === 1 ? 'Day' : 'Days'} Lead
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-ink truncate">{fastestOffer.supplier.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-4">
                    <span>{formatLKR(fastestOffer.offer.priceCents)} / {data.product.unit}</span>
                    <span>•</span>
                    <span>Express Fulfillment</span>
                  </div>
                </div>
              )}

              {/* Benchmark 3: Price Spread & Value */}
              <div className="p-4 border border-line bg-paper/60 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-copper/10 text-copper border border-copper/30">
                    <TrendingUpIcon size={10} /> Market Spread
                  </span>
                  <span className="text-[10px] text-ink-4 font-mono">{data.offers.length} Live Quotes</span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-ink">
                    {formatLKR(data.priceStats.min)} – {formatLKR(data.priceStats.max)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-4 leading-normal">
                  {maxPriceCents > (bestPriceOffer?.offer?.priceCents ?? 0)
                    ? `Save up to ${formatLKR(maxPriceCents - (bestPriceOffer?.offer?.priceCents ?? 0))} / ${data.product.unit} between competing suppliers.`
                    : 'Transparent wholesale mill gate pricing with zero middleman margin.'}
                </p>
              </div>
            </div>
          )}

          {/* Controls Toolbar: Filters & View Switcher */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-line">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-ink-4 mr-1">Sort by:</span>
              <button
                type="button"
                onClick={() => setSortBy('recommended')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors border ${
                  sortBy === 'recommended'
                    ? 'bg-ink text-volt border-ink'
                    : 'bg-paper text-ink-3 border-line hover:border-ink/40'
                }`}
              >
                Recommended ({data.offers.length})
              </button>
              <button
                type="button"
                onClick={() => setSortBy('price_asc')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors border ${
                  sortBy === 'price_asc'
                    ? 'bg-ink text-volt border-ink'
                    : 'bg-paper text-ink-3 border-line hover:border-ink/40'
                }`}
              >
                Lowest Price
              </button>
              <button
                type="button"
                onClick={() => setSortBy('lead_asc')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors border ${
                  sortBy === 'lead_asc'
                    ? 'bg-ink text-volt border-ink'
                    : 'bg-paper text-ink-3 border-line hover:border-ink/40'
                }`}
              >
                Fastest Lead Time
              </button>
              <button
                type="button"
                onClick={() => setSortBy('moq_asc')}
                className={`px-2.5 py-1 text-xs font-medium transition-colors border ${
                  sortBy === 'moq_asc'
                    ? 'bg-ink text-volt border-ink'
                    : 'bg-paper text-ink-3 border-line hover:border-ink/40'
                }`}
              >
                Lowest MOQ
              </button>
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-1 self-end sm:self-auto border border-line bg-paper p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'cards' ? 'bg-bone text-ink font-semibold shadow-xs' : 'text-ink-4 hover:text-ink'
                }`}
                title="Cards view"
              >
                <LayoutGridIcon size={13} />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'table' ? 'bg-bone text-ink font-semibold shadow-xs' : 'text-ink-4 hover:text-ink'
                }`}
                title="Comparison matrix table view"
              >
                <FileTextIcon size={13} />
                <span>Matrix Table</span>
              </button>
            </div>
          </div>

          {/* OFFERS PRESENTATION */}
          {sortedOffers.length === 0 ? (
            <Surface className="p-10 text-center text-ink-4">No active offers available for this product.</Surface>
          ) : viewMode === 'table' ? (
            /* Matrix Table View */
            <div className="overflow-x-auto border border-line vyro-surface mt-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-bone text-ink-3 uppercase tracking-wider text-[10px] border-b border-line">
                  <tr>
                    <th className="p-3.5 font-semibold">Rank & Supplier</th>
                    <th className="p-3.5 font-semibold">Origin</th>
                    <th className="p-3.5 font-semibold">Lead Time</th>
                    <th className="p-3.5 font-semibold">Availability</th>
                    <th className="p-3.5 font-semibold">Unit Price</th>
                    <th className="p-3.5 font-semibold">Order Qty</th>
                    <th className="p-3.5 font-semibold">Subtotal</th>
                    <th className="p-3.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-paper text-ink">
                  {sortedOffers.map((row) => {
                    const selectedQty = qty[row.offer.id] ?? row.offer.minOrderQty;
                    const isBestPrice = row.offer.id === bestPriceId;
                    const isFastest = row.offer.id === fastestId;
                    const isValue = row.offer.id === valueId;
                    const subtotal = row.offer.priceCents * selectedQty;
                    const avail = availabilityLabel(row.offer.availabilityStatus);

                    return (
                      <tr
                        key={row.offer.id}
                        className={`hover:bg-bone/40 transition-colors ${
                          isBestPrice ? 'bg-volt/5' : ''
                        }`}
                      >
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-ink-3 w-5">#{row.rank}</span>
                            <div>
                              <div className="font-semibold text-sm text-ink">{row.supplier.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {isBestPrice && <Award>Best price</Award>}
                                {isValue && <Award copper>Best value</Award>}
                                {isFastest && <Award>Fastest</Award>}
                                {row.supplier.verificationStatus === 'verified' && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-mint font-medium">
                                    <ShieldCheckIcon size={11} /> Verified
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-ink-3">
                          <div className="flex items-center gap-1">
                            <MapPinIcon size={12} className="text-ink-4" />
                            <span>{row.supplier.city || 'Western Province'}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1 font-medium">
                            <TruckIcon size={12} className="text-ink-4" />
                            <span>{row.offer.leadTimeDays}d dispatch</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 border text-[10px] uppercase tracking-wider font-medium ${toneClass[avail.tone]}`}>
                            {avail.label}
                          </span>
                          {row.offer.trackInventory && row.offer.availableQty != null && (
                            <div className="text-[10px] text-ink-4 font-mono mt-0.5">
                              {row.offer.availableQty} avail.
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 font-mono">
                          <div className="font-semibold text-sm">{formatLKR(row.offer.priceCents)}</div>
                          <div className="text-[10px] text-ink-4">per {data.product.unit}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleQtyStep(row.offer.id, -1, row.offer.minOrderQty)}
                              disabled={selectedQty <= row.offer.minOrderQty}
                              className="w-7 h-7 flex items-center justify-center border border-line bg-paper text-ink hover:bg-bone disabled:opacity-40"
                              title="Decrease quantity"
                            >
                              <MinusIcon size={12} />
                            </button>
                            <input
                              type="number"
                              min={row.offer.minOrderQty}
                              value={selectedQty}
                              onChange={(e) => handleQtyChange(row.offer.id, Number(e.target.value), row.offer.minOrderQty)}
                              className="w-14 h-7 text-center font-mono text-xs border border-line bg-paper"
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyStep(row.offer.id, 1, row.offer.minOrderQty)}
                              className="w-7 h-7 flex items-center justify-center border border-line bg-paper text-ink hover:bg-bone"
                              title="Increase quantity"
                            >
                              <PlusIcon size={12} />
                            </button>
                          </div>
                          <div className="text-[10px] text-ink-4 mt-0.5">Min {row.offer.minOrderQty}</div>
                        </td>
                        <td className="p-3.5 font-mono">
                          <div className="font-semibold text-sm text-ink">{formatLKR(subtotal)}</div>
                          <div className="text-[10px] text-ink-4">{selectedQty} {data.product.unit}s</div>
                        </td>
                        <td className="p-3.5 text-right">
                          {businessId ? (
                            <Button
                              size="sm"
                              onClick={() => add(businessId, row.offer.id, selectedQty)}
                              loading={submittingId === row.offer.id}
                              disabled={row.offer.availabilityStatus === 'out_of_stock'}
                              icon={<ShoppingCartIcon size={13} />}
                            >
                              {row.offer.availabilityStatus === 'out_of_stock' ? 'Out' : 'Add'}
                            </Button>
                          ) : (
                            <Link to="/login">
                              <Button size="sm" variant="secondary">Order</Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Cards View */
            <div className="space-y-4 mt-4">
              {sortedOffers.map((row) => {
                const selectedQty = qty[row.offer.id] ?? row.offer.minOrderQty;
                const isBestPrice = row.offer.id === bestPriceId;
                const isFastest = row.offer.id === fastestId;
                const isValue = row.offer.id === valueId;
                const subtotal = row.offer.priceCents * selectedQty;
                const avail = availabilityLabel(row.offer.availabilityStatus);
                const priceDiffVsMax = maxPriceCents - row.offer.priceCents;
                const savingsPct = maxPriceCents > 0 ? Math.round((priceDiffVsMax / maxPriceCents) * 100) : 0;
                const volumeTiers = [
                  { minQty: row.offer.tier1MinQty, pct: row.offer.tier1DiscountPct },
                  { minQty: row.offer.tier2MinQty, pct: row.offer.tier2DiscountPct },
                  { minQty: row.offer.tier3MinQty, pct: row.offer.tier3DiscountPct },
                ].filter(
                  (t): t is { minQty: number; pct: number } =>
                    (t.minQty ?? 0) > 0 && (t.pct ?? 0) > 0,
                );

                return (
                  <Surface
                    key={row.offer.id}
                    kind={isBestPrice ? 'elevated' : 'flat'}
                    className={`p-5 sm:p-6 transition-all ${
                      isBestPrice
                        ? 'border-l-4 border-l-volt bg-paper shadow-sm'
                        : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      {/* Left: Supplier Details & Badges */}
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-bone text-ink-3 border border-line">
                            Rank #{row.rank}
                          </span>
                          {isBestPrice && <Award>Best price</Award>}
                          {isValue && <Award copper>Best value</Award>}
                          {isFastest && <Award>Fastest delivery</Award>}
                          {row.supplier.verificationStatus === 'verified' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 border text-[10px] uppercase tracking-wider font-semibold border-mint/40 bg-mint/5 text-mint">
                              <ShieldCheckIcon size={11} /> Verified Mill
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="font-display text-xl sm:text-2xl text-ink tracking-tight">
                            {row.supplier.name}
                          </h3>
                          {row.supplier.address && (
                            <p className="text-xs text-ink-4 mt-0.5">{row.supplier.address}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3">
                          <span className="inline-flex items-center gap-1 text-ink">
                            <MapPinIcon size={13} className="text-copper" />
                            {row.supplier.city || 'Western Province'}{row.supplier.district ? `, ${row.supplier.district}` : ''}
                          </span>
                          <span className="inline-flex items-center gap-1 text-ink">
                            <TruckIcon size={13} className="text-ink-4" />
                            {row.offer.leadTimeDays} {row.offer.leadTimeDays === 1 ? 'day' : 'days'} lead time
                          </span>
                          <span className="inline-flex items-center gap-1 text-ink">
                            <PackageIcon size={13} className="text-ink-4" />
                            Min. order {row.offer.minOrderQty} {data.product.unit}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] uppercase tracking-wider font-medium ${toneClass[avail.tone]}`}>
                            {avail.label}
                          </span>
                          {row.offer.trackInventory && row.offer.availableQty != null && (
                            <span className="inline-flex items-center gap-1 text-ink-4 font-mono text-[10px]">
                              · {row.offer.availableQty} {data.product.unit}s available
                            </span>
                          )}
                        </div>

                        {/* Comparative Insight Pill */}
                        {priceDiffVsMax > 0 && (
                          <div className="inline-flex items-center gap-1.5 text-xs text-mint bg-mint/5 px-2.5 py-1 border border-mint/20">
                            <span className="font-semibold">Save {formatLKR(priceDiffVsMax)}</span>
                            <span>per {data.product.unit} (-{savingsPct}%) compared to highest quote</span>
                          </div>
                        )}
                        {/* Volume tier table */}
                        {volumeTiers.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {volumeTiers.map((t, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 border border-line bg-bone text-[10px] font-mono text-ink-3"
                              >
                                {t.minQty}+ {data.product.unit}s · −{t.pct}%
                              </span>
                            ))}
                          </div>
                        )}
                        {priceDiffVsMax === 0 && isFastest && (
                          <div className="inline-flex items-center gap-1.5 text-xs text-ink-3 bg-bone px-2.5 py-1 border border-line">
                            <ClockIcon size={12} className="text-ink-4" />
                            <span>Fastest dispatch option for urgent replenishment</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Pricing, Live Subtotal & Order Controls */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 border-line">
                        <div className="text-left lg:text-right">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4 font-mono">Wholesale Price</div>
                          <div className="flex items-baseline gap-1 lg:justify-end">
                            <MetricNumber size="md" className="text-ink">
                              {formatLKR(row.offer.priceCents)}
                            </MetricNumber>
                            <span className="text-xs text-ink-4 font-normal">/ {data.product.unit}</span>
                          </div>
                          <div className="text-xs text-ink-3 mt-1">
                            Estimated Subtotal:{' '}
                            <span className="font-mono font-semibold text-ink">{formatLKR(subtotal)}</span>
                            <span className="text-ink-4 ml-1">({selectedQty} {data.product.unit}s)</span>
                          </div>
                        </div>

                        {businessId ? (
                          <div className="w-full sm:w-auto flex flex-col gap-2.5">
                            {/* Industrial Stepper Controls */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center border border-line bg-paper shadow-inner">
                                <button
                                  type="button"
                                  onClick={() => handleQtyStep(row.offer.id, -1, row.offer.minOrderQty)}
                                  disabled={selectedQty <= row.offer.minOrderQty}
                                  className="w-9 h-9 flex items-center justify-center text-ink hover:bg-bone disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  title="Decrease quantity"
                                >
                                  <MinusIcon size={14} />
                                </button>
                                <input
                                  type="number"
                                  min={row.offer.minOrderQty}
                                  value={selectedQty}
                                  onChange={(e) => handleQtyChange(row.offer.id, Number(e.target.value), row.offer.minOrderQty)}
                                  className="w-16 h-9 text-center font-mono font-semibold text-sm border-x border-line bg-transparent focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleQtyStep(row.offer.id, 1, row.offer.minOrderQty)}
                                  className="w-9 h-9 flex items-center justify-center text-ink hover:bg-bone transition-colors"
                                  title="Increase quantity"
                                >
                                  <PlusIcon size={14} />
                                </button>
                              </div>

                              <Button
                                onClick={() => add(businessId, row.offer.id, selectedQty)}
                                loading={submittingId === row.offer.id}
                                disabled={row.offer.availabilityStatus === 'out_of_stock'}
                                icon={<ShoppingCartIcon size={15} />}
                                className="whitespace-nowrap"
                              >
                                {row.offer.availabilityStatus === 'out_of_stock' ? 'Out of stock' : 'Add to Cart'}
                              </Button>
                            </div>

                            {/* Quick Preset Volume Chips */}
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-ink-4">Presets:</span>
                              <button
                                type="button"
                                onClick={() => handleQtyChange(row.offer.id, row.offer.minOrderQty, row.offer.minOrderQty)}
                                className={`px-1.5 py-0.5 border text-[10px] font-mono transition-colors ${
                                  selectedQty === row.offer.minOrderQty
                                    ? 'bg-ink text-volt border-ink'
                                    : 'border-line text-ink-3 hover:bg-bone'
                                }`}
                              >
                                MOQ ({row.offer.minOrderQty})
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQtyStep(row.offer.id, 10, row.offer.minOrderQty)}
                                className="px-1.5 py-0.5 border border-line text-[10px] font-mono text-ink-3 hover:bg-bone transition-colors"
                              >
                                +10
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQtyStep(row.offer.id, 25, row.offer.minOrderQty)}
                                className="px-1.5 py-0.5 border border-line text-[10px] font-mono text-ink-3 hover:bg-bone transition-colors"
                              >
                                +25
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQtyStep(row.offer.id, 50, row.offer.minOrderQty)}
                                className="px-1.5 py-0.5 border border-line text-[10px] font-mono text-ink-3 hover:bg-bone transition-colors"
                              >
                                +50
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full sm:w-auto">
                            <Link to="/login" className="block">
                              <Button size="sm" variant="secondary" className="w-full">
                                Sign in to Order
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </PageSection>
      </section>
    </div>
  );
}

function Award({ children, copper }: { children: string; copper?: boolean }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 ${copper ? 'bg-copper text-paper' : 'bg-ink text-volt'}`}>
      {children}
    </span>
  );
}
