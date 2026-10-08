import { useState, useEffect, useMemo, type ComponentType, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { Button, EmptyState } from '@/components/ui';
import { HeroStatusPill, heroActionClass } from '@/components/brand/PageHero';
import { formatLKR } from '@/lib/format';
import {
  SearchIcon,
  StoreIcon,
  XIcon,
  ClockIcon,
  SparklesIcon,
  LayoutGridIcon,
  FileTextIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  PackageIcon,
  TruckIcon,
  BanknoteIcon,
  Building2Icon,
  CheckCircle2Icon,
  PlusIcon,
} from '@/components/icons';
import { Surface, ProductImage } from '@/components/brand/Surface';
import { CatalogSearch } from '@/components/CatalogSearch';
import { buildSearchChips } from '@/ask/nlFilters.client';
import { useAddToCart } from '@/lib/useAddToCart';
import { SupplierStarsLine } from '@/reviews/SupplierStarsLine';
import { SponsoredSlot } from '../components/SponsoredSlot';

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
    id: string;
    priceCents: number;
    minOrderQty: number;
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

function dispatchLabel(days: number, short = false) {
  if (days === 0) return short ? 'Same day' : 'Same-day dispatch';
  return short ? `${days}d lead` : `${days}d dispatch`;
}

export function SearchPage() {
  usePageTitle('Marketplace · Sri Lanka Wholesale Catalog');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [searchInput, setSearchInput] = useState(initialQ);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<SortMode>('price_asc');
  const [fastDispatchOnly, setFastDispatchOnly] = useState(false);
  const { addToCart, pendingKey } = useAddToCart();

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

  const { data, isLoading } = useQuery<{ hits: Hit[]; sponsored?: Array<{ slotId: string; campaignId: string | null; productId: string | null; surface: 'search'|'category'|'homepage'|'storefront'; position: number }> }>({
    queryKey: ['search', q],
    queryFn: () => api.get<{ hits: Hit[]; sponsored?: Array<{ slotId: string; campaignId: string | null; productId: string | null; surface: 'search'|'category'|'homepage'|'storefront'; position: number }> }>(`/search/products?q=${encodeURIComponent(q)}`),
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

  function resetAll() {
    setSearchInput('');
    setQ('');
    setFastDispatchOnly(false);
    setSearchParams({});
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

  // Headline market stats for the hero, computed from the unfiltered result set
  const stats = useMemo(() => {
    const hits = data?.hits ?? [];
    const suppliers = new Set<string>();
    let lowest: number | null = null;
    let fast = 0;
    let offers = 0;
    for (const h of hits) {
      offers += h.offerCount;
      if (!h.bestOffer) continue;
      suppliers.add(h.bestOffer.supplier.id);
      if (lowest === null || h.bestOffer.priceCents < lowest) lowest = h.bestOffer.priceCents;
      if ((h.bestOffer.leadTimeDays ?? 99) <= 2) fast++;
    }
    return { lots: hits.length, suppliers: suppliers.size, lowest, fast, offers };
  }, [data?.hits]);

  const sponsored = (data?.sponsored ?? []).filter((s) => s.campaignId && s.productId).slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <Surface kind="ink" className="grain rounded-2xl shadow-soft-lg">
        <div className="pointer-events-none absolute -top-40 right-[-6rem] size-[28rem] rounded-full bg-volt/[0.12] blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-copper/25 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#FAF7F0_1px,transparent_1px),linear-gradient(to_bottom,#FAF7F0_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
          aria-hidden
        />

        <div className="relative grid gap-10 p-6 pb-16 sm:p-10 sm:pb-20 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                <StoreIcon size={12} />
                Wholesale Marketplace
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/40">
                Sri Lanka Direct Network
              </span>
            </div>

            <h1 className="vyro-display mt-5 text-[2.1rem] leading-[1.02] font-bold tracking-tight text-paper sm:text-5xl lg:text-[3.4rem] text-balance">
              Direct mill &amp; <span className="text-volt">wholesale</span> catalog
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-paper/60 text-pretty">
              Source staples, beverages and industrial packaging straight from audited Sri Lankan
              mills and authorized distributors — transparent spot pricing, zero broker markups.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <HeroStatusPill label="Live Spot Rates" tone="volt" />
              <Link to="/ask" className={`${heroActionClass} h-[34px] rounded-full px-3.5`}>
                <SparklesIcon size={13} className="text-volt" />
                Ask VYRO AI
                <ArrowRightIcon size={12} className="text-paper/50" />
              </Link>
            </div>
          </div>

          {/* Market snapshot */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-paper/10 bg-paper/10">
            <HeroStat icon={PackageIcon} label="Live lots" value={isLoading ? '—' : String(stats.lots)} hint={`${stats.offers} open offers`} />
            <HeroStat icon={Building2Icon} label="Suppliers" value={isLoading ? '—' : String(stats.suppliers)} hint="KYC verified" />
            <HeroStat
              icon={BanknoteIcon}
              label="Lowest spot"
              value={stats.lowest !== null ? formatLKR(stats.lowest) : '—'}
              hint="Across all lots"
              accent
            />
            <HeroStat icon={TruckIcon} label="Fast dispatch" value={isLoading ? '—' : String(stats.fast)} hint="Ships in ≤ 2 days" />
          </div>
        </div>
      </Surface>

      {/* ── Floating search console (outside the hero so the typeahead isn't clipped) ── */}
      <div className="relative z-30 mx-3 -mt-9 sm:mx-8">
        <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-paper p-2 pl-2.5 shadow-[0_24px_60px_-28px_rgba(12,14,11,0.45)] ring-1 ring-black/[0.02] transition-all duration-200 focus-within:border-ink/30 focus-within:ring-4 focus-within:ring-volt/30">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-volt">
            <SearchIcon size={19} />
          </div>

          <CatalogSearch
            variant="bar"
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={() => undefined}
            placeholder="Search rice, sugar, tea, milk, coconut oil, flour, cement, packaging…"
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
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-bone hover:text-ink"
              title="Clear search"
            >
              <XIcon size={15} />
            </button>
          )}

          <span className="hidden md:inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/10 bg-bone/70 px-2.5 py-1.5 mr-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
            <span className="size-1.5 rounded-full bg-mint animate-pulse" />
            Live filter
          </span>
        </div>
      </div>

      {/* ── Sticky filter rail ──────────────────────────────── */}
      <div className="relative z-20 mt-8 md:sticky md:top-[4.75rem]">
        <div className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-paper/85 p-1.5 shadow-[0_12px_32px_-24px_rgba(12,14,11,0.4)] backdrop-blur-md xl:flex-row xl:items-center">
          {/* Category chips – single scrolling row, never wraps */}
          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-8">
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
                    aria-pressed={active}
                    className={`h-9 shrink-0 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-medium transition-all cursor-pointer ${
                      active
                        ? 'bg-ink text-paper shadow-sm'
                        : 'text-ink-3 hover:bg-ink/[0.05] hover:text-ink'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-paper to-transparent" aria-hidden />
          </div>

          <div className="hidden xl:block h-6 w-px bg-ink/10" aria-hidden />

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1 xl:p-0 xl:pr-0.5">
            <button
              type="button"
              onClick={() => setFastDispatchOnly(!fastDispatchOnly)}
              aria-pressed={fastDispatchOnly}
              className={`h-9 rounded-xl border px-3 text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
                fastDispatchOnly
                  ? 'bg-ink text-volt border-ink shadow-sm'
                  : 'bg-paper text-ink-3 border-ink/10 hover:border-ink/30 hover:text-ink'
              }`}
            >
              <ClockIcon size={14} />
              <span>≤ 2d dispatch</span>
            </button>

            <label className="relative flex h-9 items-center gap-1.5 rounded-xl border border-ink/10 bg-paper pl-3 pr-2 text-[13px] hover:border-ink/30 transition-colors">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                className="cursor-pointer bg-transparent pr-1 font-medium text-ink outline-none"
              >
                <option value="price_asc">Lowest spot rate</option>
                <option value="price_desc">Highest spot rate</option>
                <option value="lead_asc">Fastest dispatch</option>
                <option value="offers_desc">Most live offers</option>
                <option value="name_asc">Name (A–Z)</option>
              </select>
            </label>

            <div className="flex h-9 items-center rounded-xl bg-ink/[0.05] p-1">
              <ViewToggle active={viewMode === 'grid'} onClick={() => setViewMode('grid')} title="Grid view">
                <LayoutGridIcon size={15} />
              </ViewToggle>
              <ViewToggle active={viewMode === 'table'} onClick={() => setViewMode('table')} title="Dense ledger view">
                <FileTextIcon size={15} />
              </ViewToggle>
            </div>
          </div>
        </div>
      </div>

      {/* ── Result summary ──────────────────────────────────── */}
      <div className="mt-6 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-sm text-ink-3">
            <span className="vyro-metric mr-1 text-lg font-semibold text-ink">{processedHits.length}</span>
            {q ? (
              <>
                lots matching <span className="font-semibold text-ink">“{q}”</span>
              </>
            ) : (
              'wholesale lots active across 25 districts'
            )}
          </p>
          {fastDispatchOnly && (
            <button
              type="button"
              onClick={() => setFastDispatchOnly(false)}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-volt/40 bg-volt/20 pl-2.5 pr-2 text-[11px] font-semibold text-ink hover:bg-volt/30 transition-colors"
            >
              Fast dispatch only
              <XIcon size={11} />
            </button>
          )}
          <NlChips q={q} onChange={(next) => { setSearchInput(next); setQ(next); setSearchParams(next ? { q: next } : {}); }} />
        </div>
        <p className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
          <ShieldCheckIcon size={12} className="text-volt-deep" />
          Zero broker markups · verified suppliers
        </p>
      </div>

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-ink/10 bg-paper">
              <div className="aspect-[4/3] animate-pulse bg-mist/70" />
              <div className="space-y-3 p-5">
                <div className="h-3 w-24 animate-pulse rounded bg-mist" />
                <div className="h-5 w-3/4 animate-pulse rounded bg-mist" />
                <div className="h-16 animate-pulse rounded-xl bg-bone" />
                <div className="h-10 animate-pulse rounded-xl bg-bone" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Grid View ───────────────────────────────────────── */}
      {!isLoading && viewMode === 'grid' && processedHits.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sponsored.map((s) => (
            <SponsoredSlot key={s.slotId} campaignId={s.campaignId} surface={s.surface} position={s.position}>
              <Link to={`/products/${s.productId}`} className="block vyro-surface rounded-2xl p-4">
                <p className="text-sm font-medium text-ink">Sponsored product</p>
                <p className="text-xs text-ink-4">Slot #{s.position}</p>
              </Link>
            </SponsoredSlot>
          ))}
          {processedHits.map((h) => {
            const offer = h.bestOffer;
            const leadTime = offer?.leadTimeDays;
            const adding = pendingKey === offer?.id;

            return (
              <article
                key={h.product.id}
                className="group relative flex flex-col rounded-[1.25rem] border border-ink/[0.08] bg-paper p-2 shadow-[0_1px_2px_rgba(12,14,11,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-ink/15 hover:shadow-[0_30px_60px_-32px_rgba(12,14,11,0.5)]"
              >
                {/* Framed image */}
                <Link
                  to={`/products/${h.product.id}`}
                  className="relative block aspect-[16/11] w-full overflow-hidden rounded-[0.9rem] bg-bone"
                >
                  <ProductImage
                    src={h.product.imageUrl}
                    alt={h.product.name}
                    seed={h.product.id}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-void/25 via-transparent to-void/35" aria-hidden />

                  {h.product.brand && (
                    <span className="absolute left-3 top-3 rounded-full bg-paper/90 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink shadow-sm backdrop-blur">
                      {h.product.brand}
                    </span>
                  )}
                  {h.offerCount > 1 && (
                    <span className="absolute right-3 top-3 rounded-full bg-void/55 px-2.5 py-1 text-[11px] font-medium text-paper ring-1 ring-paper/15 backdrop-blur-md">
                      {h.offerCount} suppliers
                    </span>
                  )}
                  <span className="absolute bottom-3 left-3 inline-flex translate-y-2 items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-[11px] font-semibold text-ink opacity-0 shadow-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    Compare offers
                    <ArrowRightIcon size={12} />
                  </span>
                </Link>

                {/* Body */}
                <div className="flex flex-1 flex-col px-3 pb-2 pt-4">
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-mono font-semibold uppercase tracking-[0.14em] text-copper">
                      {h.product.packSize || h.product.unit}
                    </span>
                    {leadTime !== undefined && (
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${
                          leadTime <= 2 ? 'text-mint' : 'text-ink-4'
                        }`}
                      >
                        <span className={`size-1.5 rounded-full ${leadTime <= 2 ? 'bg-mint' : 'bg-ink-5'}`} />
                        {dispatchLabel(leadTime)}
                      </span>
                    )}
                  </div>

                  <Link to={`/products/${h.product.id}`} className="mt-2">
                    <h3 className="font-display text-[1.15rem] font-bold leading-snug tracking-tight text-ink line-clamp-2">
                      {h.product.name}
                    </h3>
                  </Link>

                  {offer && (
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-4">
                      <span className="truncate">by <span className="font-medium text-ink-2">{offer.supplier.name}</span></span>
                      <CheckCircle2Icon size={13} className="shrink-0 text-volt-deep" aria-label="Verified supplier" />
                    </div>
                  )}

                  <div className="mt-auto pt-5">
                    <div className="flex items-end justify-between gap-3 border-t border-dashed border-ink/10 pt-4">
                      {offer ? (
                        <div className="min-w-0">
                          <PriceTag cents={offer.priceCents} unit={h.product.unit} />
                          <span className="mt-1 block text-[11px] text-ink-4">
                            Min. order {offer.minOrderQty || 1} {h.product.unit}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber">
                          <ClockIcon size={13} />
                          Awaiting next lot update
                        </span>
                      )}

                      {offer ? (
                        <button
                          type="button"
                          disabled={adding}
                          aria-label={`Add ${h.product.name} to cart`}
                          title="Add minimum order to cart"
                          onClick={() =>
                            addToCart({
                              productId: h.product.id,
                              supplierProductId: offer.id,
                              quantity: offer.minOrderQty || 1,
                              productName: h.product.name,
                            })
                          }
                          className="group/add relative flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-full bg-ink pl-3.5 pr-4 text-[13px] font-semibold text-paper shadow-sm transition-all hover:bg-void hover:shadow-[0_10px_24px_-10px_rgba(12,14,11,0.6)] active:scale-[0.97] disabled:opacity-70"
                        >
                          <span className="flex size-6 items-center justify-center rounded-full bg-volt text-ink transition-transform group-hover/add:rotate-[-8deg]">
                            {adding ? (
                              <span className="size-3 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
                            ) : (
                              <PlusIcon size={13} />
                            )}
                          </span>
                          Add
                        </button>
                      ) : (
                        <Link
                          to={`/products/${h.product.id}`}
                          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-ink/15 px-4 text-[13px] font-semibold text-ink transition-colors hover:border-ink"
                        >
                          Details
                          <ArrowRightIcon size={13} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Dense Ledger / Table View ───────────────────────── */}
      {!isLoading && viewMode === 'table' && processedHits.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-paper">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/70 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                <th className="py-3.5 pl-5 pr-4 font-semibold">Product</th>
                <th className="py-3.5 px-4 font-semibold">Pack & unit</th>
                <th className="py-3.5 px-4 font-semibold">Primary supplier</th>
                <th className="py-3.5 px-4 font-semibold">Dispatch</th>
                <th className="py-3.5 px-4 text-right font-semibold">Best spot rate</th>
                <th className="py-3.5 px-4 text-center font-semibold">Offers</th>
                <th className="py-3.5 pl-4 pr-5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.06] text-sm">
              {processedHits.map((h) => {
                const leadTime = h.bestOffer?.leadTimeDays;
                return (
                  <tr key={h.product.id} className="group transition-colors hover:bg-bone/50">
                    <td className="py-3 pl-5 pr-4">
                      <Link to={`/products/${h.product.id}`} className="flex items-center gap-3">
                        <span className="size-11 shrink-0 overflow-hidden rounded-lg bg-bone ring-1 ring-ink/10">
                          <ProductImage
                            src={h.product.imageUrl}
                            alt=""
                            seed={h.product.id}
                            className="h-full w-full object-cover"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-display font-semibold text-ink transition-colors group-hover:text-copper-deep">
                            {h.product.name}
                          </span>
                          {h.product.brand && (
                            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                              {h.product.brand}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>

                    <td className="py-3 px-4 font-mono text-xs text-ink-3">
                      {h.product.unit} {h.product.packSize ? `· ${h.product.packSize}` : ''}
                    </td>

                    <td className="py-3 px-4 text-xs">
                      {h.bestOffer ? (
                        <div className="flex items-center gap-1.5">
                          <StoreIcon size={14} className="shrink-0 text-copper" />
                          <span className="max-w-[180px] truncate font-medium text-ink">
                            {h.bestOffer.supplier.name}
                          </span>
                          <SupplierStarsLine supplierId={h.bestOffer.supplier.id} />
                        </div>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-xs">
                      {leadTime !== undefined ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                            leadTime <= 2 ? 'bg-mint/10 text-mint' : 'bg-ink/[0.05] text-ink-3'
                          }`}
                        >
                          <ClockIcon size={11} />
                          {dispatchLabel(leadTime, true)}
                        </span>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {h.bestOffer ? (
                        <span className="vyro-metric text-base font-semibold text-ink">
                          {formatLKR(h.bestOffer.priceCents)}
                        </span>
                      ) : (
                        <span className="text-xs text-amber">Quote only</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex min-w-7 justify-center rounded-full bg-volt/25 px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                        {h.offerCount}
                      </span>
                    </td>

                    <td className="py-3 pl-4 pr-5 text-right">
                      <div className="inline-flex items-center justify-end gap-3">
                        {h.bestOffer && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={pendingKey === h.bestOffer.id}
                            onClick={() =>
                              addToCart({
                                productId: h.product.id,
                                supplierProductId: h.bestOffer!.id,
                                quantity: h.bestOffer!.minOrderQty || 1,
                                productName: h.product.name,
                              })
                            }
                          >
                            Add
                          </Button>
                        )}
                        <Link
                          to={`/products/${h.product.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-ink transition-colors hover:text-copper"
                        >
                          <span>Compare</span>
                          <ArrowRightIcon size={12} />
                        </Link>
                      </div>
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
            <Button variant="secondary" onClick={resetAll}>
              Reset All Filters
            </Button>
          }
        />
      )}
    </div>
  );
}

function PriceTag({ cents, unit }: { cents: number; unit: string }) {
  const [whole, fraction] = (cents / 100)
    .toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split('.');
  return (
    <div className="flex items-baseline gap-1 text-ink">
      <span className="text-xs font-semibold text-ink-4">Rs.</span>
      <span className="font-display text-[1.75rem] font-bold leading-none tracking-tight tabular-nums">{whole}</span>
      <span className="text-sm font-semibold text-ink-3">.{fraction}</span>
      <span className="ml-0.5 text-xs text-ink-4">/ {unit}</span>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  hint,
  accent = false,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-ink/80 p-4 sm:p-5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
        <Icon size={12} className={accent ? 'text-volt' : 'text-paper/45'} />
        {label}
      </div>
      <div className={`vyro-metric mt-2.5 truncate text-xl font-semibold leading-none sm:text-2xl xl:text-[1.7rem] ${accent ? 'text-volt' : 'text-paper'}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-paper/40">{hint}</div>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-7 w-8 items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-ink text-volt shadow-sm' : 'text-ink-4 hover:text-ink'
      }`}
    >
      {children}
    </button>
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
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active NL filters">
      {chips.map((c, i) => (
        <button
          key={`${c.kind}-${i}`}
          type="button"
          onClick={() => onChange(rebuilt(c))}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-ink/15 bg-paper pl-2.5 pr-2 text-[11px] font-medium text-ink-3 transition-colors hover:border-ink hover:bg-ink hover:text-volt"
          title="Remove filter"
        >
          <span>{c.label}</span>
          <XIcon size={11} />
        </button>
      ))}
    </div>
  );
}
