import { useState, useMemo, type ReactNode } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { ErrorBanner } from '@/components/ui';
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
import { ProductImage } from '@/components/brand/Surface';
import { resolveCatalogImage } from '@/lib/catalogImages';
import { SupplierStarsLine } from '@/reviews/SupplierStarsLine';
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';
import { TrustSealBadge } from '@/components/TrustSealBadge';

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
  good: 'text-mint bg-mint/10',
  warn: 'text-amber bg-amber/10',
  bad: 'text-rose bg-rose/10',
  neutral: 'text-ink-3 bg-ink/5',
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
        offers: Array<{ rank: number; offer: Offer['offer']; supplier: Offer['supplier']; ranking?: { score: number; rank: number; reasons: string[] } }>;
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
      toast.show(toast.success('Added to cart'));
      navigate('/cart');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to add item to cart';
      setErr(msg);
      toast.show(toast.error(msg));
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

  if (isLoading) {
    return (
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10" aria-busy>
        <div className="aspect-[4/3] rounded-3xl bg-mist animate-pulse" />
        <div className="space-y-4 pt-4">
          <div className="h-4 w-40 rounded-full bg-mist animate-pulse" />
          <div className="h-12 w-3/4 rounded-xl bg-mist animate-pulse" />
          <div className="h-4 w-full rounded-full bg-mist animate-pulse" />
          <div className="h-48 rounded-3xl bg-mist animate-pulse" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-bone text-ink-4">
          <PackageIcon size={24} />
        </span>
        <h2 className="mt-5 font-display text-3xl font-bold tracking-[-0.03em]">Product not found</h2>
        <p className="mt-2 text-sm text-ink-4">This lot may have been delisted or the link is out of date.</p>
        <Link
          to="/search"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-paper hover:bg-ink-2 transition-colors"
        >
          <ArrowLeftIcon size={14} /> Back to catalog
        </Link>
      </div>
    );
  }

  const unit = data.product.unit;
  const lowestMoq = data.offers.length ? Math.min(...data.offers.map((o) => o.offer.minOrderQty)) : null;
  const verifiedCount = data.offers.filter((o) => o.supplier.verificationStatus === 'verified').length;
  const orderHref = user ? '/onboarding/business' : `/login?next=${encodeURIComponent(`/products/${id}`)}`;

  const sortOptions: Array<{ key: typeof sortBy; label: string }> = [
    { key: 'recommended', label: 'Recommended' },
    { key: 'price_asc', label: 'Lowest price' },
    { key: 'lead_asc', label: 'Fastest' },
    { key: 'moq_asc', label: 'Lowest MOQ' },
  ];

  return (
    <div className="space-y-10 sm:space-y-14">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-ink-4 min-w-0">
        <Link to="/search" className="inline-flex items-center gap-1.5 hover:text-ink transition-colors shrink-0">
          <ArrowLeftIcon size={14} /> Catalog
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink truncate">{data.product.name}</span>
      </nav>

      {/* PRODUCT HERO */}
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-8 items-stretch">
        {/* Gallery — stretches to the height of the summary column */}
        <div className="relative isolate h-80 sm:h-[28rem] lg:h-auto lg:min-h-[26rem] overflow-hidden rounded-3xl bg-bone ring-1 ring-ink/[0.06]">
          <ProductImage
            src={activeImage || data.product.imageUrl || data.product.images?.[0]?.url}
            alt={data.product.name}
            seed={data.product.id}
            priority
            className="absolute inset-0 h-full w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-void/50 to-transparent" aria-hidden />
          {data.offers.length > 0 && (
            <span className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-paper/90 px-3 py-1.5 text-xs font-medium text-ink backdrop-blur-md shadow-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-mint opacity-60 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-mint" />
              </span>
              {data.offers.length} live {data.offers.length === 1 ? 'offer' : 'offers'}
            </span>
          )}
          {data.product.images && data.product.images.length > 1 && (
            <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] gap-2 overflow-x-auto rounded-2xl bg-paper/20 p-1.5 ring-1 ring-inset ring-paper/25 backdrop-blur-md">
              {data.product.images.map((img, i) => {
                const src = resolveCatalogImage(data.product.id, img.url, i) ?? img.url;
                const current =
                  activeImage ||
                  resolveCatalogImage(data.product.id, data.product.imageUrl || data.product.images?.[0]?.url) ||
                  src;
                const isSelected = current === src;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveImage(src)}
                    aria-label={`Show image ${i + 1}`}
                    aria-pressed={isSelected}
                    className={`relative shrink-0 size-14 sm:size-16 overflow-hidden rounded-xl transition-all duration-240 ${
                      isSelected ? 'ring-2 ring-paper' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={src} alt={img.altText || data.product.name} decoding="async" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-volt">{unit}</span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-3 ring-1 ring-inset ring-ink/10">
                Commercial wholesale
              </span>
              {data.product.brand && (
                <span className="text-xs text-ink-4">
                  by <span className="font-semibold text-ink">{data.product.brand}</span>
                </span>
              )}
            </div>
            <h1 className="mt-4 font-display text-4xl sm:text-5xl lg:text-[2.75rem] xl:text-5xl font-extrabold tracking-[-0.045em] leading-[1.02] text-ink text-balance">
              {data.product.name}
            </h1>
            {data.product.description && (
              <p className="mt-3 max-w-xl text-base text-ink-3 leading-relaxed text-pretty">{data.product.description}</p>
            )}
          </div>

          {/* Price card */}
          {data.priceStats.count > 0 && (
            <div className="relative isolate overflow-hidden rounded-3xl bg-ink p-6 sm:p-7 text-paper shadow-[0_30px_60px_-30px_rgba(12,14,11,0.6)]">
              <div className="absolute -right-20 -top-20 -z-10 size-64 rounded-full bg-volt/[0.12] blur-3xl" aria-hidden />
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <div className="text-xs text-paper/50">Best price from</div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="vyro-metric text-4xl sm:text-[2.75rem] leading-none text-volt">{formatLKR(data.priceStats.min)}</span>
                    <span className="text-sm text-paper/45">/ {unit}</span>
                  </div>
                  {data.priceStats.max > data.priceStats.min && (
                    <p className="mt-2 text-xs text-paper/45">
                      Market range {formatLKR(data.priceStats.min)} – {formatLKR(data.priceStats.max)}
                    </p>
                  )}
                </div>
                <a
                  href="#supplier-comparison"
                  className="group inline-flex h-11 items-center gap-2 rounded-xl bg-paper px-5 text-sm font-semibold text-ink transition-colors duration-180 hover:bg-volt"
                >
                  Compare {data.offers.length} {data.offers.length === 1 ? 'offer' : 'offers'}
                  <ArrowLeftIcon size={14} className="-rotate-90 transition-transform duration-180 group-hover:translate-y-0.5" />
                </a>
              </div>

              <dl className="mt-6 grid grid-cols-3 divide-x divide-paper/10 rounded-2xl bg-paper/[0.05] ring-1 ring-inset ring-paper/10">
                <div className="p-3.5 sm:p-4 min-w-0">
                  <dt className="text-[11px] text-paper/45">Fastest</dt>
                  <dd className="mt-1 text-sm font-semibold truncate">
                    {fastestOffer ? `${fastestOffer.offer.leadTimeDays} ${fastestOffer.offer.leadTimeDays === 1 ? 'day' : 'days'}` : '—'}
                  </dd>
                </div>
                <div className="p-3.5 sm:p-4 min-w-0">
                  <dt className="text-[11px] text-paper/45">Lowest MOQ</dt>
                  <dd className="mt-1 text-sm font-semibold truncate">{lowestMoq != null ? `${lowestMoq} ${unit}` : '—'}</dd>
                </div>
                <div className="p-3.5 sm:p-4 min-w-0">
                  <dt className="text-[11px] text-paper/45">Verified</dt>
                  <dd className="mt-1 text-sm font-semibold truncate">
                    {verifiedCount} of {data.offers.length}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Assurances */}
          <ul className="grid grid-cols-3 divide-x divide-ink/[0.07] rounded-2xl bg-paper ring-1 ring-ink/[0.06]">
            {[
              { icon: <ShieldCheckIcon size={15} />, title: 'Verified suppliers' },
              { icon: <TruckIcon size={15} />, title: 'Tracked delivery' },
              { icon: <FileTextIcon size={15} />, title: 'Automatic POs' },
            ].map((a) => (
              <li key={a.title} className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 px-2 py-3 text-center">
                <span className="text-copper shrink-0">{a.icon}</span>
                <span className="text-[11px] sm:text-xs font-medium text-ink-2 leading-tight">{a.title}</span>
              </li>
            ))}
          </ul>

          {/* Account gates */}
          {!user && (
            <GateCard
              tone="copper"
              title="Sign in to order from certified mills"
              body="Unlock trade credit, automated purchase orders and direct dispatch."
              to={`/login?next=${encodeURIComponent(`/products/${id}`)}`}
              cta="Sign in"
            />
          )}
          {user && !businessId && (
            <GateCard
              tone="amber"
              title="Register your business to issue POs"
              body="Required for wholesale tax compliance and dock delivery."
              to="/onboarding/business"
              cta="Complete profile"
            />
          )}
        </div>
      </div>

      <ErrorBanner message={err} />

      {/* SUPPLIER COMPARISON ENGINE */}
      <section id="supplier-comparison" className="scroll-mt-24 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-t border-ink/10 pt-10 sm:pt-14">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-4">
              <span className="size-1.5 rounded-full bg-copper" aria-hidden />
              Offers
            </div>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-[-0.04em] text-ink">Compare suppliers</h2>
            <p className="mt-2 text-sm text-ink-4">Ranked by price, speed and reliability · live inventory status</p>
          </div>
          {businessId && (
            <Link
              to="/rfqs/new"
              className="group inline-flex items-center gap-3 self-start sm:self-end rounded-2xl bg-paper py-2.5 pl-3 pr-4 ring-1 ring-ink/[0.08] transition-all duration-240 hover:ring-ink/25 hover:shadow-[0_12px_30px_-16px_rgba(12,14,11,0.3)]"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-volt text-ink">
                <PackageIcon size={16} />
              </span>
              <span className="leading-tight">
                <span className="block text-[11px] text-ink-4">Buying 500kg+?</span>
                <span className="block text-sm font-semibold text-ink">Request a custom quote</span>
              </span>
              <ArrowLeftIcon size={14} className="rotate-180 text-ink-4 transition-transform duration-180 group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>

        {/* Quick decision benchmarks */}
        {data.offers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bestPriceOffer && (
              <BenchmarkCard
                active={sortBy === 'price_asc'}
                onClick={() => setSortBy('price_asc')}
                label="Best unit price"
                icon={<SparklesIcon size={12} />}
                accent="volt"
                value={
                  <>
                    <span className="vyro-metric text-2xl">{formatLKR(bestPriceOffer.offer.priceCents)}</span>
                    <span className="text-xs text-ink-4"> / {unit}</span>
                  </>
                }
                supplier={bestPriceOffer.supplier.name}
                meta={`MOQ ${bestPriceOffer.offer.minOrderQty} ${unit} · ${bestPriceOffer.offer.leadTimeDays}d lead`}
              />
            )}
            {fastestOffer && (
              <BenchmarkCard
                active={sortBy === 'lead_asc'}
                onClick={() => setSortBy('lead_asc')}
                label="Fastest dispatch"
                icon={<ClockIcon size={12} />}
                accent="mint"
                value={
                  <span className="font-display text-2xl font-bold tracking-[-0.03em]">
                    {fastestOffer.offer.leadTimeDays} {fastestOffer.offer.leadTimeDays === 1 ? 'day' : 'days'}
                  </span>
                }
                supplier={fastestOffer.supplier.name}
                meta={`${formatLKR(fastestOffer.offer.priceCents)} / ${unit}`}
              />
            )}
            <div className="rounded-2xl bg-paper p-5 ring-1 ring-ink/[0.06]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-copper/10 px-2.5 py-1 text-[11px] font-semibold text-copper-deep">
                <TrendingUpIcon size={12} /> Market spread
              </span>
              <div className="mt-4 text-base font-semibold text-ink">
                {formatLKR(data.priceStats.min)} – {formatLKR(data.priceStats.max)}
              </div>
              <p className="mt-1.5 text-xs text-ink-4 leading-relaxed">
                {maxPriceCents > (bestPriceOffer?.offer?.priceCents ?? 0)
                  ? `Save up to ${formatLKR(maxPriceCents - (bestPriceOffer?.offer?.priceCents ?? 0))} / ${unit} by choosing the right supplier.`
                  : 'Transparent mill-gate pricing with zero middleman margin.'}
              </p>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto rounded-full bg-paper p-1 ring-1 ring-ink/[0.07]" role="group" aria-label="Sort offers">
            {sortOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={sortBy === o.key}
                onClick={() => setSortBy(o.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-180 ${
                  sortBy === o.key ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink hover:bg-bone'
                }`}
              >
                {o.label}
                {o.key === 'recommended' && <span className="ml-1 opacity-50">{data.offers.length}</span>}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 self-end sm:self-auto rounded-full bg-paper p-1 ring-1 ring-ink/[0.07]" role="group" aria-label="View">
            {(
              [
                { key: 'cards', label: 'Cards', icon: <LayoutGridIcon size={13} /> },
                { key: 'table', label: 'Table', icon: <FileTextIcon size={13} /> },
              ] as const
            ).map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={viewMode === v.key}
                onClick={() => setViewMode(v.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-180 ${
                  viewMode === v.key ? 'bg-bone text-ink shadow-sm' : 'text-ink-4 hover:text-ink'
                }`}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* OFFERS */}
        {sortedOffers.length === 0 ? (
          <div className="rounded-3xl bg-paper p-12 text-center ring-1 ring-ink/[0.06]">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-4">
              <PackageIcon size={20} />
            </span>
            <p className="mt-4 text-sm font-medium text-ink">No active offers right now</p>
            <p className="mt-1 text-xs text-ink-4">Check back soon, or request a custom quote from suppliers.</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto rounded-3xl bg-paper ring-1 ring-ink/[0.07]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ink/[0.07] text-[11px] text-ink-4">
                <tr>
                  <th className="px-5 py-4 font-medium">Supplier</th>
                  <th className="px-4 py-4 font-medium">Origin</th>
                  <th className="px-4 py-4 font-medium">Lead time</th>
                  <th className="px-4 py-4 font-medium">Availability</th>
                  <th className="px-4 py-4 font-medium">Unit price</th>
                  <th className="px-4 py-4 font-medium">Quantity</th>
                  <th className="px-4 py-4 font-medium">Subtotal</th>
                  <th className="px-5 py-4 font-medium text-right">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06] text-ink">
                {sortedOffers.map((row) => {
                  const selectedQty = qty[row.offer.id] ?? row.offer.minOrderQty;
                  const isBestPrice = row.offer.id === bestPriceId;
                  const isFastest = row.offer.id === fastestId;
                  const isValue = row.offer.id === valueId;
                  const subtotal = row.offer.priceCents * selectedQty;
                  const avail = availabilityLabel(row.offer.availabilityStatus);

                  return (
                    <tr key={row.offer.id} className={`transition-colors hover:bg-bone/50 ${isBestPrice ? 'bg-volt/[0.06]' : ''}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <SupplierAvatar name={row.supplier.name} rank={row.rank ?? row.ranking?.rank} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                              <span className="truncate">{row.supplier.name}</span>
                              {row.supplier.verificationStatus === 'verified' && (
                                <ShieldCheckIcon size={13} className="text-mint shrink-0" aria-label="Verified" />
                              )}
                            </div>
                            <SupplierStarsLine supplierId={row.supplier.id} />
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {isBestPrice && <Award>Best price</Award>}
                              {isValue && <Award copper>Best value</Award>}
                              {isFastest && <Award mint>Fastest</Award>}
                              <TrustSealBadge
                                active={!!(row.supplier as any).trustSealed}
                                memberSinceYear={(row.supplier as any).memberSinceYear ?? null}
                                expiresAt={(row.supplier as any).trustSealExpiresAt ?? null}
                              />
                            </div>
                            {row.ranking?.reasons && row.ranking.reasons.length > 0 && (
                              <div className="mt-1 text-[10px] text-ink-4">{row.ranking.reasons.join(' · ')}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-ink-3 whitespace-nowrap">{row.supplier.city || 'Western Province'}</td>
                      <td className="px-4 py-4 whitespace-nowrap font-medium">{row.offer.leadTimeDays}d</td>
                      <td className="px-4 py-4">
                        <AvailabilityPill tone={avail.tone}>{avail.label}</AvailabilityPill>
                        {row.offer.trackInventory && row.offer.availableQty != null && (
                          <div className="mt-1 text-[10px] text-ink-4">{row.offer.availableQty} available</div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="vyro-metric text-sm">{formatLKR(row.offer.priceCents)}</div>
                        <div className="text-[10px] text-ink-4">per {unit}</div>
                      </td>
                      <td className="px-4 py-4">
                        <QtyStepper
                          compact
                          value={selectedQty}
                          min={row.offer.minOrderQty}
                          onStep={(d) => handleQtyStep(row.offer.id, d, row.offer.minOrderQty)}
                          onChange={(v) => handleQtyChange(row.offer.id, v, row.offer.minOrderQty)}
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="vyro-metric text-sm font-semibold">{formatLKR(subtotal)}</div>
                        <div className="text-[10px] text-ink-4">
                          {selectedQty} × {unit}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {businessId ? (
                          <button
                            type="button"
                            onClick={() => add(businessId, row.offer.id, selectedQty)}
                            disabled={row.offer.availabilityStatus === 'out_of_stock' || submittingId === row.offer.id}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-xs font-semibold text-paper transition-colors hover:bg-ink-2 disabled:opacity-40"
                          >
                            <ShoppingCartIcon size={13} />
                            {submittingId === row.offer.id ? 'Adding…' : row.offer.availabilityStatus === 'out_of_stock' ? 'Out' : 'Add'}
                          </button>
                        ) : (
                          <Link
                            to={orderHref}
                            className="inline-flex h-9 items-center rounded-xl px-3.5 text-xs font-semibold text-ink ring-1 ring-inset ring-ink/15 hover:bg-ink hover:text-paper transition-colors"
                          >
                            {user ? 'Profile' : 'Sign in'}
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
          <div className="space-y-4">
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
              ].filter((t): t is { minQty: number; pct: number } => (t.minQty ?? 0) > 0 && (t.pct ?? 0) > 0);
              const outOfStock = row.offer.availabilityStatus === 'out_of_stock';

              return (
                <article
                  key={row.offer.id}
                  className={`relative overflow-hidden rounded-3xl bg-paper transition-shadow duration-240 hover:shadow-[0_24px_50px_-28px_rgba(12,14,11,0.35)] ${
                    isBestPrice ? 'ring-2 ring-volt' : 'ring-1 ring-ink/[0.07]'
                  }`}
                >
                  <div className="grid lg:grid-cols-[1fr_auto]">
                    {/* Supplier + facts */}
                    <div className="p-5 sm:p-7 min-w-0">
                      <div className="flex items-start gap-4">
                        <SupplierAvatar name={row.supplier.name} rank={row.rank ?? row.ranking?.rank} large />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isBestPrice && <Award>Best price</Award>}
                            {isValue && <Award copper>Best value</Award>}
                            {isFastest && <Award mint>Fastest delivery</Award>}
                            {row.supplier.verificationStatus === 'verified' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2 py-0.5 text-[10px] font-semibold text-mint">
                                <ShieldCheckIcon size={11} /> Verified
                              </span>
                            )}
                            <TrustSealBadge
                              active={!!(row.supplier as any).trustSealed}
                              memberSinceYear={(row.supplier as any).memberSinceYear ?? null}
                              expiresAt={(row.supplier as any).trustSealExpiresAt ?? null}
                            />
                          </div>
                          <h3 className="mt-2 font-display text-xl sm:text-2xl font-bold tracking-[-0.03em] text-ink">{row.supplier.name}</h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-4">
                            {row.supplier.address && <span className="truncate">{row.supplier.address}</span>}
                            <SupplierStarsLine supplierId={row.supplier.id} />
                          </div>
                        </div>
                      </div>

                      <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Fact icon={<MapPinIcon size={13} />} label="Origin">
                          {row.supplier.city || 'Western Province'}
                          {row.supplier.district ? `, ${row.supplier.district}` : ''}
                        </Fact>
                        <Fact icon={<TruckIcon size={13} />} label="Lead time">
                          {row.offer.leadTimeDays} {row.offer.leadTimeDays === 1 ? 'day' : 'days'}
                        </Fact>
                        <Fact icon={<PackageIcon size={13} />} label="Min. order">
                          {row.offer.minOrderQty} {unit}
                        </Fact>
                        <Fact icon={<ClockIcon size={13} />} label="Stock">
                          <AvailabilityPill tone={avail.tone}>{avail.label}</AvailabilityPill>
                          {row.offer.trackInventory && row.offer.availableQty != null && (
                            <span className="ml-1.5 text-[10px] font-normal text-ink-4">{row.offer.availableQty} left</span>
                          )}
                        </Fact>
                      </dl>

                      {(priceDiffVsMax > 0 || volumeTiers.length > 0 || (priceDiffVsMax === 0 && isFastest)) && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {priceDiffVsMax > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-3 py-1 text-xs text-mint">
                              <span className="font-semibold">Save {formatLKR(priceDiffVsMax)}</span>/ {unit} · −{savingsPct}% vs highest quote
                            </span>
                          )}
                          {volumeTiers.map((t, i) => (
                            <span key={i} className="inline-flex items-center rounded-full bg-bone px-2.5 py-1 text-[11px] text-ink-3">
                              {t.minQty}+ {unit} · <span className="ml-1 font-semibold text-ink">−{t.pct}%</span>
                            </span>
                          ))}
                          {priceDiffVsMax === 0 && isFastest && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-bone px-3 py-1 text-xs text-ink-3">
                              <ClockIcon size={12} /> Fastest option for urgent replenishment
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Price + order panel */}
                    <div
                      className={`flex flex-col justify-between gap-5 border-t lg:border-t-0 lg:border-l p-5 sm:p-7 lg:w-[22rem] ${
                        isBestPrice ? 'border-volt/40 bg-volt/[0.07]' : 'border-ink/[0.07] bg-bone/40'
                      }`}
                    >
                      <div>
                        <div className="text-[11px] text-ink-4">Wholesale price</div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="vyro-metric text-3xl leading-none text-ink">{formatLKR(row.offer.priceCents)}</span>
                          <span className="text-xs text-ink-4">/ {unit}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-xs ring-1 ring-ink/[0.06]">
                          <span className="text-ink-4">
                            Subtotal · {selectedQty} {unit}
                          </span>
                          <span className="vyro-metric font-semibold text-ink">{formatLKR(subtotal)}</span>
                        </div>
                      </div>

                      {businessId ? (
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <QtyStepper
                              value={selectedQty}
                              min={row.offer.minOrderQty}
                              onStep={(d) => handleQtyStep(row.offer.id, d, row.offer.minOrderQty)}
                              onChange={(v) => handleQtyChange(row.offer.id, v, row.offer.minOrderQty)}
                            />
                            <button
                              type="button"
                              onClick={() => add(businessId, row.offer.id, selectedQty)}
                              disabled={outOfStock || submittingId === row.offer.id}
                              className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-colors duration-180 hover:bg-ink-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ShoppingCartIcon size={15} />
                              {submittingId === row.offer.id ? 'Adding…' : outOfStock ? 'Out of stock' : 'Add to cart'}
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(row.offer.id, row.offer.minOrderQty, row.offer.minOrderQty)}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                selectedQty === row.offer.minOrderQty ? 'bg-ink text-paper' : 'bg-paper text-ink-3 ring-1 ring-inset ring-ink/10 hover:ring-ink/30'
                              }`}
                            >
                              MOQ
                            </button>
                            {[10, 25, 50].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => handleQtyStep(row.offer.id, n, row.offer.minOrderQty)}
                                className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-3 ring-1 ring-inset ring-ink/10 transition-colors hover:ring-ink/30"
                              >
                                +{n}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Link
                          to={orderHref}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-ink-2"
                        >
                          {user ? 'Complete profile to order' : 'Sign in to order'}
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {sortedOffers.length > 0 && sortedOffers[0] && (
        <section className="space-y-6 border-t border-ink/10 pt-10 sm:pt-14">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-4">
              <span className="size-1.5 rounded-full bg-copper" aria-hidden />
              Reviews
            </div>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-[-0.04em] text-ink">
              What buyers say about {sortedOffers[0].supplier.name}
            </h2>
          </div>
          <SupplierReviewsPanel supplierId={sortedOffers[0].supplier.id} />
        </section>
      )}
    </div>
  );
}

function Award({ children, copper, mint }: { children: string; copper?: boolean; mint?: boolean }) {
  const cls = copper ? 'bg-copper text-paper' : mint ? 'bg-mint text-paper' : 'bg-ink text-volt';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>;
}

function AvailabilityPill({ tone, children }: { tone: keyof typeof toneClass; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

function SupplierAvatar({ name, rank, large }: { name: string; rank?: number | undefined; large?: boolean }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span className="relative shrink-0">
      <span
        className={`flex items-center justify-center rounded-2xl bg-ink font-display font-bold text-volt ${large ? 'size-12 text-base' : 'size-9 text-xs rounded-xl'}`}
      >
        {initials}
      </span>
      {rank != null && (
        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-paper text-[10px] font-bold text-ink ring-1 ring-ink/10">
          {rank}
        </span>
      )}
    </span>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-bone/60 px-3 py-2.5 min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] text-ink-4">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-xs font-semibold text-ink truncate">{children}</dd>
    </div>
  );
}

function BenchmarkCard({
  active,
  onClick,
  label,
  icon,
  accent,
  value,
  supplier,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
  accent: 'volt' | 'mint';
  value: ReactNode;
  supplier: string;
  meta: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-2xl p-5 text-left transition-all duration-240 ${
        active ? 'bg-paper ring-2 ring-ink shadow-[0_16px_40px_-24px_rgba(12,14,11,0.4)]' : 'bg-paper ring-1 ring-ink/[0.06] hover:ring-ink/20'
      }`}
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          accent === 'volt' ? 'bg-ink text-volt' : 'bg-mint/10 text-mint'
        }`}
      >
        {icon} {label}
      </span>
      <div className="mt-4 text-ink">{value}</div>
      <div className="mt-1.5 text-sm font-medium text-ink truncate">{supplier}</div>
      <div className="mt-0.5 text-xs text-ink-4">{meta}</div>
    </button>
  );
}

function QtyStepper({
  value,
  min,
  onStep,
  onChange,
  compact,
}: {
  value: number;
  min: number;
  onStep: (delta: number) => void;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const btn = compact ? 'size-7' : 'size-11';
  return (
    <div className={`inline-flex items-center rounded-xl bg-paper ring-1 ring-ink/10 ${compact ? '' : 'shrink-0'}`}>
      <button
        type="button"
        onClick={() => onStep(-1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={`${btn} flex items-center justify-center rounded-l-xl text-ink transition-colors hover:bg-bone disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <MinusIcon size={compact ? 12 : 14} />
      </button>
      <input
        type="number"
        min={min}
        value={value}
        aria-label="Quantity"
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${compact ? 'w-12 h-7 text-xs' : 'w-14 h-11 text-sm'} rounded-none bg-transparent text-center font-mono font-semibold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      <button
        type="button"
        onClick={() => onStep(1)}
        aria-label="Increase quantity"
        className={`${btn} flex items-center justify-center rounded-r-xl text-ink transition-colors hover:bg-bone`}
      >
        <PlusIcon size={compact ? 12 : 14} />
      </button>
    </div>
  );
}

function GateCard({
  tone,
  title,
  body,
  to,
  cta,
}: {
  tone: 'copper' | 'amber';
  title: string;
  body: string;
  to: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-paper p-5 ring-1 ring-ink/[0.07]">
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone === 'copper' ? 'bg-copper/10 text-copper' : 'bg-amber/10 text-amber'}`}
        >
          <ShieldCheckIcon size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ink-4">{body}</p>
        </div>
      </div>
      <Link
        to={to}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-ink-2"
      >
        {cta}
      </Link>
    </div>
  );
}
