import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import {
  SearchIcon,
  PackageIcon,
  StoreIcon,
  XIcon,
  ClockIcon,
  SparklesIcon,
  LayoutGridIcon,
  FileTextIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  TruckIcon,
} from '@/components/icons';
import { ProductImage } from '@/components/brand/Surface';
import { buildSearchChips } from '@/ask/nlFilters.client';

interface Hit {
  product: {
    id: string;
    name: string;
    unit: string;
    brand: string | null;
    packSize?: string | null;
    imageUrl?: string | null;
  };
  bestOffer: {
    priceCents: number;
    supplier: { id: string; name: string };
    leadTimeDays?: number;
  } | null;
  offerCount: number;
}

const CATEGORY_FILTERS = [
  { label: 'All Lots', query: 'All' },
  { label: 'Rice & Grains', query: 'Rice' },
  { label: 'White Sugar', query: 'Sugar' },
  { label: 'Ceylon Tea', query: 'Tea' },
  { label: 'Dairy & Milk', query: 'Milk' },
  { label: 'Coconut Oil', query: 'Oil' },
  { label: 'Wheat Flour', query: 'Flour' },
  { label: 'Portland Cement', query: 'Cement' },
  { label: 'Packaging Cartons', query: 'Packaging' },
  { label: 'Ceylon Spices', query: 'Spices' },
];

type SortMode = 'price_asc' | 'price_desc' | 'lead_asc' | 'offers_desc' | 'name_asc';

// Curated image overrides to ensure all product images match real wholesale lots
const PRODUCT_IMAGE_OVERRIDES: Record<string, string> = {
  'p-sugar-1kg': 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=800&q=80',
  'p-oil-coconut-1l': 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=800&q=80',
};

export function SearchPage() {
  usePageTitle('Marketplace · Sri Lanka Wholesale Catalog');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [searchInput, setSearchInput] = useState(initialQ);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<SortMode>('price_asc');
  const [fastDispatchOnly, setFastDispatchOnly] = useState(false);

  // Debounce the input into URL search params
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next !== q) {
        setQ(next);
        setSearchParams(next ? { q: next } : {});
      }
    }, 280);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronize browser history / URL param updates
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) {
      setQ(urlQ);
      setSearchInput(urlQ);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<{ hits: Hit[] }>(`/search/products?q=${encodeURIComponent(q)}`),
    enabled: true,
  });

  function handleFilterClick(term: string) {
    if (term === 'All') {
      setSearchInput('');
      setQ('');
      setSearchParams({});
    } else {
      setSearchInput(term);
      setQ(term);
      setSearchParams({ q: term });
    }
  }

  // Client-side filtering & sorting for instant response
  const processedHits = useMemo(() => {
    let list = data?.hits ? [...data.hits] : [];

    if (fastDispatchOnly) {
      list = list.filter((h) => (h.bestOffer?.leadTimeDays ?? 99) <= 2);
    }

    list.sort((a, b) => {
      const pA = a.bestOffer?.priceCents ?? Number.MAX_SAFE_INTEGER;
      const pB = b.bestOffer?.priceCents ?? Number.MAX_SAFE_INTEGER;
      const leadA = a.bestOffer?.leadTimeDays ?? 99;
      const leadB = b.bestOffer?.leadTimeDays ?? 99;

      switch (sortBy) {
        case 'price_asc':
          return pA - pB;
        case 'price_desc':
          return pB - pA;
        case 'lead_asc':
          return leadA - leadB || pA - pB;
        case 'offers_desc':
          return b.offerCount - a.offerCount || pA - pB;
        case 'name_asc':
          return a.product.name.localeCompare(b.product.name);
        default:
          return 0;
      }
    });

    return list;
  }, [data?.hits, sortBy, fastDispatchOnly]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Marketplace Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Wholesale Marketplace</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Sri Lanka Direct Network</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Spot Rates
            </span>
          </div>
        }
        title="Direct Mill & Wholesale Catalog"
        sub="Source commercial staples, beverages, and industrial packaging directly from audited Sri Lankan mills & authorized distributors. Transparent spot pricing with zero hidden broker markups."
        actions={
          <div className="flex items-center gap-2.5">
            <Link to="/ask">
              <Button
                variant="secondary"
                size="sm"
                className="bg-ink text-volt hover:bg-charcoal border-none font-bold text-xs uppercase tracking-wider shadow-sm"
              >
                <SparklesIcon size={14} className="text-volt" />
                <span>Ask VYRO AI</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Search Console & Filter Palette */}
      <div className="space-y-3">
        <div className="bg-paper border border-ink/15 p-2 sm:p-2.5 shadow-sm focus-within:border-ink focus-within:ring-2 focus-within:ring-volt/40 transition-all duration-200 flex items-center gap-3">
          <div className="size-9 bg-ink text-volt flex items-center justify-center shrink-0">
            <SearchIcon size={18} />
          </div>

          <input
            aria-label="Search wholesale catalog"
            placeholder="Search rice, sugar, tea, milk, coconut oil, wheat flour, cement, packaging, spices…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 min-w-0 bg-transparent py-2 text-sm sm:text-base font-sans text-ink placeholder:text-ink-4 outline-none"
            autoFocus
          />

          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setQ('');
                setSearchParams({});
              }}
              className="p-1.5 text-ink-4 hover:text-ink transition-colors"
              title="Clear search"
            >
              <XIcon size={16} />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 border-l border-ink/10 pl-3 pr-1 text-xs font-mono text-ink-4">
            <kbd className="px-2 py-0.5 bg-mist border border-line text-[10px]">Instant Live Filter</kbd>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {CATEGORY_FILTERS.map((cat) => {
            const active =
              cat.query === 'All'
                ? !searchInput
                : searchInput.toLowerCase().includes(cat.query.toLowerCase());
            return (
              <button
                key={cat.query}
                type="button"
                onClick={() => handleFilterClick(cat.query)}
                className={`h-8 px-3.5 text-xs font-mono tracking-wide transition-all cursor-pointer ${
                  active
                    ? 'bg-ink text-volt font-bold shadow-sm'
                    : 'bg-paper text-ink-3 border border-ink/15 hover:border-ink hover:text-ink hover:bg-bone'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* NL-detected filter chips */}
        <NlChips q={q} onChange={(next) => { setSearchInput(next); setQ(next); setSearchParams(next ? { q: next } : {}); }} />
      </div>

      {/* Toolbar: Counter, Sort, Filters, View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-3 text-sm text-ink-3">
          <span>
            <strong className="vyro-metric text-ink font-bold text-base">
              {processedHits.length}
            </strong>{' '}
            {q ? (
              <>
                wholesale lots matching &ldquo;<span className="text-ink font-semibold">{q}</span>&rdquo;
              </>
            ) : (
              'wholesale lots active across 25 districts'
            )}
          </span>
          {fastDispatchOnly && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 bg-volt/20 text-ink border border-volt/30">
              ⚡ Fast dispatch only
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Fast Dispatch Toggle */}
          <button
            type="button"
            onClick={() => setFastDispatchOnly(!fastDispatchOnly)}
            className={`px-3 py-1.5 text-xs font-mono border transition-colors flex items-center gap-1.5 ${
              fastDispatchOnly
                ? 'bg-ink text-volt border-ink font-semibold shadow-sm'
                : 'bg-paper text-ink-3 border-ink/15 hover:border-ink hover:text-ink'
            }`}
          >
            <ClockIcon size={13} />
            <span>≤ 2d Dispatch</span>
          </button>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 bg-paper border border-ink/15 px-2.5 py-1 text-xs">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              className="bg-transparent font-medium text-ink outline-none cursor-pointer text-xs pr-1"
            >
              <option value="price_asc">Lowest Spot Rate</option>
              <option value="price_desc">Highest Spot Rate</option>
              <option value="lead_asc">Fastest Dispatch</option>
              <option value="offers_desc">Most Live Offers</option>
              <option value="name_asc">Product Name (A-Z)</option>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center border border-ink/15 bg-paper p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-colors ${
                viewMode === 'grid' ? 'bg-ink text-volt shadow-sm' : 'text-ink-4 hover:text-ink'
              }`}
              title="Grid View"
            >
              <LayoutGridIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 transition-colors ${
                viewMode === 'table' ? 'bg-ink text-volt shadow-sm' : 'text-ink-4 hover:text-ink'
              }`}
              title="Dense Ledger View"
            >
              <FileTextIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-96 bg-paper border border-ink/10 animate-pulse" />
          ))}
        </div>
      )}

      {/* Grid View */}
      {!isLoading && viewMode === 'grid' && processedHits.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {processedHits.map((h) => {
            const imgSrc =
              PRODUCT_IMAGE_OVERRIDES[h.product.id] || h.product.imageUrl;
            const hasOffers = Boolean(h.bestOffer);
            const leadTime = h.bestOffer?.leadTimeDays;

            return (
              <div
                key={h.product.id}
                className="group bg-paper border border-ink/15 hover:border-ink hover:shadow-lg transition-all duration-200 flex flex-col justify-between overflow-hidden relative"
              >
                {/* Image Section */}
                <Link
                  to={`/products/${h.product.id}`}
                  className="relative h-56 w-full overflow-hidden bg-bone border-b border-ink/10 block cursor-pointer"
                >
                  <ProductImage
                    src={imgSrc}
                    alt={h.product.name}
                    seed={h.product.id}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Brand Badge */}
                  {h.product.brand && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-ink text-paper shadow-md">
                      {h.product.brand}
                    </span>
                  )}

                  {/* Dispatch Badge */}
                  {leadTime !== undefined && (
                    <span className="absolute bottom-3 right-3 px-2.5 py-1 text-[10px] font-mono font-semibold bg-void/85 text-paper backdrop-blur-sm border border-paper/15 flex items-center gap-1.5 shadow-sm">
                      <ClockIcon size={12} className="text-volt" />
                      <span>{leadTime === 0 ? 'Same-day dispatch' : `${leadTime}d dispatch`}</span>
                    </span>
                  )}

                  {/* Stock Indicator */}
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 backdrop-blur-sm flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Live Lot
                  </span>
                </Link>

                {/* Content Section */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-copper uppercase tracking-wider font-bold">
                        {h.product.unit} {h.product.packSize ? `· ${h.product.packSize}` : ''}
                      </span>
                      <span className="text-ink-4">ID: {h.product.id.slice(0, 10)}</span>
                    </div>

                    <Link to={`/products/${h.product.id}`}>
                      <h3 className="font-display text-xl leading-snug text-ink group-hover:text-copper transition-colors font-bold">
                        {h.product.name}
                      </h3>
                    </Link>
                  </div>

                  {/* Pricing Box */}
                  <div className="pt-3 border-t border-ink/10 space-y-3">
                    {hasOffers ? (
                      <>
                        <div className="flex items-baseline justify-between">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 block">
                              Best Spot Rate
                            </span>
                            <div className="vyro-metric text-2xl sm:text-3xl text-ink font-bold mt-0.5">
                              {formatLKR(h.bestOffer!.priceCents)}
                            </div>
                          </div>

                          <span className="text-[11px] font-mono px-2 py-0.5 bg-volt/20 text-ink font-bold border border-volt/30">
                            {h.offerCount} live offer{h.offerCount === 1 ? '' : 's'}
                          </span>
                        </div>

                        {/* Supplier Info */}
                        <div className="text-xs text-ink-3 flex items-center justify-between gap-2 pt-1 border-t border-ink/5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <StoreIcon size={14} className="text-copper shrink-0" />
                            <span className="truncate font-medium">{h.bestOffer!.supplier.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-ink-4 shrink-0 flex items-center gap-1">
                            <ShieldCheckIcon size={12} className="text-volt-deep" /> Verified
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="py-2">
                        <p className="text-xs text-amber font-medium">Awaiting next lot update</p>
                      </div>
                    )}
                  </div>

                  {/* Card Action */}
                  <div className="pt-3 border-t border-ink/10 flex items-center gap-2">
                    <Link
                      to={`/products/${h.product.id}`}
                      className="vyro-btn vyro-btn-primary flex-1 text-xs uppercase tracking-wider font-bold py-2.5 text-center"
                    >
                      <span>View Offers & Order</span>
                      <ArrowRightIcon size={13} className="vyro-btn-arrow" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dense Ledger / Table View */}
      {!isLoading && viewMode === 'table' && processedHits.length > 0 && (
        <div className="bg-paper border border-ink/15 overflow-x-auto shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink/15 bg-bone/70 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                <th className="py-3 px-4">Product & Brand</th>
                <th className="py-3 px-4">Pack & Unit</th>
                <th className="py-3 px-4">Primary Supplier</th>
                <th className="py-3 px-4">Dispatch Time</th>
                <th className="py-3 px-4 text-right">Best Spot Rate</th>
                <th className="py-3 px-4 text-center">Market Offers</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 text-sm">
              {processedHits.map((h) => {
                const leadTime = h.bestOffer?.leadTimeDays;
                return (
                  <tr
                    key={h.product.id}
                    className="hover:bg-bone/40 transition-colors group"
                  >
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/products/${h.product.id}`}
                        className="font-display font-semibold text-ink group-hover:text-copper transition-colors block"
                      >
                        {h.product.name}
                      </Link>
                      {h.product.brand && (
                        <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider">
                          Brand: {h.product.brand}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-ink-3">
                      {h.product.unit} {h.product.packSize ? `· ${h.product.packSize}` : ''}
                    </td>

                    <td className="py-3.5 px-4 text-xs">
                      {h.bestOffer ? (
                        <div className="flex items-center gap-1.5">
                          <StoreIcon size={14} className="text-copper shrink-0" />
                          <span className="font-medium text-ink truncate max-w-[180px]">
                            {h.bestOffer.supplier.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-xs font-mono text-ink-3">
                      {leadTime !== undefined ? (
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon size={12} className="text-ink-4" />
                          <span>{leadTime === 0 ? 'Same day' : `${leadTime}d lead`}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {h.bestOffer ? (
                        <span className="vyro-metric font-bold text-base text-ink">
                          {formatLKR(h.bestOffer.priceCents)}
                        </span>
                      ) : (
                        <span className="text-xs text-amber">Quote only</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="text-[11px] font-mono px-2 py-0.5 bg-volt/20 text-ink font-semibold">
                        {h.offerCount} offer{h.offerCount === 1 ? '' : 's'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/products/${h.product.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-copper transition-colors"
                      >
                        <span>Compare</span>
                        <ArrowRightIcon size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && processedHits.length === 0 && (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title="No wholesale lots match your criteria."
          description={`We couldn't find any products matching "${searchInput}" with active filters. Try browsing all commodities or clearing filter tags.`}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearchInput('');
                setQ('');
                setFastDispatchOnly(false);
                setSearchParams({});
              }}
            >
              Reset All Filters
            </Button>
          }
        />
      )}
    </div>
  );
}

/**
 * Renders the NL-detected filter chips above the search results. Removing a
 * chip rewrites the URL `q` without that phrase, so the page stays in sync.
 */
function NlChips({ q, onChange }: { q: string; onChange: (next: string) => void }) {
  const { chips, rebuilt } = buildSearchChips(q);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-label="Active NL filters">
      <span className="text-[10px] uppercase tracking-wider font-mono text-ink-4">Active filters</span>
      {chips.map((c, i) => (
        <button
          key={`${c.kind}-${i}`}
          type="button"
          onClick={() => onChange(rebuilt(c))}
          className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 text-[11px] font-mono border border-ink/20 bg-bone hover:bg-ink hover:text-volt text-ink-3 transition-colors"
          title="Remove filter"
        >
          <span>{c.label}</span>
          <XIcon size={11} />
        </button>
      ))}
    </div>
  );
}
